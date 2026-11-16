import { Platform } from 'react-native';
let configured = false;

type NativeNotifications = typeof import('expo-notifications');

async function loadNativeNotifications(): Promise<{
  notifications: NativeNotifications;
  device: typeof import('expo-device');
} | null> {
  if (Platform.OS === 'web') return null;
  const [notifications, device] = await Promise.all([
    import('expo-notifications'),
    import('expo-device'),
  ]);
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  return { notifications, device };
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return ensureWebNotificationPermission();
  }
  try {
    const native = await loadNativeNotifications();
    if (!native || !native.device.isDevice) return false;
    const { status: existing } = await native.notifications.getPermissionsAsync();
    if (existing === 'granted') {
      configured = true;
      return true;
    }
    const { status } = await native.notifications.requestPermissionsAsync();
    configured = status === 'granted';
    return configured;
  } catch {
    return false;
  }
}

export async function ensureWebNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  try {
    if (Notification.permission === 'granted') {
      configured = true;
      return true;
    }
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    configured = result === 'granted';
    return configured;
  } catch {
    return false;
  }
}

export function getWebNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (Platform.OS !== 'web') return 'unsupported';
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function sendLocalNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') {
    sendWebNotification(title, body);
    return;
  }
  if (!configured) {
    const ok = await ensureNotificationPermissions();
    if (!ok) return;
  }
  try {
    const native = await loadNativeNotifications();
    if (!native) return;
    await native.notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: native.notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch {
    // silently ignore — notifications are a convenience, not critical
  }
}

export function sendWebNotification(title: string, body: string): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const notif = new Notification(title, {
      body,
      icon: '/assets/images/icon.png',
      tag: 'sms-incoming',
      requireInteraction: false,
    });
    setTimeout(() => notif.close(), 8000);
  } catch {
    // ignore
  }
}
