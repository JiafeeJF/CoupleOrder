import { Router } from 'express';
import { db, save, nextId, getPairId } from '../store.js';
import { authRequired } from '../auth.js';
import { emitMenuChanged, menuSnapshot } from '../socket.js';
import { audit, cleanText, rateLimit, validateImageData } from '../security.js';

const router = Router();
const menuWriteLimit = rateLimit({ scope: 'menu-write', windowMs: 60 * 1000, max: 40 });

function pairRequired(req, res, next) {
  const pairId = getPairId(req.user);
  if (!pairId) return res.status(400).json({ error: '请先完成配对' });
  req.pairId = pairId;
  next();
}

// 获取本组菜单
router.get('/', authRequired, pairRequired, (req, res) => {
  res.json(menuSnapshot(req.pairId));
});

// 新增菜品
router.post('/', authRequired, pairRequired, menuWriteLimit, (req, res) => {
  const { name, category, price, description, image } = req.body || {};
  if (!name || price === undefined || price === null) return res.status(400).json({ error: '菜品名称和价格不能为空' });
  const p = Number(price);
  if (isNaN(p) || p < 0) return res.status(400).json({ error: '价格格式不正确' });
  let imageValue;
  try {
    imageValue = validateImageData(image, 5 * 1024 * 1024, '菜品');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const item = {
    id: nextId('menuItem'),
    pairId: req.pairId,
    name: cleanText(name, 80),
    category: cleanText(category || '其他', 30),
    price: Math.round(p * 100) / 100,
    description: cleanText(description, 300),
    image: imageValue,
    available: true,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  db.menuItems.push(item);
  save();
  emitMenuChanged(req.pairId, req.user.id);
  audit('menu-create', req.user.id, `item=${item.id}`);
  res.json({ item });
});

// 编辑菜品
router.put('/:id', authRequired, pairRequired, menuWriteLimit, (req, res) => {
  const item = db.menuItems.find((i) => i.id === Number(req.params.id) && i.pairId === req.pairId);
  if (!item) return res.status(404).json({ error: '菜品不存在' });
  const { name, category, price, description, image } = req.body || {};
  if (name !== undefined) item.name = cleanText(name, 80) || item.name;
  if (category !== undefined) item.category = cleanText(category, 30) || item.category;
  if (price !== undefined) {
    const p = Number(price);
    if (isNaN(p) || p < 0) return res.status(400).json({ error: '价格格式不正确' });
    item.price = Math.round(p * 100) / 100;
  }
  if (description !== undefined) item.description = cleanText(description, 300);
  if (image !== undefined) {
    try {
      item.image = validateImageData(image, 5 * 1024 * 1024, '菜品');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  save();
  emitMenuChanged(req.pairId, req.user.id);
  audit('menu-update', req.user.id, `item=${item.id}`);
  res.json({ item });
});

// 切换上下架
router.patch('/:id/available', authRequired, pairRequired, menuWriteLimit, (req, res) => {
  const item = db.menuItems.find((i) => i.id === Number(req.params.id) && i.pairId === req.pairId);
  if (!item) return res.status(404).json({ error: '菜品不存在' });
  item.available = !item.available;
  save();
  emitMenuChanged(req.pairId, req.user.id);
  res.json({ item });
});

// 删除菜品
router.delete('/:id', authRequired, pairRequired, (req, res) => {
  const idx = db.menuItems.findIndex((i) => i.id === Number(req.params.id) && i.pairId === req.pairId);
  if (idx === -1) return res.status(404).json({ error: '菜品不存在' });
  db.menuItems.splice(idx, 1);
  save();
  emitMenuChanged(req.pairId, req.user.id);
  audit('menu-delete', req.user.id, `item=${req.params.id}`);
  res.json({ ok: true });
});

export default router;