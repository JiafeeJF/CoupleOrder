import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import VerifyModal from '../components/VerifyModal.jsx';

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [submitOpen, setSubmitOpen] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // 弹窗内「获取验证码」：已通过人机验证。发送成功后倒计时由 VerifyModal 处理。
  const sendCode = async (captcha) => {
    return api.sendCode({ email: form.email, ...captcha });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return toast('请填写完整信息', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return toast('邮箱格式不正确', 'error');
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
      return toast('密码至少 8 位，且必须包含大写、小写字母和数字', 'error');
    }
    if (form.password !== form.confirm) return toast('两次输入的密码不一致', 'error');
    setSubmitOpen(true);
  };

  const doRegister = async (captcha, emailCode) => {
    await register(form.name, form.email, form.password, emailCode, captcha);
    setSubmitOpen(false);
    toast('注册成功，欢迎加入 CoupleOrder！');
    navigate('/pairing', { replace: true });
  };

  return (
    <AuthShell subtitle="和 TA 一起，从注册开始">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-cocoa">昵称</label>
          <input
            className="input-field"
            placeholder="怎么称呼你？"
            value={form.name}
            onChange={set('name')}
            autoComplete="name"
          />
        </div>
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
            placeholder="至少 8 位，包含字母和数字"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-cocoa">确认密码</label>
          <input
            type="password"
            className="input-field"
            placeholder="再次输入密码"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          注 册
        </button>
        <p className="text-center text-sm text-latte">
          已经有账号了？{' '}
          <Link to="/login" className="font-semibold text-rose">
            去登录
          </Link>
        </p>
      </form>

      {/* 注册弹窗：人机验证 + 获取验证码 + 填写验证码 + 提交 */}
      <VerifyModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="完成注册"
        subtitle="完成人机验证后，获取邮箱验证码并输入即可注册"
        email={form.email}
        requireCode
        onGetCode={sendCode}
        onSubmit={doRegister}
      />
    </AuthShell>
  );
}