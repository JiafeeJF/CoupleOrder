import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

let ready = false;

// 仅在原生端初始化本地通知；Web 端保持应用内提示
export async function initNativeNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    // 点击通知：跳转到对应页面（订单中心）
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const data = e.notification.extra || {};
      if (data.route) {
        // 交给 Layout 中的全局监听处理路由跳转
        window.dispatchEvent(new CustomEvent('co:native-notification-tap', { detail: data }));
      }
    });
    ready = true;
  } catch {
    /* 权限被拒或插件不可用时静默降级为应用内提示 */
  }
}

async function send(title, body, route) {
  if (!ready) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Date.now() % 2147483647,
          smallIcon: 'ic_launcher_foreground',
          iconColor: '#E8604C',
          extra: { route: route || '' },
        },
      ],
    });
  } catch {
    /* 通知失败不影响主流程 */
  }
}

export function notifyOrderNew(order) {
  if (!order || !order.placedByName || !order.items?.length) return;
  const first = order.items[0];
  const more = order.items.length > 1 ? ` 等 ${order.items.length} 道菜` : '';
  send('新订单来啦 🍽️', `${order.placedByName} 点了「${first.name}」${more}，快去接单`, '/app/orders');
}

export function notifyOrderUpdated(order, currentUserId) {
  if (!order) return;
  const isIncoming = order.placedBy !== currentUserId;
  // 只提示对方操作（自己操作自己页面有反馈）
  if (!isIncoming) return;
  if (order.status === 'accepted') {
    send('对方已接单 ✅', `TA 开始准备你的「${order.items?.[0]?.name || '订单'}」了`, '/app/orders');
  } else if (order.status === 'completed') {
    send('订单已完成 🎉', '快去查看订单详情吧', `/app/orders/${order.id}`);
  } else if (order.status === 'cancelled') {
    send('订单已取消', '有一笔订单被取消了', '/app/orders');
  }
}

export function notifyOrderRated(rated) {
  if (!rated || !rated.by) return;
  send('收到新评价 ⭐', 'TA 给订单留下了评价，去看看', '/app/orders');
}
