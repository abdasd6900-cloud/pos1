import { Platform, NativeModules } from 'react-native';
import { getLayanRechargeConfig } from './recharge-config';

/**
 * Layan Telecom portal automation — drives a hidden WebView on Android to log in
 * and perform recharge operations automatically on layan-t.net.
 *
 * Unlike Sky which uses TOTP, Layan sends a verification code via WhatsApp.
 * The flow is two-phase:
 *   1. executeLayanLogin() — enters username + password, triggers WhatsApp code
 *   2. executeLayanRechargeWithCode() — enters the WhatsApp code, then performs the recharge
 */

export interface LayanCredentials {
  username: string;
  password: string;
}

export interface LayanRechargeParams {
  phoneNumber: string;
  packageType: 'normal' | 'offer';
  durationKey: string;
}

export interface LayanLoginResult {
  success: boolean;
  error?: string | null;
  step?: string;
  message?: string;
  url?: string;
}

export interface LayanRechargeResult {
  success: boolean;
  error?: string | null;
  url?: string;
  step?: string;
  rawResult?: string;
}

export interface LayanSessionInfo {
  loggedIn: boolean;
}

const LAYAN_SETTINGS_KEY = 'sahab_layan_credentials';

export function isLayanAutomationSupported(): boolean {
  return Platform.OS === 'android';
}

async function loadCredentials(): Promise<LayanCredentials | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(LAYAN_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayanCredentials;
    if (!parsed.username || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLayanCredentials(creds: LayanCredentials): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(LAYAN_SETTINGS_KEY, JSON.stringify(creds));
}

export async function getLayanCredentials(): Promise<LayanCredentials | null> {
  return loadCredentials();
}

export async function clearLayanCredentials(): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.removeItem(LAYAN_SETTINGS_KEY);
}

export async function hasLayanCredentials(): Promise<boolean> {
  const creds = await loadCredentials();
  return creds !== null;
}

/**
 * Phase 1: Logs into Layan portal with username + password.
 * This triggers a WhatsApp verification code to be sent.
 * The caller must then obtain the code (from WhatsApp notifications)
 * and pass it to executeLayanRechargeWithCode().
 */
export async function executeLayanLogin(): Promise<LayanLoginResult> {
  if (!isLayanAutomationSupported()) {
    return { success: false, error: 'الأتمتة تعمل فقط على أجهزة الأندرويد' };
  }

  const creds = await loadCredentials();
  if (!creds) {
    return { success: false, error: 'لم يتم إعداد بيانات دخول ليان. يرجى إضافتها من الإعدادات' };
  }

  try {
    const module = NativeModules.LayanRecharge;
    if (!module?.executeLogin) {
      return { success: false, error: 'وحدة ليان غير متوفرة في هذا الجهاز' };
    }

    const config = await getLayanRechargeConfig();

    const result = await module.executeLogin(
      creds.username,
      creds.password,
      config.portalUrl,
      config.pageLoadDelay,
      config.loginDelay
    );
    return {
      success: result?.success === true,
      error: result?.error ?? null,
      step: result?.step ?? undefined,
      message: result?.message ?? undefined,
      url: result?.url ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

/**
 * Phase 2: Submits the WhatsApp verification code and executes the full recharge sequence:
 *   1. Enter code → code validation
 *   2. Search for phone number → select from dropdown
 *   3. Click "تمديد الرقم" (extend)
 *   4. Select package type (normal/offer) + duration
 *   5. Click "التالي" (next) → "موافق" (ok)
 */
export async function executeLayanRechargeWithCode(
  verificationCode: string,
  params: LayanRechargeParams
): Promise<LayanRechargeResult> {
  if (!isLayanAutomationSupported()) {
    return { success: false, error: 'الأتمتة تعمل فقط على أجهزة الأندرويد' };
  }

  if (!verificationCode.trim()) {
    return { success: false, error: 'يرجى إدخال كود التحقق المرسل عبر واتساب' };
  }

  try {
    const module = NativeModules.LayanRecharge;
    if (!module?.executeRechargeWithCode) {
      return { success: false, error: 'وحدة ليان غير متوفرة في هذا الجهاز' };
    }

    const config = await getLayanRechargeConfig();

    const result = await module.executeRechargeWithCode(
      verificationCode.trim(),
      params.phoneNumber,
      params.packageType,
      params.durationKey,
      config.rechargeDelay
    );

    return {
      success: result?.success === true,
      error: result?.error ?? null,
      url: result?.url ?? undefined,
      step: result?.step ?? undefined,
      rawResult: result?.rawResult ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function checkLayanSession(): Promise<LayanSessionInfo> {
  if (!isLayanAutomationSupported()) return { loggedIn: false };
  try {
    const module = NativeModules.LayanRecharge;
    if (!module?.checkSession) return { loggedIn: false };
    const result = await module.checkSession();
    return { loggedIn: result?.loggedIn === true };
  } catch {
    return { loggedIn: false };
  }
}

export async function logoutLayan(): Promise<boolean> {
  if (!isLayanAutomationSupported()) return false;
  try {
    const module = NativeModules.LayanRecharge;
    if (!module?.logout) return false;
    await module.logout();
    return true;
  } catch {
    return false;
  }
}

export function clearLayanSession(): void {
  if (!isLayanAutomationSupported()) return;
  try {
    const module = NativeModules.LayanRecharge;
    if (!module?.clearSession) return;
    module.clearSession();
  } catch {
    // ignore
  }
}
