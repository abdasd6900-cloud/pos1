import { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabaseUrl } from '@/lib/supabase';
import {
  Phone, Crown, Wallet, BookOpen, Clock, Calendar,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Check, Package, Smartphone, Gift, Star,
} from 'lucide-react-native';

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  tier: string;
  debt: number;
  balance: number;
  appBalance?: number;
  cashBalance?: number;
  creditLimit: number;
  loyaltyPoints: number;
  notes: string;
  subscriptionNumber: string;
  subscriptionExpiry: number | null;
  createdAt: number;
}

interface TxnData {
  id: string;
  type: string;
  date: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  items: { name: string; quantity: number; price: number }[];
}

interface SaleData {
  id: string;
  operationType: string;
  mode: string;
  companyName: string;
  bundleName: string;
  simName: string;
  simNumber: string;
  date: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
}

interface PortalResponse {
  customer: CustomerData;
  transactions: TxnData[];
  telecomSales: SaleData[];
  currency: string;
}

const COLORS = {
  bg: '#0F1117',
  surface: '#1A1D28',
  surfaceAlt: '#222634',
  border: '#2A2E3E',
  text: '#F1F3F8',
  textSecondary: '#9CA3B8',
  textMuted: '#6B7186',
  primary: '#3B82F6',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  accent: '#F59E0B',
  info: '#06B6D4',
};

const paymentMethodLabel = (m: string): string => {
  if (m === 'cash') return 'نقدي';
  if (m === 'wallet') return 'محفظة';
  if (m === 'usdt') return 'USDT';
  if (m === 'debt') return 'دين';
  if (m === 'app_balance') return 'رصيد تطبيق';
  if (m === 'cash_balance') return 'رصيد نقدي';
  return m;
};

const txnTypeLabel = (t: string): string => {
  if (t === 'sale') return 'بيع';
  if (t === 'payment') return 'دفعة';
  if (t === 'return') return 'مرتجع';
  if (t === 'purchase') return 'شراء';
  return t;
};

const operationLabel = (o: string): string => {
  if (o === 'recharge') return 'إعادة شحن';
  if (o === 'renewal') return 'تجديد';
  if (o === 'activation') return 'تفعيل';
  return 'اتصالات';
};

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { ILS: '₪', USD: '$', JOD: 'JD', EGP: 'E£', SAR: 'SR' };
  const sym = symbols[currency] || currency;
  return `${sym}${amount.toFixed(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('ar', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

export default function CustomerViewPage() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) {
      setError('معرف الزبون مطلوب');
      setLoading(false);
      return;
    }

    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      setError('إعدادات الخادم غير متوفرة');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetch(`${supabaseUrl}/functions/v1/customer-portal?id=${encodeURIComponent(params.id)}`, { signal: controller.signal })
      .then(async (resp) => {
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || `تعذر جلب البيانات (${resp.status})`);
        }
        return resp.json();
      })
      .then((d: PortalResponse) => setData(d))
      .catch((e) => {
        clearTimeout(timeoutId);
        if (e.name === 'AbortError') setError('انتهت مهلة الاتصال — تحقق من الإنترنت وحاول مجدداً');
        else if (e.message === 'Customer not found') setError('الزبون غير موجود — تأكد من أن البيانات تمت مزامنتها من التطبيق');
        else if (e.message === 'Failed to fetch data') setError('تعذر جلب البيانات من الخادم — حاول لاحقاً');
        else setError(e.message || 'حدث خطأ غير متوقع');
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const timeline = useMemo(() => {
    if (!data) return [];
    const entries: { kind: 'txn' | 'sale'; date: number; item: TxnData | SaleData }[] = [
      ...data.transactions.map((t) => ({ kind: 'txn' as const, date: t.date, item: t })),
      ...data.telecomSales.map((s) => ({ kind: 'sale' as const, date: s.date, item: s })),
    ];
    entries.sort((a, b) => b.date - a.date);
    return entries;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { totalSpent: 0, totalPaid: 0, totalDebt: 0, count: 0 };
    let totalSpent = 0;
    let totalPaid = 0;
    for (const t of data.transactions) {
      if (t.type === 'sale') totalSpent += t.total;
      if (t.type === 'payment') totalPaid += t.paid;
    }
    for (const s of data.telecomSales) {
      totalSpent += s.total;
      totalPaid += s.paid;
    }
    return {
      totalSpent,
      totalPaid,
      totalDebt: Math.max(0, data.customer.debt),
      count: data.transactions.length + data.telecomSales.length,
    };
  }, [data]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.loadingText, { color: COLORS.textMuted }]}>جاري تحميل السجل...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <BookOpen size={48} color={COLORS.danger} strokeWidth={1.5} />
        <Text style={[styles.errorTitle, { color: COLORS.text }]}>{error}</Text>
        <Text style={[styles.errorHint, { color: COLORS.textMuted }]}>
          تأكد من صحة الرابط وأن البيانات تمت مزامنتها
        </Text>
      </View>
    );
  }

  if (!data) return null;

  const c = data.customer;
  const isVip = c.tier === 'vip';

  return (
    <ScrollView style={[styles.container, { backgroundColor: COLORS.bg }]} contentContainerStyle={styles.content}>
      {/* Header card */}
      <View style={[styles.headerCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        <View style={[styles.avatar, { backgroundColor: isVip ? COLORS.accent + '25' : COLORS.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: isVip ? COLORS.accent : COLORS.primary }]}>
            {c.name.charAt(0)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: COLORS.text }]}>{c.name}</Text>
            {isVip && <Crown size={16} color={COLORS.accent} strokeWidth={2} />}
          </View>
          <View style={styles.phoneRow}>
            <Phone size={13} color={COLORS.textMuted} strokeWidth={2} />
            <Text style={[styles.phone, { color: COLORS.textMuted }]}>{c.phone}</Text>
          </View>
        </View>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={<TrendingUp size={18} color={COLORS.primary} strokeWidth={2} />}
          label="إجمالي المشتريات"
          value={formatCurrency(stats.totalSpent, data.currency)}
          color={COLORS.primary}
        />
        <SummaryCard
          icon={<Check size={18} color={COLORS.success} strokeWidth={2} />}
          label="إجمالي المدفوع"
          value={formatCurrency(stats.totalPaid, data.currency)}
          color={COLORS.success}
        />
        <SummaryCard
          icon={<TrendingDown size={18} color={stats.totalDebt > 0 ? COLORS.danger : COLORS.success} strokeWidth={2} />}
          label="إجمالي الدين"
          value={formatCurrency(stats.totalDebt, data.currency)}
          color={stats.totalDebt > 0 ? COLORS.danger : COLORS.success}
        />
        <SummaryCard
          icon={<Wallet size={18} color={COLORS.primary} strokeWidth={2} />}
          label="رصيد التطبيق"
          value={formatCurrency(c.appBalance ?? 0, data.currency)}
          color={COLORS.primary}
        />
        <SummaryCard
          icon={<Wallet size={18} color={COLORS.success} strokeWidth={2} />}
          label="الرصيد النقدي"
          value={formatCurrency(c.cashBalance ?? 0, data.currency)}
          color={COLORS.success}
        />
      </View>

      {/* Loyalty */}
      {c.loyaltyPoints > 0 && (
        <View style={[styles.loyaltyCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          <View style={styles.loyaltyLeft}>
            <View style={[styles.loyaltyIcon, { backgroundColor: COLORS.accent + '20' }]}>
              <Star size={18} color={COLORS.accent} strokeWidth={2} />
            </View>
            <Text style={[styles.loyaltyLabel, { color: COLORS.textSecondary }]}>نقاط الولاء</Text>
            <Text style={[styles.loyaltyValue, { color: COLORS.accent }]}>{c.loyaltyPoints} نقطة</Text>
          </View>
          <Gift size={20} color={COLORS.accent} strokeWidth={2} />
        </View>
      )}

      {/* Subscription info */}
      {(c.subscriptionNumber || c.subscriptionExpiry) && (
        <View style={[styles.subCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          {c.subscriptionNumber && (
            <View style={styles.subRow}>
              <Smartphone size={15} color={COLORS.primary} strokeWidth={2} />
              <Text style={[styles.subLabel, { color: COLORS.textSecondary }]}>رقم الاشتراك</Text>
              <Text style={[styles.subValue, { color: COLORS.text }]}>{c.subscriptionNumber}</Text>
            </View>
          )}
          {c.subscriptionExpiry && (
            <View style={styles.subRow}>
              <Calendar size={15} color={COLORS.primary} strokeWidth={2} />
              <Text style={[styles.subLabel, { color: COLORS.textSecondary }]}>تاريخ الانتهاء</Text>
              <Text style={[styles.subValue, { color: COLORS.text }]}>{formatDate(c.subscriptionExpiry)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Notes */}
      {c.notes ? (
        <View style={[styles.notesBox, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>ملاحظات</Text>
          <Text style={[styles.notesText, { color: COLORS.text }]}>{c.notes}</Text>
        </View>
      ) : null}

      {/* Timeline */}
      <Text style={[styles.sectionTitle, { color: COLORS.text }]}>
        السجل الكامل ({timeline.length})
      </Text>

      {timeline.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>لا توجد معاملات</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {timeline.map((entry, idx) => {
            if (entry.kind === 'txn') {
              return <TxnCard key={`t-${entry.item.id}`} txn={entry.item as TxnData} currency={data.currency} isLast={idx === timeline.length - 1} />;
            }
            return <SaleCard key={`s-${entry.item.id}`} sale={entry.item as SaleData} currency={data.currency} isLast={idx === timeline.length - 1} />;
          })}
        </View>
      )}

      <Text style={[styles.footer, { color: COLORS.textMuted }]}>
        هذه صفحة عامة للاطلاع فقط — تم إنشاؤها بواسطة تطبيق صاحب المتجر
      </Text>
    </ScrollView>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '15' }]}>
        {icon}
      </View>
      <Text style={[styles.summaryLabel, { color: COLORS.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function TxnCard({ txn, currency, isLast }: { txn: TxnData; currency: string; isLast: boolean }) {
  const isSale = txn.type === 'sale';
  const isPayment = txn.type === 'payment';
  const isReturn = txn.type === 'return';
  const color = isSale ? COLORS.primary : isPayment ? COLORS.success : isReturn ? COLORS.danger : COLORS.info;

  const icon = isSale ? <BookOpen size={15} color={color} strokeWidth={2} />
    : isPayment ? <Wallet size={15} color={color} strokeWidth={2} />
    : isReturn ? <TrendingDown size={15} color={color} strokeWidth={2} />
    : <Package size={15} color={color} strokeWidth={2} />;

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: COLORS.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: COLORS.surface, borderColor: color + '30' }]}>
        <View style={styles.timelineTop}>
          <View style={[styles.timelineIcon, { backgroundColor: color + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineType, { color: COLORS.text }]}>{txnTypeLabel(txn.type)}</Text>
            <View style={styles.timelineDateRow}>
              <Clock size={10} color={COLORS.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineDate, { color: COLORS.textMuted }]}>{formatDateTime(txn.date)}</Text>
            </View>
          </View>
          <Text style={[styles.timelineAmount, { color }]}>
            {isPayment ? '-' : ''}{formatCurrency(isPayment ? txn.paid : txn.total, currency)}
          </Text>
        </View>
        {isSale && txn.items.length > 0 && (
          <View style={[styles.timelineItems, { borderTopColor: COLORS.border }]}>
            {txn.items.slice(0, 4).map((item, i) => (
              <View key={i} style={styles.timelineItemRow}>
                <Text style={[styles.timelineItemName, { color: COLORS.textSecondary }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.timelineItemQty, { color: COLORS.textMuted }]}>{item.quantity}×</Text>
              </View>
            ))}
            {txn.items.length > 4 && (
              <Text style={[styles.timelineMore, { color: COLORS.textMuted }]}>+{txn.items.length - 4} صنف</Text>
            )}
          </View>
        )}
        <View style={styles.timelineFooter}>
          <Text style={[styles.timelineMethod, { color: COLORS.textMuted }]}>
            {paymentMethodLabel(txn.paymentMethod)}
          </Text>
          {txn.remaining > 0 && (
            <View style={[styles.debtBar, { backgroundColor: COLORS.danger + '15' }]}>
              <BookOpen size={11} color={COLORS.danger} strokeWidth={2} />
              <Text style={[styles.debtBarText, { color: COLORS.danger }]}>
                دين: {formatCurrency(txn.remaining, currency)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function SaleCard({ sale, currency, isLast }: { sale: SaleData; currency: string; isLast: boolean }) {
  const isRecharge = sale.operationType === 'recharge';
  const color = isRecharge ? COLORS.accent : COLORS.primary;
  const icon = isRecharge ? <TrendingUp size={15} color={color} strokeWidth={2} /> : <Smartphone size={15} color={color} strokeWidth={2} />;

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: COLORS.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: COLORS.surface, borderColor: color + '30' }]}>
        <View style={styles.timelineTop}>
          <View style={[styles.timelineIcon, { backgroundColor: color + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineType, { color: COLORS.text }]}>{operationLabel(sale.operationType)}</Text>
            <Text style={[styles.timelineSubType, { color: COLORS.textMuted }]} numberOfLines={1}>
              {sale.companyName} — {sale.bundleName || sale.simName}
              {sale.simNumber ? ` — ${sale.simNumber}` : ''}
            </Text>
            <View style={styles.timelineDateRow}>
              <Clock size={10} color={COLORS.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineDate, { color: COLORS.textMuted }]}>{formatDateTime(sale.date)}</Text>
            </View>
          </View>
          <Text style={[styles.timelineAmount, { color }]}>
            {formatCurrency(sale.total, currency)}
          </Text>
        </View>
        <View style={styles.timelineFooter}>
          <Text style={[styles.timelineMethod, { color: COLORS.textMuted }]}>
            {paymentMethodLabel(sale.paymentMethod)}
          </Text>
          {sale.remaining > 0 && (
            <View style={[styles.debtBar, { backgroundColor: COLORS.danger + '15' }]}>
              <BookOpen size={11} color={COLORS.danger} strokeWidth={2} />
              <Text style={[styles.debtBarText, { color: COLORS.danger }]}>
                دين: {formatCurrency(sale.remaining, currency)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  content: { padding: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 60 },
  loadingText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  errorTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', textAlign: 'center' },
  errorHint: { fontSize: 13, fontFamily: 'Cairo-Regular', textAlign: 'center', marginTop: 4 },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phone: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, minWidth: '47%', borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  summaryIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  summaryValue: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  loyaltyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  loyaltyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loyaltyIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loyaltyLabel: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  loyaltyValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  subCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12, gap: 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subLabel: { fontSize: 13, flex: 1, fontFamily: 'Cairo-Regular' },
  subValue: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  notesBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, fontFamily: 'Cairo-SemiBold' },
  notesText: { fontSize: 14, lineHeight: 22, fontFamily: 'Cairo-Regular' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 10 },
  emptyBox: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 10 },
  timelineLeft: { alignItems: 'center', paddingTop: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { width: 2, flex: 1, minHeight: 20, marginTop: 4 },
  timelineCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, gap: 6, marginBottom: 8 },
  timelineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  timelineIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  timelineType: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  timelineSubType: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  timelineDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  timelineDate: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  timelineAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  timelineItems: { borderTopWidth: 1, paddingTop: 6, gap: 3 },
  timelineItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineItemName: { fontSize: 12, flex: 1, fontFamily: 'Cairo-Regular' },
  timelineItemQty: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  timelineMore: { fontSize: 11, marginTop: 2, fontFamily: 'Cairo-Regular' },
  timelineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  timelineMethod: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  debtBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  debtBarText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 24, fontFamily: 'Cairo-Regular' },
});
