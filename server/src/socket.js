import jwt from 'jsonwebtoken';
import { db, getPairId } from './store.js';
import { audit } from './security.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
}
let ioRef = null;
const onlineCountByUser = new Map();

export function isUserOnline(userId) {
  return (onlineCountByUser.get(userId) || 0) > 0;
}

function setOnline(userId, online) {
  if (!userId) return;
  const user = db.users.find((u) => u.id === userId);
  if (!user) return;
  const partnerId = user.partnerId;
  emitToUser(userId, 'presence:update', { userId, online });
  if (partnerId) emitToUser(partnerId, 'presence:update', { userId, online });
}

function incrementOnline(userId) {
  const next = (onlineCountByUser.get(userId) || 0) + 1;
  onlineCountByUser.set(userId, next);
  if (next === 1) setOnline(userId, true);
}

function decrementOnline(userId) {
  const next = Math.max(0, (onlineCountByUser.get(userId) || 0) - 1);
  if (next === 0) {
    onlineCountByUser.delete(userId);
    setOnline(userId, false);
  } else {
    onlineCountByUser.set(userId, next);
  }
}

export function initSocket(io) {
  ioRef = io;
  io.engine.opts.cookie = false;
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.match(/(?:^|;\s*)co_token=([^;]+)/)?.[1];
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = db.users.find((u) => u.id === payload.id);
      if (!user) return next(new Error('unauthorized'));
      socket.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = db.users.find((u) => u.id === socket.userId);
    if (!user) return socket.disconnect(true);
    socket.join(`user:${socket.userId}`);
    incrementOnline(socket.userId);
    audit('socket-connect', socket.userId);

    // 已配对的用户，额外加入「基于配对关系」的共享房间
    // 菜单修改等双方可见的变更都往该房间广播
    const pid = getPairId(user);
    if (pid) {
      socket.join(`pair:${pid}`);
      console.log(`[socket] ${socket.userId} 加入配对房间 pair:${pid}`);
    }

    // 主动请求本轮已上架菜单（重连/掉线/首次进入补偿，防止遗漏变更）
    socket.on('menu:request', () => {
      const u = db.users.find((x) => x.id === socket.userId);
      const p = getPairId(u);
      if (!p) return;
      socket.emit('menu:update', menuSnapshot(p));
    });

    // 告知新连接用户对方当前在线状态
    if (user?.partnerId) {
      socket.emit('presence:update', { userId: user.partnerId, online: isUserOnline(user.partnerId) });
    }

    socket.on('disconnect', () => {
      decrementOnline(socket.userId);
      console.log('[socket] 已断开:', socket.userId);
    });
  });
}

// 某个配对组的菜单快照（按 id 升序）
function snapshotItems(pairId) {
  return db.menuItems
    .filter((i) => i.pairId === pairId)
    .sort((a, b) => a.id - b.id);
}

// 菜单版本号：每次变更递增，前端据此跳过重复/旧快照，避免闪烁
const menuRevByPair = new Map();
export function getMenuRev(pairId) {
  return menuRevByPair.get(pairId) || 0;
}

// 构造带版本号的菜单快照
export function menuSnapshot(pairId) {
  return {
    pairId,
    rev: getMenuRev(pairId),
    items: snapshotItems(pairId),
  };
}

// 订单状态更新（保持原有逻辑，向前端特定用户推送）
export function emitToUser(userId, event, payload) {
  if (ioRef) ioRef.to(`user:${userId}`).emit(event, payload);
}

// 向本配对组的「所有成员」广播菜单更新。
// 基于 pair 房间，操作方自己也会收到（多个标签页需要同步），
// 但只辐射到该配对组，不会泄露给其他用户。by 为操作者 userId，
// 前端可据此只对「对方修改」触发系统通知，避免自操作自推送。
export function emitMenuChanged(pairId, by) {
  if (!ioRef || !pairId) return;
  // 递增版本号后再广播
  menuRevByPair.set(pairId, getMenuRev(pairId) + 1);
  ioRef.to(`pair:${pairId}`).emit('menu:update', { ...menuSnapshot(pairId), by: by || null });
}

// 向本配对组广播「某个菜品发生变化」的增量事件（保留给未来优化使用）
export function emitMenuItemChanged(pairId, type, item) {
  if (!ioRef || !pairId) return;
  ioRef.to(`pair:${pairId}`).emit('menu:item-change', {
    pairId,
    type,
    item,
    rev: getMenuRev(pairId),
  });
}

// 向本配对组的「所有成员」广播通用事件（如评分更新），只辐射该配对组
export function emitPairEvent(pairId, event, payload) {
  if (!ioRef || !pairId) return;
  ioRef.to(`pair:${pairId}`).emit(event, payload);
}

export function emitProfileUpdated(pairId, payload) {
  if (!ioRef || !pairId) return;
  ioRef.to(`pair:${pairId}`).emit('profile:updated', payload);
}