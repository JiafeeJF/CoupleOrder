import crypto from 'crypto';

const buckets = new Map();
const verificationCodes = new Map();
const sendHistory = new Map();
const loginFailures = new Map();

function keyFor(req, scope) {
  return `${scope}:${req.ip || req.socket.remoteAddress || 'unknown'}:${req.userId || ''}`;
}

export function rateLimit({ scope, windowMs, max, message = '请求过于频繁，请稍后再试' }) {
  return (req, res, next) => {
    const key = keyFor(req, scope);
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.expiresAt <= now) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((current.expiresAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

export function cleanText(value, maxLength = 200) {
  return String(value ?? '').replace(/[<>]/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function validateImageData(value, maxBytes, label) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 1.4)) throw new Error(`${label}图片过大或格式不正确`);
  const match = value.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error(`${label}仅支持 JPG、PNG、WebP 或 GIF 图片`);
  if (Buffer.byteLength(match[2], 'base64') > maxBytes) throw new Error(`${label}图片不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB`);
  return value;
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function issueEmailCode(email, ip) {
  const key = String(email).trim().toLowerCase();
  const now = Date.now();
  const record = sendHistory.get(key) || { sent: [] };
  record.sent = record.sent.filter((time) => now - time < 24 * 60 * 60 * 1000);
  if (record.sent.some((time) => now - time < 60 * 1000)) return { error: '验证码发送过于频繁，请 60 秒后再试' };
  if (record.sent.filter((time) => now - time < 60 * 60 * 1000).length >= 5) return { error: '该邮箱本小时验证码发送次数已达上限' };
  if (record.sent.length >= 10) return { error: '该邮箱今日验证码发送次数已达上限' };
  const ipKey = `ip:${ip || 'unknown'}`;
  const ipRecord = sendHistory.get(ipKey) || { sent: [] };
  ipRecord.sent = ipRecord.sent.filter((time) => now - time < 60 * 60 * 1000);
  if (ipRecord.sent.length >= 20) return { error: '当前网络验证码发送次数过多，请稍后再试' };
  const code = String(crypto.randomInt(100000, 1000000));
  verificationCodes.set(key, { codeHash: hashCode(code), expiresAt: now + 5 * 60 * 1000, attempts: 0 });
  record.sent.push(now);
  ipRecord.sent.push(now);
  sendHistory.set(key, record);
  sendHistory.set(ipKey, ipRecord);
  return { code };
}

export function verifyEmailCode(email, code) {
  const key = String(email).trim().toLowerCase();
  const record = verificationCodes.get(key);
  if (!record || record.expiresAt < Date.now()) {
    verificationCodes.delete(key);
    return { ok: false, error: '邮箱验证码已过期或不存在' };
  }
  if (record.codeHash !== hashCode(String(code || '').trim())) {
    record.attempts += 1;
    if (record.attempts >= 5) verificationCodes.delete(key);
    return { ok: false, error: record.attempts >= 5 ? '验证码错误次数过多，请重新获取' : '邮箱验证码错误' };
  }
  verificationCodes.delete(key);
  return { ok: true };
}

export function loginGuard(email, ip) {
  const now = Date.now();
  const key = String(email).trim().toLowerCase();
  const record = loginFailures.get(key) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil > now) return { blocked: true };
  const ipRecord = loginFailures.get(`ip:${ip || 'unknown'}`) || { failures: [] };
  ipRecord.failures = ipRecord.failures.filter((time) => now - time < 5 * 60 * 1000);
  if (ipRecord.failures.length >= 20) return { blocked: true };
  return { blocked: false };
}

export function recordLoginFailure(email, ip) {
  const key = String(email).trim().toLowerCase();
  const record = loginFailures.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) record.lockedUntil = Date.now() + 10 * 60 * 1000;
  loginFailures.set(key, record);
  const ipKey = `ip:${ip || 'unknown'}`;
  const ipRecord = loginFailures.get(ipKey) || { failures: [] };
  ipRecord.failures.push(Date.now());
  loginFailures.set(ipKey, ipRecord);
}

export function clearLoginFailures(email) { loginFailures.delete(String(email).trim().toLowerCase()); }
export function audit(action, userId, details = '') { console.info(`[security] ${action} user=${userId || '-'} ${cleanText(details, 300)}`); }
