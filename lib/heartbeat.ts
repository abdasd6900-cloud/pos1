import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type ConnectionSide = 'android' | 'web';
export type ConnectionStatus = 'online' | 'offline' | 'unknown';

export interface ConnectionInfo {
  androidOnline: boolean;
  webOnline: boolean;
  androidLastSeen: string | null;
  webLastSeen: string | null;
  selfOnline: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30000;
const STALE_THRESHOLD_MS = 90000;
const WEB_DEVICE_ID = 'web-dashboard';
const ANDROID_DEVICE_ID = 'android-phone';

function isStale(lastSeen: string | null): boolean {
  if (!lastSeen) return true;
  const diff = Date.now() - new Date(lastSeen).getTime();
  return diff > STALE_THRESHOLD_MS;
}

export function useConnectionStatus() {
  const [info, setInfo] = useState<ConnectionInfo>({
    androidOnline: false,
    webOnline: false,
    androidLastSeen: null,
    webLastSeen: null,
    selfOnline: false,
  });
  const [selfStatus, setSelfStatus] = useState<ConnectionStatus>('unknown');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      const deviceId = Platform.OS === 'android' ? ANDROID_DEVICE_ID : WEB_DEVICE_ID;
      const deviceType = Platform.OS === 'android' ? 'android' : 'web';

      const { error } = await supabase
        .from('device_heartbeats')
        .upsert({
          device_id: deviceId,
          device_type: deviceType,
          last_seen: new Date().toISOString(),
        });

      if (!error) {
        setSelfStatus('online');
      }
    } catch {
      setSelfStatus('offline');
    }
  }, []);

  const checkConnections = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('device_heartbeats')
        .select('device_id, device_type, last_seen')
        .in('device_id', [ANDROID_DEVICE_ID, WEB_DEVICE_ID]);

      if (error || !data) return;

      let androidLastSeen: string | null = null;
      let webLastSeen: string | null = null;

      for (const row of data) {
        if (row.device_id === ANDROID_DEVICE_ID) {
          androidLastSeen = row.last_seen;
        } else if (row.device_id === WEB_DEVICE_ID) {
          webLastSeen = row.last_seen;
        }
      }

      const androidOnline = !isStale(androidLastSeen);
      const webOnline = !isStale(webLastSeen);
      const selfDevice = Platform.OS === 'android' ? ANDROID_DEVICE_ID : WEB_DEVICE_ID;
      const selfLastSeen = selfDevice === ANDROID_DEVICE_ID ? androidLastSeen : webLastSeen;
      const selfOnline = !isStale(selfLastSeen);

      setInfo({
        androidOnline,
        webOnline,
        androidLastSeen,
        webLastSeen,
        selfOnline,
      });
    } catch {
      // keep last known state
    }
  }, []);

  useEffect(() => {
    void sendHeartbeat();
    void checkConnections();

    heartbeatRef.current = setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    pollingRef.current = setInterval(() => {
      void checkConnections();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [sendHeartbeat, checkConnections]);

  return { info, selfStatus, refresh: checkConnections };
}

export { ANDROID_DEVICE_ID, WEB_DEVICE_ID, STALE_THRESHOLD_MS };
