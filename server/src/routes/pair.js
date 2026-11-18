import { Router } from 'express';
import { db, save, nextId } from '../store.js';
import { authRequired, publicUser } from '../auth.js';
import { emitToUser } from '../socket.js';
import { audit, cleanText, rateLimit } from '../security.js';

const router = Router();
const bindLimit = rateLimit({ scope: 'pair-bind', windowMs: 10 * 60 * 1000, max: 8 });

// 获取我的配对信息（配对码 + 对方）
router.get('/me', authRequired, (req, res) => {
  const partner = req.user.partnerId ? db.users.find((u) => u.id === req.user.partnerId) : null;
  res.json({ pairCode: req.user.pairCode, partner: partner ? publicUser(partner) : null });
});

// 通过配对码绑定情侣关系
router.post('/bind', authRequired, bindLimit, (req, res) => {
  const { code } = req.body || {};
  const target = db.users.find((u) => u.pairCode === cleanText(code, 6).toUpperCase());
  const me = req.user;

  if (!target) return res.status(404).json({ error: '配对码不存在，请检查后重试' });
  if (target.id === me.id) return res.status(400).json({ error: '不能和自己配对哦' });
  if (me.partnerId) return res.status(400).json({ error: '你已经有配对对象了' });
  if (target.partnerId) return res.status(400).json({ error: '对方已经和别人配对过了' });

  me.partnerId = target.id;
  target.partnerId = me.id;
  db.pairs.push({ id: nextId('pair'), userA: me.id, userB: target.id, createdAt: new Date().toISOString() });
  save();
  audit('pair-bind', me.id, `target=${target.id}`);

  // 实时通知对方：你被绑定啦
  emitToUser(target.id, 'pair:bound', { user: publicUser(me) });

  res.json({ pairCode: me.pairCode, partner: publicUser(target) });
});

export default router;