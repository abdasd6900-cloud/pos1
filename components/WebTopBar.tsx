import { useMemo, useState, useRef, useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, ScrollView } from 'react-native';
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
  MoreHorizontal,
  PackageSearch,
  Percent,
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

type MenuIcon = typeof Store;

type NavItem = {
  label: string;
  route: string;
  icon: MenuIcon;
};

const DESKTOP_BREAKPOINT = 1024;

export function useWebTopBarVisible() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}

export function WebTopBar() {
  const isDesktop = useWebTopBarVisible();
  if (Platform.OS !== 'web' || !isDesktop) return null;
  return <WebTopBarInner />;
}

function WebTopBarInner() {
  const { colors } = useTheme();
  const { settings } = useApp();
  const { profile } = useAuth();
  const pathname = usePathname();
  const overflowTriggerRef = useRef<any>(null);
  const overflowMenuRef = useRef<any>(null);

  const items = useMemo<NavItem[]>(() => {
    const list: NavItem[] = [
      { label: 'الرئيسية', route: 'index', icon: Grid2X2 },
      { label: 'البيع', route: 'pos', icon: ShoppingCart },
      { label: 'الانتظار', route: 'pending', icon: Timer },
    ];

    if (settings.businessMode === 'telecom') {
      list.push({ label: 'الرسائل', route: 'messages', icon: MessageSquare });
    }

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
    const tabPath = route === 'index' ? '/(tabs)' : `/(tabs)/${route}`;
    router.push(tabPath as never);
  };

  const isActive = (route: string) => {
    const clean = pathname.replace(/^\//, '').replace(/^\(tabs\)\//, '');
    if (route === 'index') return pathname === '/' || clean === 'index';
    return clean === route || clean.startsWith(route + '/');
  };

  const primaryItems = items.slice(0, 7);
  const overflowItems = items.slice(7);

  const [overflowOpen, setOverflowOpen] = useState(false);

  useEffect(() => {
    if (!overflowOpen) return;
    const handleClick = (e: MouseEvent) => {
      const triggerEl = overflowTriggerRef.current as unknown as HTMLElement | null;
      const menuEl = overflowMenuRef.current as unknown as HTMLElement | null;
      const target = e.target as Node;
      if (triggerEl && triggerEl.contains(target)) return;
      if (menuEl && menuEl.contains(target)) return;
      setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overflowOpen]);

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.brandSection}>
        <AppLogo size={36} />
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.text }]} numberOfLines={1}>
            {settings.storeName}
          </Text>
          <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>
            {settings.businessMode === 'retail' ? 'متجر تجاري' : 'وكالة اتصالات'}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.navScroll}
        style={styles.navScrollWrap}
      >
        {primaryItems.map(({ label, route, icon: Icon }) => {
          const active = isActive(route);
          return (
            <TouchableOpacity
              key={`${route}-${label}`}
              onPress={() => navigateTo(route)}
              style={[
                styles.navItem,
                active && { backgroundColor: colors.primary + '15' },
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconWrap, active && { backgroundColor: colors.primary + '20' }]}>
                <Icon
                  size={18}
                  color={active ? colors.primary : colors.textSecondary}
                  strokeWidth={2}
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primary : colors.text },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {overflowItems.length > 0 && (
        <View style={styles.overflowWrap}>
          <TouchableOpacity
            ref={overflowTriggerRef}
            onPress={() => setOverflowOpen((v) => !v)}
            style={[styles.navItem, overflowOpen && { backgroundColor: colors.primary + '15' }]}
            activeOpacity={0.7}
            data-overflow-trigger
          >
            <View style={[styles.navIconWrap, overflowOpen && { backgroundColor: colors.primary + '20' }]}>
              <MoreHorizontal
                size={18}
                color={overflowOpen ? colors.primary : colors.textSecondary}
                strokeWidth={2}
              />
            </View>
            <Text
              style={[styles.navLabel, { color: overflowOpen ? colors.primary : colors.text }]}
              numberOfLines={1}
            >
              المزيد
            </Text>
          </TouchableOpacity>

          {overflowOpen && (
            <View style={[styles.overflowMenu, { backgroundColor: colors.surface, borderColor: colors.border }]} ref={overflowMenuRef}>
              {overflowItems.map(({ label, route, icon: Icon }) => {
                const active = isActive(route);
                return (
                  <TouchableOpacity
                    key={`${route}-${label}`}
                    onPress={() => {
                      navigateTo(route);
                      setOverflowOpen(false);
                    }}
                    style={[
                      styles.overflowItem,
                      active && { backgroundColor: colors.primary + '12' },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Icon
                      size={16}
                      color={active ? colors.primary : colors.textSecondary}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.overflowLabel,
                        { color: active ? colors.primary : colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 1000,
    overflow: 'visible',
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginLeft: 0,
    paddingLeft: 0,
  },
  brandText: {
    gap: 1,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Cairo-Bold',
  },
  brandSub: {
    fontSize: 10,
    fontFamily: 'Cairo-Regular',
  },
  navScrollWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  navScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    minHeight: 40,
  },
  navIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Cairo-SemiBold',
  },
  overflowWrap: {
    position: 'relative',
  },
  overflowMenu: {
    position: 'absolute',
    top: 52,
    right: 0,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 2000,
  },
  overflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 40,
  },
  overflowLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Cairo-SemiBold',
  },
});
