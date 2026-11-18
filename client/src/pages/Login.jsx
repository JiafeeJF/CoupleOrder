import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ToastContext.jsx';
import VerifyModal from '../components/VerifyModal.jsx';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [verifyOpen, setVerifyOpen] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast('请填写邮箱和密码', 'error');
    setVerifyOpen(true);
  };

  const doLogin = async (captcha) => {
    await login(form.email, form.password, captcha);
    setVerifyOpen(false);
    toast('欢迎回来！');
    navigate('/app', { replace: true });
  };

  return (
    <AuthShell subtitle="登录，回到你们的点餐小屋">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-cocoa">邮箱</label>
          <input
            type="email"
            className="input-field"
            placeholder="you@example.com"
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-cocoa">密码</label>
          <input
            type="password"
            className="input-field"
            placeholder="请输入密码"
            value={form.password}
            onChange={set('password')}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          登 录
        </button>
        <p className="text-center text-sm text-latte">
          还没有账号？{' '}
          <Link to="/register" className="font-semibold text-rose">
            立即注册
          </Link>
        </p>
      </form>
      <VerifyModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="人机验证"
        subtitle="完成人机验证后即可登录"
        email={form.email}
        onSubmit={doLogin}
      />
    </AuthShell>
  );
}