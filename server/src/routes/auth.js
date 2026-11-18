import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, save, nextId, getPairId } from '../store.js';
import { authRequired, publicUser, signToken, genPairCode } from '../auth.js';
import { emitToUser, emitProfileUpdated } from '../socket.js';
import { sendMail } from '../email.js';
import { audit, cleanText, rateLimit, validateImageData, issueEmailCode, verifyEmailCode, loginGuard, recordLoginFailure, clearLoginFailures } from '../security.js';
import { createCaptchaChallenge, verifyCaptcha } from '../captcha.js';
import { encryptResource, decryptResource } from '../crypt.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' };
const registerLimit = rateLimit({ scope: 'register', windowMs: 15 * 60 * 1000, max: 5, message: '注册请求过于频繁，请稍后再试' });
const loginLimit = rateLimit({ scope: 'login', windowMs: 5 * 60 * 1000, max: 20, message: '请求过于频繁，请稍后再试' });
const weakPasswords = new Set(['password123', '12345678', '123456789', 'qwerty123', 'abc12345', '11111111']);

function validPassword(password) {
  const value = String(password || '');
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && !weakPasswords.has(value.toLowerCase());
}

// ========== 邮箱验证码（内存存储，10 分钟有效，一次性） ==========
// key: email.toLowerCase(), value: { code, purpose, expiresAt }
const emailCodes = new Map();
const CODE_TTL = 5 * 60 * 1000; // 注册验证码有效 5 分钟
const RESEND_GAP = 60 * 1000; // 60 秒内不允许重复发送

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendVerificationEmail(to, code, purpose) {
  const subject =
    purpose === 'register'
      ? 'CoupleOrder 注册验证码'
      : purpose === 'email'
        ? 'CoupleOrder 换绑邮箱验证码'
        : purpose === 'password'
          ? 'CoupleOrder 修改密码验证码'
          : 'CoupleOrder 验证码';
  const text = `你的验证码是：${code}，10 分钟内有效。如果这不是你的操作，请忽略本邮件。`;
  return sendMail({ to, subject, text, html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#FFF8F0;border-radius:16px;"><div style="font-size:18px;font-weight:700;color:#E8604C;margin-bottom:12px;">${subject}</div><p style="color:#7A5C4F;line-height:1.8;">你的验证码是：<b style="font-size:22px;color:#E8604C;letter-spacing:4px;">${code}</b></p><p style="color:#A68A7D;font-size:13px;">10 分钟内有效，如果不是你本人的操作，请忽略这封邮件。</p></div>` });
}

async function verifyHuman(captchaToken) {
  return verifyCaptcha(captchaToken);
}

router.get('/captcha/challenge', async (req, res) => {
  try {
    res.json(await createCaptchaChallenge());
  } catch {
    res.status(503).json({ success: false, message: '人机验证暂时不可用，请稍后重试' });
  }
});

router.post('/send-code', registerLimit, async (req, res) => {
  const { email, captchaToken } = req.body || {};
  const email2 = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2)) return res.status(400).json({ success: false, message: '邮箱格式不正确' });
  if (!(await verifyHuman(captchaToken))) return res.status(400).json({ success: false, message: '人机验证失败，请重试' });
  if (db.users.some((u) => u.email === email2)) return res.status(400).json({ success: false, message: '该邮箱已被注册' });
  const issued = issueEmailCode(email2, req.ip);
  if (issued.error) return res.status(429).json({ success: false, message: issued.error });
  sendVerificationEmail(email2, issued.code, 'register');
  res.json({ success: true, message: '验证码已发送' });
});

// ========== 注册 ==========
router.post('/register', registerLimit, async (req, res) => {
  try {
    const { name, email, password, emailCode, captchaToken } = req.body || {};
    if (!(await verifyHuman(captchaToken))) return res.status(400).json({ success: false, message: '人机验证失败，请重试' });
    const codeResult = verifyEmailCode(email, emailCode);
    if (!codeResult.ok) return res.status(400).json({ success: false, message: codeResult.error });
    if (!name || !email || !password) return res.status(400).json({ success: false, message: '请填写完整信息' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ error: '邮箱格式不正确' });
    if (!validPassword(password)) return res.status(400).json({ success: false, message: '密码至少 8 位，且必须包含大写字母、小写字母和数字' });
    const email2 = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email === email2)) return res.status(400).json({ error: '该邮箱已被注册' });

    const hash = await bcrypt.hash(String(password), 10);
    const id = nextId('user');
    const user = {
      id,
      name: cleanText(name, 20),
      email: email2,
      passwordHash: hash,
      partnerId: null,
      pairCode: genPairCode(),
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    save();
    audit('register', user.id, `email=${email2}`);
    const token = signToken(user);
    res.cookie('co_token', token, cookieOptions);
    res.json({ user: publicUser(user), pairCode: user.pairCode, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 登录
router.post('/login', loginLimit, async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body || {};
    if (!(await verifyHuman(captchaToken))) return res.status(400).json({ success: false, message: '人机验证失败，请重试' });
    const email2 = String(email || '').trim().toLowerCase();
    const guard = loginGuard(email2, req.ip);
    if (guard.blocked) return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
    const user = db.users.find((u) => u.email === email2);
    if (!user) {
      recordLoginFailure(email2, req.ip);
      audit('login-failed', null);
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) {
      recordLoginFailure(email2, req.ip);
      audit('login-failed', user.id);
      return res.status(401).json({ success: false, message: '邮箱或密码错误' });
    }
    clearLoginFailures(email2);
    audit('login', user.id);
    res.cookie('co_token', signToken(user), cookieOptions);
    res.json({ user: publicUser(user), pairCode: user.pairCode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('co_token', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

// 获取当前用户信息
router.get('/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// 更新个人资料（昵称 / 头像 / 菜单横幅 - 情侣共享：横幅双人同步）
router.put('/profile', authRequired, (req, res) => {
  const { name, avatar, cover } = req.body || {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: '昵称不能为空' });
    if (trimmed.length > 20) return res.status(400).json({ error: '昵称最多 20 个字' });
    req.user.name = trimmed;
  }
  if (avatar !== undefined) {
    if (avatar && typeof avatar === 'string' && avatar.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: '头像图片过大' });
    }
    try {
      const validAvatar = validateImageData(avatar, 3 * 1024 * 1024, '头像');
      req.user.avatar = validAvatar ? encryptResource(validAvatar) : '';
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  let coverUpdated = false;
  if (cover !== undefined) {
    if (cover && typeof cover === 'string' && cover.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: '横幅图片过大' });
    }
    const nextCover = cover || '';
    try {
      const validCover = validateImageData(nextCover, 5 * 1024 * 1024, '横幅');
      const encryptedCover = validCover ? encryptResource(validCover) : '';
      // 封面由两人共享：直接同步到对方资料，避免"只对自己生效"
      // 比较时均解密，避免因加密密文不同而误判"封面发生变化"
      if (decryptResource(req.user.cover) !== validCover) {
        coverUpdated = true;
        req.user.cover = encryptedCover;
        const partner = req.user.partnerId ? db.users.find((u) => u.id === req.user.partnerId) : null;
        if (partner) partner.cover = encryptedCover;
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  save();
  if (coverUpdated) {
    const pairId = getPairId(req.user);
    if (pairId) {
      emitProfileUpdated(pairId, { cover: req.user.cover, user: publicUser(req.user) });
    } else if (req.user.partnerId) {
      emitToUser(req.user.partnerId, 'profile:updated', { cover: req.user.cover, user: publicUser(req.user) });
    }
  }
  res.json({ user: publicUser(req.user) });
});

// 发送「换绑邮箱」验证码到新邮箱
router.post('/email/code', authRequired, (req, res) => {
  const { newEmail } = req.body || {};
  const email2 = String(newEmail || '').trim().toLowerCase();
  if (!email2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email2)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }
  if (db.users.some((u) => u.email === email2)) {
    return res.status(400).json({ error: '该邮箱已被其他账号使用' });
  }
  const last = emailCodes.get(email2);
  if (last && last.purpose === 'email' && Date.now() - (last.sentAt || 0) < RESEND_GAP) {
    return res.status(429).json({ error: '发送太频繁，请 60 秒后再试' });
  }
  const issued = issueEmailCode(email2, req.ip);
  if (issued.error) return res.status(429).json({ error: issued.error });
  sendVerificationEmail(email2, issued.code, 'email');
  res.json({ ok: true, message: '验证码已发送' });
});

// 验证码换绑邮箱
router.put('/email', authRequired, (req, res) => {
  const { newEmail, code } = req.body || {};
  const email2 = String(newEmail || '').trim().toLowerCase();
  const codeResult = verifyEmailCode(email2, code);
  if (!codeResult.ok) {
    return res.status(400).json({ error: codeResult.error });
  }
  if (db.users.some((u) => u.email === email2 && u.id !== req.user.id)) {
    return res.status(400).json({ error: '该邮箱已被其他账号使用' });
  }
  req.user.email = email2;
  save();
  res.json({ user: publicUser(req.user) });
});

// 发送「修改密码」验证码到当前绑定邮箱
router.post('/password/code', authRequired, (req, res) => {
  const email2 = req.user.email.toLowerCase();
  const last = emailCodes.get(email2);
  if (last && last.purpose === 'password' && Date.now() - (last.sentAt || 0) < RESEND_GAP) {
    return res.status(429).json({ error: '发送太频繁，请 60 秒后再试' });
  }
  const issued = issueEmailCode(email2, req.ip);
  if (issued.error) return res.status(429).json({ error: issued.error });
  sendVerificationEmail(email2, issued.code, 'password');
  res.json({ ok: true, message: '验证码已发送到当前邮箱' });
});

// 验证码修改密码
router.put('/password', authRequired, async (req, res) => {
  try {
    const { code, newPassword } = req.body || {};
    const email2 = req.user.email.toLowerCase();
    const codeResult = verifyEmailCode(email2, code);
    if (!codeResult.ok) {
      return res.status(400).json({ error: codeResult.error });
    }
    if (!newPassword || String(newPassword).length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ error: '新密码至少 8 位，且需包含大写字母、小写字母和数字' });
    }
    req.user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    save();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '修改密码失败，请稍后重试' });
  }
});

export default router;