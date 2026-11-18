import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const keyPath = new URL('./ssl/key.pem', import.meta.url);
const certPath = new URL('./ssl/cert.pem', import.meta.url);
const https = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 监听 0.0.0.0，允许局域网访问
    port: 5173,
    https,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
