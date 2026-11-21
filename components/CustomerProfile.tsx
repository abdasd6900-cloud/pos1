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
  Download, Share2, X, Pencil, Trash2, User,
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
import { supabaseUrl } from '@/lib/supabase';
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
  let totalDebt = 0;
  let totalRecharged = 0;
  const dates: number[] = [];

  for (const t of transactions) {
    if (t.type === 'sale') {
      totalSpent += t.total;
      totalPaid += t.paid;
      totalDebt += Math.max(0, t.remaining);
    }
    if (t.type === 'payment') {
      totalPaid += t.paid;
      totalDebt -= t.paid;
    }
    if (t.type === 'return') {
      totalSpent -= t.total;
      totalDebt -= Math.max(0, t.remaining);
    }
    dates.push(t.createdAt);
  }
  for (const s of telecomSales) {
    if (s.operationType !== 'cancelled') {
      totalSpent += s.total;
      totalPaid += s.paid;
      totalDebt += Math.max(0, s.remaining);
      if (s.operationType === 'recharge') totalRecharged += s.total;
    }
    dates.push(s.createdAt);
  }

  totalDebt = Math.max(0, totalDebt);
  dates.sort((a, b) => a - b);

  return {
    totalSpent,
    totalPaid,
    totalDebt,
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

function paymentMethodLabel(method: string): string {
  if (method === 'cash') return 'نقدي';
  if (method === 'debt') return 'دين';
  if (method === 'balance') return 'من الرصيد';
  if (method === 'app_balance') return 'رصيد تطبيق';
  if (method === 'cash_balance') return 'رصيد نقدي';
  if (method === 'card') return 'بطاقة';
  if (method === 'transfer') return 'تحويل';
  return method;
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
  const { transactions, telecomSales, settings, deleteTransaction, updatePayment, deleteTelecomSale, cancelTelecomSale, editTelecomSalePrice, collectTelecomSaleDebt } = useApp();
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
  const [editPaymentTarget, setEditPaymentTarget] = useState<Transaction | null>(null);
  const [editPaymentValue, setEditPaymentValue] = useState('');
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<Transaction | null>(null);

  const customerTransactions = useMemo(() => {
    if (!customer) return [];
    return transactions.filter((t) => t.customerId === customer.id || (t.customerName.trim() && t.customerName.trim() === customer.name.trim()));
  }, [customer, transactions]);

  const customerTelecomSales = useMemo(() => {
    if (!customer) return [];
    return telecomSales.filter((s) => s.customerId === customer.id || s.customerPhone === customer.phone);
  }, [customer, telecomSales]);

  const stats = useMemo(
    () => computeStats(customerTransactions, customerTelecomSales),
    [customerTransactions, customerTelecomSales],
  );

  const paymentBalances = useMemo(() => {
    const balances = new Map<string, { before: number; after: number }>();
    const chronological = [...customerTransactions].sort((a, b) => a.createdAt - b.createdAt);
    let runningBalance = Math.max(0, (customer?.debt ?? 0) - chronological.reduce((sum, t) => sum + (t.debtChange ?? 0), 0));
    for (const transaction of chronological) {
      if (transaction.type === 'payment') {
        const before = Math.max(0, runningBalance);
        const after = Math.max(0, before + (transaction.debtChange ?? -transaction.paid));
        balances.set(transaction.id, { before, after });
        runningBalance = after;
      } else {
        runningBalance = Math.max(0, runningBalance + (transaction.debtChange ?? 0));
      }
    }
    return balances;
  }, [customer, customerTransactions]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...customerTransactions.map((t) => ({ kind: 'transaction' as const, date: t.createdAt, item: t })),
      ...customerTelecomSales.map((s) => ({ kind: 'telecom_sale' as const, date: s.createdAt, item: s })),
    ];
    entries.sort((a, b) => b.date - a.date);
    return entries;
  }, [customerTransactions, customerTelecomSales, stats]);

  if (!customer) return null;

  const isVip = customer.tier === 'vip';
  const computedDebt = customer.debt;
  const debtColor = getDebtAgeColor(computedDebt, customer.createdAt, colors);
  const expiryDays = daysUntilExpiry(customer.subscriptionExpiry);
  const isExpiringSoon = expiryDays !== null && expiryDays <= settings.expiryAlertDays && expiryDays >= 0;
  const isExpired = expiryDays !== null && expiryDays < 0;

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
    const url = Platform.OS === 'web'
      ? `${window.location.origin}/customer-view?id=${customer.id}`
      : `${supabaseUrl}/functions/v1/customer-portal?id=${customer.id}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(url).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      }).catch(() => {});
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const sendSmsReminder = () => {
    const message = fillSmsTemplate(settings.smsTemplate, {
      name: customer.name,
      sub: customer.subscriptionNumber || '—',
      amount: formatCurrency(computedDebt, settings.currency),
      debt: formatCurrency(computedDebt, settings.currency),
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

  const totalDebtWithTelecom = computedDebt;

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

  const handleEditPayment = () => {
    if (!editPaymentTarget) return;
    const val = parseFloat(editPaymentValue);
    if (!val || val <= 0) return;
    updatePayment(editPaymentTarget.id, val);
    setEditPaymentTarget(null);
    setEditPaymentValue('');
  };

  const handleDeletePayment = () => {
    if (!deletePaymentTarget) return;
    deleteTransaction(deletePaymentTarget.id);
    setDeletePaymentTarget(null);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="ملف العميل"
    >
      <View style={styles.rtlContent}>
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
              {isVip && <Crown size={20} color={colors.accent} strokeWidth={2} />}
            </View>
            <View style={styles.phoneRow}>
              <Phone size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.detailPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
            </View>
            {isVip && (
              <View style={{ marginTop: 6 }}>
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
            <PlusCircle size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>شحن رصيد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onAddDebt(customer)}
            style={[styles.quickActionBtn, { backgroundColor: colors.danger }]}
            activeOpacity={0.8}
          >
            <BookOpen size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>دين جديد</Text>
          </TouchableOpacity>
          {totalDebtWithTelecom > 0 && (
            <TouchableOpacity
              onPress={() => onPayment(customer)}
              style={[styles.quickActionBtn, { backgroundColor: colors.success }]}
              activeOpacity={0.8}
            >
              <Wallet size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.quickActionText}>تسديد دين</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={sendSmsReminder}
            style={[styles.quickActionBtn, { backgroundColor: colors.info }]}
            activeOpacity={0.8}
          >
            <MessageSquare size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>تذكير</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowExport((v) => !v)}
            style={[styles.quickActionBtn, { backgroundColor: colors.info }]}
            activeOpacity={0.8}
          >
            <Download size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.quickActionText}>تصدير</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShareLink}
            style={[styles.quickActionBtn, { backgroundColor: linkCopied ? colors.success : colors.accent }]}
            activeOpacity={0.8}
          >
            {linkCopied ? <Check size={20} color="#FFFFFF" strokeWidth={2} /> : <Share2 size={20} color="#FFFFFF" strokeWidth={2} />}
            <Text style={styles.quickActionText}>{linkCopied ? 'تم النسخ' : 'رابط'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onEdit(customer)}
            style={[styles.quickActionBtn, { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.8}
          >
            <Receipt size={20} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>تعديل</Text>
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon={<TrendingUp size={22} color={colors.primary} strokeWidth={2} />}
            label="إجمالي المشتريات"
            value={formatCurrency(stats.totalSpent, settings.currency)}
            color={colors.primary}
            colors={colors}
          />
          <SummaryCard
            icon={<Check size={22} color={colors.success} strokeWidth={2} />}
            label="إجمالي المدفوع"
            value={formatCurrency(stats.totalPaid, settings.currency)}
            color={colors.success}
            colors={colors}
          />
          <SummaryCard
            icon={<BookOpen size={22} color={computedDebt > 0 ? debtColor : colors.success} strokeWidth={2} />}
            label="الدين الحالي"
            value={formatCurrency(computedDebt, settings.currency)}
            color={computedDebt > 0 ? debtColor : colors.success}
            colors={colors}
          />
          <SummaryCard
            icon={<Wallet size={22} color={colors.primary} strokeWidth={2} />}
            label="رصيد التطبيق"
            value={formatCurrency(customer.appBalance ?? 0, settings.currency)}
            color={colors.primary}
            colors={colors}
          />
          <SummaryCard
            icon={<Wallet size={22} color={colors.success} strokeWidth={2} />}
            label="الرصيد النقدي"
            value={formatCurrency(customer.cashBalance ?? 0, settings.currency)}
            color={colors.success}
            colors={colors}
          />
          {settings.enableLoyalty && (
            <SummaryCard
              icon={<Star size={22} color={colors.accent} strokeWidth={2} />}
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
              <Clock size={18} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.subCardLabel, { color: colors.textSecondary }]}>رقم الاشتراك</Text>
              <Text style={[styles.subCardValue, { color: colors.text }]}>{customer.subscriptionNumber || '—'}</Text>
            </View>
            <View style={styles.subCardRow}>
              <Calendar size={18} color={isExpired ? colors.danger : isExpiringSoon ? colors.warning : colors.primary} strokeWidth={2} />
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
              <ArrowDownRight size={16} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.activityDateText, { color: colors.textMuted }]}>
                أول تعامل: {formatDateTime(stats.firstActivity)}
              </Text>
            </View>
            <View style={styles.activityDateItem}>
              <ArrowUpRight size={16} color={colors.textMuted} strokeWidth={2} />
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
              <Download size={18} color={colors.info} strokeWidth={2} />
              <Text style={[styles.exportTitle, { color: colors.text }]}>تصدير السجل بالفترة</Text>
              <TouchableOpacity onPress={() => setShowExport(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={18} color={colors.textMuted} strokeWidth={2} />
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
              <Download size={20} color="#FFFFFF" strokeWidth={2} />
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
            <Check size={16} color={colors.success} strokeWidth={2} />
            <Text style={[styles.linkCopiedText, { color: colors.success }]}>
              تم نسخ الرابط — شاركه مع الزبون ليرى معاملاته
            </Text>
          </View>
        )}

        {/* Timeline */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20, marginBottom: 10 }]}>
          السجل الموحد ({timeline.length})
        </Text>

        {timeline.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Text style={[styles.emptyTimelineText, { color: colors.textMuted }]}>لا توجد معاملات</Text>
          </View>
        ) : (
          <ScrollView>
            <View style={styles.timeline}>
              {timeline.map((entry, idx) => {
                if (entry.kind === 'transaction') {
                  return (
                    <TransactionTimelineCard
                      key={`t-${entry.item.id}`}
                      transaction={entry.item}
                      customer={customer}
                      colors={colors}
                      currency={settings.currency}
                      isLast={idx === timeline.length - 1}
                      paymentBalance={paymentBalances.get(entry.item.id)}
                      onEditPayment={(t) => { setEditPaymentTarget(t); setEditPaymentValue(t.paid.toString()); }}
                      onDeletePayment={(t) => setDeletePaymentTarget(t)}
                    />
                  );
                }
                return (
                  <TelecomTimelineCard
                    key={`s-${entry.item.id}`}
                    sale={entry.item}
                    colors={colors}
                    currency={settings.currency}
                    isLast={idx === timeline.length - 1}
                    onEditPrice={(s) => { setEditPriceTarget(s); setEditPriceValue(s.salePrice.toString()); }}
                    onDelete={(s) => setDeleteSaleTarget(s)}
                    onCollect={(s) => { setCollectTarget(s); setCollectAmount(s.remaining.toString()); }}
                    onCancel={(s) => cancelTelecomSale(s.id)}
                  />
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Edit Payment Modal */}
      <BaseModal
        visible={editPaymentTarget !== null}
        onClose={() => { setEditPaymentTarget(null); setEditPaymentValue(''); }}
        title="تعديل الدفعة"
        footer={
          <TouchableOpacity onPress={handleEditPayment} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Check size={22} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>حفظ التعديل</Text>
          </TouchableOpacity>
        }
      >
        {editPaymentTarget && (
          <View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المبلغ الحالي: {formatCurrency(editPaymentTarget.paid, settings.currency)}</Text>
            <TextInput
              value={editPaymentValue}
              onChangeText={setEditPaymentValue}
              placeholder="المبلغ الجديد"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 18, fontWeight: '700', textAlign: 'center' }]}
            />
            <Text style={[styles.hintText, { color: colors.textMuted, marginTop: 8 }]}>سيتم تحديث دين الزبون تلقائياً</Text>
          </View>
        )}
      </BaseModal>

      {/* Delete Payment Confirmation */}
      <ConfirmDialog
        visible={deletePaymentTarget !== null}
        title="حذف الدفعة"
        message={`هل تريد حذف دفعة بقيمة ${deletePaymentTarget ? formatCurrency(deletePaymentTarget.paid, settings.currency) : ''}؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={handleDeletePayment}
        onCancel={() => setDeletePaymentTarget(null)}
      />

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
            <Check size={22} color="#FFFFFF" strokeWidth={2} />
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

// ============ Timeline Cards ============

function TransactionTimelineCard({
  transaction: t, customer, colors, currency, isLast, paymentBalance, onEditPayment, onDeletePayment,
}: {
  transaction: Transaction;
  customer: Customer;
  colors: Colors;
  currency: string;
  isLast: boolean;
  paymentBalance?: { before: number; after: number };
  onEditPayment: (transaction: Transaction) => void;
  onDeletePayment: (transaction: Transaction) => void;
}) {
  const isSale = t.type === 'sale';
  const isPayment = t.type === 'payment';
  const isReturn = t.type === 'return';
  const isPurchase = t.type === 'purchase';
  const tColor = isSale ? colors.primary : isPayment ? colors.success : isReturn ? colors.danger : colors.info;

  const icon = isSale ? <BookOpen size={20} color={tColor} strokeWidth={2} />
    : isPayment ? <Wallet size={20} color={tColor} strokeWidth={2} />
    : isReturn ? <Undo2 size={20} color={tColor} strokeWidth={2} />
    : <Package size={20} color={tColor} strokeWidth={2} />;

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
              <Clock size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineCardDate, { color: colors.textMuted }]}>
                {formatDateTime(t.createdAt)}
              </Text>
            </View>
          </View>
          <Text style={[styles.timelineCardAmount, { color: tColor }]}>
            {isPayment ? '-' : ''}{formatCurrency(isPayment ? t.paid : t.total, currency)}
          </Text>
        </View>

        {/* Info row */}
        <View style={[styles.timelineCardInfoRow, { borderTopColor: colors.border }]}>
          <View style={styles.timelineCardInfoItem}>
            <User size={13} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.timelineCardInfoText, { color: colors.textSecondary }]}>
              {customer.phone}
            </Text>
          </View>
          <View style={styles.timelineCardInfoItem}>
            <Wallet size={13} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.timelineCardInfoText, { color: colors.textSecondary }]}>
              {paymentMethodLabel(t.paymentMethod)}
            </Text>
          </View>
        </View>

        {isPayment && paymentBalance && (
          <View style={[styles.timelineCardBalanceRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.timelineCardBalanceText, { color: colors.textMuted }]}>
              الرصيد قبل: {formatCurrency(paymentBalance.before, currency)}
            </Text>
            <Text style={[styles.timelineCardBalanceText, { color: colors.success }]}>
              الرصيد بعد: {formatCurrency(paymentBalance.after, currency)}
            </Text>
          </View>
        )}

        {isSale && t.items.length > 0 && (
          <View style={[styles.timelineCardItems, { borderTopColor: colors.border }]}>
            {t.items.slice(0, 4).map((item, idx) => (
              <View key={idx} style={styles.timelineCardItemRow}>
                <Text style={[styles.timelineCardItemName, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.timelineCardItemQty, { color: colors.textMuted }]}>
                  {item.quantity}×
                </Text>
              </View>
            ))}
            {t.items.length > 4 && (
              <Text style={[styles.timelineCardMore, { color: colors.textMuted }]}>
                +{t.items.length - 4} صنف آخر
              </Text>
            )}
          </View>
        )}

        {isSale && t.remaining > 0 && (
          <View style={[styles.timelineCardDebtBar, { backgroundColor: colors.danger + '10' }]}>
            <BookOpen size={14} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.timelineCardDebtText, { color: colors.danger }]}>
              دين متبقي: {formatCurrency(t.remaining, currency)}
            </Text>
          </View>
        )}

        {isPayment && (
          <View style={[styles.timelineCardActions, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => onEditPayment(t)} style={[styles.timelineActionBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
              <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.textSecondary }]}>تعديل الدفعة</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDeletePayment(t)} style={[styles.timelineActionBtn, { backgroundColor: colors.danger + '15' }]} activeOpacity={0.7}>
              <Trash2 size={15} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.danger }]}>حذف الدفعة</Text>
            </TouchableOpacity>
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

  const icon = isCancelled ? <Undo2 size={20} color={sColor} strokeWidth={2} />
    : isRecharge ? <TrendingUp size={20} color={sColor} strokeWidth={2} />
    : <Smartphone size={20} color={sColor} strokeWidth={2} />;

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLeft}>
        <View style={[styles.timelineDot, { backgroundColor: sColor }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={[styles.timelineCard, { backgroundColor: isCancelled ? colors.danger + '05' : colors.surface, borderColor: sColor + '30' }]}>
        {/* Line 1: type + company/number (enlarged) + amount */}
        <View style={styles.timelineCardTop}>
          <View style={[styles.timelineCardIcon, { backgroundColor: sColor + '15' }]}>
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineCardType, { color: colors.text }]}>{telecomSaleLabel(s)}</Text>
            <Text style={[styles.timelineCardCompany, { color: colors.text }]} numberOfLines={1}>
              {s.companyName}{s.simNumber ? ` — ${s.simNumber}` : ''}
            </Text>
          </View>
          <Text style={[styles.timelineCardAmount, { color: sColor }]}>
            {formatCurrency(s.total, currency)}
          </Text>
        </View>

        {/* Bundle name line */}
        {s.bundleName ? (
          <View style={[styles.timelineCardInfoRow, { borderTopColor: colors.border }]}>
            <View style={styles.timelineCardInfoItem}>
              <Package size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineCardInfoText, { color: colors.textSecondary }]}>
                الحزمة: {s.bundleName}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Line 2: date + days remaining + payment status + debt */}
        <View style={[styles.timelineCardInfoRow, { borderTopColor: colors.border }]}>
          <View style={styles.timelineCardInfoItem}>
            <Clock size={13} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.timelineCardInfoText, { color: colors.textMuted }]}>
              {formatDateTime(s.createdAt)}
            </Text>
          </View>
          {daysRem !== null && (
            <View style={styles.timelineCardInfoItem}>
              <Clock size={13} color={daysRem <= 3 ? colors.danger : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.timelineCardInfoText, { color: daysRem <= 3 ? colors.danger : colors.textSecondary }]}>
                {daysRem} يوم متبقي
              </Text>
            </View>
          )}
          <View style={styles.timelineCardInfoItem}>
            <Text style={[styles.timelineCardInfoText, { color: paymentStatusColor(s.paymentStatus, colors) }]}>
              {paymentStatusLabel(s.paymentStatus)}
            </Text>
          </View>
          {hasDebt && (
            <View style={styles.timelineCardInfoItem}>
              <BookOpen size={13} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.timelineCardInfoText, { color: colors.danger }]}>
                دين: {formatCurrency(s.remaining, currency)}
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons */}
        {!isCancelled && (
          <View style={[styles.timelineCardActions, { borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={() => onEditPrice(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
              <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.textSecondary }]}>تعديل السعر</Text>
            </TouchableOpacity>
            {hasDebt && (
              <TouchableOpacity onPress={() => onCollect(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.success + '15' }]} activeOpacity={0.7}>
                <Wallet size={15} color={colors.success} strokeWidth={2} />
                <Text style={[styles.timelineActionText, { color: colors.success }]}>تحصيل الدين</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => onCancel(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.warning + '15' }]} activeOpacity={0.7}>
              <Undo2 size={15} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.warning }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(s)} style={[styles.timelineActionBtn, { backgroundColor: colors.danger + '15' }]} activeOpacity={0.7}>
              <Trash2 size={15} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.timelineActionText, { color: colors.danger }]}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rtlContent: {},
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatarLarge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { fontSize: 22, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailName: { fontSize: 20, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  detailPhone: { fontSize: 14, textAlign: 'right' },

  // Quick actions
  quickActionsBar: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  quickActionText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // Summary cards
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, minWidth: '18%', borderRadius: 14, padding: 12, gap: 4 },
  summaryIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryAction: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 4, alignSelf: 'flex-start' },
  summaryActionText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  // Subscription card
  subCard: { borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  subCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subCardLabel: { fontSize: 14, flex: 1 },
  subCardValue: { fontSize: 15, fontWeight: '600' },

  // Activity dates
  activityDatesRow: { flexDirection: 'row', gap: 20, marginBottom: 16, flexWrap: 'wrap' },
  activityDateItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityDateText: { fontSize: 13 },

  // Notes
  notesBox: { borderRadius: 14, padding: 14, marginBottom: 12 },
  sectionLabel: { fontSize: 16, fontWeight: '700' },
  notesText: { fontSize: 15, lineHeight: 22, marginTop: 8 },

  // Empty state
  emptyTimeline: { paddingVertical: 32, alignItems: 'center' },
  emptyTimelineText: { fontSize: 16 },

  // Timeline
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row-reverse', gap: 12 },
  timelineLeft: { alignItems: 'center', paddingTop: 18 },
  timelineDot: { width: 12, height: 12, borderRadius: 6 },
  timelineLine: { width: 2, flex: 1, minHeight: 24, marginTop: 4 },

  // Timeline card
  timelineCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 8, marginBottom: 8 },
  timelineCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  timelineCardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timelineCardType: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
  timelineCardCompany: { fontSize: 16, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  timelineCardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  timelineCardDate: { fontSize: 12, textAlign: 'right' },
  timelineCardAmount: { fontSize: 18, fontWeight: '700', textAlign: 'left' },

  // Timeline card items
  timelineCardItems: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  timelineCardItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelineCardItemName: { fontSize: 13, flex: 1, textAlign: 'right' },
  timelineCardItemQty: { fontSize: 13, fontWeight: '600', textAlign: 'left' },
  timelineCardMore: { fontSize: 12, marginTop: 3 },

  // Timeline card info row
  timelineCardInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, paddingTop: 8 },
  timelineCardInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timelineCardInfoText: { fontSize: 12, fontWeight: '600', textAlign: 'right' },

  // Timeline card balance row
  timelineCardBalanceRow: { flexDirection: 'row', gap: 16, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  timelineCardBalanceText: { fontSize: 12, fontWeight: '600', textAlign: 'right' },

  // Timeline card debt bar
  timelineCardDebtBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  timelineCardDebtText: { fontSize: 13, fontWeight: '700', textAlign: 'right' },

  // Timeline card actions
  timelineCardActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 8, flexWrap: 'wrap' },
  timelineActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  timelineActionText: { fontSize: 12, fontWeight: '700', textAlign: 'right' },

  // Export box
  exportBox: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14, gap: 10 },
  exportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  exportDateRow: { flexDirection: 'row', gap: 10 },
  exportDateLabel: { fontSize: 13, marginBottom: 6 },
  exportDateInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  exportBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  exportHint: { fontSize: 12, textAlign: 'center' },

  // Link copied banner
  linkCopiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 14 },
  linkCopiedText: { fontSize: 13, fontWeight: '600', flex: 1 },

  // Modal styles
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16 },
  saveBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  fieldLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  textInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  hintText: { fontSize: 13 },
});
