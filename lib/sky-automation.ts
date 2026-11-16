import { Platform, NativeModules } from 'react-native';
import { generateTOTP } from './totp';
import { getSkyRechargeConfig, type RechargeConfig } from './recharge-config';

/**
 * Sky 5G portal automation — drives a hidden WebView on Android to log in
 * and perform recharge operations automatically. The TOTP code is generated
 * locally from the stored secret, so no manual entry from ente Auth is needed.
 */

export interface SkyCredentials {
  username: string;
  password: string;
  totpSecret: string;
}

export interface SkyRechargeParams {
  phoneNumber: string;
  durationKey: string;
}

export interface SkyRechargeResult {
  success: boolean;
  error?: string | null;
  url?: string;
  step?: string;
  rawResult?: string;
}

export interface SkySessionInfo {
  loggedIn: boolean;
}

const SKY_SETTINGS_KEY = 'sahab_sky_credentials';

export function isSkyAutomationSupported(): boolean {
  return Platform.OS === 'android';
}

async function loadCredentials(): Promise<SkyCredentials | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(SKY_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SkyCredentials;
    if (!parsed.username || !parsed.password || !parsed.totpSecret) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSkyCredentials(creds: SkyCredentials): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(SKY_SETTINGS_KEY, JSON.stringify(creds));
}

export async function getSkyCredentials(): Promise<SkyCredentials | null> {
  return loadCredentials();
}

export async function clearSkyCredentials(): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.removeItem(SKY_SETTINGS_KEY);
}

export async function hasSkyCredentials(): Promise<boolean> {
  const creds = await loadCredentials();
  return creds !== null;
}

/**
 * Generates the current TOTP code from the stored secret (if set).
 */
export async function generateSkyTotpCode(): Promise<{ code: string; secondsRemaining: number } | null> {
  const creds = await loadCredentials();
  if (!creds?.totpSecret) return null;
  try {
    const code = await generateTOTP(creds.totpSecret);
    const { totpSecondsRemaining } = await import('./totp');
    const secondsRemaining = totpSecondsRemaining();
    return { code, secondsRemaining };
  } catch {
    return null;
  }
}

/**
 * Checks whether the WebView session is still logged in.
 */
export async function checkSkySession(): Promise<SkySessionInfo> {
  if (!isSkyAutomationSupported()) return { loggedIn: false };
  try {
    const module = NativeModules.SkyRecharge;
    if (!module?.checkSession) return { loggedIn: false };
    const result = await module.checkSession();
    return { loggedIn: result?.loggedIn === true };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Logs out and clears the Sky portal session.
 */
export async function logoutSky(): Promise<boolean> {
  if (!isSkyAutomationSupported()) return false;
  try {
    const module = NativeModules.SkyRecharge;
    if (!module?.logout) return false;
    await module.logout();
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears all Sky session data (cookies, cache, history).
 */
export function clearSkySession(): void {
  if (!isSkyAutomationSupported()) return;
  try {
    const module = NativeModules.SkyRecharge;
    if (!module?.clearSession) return;
    module.clearSession();
  } catch {
    // ignore
  }
}

/**
 * Executes the full recharge sequence:
 * 1. Load Sky portal in hidden WebView
 * 2. Auto-login with credentials and generated TOTP code
 * 3. Search for phone number
 * 4. Click recharge, select duration, confirm twice
 *
 * @returns The result of the operation with success/failure status
 */
export async function executeSkyRecharge(params: SkyRechargeParams): Promise<SkyRechargeResult> {
  if (!isSkyAutomationSupported()) {
    return { success: false, error: 'الأتمتة تعمل فقط على أجهزة الأندرويد' };
  }

  const creds = await loadCredentials();
  if (!creds) {
    return { success: false, error: 'لم يتم إعداد بيانات دخول سكاي. يرجى إضافتها من الإعدادات' };
  }

  let totpCode = '';
  if (creds.totpSecret) {
    try {
      totpCode = await generateTOTP(creds.totpSecret);
    } catch {
      return { success: false, error: 'المفتاح السري غير صالح. تأكد من إدخاله بصيغة Base32 الصحيحة' };
    }
  }

  try {
    const module = NativeModules.SkyRecharge;
    if (!module?.executeRechargeSequence) {
      return { success: false, error: 'وحدة سكاي غير متوفرة في هذا الجهاز' };
    }

    const config = await getSkyRechargeConfig();

    const result = await module.executeRechargeSequence(
      creds.username,
      creds.password,
      totpCode,
      params.phoneNumber,
      params.durationKey,
      config.portalUrl,
      config.pageLoadDelay,
      config.loginDelay,
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
