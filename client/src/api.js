import { Capacitor } from '@capacitor/core';

export const MOBILE_BASE = 'https://cp.nexichat.xyz';
const BASE = Capacitor.isNativePlatform() ? MOBILE_BASE : '';
const TOKEN_KEY = 'co_mobile_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = auth ? getAuthToken() : '';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '请求失败，请稍后重试');
  }
  return data;
}

export const api = {
  captchaChallenge: () => request('/api/auth/captcha/challenge', { auth: false }),
  sendRegisterCode: (d) => request('/api/auth/send-code', { method: 'POST', body: d, auth: false }),
  captchaChallenge: () => request('/api/auth/captcha/challenge', { auth: false }),
  sendCode: (d) => request('/api/auth/send-code', { method: 'POST', body: d, auth: false }),
  register: (d) => request('/api/auth/register', { method: 'POST', body: d, auth: false }),
  login: (d) => request('/api/auth/login', { method: 'POST', body: d, auth: false }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  updateProfile: (d) => request('/api/auth/profile', { method: 'PUT', body: d }),
  sendEmailCode: (newEmail) => request('/api/auth/email/code', { method: 'POST', body: { newEmail } }),
  changeEmail: (d) => request('/api/auth/email', { method: 'PUT', body: d }),
  sendPasswordCode: () => request('/api/auth/password/code', { method: 'POST' }),
  changePassword: (d) => request('/api/auth/password', { method: 'PUT', body: d }),

  pairMe: () => request('/api/pair/me'),
  bind: (code) => request('/api/pair/bind', { method: 'POST', body: { code } }),

  menu: () => request('/api/menu'),
  addMenuItem: (d) => request('/api/menu', { method: 'POST', body: d }),
  updateMenuItem: (id, d) => request(`/api/menu/${id}`, { method: 'PUT', body: d }),
  toggleMenuItem: (id) => request(`/api/menu/${id}/available`, { method: 'PATCH' }),
  deleteMenuItem: (id) => request(`/api/menu/${id}`, { method: 'DELETE' }),

  orders: () => request('/api/orders'),
  orderStats: () => request('/api/orders/stats'),
  createOrder: (d) => request('/api/orders', { method: 'POST', body: d }),
  updateOrderStatus: (id, status) => request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } }),
  rateOrder: (id, d) => request(`/api/orders/${id}/rating`, { method: 'POST', body: d }),
};
