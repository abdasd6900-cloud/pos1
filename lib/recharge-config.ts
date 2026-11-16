/**
 * Shared recharge automation configuration — used by Sky, Layan, and Areen.
 * Each integration stores its own config alongside its credentials in AsyncStorage.
 * These values are user-editable in each integration's settings modal and are
 * passed to the native Android WebView automation module at execution time.
 */

export interface RechargeConfig {
  /** Portal URL to load in the WebView */
  portalUrl: string;
  /** Delay (ms) to wait for initial page load before injecting login JS */
  pageLoadDelay: number;
  /** Delay (ms) to wait for login to complete before proceeding to recharge */
  loginDelay: number;
  /** Delay (ms) to wait for recharge steps to complete before collecting result */
  rechargeDelay: number;
}

export const DEFAULT_SKY_CONFIG: RechargeConfig = {
  portalUrl: 'https://sales-ps.sky5g.ps/',
  pageLoadDelay: 4000,
  loginDelay: 6000,
  rechargeDelay: 8000,
};

export const DEFAULT_LAYAN_CONFIG: RechargeConfig = {
  portalUrl: 'https://www.layan-t.net/index.html',
  pageLoadDelay: 4000,
  loginDelay: 8000,
  rechargeDelay: 5000,
};

export const DEFAULT_AREEN_CONFIG: RechargeConfig = {
  portalUrl: 'https://agents.areen.net/AreenWeb.dll',
  pageLoadDelay: 4000,
  loginDelay: 6000,
  rechargeDelay: 10000,
};

const SKY_CONFIG_KEY = 'sahab_sky_recharge_config';
const LAYAN_CONFIG_KEY = 'sahab_layan_recharge_config';
const AREEN_CONFIG_KEY = 'sahab_areen_recharge_config';

async function loadConfig(key: string, defaults: RechargeConfig): Promise<RechargeConfig> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<RechargeConfig>;
    return {
      portalUrl: parsed.portalUrl || defaults.portalUrl,
      pageLoadDelay: typeof parsed.pageLoadDelay === 'number' ? parsed.pageLoadDelay : defaults.pageLoadDelay,
      loginDelay: typeof parsed.loginDelay === 'number' ? parsed.loginDelay : defaults.loginDelay,
      rechargeDelay: typeof parsed.rechargeDelay === 'number' ? parsed.rechargeDelay : defaults.rechargeDelay,
    };
  } catch {
    return defaults;
  }
}

async function saveConfig(key: string, config: RechargeConfig): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(key, JSON.stringify(config));
}

async function clearConfig(key: string): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.removeItem(key);
}

// ---- Sky ----
export async function getSkyRechargeConfig(): Promise<RechargeConfig> {
  return loadConfig(SKY_CONFIG_KEY, DEFAULT_SKY_CONFIG);
}
export async function saveSkyRechargeConfig(config: RechargeConfig): Promise<void> {
  return saveConfig(SKY_CONFIG_KEY, config);
}
export async function clearSkyRechargeConfig(): Promise<void> {
  return clearConfig(SKY_CONFIG_KEY);
}

// ---- Layan ----
export async function getLayanRechargeConfig(): Promise<RechargeConfig> {
  return loadConfig(LAYAN_CONFIG_KEY, DEFAULT_LAYAN_CONFIG);
}
export async function saveLayanRechargeConfig(config: RechargeConfig): Promise<void> {
  return saveConfig(LAYAN_CONFIG_KEY, config);
}
export async function clearLayanRechargeConfig(): Promise<void> {
  return clearConfig(LAYAN_CONFIG_KEY);
}

// ---- Areen ----
export async function getAreenRechargeConfig(): Promise<RechargeConfig> {
  return loadConfig(AREEN_CONFIG_KEY, DEFAULT_AREEN_CONFIG);
}
export async function saveAreenRechargeConfig(config: RechargeConfig): Promise<void> {
  return saveConfig(AREEN_CONFIG_KEY, config);
}
export async function clearAreenRechargeConfig(): Promise<void> {
  return clearConfig(AREEN_CONFIG_KEY);
}
