import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, NativeModules, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { replyToWhatsAppNotification } from './native-bridge';
import { supabase } from './supabase';

const GATEWAY_ACTIVE_KEY = 'sahab_sms_gateway_active';
const POLL_INTERVAL_MS = 15000;
const MAX_ATTEMPTS = 3;

export interface SmsOutboxRow {
  id: string;
  event_id: string;
  phone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  sent_at: string | null;
}

export interface SmsGatewayStatus {
  active: boolean;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  sending: boolean;
}

const initialState: SmsGatewayStatus = {
  active: false,
  pendingCount: 0,
  sentCount: 0,
  failedCount: 0,
  lastError: null,
  sending: false,
};

export async function sendSmsAuto(phone: string, message: string, subscriptionId?: number): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return enqueueSmsOutbox(phone, message);
  }
  try {
    const SmsModule = NativeModules.SmsSender;
    if (!SmsModule) {
      return { success: false, error: 'وحدة SMS غير مثبتة في التطبيق — تأكد من بناء التطبيق كـ APK مخصص' };
    }
    // If subscription ID provided and the dedicated method exists, use it
    if (subscriptionId !== undefined && subscriptionId >= 0 && SmsModule.sendSmsWithSimPromise) {
      const result = await SmsModule.sendSmsWithSimPromise(phone, message, subscriptionId);
      return { success: result === true || result === 'sent' };
    }
    if (SmsModule.sendSmsPromise) {
      const result = await SmsModule.sendSmsPromise(phone, message);
      return { success: result === true || result === 'sent' };
    }
    if (SmsModule.sendSms) {
      return await new Promise<{ success: boolean; error?: string }>((resolve) => {
        try {
          SmsModule.sendSms(phone, message, (result: unknown) => {
            if (result === true || result === 'sent') {
              resolve({ success: true });
            } else if (result === 'PERMISSION_DENIED') {
              resolve({ success: false, error: 'لم يتم منح إذن إرسال الرسائل' });
            } else {
              const msg = typeof result === 'string' ? result : 'فشل الإرسال';
              resolve({ success: false, error: msg });
            }
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          resolve({ success: false, error: msg });
        }
      });
    }
    return { success: false, error: 'طريقة إرسال الرسائل غير متوفرة' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function enqueueSmsOutbox(phone: string, message: string): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    const eventId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await supabase
      .from('sync_events')
      .insert({
        event_id: eventId,
        event_type: 'manual_reply',
        payload: { phone, message, source: 'inbox' },
        phone,
        message,
        source: 'web',
      });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, eventId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export interface OutboxStatusRow {
  event_id: string;
  status: 'pending' | 'sent' | 'failed';
  last_error: string | null;
}

export async function fetchOutboxStatuses(eventIds: string[]): Promise<Record<string, OutboxStatusRow>> {
  if (eventIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('sms_outbox')
      .select('event_id, status, last_error')
      .in('event_id', eventIds);
    if (error || !data) return {};
    const map: Record<string, OutboxStatusRow> = {};
    for (const row of data as OutboxStatusRow[]) {
      map[row.event_id] = row;
    }
    return map;
  } catch {
    return {};
  }
}

export async function sendWhatsappAuto(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (Platform.OS === 'android') {
      const repliedFromNotification = await replyToWhatsAppNotification(phone, message);
      if (repliedFromNotification) return { success: true };
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(message);
    // Try the native WhatsApp app protocol first — it opens directly into the
    // conversation with the message pre-filled, no browser redirect.
    const nativeUrl = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
    const canOpenNative = await Linking.canOpenURL(nativeUrl);
    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
      return { success: true };
    }
    // Fallback to wa.me (browser redirect) if native app not detected
    const webUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (!canOpenWeb) {
      return { success: false, error: 'واتس أب غير متوفر على هذا الجهاز' };
    }
    await Linking.openURL(webUrl);
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function sendWhatsappBatch(
  messages: { phone: string; message: string }[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const item of messages) {
    const result = await sendWhatsappAuto(item.phone, item.message);
    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${item.phone}: ${result.error ?? 'فشل'}`);
    }
  }
  return { sent, failed, errors };
}

export async function sendNotificationAuto(phone: string, message: string): Promise<void> {
  void sendSmsAuto(phone, message);
  void sendWhatsappAuto(phone, message);
}

export type MessageChannel = 'sms' | 'whatsapp';

export interface ImportedSms {
  id: string;
  address: string;
  body: string;
  date: number;
  direction: 'inbound' | 'outbound';
  read: boolean;
}

export async function importDeviceSms(): Promise<{ success: boolean; messages?: ImportedSms[]; error?: string; count?: number }> {
  if (Platform.OS === 'web') {
    return { success: false, error: 'استيراد الرسائل يعمل فقط على أندرويد' };
  }
  try {
    const SmsReader = NativeModules.SmsReader;
    if (!SmsReader) {
      return { success: false, error: 'وحدة قراءة الرسائل غير مثبتة — تأكد من بناء التطبيق كـ APK مخصص' };
    }
    const messages = await SmsReader.importAllSms();
    if (!messages || !Array.isArray(messages)) {
      return { success: false, error: 'لم يتم العثور على رسائل' };
    }
    return { success: true, messages: messages as ImportedSms[], count: messages.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export async function hasReadSmsPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const SmsReader = NativeModules.SmsReader;
    if (!SmsReader) return false;
    return await SmsReader.hasReadPermission();
  } catch {
    return false;
  }
}export async function sendMessageByChannel(phone: string, message: string, channel: MessageChannel): Promise<{ success: boolean; error?: string }> {
  if (channel === 'whatsapp') {
    const waResult = await sendWhatsappAuto(phone, message);
    if (waResult.success) return waResult;
    const smsResult = await sendSmsAuto(phone, message);
    if (smsResult.success) return smsResult;
    return waResult;
  }
  return sendSmsAuto(phone, message);
}

export function isSupplierOrAgentPhone(phone: string, suppliers: { phone: string }[], subAgents: { phone: string }[]): boolean {
  const normalized = phone.replace(/[^0-9]/g, '');
  for (const s of suppliers) {
    if (s.phone.replace(/[^0-9]/g, '') === normalized) return true;
  }
  for (const a of subAgents) {
    if (a.phone.replace(/[^0-9]/g, '') === normalized) return true;
  }
  return false;
}

export interface UnifiedSendResult {
  sms: { success: boolean; error?: string };
  whatsapp: { success: boolean; error?: string };
}

export async function sendUnifiedMessage(phone: string, message: string): Promise<UnifiedSendResult> {
  const [smsResult, waResult] = await Promise.all([
    sendSmsAuto(phone, message),
    sendWhatsappAuto(phone, message),
  ]);
  return {
    sms: smsResult,
    whatsapp: waResult,
  };
}

export function useSmsGateway() {
  const [status, setStatus] = useState<SmsGatewayStatus>(initialState);
  const activeRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('sms_outbox')
      .select('status')
      .in('status', ['pending', 'sent', 'failed']);
    if (error || !data) {
      setStatus((prev) => ({ ...prev }));
      return;
    }
    let pending = 0, sent = 0, failed = 0;
    for (const row of data as { status: string }[]) {
      if (row.status === 'pending') pending++;
      else if (row.status === 'sent') sent++;
      else if (row.status === 'failed') failed++;
    }
    setStatus((prev) => ({
      ...prev,
      pendingCount: pending,
      sentCount: sent,
      failedCount: failed,
    }));
  }, []);

  const processOutbox = useCallback(async () => {
    if (!activeRef.current) return;

    const { data, error } = await supabase
      .from('sms_outbox')
      .select('id, event_id, phone, message, status, attempts')
      .eq('status', 'pending')
      .is('claimed_at', null)
      .order('created_at', { ascending: true })
      .limit(5);

    if (error || !data || data.length === 0) {
      await loadCounts();
      return;
    }

    setStatus((prev) => ({ ...prev, sending: true }));

    for (const row of data as SmsOutboxRow[]) {
      if (!activeRef.current) break;

      // Atomically claim the row — prevents duplicate sends when the Java gateway is also running
      const { data: claimed, error: claimErr } = await supabase
        .from('sms_outbox')
        .update({ claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .is('claimed_at', null)
        .select('id');

      if (claimErr || !claimed || claimed.length === 0) {
        continue;
      }

      const { success, error: sendError } = await sendSmsAuto(row.phone, row.message);

      if (success) {
        await supabase
          .from('sms_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', row.id);
      } else {
        const nextAttempts = (row.attempts ?? 0) + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          await supabase
            .from('sms_outbox')
            .update({ status: 'failed', attempts: nextAttempts, last_error: sendError ?? 'فشل الإرسال' })
            .eq('id', row.id);
        } else {
          await supabase
            .from('sms_outbox')
            .update({ attempts: nextAttempts, last_error: sendError ?? 'فشل الإرسال' })
            .eq('id', row.id);
        }
        setStatus((prev) => ({ ...prev, lastError: sendError ?? 'فشل الإرسال' }));
      }
    }

    setStatus((prev) => ({ ...prev, sending: false }));
    await loadCounts();
  }, [loadCounts]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    await AsyncStorage.setItem(GATEWAY_ACTIVE_KEY, '1');
    setStatus((prev) => ({ ...prev, active: true, lastError: null }));
    void processOutbox();
    pollingRef.current = setInterval(() => {
      void processOutbox();
    }, POLL_INTERVAL_MS);
  }, [processOutbox]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    await AsyncStorage.removeItem(GATEWAY_ACTIVE_KEY);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setStatus((prev) => ({ ...prev, active: false, sending: false }));
  }, []);

  const retryFailed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('sms_outbox').update({ status: 'pending', attempts: 0, last_error: null }).eq('status', 'failed').eq('user_id', user.id);
    if (activeRef.current) void processOutbox();
    await loadCounts();
  }, [processOutbox, loadCounts]);

  useEffect(() => {
    void (async () => {
      const stored = await AsyncStorage.getItem(GATEWAY_ACTIVE_KEY);
      if (stored === '1') {
        void start();
      }
      await loadCounts();
    })();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [start, loadCounts]);

  return { status, start, stop, retryFailed, refreshCounts: loadCounts };
}
