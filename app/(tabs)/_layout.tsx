import { Tabs, usePathname } from 'expo-router';
import { Grid2X2, ShoppingCart, Timer, Menu, Hash } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import type { Palette } from '@/lib/color-system';
import { WebTopBar, useWebTopBarVisible } from '@/components/WebTopBar';
import { SidebarMenu } from '@/components/SidebarMenu';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';

const baseRoutes = ['index', 'pos', 'pending'] as const;
const telecomExtraRoutes = ['numbers'] as const;

type VisibleRoute = (typeof baseRoutes)[number] | (typeof telecomExtraRoutes)[number];

function TabIcon({ routeName, color }: { routeName: VisibleRoute; color: string }) {
  if (routeName === 'index') return <Grid2X2 size={24} color={color} strokeWidth={2} />;
  if (routeName === 'pos') return <ShoppingCart size={24} color={color} strokeWidth={2} />;
  if (routeName === 'numbers') return <Hash size={24} color={color} strokeWidth={2} />;
  return <Timer size={24} color={color} strokeWidth={2} />;
}

const pageTitles: Record<string, string> = {
  index: 'الرئيسية',
  pos: 'البيع',
  pending: 'الانتظار',
  inventory: 'المخزون',
  customers: 'الزبائن',
  suppliers: 'الموردون',
  cashdrawer: 'الخزينة',
  promotions: 'العروض',
  staff: 'الموظفون',
  subscription: 'الاشتراك',
  stocktake: 'الجرد',
  reports: 'التقارير',
  settings: 'الإعدادات',
  recharge: 'الشحن',
  messages: 'الرسائل',
  'business-hours': 'أوقات العمل',
  'pos-retail': 'البيع بالتجزئة',
  'pos-telecom': 'بيع الاتصالات',
  numbers: 'الأرقام',
  admin: 'لوحة المدير',
};

function WebPageTitle() {
  const pathname = usePathname();
  const { colors } = useTheme();
  const route = pathname.replace(/^\//, '').replace(/^\(tabs\)\//, '') || 'index';
  const title = pageTitles[route] ?? 'الرئيسية';

  return (
    <View
      style={[
        styles.pageTitleBar,
        { backgroundColor: colors.bg, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function CustomTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  colors,
  onMenuPress,
  visibleRoutes,
}: BottomTabBarProps & { colors: Palette; onMenuPress: () => void; visibleRoutes: readonly string[] }) {
  const insets = useSafeAreaInsets();
  const routes = visibleRoutes
    .map((name) => state.routes.find((route) => route.name === name))
    .filter((route): route is (typeof state.routes)[number] => Boolean(route));

  const tabLabels: Record<string, string> = {
    index: 'الرئيسية',
    pos: 'البيع',
    pending: 'الانتظار',
    numbers: 'الأرقام',
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.statusRow}>
        <ConnectionIndicator compact />
      </View>
      {routes.map((route) => {
        const routeName = route.name as VisibleRoute;
        const descriptor = descriptors[route.key];
        const isFocused = state.index === state.routes.findIndex((item) => item.key === route.key);
        const color = isFocused ? colors.tabActive : colors.tabInactive;
        const label = tabLabels[routeName] ?? descriptor.options.title ?? route.name;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <TabIcon routeName={routeName} color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={onMenuPress}
        style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
      >
        <Menu size={24} color={colors.tabInactive} strokeWidth={2} />
        <Text style={[styles.label, { color: colors.tabInactive }]}>القائمة</Text>
      </Pressable>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const isWeb = useWebTopBarVisible();
  const { settings } = useApp();
  const { profile } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);

  const visibleRoutes = settings.businessMode === 'telecom'
    ? [...baseRoutes, ...telecomExtraRoutes]
    : [...baseRoutes];

  const hiddenScreen = {
    tabBarButton: () => null,
    headerShown: false,
  };

  return (
    <>
      {isWeb && <WebTopBar />}
      {!isWeb && (
        <SidebarMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          businessMode={settings.businessMode}
          isAdmin={profile?.role === 'admin'}
          storeName={settings.storeName}
        />
      )}
      <View style={styles.webContent}> 
        {isWeb && <WebPageTitle />}
        <Tabs
        screenOptions={{
          headerShown: false,
          ...(isWeb
            ? {
                tabBarStyle: { display: 'none' },
                tabBarButton: () => null,
              }
            : {}),
        }}
        tabBar={isWeb ? () => null : (props) => <CustomTabBar {...props} colors={colors} onMenuPress={() => setMenuVisible(true)} visibleRoutes={visibleRoutes} />}
      >
        <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
        <Tabs.Screen name="pos" options={{ title: 'البيع' }} />
        <Tabs.Screen name="pending" options={{ title: 'الانتظار' }} />
        <Tabs.Screen name="inventory" options={hiddenScreen} />
        <Tabs.Screen name="customers" options={hiddenScreen} />
        <Tabs.Screen name="suppliers" options={hiddenScreen} />
        <Tabs.Screen name="cashdrawer" options={hiddenScreen} />
        <Tabs.Screen name="promotions" options={hiddenScreen} />
        <Tabs.Screen name="staff" options={hiddenScreen} />
        <Tabs.Screen name="subscription" options={hiddenScreen} />
        <Tabs.Screen name="stocktake" options={hiddenScreen} />
        <Tabs.Screen name="reports" options={hiddenScreen} />
        <Tabs.Screen name="settings" options={hiddenScreen} />
        <Tabs.Screen name="recharge" options={hiddenScreen} />
        <Tabs.Screen name="messages" options={hiddenScreen} />
        <Tabs.Screen name="business-hours" options={hiddenScreen} />
        <Tabs.Screen name="pos-retail" options={hiddenScreen} />
        <Tabs.Screen name="pos-telecom" options={hiddenScreen} />
        <Tabs.Screen name="numbers" options={settings.businessMode === 'telecom' ? { title: 'الأرقام' } : hiddenScreen} />
        <Tabs.Screen name="admin" options={hiddenScreen} />
        </Tabs>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  webContent: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  pageTitleBar: {
    minHeight: 64,
    paddingHorizontal: 32,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  pageTitle: {
    textAlign: 'right',
    writingDirection: 'rtl',
    fontFamily: 'Cairo-Bold',
    fontSize: 24,
    lineHeight: 34,
  },
  statusRow: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 64,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 2,
  },
  pressed: {
    opacity: 0.65,
  },
  label: {
    fontFamily: 'Cairo-SemiBold',
    fontSize: 11,
    lineHeight: 16,
    writingDirection: 'rtl',
  },
});
