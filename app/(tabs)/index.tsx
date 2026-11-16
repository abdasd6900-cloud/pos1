import { StyleSheet, View, Text, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions , Platform } from 'react-native';
import { useState, useCallback, Fragment } from 'react';
import { router } from 'expo-router';
import {
  ShoppingCart, Package, Users, TrendingUp, Wallet,
  AlertTriangle, Receipt, Moon, Sun,
  Plus, Zap, ChevronLeft, Undo2, Clock, Gift, Lock,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatNumber, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/EmptyState';
import { StockPredictions } from '@/components/StockPredictions';
import { GlobalSearch } from '@/components/GlobalSearch';
import { AppLogo } from '@/components/AppLogo';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

export default function DashboardScreen() {
  const { stats, transactions, products, customers, settings, seedDemoData, predictions, smartAlerts, license, readOnlyMode } = useApp();
  const { colors, isDark, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const [refreshing, setRefreshing] = useState(false);
  const hasData = products.length > 0 || customers.length > 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Only seed demo data if there's no existing data; pull-to-refresh should
    // not overwrite real user data.
    if (!hasData) {
      await seedDemoData();
    }
    setRefreshing(false);
  }, [seedDemoData, hasData]);

  const recentTxns = transactions.slice(0, 5);
  const lowStockProducts = products.filter((p) => p.stock <= p.minStock).slice(0, 4);
  const topDebtors = customers.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 3);

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.content, isDesktop && styles.desktopContent]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, isDesktop && styles.desktopHeader]}>
        <View style={styles.headerTop}>
          <View style={styles.headerBrand} pointerEvents="none">
            <AppLogo size={44} />
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>
                {settings.businessMode === 'retail' ? 'متجر تجاري' : 'وكالة اتصالات'}
              </Text>
              <Text style={[styles.storeName, { color: colors.text }]}>{settings.storeName}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={toggleTheme}
              style={[styles.iconBtn, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
            >
              {isDark ? <Sun size={20} color={colors.text} /> : <Moon size={20} color={colors.text} />}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Connection Status */}
      <ConnectionIndicator compact={isDesktop} />

      {/* Global Smart Search */}
      <GlobalSearch />

      {/* Trial / License Banner */}
      {license && (license.status === 'trial' || readOnlyMode) && (
        <TouchableOpacity onPress={() => router.navigate('/subscription')} style={[styles.licenseBanner, { backgroundColor: readOnlyMode ? colors.danger + '20' : colors.info + '15', borderColor: readOnlyMode ? colors.danger : colors.info }]} activeOpacity={0.7}>
          {readOnlyMode ? <Lock size={18} color={colors.danger} strokeWidth={2} /> : <Gift size={18} color={colors.info} strokeWidth={2} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.licenseBannerTitle, { color: readOnlyMode ? colors.danger : colors.info }]}>
              {readOnlyMode ? 'الاشتراك منتهي - وضع القراءة فقط' : `فترة تجريبية - متبقي ${Math.max(0, Math.ceil(((license.expiresAt ?? 0) - Date.now()) / 86400000))} يوم`}
            </Text>
            <Text style={[styles.licenseBannerSub, { color: readOnlyMode ? colors.danger : colors.info }]}>
              {readOnlyMode ? 'اضغط للتجديد واستعادة كامل الصلاحيات' : 'اضغط لتفعيل اشتراكك الآن'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {!hasData ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Package size={32} color={colors.primary} strokeWidth={2} />}
            title="ابدأ بإضافة منتجاتك"
            subtitle="أضف منتجاتك الأولية لبدء استخدام التطبيق. يمكنك أيضاً سحب الشاشة للأسفل لتحميل بيانات تجريبية."
            actionLabel="إضافة منتج جديد"
            onAction={() => router.navigate('/inventory')}
          />
        </View>
      ) : (
        <>
          {/* Stats Grid */}
          <View style={[styles.statsGrid, isDesktop && styles.desktopStatsGrid]}>
            <StatCard
              icon={<TrendingUp size={22} color="#FFFFFF" strokeWidth={2} />}
              label="مبيعات اليوم"
              value={formatCurrency(stats.todaySales, settings.currency)}
              bg={colors.primary}
              />
            <StatCard
              icon={<Wallet size={22} color="#FFFFFF" strokeWidth={2} />}
              label="أرباح اليوم"
              value={formatCurrency(stats.todayProfit, settings.currency)}
              bg={colors.success}
            />
            <StatCard
              icon={<Receipt size={22} color="#FFFFFF" strokeWidth={2} />}
              label="معاملات اليوم"
              value={formatNumber(stats.todayTransactions)}
              subtitle="عملية بيع اليوم"
              bg={colors.info}
            />
            <StatCard
              icon={<Wallet size={22} color="#FFFFFF" strokeWidth={2} />}
              label="إجمالي الديون"
              value={formatCurrency(stats.totalDebt, settings.currency)}
              bg={colors.warning}
              />
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>إجراءات سريعة</Text>
            <View style={[styles.quickActions, isDesktop && styles.desktopQuickActions]}>
              <QuickAction
                icon={<ShoppingCart size={24} color={colors.primary} strokeWidth={2} />}
                label="فاتورة بيع"
                onPress={() => router.navigate('/pos')}
                colors={colors}
              />
              <QuickAction
                icon={<Plus size={24} color={colors.accent} strokeWidth={2} />}
                label="إضافة منتج"
                onPress={() => router.navigate('/inventory')}
                colors={colors}
              />
              <QuickAction
                icon={<Users size={24} color={colors.info} strokeWidth={2} />}
                label="زبون جديد"
                onPress={() => router.navigate('/customers')}
                colors={colors}
              />
              <QuickAction
                icon={<Zap size={24} color={colors.warning} strokeWidth={2} />}
                label={settings.businessMode === 'telecom' ? 'تجديد اشتراك' : 'تقارير'}
                onPress={() => router.navigate('/reports')}
                colors={colors}
              />
            </View>
          </View>

          {/* Smart Alerts */}
          {settings.enableSmartAlerts && smartAlerts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>تنبيهات ذكية</Text>
                <Badge count={smartAlerts.length} colors={colors} />
              </View>
              <View style={[styles.alertCard, { backgroundColor: colors.surface }]}>
                {smartAlerts.slice(0, 6).map((alert, i) => (
                  <View
                    key={alert.id}
                    style={[styles.alertRow, i < Math.min(smartAlerts.length, 6) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  >
                    <View style={styles.alertInfo}>
                      <View style={[styles.alertIcon, { backgroundColor: (alert.severity === 'danger' ? colors.danger : alert.severity === 'warning' ? colors.warning : colors.info) + '22' }]}>
                        {alert.type === 'debt' ? <Wallet size={16} color={alert.severity === 'danger' ? colors.danger : colors.warning} strokeWidth={2} /> :
                         alert.type === 'expiry' ? <Clock size={16} color={alert.severity === 'danger' ? colors.danger : colors.warning} strokeWidth={2} /> :
                         <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertText, { color: colors.text }]} numberOfLines={1}>{alert.title}</Text>
                        <Text style={[styles.alertSubText, { color: colors.textMuted }]} numberOfLines={1}>{alert.message}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Low Stock Alert */}
          {lowStockProducts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>تنبيهات المخزون</Text>
                {lowStockProducts.length > 0 && (
                  <Badge count={lowStockProducts.length} colors={colors} />
                )}
              </View>
              <View style={[styles.alertCard, { backgroundColor: colors.surface }]}>
                {lowStockProducts.map((p, i) => (
                  <View
                    key={p.id}
                    style={[
                      styles.alertRow,
                      i < lowStockProducts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.alertInfo}>
                      <View style={[styles.alertIcon, { backgroundColor: colors.warning + '22' }]}>
                        <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />
                      </View>
                      <Text style={[styles.alertText, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                    </View>
                    <Text style={[styles.alertStock, { color: p.stock === 0 ? colors.danger : colors.warning }]}>
                      {p.stock} {p.unit}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Stock Predictions */}
          {settings.enableStockPrediction && predictions.length > 0 && (
            <View style={styles.section}>
              <StockPredictions
                predictions={predictions}
                currency={settings.currency}
                onOrderProduct={(pid) => router.navigate('/inventory')}
              />
            </View>
          )}

          {/* Recent Transactions */}
          {recentTxns.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>آخر المعاملات</Text>
                <TouchableOpacity onPress={() => router.navigate('/reports')}>
                  <View style={styles.viewAllRow}>
                    <Text style={[styles.viewAll, { color: colors.primary }]}>عرض الكل</Text>
                    <ChevronLeft size={14} color={colors.primary} strokeWidth={2} />
                  </View>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 10 }}>
                {recentTxns.map((t) => {
                  const isSale = t.type === 'sale';
                  const isPayment = t.type === 'payment';
                  const isReturn = t.type === 'return';
                  const tColor = isSale ? colors.primary : isPayment ? colors.success : isReturn ? colors.danger : colors.info;
                  return (
                    <View key={t.id} style={[styles.txnCard, { backgroundColor: colors.surface, borderColor: tColor + '30' }]}>
                      <View style={styles.txnCardTop}>
                        <View style={[styles.txnCardIcon, { backgroundColor: tColor + '15' }]}>
                          {isSale ? (
                            <ShoppingCart size={16} color={tColor} strokeWidth={2} />
                          ) : isPayment ? (
                            <Wallet size={16} color={tColor} strokeWidth={2} />
                          ) : isReturn ? (
                            <Undo2 size={16} color={tColor} strokeWidth={2} />
                          ) : (
                            <Package size={16} color={tColor} strokeWidth={2} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.txnCardName, { color: colors.text }]} numberOfLines={1}>
                            {isSale ? `بيع - ${t.customerName || 'عميل نقدي'}` : isPayment ? `دفعة - ${t.customerName}` : isReturn ? `مرتجع - ${t.customerName || 'عميل نقدي'}` : `شراء`}
                          </Text>
                          <View style={styles.txnCardTimeRow}>
                            <Clock size={11} color={colors.textMuted} strokeWidth={2} />
                            <Text style={[styles.txnCardTime, { color: colors.textMuted }]}>{timeAgo(t.createdAt)}</Text>
                          </View>
                        </View>
                        <Text style={[styles.txnCardAmount, { color: tColor }]}>
                          {isPayment ? '-' : ''}{formatCurrency(isPayment ? t.paid : t.total, settings.currency)}
                        </Text>
                      </View>
                      {isSale && t.items && t.items.length > 0 && (
                        <View style={[styles.txnCardItems, { borderTopColor: colors.border }]}>
                          {t.items.slice(0, 3).map((item, idx) => (
                            <View key={idx} style={styles.txnCardItemRow}>
                              <Text style={[styles.txnCardItemName, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={[styles.txnCardItemQty, { color: colors.textMuted }]}>
                                {item.quantity}×
                              </Text>
                            </View>
                          ))}
                          {t.items.length > 3 && (
                            <Text style={[styles.txnCardMore, { color: colors.textMuted }]}>
                              +{t.items.length - 3} صنف آخر
                            </Text>
                          )}
                        </View>
                      )}
                      {isSale && t.remaining > 0 && (
                        <View style={[styles.txnCardDebtBar, { backgroundColor: colors.danger + '10' }]}>
                          <Wallet size={12} color={colors.danger} strokeWidth={2} />
                          <Text style={[styles.txnCardDebtText, { color: colors.danger }]}>
                            دين: {formatCurrency(t.remaining, settings.currency)}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Top Debtors */}
          {topDebtors.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>أكبر الديون</Text>
              <View style={[styles.debtList, { backgroundColor: colors.surface }]}>
                {topDebtors.map((c, i) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => router.navigate('/customers')}
                    style={[
                      styles.debtRow,
                      i < topDebtors.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.debtAvatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.debtAvatarText, { color: colors.primary }]}>
                        {c.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.debtInfo}>
                      <Text style={[styles.debtName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.debtPhone, { color: colors.textMuted }]}>{c.phone}</Text>
                    </View>
                    <Text style={[styles.debtAmount, { color: colors.danger }]}>
                      {formatCurrency(c.debt, settings.currency)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
    </>
  );
}

function StatCard({
  icon, label, value, subtitle, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  bg: string;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  return (
    <View style={[styles.statCard, isDesktop && styles.desktopStatCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        {icon}
      </View>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      {subtitle ? (
        <Text style={[styles.statSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function QuickAction({
  icon, label, onPress, colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.quickAction, isDesktop && styles.desktopQuickAction, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: colors.surfaceAlt }]}>
        {icon}
      </View>
      <Text style={[styles.quickActionLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ count, colors }: { count: number; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.countBadge, { backgroundColor: colors.danger }]}>
      <Text style={styles.countBadgeText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  desktopContent: { paddingHorizontal: 28, paddingTop: 24, paddingBottom: 40 },
  header: { marginBottom: 20 },
  desktopHeader: { marginBottom: 16, paddingBottom: 4 },

  licenseBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16, marginHorizontal: 16 },

  licenseBannerTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  licenseBannerSub: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-SemiBold' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { fontSize: 13, marginBottom: 4 },
  storeName: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  desktopStatsGrid: { flexWrap: 'nowrap', gap: 16, marginBottom: 28 },
  statCard: {
    width: '48%', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  desktopStatCard: {
    flex: 1,
    width: undefined,
    padding: 18,
  },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statLabel: { fontSize: 13, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statSubtitle: { fontSize: 11, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  desktopQuickActions: { flexWrap: 'nowrap', gap: 16 },
  quickAction: {
    width: '48%', borderRadius: 16, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  desktopQuickAction: {
    flex: 1,
    width: undefined,
    padding: 18,
  },
  quickActionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickActionLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  alertCard: { borderRadius: 16, overflow: 'hidden' },
  alertRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  alertInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  alertIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertText: { fontSize: 14, fontWeight: '600', flex: 1 },
  alertSubText: { fontSize: 12, marginTop: 2 },
  alertStock: { fontSize: 14, fontWeight: '700' },
  txnCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  txnCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txnCardIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnCardName: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnCardTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  txnCardTime: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  txnCardAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnCardItems: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  txnCardItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnCardItemName: { fontSize: 12, flex: 1, fontFamily: 'Cairo-Regular' },
  txnCardItemQty: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnCardMore: { fontSize: 11, fontFamily: 'Cairo-Regular', marginTop: 2 },
  txnCardDebtBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  txnCardDebtText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  debtList: { borderRadius: 16, overflow: 'hidden' },
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  debtAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  debtAvatarText: { fontSize: 16, fontWeight: '700' },
  debtInfo: { flex: 1 },
  debtName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  debtPhone: { fontSize: 12 },
  debtAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  viewAll: { fontSize: 13, fontWeight: '600' },
  viewAllRow: { flexDirection: 'row', alignItems: 'center' },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  emptyWrap: { marginTop: 20 },
});
