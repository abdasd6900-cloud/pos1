import { Platform } from 'react-native';
import type { LicenseInfo, ActivationResult, LicensePlan, SubscriptionStatus } from '@/types';
import { storage } from './storage';

const SECRET_SALT = 'S4HB_P0S_2026_L1C3NS3_K3Y';

export function generateDeviceFingerprint(): string {
  const components = [
    Platform.OS,
    Platform.Version?.toString() ?? 'unknown',
    'bolt-pos-device',
    Date.now().toString(36),
  ];
  const raw = components.join('|') + SECRET_SALT;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'DEV-' + Math.abs(hash).toString(36).toUpperCase() + '-' + raw.length.toString(36).toUpperCase();
}

export function createInitialLicense(trialDays: number): LicenseInfo {
  const now = Date.now();
  return {
    deviceFingerprint: generateDeviceFingerprint(),
    installDate: now,
    trialStartDate: now,
    trialDays,
    status: 'trial',
    plan: null,
    activatedAt: null,
    expiresAt: now + trialDays * 86400000,
    lastSeenTimestamp: now,
    activationKey: null,
    tamperDetected: false,
  };
}

export function evaluateLicense(license: LicenseInfo): LicenseInfo {
  const now = Date.now();
  const dayMs = 86400000;

  // Anti-tampering: check if clock was moved backward
  if (now < license.lastSeenTimestamp - 60000) {
    return {
      ...license,
      tamperDetected: true,
      status: 'locked',
      lastSeenTimestamp: now,
    };
  }

  // Check expiry
  const expiry = license.expiresAt ?? (license.trialStartDate + license.trialDays * dayMs);

  if (now > expiry) {
    return {
      ...license,
      status: license.activatedAt ? 'expired' : 'expired',
      lastSeenTimestamp: now,
    };
  }

  // If was locked but now time is valid again, restore
  if (license.tamperDetected && now >= license.lastSeenTimestamp) {
    return {
      ...license,
      tamperDetected: false,
      status: now > expiry ? 'expired' : (license.activatedAt ? 'active' : 'trial'),
      lastSeenTimestamp: now,
    };
  }

  return {
    ...license,
    lastSeenTimestamp: now,
  };
}

export function generateActivationKey(
  deviceFingerprint: string,
  plan: LicensePlan,
  durationDays: number,
): string {
  const expiry = Date.now() + durationDays * 86400000;
  const payload = `${deviceFingerprint}|${plan}|${expiry}|${SECRET_SALT}`;

  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);

  const expiryEncoded = expiry.toString(36).toUpperCase();
  const planCode = plan === 'monthly' ? 'M' : plan === 'yearly' ? 'Y' : 'L';
  const durationCode = durationDays.toString(36).toUpperCase().padStart(2, '0').slice(0, 2);

  return `${planCode}${durationCode}-${expiryEncoded}-${hashStr}`;
}

export function validateActivationKey(
  key: string,
  deviceFingerprint: string,
): ActivationResult {
  try {
    const parts = key.trim().toUpperCase().split('-');
    if (parts.length !== 3) {
      return { success: false, message: 'صيغة الكود غير صحيحة', newExpiry: null };
    }

    const [planDuration, expiryEncoded, hashStr] = parts;
    const planCode = planDuration[0];
    const durationStr = planDuration.slice(1);

    const plan: LicensePlan | null =
      planCode === 'M' ? 'monthly' :
      planCode === 'Y' ? 'yearly' :
      planCode === 'L' ? 'lifetime' : null;

    if (!plan) {
      return { success: false, message: 'نوع الاشتراك غير صحيح', newExpiry: null };
    }

    const expiry = parseInt(expiryEncoded, 36);
    if (!expiry || expiry < Date.now()) {
      return { success: false, message: 'انتهت صلاحية كود التفعيل', newExpiry: null };
    }

    // Reconstruct and verify hash
    const durationDays = Math.ceil((expiry - Date.now()) / 86400000);
    const expectedKey = generateActivationKey(deviceFingerprint, plan, durationDays);
    const expectedParts = expectedKey.split('-');
    const expectedHash = expectedParts[2];

    if (hashStr !== expectedHash) {
      return { success: false, message: 'كود التفعيل غير صالح لهذا الجهاز', newExpiry: null };
    }

    return {
      success: true,
      message: `تم التفعيل بنجاح - ${plan === 'monthly' ? 'اشتراك شهري' : plan === 'yearly' ? 'اشتراك سنوي' : 'ترخيص مدى الحياة'}`,
      newExpiry: expiry,
    };
  } catch {
    return { success: false, message: 'كود تفعيل غير صحيح', newExpiry: null };
  }
}

export function applyActivation(
  license: LicenseInfo,
  key: string,
  plan: LicensePlan,
  newExpiry: number,
): LicenseInfo {
  return {
    ...license,
    status: 'active',
    plan,
    activatedAt: Date.now(),
    expiresAt: plan === 'lifetime' ? null : newExpiry,
    activationKey: key,
    tamperDetected: false,
    lastSeenTimestamp: Date.now(),
  };
}

export function getLicenseStatusText(status: SubscriptionStatus): string {
  switch (status) {
    case 'trial': return 'فترة تجريبية';
    case 'active': return 'فعّال';
    case 'expired': return 'منتهي الصلاحية';
    case 'locked': return 'مقفل (تلاعب بالتاريخ)';
  }
}

export function getDaysRemaining(license: LicenseInfo): number {
  if (license.status === 'active' && license.plan === 'lifetime') return 9999;
  const expiry = license.expiresAt ?? (license.trialStartDate + license.trialDays * 86400000);
  const remaining = Math.ceil((expiry - Date.now()) / 86400000);
  return Math.max(0, remaining);
}

export function getExpiryReminderDays(license: LicenseInfo): number[] {
  const days = getDaysRemaining(license);
  if (days <= 0) return [0];
  if (days <= 1) return [1, 0];
  if (days <= 3) return [3, 1, 0];
  return [3, 1, 0];
}

export function generateExpirySms(
  storeName: string,
  ownerName: string,
  daysRemaining: number,
  expiryDate: number,
): string {
  if (daysRemaining <= 0) {
    return `عزيزي ${ownerName || 'المشترك'}،\nانتهى اشتراكك في تطبيق ${storeName}.\nيرجى التجديد لمواصلة استخدام النظام.\nللاستفسار: اتصل بالمزود`;
  }
  return `عزيزي ${ownerName || 'المشترك'}،\nينتهي اشتراكك في تطبيق ${storeName} خلال ${daysRemaining} يوم.\nتاريخ الانتهاء: ${new Date(expiryDate).toLocaleDateString('ar')}\nيرجى التجديد لتجنب انقطاع الخدمة`;
}

export async function getOrCreateLicense(trialDays: number): Promise<LicenseInfo> {
  const existing = await storage.getLicense();
  if (existing) {
    return evaluateLicense(existing);
  }
  const fresh = createInitialLicense(trialDays);
  await storage.saveLicense(fresh);
  return fresh;
}

export function isReadOnly(license: LicenseInfo | null): boolean {
  if (!license) return false;
  return license.status === 'expired' || license.status === 'locked';
}

export function isTrialActive(license: LicenseInfo | null): boolean {
  if (!license) return false;
  return license.status === 'trial';
}
