import React, { useState } from 'react';
import Modal from './Modal.jsx';
import AltchaWidget from './AltchaWidget.jsx';
import { useToast } from '../ToastContext.jsx';

// 登录/注册验证弹窗：
// - Login：人机验证通过后提交登录
// - Register：人机验证 + 获取验证码 + 填写验证码 + 提交注册，全部在弹窗内完成
//
// requireCode 时：可通过 onGetCode({
//   captcha }) 获取验证码（需已通过人机验证，且 countdown 为 0 才可点）
export default function VerifyModal({
  open,
  title,
  subtitle,
  onClose,
  email,
  requireCode = false,
  onGetCode, // (captcha) => Promise，点击「获取验证码」时调用
  onSubmit, // (captcha, emailCode) => Promise
}) {
  const toast = useToast();
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [emailCode, setEmailCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  const handleClose = () => {
    setCaptcha(null);
    setEmailCode('');
    setCountdown(0);
    onClose && onClose();
  };

  const getCode = async () => {
    if (!captcha) return toast('请先完成人机验证', 'error');
    if (countdown > 0) return;
    setSending(true);
    try {
      await onGetCode && onGetCode(captcha);
      toast('验证码已发送，请查收邮箱');
      setCountdown(60);
      const timer = setInterval(() => setCountdown((value) => {
        if (value <= 1) { clearInterval(timer); return 0; }
        return value - 1;
      }), 1000);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const confirm = async (e) => {
    e && e.preventDefault();
    if (!captcha) return toast('请先完成人机验证', 'error');
    if (requireCode && !emailCode.trim()) return toast('请输入邮箱验证码', 'error');
    setVerifying(true);
    try {
      await onSubmit(captcha, emailCode.trim());
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <p className="mb-4 text-sm text-latte">{subtitle}</p>
      <div className="space-y-4">
        <AltchaWidget onVerified={setCaptcha} />

        {requireCode && (
          <>
            <div className="flex gap-2">
              <input
                className="input-field min-w-0 flex-1"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="请输入6位邮箱验证码"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <button
                type="button"
                className="btn-ghost shrink-0 px-3 text-xs"
                disabled={sending || countdown > 0}
                onClick={getCode}
              >
                {countdown > 0 ? `${countdown}s 后重试` : '获取验证码'}
              </button>
            </div>
          </>
        )}

        <button onClick={confirm} className="btn-primary w-full" disabled={verifying}>
          {verifying ? '提交中...' : requireCode ? '确认注册' : '确认并登录'}
        </button>
      </div>
    </Modal>
  );
}