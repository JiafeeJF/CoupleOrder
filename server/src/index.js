import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server } from 'socket.io';
import { initSocket } from './socket.js';
import authRoutes from './routes/auth.js';
import pairRoutes from './routes/pair.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/orders.js';
import { connectStore } from './store.js';
import { createCaptchaChallenge } from './captcha.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const app = express();
const server = http.createServer(app);

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const isAllowedOrigin = (origin) =>
  !origin || origins.includes(origin) || origin === 'https://localhost' || origin === 'capacitor://localhost';
const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) return callback(null, true);
  callback(new Error('CORS origin denied'));
};

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb', strict: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  // 仅对 API 接口启用收紧的 CSP：接口不加载前端资源，default-src 'none' 可防 XSS/数据外带。
  // 静态文件（HTML/JS/CSS，由 express.static 伺服）若也带 default-src 'none'，
  // 会拦截同源脚本与样式渲染，导致页面空白——因此静态资源不使用这一策略。
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  } else {
    res.set('Content-Security-Policy', "frame-ancestors 'none'");
  }
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (req, res) => res.json({ success: true, name: 'CoupleOrder API' }));
app.get('/api/auth/captcha/challenge', async (req, res) => {
  try {
    res.json(await createCaptchaChallenge());
  } catch {
    res.status(503).json({ success: false, message: '人机验证暂时不可用' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/pair', pairRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);

// 生产模式伺服前端静态文件（dist）。开发模式由 Vite 负责，无需此逻辑。
initSocket(io);

const STATIC_DIR = process.env.STATIC_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const hasStatic = fs.existsSync(path.join(STATIC_DIR, 'index.html'));
if (hasStatic) {
  app.use(express.static(STATIC_DIR, { maxAge: '30d', index: 'index.html' }));
  // SPA 回退：非 /api 的 GET 请求交给 index.html
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
connectStore()
  .then(() => server.listen(PORT, () => {
    console.log(`CoupleOrder 服务端已启动: http://localhost:${PORT}`);
  }))
  .catch((err) => {
    console.error('[startup] 数据库连接失败:', err.message);
    process.exit(1);
  });
