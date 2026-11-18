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
      console.warn('sync event publish failed', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('sync event publish failed', e);
    return false;
  }
}
