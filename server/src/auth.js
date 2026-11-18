import jwt from 'jsonwebtoken';
import { db } from './store.js';
import { decryptResource } from './crypt.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    // 落库时为加密存储，对外返回解密后的真实图片，客户端无需感知加密
    avatar: decryptResource(u.avatar) || '',
    cover: decryptResource(u.cover) || '',
    partnerId: u.partnerId || null,
    createdAt: u.createdAt,
  };
}

export function signToken(user) {
  return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

export function authRequired(req, res, next) {
  const cookieToken = req.headers.cookie?.match(/(?:^|;\s*)co_token=([^;]+)/)?.[1];
  const header = req.headers.authorization || '';
  const token = cookieToken || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) return res.status(401).json({ error: '用户不存在，请重新登录' });
    req.user = user;
    req.userId = user.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 生成 6 位不重复的配对码（去除易混淆字符）
export function genPairCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (db.users.some((u) => u.pairCode === code));
  return code;
}
