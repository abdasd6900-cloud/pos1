import { Platform, NativeModules } from 'react-native';
import { getAreenRechargeConfig } from './recharge-config';

/**
 * Areen Telecom portal automation — drives a hidden WebView on Android to log in
 * and perform recharge operations automatically on agents.areen.net.
 *
 * Areen sends a verification code via SMS on first login. The flow is two-phase:
 *   1. executeAreenLogin() — enters username + password, triggers SMS code
 *   2. executeAreenRechargeWithCode() — enters the SMS code, then performs the recharge
 */

export interface AreenCredentials {
  username: string;
  password: string;
}

export interface AreenRechargeParams {
  subscriptionNumber: string;
}

export interface AreenLoginResult {
  success: boolean;
  error?: string | null;
  step?: string;
  message?: string;
  url?: string;
}

export interface AreenRechargeResult {
  success: boolean;
  error?: string | null;
  url?: string;
  step?: string;
  routeNumber?: string | null;
  rawResult?: string;
}

export interface AreenSessionInfo {
  loggedIn: boolean;
}

const AREEN_SETTINGS_KEY = 'sahab_areen_credentials';

export function isAreenAutomationSupported(): boolean {
  return Platform.OS === 'android';
}

async function loadCredentials(): Promise<AreenCredentials | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(AREEN_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AreenCredentials;
    if (!parsed.username || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveAreenCredentials(creds: AreenCredentials): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(AREEN_SETTINGS_KEY, JSON.stringify(creds));
}

export async function getAreenCredentials(): Promise<AreenCredentials | null> {
  return loadCredentials();
}

export async function clearAreenCredentials(): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.removeItem(AREEN_SETTINGS_KEY);
}

export async function hasAreenCredentials(): Promise<boolean> {
  const creds = await loadCredentials();
  return creds !== null;
}

/**
 * Phase 1: Logs into Areen portal with username + password.
 * This triggers an SMS verification code to be sent to the registered phone.
 * The caller must then obtain the code (from SMS) and pass it to
 * executeAreenRechargeWithCode().
 */
export async function executeAreenLogin(): Promise<AreenLoginResult> {
  if (!isAreenAutomationSupported()) {
    return { success: false, error: 'الأتمتة تعمل فقط على أجهزة الأندرويد' };
  }

  const creds = await loadCredentials();
  if (!creds) {
    return { success: false, error: 'لم يتم إعداد بيانات دخول أرين. يرجى إضافتها من الإعدادات' };
  }

  try {
    const module = NativeModules.AreenRecharge;
    if (!module?.executeLogin) {
      return { success: false, error: 'وحدة أرين غير متوفرة في هذا الجهاز' };
    }

    const config = await getAreenRechargeConfig();

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
 * Phase 2: Submits the SMS verification code and executes the full recharge sequence:
 *   1. Enter code → code validation
 *   2. Enter subscription number in search field
 *   3. Click search to load subscription details
 *   4. Find route number (المسار) in details
 *   5. Enter route number as recharge amount
 *   6. Click charge (اشحن)
 */
export async function executeAreenRechargeWithCode(
  verificationCode: string,
  params: AreenRechargeParams
): Promise<AreenRechargeResult> {
  if (!isAreenAutomationSupported()) {
    return { success: false, error: 'الأتمتة تعمل فقط على أجهزة الأندرويد' };
  }

  if (!verificationCode.trim()) {
    return { success: false, error: 'يرجى إدخال كود التحقق المرسل عبر SMS' };
  }

  if (!params.subscriptionNumber.trim()) {
    return { success: false, error: 'يرجى إدخال رقم الاشتراك' };
  }

  try {
    const module = NativeModules.AreenRecharge;
    if (!module?.executeRechargeWithCode) {
      return { success: false, error: 'وحدة أرين غير متوفرة في هذا الجهاز' };
    }

    const config = await getAreenRechargeConfig();

    const result = await module.executeRechargeWithCode(
      verificationCode.trim(),
      params.subscriptionNumber.trim(),
      config.rechargeDelay
    );

    return {
      success: result?.success === true,
      error: result?.error ?? null,
      url: result?.url ?? undefined,
      step: result?.step ?? undefined,
      routeNumber: result?.routeNumber ?? undefined,
      rawResult: result?.rawResult ?? undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function checkAreenSession(): Promise<AreenSessionInfo> {
  if (!isAreenAutomationSupported()) return { loggedIn: false };
  try {
    const module = NativeModules.AreenRecharge;
    if (!module?.checkSession) return { loggedIn: false };
    const result = await module.checkSession();
    return { loggedIn: result?.loggedIn === true };
  } catch {
    return { loggedIn: false };
  }
}

export async function logoutAreen(): Promise<boolean> {
  if (!isAreenAutomationSupported()) return false;
  try {
    const module = NativeModules.AreenRecharge;
    if (!module?.logout) return false;
    await module.logout();
    return true;
  } catch {
    return false;
  }
}

export function clearAreenSession(): void {
  if (!isAreenAutomationSupported()) return;
  try {
    const module = NativeModules.AreenRecharge;
    if (!module?.clearSession) return;
    module.clearSession();
  } catch {
    // ignore
  }
}
