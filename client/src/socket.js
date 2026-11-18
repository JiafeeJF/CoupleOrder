import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { getAuthToken, MOBILE_BASE } from './api.js';
let socket = null;

export function connectSocket() {
  if (socket) return socket;
  socket = io(Capacitor.isNativePlatform() ? MOBILE_BASE : undefined, {
    auth: { token: getAuthToken() },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => console.log('[socket] 已连接'));
  socket.on('disconnect', () => console.log('[socket] 已断开'));
  return socket;
}

export function getSocket() {
  return socket;
}

// 主动向服务端请求最新菜单（重连/首次进入时调用，用于补偿可能遗漏的实时更新）
export function requestMenu() {
  if (socket && socket.connected) socket.emit('menu:request');
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
