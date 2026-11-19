import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { SmsInbox } from '@/components/SmsInbox';
import { ThemeContext } from '@/lib/theme-context';
import type { Palette } from '@/lib/color-system';
import { useApp } from '@/lib/app-context';

const msgPalette: { light: Palette; dark: Palette } = {
  light: {
    bg: '#F0F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#E8EDF3',
    primary: '#2563EB',
    primaryLight: '#3B82F6',
    primaryDark: '#1D4ED8',
    accent: '#7C3AED',
    accentLight: '#A78BFA',
    danger: '#DC2626',
    dangerLight: '#FCA5A5',
    success: '#16A34A',
    successLight: '#86EFAC',
    warning: '#F59E0B',
    warningLight: '#FCD34D',
    info: '#0EA5E9',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#CBD5E1',
    shadow: 'rgba(15, 30, 60, 0.08)',
    tabActive: '#2563EB',
    tabInactive: '#94A3B8',
  },
  dark: {
    bg: '#0B1120',
    surface: '#161E2E',
    surfaceAlt: '#1E293B',
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',
    accent: '#A78BFA',
    accentLight: '#C4B5FD',
    danger: '#F87171',
    dangerLight: '#7F1D1D',
    success: '#4ADE80',
    successLight: '#166534',
    warning: '#FBBF24',
    warningLight: '#78350F',
    info: '#38BDF8',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: '#1E293B',
    shadow: 'rgba(0, 0, 0, 0.4)',
    tabActive: '#3B82F6',
    tabInactive: '#64748B',
  },
};

function MsgThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const baseTheme = settings?.theme ?? 'light';
  const [override, setOverride] = useState<'light' | 'dark' | null>(null);
  const theme = override ?? baseTheme;
  const colors = useMemo(() => msgPalette[theme], [theme]);
  const isDark = theme === 'dark';
  const toggleTheme = useCallback(() => {
    setOverride((prev) => {
      const current = prev ?? baseTheme;
      return current === 'light' ? 'dark' : 'light';
    });
  }, [baseTheme]);

  const value = useMemo(() => ({ theme, colors, isDark, toggleTheme }), [theme, colors, isDark, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

function MessagesAppInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const initialPhone = typeof params.phone === 'string' && params.phone.length > 0 ? params.phone : null;

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace('/(tabs)/index'); } }} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowRight size={22} color="#FFFFFF" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الرسائل</Text>
      </View>
      <View style={styles.inboxWrap}>
        <SmsInbox initialPhone={initialPhone} />
      </View>
    </View>
  );
}

export default function MessagesAppScreen() {
  return (
    <MsgThemeProvider>
      <MessagesAppInner />
    </MsgThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: '#2563EB',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontFamily: 'Cairo-Bold',
    color: '#FFFFFF',
  },
  inboxWrap: { flex: 1 },
});
