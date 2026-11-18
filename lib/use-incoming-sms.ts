import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { sendWebNotification } from '@/lib/notifications';
import { useAuth } from '@/lib/auth-context';

export interface IncomingSms {
  id: string;
  rowId: number;
  eventType: string;
  senderPhone: string;
  senderName: string;
  message: string;
  simNumber: string | null;
  source: string | null;
  timestamp: number;
  receivedAt: number;
}

interface SmsEventRow {
  id: number;
  event_type: string;
  sender_phone: string;
  sender_name: string | null;
  message: string;
  sim_number: string | null;
  source: string | null;
  channel: string | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 15000;
const BATCH_LIMIT = 20;
const MAX_PROCESSED_IDS = 500;
const processedIdsRef = new Set<number>();

export function useIncomingSms() {
  const { session } = useAuth();
  const [incoming, setIncoming] = useState<IncomingSms | null>(null);
  const [queue, setQueue] = useState<IncomingSms[]>([]);

  const pollForNewEvents = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('sms_inbox_events')
        .select('id, event_type, sender_phone, sender_name, message, sim_number, source, channel, created_at')
        .eq('processed', false)
        .order('created_at', { ascending: true })
        .limit(BATCH_LIMIT);

      if (error || !data || data.length === 0) return;

      const rows = data as SmsEventRow[];
      const newEvents: IncomingSms[] = [];
      const newIds: number[] = [];

      for (const row of rows) {
        if (processedIdsRef.has(row.id)) continue;
        processedIdsRef.add(row.id);
        newIds.push(row.id);

        newEvents.push({
          id: `evt_${row.id}`,
          rowId: row.id,
          eventType: row.event_type,
          senderPhone: row.sender_phone,
          senderName: row.sender_name ?? '',
          message: row.message,
          simNumber: row.sim_number,
          source: row.source,
          timestamp: new Date(row.created_at).getTime(),
          receivedAt: Date.now(),
        });
      }

      if (newIds.length === 0) return;

      // Mark events as processed
      await supabase
        .from('sms_inbox_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .in('id', newIds);

      // Trim processedIdsRef to prevent unbounded growth
      if (processedIdsRef.size > MAX_PROCESSED_IDS) {
        const toRemove = processedIdsRef.size - MAX_PROCESSED_IDS / 2;
        let removed = 0;
        for (const id of processedIdsRef) {
          if (removed >= toRemove) break;
          processedIdsRef.delete(id);
          removed++;
        }
      }

      // Show web notification for ALL incoming messages (not just customer replies)
      if (Platform.OS === 'web') {
        for (const evt of newEvents) {
          const title = evt.senderName
            ? `رسالة من ${evt.senderName}`
            : `رسالة من ${evt.senderPhone}`;
          const isBusiness = evt.eventType === 'customerReply' || evt.eventType === 'transaction' || evt.eventType === 'esim';
          const body = isBusiness ? `[عمل] ${evt.message}` : evt.message;
          sendWebNotification(title, body, isBusiness);
        }
      }

      setQueue((prev) => [...prev, ...newEvents]);
    } catch {
      // ignore polling errors
    }
  }, [session]);

  // Also set up realtime subscription for instant delivery
  useEffect(() => {
    if (!session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime subscription for instant delivery (works on both web and native)
    try {
      channel = supabase
        .channel('sms_inbox_events_rt')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'sms_inbox_events' },
          () => {
            void pollForNewEvents();
          },
        )
        .subscribe();
    } catch {
      // realtime unavailable — polling will handle it
    }

    const interval = setInterval(() => {
      void pollForNewEvents();
    }, POLL_INTERVAL_MS);

    // Initial poll on mount
    void pollForNewEvents();

    return () => {
      clearInterval(interval);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
      }
    };
  }, [pollForNewEvents, session]);

  useEffect(() => {
    if (!incoming && queue.length > 0) {
      setIncoming(queue[0]);
      setQueue((prev) => prev.slice(1));
    }
  }, [incoming, queue]);

  const dismiss = useCallback(() => {
    setIncoming(null);
  }, []);

  return { currentMessage: incoming, queueLength: queue.length, dismiss };
}
