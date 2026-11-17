import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const DEVICE_KEY = 'sahab_sync_device_id';
const LAST_PULL_KEY = 'sahab_sync_last_pull';

export type SyncCollectionName =
  | 'products'
  | 'customers'
  | 'transactions'
  | 'settings'
  | 'auditLog'
  | 'suppliers'
  | 'expenses'
  | 'shifts'
  | 'drafts'
  | 'currencies'
  | 'staff'
  | 'promotions'
  | 'stocktakes'
  | 'attachments'
  | 'telecomCompanies'
  | 'simCards'
  | 'bundles'
  | 'subAgents'
  | 'debtReminders'
  | 'telecomSales'
  | 'agentBundles'
  | 'simLocations'
  | 'simLocationStock'
  | 'telecomSuppliers'
  | 'shipments'
  | 'rechargeRequests'
  | 'businessHours'
  | 'keywordReplies'
  | 'pendingOperations'
  | 'freezeRequests'
  | 'customerReplies'
  | 'supportTickets'
  | 'unrecognizedMessages'
  | 'transferNotifications'
  | 'transferReports'
  | 'nameMappings'
  | 'customerFiles'
  | 'smsMessages'
  | 'phoneNumbers';

type SyncData = Record<string, unknown> | unknown[];

interface DataSyncRow {
  collection: string;
  data: SyncData;
  updated_at: string;
  updated_by: string | null;
  user_id: string | null;
}

type RemoteChangeHandler = (collection: SyncCollectionName, data: SyncData) => void;

let deviceId: string | null = null;
let subscriptionActive = false;
let changeHandler: RemoteChangeHandler | null = null;
const pushedTimestamps = new Map<string, string>();

async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) {
    deviceId = existing;
    return existing;
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_KEY, id);
  deviceId = id;
  return id;
}

export async function pushCollection(collection: SyncCollectionName, data: SyncData): Promise<void> {
  try {
    const did = await getDeviceId();
    const now = new Date().toISOString();
    pushedTimestamps.set(collection, now);

    const { error } = await supabase.from('data_sync').upsert(
      {
        collection,
        data: data as Record<string, unknown>,
        updated_at: now,
        updated_by: did,
      },
      { onConflict: 'collection,user_id' },
    );

    if (error) {
      console.error('pushCollection error', collection, error.message);
    }
  } catch (e) {
    console.error('pushCollection error', collection, e);
  }
}

export async function pullAllCollections(): Promise<Partial<Record<SyncCollectionName, SyncData>>> {
  try {
    await getDeviceId();
    const { data, error } = await supabase
      .from('data_sync')
      .select('collection, data, updated_at, updated_by, user_id');

    if (error || !data) return {};

    const result: Partial<Record<SyncCollectionName, SyncData>> = {};
    const latestByCollection = new Map<string, DataSyncRow>();
    for (const row of data as DataSyncRow[]) {
      if (!isSyncCollectionName(row.collection)) continue;
      const existing = latestByCollection.get(row.collection);
      if (!existing || row.updated_at > existing.updated_at) {
        latestByCollection.set(row.collection, row);
      }
    }
    for (const [collection, row] of latestByCollection) {
      if (row.updated_by === deviceId) {
        pushedTimestamps.set(collection, row.updated_at);
        continue;
      }
      result[collection as SyncCollectionName] = row.data;
    }

    await AsyncStorage.setItem(LAST_PULL_KEY, new Date().toISOString());
    return result;
  } catch (e) {
    console.error('pullAllCollections error', e);
    return {};
  }
}

function isSyncCollectionName(value: string): value is SyncCollectionName {
  return [
    'products', 'customers', 'transactions', 'settings', 'auditLog',
    'suppliers', 'expenses', 'shifts', 'drafts', 'currencies',
    'staff', 'promotions', 'stocktakes', 'attachments',
    'telecomCompanies', 'simCards', 'bundles', 'subAgents',
    'debtReminders', 'telecomSales',
    'agentBundles', 'simLocations', 'simLocationStock',
    'telecomSuppliers', 'shipments', 'rechargeRequests',
    'businessHours', 'keywordReplies', 'pendingOperations',
    'freezeRequests', 'customerReplies', 'supportTickets',
    'unrecognizedMessages', 'transferNotifications', 'transferReports', 'nameMappings', 'customerFiles', 'smsMessages', 'phoneNumbers',
  ].includes(value);
}

export async function pullCollection(collection: SyncCollectionName): Promise<SyncData | null> {
  try {
    const { data, error } = await supabase
      .from('data_sync')
      .select('data, updated_at, updated_by, user_id')
      .eq('collection', collection)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as DataSyncRow;
    if (row.updated_by === deviceId) {
      pushedTimestamps.set(collection, row.updated_at);
    }
    return row.data;
  } catch (e) {
    console.error('pullCollection error', collection, e);
    return null;
  }
}

const POLL_INTERVAL_MS = 30000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTimestamp: string | null = null;

async function pollForChanges(handler: RemoteChangeHandler): Promise<void> {
  try {
    await getDeviceId();
    const { data, error } = await supabase
      .from('data_sync')
      .select('collection, data, updated_at, updated_by')
      .order('updated_at', { ascending: false });

    if (error || !data) return;

    const latestByCollection = new Map<string, DataSyncRow>();
    for (const row of data as DataSyncRow[]) {
      if (!isSyncCollectionName(row.collection)) continue;
      const existing = latestByCollection.get(row.collection);
      if (!existing || row.updated_at > existing.updated_at) {
        latestByCollection.set(row.collection, row);
      }
    }

    let latestTimestamp = lastPollTimestamp;

    for (const [collection, row] of latestByCollection) {
      if (row.updated_by === deviceId) {
        pushedTimestamps.set(collection, row.updated_at);
        continue;
      }
      if (lastPollTimestamp && row.updated_at <= lastPollTimestamp) continue;

      handler(collection as SyncCollectionName, row.data);

      if (!latestTimestamp || row.updated_at > latestTimestamp) {
        latestTimestamp = row.updated_at;
      }
    }

    lastPollTimestamp = latestTimestamp;
  } catch (e) {
    console.warn('Poll sync error', e);
  }
}

export function startRealtimeSync(handler: RemoteChangeHandler): () => void {
  if (subscriptionActive) return () => {};
  changeHandler = handler;
  subscriptionActive = true;

  if (Platform.OS === 'web') {
    // Web: realtime is noop'd, use polling instead
    void pollForChanges(handler);
    pollTimer = setInterval(() => {
      void pollForChanges(handler);
    }, POLL_INTERVAL_MS);

    return () => {
      subscriptionActive = false;
      changeHandler = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  }

  // Android: use realtime AND polling as backup
  let channel: ReturnType<typeof supabase.channel> | null = null;

  try {
    channel = supabase
      .channel('data_sync_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_sync' },
        (payload) => {
          const row = payload.new as DataSyncRow | undefined;
          if (!row || !isSyncCollectionName(row.collection)) return;

          if (row.updated_by === deviceId) {
            pushedTimestamps.set(row.collection, row.updated_at);
            return;
          }

          changeHandler?.(row.collection, row.data);
        },
      )
      .subscribe();
  } catch (e) {
    console.warn('Realtime sync unavailable', e);
  }

  // Also poll as backup (realtime may drop on mobile networks)
  void pollForChanges(handler);
  pollTimer = setInterval(() => {
    void pollForChanges(handler);
  }, POLL_INTERVAL_MS);

  return () => {
    subscriptionActive = false;
    changeHandler = null;
    if (channel) {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export async function getDeviceIdSync(): Promise<string> {
  return getDeviceId();
}
