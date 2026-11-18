import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from '../ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { IconCopy, IconHeart } from '../components/Icons.jsx';

export default function Pairing() {
  const { pairCode, user, partner, bindPair, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    const ok = await confirm({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmText: '退出',
    });
    if (ok) logout();
  };

  // 已配对（包括被对方实时绑定）后自动进入主页
  useEffect(() => {
    if (partner) navigate('/app', { replace: true });
  }, [partner, navigate]);

  const copyCode = () => {
    if (!pairCode) return;
    navigator.clipboard.writeText(pairCode).then(
      () => toast('配对码已复制'),
      () => toast('复制失败，请手动复制', 'error'),
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return toast('请输入对方的配对码', 'error');
    setSubmitting(true);
    try {
      await bindPair(code.trim().toUpperCase());
      toast('配对成功，开始点餐吧！');
      navigate('/app', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-5 py-10">
      <IconHeart className="pointer-events-none absolute -left-8 top-16 h-40 w-40 text-rose" />
      <IconHeart className="pointer-events-none absolute -right-10 bottom-20 h-56 w-56 text-coral" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-coral to-rose shadow-soft">
            <IconHeart className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-wide text-cocoa">
            Couple<span className="text-rose">Order</span>
          </h1>
        </div>

        <div className="card mb-5 space-y-5 p-6">
          <div className="text-center">
            <Avatar user={user} className="mx-auto" />
            <p className="mt-2 text-sm font-medium text-cocoa">
              你好，<span className="font-bold text-rose">{user?.name}</span>
            </p>
            <p className="mt-1 text-xs text-latte">请先和 TA 绑定，才能开始点餐哦</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-blush to-peach p-5 text-center">
            <p className="text-xs font-medium text-latte">你的配对码</p>
            <p className="mt-2 text-3xl font-extrabold tracking-[0.15em] text-cocoa">{pairCode}</p>
            <button onClick={copyCode} className="btn-ghost mx-auto mt-1 flex items-center gap-1.5 text-xs">
              <IconCopy className="h-4 w-4" />
              复制配对码发给 TA
            </button>
          </div>

          <div className="border-t border-peach pt-4">
            <p className="mb-3 text-center text-xs font-medium text-latte">或输入对方的配对码</p>
            <form onSubmit={submit} className="space-y-3">
              <input
                className="input-field text-center text-lg font-bold tracking-[0.15em] uppercase"
                placeholder="输入 6 位配对码"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? '绑定中...' : '绑定 TA'}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center">
          <button onClick={handleLogout} className="text-xs text-latte underline underline-offset-2">
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}