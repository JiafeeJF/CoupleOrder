import { Router } from 'express';
import { db, save, nextId, getPairId } from '../store.js';
import { authRequired } from '../auth.js';
import { emitToUser, emitPairEvent } from '../socket.js';
import { sendMail, buildOrderEmail, buildOrderCompletedEmail } from '../email.js';
import { audit, cleanText, rateLimit } from '../security.js';

const router = Router();

const VALID_STATUSES = ['pending', 'accepted', 'preparing', 'done'];
const orderWriteLimit = rateLimit({ scope: 'order-write', windowMs: 60 * 1000, max: 20 });

function pairRequired(req, res, next) {
  const pairId = getPairId(req.user);
  if (!pairId) return res.status(400).json({ error: '请先完成配对' });
  req.pairId = pairId;
  next();
}

// 创建订单
router.post('/', authRequired, pairRequired, orderWriteLimit, (req, res) => {
  const { items = [], note = '' } = req.body || {};
  if (!items.length) return res.status(400).json({ error: '购物车是空的' });

  const orderItems = [];
  for (const it of items) {
    const m = db.menuItems.find((x) => x.pairId === req.pairId && x.id === it.menuItemId);
    if (!m) return res.status(400).json({ error: '菜品不存在或已下架' });
    if (!m.available) return res.status(400).json({ error: `「${m.name}」已下架，请重新选择` });
    const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
    orderItems.push({ menuItemId: m.id, name: m.name, price: m.price, quantity: qty, image: m.image || '' });
  }

  const id = nextId('order');
  const now = new Date().toISOString();
  const order = {
    id,
    pairId: req.pairId,
    placedBy: req.user.id,
    placedByName: req.user.name,
    items: orderItems,
    note: cleanText(note, 500),
    status: 'pending',
    // 评分记录：{ by, rating, comment, at }，每人每单仅一条
    ratings: [],
    createdAt: now,
    updatedAt: now,
  };
  db.orders.push(order);
  save();
  audit('order-create', req.user.id, `order=${order.id}`);

  // 实时通知对方 + 邮件通知
  const partner = db.users.find((u) => u.id === req.user.partnerId);
  if (partner) {
    emitToUser(partner.id, 'order:new', order);
    const mailContent = buildOrderEmail(order);
    sendMail({
      to: partner.email || process.env.MAIL_TO,
      subject: `你的TA点餐啦 - ${req.user.name} 下了一单`,
      ...mailContent,
    });
  }

  res.json({ order });
});

// 获取本组所有订单（按时间倒序）
router.get('/', authRequired, pairRequired, (req, res) => {
  const orders = db.orders
    .filter((o) => o.pairId === req.pairId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ orders });
});

// 更新订单状态
router.patch('/:id/status', authRequired, pairRequired, orderWriteLimit, (req, res) => {
  const order = db.orders.find((o) => o.id === Number(req.params.id) && o.pairId === req.pairId);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: '无效的状态值' });

  const previousStatus = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  save();

  if (status === 'done' && previousStatus !== 'done') {
    const owner = db.users.find((u) => u.id === order.placedBy);
    if (owner?.email) {
      sendMail({
        to: owner.email || process.env.MAIL_TO,
        subject: `订单 #${order.id} 已完成`,
        ...buildOrderCompletedEmail(order),
      });
    }
  }

  // 通知双方；使用 Set 避免操作方恰好是下单方时重复推送
  const recipients = new Set([order.placedBy, req.user.partnerId].filter(Boolean));
  recipients.forEach((userId) => emitToUser(userId, 'order:updated', order));

  audit('order-status', req.user.id, `order=${order.id} status=${status}`);
  res.json({ order });
});

// 给订单评分（仅订单完成后可评；每人每单一次；可附带简短评论）
router.post('/:id/rating', authRequired, pairRequired, orderWriteLimit, (req, res) => {
  const order = db.orders.find((o) => o.id === Number(req.params.id) && o.pairId === req.pairId);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'done') return res.status(400).json({ error: '订单完成后才能评分' });

  const rating = Number(req.body?.rating);
  // 支持半星：1 ~ 5，步进 0.5
  const isValidRating =
    Number.isFinite(rating) && rating >= 1 && rating <= 5 && Math.abs(rating * 2 - Math.round(rating * 2)) < 1e-9;
  if (!isValidRating) {
    return res.status(400).json({ error: '评分需为 1-5 星（支持半星）' });
  }

  const comment = cleanText(req.body?.comment, 100);
  // 旧订单可能没有 ratings 字段（历史数据兼容），初始化后再操作
  if (!Array.isArray(order.ratings)) order.ratings = [];
  const existingIdx = order.ratings.findIndex((r) => r.by === req.user.id);
  if (existingIdx !== -1) {
    // 已评过：更新为新的评分（保持一人一单一条）
    order.ratings[existingIdx] = { by: req.user.id, rating, comment, at: new Date().toISOString() };
  } else {
    order.ratings.push({ by: req.user.id, rating, comment, at: new Date().toISOString() });
  }
  order.updatedAt = new Date().toISOString();
  save();
  audit('order-rating', req.user.id, `order=${order.id} rating=${rating}`);

  // 实时同步给配对双方（评分数据变化，前端刷新统计）
  emitPairEvent(req.pairId, 'order:rated', { orderId: order.id, by: req.user.id, rating, comment });

  res.json({ order });
});

// 本组订单统计：完成单数 + 对方给自己的平均分 + 最近一条对方评价
router.get('/stats', authRequired, pairRequired, (req, res) => {
  const partnerId = req.user.partnerId;
  const doneOrders = db.orders.filter((o) => o.pairId === req.pairId && o.status === 'done');
  // “对方给我的评价”：评分人是 partnerId 的记录（即 TA 给我点的单打分）
  const partnerRatings = doneOrders.flatMap((o) =>
    (o.ratings || []).filter((r) => r.by === partnerId).map((r) => ({ ...r, orderId: o.id })),
  );
  const avgRating = partnerRatings.length
    ? partnerRatings.reduce((sum, r) => sum + r.rating, 0) / partnerRatings.length
    : null;
  const latestComment = partnerRatings
    .filter((r) => r.comment)
    .sort((a, b) => new Date(b.at) - new Date(a.at))[0]?.comment || null;
  // 最近一次完成订单的时间（按订单完成时间倒序取最新）
  const lastOrderAt = doneOrders.length
    ? doneOrders
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0]
        ?.updatedAt || doneOrders[0].createdAt
    : null;

  res.json({
    doneOrders: doneOrders.length,
    avgRating: avgRating === null ? null : Math.round(avgRating * 10) / 10,
    latestComment,
    lastOrderAt,
  });
});

export default router;