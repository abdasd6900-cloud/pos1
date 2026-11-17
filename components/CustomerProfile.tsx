import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Platform, TextInput,
  ScrollView,
} from 'react-native';
import * as XLSX from 'xlsx';
import {
  Phone, Wallet, Crown, Star, Clock, Calendar, BookOpen,
  Undo2, Package, MessageSquare, PlusCircle, Check, Smartphone,
  TrendingUp, ArrowUpRight, ArrowDownRight, Receipt,
  Download, Share2, X, Pencil, Trash2, AlertCircle,
} from 'lucide-react-native';
import { BaseModal } from './BaseModal';
import { Badge } from './Badge';
import { ConfirmDialog } from './ConfirmDialog';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import {
  formatCurrency, formatDateTime, getDebtAgeLevel,
  daysUntilExpiry, formatExpiry, fillSmsTemplate,
} from '@/lib/format';
import { exportXlsx } from '@/lib/xlsx-export';
import type { Customer, Transaction, TelecomSale, PaymentStatus } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

type TimelineEntry =
  | { kind: 'transaction'; date: number; item: Transaction }
  | { kind: 'telecom_sale'; date: number; item: TelecomSale };

interface Stats {
  totalSpent: number;
  totalPaid: number;
  totalDebt: number;
  totalRecharged: number;
  transactionCount: number;
  telecomCount: number;
  lastActivity: number | null;
  firstActivity: number | null;
}

function computeStats(transactions: Transaction[], telecomSales: TelecomSale[]): Stats {
  let totalSpent = 0;
  let totalPaid = 0;
  let totalRecharged = 0;
  const dates: number[] = [];

  for (const t of transactions) {
    if (t.type === 'sale') totalSpent += t.total;
    if (t.type === 'payment') totalPaid += t.paid;
    dates.push(t.createdAt);
  }
  for (const s of telecomSales) {
    if (s.operationType !== 'cancelled') {
      totalSpent += s.total;
      totalPaid += s.paid;
      if (s.operationType === 'recharge') totalRecharged += s.total;
    }
    dates.push(s.createdAt);
  }

  dates.sort((a, b) => a - b);

  return {
    totalSpent,
    totalPaid,
    totalDebt: 0,
    totalRecharged,
    transactionCount: transactions.length,
    telecomCount: telecomSales.length,
    lastActivity: dates.length > 0 ? dates[dates.length - 1] : null,
    firstActivity: dates.length > 0 ? dates[0] : null,
  };
}

function getDebtAgeColor(debt: number, createdAt: number, colors: Colors): string {
  if (debt <= 0) return colors.success;
  const level = getDebtAgeLevel(createdAt);
  switch (level) {
    case 'fresh': return colors.success;
    case 'warning': return colors.warning;
    case 'critical': return colors.danger;
  }
  return colors.success;
}

function telecomSaleLabel(s: TelecomSale): string {
  if (s.operationType === 'cancelled') return 'ملغاة';
  if (s.operationType === 'recharge') return 'إعادة شحن';
  if (s.operationType === 'renewal') return 'تجديد';
  if (s.mode === 'sell_sim') {
    const simTypeLabel = s.simType === 'plastic' ? 'بلاستيك' : s.simType === 'electronic' ? 'إلكترونية' : '';
    return simTypeLabel ? `تفعيل (${simTypeLabel})` : 'تفعيل رقم جديد';
  }
  return 'تحديد رقم';
}

function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'paid_full': return 'مدفوع';
    case 'paid_partial': return 'مدفوع جزئي';
    case 'unpaid': return 'دين';
  }
  return status;
}

function paymentStatusColor(status: PaymentStatus, colors: Colors): string {
  switch (status) {
    case 'paid_full': return colors.success;
    case 'paid_partial': return colors.warning;
    case 'unpaid': return colors.danger;
  }
  return colors.textMuted;
}

function calcDaysRemaining(sale: TelecomSale): number | null {
  if (sale.operationType === 'cancelled') return 0;
  const totalDays = sale.carryoverDays || 30;
  const elapsed = Math.floor((Date.now() - sale.createdAt) / 86400000);
  return Math.max(0, totalDays - elapsed);
}


interface CustomerProfileProps {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onPayment: (customer: Customer) => void;
  onTopUp: (customer: Customer) => void;
  onAddDebt: (customer: Customer) => void;
  onRedeem: (customerId: string, points: number) => void;
}

export function CustomerProfile({
  visible, customer, onClose, onEdit, onPayment, onTopUp, onAddDebt, onRedeem,
}: CustomerProfileProps) {
  const { transactions, telecomSales, settings, deleteTelecomSale, cancelTelecomSale, editTelecomSalePrice, collectTelecomSaleDebt, addCustomerBalance } = useApp();
  const { colors } = useTheme();
  const [showExport, setShowExport] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [editPriceTarget, setEditPriceTarget] = useState<TelecomSale | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<TelecomSale | null>(null);
  const [collectTarget, setCollectTarget] = useState<TelecomSale | null>(null);
  const [collectAmount, setCollectAmount] = useState('');

  const customerTransactions = useMemo(() => {
    if (!customer) return [];
    return transactions.filter((t) => t.customerId === customer.id || (t.customerName.trim() && t.customerName.trim() === customer.name.trim()));
  }, [customer, transactions]);

  const customerTelecomSales = useMemo(() => {
    if (!customer) return [];
    return telecomSales.filter((s) => s.customerId === customer.id || s.customerPhone === customer.phone);
  }, [customer, telecomSales]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...customerTransactions.map((t) => ({ kind: 'transaction' as const, date: t.createdAt, item: t })),
      ...customerTelecomSales.map((s) => ({ kind: 'telecom_sale' as const, date: s.createdAt, item: s })),
    ];
    entries.sort((a, b) => b.date - a.date);
    return entries;
  }, [customerTransactions, customerTelecomSales]);

  const stats = useMemo(
    () => computeStats(customerTransactions, customerTelecomSales),
    [customerTransactions, customerTelecomSales],
  );

  if (!customer) return null;

  const isVip = customer.tier === 'vip';
  const debtColor = getDebtAgeColor(customer.debt, customer.createdAt, colors);
  const expiryDays = daysUntilExpiry(customer.subscriptionExpiry);
  const isExpiringSoon = expiryDays !== null && expiryDays <= settings.expiryAlertDays && expiryDays >= 0;
  const isExpired = expiryDays !== null && expiryDays < 0;
  const isWeb = Platform.OS === 'web';

  const handleExportRecord = () => {
    if (!customer) return;
    const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : 0;
    const toTs = toDate ? new Date(toDate + 'T23:59:59').getTime() : Date.now();
    const filteredTxns = customerTransactions.filter((t) => t.createdAt >= fromTs && t.createdAt <= toTs);
    const filteredSales = customerTelecomSales.filter((s) => s.createdAt >= fromTs && s.createdAt <= toTs);
    const rows: Record<string, string | number>[] = [];
    for (const t of filteredTxns) {
      rows.push({
        'التاريخ': formatDateTime(t.createdAt),
        'النوع': t.type === 'sale' ? 'بيع' : t.type === 'payment' ? 'دفعة' : t.type === 'return' ? 'مرتجع' : 'شراء',
        'التفاصيل': t.items.map((i) => `${i.name} (${i.quantity}×)`).join('، '),
        'الإجمالي': t.total,
        'المدفوع': t.paid,
        'المتبقي': t.remaining,
      });
    }
    for (const s of filteredSales) {
      rows.push({
        'التاريخ': formatDateTime(s.createdAt),
        'النوع': telecomSaleLabel(s),
        'التفاصيل': `${s.companyName} — ${s.bundleName || s.simName}${s.simNumber ? ` — ${s.simNumber}` : ''}`,
        'الإجمالي': s.total,
        'المدفوع': s.paid,
        'المتبقي': s.remaining,
      });
    }
    if (rows.length === 0) return;
    rows.sort((a, b) => String(a['التاريخ']).localeCompare(String(b['التاريخ'])));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'السجل');
    exportXlsx(wb, `سجل_${customer.name}_${fromDate || 'البداية'}_${toDate || 'اليوم'}.xlsx`).catch(() => {});
  };

  const handleShareLink = () => {
    if (!customer) return;
    if (Platform.OS === 'web') {
      const url = `${window.location.origin}/customer-view?id=${customer.id}`;
      navigator.clipboard?.writeText(url).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      }).catch(() => {});
    }
  };

  const sendSmsReminder = () => {
    const message = fillSmsTemplate(settings.smsTemplate, {
      name: customer.name,
      sub: customer.subscriptionNumber || '—',
      amount: formatCurrency(customer.debt, settings.currency),
      debt: formatCurrency(customer.debt, settings.currency),
    });
    const encoded = encodeURIComponent(message);
    if (Platform.OS !== 'web') {
      Linking.openURL(`sms:${customer.phone}?body=${encoded}`);
    }
  };

  const callCustomer = () => {
    if (Platform.OS !== 'web') {
      Linking.openURL(`tel:${customer.phone}`);
    }
  };

  const totalDebtWithTelecom = customer.debt +
    customerTelecomSales.filter((s) => s.remaining > 0 && s.operationType !== 'cancelled').reduce((sum, s) => sum + s.remaining, 0);

  const handleEditPrice = () => {
    if (!editPriceTarget) return;
    const val = parseFloat(editPriceValue);
    if (!val || val <= 0) return;
    editTelecomSalePrice(editPriceTarget.id, val);
    setEditPriceTarget(null);
    setEditPriceValue('');
  };

  const handleDeleteSale = () => {
    if (!deleteSaleTarget) return;
    deleteTelecomSale(deleteSaleTarget.id);
    setDeleteSaleTarget(null);
  };

  const handleCollectDebt = () => {
    if (!collectTarget) return;
    const val = parseFloat(collectAmount);
    if (!val || val <= 0) return;
    collectTelecomSaleDebt(collectTarget.id, val);
    setCollectTarget(null);
    setCollectAmount('');
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="ملف العميل"
    >
      <View>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.avatarLarge, { backgroundColor: isVip ? colors.accent + '25' : colors.primary + '20' }]}>
            <Text style={[styles.avatarLargeText, { color: isVip ? colors.accent : colors.primary }]}>
              {customer.name.charAt(0)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.detailName, { color: colors.text }]}>{customer.name}</Text>
              {isVip && <Crown size={16} color={colors.accent} strokeWidth={2} />}
            </View>
            <View style={styles.phoneRow}>
              <Phone size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.detailPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
            </View>
            {isVip && (
              <View style={{ marginTop: 4 }}>
                <Badge label="عميل مميز VIP" color={colors.accent} bg={colors.accent + '20'} size="md" />
              </View>
            )}
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActionsBar}>
          <TouchableOpacity
            onPress={() => onTopUp(customer)}
            style={[styles.quickActionBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <PlusCircle size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>شحن رصيد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onAddDebt(customer)}
            style={[styles.quickActionBtn, { backgroundColor: colors.danger }]}
            activeOpacity={0.8}
          >
            <BookOpen size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>دين جديد</Text>
          </TouchableOpacity>
          {totalDebtWithTelecom > 0 && (
            <TouchableOpacity
              onPress={() => onPayment(customer)}
              style={[styles.quickActionBtn, { backgroundColor: colors.success }]}
              activeOpacity={0.8}
            >
              <Wallet size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.quickActionText}>تسديد دين</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={sendSmsReminder}
            style={[styles.quickActionBtn, { backgroundColor: colors.info }]}
            activeOpacity={0.8}
          >
            <MessageSquare size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>تذكير</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowExport((v) => !v)}
            style={[styles.quickActionBtn, { backgroundColor: colors.info }]}
            activeOpacity={0.8}
          >
            <Download size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>تصدير</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareLink}
            style={[styles.quickActionBtn, { backgroundColor: linkCopied ? colors.success : colors.accent }]}
            activeOpacity={0.8}
          >
            {linkCopied ? <Check size={18} color="#FFFFFF" strokeWidth={2} /> : <Share2 size={18} color="#FFFFFF" strokeWidth={2} />}
            <Text style={styles.quickActionText}>{linkCopied ? 'تم النسخ' : 'رابط'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onEdit(customer)}
            style={[styles.quickActionBtn, { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.8}
          >
            <Receipt size={18} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>تعديل</Text>
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon={<TrendingUp size={18} color={colors.primary} strokeWidth={2} />}
            label="إجمالي المشتريات"
            value={formatCurrency(stats.totalSpent, settings.currency)}
            color={colors.primary}
            colors={colors}
          />
          <SummaryCard
            icon={<Check size={18} color={colors.success} strokeWidth={2} />}
            label="إجمالي المدفوع"
            value={formatCurrency(stats.totalPaid, settings.currency)}
            color={colors.success}
            colors={colors}
          />
          <SummaryCard
            icon={<BookOpen size={18} color={customer.debt > 0 ? debtColor : colors.success} strokeWidth={2} />}
            label="الدين الحالي"
            value={formatCurrency(customer.debt, settings.currency)}
            color={customer.debt > 0 ? debtColor : colors.success}
            colors={colors}
          />
          <SummaryCard
            icon={<Wallet size={18} color={colors.primary} strokeWidth={2} />}
            label="الرصيد المسبق"
            value={formatCurrency(customer.balance, settings.currency)}
            color={colors.primary}
            colors={colors}
          />
          {settings.enableLoyalty && (
            <SummaryCard
              icon={<Star size={18} color={colors.accent} strokeWidth={2} />}
              label="نقاط الولاء"
              value={`${customer.loyaltyPoints}`}
              color={colors.accent}
              colors={colors}
              onPress={customer.loyaltyPoints > 0 ? () => onRedeem(customer.id, customer.loyaltyPoints) : undefined}
              actionLabel={customer.loyaltyPoints > 0 ? 'استبدال' : undefined}
            />
          )}
        </View>

        {/* Subscription info */}
        {settings.businessMode === 'telecom' && (customer.subscriptionNumber || customer.subscriptionExpiry) && (
          <View style={[styles.subCard, { backgroundColor: colors.surfaceAlt }]}>
            <View style={styles.subCardRow}>
              <Clock size={16} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.subCardLabel, { color: colors.textSecondary }]}>رقم الاشتراك</Text>
              <Text style={[styles.subCardValue, { color: colors.text }]}>{customer.subscriptionNumber || '—'}</Text>
            </View>
            <View style={styles.subCardRow}>
              <Calendar size={16} color={isExpired ? colors.danger : isExpiringSoon ? colors.warning : colors.primary} strokeWidth={2} />
              <Text style={[styles.subCardLabel, { color: colors.textSecondary }]}>تاريخ الانتهاء</Text>
              <Text style={[styles.subCardValue, { color: isExpired ? colors.danger : colors.text }]}>
                {formatExpiry(customer.subscriptionExpiry)}
              </Text>
            </View>
          </View>
        )}

        {/* Activity dates */}
        {stats.firstActivity && stats.lastActivity && (
          <View style={styles.activityDatesRow}>
            <View style={styles.activityDateItem}>
              <ArrowDownRight size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.activityDateText, { color: colors.textMuted }]}>
                أول تعامل: {formatDateTime(stats.firstActivity)}
              </Text>
            </View>
            <View style={styles.activityDateItem}>
              <ArrowUpRight size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.activityDateText, { color: colors.textMuted }]}>
                آخر تعامل: {formatDateTime(stats.lastActivity)}
              </Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {customer.notes ? (
          <View style={[styles.notesBox, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ملاحظات</Text>
            <Text style={[styles.notesText, { color: colors.text }]}>{customer.notes}</Text>
          </View>
        ) : null}

        {/* Export date range */}
        {showExport && (
          <View style={[styles.exportBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <View style={styles.exportHeader}>
              <Download size={16} color={colors.info} strokeWidth={2} />
              <Text style={[styles.exportTitle, { color: colors.text }]}>تصدير السجل بالفترة</Text>
              <TouchableOpacity onPress={() => setShowExport(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={styles.exportDateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportDateLabel, { color: colors.textSecondary }]}>من تاريخ</Text>
                <TextInput
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.exportDateInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportDateLabel, { color: colors.textSecondary }]}>إلى تاريخ</Text>
                <TextInput
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.exportDateInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={handleExportRecord}
              style={[styles.exportBtn, { backgroundColor: colors.info }]}
              activeOpacity={0.8}
            >
              <Download size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.exportBtnText}>تصدير ({timeline.length} سجل)</Text>
            </TouchableOpacity>
            <Text style={[styles.exportHint, { color: colors.textMuted }]}>
              اترك التواريخ فارغة لتصدير كل السجل
            </Text>
          </View>
        )}

        {/* Link copied feedback */}
        {linkCopied && (
          <View style={[styles.linkCopiedBanner, { backgroundColor: colors.success + '15' }]}>
            <Check size={14} color={colors.success} strokeWidth={2} />
            <Text style={[styles.linkCopiedText, { color: colors.success }]}>
              تم نسخ الرابط — شاركه مع الزبون ليرى معاملاته
            </Text>
          </View>
        )}

        {/* Timeline / Table */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16, marginBottom: 8 }]}>
          السجل الموحد ({timeline.length})
        </Text>

        {timeline.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Text style={[styles.emptyTimelineText, { color: colors.textMuted }]}>لا توجد معاملات</Text>
          </View>
        ) : isWeb ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 900 }}>
              {/* Table header */}
              <View style={[styles.tblHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Text style={[styles.tblHeaderCell, { flex: 1.2, color: colors.textSecondary }]}>رقم الزبون</Text>
                <Text style={[styles.tblHeaderCell, { flex: 1, color: colors.textSecondary }]}>الوكيل</Text>
                <Text style={[styles.tblHeaderCell, { flex: 1.1, color: colors.textSecondary }]}>التاريخ</Text>
                <Text style={[styles.tblHeaderCell, { flex: 1, color: colors.textSecondary }]}>النوع</Text>
                <Text style={[styles.tblHeaderCell, { flex: 0.9, color: colors.textSecondary }]}>الدفع</Text>
                <Text style={[styles.tblHeaderCell, { flex: 0.9, color: colors.textSecondary }]}>متبقي</Text>
                <Text style={[styles.tblHeaderCell, { flex: 0.9, color: colors.textSecondary }]}>رصيد قبل</Text>
                <Text style={[styles.tblHeaderCell, { flex: 0.9, color: colors.textSecondary }]}>رصيد بعد</Text>
                <Text style={[styles.tblHeaderCell, { flex: 1.2, color: colors.textSecondary }]}>الإجراءات</Text>
              </View>
              {/* Table rows */}
              {timeline.map((entry) => {
                if (entry.kind === 'transaction') {
                  return (
                    <TransactionTableRow
                      key={`t-${entry.item.id}`}
                      transaction={entry.item}
                      customer={customer}
                      colors={colors}
                      currency={settings.currency}
                    />
                  );
                }
                return (
                  <TelecomTableRow
                    key={`s-${entry.item.id}`}
                    sale={entry.item}
                    colors={colors}
                    currency={settings.currency}
                    onEditPrice={(s) => { setEditPriceTarget(s); setEditPriceValue(s.salePrice.toString()); }}
                    onDelete={(s) => setDeleteSaleTarget(s)}
                    onCollect={(s) => { setCollectTarget(s); setCollectAmount(s.remaining.toString()); }}
                    onCancel={(s) => cancelTelecomSale(s.id)}
                  />
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.timeline}>
            {timeline.map((entry) => {
              if (entry.kind === 'transaction') {
                return (
                  <TransactionTimelineCard
                    key={`t-${entry.item.id}`}
                    transaction={entry.item}
                    colors={colors}
                    currency={settings.currency}
                    isLast={timeline.indexOf(entry) === timeline.length - 1}
                  />
                );
              }
              return (
                <TelecomTimelineCard
                  key={`s-${entry.item.id}`}
                  sale={entry.item}
                  colors={colors}
                  currency={settings.currency}
                  isLast={timeline.indexOf(entry) === timeline.length - 1}
                  onEditPrice={(s) => { setEditPriceTarget(s); setEditPriceValue(s.salePrice.toString()); }}
                  onDelete={(s) => setDeleteSaleTarget(s)}
                  onCollect={(s) => { setCollectTarget(s); setCollectAmount(s.remaining.toString()); }}
                  onCancel={(s) => cancelTelecomSale(s.id)}
                />
              );
            })}
          </View>
        )}
      </View>

      {/* Edit Price Modal */}
      <BaseModal
        visible={editPriceTarget !== null}
        onClose={() => { setEditPriceTarget(null); setEditPriceValue(''); }}
        title="تعديل سعر البيع"
        footer={
          <TouchableOpacity onPress={handleEditPrice} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>حفظ</Text>
          </TouchableOpacity>
        }
      >
        {editPriceTarget && (
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المعاملة: {editPriceTarget.simName}</Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 12 }]}>السعر الحالي: {formatCurrency(editPriceTarget.salePrice, settings.currency)}</Text>
            <TextInput
              value={editPriceValue}
              onChangeText={setEditPriceValue}
              placeholder="السعر الجديد"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 18, fontWeight: '700', textAlign: 'center' }]}
            />
            <Text style={[styles.hintText, { color: colors.textMuted, marginTop: 8 }]}>
              سيتم خصم الفرق من دين الزبون أو إضافته لرصيده
            </Text>
          </View>
        )}
      </BaseModal>

      {/* Collect Debt Modal */}
      <BaseModal
        visible={collectTarget !== null}
        onClose={() => { setCollectTarget(null); setCollectAmount(''); }}
        title="تحصيل دين المعاملة"
        footer={
          <TouchableOpacity onPress={handleCollectDebt} style={[styles.saveBtn, { backgroundColor: colors.success }]} activeOpacity={0.8}>
            <Check size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>تأكيد التحصيل</Text>
          </TouchableOpacity>
        }
      >
        {collectTarget && (
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المعاملة: {collectTarget.simName}</Text>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 12 }]}>الدين المتبقي: {formatCurrency(collectTarget.remaining, settings.currency)}</Text>
            <TextInput
              value={collectAmount}
              onChangeText={setCollectAmount}
              placeholder="مبلغ التحصيل"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 18, fontWeight: '700', textAlign: 'center' }]}
            />
          </View>
        )}
      </BaseModal>

      {/* Delete Sale Confirmation */}
      <ConfirmDialog
        visible={deleteSaleTarget !== null}
        title="حذف المعاملة"
        message={`هل تريد حذف معاملة "${deleteSaleTarget?.simName ?? ''}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={handleDeleteSale}
        onCancel={() => setDeleteSaleTarget(null)}
      />
    </BaseModal>
  );
}

function SummaryCard({
  icon, label, value, color, colors, onPress, actionLabel,
}: { icon: React.ReactNode; label: string; value: string; color: string; colors: Colors; onPress?: () => void; actionLabel?: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '15' }]}>
        {icon}
      </View>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      {onPress && actionLabel && (
        <TouchableOpacity onPress={onPress} style={[styles.summaryAction, { backgroundColor: color }]} activeOpacity={0.8}>
          <Text style={styles.summaryActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============ Web Table Rows ============

function TransactionTableRow({
  transaction: t, customer, colors, currency,
}: { transaction: Transaction; customer: Customer; colors: Colors; currency: string }) {
  const isSale = t.type === 'sale';
  const isPayment = t.type === 'payment';
  const isReturn = t.type === 'return';
  const tColor = isSale ? colors.primary : isPayment ? colors.success : isReturn ? colors.danger : colors.info;

  return (
    <View style={[styles.tblRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={[styles.tblCell, { flex: 1.2 }]}>
        <Text style={[styles.tblCellText, { color: colors.text }]} numberOfLines={1}>{customer.phone}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>—</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1.1 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>{formatDateTime(t.createdAt)}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1 }]}>
        <Text style={[styles.tblCellText, { color: tColor }]} numberOfLines={1}>
          {isSale ? 'بيع' : isPayment ? 'دفعة' : isReturn ? 'مرتجع' : 'شراء'}
        </Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>
          {t.paymentMethod === 'cash' ? 'نقدي' : t.paymentMethod === 'debt' ? 'دين' : t.paymentMethod}
        </Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>—</Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>—</Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>—</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1.2 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]}>—</Text>
      </View>
    </View>
  );
}

function TelecomTableRow({
  sale: s, colors, currency, onEditPrice, onDelete, onCollect, onCancel,
}: {
  sale: TelecomSale; colors: Colors; currency: string;
  onEditPrice: (s: TelecomSale) => void;
  onDelete: (s: TelecomSale) => void;
  onCollect: (s: TelecomSale) => void;
  onCancel: (s: TelecomSale) => void;
}) {
  const daysRem = calcDaysRemaining(s);
  const isCancelled = s.operationType === 'cancelled';
  const sColor = isCancelled ? colors.danger : s.operationType === 'recharge' ? colors.accent : colors.primary;
  const hasDebt = s.remaining > 0 && !isCancelled;

  return (
    <View style={[styles.tblRow, { backgroundColor: isCancelled ? colors.danger + '05' : colors.surface, borderBottomColor: colors.border }]}>
      <View style={[styles.tblCell, { flex: 1.2 }]}>
        <Text style={[styles.tblCellText, { color: colors.text }]} numberOfLines={1}>{s.simNumber || s.customerPhone || '—'}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1 }]}>
        <Text style={[styles.tblCellText, { color: colors.text }]} numberOfLines={1}>{s.companyName}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1.1 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>{formatDateTime(s.createdAt)}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 1 }]}>
        <Text style={[styles.tblCellText, { color: sColor }]} numberOfLines={1}>{telecomSaleLabel(s)}</Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: paymentStatusColor(s.paymentStatus, colors) }]} numberOfLines={1}>
          {paymentStatusLabel(s.paymentStatus)}
        </Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: daysRem !== null && daysRem <= 3 ? colors.danger : colors.text }]} numberOfLines={1}>
          {daysRem !== null ? `${daysRem} يوم` : '—'}
        </Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>
          {s.customerBalanceBefore ? formatCurrency(s.customerBalanceBefore, currency) : '—'}
        </Text>
      </View>
      <View style={[styles.tblCell, { flex: 0.9 }]}>
        <Text style={[styles.tblCellText, { color: colors.textMuted }]} numberOfLines={1}>
          {s.customerBalanceAfter != null ? formatCurrency(s.customerBalanceAfter, currency) : '—'}
        </Text>
      </View>
      <View style={[styles.tblActions, { flex: 1.2 }]}>
        {isCancelled ? (
          <Text style={[styles.tblCellText, { color: colors.danger }]}>ملغاة</Text>
        ) : (
          <View style={styles.tblActionsRow}>
            <TouchableOpacity
              onPress={() => onEditPrice(s)}
              style={[styles.tblActionBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Pencil size={13} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            {hasDebt && (
              <TouchableOpacity
                onPress={() => onCollect(s)}
                style={[styles.tblActionBtn, { backgroundColor: colors.success + '15' }]}
                activeOpacity={0.7}
              >
                <Wallet size={13} color={colors.success} strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => onCancel(s)}
              style={[styles.tblActionBtn, { backgroundColor: colors.warning + '15' }]}
              activeOpacity={0.7}
            >
              <Undo2 size={13} color={colors.warning} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(s)}
              style={[styles.tblActionBtn, { backgroundColor: colors.danger + '15' }]}
              activeOpacity={0.7}
            >
              <Trash2 size={13} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ============ Mobile Timeline Cards ============

function TransactionTimelineCard({
  transaction: t, colors, currency, isLast,
}: { transaction: Transaction; colors: Colors; currency: string; isLast: boolean }) {
  const isSale = t.type === 'sale';
  const isPayment = t.type === 'payment';
  const isReturn = t.type === 'return';
  const isPurchase = t.type === 'purchase';
  const tColor = isSale ? colors.primary : isPayment ? colors.success : isReturn ? colors.danger : colors.info;

  const icon = isSale ? <BookOpen size={16} color={tColor} strokeWidth={2} />
    : isPayment ? <Wallet size={16} color={tColor} strokeWidth={2} />
    : isReturn ? <Undo2 size={16} color={tColor} strokeWidth={2} />
    : <Package size={16} color={tColor} strokeWidth={2} />;

  const label = isSale ? 'بيع' : isPayment ? 'دفعة' : isReturn ? 'مرتجع' : 'شراء';

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: tColor }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: tColor + '30' }]}>
        <View style={styles.timelineCardTop}>
          <View style={[styles.timelineCardIcon, { backgroundColor: tColor + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineCardType, { color: colors.text }]}>{label}</Text>
            <View style={styles.timelineCardDateRow}>
              <Clock size={11} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineCardDate, { color: colors.textMuted }]}>
                {formatDateTime(t.createdAt)}
              </Text>
            </View>
          </View>
          <Text style={[styles.timelineCardAmount, { color: tColor }]}>
            {isPayment ? '-' : ''}{formatCurrency(isPayment ? t.paid : t.total, currency)}
          </Text>
        </View>
        {isSale && t.items.length > 0 && (
          <View style={[styles.timelineCardItems, { borderTopColor: colors.border }]}>
            {t.items.slice(0, 3).map((item, idx) => (
              <View key={idx} style={styles.timelineCardItemRow}>
                <Text style={[styles.timelineCardItemName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.timelineCardItemQty, { color: colors.textMuted }]}>
                  {item.quantity}×
                </Text>
              </View>
            ))}
            {t.items.length > 3 && (
              <Text style={[styles.timelineCardMore, { color: colors.textMuted }]}>
                +{t.items.length - 3} صنف آخر
              </Text>
            )}
          </View>
        )}
        {isSale && t.remaining > 0 && (
          <View style={[styles.timelineCardDebtBar, { backgroundColor: colors.danger + '10' }]}>
            <BookOpen size={12} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.timelineCardDebtText, { color: colors.danger }]}>
              دين: {formatCurrency(t.remaining, currency)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TelecomTimelineCard({
  sale: s, colors, currency, isLast, onEditPrice, onDelete, onCollect, onCancel,
}: {
  sale: TelecomSale; colors: Colors; currency: string; isLast: boolean;
  onEditPrice: (s: TelecomSale) => void;
  onDelete: (s: TelecomSale) => void;
  onCollect: (s: TelecomSale) => void;
  onCancel: (s: TelecomSale) => void;
}) {
  const isRecharge = s.operationType === 'recharge';
  const isCancelled = s.operationType === 'cancelled';
  const sColor = isCancelled ? colors.danger : isRecharge ? colors.accent : colors.primary;
  const daysRem = calcDaysRemaining(s);
  const hasDebt = s.remaining > 0 && !isCancelled;

  const icon = isCancelled ? <Undo2 size={16} color={sColor} strokeWidth={2} />
    : isRecharge ? <TrendingUp size={16} color={sColor} strokeWidth={2} />
    : <Smartphone size={16} color={sColor} strokeWidth={2} />;

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: sColor }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: sColor + '30' }]}>
        <View style={styles.timelineCardTop}>
          <View style={[styles.timelineCardIcon, { backgroundColor: sColor + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineCardType, { color: colors.text }]}>{telecomSaleLabel(s)}</Text>
            <Text style={[styles.timelineCardSubType, { color: colors.textMuted }]} numberOfLines={1}>
              {s.companyName} — {s.bundleName || s.simName}
              {s.simNumber ? ` — ${s.simNumber}` : ''}
            </Text>
            <View style={styles.timelineCardDateRow}>
              <Clock size={11} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineCardDate, { color: colors.textMuted }]}>
                {formatDateTime(s.createdAt)}
              </Text>
            </View>
          </View>
          <Text style={[styles.timelineCardAmount, { color: sColor }]}>
            {formatCurrency(s.total, currency)}
          </Text>
        </View>

        {/* New info row: days remaining + balance + payment status */}
        <View style={[styles.timelineCardInfoRow, { borderTopColor: colors.border }]}>
          <View style={styles.timelineCardInfoItem}>
            <Clock size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.timelineCardInfoText, { color: daysRem !== null && daysRem <= 3 ? colors.danger : colors.textMuted }]}>
              {daysRem !== null ? `${daysRem} يوم متبقي` : '—'}
            </Text>
          </View>
          <View style={styles.timelineCardInfoItem}>
            <Text style={[styles.timelineCardInfoText, { color: paymentStatusColor(s.paymentStatus, colors) }]}>
              {paymentStatusLabel(s.paymentStatus)}
            </Text>
          </View>
          {s.customerBalanceBefore != null && (
            <View style={styles.timelineCardInfoItem}>
              <Text style={[styles.timelineCardInfoText, { color: colors.textMuted }]}>
                رصيد: {formatCurrency(s.customerBalanceBefore, currency)} ← {s.customerBalanceAfter != null ? formatCurrency(s.customerBalanceAfter, currency) : '—'}
              </Text>
            </View>
          )}
        </View>

        {s.remaining > 0 && !isCancelled && (
          <View style={[styles.timelineCardDebtBar, { backgroundColor: colors.danger + '10' }]}>
            <BookOpen size={12} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.timelineCardDebtText, { color: colors.danger }]}>
              دين: {formatCurrency(s.remaining, currency)}
            </Text>
          </View>
        )}

        {/* Action buttons for mobile */}
        {!isCancelled && (
          <View style={[styles.timelineCardActions, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => onEditPrice(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
              <Pencil size={13} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.textSecondary }]}>تعديل</Text>
            </TouchableOpacity>
            {hasDebt && (
              <TouchableOpacity onPress={() => onCollect(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.success + '15' }]} activeOpacity={0.7}>
                <Wallet size={13} color={colors.success} strokeWidth={2} />
                <Text style={[styles.timelineActionText, { color: colors.success }]}>تحصيل</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onCancel(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.warning + '15' }]} activeOpacity={0.7}>
              <Undo2 size={13} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.warning }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.danger + '15' }]} activeOpacity={0.7}>
              <Trash2 size={13} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.danger }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarLarge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { fontSize: 18, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailName: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  detailPhone: { fontSize: 12 },
  quickActionsBar: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9 },
  quickActionText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  summaryCard: { flex: 1, minWidth: '18%', borderRadius: 10, padding: 8, gap: 3 },
  summaryIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 10 },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  summaryAction: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 2, alignSelf: 'flex-start' },
  summaryActionText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  subCard: { borderRadius: 10, padding: 10, marginBottom: 10, gap: 5 },
  subCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subCardLabel: { fontSize: 13, flex: 1 },
  subCardValue: { fontSize: 13, fontWeight: '600' },
  activityDatesRow: { flexDirection: 'row', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  activityDateItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityDateText: { fontSize: 12 },
  notesBox: { borderRadius: 10, padding: 10, marginBottom: 10 },
  sectionLabel: { fontSize: 14, fontWeight: '600' },
  notesText: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  emptyTimeline: { paddingVertical: 24, alignItems: 'center' },
  emptyTimelineText: { fontSize: 14 },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 10 },
  timelineLeft: { alignItems: 'center', paddingTop: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { width: 2, flex: 1, minHeight: 20, marginTop: 4 },
  timelineCard: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 8, gap: 5, marginBottom: 6 },
  timelineCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  timelineCardIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  timelineCardType: { fontSize: 14, fontWeight: '700' },
  timelineCardSubType: { fontSize: 12, marginTop: 2 },
  timelineCardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  timelineCardDate: { fontSize: 11 },
  timelineCardAmount: { fontSize: 15, fontWeight: '700' },
  timelineCardItems: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  timelineCardItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineCardItemName: { fontSize: 12, flex: 1 },
  timelineCardItemQty: { fontSize: 12, fontWeight: '600' },
  timelineCardMore: { fontSize: 11, marginTop: 2 },
  timelineCardDebtBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  timelineCardDebtText: { fontSize: 11, fontWeight: '600' },
  timelineCardInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 6 },
  timelineCardInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineCardInfoText: { fontSize: 11, fontWeight: '600' },
  timelineCardActions: { flexDirection: 'row', gap: 6, borderTopWidth: 1, paddingTop: 6, flexWrap: 'wrap' },
  timelineActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  timelineActionText: { fontSize: 10, fontWeight: '700' },
  exportBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12, gap: 8 },
  exportHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exportTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  exportDateRow: { flexDirection: 'row', gap: 8 },
  exportDateLabel: { fontSize: 11, marginBottom: 4 },
  exportDateInput: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  exportBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  exportHint: { fontSize: 11, textAlign: 'center' },
  linkCopiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 12 },
  linkCopiedText: { fontSize: 12, fontWeight: '600', flex: 1 },
  // Table styles
  tblHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1.5, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tblHeaderCell: { fontSize: 11, fontWeight: '700', paddingHorizontal: 4, textAlign: 'left' },
  tblRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, minHeight: 44 },
  tblCell: { paddingHorizontal: 4, justifyContent: 'center' },
  tblCellText: { fontSize: 11, textAlign: 'left' },
  tblActions: { paddingHorizontal: 4 },
  tblActionsRow: { flexDirection: 'row', gap: 4 },
  tblActionBtn: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  // Modal styles
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  hintText: { fontSize: 11 },
});
