import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CRED_KEY = 'sahab_saved_credentials';
const BIOMETRIC_ENABLED_KEY = 'sahab_biometric_enabled';

export interface SavedCredentials {
  phone: string;
  password: string;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<'fingerprint' | 'face' | 'iris' | 'none'> {
  if (Platform.OS === 'web') return 'none';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return 'fingerprint';
  } catch {
    return 'fingerprint';
  }
}

export async function saveCredentials(phone: string, password: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CRED_KEY, JSON.stringify({ phone, password }));
  } catch {
    // storage write failed
  }
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  try {
    const raw = await AsyncStorage.getItem(CRED_KEY);
    if (raw) return JSON.parse(raw) as SavedCredentials;
  } catch {
    // storage read failed
  }
  return null;
}

export async function clearCredentials(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRED_KEY);
    await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  } catch {
    // storage delete failed
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // storage write failed
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'استخدم البصمة لتسجيل الدخول',
      fallbackLabel: 'استخدام كلمة المرور',
      cancelLabel: 'إلغاء',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function tryBiometricLogin(): Promise<SavedCredentials | null> {
  const enabled = await isBiometricEnabled();
  if (!enabled) return null;
  const available = await isBiometricAvailable();
  if (!available) return null;
  const creds = await getSavedCredentials();
  if (!creds) return null;
  const success = await authenticateWithBiometric();
  if (!success) return null;
  return creds;
}
