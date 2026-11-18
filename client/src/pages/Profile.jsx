import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from '../ConfirmContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import { prepareMenuItemImage } from '../utils/image.js';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage.js';
import { IconCopy, IconHeart, IconLogout, IconEdit, IconOrder, IconCamera, IconMail, IconLock } from '../components/Icons.jsx';

// 发送验证码倒计时（默认 60s）
function useCountdown(seconds = 60) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [left]);
  const start = () => setLeft(seconds);
  return [left, start];
}

export default function Profile() {
  const { user, partner, pairCode, logout, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ mine: 0, incoming: 0, done: 0 });

  // 弹窗开关
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // 编辑资料
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [cover, setCover] = useState('');
  const [coverSource, setCoverSource] = useState('');
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const [coverCrop, setCoverCrop] = useState({ x: 0, y: 0 });
  const [coverZoom, setCoverZoom] = useState(1);
  const [coverCropPixels, setCoverCropPixels] = useState(null);
  const [uploading, setUploading] = useState(false);
  // 换绑邮箱
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailLeft, startEmailCd] = useCountdown();
  // 修改密码
  const [passCode, setPassCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passLeft, startPassCd] = useCountdown();

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.orders().then(({ orders }) => {
      setStats({
        mine: orders.filter((o) => o.placedBy === user?.id).length,
        incoming: orders.filter((o) => o.placedBy !== user?.id).length,
        done: orders.filter((o) => o.status === 'done').length,
      });
    }).catch(() => {});
  }, [user]);

  // 打开编辑弹窗时预填当前资料
  const openEdit = () => {
    setName(user?.name || '');
    setAvatar(user?.avatar || '');
    setCover(user?.cover || '');
    setEditOpen(true);
  };

  const handleImageFile = async (e, target) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('请选择图片文件', 'error');
    setUploading(true);
    try {
      const dataUrl = await prepareMenuItemImage(file);
      if (target === 'cover') {
        setCoverSource(dataUrl);
        setCoverCrop({ x: 0, y: 0 });
        setCoverZoom(1);
        setCoverCropPixels(null);
        setCoverCropOpen(true);
      } else {
        setAvatar(dataUrl);
      }
    } catch {
      toast('图片处理失败，请换一张试试', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleCoverCropComplete = useCallback((_, pixels) => {
    setCoverCropPixels(pixels);
  }, []);

  const confirmCoverCrop = async () => {
    if (!coverSource || !coverCropPixels) return;
    setUploading(true);
    try {
      const cropped = await getCroppedImg(coverSource, coverCropPixels);
      setCover(cropped);
      setCoverCropOpen(false);
      setCoverSource('');
    } catch {
      toast('横幅裁剪失败，请重试', 'error');
    } finally {
      setUploading(false);
    }
  };

  const cancelCoverCrop = () => {
    setCoverCropOpen(false);
    setCoverSource('');
    setCoverCropPixels(null);
    setUploading(false);
  };

  const saveProfile = async () => {
    if (!name.trim()) return toast('昵称不能为空', 'error');
    setSaving(true);
    try {
      await api.updateProfile({ name: name.trim(), avatar, cover });
      await refresh();
      toast('资料已更新');
      setEditOpen(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendEmailCode = async () => {
    if (!newEmail.trim()) return toast('请先输入新邮箱', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) return toast('邮箱格式不正确', 'error');
    try {
      await api.sendEmailCode(newEmail.trim());
      toast('验证码已发送到新邮箱');
      startEmailCd();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const submitEmail = async () => {
    if (!newEmail.trim()) return toast('请输入新邮箱', 'error');
    if (!emailCode.trim()) return toast('请输入验证码', 'error');
    setSaving(true);
    try {
      await api.changeEmail({ newEmail: newEmail.trim(), code: emailCode.trim() });
      await refresh();
      toast('邮箱换绑成功');
      setEmailOpen(false);
      setNewEmail('');
      setEmailCode('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendPassCode = async () => {
    try {
      await api.sendPasswordCode();
      toast('验证码已发送到当前邮箱');
      startPassCd();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const submitPassword = async () => {
    if (!passCode.trim()) return toast('请输入验证码', 'error');
    if (String(newPassword).length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return toast('新密码至少 8 位，且需包含大写字母、小写字母和数字', 'error');
    }
    setSaving(true);
    try {
      await api.changePassword({ code: passCode.trim(), newPassword });
      toast('密码修改成功，下次登录请使用新密码');
      setPasswordOpen(false);
      setPassCode('');
      setNewPassword('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(pairCode).then(
      () => toast('配对码已复制'),
      () => toast('复制失败', 'error'),
    );
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmText: '退出',
    });
    if (!ok) return;
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
      <h2 className="mb-4 text-xl font-extrabold text-cocoa">我的</h2>

      {/* 个人信息卡 */}
      <div className="card relative overflow-hidden p-6">
        <IconHeart className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 text-rose" />
        <div className="relative flex items-center gap-4">
          <div className="pointer-events-none absolute inset-0 -m-6 overflow-hidden opacity-10">
            {user?.cover && <img src={user.cover} alt="" className="h-full w-full object-cover" />}
          </div>
          <Avatar user={user} size="lg" className="relative" />
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-cocoa">{user?.name}</p>
            <p className="truncate text-xs text-latte">{user?.email}</p>
          </div>
          <button onClick={openEdit} className="btn-secondary relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs">
            <IconEdit className="h-3.5 w-3.5" /> 编辑资料
          </button>
        </div>
      </div>

      {/* 配对信息 */}
      <div className="card mt-4 p-5">
        <p className="mb-3 text-xs font-medium text-latte">情侣关系</p>
        {partner ? (
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <Avatar user={user} className="mx-auto" />
              <p className="mt-1 text-xs font-medium text-cocoa">{user?.name}</p>
            </div>
            <IconHeart className="h-6 w-6 text-rose" />
            <div className="text-center">
              <Avatar user={partner} className="mx-auto" />
              <p className="mt-1 text-xs font-medium text-cocoa">{partner?.name}</p>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-latte">暂未配对</p>
        )}
        <button onClick={copyCode} className="btn-secondary mx-auto mt-4 flex items-center gap-2 py-2 text-xs">
          <IconCopy className="h-4 w-4" />
          我的配对码：{pairCode}
        </button>
      </div>

      {/* 账号与安全 */}
      <div className="card mt-4 divide-y divide-peach p-2">
        <button onClick={() => setEmailOpen(true)} className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-cocoa">
          <IconMail className="h-5 w-5 text-coral" /> 换绑邮箱
          <span className="ml-auto text-latte">&gt;</span>
        </button>
        <button onClick={() => setPasswordOpen(true)} className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-cocoa">
          <IconLock className="h-5 w-5 text-coral" /> 修改密码
          <span className="ml-auto text-latte">&gt;</span>
        </button>
      </div>

      {/* 统计 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: '我发起', value: stats.mine, color: 'text-rose' },
          { label: 'TA 发来', value: stats.incoming, color: 'text-coral' },
          { label: '已完成', value: stats.done, color: 'text-latte' },
        ].map((s) => (
          <div key={s.label} className="card py-4 text-center">
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-latte">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 功能入口 */}
      <div className="card mt-4 divide-y divide-peach p-2">
        <button onClick={() => navigate('/app/orders')} className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-cocoa">
          <IconOrder className="h-5 w-5 text-coral" /> 订单中心
          <span className="ml-auto text-latte">&gt;</span>
        </button>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-tangerine">
          <IconLogout className="h-5 w-5" /> 退出登录
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-latte/70">CoupleOrder · 为情侣打造的温馨点餐小屋</p>

      {/* ===== 编辑资料弹窗 ===== */}
      <Modal open={editOpen} title="编辑资料" onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          <div className="flex flex-col items-center">
            <label className="cursor-pointer">
              <div className="relative">
                <Avatar user={{ ...user, name, avatar }} size="lg" className="!h-20 !w-20 text-3xl" />
                <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-coral to-rose text-white shadow-soft">
                  <IconCamera className="h-4 w-4" />
                </span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e, 'avatar')} disabled={uploading} />
            </label>
            <p className="mt-2 text-xs text-latte">{uploading ? '正在处理图片...' : '点击更换头像'}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">昵称</label>
            <input className="input-field" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">菜单横幅</label>
            <label className="block cursor-pointer overflow-hidden rounded-xl border border-dashed border-peach bg-blush/40">
              {cover ? <img src={cover} alt="横幅预览" className="h-24 w-full object-cover" /> : <div className="flex h-20 items-center justify-center text-xs text-latte">点击选择横幅图片</div>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e, 'cover')} disabled={uploading} />
            </label>
          </div>
          <button onClick={saveProfile} disabled={saving || uploading} className="btn-primary w-full">
            {saving ? '保存中...' : '保存资料'}
          </button>
        </div>
      </Modal>

      {/* ===== 横幅裁剪弹窗 ===== */}
      <Modal open={coverCropOpen} title="裁剪菜单横幅" onClose={cancelCoverCrop}>
        <div className="space-y-4">
          <div className="relative h-64 overflow-hidden rounded-2xl bg-black">
            {coverSource && (
              <Cropper
                image={coverSource}
                crop={coverCrop}
                zoom={coverZoom}
                aspect={16 / 7}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCoverCrop}
                onCropComplete={handleCoverCropComplete}
                onZoomChange={setCoverZoom}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">缩放</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={coverZoom}
              onChange={(e) => setCoverZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={cancelCoverCrop} className="btn-ghost flex-1">
              取消
            </button>
            <button onClick={confirmCoverCrop} disabled={uploading} className="btn-primary flex-1">
              确认裁剪
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== 换绑邮箱弹窗 ===== */}
      <Modal open={emailOpen} title="换绑邮箱" onClose={() => setEmailOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">新邮箱</label>
            <input className="input-field" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="输入要绑定的新邮箱" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">验证码</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" inputMode="numeric" maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="6 位验证码" />
              <button onClick={sendEmailCode} disabled={emailLeft > 0} className="btn-secondary shrink-0 px-4 py-2 text-xs">
                {emailLeft > 0 ? `${emailLeft}s 后重发` : '发送验证码'}
              </button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-latte">验证码将发送到你填写的新邮箱，10 分钟内有效。</p>
          <button onClick={submitEmail} disabled={saving} className="btn-primary w-full">
            {saving ? '提交中...' : '确认换绑'}
          </button>
        </div>
      </Modal>

      {/* ===== 修改密码弹窗 ===== */}
      <Modal open={passwordOpen} title="修改密码" onClose={() => setPasswordOpen(false)}>
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-latte">验证码将发送到当前邮箱 <b className="text-cocoa">{user?.email}</b></p>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">验证码</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" inputMode="numeric" maxLength={6} value={passCode} onChange={(e) => setPassCode(e.target.value)} placeholder="6 位验证码" />
              <button onClick={sendPassCode} disabled={passLeft > 0} className="btn-secondary shrink-0 px-4 py-2 text-xs">
                {passLeft > 0 ? `${passLeft}s 后重发` : '发送验证码'}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">新密码</label>
            <input className="input-field" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 8 位，含大小写字母和数字" />
          </div>
          <button onClick={submitPassword} disabled={saving} className="btn-primary w-full">
            {saving ? '提交中...' : '确认修改'}
          </button>
        </div>
      </Modal>
    </div>
  );
}