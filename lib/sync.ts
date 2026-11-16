import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const DEVICE_KEY = 'sahab_sync_device_id';

type SyncEventType = 'transaction' | 'telecom_sale';

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

export function buildTransactionMessage(
  transactionType: string,
  customerName: string,
  total: number,
  paid: number,
  remaining: number,
): string {
  const label = transactionType === 'return' ? 'مرتجع' : transactionType === 'payment' ? 'دفعة' : 'معاملة';
  return `عزيزي ${customerName || 'العميل'}، تم تسجيل ${label}. المبلغ: ${total.toFixed(2)}، المدفوع: ${paid.toFixed(2)}، المتبقي: ${remaining.toFixed(2)}. شكراً لكم`;
}

export async function publishSyncEvent(
  eventType: SyncEventType,
  payload: Record<string, unknown>,
  phone: string | null,
  message: string | null,
): Promise<boolean> {
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
    console.error('sync event publish failed', error);
    return false;
  }
  return true;
}
