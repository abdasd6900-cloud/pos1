import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import {
  BarChart3,
  BatteryCharging,
  Boxes,
  ClipboardList,
  Clock3,
  ContactRound,
  KeyRound,
  MessageSquare,
  PackageSearch,
  PanelLeftClose,
  Percent,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  UsersRound,
  WalletCards,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { AppLogo } from '@/components/AppLogo';

type MenuIcon = typeof Store;

type SidebarMenuProps = {
  visible: boolean;
  onClose: () => void;
  businessMode: 'retail' | 'telecom';
  isAdmin: boolean;
  storeName: string;
};

type MenuItem = {
  label: string;
  route: string;
  icon: MenuIcon;
};

export function SidebarMenu({ visible, onClose, businessMode, isAdmin, storeName }: SidebarMenuProps) {
  const { colors } = useTheme();

  const items = useMemo<MenuItem[]>(() => {
    const common: MenuItem[] = [
      { label: 'المخزون', route: 'inventory', icon: Boxes },
      { label: 'الزبائن', route: 'customers', icon: UsersRound },
      { label: 'الخزينة', route: 'cashdrawer', icon: WalletCards },
      { label: 'التقارير', route: 'reports', icon: BarChart3 },
    ];

    if (businessMode === 'telecom') {
      common[0] = { label: 'مخزون الشرائح', route: 'inventory', icon: PackageSearch };
      common.push(
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
      { label: 'الإعدادات', route: 'settings', icon: Settings },
    );

    if (isAdmin) common.push({ label: 'لوحة المدير', route: 'admin', icon: KeyRound });
    return common;
  }, [businessMode, isAdmin]);

  const openRoute = (route: string) => {
    onClose();
    router.push(`/(tabs)/${route}` as never);
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitle}>
            <AppLogo size={42} />
            <View>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{storeName}</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>الوصول السريع للأقسام</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceAlt }]}>
            <PanelLeftClose size={20} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.items} showsVerticalScrollIndicator={false}>
          {items.map(({ label, route, icon: Icon }) => (
            <TouchableOpacity
              key={`${route}-${label}`}
              onPress={() => openRoute(route)}
              style={[styles.item, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.75}
            >
              <Icon size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.itemLabel, { color: colors.text }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '84%',
    maxWidth: 292,
    paddingTop: 22,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottomWidth: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  subtitle: { fontSize: 11, marginTop: 2, fontFamily: 'Cairo-Regular' },
  closeButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  items: { gap: 10, paddingVertical: 18, paddingBottom: 32 },
  item: { minHeight: 50, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  itemLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
});
