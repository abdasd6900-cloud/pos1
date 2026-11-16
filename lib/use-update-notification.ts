import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import { supabase } from './supabase';

const SEEN_VERSION_KEY = 'sahab_last_seen_version';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface AppUpdateInfo {
  id: string;
  version: string;
  title: string;
  description: string;
  created_at: string;
  is_active: boolean;
  apk_url: string | null;
  force_install: boolean;
}

export function useUpdateNotification() {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);

  const checkForUpdates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_updates')
        .select('id, version, title, description, created_at, is_active, apk_url, force_install')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return;

      const latest = data as AppUpdateInfo;
      const seenVersion = await AsyncStorage.getItem(SEEN_VERSION_KEY);

      if (latest.version !== seenVersion) {
        setUpdate(latest);
      } else {
        setUpdate(null);
      }
    } catch {
      // network error - silently skip
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    void checkForUpdates();
    const interval = setInterval(() => {
      void checkForUpdates();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  const dismissUpdate = useCallback(async () => {
    if (update) {
      await AsyncStorage.setItem(SEEN_VERSION_KEY, update.version);
    }
    setUpdate(null);
  }, [update]);

  const applyUpdate = useCallback(async () => {
    if (!update) return;

    // On Android with an APK URL, open the download link
    if (Platform.OS !== 'web' && update.apk_url) {
      const supported = await Linking.canOpenURL(update.apk_url);
      if (supported) {
        await Linking.openURL(update.apk_url);
        await AsyncStorage.setItem(SEEN_VERSION_KEY, update.version);
        setUpdate(null);
        return;
      }
    }

    // On web, reload the page to fetch the latest version
    await AsyncStorage.setItem(SEEN_VERSION_KEY, update.version);
    setUpdate(null);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [update]);

  return { update, dismissUpdate, applyUpdate, checkForUpdates };
}
