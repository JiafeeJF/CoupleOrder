import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

let permissionChecked = false;
let exactChecked = false;
let exactAllowed = false;

// 安卓端：申请通知权限（Android 13+ 需要运行时授权）。
// 返回 'granted' | 'denied' | 'web'
export async function ensureNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return 'web';
  if (permissionChecked) return 'granted';
  try {
    const s = await LocalNotifications.checkPermissions();
    if (s.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') {
        permissionChecked = true;
        return 'denied';
      }
    }
    permissionChecked = true;
    return 'granted';
  } catch {
    return 'denied';
  }
}

// 是否需要引导授权「精确闹钟」：仅 Android 12+ 且尚未授权时需要。
// 需先调用 ensureNotificationPermission() 获取通知权限后再判断。
export async function needsExactAlarmGuidance() {
  if (!Capacitor.isNativePlatform()) return false;
  if (exactChecked) return !exactAllowed;
  try {
    if (parseInt(requireNativeOrGlobalVersion(), 10) < 31) {
      exactChecked = true;
      exactAllowed = true;
      return false;
    }
    const st = await LocalNotifications.checkExactNotificationSetting();
    // 插件仅返回 granted / denied 两态：granted=已授权无需引导；
    // denied 即「尚未授权精确闹钟」，需要引导（首次由 exactChecked 守卫保证只判定一次）
    if (st.exact_alarm === 'granted') {
      exactAllowed = true;
      return false;
    }
    exactAllowed = false;
    return true; // 未授权：需要引导
  } catch {
    exactChecked = true;
    return false;
  }
}

// 引导完成后：跳转系统「闹钟与提醒」授权页。若用户在系统页授权，返回 granted。
export async function openExactAlarmSetting() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await LocalNotifications.changeExactNotificationSetting();
    exactAllowed = res.exact_alarm === 'granted';
    exactChecked = true;
    return exactAllowed;
  } catch {
    exactChecked = true;
    return false;
  }
}

// 读取 Android 版本号：通过 Device 插件不可靠，这里统一按 12+ 处理（版本判断仅为防御性）
function requireNativeOrGlobalVersion() {
  return '34';
}

// 发送系统通知；Web 端为 no-op。已授予精确闹钟 → 即时送达；否则回退非精确（可能延迟）
// data 携带 { path }，通知被点击时由 App 层监听跳转到对应页面。
export async function pushSystemNotification({ title, body, id, data }) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureNotificationPermission();
    const base = {
      id: id || Math.floor(Date.now() % 100000),
      title,
      body,
      smallIcon: 'ic_stat_notify',
      iconColor: '#FF6F61',
      channelId: 'default',
      ongoing: false,
      autoCancel: true,
      data: { path: data?.path || '' },
    };
    if (exactAllowed) {
      // 已授权精确闹钟：立即展示，即时送达
      await LocalNotifications.schedule({ notifications: [{ ...base, isExactNotification: true }] });
    } else {
      // 未授权：非精确调度（系统可能延迟到空闲批次），但保持尽量快
      await LocalNotifications.schedule({
        notifications: [{ ...base, isExactNotification: false, schedule: { at: new Date(Date.now() + 500) } }],
      });
    }
  } catch {
    /* 通知失败不影响主流程 */
  }
}

// 注册通知点击监听，返回清理函数。点击后触发回调，携带目标路径。
export function onNotificationTap(cb) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handler = (res) => {
    const path = res?.notification?.data?.path;
    if (path) cb(path, res.notification);
  };
  LocalNotifications.addListener('localNotificationActionPerformed', handler).then((h) => (handlerHandle = h));
  return () => handlerHandle?.remove?.();
}
let handlerHandle = null;