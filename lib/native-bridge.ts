import { Platform, NativeModules } from 'react-native';

export interface NativeBusinessHoursConfig {
  autoMode: boolean;
  enableAutoReply: boolean;
  enableCallRejection: boolean;
  enableDnd: boolean;
  enableSmsMonitoring: boolean;
  enableWhatsappMonitoring: boolean;
  openMessage: string;
  closedMessage: string;
  greetingMessage: string;
  autoReplyCooldownMinutes: number;
  days: Record<number, { enabled: boolean; openTime: string; closeTime: string }>;
  keywordReplies: { active: boolean; reply: string; keywords: string[] }[];
  telecomSales: { simNumber: string; companyName: string }[];
  telecomCompanies: { id: string; name: string }[];
  bundles: { id: string; companyId: string; companyName: string; name: string; price: number; durationDays: number; active: boolean }[];
}

export function syncBusinessHoursToNative(config: NativeBusinessHoursConfig): void {
  if (Platform.OS === 'web') return;
  try {
    const module = NativeModules.BusinessHoursNative;
    if (!module) return;
    module.syncConfig(config);
  } catch {
    // native module not available
  }
}

export async function setNativeSupabaseCredentialsV2(url: string, accessToken: string, userId: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // Store the user's authenticated access token so native services (SMS gateway,
    // screenshot observer, WhatsApp listener) can make RLS-protected Supabase calls.
    // Native code reads this as "supabase_anon_key" from SharedPreferences.
    const module = NativeModules.BusinessHoursNative;
    if (module?.setSupabaseCredentials) {
      module.setSupabaseCredentials(url, accessToken, userId);
    }
    const ssModule = NativeModules.ScreenshotNative;
    if (ssModule?.setSupabaseCredentials) {
      ssModule.setSupabaseCredentials(url, accessToken);
    }
    return true;
  } catch {
    return false;
  }
}

export async function replyToWhatsAppNotification(recipient: string, message: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const module = NativeModules.WhatsAppReply;
    if (!module?.replyToWhatsApp) return false;
    const result = await module.replyToWhatsApp(recipient, message);
    return result === true;
  } catch {
    return false;
  }
}

export async function setSmsGatewayEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const module = NativeModules.BusinessHoursNative;
    if (module?.setSmsGatewayEnabled) {
      module.setSmsGatewayEnabled(enabled);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

export async function setDoNotDisturb(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { success: false, error: 'غير مدعوم على الويب' };
  }
  try {
    const module = NativeModules.BusinessHoursNative;
    if (!module) {
      return { success: false, error: 'وحدة أصلية غير متوفرة' };
    }
    const result = await new Promise<string>((resolve) => {
      module.setDoNotDisturb(enabled, resolve);
    });
    if (result === 'ok') return { success: true };
    if (result === 'NO_DND_PERMISSION') {
      return { success: false, error: 'يجب منح إذن الوصول إلى إعدادات عدم الإزعاج من إعدادات الجهاز' };
    }
    return { success: false, error: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

// ---- Screenshot Detection (Android native) ----

export function isScreenshotDetectionSupported(): boolean {
  return Platform.OS === 'android';
}

export function startScreenshotDetection(): void {
  if (!isScreenshotDetectionSupported()) return;
  try {
    const module = NativeModules.ScreenshotNative;
    if (!module) return;
    module.startService();
  } catch {
    // native module not available
  }
}

export function stopScreenshotDetection(): void {
  if (!isScreenshotDetectionSupported()) return;
  try {
    const module = NativeModules.ScreenshotNative;
    if (!module) return;
    module.stopService();
  } catch {
    // native module not available
  }
}

export async function isScreenshotDetectionRunning(): Promise<boolean> {
  if (!isScreenshotDetectionSupported()) return false;
  try {
    const module = NativeModules.ScreenshotNative;
    if (!module) return false;
    return await new Promise<boolean>((resolve) => {
      module.isServiceRunning((result: boolean) => resolve(result));
    });
  } catch {
    return false;
  }
}

export function setNativeSupabaseCredentials(url: string, accessToken: string): void {
  if (Platform.OS === 'web') return;
  try {
    const module = NativeModules.ScreenshotNative;
    if (!module) return;
    module.setSupabaseCredentials(url, accessToken);
  } catch {
    // native module not available
  }
}

// ---- Contacts (Android native + Web Contact Picker API) ----

export interface DeviceContact {
  name: string;
  phone: string;
}

export function isContactsSupported(): boolean {
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return 'contacts' in navigator && 'ContactsManager' in window;
  }
  return false;
}

export async function hasContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const module = NativeModules.ContactsNative;
      if (!module) return false;
      return await new Promise<boolean>((resolve) => {
        module.hasPermission((result: boolean) => resolve(result));
      });
    } catch {
      return false;
    }
  }
  if (Platform.OS === 'web') {
    // Web Contact Picker API doesn't require pre-granted permission
    return isContactsSupported();
  }
  return false;
}

export async function getDeviceContacts(): Promise<DeviceContact[]> {
  if (Platform.OS === 'android') {
    return new Promise<DeviceContact[]>((resolve) => {
      try {
        const module = NativeModules.ContactsNative;
        if (!module) {
          resolve([]);
          return;
        }
        module.getContacts((error: string | null, contacts: DeviceContact[]) => {
          if (error) {
            resolve([]);
            return;
          }
          resolve(contacts ?? []);
        });
      } catch {
        resolve([]);
      }
    });
  }
  if (Platform.OS === 'web' && isContactsSupported()) {
    try {
      const navigatorAny = navigator as any;
      const props = ['name', 'tel'];
      const result = await navigatorAny.contacts.select(props, { multiple: true });
      const contacts: DeviceContact[] = [];
      if (result && Array.isArray(result)) {
        for (const entry of result) {
          const name = Array.isArray(entry.name) ? entry.name[0] : entry.name;
          const tel = Array.isArray(entry.tel) ? entry.tel[0] : entry.tel;
          if (name && tel) {
            contacts.push({ name: String(name), phone: String(tel) });
          }
        }
      }
      return contacts;
    } catch {
      return [];
    }
  }
  return [];
}

export function createSmsAppShortcut(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.SmsShortcut;
      if (!module) {
        resolve(false);
        return;
      }
      module.createSmsShortcut()
        .then(() => resolve(true))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function hasSmsAppShortcut(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.SmsShortcut;
      if (!module) {
        resolve(false);
        return;
      }
      module.hasSmsShortcut()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function isDefaultSmsApp(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve(false);
        return;
      }
      module.isDefaultSmsApp()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function hasSmsPermissions(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module?.hasSmsPermissions) {
        resolve(false);
        return;
      }
      module.hasSmsPermissions()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function requestSmsPermissions(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module?.requestSmsPermissions) {
        resolve(false);
        return;
      }
      module.requestSmsPermissions()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function requestDefaultSmsApp(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve(false);
        return;
      }
      module.requestDefaultSmsApp()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export interface InboxSms {
  id: string;
  address: string;
  body: string;
  date: number;
  type: number;
  read: number;
  uri: string;
}

export function readInboxSms(limit: number = 50): Promise<InboxSms[]> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve([]);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve([]);
        return;
      }
      module.readInboxSms(limit)
        .then((result: InboxSms[]) => resolve(result ?? []))
        .catch(() => resolve([]));
    } catch {
      resolve([]);
    }
  });
}

export function deleteInboxSms(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve(false);
        return;
      }
      module.deleteSms(uri)
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function markInboxSmsRead(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve(false);
        return;
      }
      module.markSmsRead(uri)
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function deleteSmsThread(threadId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.DefaultSmsModule;
      if (!module) {
        resolve(false);
        return;
      }
      module.deleteThread(threadId)
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

// ---- Dual SIM support ----

export interface SimInfo {
  subscriptionId: number;
  simSlotIndex: number;
  carrierName: string;
  displayName: string;
  iccId: string;
}

export async function getSimInfo(): Promise<SimInfo[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const module = NativeModules.SmsSender;
    if (!module?.getSimInfo) return [];
    const result = await module.getSimInfo();
    return (result ?? []) as SimInfo[];
  } catch {
    return [];
  }
}

export async function sendSmsWithSim(phone: string, message: string, subscriptionId: number): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { success: false, error: 'غير مدعوم على الويب' };
  }
  try {
    const module = NativeModules.SmsSender;
    if (!module) {
      return { success: false, error: 'وحدة SMS غير مثبتة' };
    }
    if (module.sendSmsWithSimPromise) {
      const result = await module.sendSmsWithSimPromise(phone, message, subscriptionId);
      return { success: result === true || result === 'sent' };
    }
    // Fallback to default send
    if (module.sendSmsPromise) {
      const result = await module.sendSmsPromise(phone, message);
      return { success: result === true || result === 'sent' };
    }
    return { success: false, error: 'طريقة الإرسال غير متوفرة' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

// ---- Call Screening (Android API 29+) ----

export function isCallScreeningSupported(): boolean {
  return Platform.OS === 'android';
}

export function isCallScreeningRoleHeld(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.CallScreeningNative;
      if (!module) {
        resolve(false);
        return;
      }
      module.isCallScreeningRoleHeld()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

export function requestCallScreeningRole(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }
    try {
      const module = NativeModules.CallScreeningNative;
      if (!module) {
        resolve(false);
        return;
      }
      module.requestCallScreeningRole()
        .then((result: boolean) => resolve(result))
        .catch(() => resolve(false));
    } catch {
      resolve(false);
    }
  });
}
