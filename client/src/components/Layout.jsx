import React, { useEffect, useState, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { pushSystemNotification } from '../utils/notify.js';
import { IconBell, IconClose, IconEdit } from './Icons.jsx';

const navItems = [
  { to: '/app/menu', label: '菜单', icon: '/nav/menu.png' },
  { to: '/app/orders', label: '订单', icon: '/nav/orders.png' },
  { to: '/app/profile', label: '我的', icon: '/nav/profile.png' },
];

// 隐藏入口：长按底部「菜单」按钮的时长
const LONG_PRESS_MS = 900;
// v2：引导样式升级后重新展示一次（旧标记 v1 已忽略）
const GUIDE_KEY = 'co_manage_guide_seen_v2';

export default function Layout() {
  const { user, refresh, socketReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const pressTimerRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { orders } = await api.orders();
        const incoming = orders.filter((o) => o.placedBy !== user.id);
        setPendingCount(incoming.filter((o) => o.status === 'pending').length);
      } catch {
        /* 忽略 */
      }
    };
    load();
  }, [user, location.pathname]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady) return;
    const onNew = (order) => {
      // 只有对方下的单才计入待接单数；有新的待接单则重新展示提示条
      if (user && order.placedBy !== user.id) {
        setPendingCount((c) => c + 1);
        setDismissed(false);
        pushSystemNotification({
          title: '有新订单',
          body: `${order.placedByName || '对方'} 点了一单（${(order.items || []).length} 道菜）`,
          id: 1000 + Number(order.id || 0),
          data: {
            path: order.id ? `/app/orders/${order.id}` : '/app/orders',
          },
        });
      }
    };
    const onUpdated = (order) => {
      // 状态更新后刷新配对信息（对方可能刚绑定）
      refresh();
      if (user && order.placedBy !== user.id && order.status !== 'pending') {
        setPendingCount((c) => Math.max(0, c - 1));
      }
      // 对方接单/完成时推送状态变化
      if (user && order.placedBy === user.id && order.status && order.status !== 'pending') {
        const statusText = { accepted: '已接单', preparing: '开始准备', done: '已完成' }[order.status] || '更新了订单';
        pushSystemNotification({
          title: '订单' + statusText,
          body: `你的订单 #${order.id} 对方${statusText}`,
          id: 2000 + Number(order.id || 0),
          data: {
            path: `/app/orders/${order.id}`,
          },
        });
      }
    };
    s.on('order:new', onNew);
    s.on('order:updated', onUpdated);
    return () => {
      s.off('order:new', onNew);
      s.off('order:updated', onUpdated);
    };
  }, [user, refresh, socketReady]);

  // 订单页读完后重置红点（由 Orders 页触发）
  useEffect(() => {
    const handler = () => setPendingCount(0);
    window.addEventListener('co:orders-viewed', handler);
    return () => window.removeEventListener('co:orders-viewed', handler);
  }, []);

  // 长按底部「菜单」按钮 → 呼出管理入口（隐藏入口）
  const startPress = (to) => {
    if (to !== '/app/menu') return;
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true; // 阻止松手时的导航
      if (navigator.vibrate) navigator.vibrate(30);
      setManageOpen(true);
      // 引导只需操作一次：长按成功即记录，不再提示
      localStorage.setItem(GUIDE_KEY, '1');
      setShowGuide(false);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimerRef.current);

  // 首次使用引导：在菜单页提示一次长按入口
  const isMenuPage = location.pathname.startsWith('/app/menu');
  useEffect(() => {
    if (!isMenuPage) return;
    if (!localStorage.getItem(GUIDE_KEY)) setShowGuide(true);
  }, [isMenuPage]);
  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem(GUIDE_KEY, '1');
  };

  const goManage = () => {
    setManageOpen(false);
    navigate('/app/menu', { state: { manage: true } });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-cream">
      <main className={`flex-1 ${isMenuPage ? 'pb-0' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-peach bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="flex h-16">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              draggable={false}
              onPointerDown={() => startPress(to)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                // 长按已呼出管理弹窗：忽略这次点击，避免误导航
                if (suppressClickRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  suppressClickRef.current = false;
                }
              }}
              className={({ isActive }) =>
                `relative flex flex-1 select-none flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                  isActive ? 'font-semibold text-rose' : 'text-latte'
                }`
              }
            >
              {/* 选中态胶囊背景：切换时平滑滑动 */}
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-bg"
                      className="absolute inset-x-4 inset-y-2 rounded-2xl bg-blush/70"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="relative flex flex-col items-center gap-0.5">
                    <span className="relative">
                      <img src={icon} alt="" draggable="false" className={`h-8 w-8 object-contain transition-transform ${isActive ? 'scale-110' : ''}`} />
                      {to === '/app/orders' && pendingCount > 0 && (
                        <span className="animate-pulse-dot absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-bold text-white">
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      )}
                    </span>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 新订单提示条：全局显示，点击跳转订单页，叉号独立可关闭 */}
      <AnimatePresence>
        {!dismissed && pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-x-0 top-0 z-50 mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+1rem)]"
          >
            <div className="flex items-center overflow-hidden rounded-2xl bg-gradient-to-r from-coral to-rose shadow-soft">
              <button
                onClick={() => {
                  setDismissed(true);
                  navigate('/app/orders');
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-white"
              >
                <IconBell className="h-5 w-5 shrink-0 animate-pulse" />
                <span className="truncate">有 {pendingCount} 个新订单待接单</span>
              </button>
              <button
                onClick={() => setDismissed(true)}
                aria-label="关闭新订单提示"
                className="flex h-full items-center px-3 text-white/80 transition-colors hover:text-white active:scale-90"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 首次使用引导：长按「菜单」按钮可进入管理 */}
      <AnimatePresence>
        {isMenuPage && showGuide && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            className="fixed inset-x-0 z-40 mx-auto max-w-md px-4"
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-coral to-rose p-4 text-white shadow-soft">
              {/* 装饰光斑 */}
              <span className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
              <span className="pointer-events-none absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-white/10" />

              <div className="relative flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
                  <IconEdit className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug">发现隐藏入口 ✨</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/90">
                    长按底部「菜单」按钮约 1 秒，即可呼出「管理菜单」
                  </p>
                </div>
              </div>

              <button
                onClick={dismissGuide}
                className="relative mt-3.5 w-full rounded-xl bg-white py-2.5 text-xs font-bold text-rose shadow-sm transition-transform active:scale-95"
              >
                我知道了
              </button>
              <span className="absolute -bottom-1.5 left-[16.5%] h-3 w-3 rotate-45 bg-rose" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 管理入口小浮层：长按「菜单」按钮后，出现在按钮上方 */}
      <AnimatePresence>
        {manageOpen && (
          <>
            {/* 点击任意处关闭 */}
            <div className="fixed inset-0 z-40" onClick={() => setManageOpen(false)} />
            <div
              className="fixed inset-x-0 z-50 mx-auto max-w-md px-4"
              style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
            >
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="relative w-48 rounded-xl bg-white p-1.5 shadow-soft ring-1 ring-peach"
              >
                <button
                  onClick={goManage}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-cocoa transition-colors hover:bg-blush active:scale-[0.97]"
                >
                  <IconEdit className="h-4 w-4 text-coral" />
                  进入管理菜单
                </button>
                {/* 小箭头指向「菜单」按钮 */}
                <span className="absolute -bottom-1.5 left-[24%] h-3 w-3 rotate-45 bg-white" />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}