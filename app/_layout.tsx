import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments , SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { I18nManager, Linking, StyleSheet, Platform, AppState } from 'react-native';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AppProvider } from '@/lib/app-context';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LockScreen } from '@/components/LockScreen';
import { UpdateModal } from '@/components/UpdateModal';
import { IncomingSmsBanner } from '@/components/IncomingSmsBanner';
import { useUpdateNotification } from '@/lib/use-update-notification';
import { useIncomingSms } from '@/lib/use-incoming-sms';
import { startScreenshotDetection, setNativeSupabaseCredentials } from '@/lib/native-bridge';
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo';
import { supabase } from '@/lib/supabase';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const lastNavigationRef = useRef<number>(0);

  useEffect(() => {
    if (loading) return;
    const isInAuthGroup = segments[0] === 'login';
    const isPublicRoute = segments[0] === 'customer-view' || segments[0] === 'dealer';
    if (!session && !isInAuthGroup && !isPublicRoute) {
      router.replace('/login');
    } else if (session && isInAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  // When the app returns from background, Supabase may fire onAuthStateChange
  // with a refreshed token or null briefly during reconnection. Prevent
  // flicker/redirect by suppressing navigation for a short window after
  // returning to foreground.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        lastNavigationRef.current = Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  // Handle deep links from screenshot detection: sahabpos://screenshot/sim?phone=XXX&sim=YYY
  // or sahabpos://screenshot/transfer?amount=XXX&sender=YYY&recipient=ZZZ
  useEffect(() => {
    if (!session) return;

    const handleDeepLink = (url: string) => {
      try {
        const parsed = new URL(url);
        // Only accept our custom scheme
        if (parsed.protocol !== 'sahabpos:') return;

        const pathParts = parsed.pathname.split('/').filter(Boolean);

        // Shortcut: sahabpos://messages — open the messages tab directly
        if (pathParts[0] === 'messages') {
          router.replace('/messages-app');
          return;
        }

        if (pathParts[0] !== 'screenshot') return;

        const params = parsed.searchParams;
        const subType = pathParts[1];

        if (subType === 'sim') {
          const phone = (params.get('phone') ?? '').slice(0, 20);
          const sim = (params.get('sim') ?? '').slice(0, 20);
          // Sanitize: only allow digits, +, spaces, hyphens
          const sanitizePhone = (s: string) => s.replace(/[^0-9+\-\s]/g, '');
          const query = new URLSearchParams();
          if (phone) query.set('phone', sanitizePhone(phone));
          if (sim) query.set('sim', sanitizePhone(sim));
          router.replace(`/pos-telecom?${query.toString()}`);
        } else if (subType === 'transfer') {
          const amountStr = params.get('amount') ?? '';
          const amount = parseFloat(amountStr);
          const sender = (params.get('sender') ?? '').slice(0, 100);
          const recipient = (params.get('recipient') ?? '').slice(0, 100);
          const query = new URLSearchParams();
          if (!isNaN(amount) && amount > 0 && amount < 1e9) query.set('paymentAmount', amount.toFixed(2));
          if (sender) query.set('senderName', sender);
          if (recipient) query.set('recipientName', recipient);
          router.replace(`/suppliers?${query.toString()}`);
        }
      } catch {
        // invalid URL — ignore
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => sub.remove();
  }, [session, router]);

  return <>{children}</>;
}

const AUTO_LOCK_SECONDS = 30;

function AppShell() {
  const { isDark, colors } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const { update, applyUpdate, dismissUpdate } = useUpdateNotification();
  const { currentMessage, dismiss: dismissIncomingMessage } = useIncomingSms(session);
  const bgTimestampRef = useRef<number | null>(null);

  // Listen for notification taps (native only) — opens the relevant conversation
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let responseSub: { remove: () => void } | null = null;
    (async () => {
      try {
        const { default: Notifications } = await import('expo-notifications');
        responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, string> | undefined;
          const phone = data?.phone;
          if (phone) {
            router.replace(`/messages-app?phone=${encodeURIComponent(phone)}`);
          } else {
            router.replace('/messages-app');
          }
        });
      } catch { /* native notifications not available */ }
    })();
    return () => { responseSub?.remove(); };
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        bgTimestampRef.current = Date.now();
      } else if (state === 'active' && bgTimestampRef.current !== null) {
        const elapsed = (Date.now() - bgTimestampRef.current) / 1000;
        bgTimestampRef.current = null;
        if (elapsed >= AUTO_LOCK_SECONDS && session) {
          const segments = router.segments;
          if (segments[0] !== 'messages-app') {
            setLocked(true);
          }
        }
      }
    });
    return () => sub.remove();
  }, [session, router]);

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="customer-view" />
          <Stack.Screen name="dealer" />
          <Stack.Screen name="messages-app" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </SafeAreaView>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LockScreen visible={locked} onUnlock={() => setLocked(false)} />
      <UpdateModal update={update} onApply={applyUpdate} onDismiss={dismissUpdate} colors={colors} />
      <IncomingSmsBanner
        message={currentMessage}
        onDismiss={dismissIncomingMessage}
        onViewMessage={() => router.replace('/messages-app')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    writingDirection: 'rtl',
  },
});

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Cairo-Regular': Cairo_400Regular,
    'Cairo-SemiBold': Cairo_600SemiBold,
    'Cairo-Bold': Cairo_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // Start screenshot detection service on Android — delayed and wrapped in try/catch
  // to prevent crash on startup if native module or permissions aren't ready.
  // Credentials are passed from app-context after auth loads (session.access_token).
  useEffect(() => {
    const timer = setTimeout(() => {
      try { startScreenshotDetection(); } catch { /* native not available */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate>
          <AppProvider>
            <ThemeProvider>
              <AppShell />
            </ThemeProvider>
          </AppProvider>
        </AuthGate>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
