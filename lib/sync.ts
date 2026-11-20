import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const DEVICE_KEY = 'sahab_sync_device_id';
const OFFLINE_QUEUE_KEY = 'sahab_sync_offline_queue';
const MAX_QUEUE_SIZE = 500;

type SyncEventType = 'transaction' | 'telecom_sale';

interface QueuedSyncEvent {
  eventType: SyncEventType;
  payload: Record<string, unknown>;
  phone: string | null;
  message: string | null;
  queuedAt: number;
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = createId();
  await AsyncStorage.setItem(DEVICE_KEY, id);
  return id;
}

async function getOfflineQueue(): Promise<QueuedSyncEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSyncEvent[]) : [];
  } catch {
    return [];
  }
}

async function saveOfflineQueue(queue: QueuedSyncEvent[]): Promise<void> {
  try {
    const trimmed = queue.slice(0, MAX_QUEUE_SIZE);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full — drop oldest
  }
}

export async function getOfflineQueueSize(): Promise<number> {
  const queue = await getOfflineQueue();
  return queue.length;
}

export async function flushOfflineSyncQueue(): Promise<{ flushed: number; remaining: number }> {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  let flushed = 0;
  const remaining: QueuedSyncEvent[] = [];
  for (const event of queue) {
    const success = await publishSyncEventDirect(event.eventType, event.payload, event.phone, event.message);
    if (success) {
      flushed++;
    } else {
      remaining.push(event);
    }
  }
  await saveOfflineQueue(remaining);
  return { flushed, remaining: remaining.length };
}

async function publishSyncEventDirect(
  eventType: SyncEventType,
  payload: Record<string, unknown>,
  phone: string | null,
  message: string | null,
): Promise<boolean> {
  try {
    const eventId = typeof payload.id === 'string' ? payload.id : createId();
    const source = Platform.OS === 'web' ? 'web' : 'android';
    const deviceId = await getDeviceId();
    const { error } = await supabase.from('sync_events').upsert(
      {
        event_id: eventId,
        event_type: eventType,
        payload: { ...payload, syncDeviceId: deviceId },
        phone,
        message,
        source,
      },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );

    if (error) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildTransactionMessage(
  transactionType: string,
  customerName: string,
  total: number,
  paid: number,
  remaining: number,
  phone?: string | null,
  totalDebt?: number,
): string {
  const label = transactionType === 'return' ? 'مرتجع' : transactionType === 'payment' ? 'دفعة' : 'معاملة';
  const debtToShow = totalDebt !== undefined && totalDebt > 0 ? totalDebt : remaining;
  let msg = `عزيزي ${customerName || 'العميل'}، تم تسجيل ${label}`;
  if (phone) msg += ` لرقم: ${phone}`;
  msg += `، المبلغ: ${total.toFixed(2)}، المدفوع: ${paid.toFixed(2)}، الاجمالي: ${debtToShow.toFixed(2)}`;
  msg += '، شكراً لثقتكم بنا';
  return msg;
}

export async function publishSyncEvent(
  eventType: SyncEventType,
  payload: Record<string, unknown>,
  phone: string | null,
  message: string | null,
): Promise<boolean> {
  const success = await publishSyncEventDirect(eventType, payload, phone, message);
  if (success) return true;

  // Failed — queue for later retry
  try {
    const queue = await getOfflineQueue();
    queue.unshift({ eventType, payload, phone, message, queuedAt: Date.now() });
    await saveOfflineQueue(queue);
    console.warn('sync event queued for offline retry', { queueSize: queue.length });
  } catch {
    // queue persistence failed
  }
  return false;
}
