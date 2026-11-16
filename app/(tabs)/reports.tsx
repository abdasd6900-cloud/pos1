import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useState, useMemo } from 'react';
import {
  TrendingUp, Wallet, ShoppingCart,
  Package, Users, BookOpen, BarChart3, ArrowDownRight,
  AlertTriangle, Undo2,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatNumber, isToday, isThisWeek, isThisMonth, formatDate, formatTime } from '@/lib/format';
import { EmptyState } from '@/components/EmptyState';

type Period = 'today' | 'week' | 'month' | 'all';

export default function ReportsScreen() {
  const { transactions, products, customers, settings, stats } = useApp();
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('today');

  const periodTransactions = useMemo(() => {
    switch (period) {
      case 'today': return transactions.filter((t) => isToday(t.createdAt));
      case 'week': return transactions.filter((t) => isThisWeek(t.createdAt));
      case 'month': return transactions.filter((t) => isThisMonth(t.createdAt));
      case 'all': return transactions;
    }
  }, [transactions, period]);

  const sales = periodTransactions.filter((t) => t.type === 'sale');
  const payments = periodTransactions.filter((t) => t.type === 'payment');
  const purchases = periodTransactions.filter((t) => t.type === 'purchase');
  const returns = periodTransactions.filter((t) => t.type === 'return');
  const totalReturns = returns.reduce((s, t) => s + t.total, 0);

  const totalSales = sales.reduce((s, t) => s + t.total, 0);
  const totalPayments = payments.reduce((s, t) => s + t.paid, 0);
  const totalPurchases = purchases.reduce((s, t) => s + t.total, 0);

  const totalProfit = useMemo(() => {
    return sales.reduce((sum, t) => {
      return sum + t.items.reduce((itemSum, item) => {
        const product = products.find((p) => p.id === item.productId);
        const cost = product ? product.cost : 0;
        return itemSum + (item.price - cost) * item.quantity;
      }, 0);
    }, 0);
  }, [sales, products]);

  // Simple bar chart data - last 7 days
  const chartData = useMemo(() => {
    const days: { label: string; value: number; date: Date }[] = [];
    const dayNames = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const daySales = transactions.filter((t) => {
        const td = new Date(t.createdAt);
        return t.type === 'sale' &&
          td.getDate() === d.getDate() &&
          td.getMonth() === d.getMonth() &&
          td.getFullYear() === d.getFullYear();
      }).reduce((s, t) => s + t.total, 0);
      days.push({ label: dayNames[d.getDay()], value: daySales, date: d });
    }
    return days;
  }, [transactions]);

  const maxChartValue = Math.max(...chartData.map((d) => d.value), 1);
  const screenWidth = Dimensions.get('window').width;
  const chartBarWidth = (screenWidth - 64) / 7;

  // Top products
  const productSales = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    sales.forEach((t) => {
      t.items.forEach((item) => {
        const existing = map.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0 };
        existing.qty += item.quantity;
        existing.revenue += item.price * item.quantity;
        map.set(item.productId, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [sales]);

  const hasData = transactions.length > 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerInfo}>
          <BarChart3 size={24} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>التقارير والإحصائيات</Text>
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.periodBar}>
        {([
          { key: 'today', label: 'اليوم' },
          { key: 'week', label: 'الأسبوع' },
          { key: 'month', label: 'الشهر' },
          { key: 'all', label: 'الكل' },
        ] as { key: Period; label: string }[]).map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPeriod(p.key)}
            style={[styles.periodChip, period === p.key ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, { color: period === p.key ? '#FFFFFF' : colors.textSecondary }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!hasData ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<BarChart3 size={32} color={colors.textMuted} strokeWidth={2} />}
            title="لا توجد تقارير بعد"
            subtitle="ابدأ بإجراء عمليات بيع لعرض التقارير والإحصائيات"
          />
        </View>
      ) : (
        <>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            <SummaryCard
              icon={<TrendingUp size={20} color="#FFFFFF" strokeWidth={2} />}
              label="إجمالي المبيعات"
              value={formatCurrency(totalSales, settings.currency)}
              bg={colors.primary}
              trend={sales.length > 0 ? `${sales.length} عملية` : undefined}
              colors={colors}
            />
            <SummaryCard
              icon={<Wallet size={20} color="#FFFFFF" strokeWidth={2} />}
              label="صافي الأرباح"
              value={formatCurrency(totalProfit, settings.currency)}
              bg={colors.success}
              trend={totalSales > 0 ? `${((totalProfit / totalSales) * 100).toFixed(1)}%` : undefined}
              colors={colors}
            />
            <SummaryCard
              icon={<ArrowDownRight size={20} color="#FFFFFF" strokeWidth={2} />}
              label="المشتريات"
              value={formatCurrency(totalPurchases, settings.currency)}
              bg={colors.info}
              trend={purchases.length > 0 ? `${purchases.length} عملية` : undefined}
              colors={colors}
            />
            <SummaryCard
              icon={<BookOpen size={20} color="#FFFFFF" strokeWidth={2} />}
              label="تسديدات الديون"
              value={formatCurrency(totalPayments, settings.currency)}
              bg={colors.accent}
              trend={payments.length > 0 ? `${payments.length} دفعة` : undefined}
              colors={colors}
            />
          </View>

          {/* Sales Chart */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>مبيعات آخر 7 أيام</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              <View style={styles.chart}>
                {chartData.map((d, i) => (
                  <View key={i} style={styles.chartBarWrap}>
                    <View style={styles.chartBarContainer}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: Math.max(4, (d.value / maxChartValue) * 120),
                            backgroundColor: isToday(d.date.getTime()) ? colors.primary : colors.primary + '50',
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Top Products */}
          {productSales.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>الأكثر مبيعاً</Text>
              <View style={[styles.topProductsCard, { backgroundColor: colors.surface }]}>
                {productSales.map((p, i) => (
                  <View
                    key={i}
                    style={[styles.topProductRow, i < productSales.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.rankBadge, { backgroundColor: i === 0 ? colors.accent + '25' : colors.surfaceAlt }]}>
                      <Text style={[styles.rankText, { color: i === 0 ? colors.accent : colors.textSecondary }]}>
                        {i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.topProductName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={[styles.topProductQty, { color: colors.textMuted }]}>
                        {formatNumber(p.qty)} وحدة مباعة
                      </Text>
                    </View>
                    <Text style={[styles.topProductRevenue, { color: colors.primary }]}>
                      {formatCurrency(p.revenue, settings.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Quick Stats */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>إحصائيات سريعة</Text>
            <View style={styles.quickStatsGrid}>
              <QuickStat icon={<Package size={18} color={colors.primary} strokeWidth={2} />} label="المنتجات" value={formatNumber(products.length)} colors={colors} />
              <QuickStat icon={<Users size={18} color={colors.info} strokeWidth={2} />} label="الزبائن" value={formatNumber(customers.length)} colors={colors} />
              <QuickStat icon={<Wallet size={18} color={colors.danger} strokeWidth={2} />} label="ديون مستحقة" value={formatCurrency(stats.totalDebt, settings.currency)} colors={colors} />
              <QuickStat icon={<AlertTriangle size={18} color={colors.warning} strokeWidth={2} />} label="مخزون منخفض" value={formatNumber(stats.lowStockCount)} colors={colors} />
            </View>
          </View>

          {/* Recent Transactions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>سجل المعاملات ({periodTransactions.length})</Text>
            <View style={[styles.txnList, { backgroundColor: colors.surface }]}>
              {periodTransactions.slice(0, 20).map((t, i) => (
                <View
                  key={t.id}
                  style={[styles.txnRow, i < Math.min(periodTransactions.length, 20) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                >
                  <View style={[styles.txnIcon, {
                    backgroundColor: t.type === 'sale' ? colors.primary + '20'
                      : t.type === 'payment' ? colors.success + '20'
                      : t.type === 'return' ? colors.danger + '20' : colors.info + '20',
                  }]}>
                    {t.type === 'sale' ? (
                      <ShoppingCart size={16} color={colors.primary} strokeWidth={2} />
                    ) : t.type === 'payment' ? (
                      <Wallet size={16} color={colors.success} strokeWidth={2} />
                    ) : t.type === 'return' ? (
                      <Undo2 size={16} color={colors.danger} strokeWidth={2} />
                    ) : (
                      <Package size={16} color={colors.info} strokeWidth={2} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txnType, { color: colors.text }]}>
                      {t.type === 'sale' ? `بيع - ${t.customerName || 'نقدي'}` : t.type === 'payment' ? `دفعة - ${t.customerName}` : t.type === 'return' ? `مرتجع - ${t.customerName || 'نقدي'}` : `شراء`}
                    </Text>
                    <Text style={[styles.txnDate, { color: colors.textMuted }]}>
                      {formatDate(t.createdAt)} - {formatTime(t.createdAt)}
                    </Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: t.type === 'payment' ? colors.success : colors.text }]}>
                    {t.type === 'payment' ? '-' : ''}{formatCurrency(t.type === 'payment' ? t.paid : t.total, settings.currency)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function SummaryCard({ icon, label, value, bg, trend, colors }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
  trend?: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.summaryIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      {trend ? <Text style={[styles.summaryTrend, { color: colors.textMuted }]}>{trend}</Text> : null}
    </View>
  );
}

function QuickStat({ icon, label, value, colors }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.quickStat, { backgroundColor: colors.surface }]}>
      <View style={styles.quickStatIcon}>{icon}</View>
      <Text style={[styles.quickStatLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.quickStatValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  periodBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  periodText: { fontSize: 13, fontWeight: '600' },
  emptyWrap: { marginTop: 40 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, marginBottom: 20 },
  summaryCard: {
    width: '48.5%', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  summaryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryLabel: { fontSize: 13, marginBottom: 4 },
  summaryValue: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  summaryTrend: { fontSize: 11, marginTop: 4 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 12 },
  chartCard: { borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  chartBarWrap: { alignItems: 'center', gap: 6 },
  chartBarContainer: { height: 120, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: 28, borderRadius: 6 },
  chartLabel: { fontSize: 11, fontWeight: '600' },
  topProductsCard: { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  topProductRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '700' },
  topProductName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  topProductQty: { fontSize: 12 },
  topProductRevenue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  quickStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickStat: { width: '48.5%', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  quickStatIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickStatLabel: { fontSize: 12 },
  quickStatValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnList: { borderRadius: 16, overflow: 'hidden' },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  txnIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnType: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  txnDate: { fontSize: 11 },
  txnAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
});
