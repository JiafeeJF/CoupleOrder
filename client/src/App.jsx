import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from './auth.jsx';
import { useToast } from './ToastContext.jsx';
import { getSocket } from './socket.js';
import { Protected, PairRequired, GuestOnly } from './components/Protected.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Pairing from './pages/Pairing.jsx';
import Menu from './pages/Menu.jsx';
import Orders from './pages/Orders.jsx';
import Profile from './pages/Profile.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import { STATUS } from './constants.js';
import { useConfirm } from './ConfirmContext.jsx';
import { ensureNotificationPermission, needsExactAlarmGuidance, openExactAlarmSetting } from './utils/notify.js';

export default function App() {
  const { user, socketReady, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  // 原生端首次启动即申请通知权限，不依赖登录状态。
  // 通知权限授予后，若 Android 12+ 尚未授权「精确闹钟」，弹一次提示引导，
  // 说明原因并由用户决定是否开启（开启后通知即时送达、无延迟）。
  useEffect(() => {
    const run = async () => {
      const KEY = 'co_exact_alarm_prompted';
      if (localStorage.getItem(KEY)) return; // 已询问过一次，不再打扰
      const perm = await ensureNotificationPermission();
      if (perm !== 'granted') return;
      const needExact = await needsExactAlarmGuidance();
      if (needExact) {
        const ok = await confirm({
          title: '开启即时通知',
          message:
            '允许使用「闹钟与提醒」权限后，新订单、订单进度、评分和菜单更新等消息会即时送达，不受延迟。\n\n不开启也不影响接收通知，只是系统可能延迟几分钟推送。',
          confirmText: '去授权',
          cancelText: '暂不开启',
        });
        localStorage.setItem(KEY, '1');
        if (ok) openExactAlarmSetting();
      }
    };
    run();
  }, [confirm]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady) return;

    const onNewOrder = (order) => {
      toast(`${order.placedByName} 点单了，快去接单吧！`);
    };
    const onOrderUpdated = (order) => {
      toast(`订单 #${order.id} 状态更新为「${STATUS[order.status]?.label}」`);
    };
    const onPairBound = ({ user: partner }) => {
      toast(`你已和 ${partner.name} 配对成功！`);
      pushSystemNotification({
        title: '配对成功 🎉',
        body: `你已和 ${partner.name} 配对成功，快去点餐吧`,
        id: 4001,
        data: { path: '/app/menu' },
      });
      refresh();
    };
    const onProfileUpdated = () => {
      refresh();
    };

    s.on('order:new', onNewOrder);
    s.on('order:updated', onOrderUpdated);
    s.on('pair:bound', onPairBound);
    s.on('profile:updated', onProfileUpdated);
    return () => {
      s.off('order:new', onNewOrder);
      s.off('order:updated', onOrderUpdated);
      s.off('pair:bound', onPairBound);
      s.off('profile:updated', onProfileUpdated);
    };
  }, [toast, user, socketReady, refresh]);

  // 点击系统通知 → 跳转到对应页面（仅原生端）。data.path 在发送通知时写入。
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onAction = ({ notification }) => {
      const path = notification?.data?.path;
      if (path && path.startsWith('/')) navigate(path);
    };
    LocalNotifications.addListener('localNotificationActionPerformed', onAction);
    return () => {
      LocalNotifications.removeAllListeners();
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/pairing" element={<Protected><Pairing /></Protected>} />

      <Route
        path="/app"
        element={
          <Protected>
            <PairRequired>
              <Layout />
            </PairRequired>
          </Protected>
        }
      >
        <Route index element={<Navigate to="/app/menu" replace />} />
        <Route path="menu" element={<Menu />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* 结算详情页：全屏专注，无底部导航 */}
      <Route
        path="/checkout"
        element={
          <Protected>
            <PairRequired>
              <Checkout />
            </PairRequired>
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}