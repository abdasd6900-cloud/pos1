import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import {
  BarChart3,
  BatteryCharging,
  Boxes,
  ClipboardList,
  Clock3,
  ContactRound,
  Grid2X2,
  Hash,
  KeyRound,
  MessageSquare,
  PackageSearch,
  Percent,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Timer,
  Truck,
  UsersRound,
  WalletCards,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { AppLogo } from '@/components/AppLogo';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

type MenuIcon = typeof Store;

type NavItem = {
  label: string;
  route: string;
  icon: MenuIcon;
};

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH = 260;

type WebSidebarProps = {
  onWidthChange?: (width: number) => void;
};

export function WebSidebar({ onWidthChange }: WebSidebarProps) {
  const isDesktop = useIsDesktop();
  if (Platform.OS !== 'web' || !isDesktop) return null;
  return <WebSidebarInner onWidthChange={onWidthChange} />;
}

const DESKTOP_BREAKPOINT = 1024;

function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}

export function useWebSidebarVisible() {
  const isDesktop = useIsDesktop();
  return Platform.OS === 'web' && isDesktop;
}


function WebSidebarInner({ onWidthChange }: WebSidebarProps) {
  const { colors } = useTheme();
  const { settings } = useApp();
  const { profile } = useAuth();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);

  const items = useMemo<NavItem[]>(() => {
    const list: NavItem[] = [
      { label: 'الرئيسية', route: 'index', icon: Grid2X2 },
      { label: 'شاشة البيع', route: 'pos', icon: ShoppingCart },
      { label: 'قائمة الانتظار', route: 'pending', icon: Timer },
    ];

    const common: NavItem[] = [
      { label: 'المخزون', route: 'inventory', icon: Boxes },
      { label: 'الزبائن', route: 'customers', icon: UsersRound },
      { label: 'الخزينة', route: 'cashdrawer', icon: WalletCards },
      { label: 'التقارير', route: 'reports', icon: BarChart3 },
    ];

    if (settings.businessMode === 'telecom') {
      common[0] = { label: 'مخزون الشرائح', route: 'inventory', icon: PackageSearch };
      common.push(
        { label: 'الأرقام', route: 'numbers', icon: Hash },
        { label: 'الشحن', route: 'recharge', icon: BatteryCharging },
        { label: 'الرسائل', route: 'messages', icon: MessageSquare },
        { label: 'الموردون', route: 'suppliers', icon: Truck },
        { label: 'العروض', route: 'promotions', icon: Percent },
      );
    } else {
      common.push(
        { label: 'الموردون', route: 'suppliers', icon: Truck },
        { label: 'العروض', route: 'promotions', icon: Percent },
        { label: 'الجرد', route: 'stocktake', icon: ClipboardList },
      );
    }

    common.push(
      { label: 'الموظفون', route: 'staff', icon: ContactRound },
      { label: 'أوقات العمل', route: 'business-hours', icon: Clock3 },
      { label: 'الاشتراك', route: 'subscription', icon: ShieldCheck },
    );

    list.push(...common);

    if (profile?.role === 'admin') {
      list.push({ label: 'لوحة المدير', route: 'admin', icon: KeyRound });
    }

    list.push({ label: 'الإعدادات', route: 'settings', icon: Settings });

    return list;
  }, [settings.businessMode, profile?.role]);

  const navigateTo = (route: string) => {
    if (route === 'messages') {
      router.navigate('/messages-app' as never);
      return;
    }
    router.navigate(route === 'index' ? '/' : (`/${route}` as never));
  };

  const isActive = (route: string) => {
    const clean = pathname.replace(/^\//, '').replace(/^\(tabs\)\//, '');
    if (route === 'index') return pathname === '/' || clean === 'index';
    return clean === route || clean.startsWith(route + '/');
  };

  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;

  useEffect(() => {
    onWidthChange?.(width);
  }, [onWidthChange, width]);

  return (
    <View
      style={[
        styles.rail,
        {
          width,
          backgroundColor: colors.surface,
          borderLeftColor: colors.border,
        },
      ]}
    >
      {/* Toggle button */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={[styles.toggleBtn, { backgroundColor: colors.surfaceAlt }]}
        activeOpacity={0.7}
      >
        {expanded ? (
          <PanelLeftClose size={20} color={colors.textSecondary} strokeWidth={2} />
        ) : (
          <PanelLeftOpen size={20} color={colors.textSecondary} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {/* Logo / brand */}
      <View style={styles.brandRow}>
        <AppLogo size={expanded ? 40 : 32} />
        {expanded && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>
              {settings.storeName}
            </Text>
            <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>
              {settings.businessMode === 'retail' ? 'متجر تجاري' : 'وكالة اتصالات'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.navList}
        showsVerticalScrollIndicator={false}
      >
        {items.map(({ label, route, icon: Icon }) => {
          const active = isActive(route);
          return (
            <TouchableOpacity
              key={`${route}-${label}`}
              onPress={() => navigateTo(route)}
              style={[
                styles.navItem,
                {
                  backgroundColor: active ? colors.primary + '15' : 'transparent',
                  borderRadius: 12,
                },
                !expanded && styles.navItemCollapsed,
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconWrap, active && { backgroundColor: colors.primary + '20' }]}>
                <Icon
                  size={22}
                  color={active ? colors.primary : colors.textSecondary}
                  strokeWidth={2}
                />
              </View>
              {expanded && (
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? colors.primary : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              )}
              {expanded && active && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ConnectionIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderLeftWidth: 1,
    zIndex: 1000,
    paddingTop: 16,
    paddingBottom: 16,
  },
  toggleBtn: {
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  brandName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Cairo-Bold',
  },
  brandSub: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'Cairo-Regular',
  },
  navList: {
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 48,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Cairo-SemiBold',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
