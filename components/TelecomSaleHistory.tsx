import { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Platform, useWindowDimensions } from 'react-native';
import {
  RefreshCw, Repeat, Pencil, Trash2, Receipt as ReceiptIcon,
  Signal, Zap, Users, Wallet, BookOpen, Check,
  HandCoins, TrendingUp, ScanLine, XCircle, PhoneCall, Bell, Clock, ChevronDown, ListFilter,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { TelecomSale, Settings, FollowUpStatus } from '@/types';

interface TelecomSaleHistoryProps {
  sales: TelecomSale[];
  settings: Settings;
  onRenew: (sale: TelecomSale) => void;
  onToggleAutoRenew: (sale: TelecomSale) => void;
  onEdit: (sale: TelecomSale) => void;
  onDelete: (sale: TelecomSale) => void;
  onReceipt: (sale: TelecomSale) => void;
  onCollectDebt: (sale: TelecomSale) => void;
  onCancelSale: (sale: TelecomSale) => void;
  onFollowUp: (sale: TelecomSale) => void;
  onOpenCustomer?: (customerId: string | null, customerPhone: string) => void;
  hideToolbar?: boolean;
  externalSearchQuery?: string;
  externalSortOrder?: 'newest' | 'oldest' | 'highest' | 'lowest';
  externalStatusFilter?: 'all' | 'paid' | 'unpaid' | 'followup' | 'cancelled';
  onSearchChange?: (q: string) => void;
  onSortChange?: (s: 'newest' | 'oldest' | 'highest' | 'lowest') => void;
  onStatusFilterChange?: (f: 'all' | 'paid' | 'unpaid' | 'followup' | 'cancelled') => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقدي',
  wallet: 'تطبيق',
  debt: 'دين',
  usdt: 'USDT',
};

function getSaleTypeLabel(sale: TelecomSale): string {
  if (sale.operationType === 'recharge') return 'إعادة شحن';
  if (sale.operationType === 'renewal') return 'تجديد';
  if (sale.operationType === 'cancelled') return 'ملغاة';
  if (sale.mode === 'sell_sim') {
    const simTypeLabel = sale.simType === 'plastic' ? 'بلاستيك' : sale.simType === 'electronic' ? 'إلكترونية' : '';
    return simTypeLabel ? `تفعيل رقم جديد (${simTypeLabel})` : 'تفعيل رقم جديد';
  }
  return 'تحديد رقم';
}

const FOLLOWUP_LABELS: Record<string, string> = {
  not_contacted: 'لم يتم',
  contacted: 'تم التواصل',
  reminder_scheduled: 'تذكير',
  collected: 'تم التحصيل',
};

const DURATION_LABELS: Record<string, string> = {
  '3_days': '3 أيام',
  week: 'أسبوع',
  '2_weeks': 'أسبوعين',
  '3_weeks': '3 أسابيع',
  month: 'شهر',
  '2_months': 'شهرين',
  '3_months': '3 شهور',
  offer: 'عرض',
};

const DURATION_DAYS: Record<string, number> = {
  '3_days': 3,
  week: 7,
  '2_weeks': 14,
  '3_weeks': 21,
  month: 30,
  '2_months': 60,
  '3_months': 90,
  offer: 0,
};

function chargeDurationToDays(duration: string): number {
  return DURATION_DAYS[duration] ?? 0;
}

export function getRemainingChargeDays(sale: TelecomSale): number | null {
  if (sale.operationType === 'cancelled') return null;
  const durationDays = chargeDurationToDays(sale.chargeDuration);
  if (durationDays <= 0) return null;
  const carryover = sale.carryoverDays ?? 0;
  const totalDays = durationDays + carryover;
  const elapsed = Math.floor((Date.now() - sale.createdAt) / 86400000);
  return Math.max(0, totalDays - elapsed);
}

function getRemainingDaysColor(remaining: number, colors: ReturnType<typeof useTheme>['colors']): string {
  if (remaining <= 0) return colors.danger;
  if (remaining <= 3) return colors.danger;
  if (remaining <= 7) return colors.warning;
  return colors.success;
}

function getFollowUpColor(status: string, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'collected': return colors.success;
    case 'contacted': return colors.info;
    case 'reminder_scheduled': return colors.warning;
    default: return colors.textMuted;
  }
}

function calcProfit(sale: TelecomSale): number {
  return sale.salePrice - sale.cost;
}

export function TelecomSaleHistory({
  sales, settings, onRenew, onToggleAutoRenew, onEdit, onDelete, onReceipt, onCollectDebt, onCancelSale, onFollowUp, onOpenCustomer,
  hideToolbar, externalSearchQuery, externalSortOrder, externalStatusFilter, onSearchChange, onSortChange, onStatusFilterChange,
}: TelecomSaleHistoryProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompactDesktop = Platform.OS === 'web' && width >= 900;
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'followup' | 'cancelled'>('all');
  const [internalSortOrder, setInternalSortOrder] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const statusFilter = externalStatusFilter !== undefined ? externalStatusFilter : internalStatusFilter;
  const sortOrder = externalSortOrder !== undefined ? externalSortOrder : internalSortOrder;

  const setSearchQuery = (v: string) => {
    if (onSearchChange) onSearchChange(v);
    setInternalSearchQuery(v);
  };
  const setStatusFilter = (f: typeof statusFilter) => {
    if (onStatusFilterChange) onStatusFilterChange(f);
    setInternalStatusFilter(f);
  };
  const setSortOrder = (s: typeof sortOrder) => {
    if (onSortChange) onSortChange(s);
    setInternalSortOrder(s);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSales = useMemo(() => {
    const result = sales.filter((sale) => {
      const matchesSearch = !normalizedQuery || [sale.simNumber, sale.customerName, sale.customerPhone, sale.companyName, sale.bundleName].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'paid' && sale.remaining <= 0)
        || (statusFilter === 'unpaid' && sale.remaining > 0)
        || (statusFilter === 'followup' && sale.followUpStatus !== 'collected' && sale.remaining > 0)
        || (statusFilter === 'cancelled' && sale.operationType === 'cancelled');
      return matchesSearch && matchesStatus;
    });
    return result.sort((a, b) => {
      if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
      if (sortOrder === 'highest') return b.total - a.total;
      if (sortOrder === 'lowest') return a.total - b.total;
      return b.createdAt - a.createdAt;
    });
  }, [normalizedQuery, sales, sortOrder, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const recentSales = filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setFilter = (filter: typeof statusFilter) => {
    setStatusFilter(filter);
    setPage(1);
  };

  if (sales.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد عمليات بعد</Text>
      </View>
    );
  }

  const filterOptions: { key: typeof statusFilter; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'all', label: 'الكل', count: sales.length, icon: <ListFilter size={14} color={statusFilter === 'all' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'paid', label: 'مدفوعة', count: sales.filter((sale) => sale.remaining <= 0).length, icon: <Check size={14} color={statusFilter === 'paid' ? '#FFFFFF' : colors.success} strokeWidth={2} /> },
    { key: 'unpaid', label: 'غير مدفوعة', count: sales.filter((sale) => sale.remaining > 0).length, icon: <BookOpen size={14} color={statusFilter === 'unpaid' ? '#FFFFFF' : colors.danger} strokeWidth={2} /> },
    { key: 'followup', label: 'تحتاج متابعة', count: sales.filter((sale) => sale.remaining > 0 && sale.followUpStatus !== 'collected').length, icon: <PhoneCall size={14} color={statusFilter === 'followup' ? '#FFFFFF' : colors.info} strokeWidth={2} /> },
    { key: 'cancelled', label: 'ملغاة', count: sales.filter((sale) => sale.operationType === 'cancelled').length, icon: <XCircle size={14} color={statusFilter === 'cancelled' ? '#FFFFFF' : colors.danger} strokeWidth={2} /> },
  ];

  return (
    <View>
      {!hideToolbar && (
      <View style={[styles.historyToolbar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <View style={styles.historySortRow}>
          {([
            { key: 'newest', label: 'الأحدث' },
            { key: 'oldest', label: 'الأقدم' },
            { key: 'highest', label: 'الأعلى' },
            { key: 'lowest', label: 'الأقل' },
          ] as const).map((option) => (
            <TouchableOpacity key={option.key} onPress={() => { setSortOrder(option.key); setPage(1); }} style={[styles.historySortChip, { backgroundColor: sortOrder === option.key ? colors.primary : colors.surface, borderColor: sortOrder === option.key ? colors.primary : colors.border }]} activeOpacity={0.7}>
              <Text style={[styles.historySortText, { color: sortOrder === option.key ? '#FFFFFF' : colors.textSecondary }]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { const sizes = [3, 5, 10, 999999]; const next = sizes[(sizes.indexOf(pageSize) + 1) % sizes.length]; setPageSize(next); setPage(1); }} style={[styles.historySortChip, { backgroundColor: colors.info + '15', borderColor: colors.info + '35' }]} activeOpacity={0.7}>
            <ChevronDown size={13} color={colors.info} strokeWidth={2} />
            <Text style={[styles.historySortText, { color: colors.info }]}>{pageSize > 1000 ? 'الكل' : pageSize}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.historySearch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScanLine size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={(value) => { setSearchQuery(value); setPage(1); }}
            placeholder="ابحث في سجل المعاملات..."
            placeholderTextColor={colors.textMuted}
            style={[styles.historySearchInput, { color: colors.text }]}
          />
        </View>
        <View style={styles.filterRow}>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => setFilter(option.key)}
              style={[styles.filterChip, { backgroundColor: statusFilter === option.key ? colors.primary : colors.surface, borderColor: statusFilter === option.key ? colors.primary : colors.border }]}
              activeOpacity={0.8}
            >
              {option.icon}
              <Text style={[styles.filterChipText, { color: statusFilter === option.key ? '#FFFFFF' : colors.textSecondary }]}>{option.label}</Text>
              <Text style={[styles.filterChipCount, { color: statusFilter === option.key ? '#FFFFFF' : colors.textMuted }]}>{option.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      )}
      {recentSales.length === 0 ? (
        <View style={styles.emptyWrap}><Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد نتائج مطابقة</Text></View>
      ) : isCompactDesktop ? (
      <View style={styles.tableScroll}>
        <View style={styles.tableInner}>
          {/* Header */}
          <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.col, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>رقم الهاتف</Text>
            <Text style={[styles.colCompany, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الشركة</Text>
            <Text style={[styles.col, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الشركة الفرعية</Text>
            <Text style={[styles.col, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الحزمة</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>المدة</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>النوع</Text>
            <Text style={[styles.col, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الزبون</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>التواصل</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الإجمالي</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>المدفوع</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الربح</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>الدفع</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>المتابعة</Text>
            <Text style={[styles.colSmall, styles.headerCell, { color: colors.textSecondary, borderLeftColor: colors.border }]}>التاريخ</Text>
            <Text style={[styles.colActionsWide, styles.headerCell, { color: colors.textSecondary }]}>إجراءات</Text>
          </View>
          {/* Rows */}
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {recentSales.map((sale) => {
              const profit = calcProfit(sale);
              const hasDebt = sale.remaining > 0;
              return (
                <View key={sale.id} style={[styles.tableRow, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.col, styles.bodyCell, styles.cellText, { color: colors.text, borderLeftColor: colors.border }]} numberOfLines={1}>{sale.simNumber}</Text>
                  <View style={[styles.colCompany, styles.bodyCell, { borderLeftColor: colors.border }]}>
                    <View style={[styles.companyDot, { backgroundColor: getCompanyColor(sale.companyName) }]} />
                    <Text style={[styles.cellText, { color: colors.text }]} numberOfLines={1}>{sale.companyName}</Text>
                  </View>
                  <Text style={[styles.col, styles.bodyCell, styles.cellText, { color: colors.textSecondary, borderLeftColor: colors.border }]} numberOfLines={1}>{sale.subAgentName}</Text>
                  <Text style={[styles.col, styles.bodyCell, styles.cellText, { color: colors.textSecondary, borderLeftColor: colors.border }]} numberOfLines={1}>{sale.bundleName || '-'}</Text>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellText, { color: colors.textMuted, borderLeftColor: colors.border }]} numberOfLines={1}>{DURATION_LABELS[sale.chargeDuration] || sale.chargeDuration || '-'}</Text>
                  <View style={[styles.colSmall, styles.bodyCell, { borderLeftColor: colors.border }]}>
                    <View style={[styles.payBadge, { backgroundColor: (sale.operationType === 'cancelled' ? colors.danger : sale.operationType === 'renewal' ? colors.info : colors.success) + '20' }]}>
                      <Text style={[styles.payBadgeText, { color: sale.operationType === 'cancelled' ? colors.danger : sale.operationType === 'renewal' ? colors.info : colors.success }]}>{getSaleTypeLabel(sale)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => onOpenCustomer?.(sale.customerId, sale.customerPhone)}
                    disabled={!onOpenCustomer}
                    style={[styles.col, styles.bodyCell, { borderLeftColor: colors.border }, onOpenCustomer && styles.clickableCell]}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.cellText, { color: onOpenCustomer ? colors.primary : colors.text, textDecorationLine: onOpenCustomer ? 'underline' : 'none' }]} numberOfLines={1}>{sale.customerName}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellTextSmall, { color: colors.textSecondary, borderLeftColor: colors.border }]} numberOfLines={1}>{sale.customerPhone || '-'}</Text>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellTextBold, { color: colors.primary, borderLeftColor: colors.border }]}>{formatCurrency(sale.total, settings.currency)}</Text>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellText, { color: colors.textSecondary, borderLeftColor: colors.border }]}>{formatCurrency(sale.paid, settings.currency)}</Text>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellTextBold, { color: profit > 0 ? colors.success : colors.danger, borderLeftColor: colors.border }]}>
                    {formatCurrency(profit, settings.currency)}
                  </Text>
                  <View style={[styles.colSmall, styles.bodyCell, { borderLeftColor: colors.border }]}>
                    <View style={[styles.payBadge, { backgroundColor: getPayColor(sale, colors) + '20' }]}>
                      <Text style={[styles.payBadgeText, { color: getPayColor(sale, colors) }]}>
                        {PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.colSmall, styles.bodyCell, { borderLeftColor: colors.border }]}>
                    <View style={[styles.payBadge, { backgroundColor: getFollowUpColor(sale.followUpStatus, colors) + '20' }]}>
                      <Text style={[styles.payBadgeText, { color: getFollowUpColor(sale.followUpStatus, colors) }]}>{FOLLOWUP_LABELS[sale.followUpStatus] || 'لم يتم'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.colSmall, styles.bodyCell, styles.cellTextSmall, { color: colors.textMuted, borderLeftColor: colors.border }]}>{formatDateTime(sale.createdAt)}</Text>
                  <View style={[styles.colActionsWide, styles.bodyCell]}>
                    <View style={styles.actionRow}>
                      <ActionBtn icon="renew" color={colors.primary} onPress={() => onRenew(sale)} />
                      <ActionBtn icon="auto" color={sale.autoRenew ? colors.success : colors.textMuted} onPress={() => onToggleAutoRenew(sale)} active={sale.autoRenew} />
                      <ActionBtn icon="edit" color={colors.accent} onPress={() => onEdit(sale)} />
                      {hasDebt && <ActionBtn icon="collect" color={colors.warning} onPress={() => onCollectDebt(sale)} />}
                      {hasDebt && <ActionBtn icon="followup" color={colors.info} onPress={() => onFollowUp(sale)} />}
                      {sale.operationType !== 'cancelled' && <ActionBtn icon="cancel" color={colors.danger} onPress={() => onCancelSale(sale)} />}
                      <ActionBtn icon="delete" color={colors.danger} onPress={() => onDelete(sale)} />
                      <ActionBtn icon="receipt" color={colors.info} onPress={() => onReceipt(sale)} />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
      ) : (
    <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>

      {recentSales.map((sale) => {
        const profit = calcProfit(sale);
        const hasDebt = sale.remaining > 0;
        const cardFields: React.ReactNode[] = [
          <View key="customer" style={[styles.cardRow, styles.cardRowFull]}>
            <Users size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.cardRowLabel, { color: colors.textSecondary }]}>الزبون</Text>
            <TouchableOpacity onPress={() => onOpenCustomer?.(sale.customerId, sale.customerPhone)} disabled={!onOpenCustomer} activeOpacity={0.6} style={{ flex: 1 }}>
              <Text
                style={[styles.cardRowValue, { color: onOpenCustomer ? colors.primary : colors.text, textDecorationLine: onOpenCustomer ? 'underline' : 'none' }]}
                numberOfLines={2}
              >
                {sale.customerName} ({sale.customerPhone})
              </Text>
            </TouchableOpacity>
          </View>,
          <CardRow key="sim" icon={<Signal size={14} color={colors.textSecondary} strokeWidth={2} />} label="رقم الهاتف" value={sale.simNumber} colors={colors} />,
          sale.barcode ? <CardRow key="barcode" icon={<ScanLine size={14} color={colors.textSecondary} strokeWidth={2} />} label="باركود" value={sale.barcode} colors={colors} /> : null,
          <CardRow key="bundle" icon={<Zap size={14} color={colors.textSecondary} strokeWidth={2} />} label="الحزمة" value={sale.bundleName || '-'} colors={colors} />,
          <CardRow key="duration" icon={<Clock size={14} color={colors.textSecondary} strokeWidth={2} />} label="المدة" value={DURATION_LABELS[sale.chargeDuration] || sale.chargeDuration || '-'} colors={colors} />,
          <CardRow key="opType" icon={<Signal size={14} color={colors.textSecondary} strokeWidth={2} />} label="النوع" value={getSaleTypeLabel(sale)} colors={colors} />,
          <CardRow key="total" icon={<Wallet size={14} color={colors.textSecondary} strokeWidth={2} />} label="الإجمالي" value={formatCurrency(sale.total, settings.currency)} colors={colors} bold />,
          <CardRow key="paid" icon={<HandCoins size={14} color={colors.textSecondary} strokeWidth={2} />} label="المدفوع" value={formatCurrency(sale.paid, settings.currency)} colors={colors} />,
          <CardRow key="profit" icon={<TrendingUp size={14} color={profit > 0 ? colors.success : colors.danger} strokeWidth={2} />} label="الربح" value={formatCurrency(profit, settings.currency)} colors={colors} profitColor={profit > 0 ? colors.success : colors.danger} />,
          <CardRow key="payMethod" icon={<CreditCardLabel colors={colors} />} label="نوع الدفع" value={PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod} colors={colors} />,
          hasDebt ? <CardRow key="debt" icon={<BookOpen size={14} color={colors.danger} strokeWidth={2} />} label="المتبقي (دين)" value={formatCurrency(sale.remaining, settings.currency)} colors={colors} danger /> : null,
          (() => {
            const remDays = getRemainingChargeDays(sale);
            if (remDays === null) return null;
            const dayColor = getRemainingDaysColor(remDays, colors);
            return <CardRow key="remDays" icon={<Clock size={14} color={dayColor} strokeWidth={2} />} label="المتبقي (أيام)" value={`${remDays} يوم`} colors={colors} profitColor={dayColor} />;
          })(),
          <CardRow key="followup" icon={<PhoneCall size={14} color={getFollowUpColor(sale.followUpStatus, colors)} strokeWidth={2} />} label="المتابعة" value={FOLLOWUP_LABELS[sale.followUpStatus] || 'لم يتم'} colors={colors} />,
          sale.renewedFromId ? <CardRow key="autoRenew" icon={<RefreshCw size={14} color={colors.info} strokeWidth={2} />} label="نوع العملية" value="تجديد تلقائي" colors={colors} /> : null,
          sale.operationType === 'cancelled' && sale.cancellationDeduction > 0 ? <CardRow key="cancelDeduct" icon={<XCircle size={14} color={colors.danger} strokeWidth={2} />} label="مخصوم الإلغاء" value={formatCurrency(sale.cancellationDeduction, settings.currency)} colors={colors} danger /> : null,
          sale.notes ? <CardRow key="notes" icon={<Pencil size={14} color={colors.textMuted} strokeWidth={2} />} label="ملاحظات" value={sale.notes} colors={colors} fullWidth /> : null,
        ];
        const cardActions: React.ReactNode[] = [
          <CardAction key="renew" icon="renew" label="تجديد" color={colors.primary} onPress={() => onRenew(sale)} />,
          <CardAction key="auto" icon="auto" label="تلقائي" color={sale.autoRenew ? colors.success : colors.textMuted} onPress={() => onToggleAutoRenew(sale)} active={sale.autoRenew} />,
          <CardAction key="edit" icon="edit" label="تعديل" color={colors.accent} onPress={() => onEdit(sale)} />,
          hasDebt ? <CardAction key="collect" icon="collect" label="تحصيل" color={colors.warning} onPress={() => onCollectDebt(sale)} /> : null,
          hasDebt ? <CardAction key="followup" icon="followup" label="متابعة" color={colors.info} onPress={() => onFollowUp(sale)} /> : null,
          sale.operationType !== 'cancelled' ? <CardAction key="cancel" icon="cancel" label="إلغاء" color={colors.danger} onPress={() => onCancelSale(sale)} /> : null,
          <CardAction key="delete" icon="delete" label="حذف" color={colors.danger} onPress={() => onDelete(sale)} />,
          <CardAction key="receipt" icon="receipt" label="وصل" color={colors.info} onPress={() => onReceipt(sale)} />,
        ];
        return (
          <View key={sale.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.companyDot, { backgroundColor: getCompanyColor(sale.companyName) }]} />
                <Text style={[styles.cardCompany, { color: colors.text }]} numberOfLines={1}>{sale.companyName || 'غير محدد'}</Text>
                <View style={[styles.opBadge, { backgroundColor: (sale.operationType === 'cancelled' ? colors.danger : sale.operationType === 'renewal' ? colors.info : colors.success) + '20' }]}>
                  <Text style={[styles.opBadgeText, { color: sale.operationType === 'cancelled' ? colors.danger : sale.operationType === 'renewal' ? colors.info : colors.success }]}>{getSaleTypeLabel(sale)}</Text>
                </View>
              </View>
              <Text style={[styles.cardDate, { color: colors.textMuted }]}>{formatDateTime(sale.createdAt)}</Text>
            </View>

            <View style={styles.cardBody}>{cardFields.filter(Boolean)}</View>

            <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
              {cardActions.filter(Boolean)}
            </View>
          </View>
        );
      })}
    </ScrollView>
      )}
      {filteredSales.length > 0 && (
        <View style={[styles.pagination, { borderTopColor: colors.border }]}>
          <TouchableOpacity disabled={currentPage <= 1} onPress={() => setPage((value) => Math.max(1, value - 1))} style={[styles.pageButton, { backgroundColor: currentPage <= 1 ? colors.surfaceAlt : colors.primary }]}>
            <Text style={[styles.pageButtonText, { color: currentPage <= 1 ? colors.textMuted : '#FFFFFF' }]}>السابق</Text>
          </TouchableOpacity>
          <Text style={[styles.pageText, { color: colors.textSecondary }]}>صفحة {currentPage} من {pageCount} — {filteredSales.length} عملية</Text>
          <TouchableOpacity disabled={currentPage >= pageCount} onPress={() => setPage((value) => Math.min(pageCount, value + 1))} style={[styles.pageButton, { backgroundColor: currentPage >= pageCount ? colors.surfaceAlt : colors.primary }]}>
            <Text style={[styles.pageButtonText, { color: currentPage >= pageCount ? colors.textMuted : '#FFFFFF' }]}>التالي</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SummaryCard({ label, value, color, colors }: { label: string; value: string; color: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function CreditCardLabel({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return <Wallet size={14} color={colors.textSecondary} strokeWidth={2} />;
}

function CardRow({ icon, label, value, colors, bold, danger, profitColor, fullWidth }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
  bold?: boolean;
  danger?: boolean;
  profitColor?: string;
  fullWidth?: boolean;
}) {
  return (
    <View style={[styles.cardRow, fullWidth && styles.cardRowFull]}>
      {icon}
      <Text style={[styles.cardRowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.cardRowValue,
          { color: danger ? colors.danger : profitColor ?? colors.text },
          bold && { fontWeight: '700', fontFamily: 'Cairo-Bold' },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionBtn({ icon, color, onPress, active }: { icon: string; color: string; onPress: () => void; active?: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    renew: <RefreshCw size={15} color={color} strokeWidth={2} />,
    auto: <Repeat size={15} color={color} strokeWidth={2} />,
    edit: <Pencil size={15} color={color} strokeWidth={2} />,
    collect: <HandCoins size={15} color={color} strokeWidth={2} />,
    followup: <PhoneCall size={15} color={color} strokeWidth={2} />,
    cancel: <XCircle size={15} color={color} strokeWidth={2} />,
    delete: <Trash2 size={15} color={color} strokeWidth={2} />,
    receipt: <ReceiptIcon size={15} color={color} strokeWidth={2} />,
  };
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionBtn} activeOpacity={0.7}>
      {icons[icon]}
      {icon === 'auto' && active && <Check size={10} color={color} strokeWidth={3} style={styles.autoCheck} />}
    </TouchableOpacity>
  );
}

function CardAction({ icon, label, color, onPress, active }: { icon: string; label: string; color: string; onPress: () => void; active?: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    renew: <RefreshCw size={16} color={color} strokeWidth={2} />,
    auto: <Repeat size={16} color={color} strokeWidth={2} />,
    edit: <Pencil size={16} color={color} strokeWidth={2} />,
    collect: <HandCoins size={16} color={color} strokeWidth={2} />,
    followup: <PhoneCall size={16} color={color} strokeWidth={2} />,
    cancel: <XCircle size={16} color={color} strokeWidth={2} />,
    delete: <Trash2 size={16} color={color} strokeWidth={2} />,
    receipt: <ReceiptIcon size={16} color={color} strokeWidth={2} />,
  };
  return (
    <TouchableOpacity onPress={onPress} style={styles.cardActionBtn} activeOpacity={0.7}>
      {icons[icon]}
      <Text style={[styles.cardActionText, { color }]}>{label}</Text>
      {icon === 'auto' && active && <View style={[styles.activeDot, { backgroundColor: color }]} />}
    </TouchableOpacity>
  );
}

function getCompanyColor(name: string): string {
  const palette = ['#E63946', '#2A9D8F', '#F77F00', '#3A86FF', '#FB5607', '#06A77D', '#7209B7', '#8338EC'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function getPayColor(sale: TelecomSale, colors: ReturnType<typeof useTheme>['colors']): string {
  if (sale.paymentMethod === 'debt' || sale.remaining > 0) return colors.danger;
  if (sale.paymentMethod === 'wallet') return colors.info;
  if (sale.paymentMethod === 'usdt') return colors.accent;
  return colors.success;
}

const styles = StyleSheet.create({
  emptyWrap: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  historyToolbar: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, gap: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryCard: { minWidth: 130, flexGrow: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  summaryLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  summaryValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 2 },
  historySortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  historySortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  historySortText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  historySearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  historySearchInput: { flex: 1, minHeight: 44, fontSize: 13, fontFamily: 'Cairo-Regular', textAlign: 'right' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7, flexGrow: 1, justifyContent: 'center', minWidth: 92 },
  filterChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  filterChipCount: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderTopWidth: 1, marginTop: 8, paddingTop: 10 },
  pageButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 },
  pageButtonText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  pageText: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  // Table (web)
  tableScroll: { width: '100%', maxWidth: '100%', overflow: 'hidden', borderRadius: 12 },
  tableInner: { width: '100%', writingDirection: 'rtl' },
  tableHeader: { flexDirection: 'row', width: '100%', minHeight: 42, paddingVertical: 7, borderBottomWidth: 1, alignItems: 'center' },
  tableRow: { flexDirection: 'row', width: '100%', minHeight: 48, paddingVertical: 6, borderBottomWidth: 1, alignItems: 'center' },
  headerCell: { textAlign: 'center', textAlignVertical: 'center', borderLeftWidth: 1, fontWeight: '700', fontFamily: 'Cairo-Bold', fontSize: 12, lineHeight: 18, paddingHorizontal: 3 },
  bodyCell: { textAlign: 'center', textAlignVertical: 'center', borderLeftWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  colCompany: { flex: 0.9, minWidth: 75, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  col: { flex: 0.85, minWidth: 85, overflow: 'hidden' },
  colSmall: { flex: 0.6, minWidth: 62, overflow: 'hidden' },
  colActionsWide: { flex: 1.3, minWidth: 150 },
  cellText: { fontSize: 12, lineHeight: 18, fontFamily: 'Cairo-Regular' },
  cellTextBold: { fontSize: 12, lineHeight: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cellTextSmall: { fontSize: 11, lineHeight: 17, fontFamily: 'Cairo-Regular' },
  companyDot: { width: 9, height: 9, borderRadius: 4.5 },
  payBadge: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5 },
  payBadgeText: { fontSize: 11, lineHeight: 16, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center', width: '100%' },
  actionBtn: { width: 24, height: 24, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  clickableCell: { cursor: 'pointer' },
  autoCheck: { position: 'absolute', bottom: -2, right: -2 },
  // Card (mobile)
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  cardCompany: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', flexShrink: 1 },
  opBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  opBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cardDate: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  cardBody: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 12, columnGap: 8, rowGap: 6 },
  cardRow: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  cardRowFull: { width: '100%' },
  cardRowLabel: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  cardRowValue: { fontSize: 13, flex: 1, textAlign: 'left', fontFamily: 'Cairo-Regular' },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 6 },
  cardActionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  cardActionText: { fontSize: 10, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  activeDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
