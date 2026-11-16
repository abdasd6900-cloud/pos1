import { StyleSheet, View, Text, TouchableOpacity, FlatList, TextInput, Linking, Platform, Pressable , PermissionsAndroid, ScrollView, useWindowDimensions } from 'react-native';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  Users, Plus, Search, Trash2, Pencil, Phone, Wallet,
  BookOpen, MessageSquare, Check, Crown, UserPlus,
  Package, Clock, AlertCircle, Calendar, Star, Undo2, Gift,
  Upload, Download, FileSpreadsheet, PlusCircle, Contact as ContactIcon,
  X,
 Info, AlertTriangle, ArrowUpRight, ArrowDownRight, TrendingUp, RefreshCw } from 'lucide-react-native';
import * as XLSX from 'xlsx';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime, getDebtAgeLevel, debtAgeLabel, daysUntilExpiry, formatExpiry, fillSmsTemplate, normalizePhoneNumber } from '@/lib/format';
import type { Customer, CustomerTier, DebtAgeLevel } from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/Badge';
import { CustomerProfile } from '@/components/CustomerProfile';
import { smartParseExcel, CUSTOMER_MAPPINGS, type MappedRow } from '@/lib/excel-import';
import { exportXlsx, pickExcelFile, readPickedExcel } from '@/lib/xlsx-export';
import { isContactsSupported, getDeviceContacts, hasContactsPermission, type DeviceContact } from '@/lib/native-bridge';

type FilterMode = 'all' | 'vip' | 'debtors' | 'expiring';

export default function CustomersScreen() {
  const { customers, customerFiles, mergeDuplicateCustomers, transactions, telecomSales, addCustomer, updateCustomer, deleteCustomer, recordPayment, addCustomerBalance, redeemLoyalty, settings } = useApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [showForm, setShowForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [balanceCustomer, setBalanceCustomer] = useState<Customer | null>(null);
  const [debtCustomer, setDebtCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [smsCustomer, setSmsCustomer] = useState<Customer | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[]; mapping: { header: string; field: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactsSearch, setContactsSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [mergeResult, setMergeResult] = useState<number | null>(null);

  const searchParams = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (searchParams.id) {
      const customer = customers.find((c) => c.id === searchParams.id);
      if (customer) {
        setDetailCustomer(customer);
        setSearch(customer.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.id]);

  const now = Date.now();
  const expirySoonCount = customers.filter((c) => {
    const d = daysUntilExpiry(c.subscriptionExpiry);
    return d !== null && d <= settings.expiryAlertDays && d >= 0;
  }).length;

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (filter === 'vip') list = list.filter((c) => c.tier === 'vip');
    else if (filter === 'debtors') list = list.filter((c) => c.debt > 0);
    else if (filter === 'expiring') {
      list = list.filter((c) => {
        const d = daysUntilExpiry(c.subscriptionExpiry);
        return d !== null && d <= settings.expiryAlertDays;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [customers, search, filter, settings.expiryAlertDays]);

  const totalDebt = customers.reduce((s, c) => s + c.debt, 0);
  const vipCount = customers.filter((c) => c.tier === 'vip').length;
  const totalPurchases = useMemo(() => {
    const txnsTotal = transactions.filter((t) => t.type === 'sale').reduce((s, t) => s + t.total, 0);
    const telecomTotal = telecomSales.reduce((s, sale) => s + sale.total, 0);
    return txnsTotal + telecomTotal;
  }, [transactions, telecomSales]);
  const debtorsCount = customers.filter((c) => c.debt > 0).length;

  const handleSave = (data: { name: string; phone: string; tier: CustomerTier; creditLimit: number; discountPercent: number; notes: string; subscriptionNumber: string; subscriptionExpiry: number | null }) => {
    if (editCustomer) {
      updateCustomer(editCustomer.id, data);
    } else {
      addCustomer(data);
    }
    setShowForm(false);
    setEditCustomer(null);
  };

  const customerTransactions = useMemo(() => {
    if (!detailCustomer) return [];
    return transactions.filter((t) => t.customerId === detailCustomer.id || (t.customerName.trim() && t.customerName.trim() === detailCustomer.name.trim())).slice(0, 20);
  }, [detailCustomer, transactions]);
  void customerTransactions;

  const sendSmsReminder = (customer: Customer) => {
    const message = fillSmsTemplate(settings.smsTemplate, {
      name: customer.name,
      sub: customer.subscriptionNumber || '—',
      amount: formatCurrency(customer.debt, settings.currency),
      debt: formatCurrency(customer.debt, settings.currency),
    });
    const encoded = encodeURIComponent(message);
    if (Platform.OS === 'web') {
      setSmsCustomer(customer);
    } else {
      Linking.openURL(`sms:${customer.phone}?body=${encoded}`);
    }
  };

  const handleExportTemplate = async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['اسم الزبون', 'رقم الجوال'],
      ['مثال: أحمد محمد', '05XXXXXXXX'],
    ]);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الزبائن');
    await exportXlsx(wb, 'قالب_الزبائن.xlsx');
  };

  const handleExportCustomers = async () => {
    const data = customers.map((c) => ({
      'اسم الزبون': c.name,
      'رقم الجوال': c.phone,
      'التصنيف': c.tier === 'vip' ? 'مميز' : 'عادي',
      'الدين': c.debt,
      'حد الائتمان': c.creditLimit,
      'نقاط الولاء': c.loyaltyPoints,
      'ملاحظات': c.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الزبائن');
    await exportXlsx(wb, `الزبائن_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportFromContacts = async () => {
    setContactsError('');
    if (!isContactsSupported()) {
      if (Platform.OS === 'web') {
        setContactsError('متصفحك لا يدعم اختيار جهات الاتصال. جرّب Chrome أو Edge على الجوال.');
      } else {
        setContactsError('هذه الميزة متاحة فقط على أجهزة الأندرويد');
      }
      setShowContactsModal(true);
      return;
    }

    if (Platform.OS === 'android') {
      const hasPerm = await hasContactsPermission();
      if (!hasPerm) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
            {
              title: 'إذن الوصول لجهات الاتصال',
              message: 'يحتاج التطبيق لقراءة جهات الاتصال لاستيراد أسماء وأرقام العملاء',
              buttonNeutral: 'اسأل لاحقاً',
              buttonNegative: 'إلغاء',
              buttonPositive: 'موافق',
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setContactsError('يجب منح إذن الوصول لجهات الاتصال من إعدادات الجهاز');
            setShowContactsModal(true);
            return;
          }
        } catch {
          setContactsError('تعذر طلب إذن جهات الاتصال');
          setShowContactsModal(true);
          return;
        }
      }
    }

    setContactsLoading(true);
    setShowContactsModal(true);
    setDeviceContacts([]);
    setSelectedContactIds(new Set());
    setContactsSearch('');

    const contacts = await getDeviceContacts();
    setContactsLoading(false);

    if (contacts.length === 0) {
      setContactsError(Platform.OS === 'web'
        ? 'لم يتم اختيار أي جهات اتصال'
        : 'لا توجد جهات اتصال على الجهاز');
      return;
    }

    const existingPhones = new Set(customers.map((c) => c.phone));
    const uniqueContacts = contacts.filter((c) => {
      const normalized = normalizePhoneNumber(c.phone);
      return !existingPhones.has(normalized);
    });
    setDeviceContacts(uniqueContacts);
    if (uniqueContacts.length === 0) {
      setContactsError('جميع جهات الاتصال موجودة مسبقاً في قائمة العملاء');
    }
  };

  const filteredDeviceContacts = useMemo(() => {
    if (!contactsSearch.trim()) return deviceContacts;
    const q = contactsSearch.trim().toLowerCase();
    return deviceContacts.filter((c) =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [deviceContacts, contactsSearch]);

  const toggleContactSelection = (contact: DeviceContact) => {
    const key = `${contact.name}|${contact.phone}`;
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importSelectedContacts = () => {
    const existingPhones = new Set(customers.map((c) => c.phone));
    let added = 0;
    for (const contact of deviceContacts) {
      const key = `${contact.name}|${contact.phone}`;
      if (!selectedContactIds.has(key)) continue;
      const normalized = normalizePhoneNumber(contact.phone);
      if (existingPhones.has(normalized)) continue;
      addCustomer({
        name: contact.name,
        phone: normalized,
        tier: 'regular',
        creditLimit: 500,
        discountPercent: 0,
        notes: '',
        subscriptionNumber: '',
        subscriptionExpiry: null,
      });
      existingPhones.add(normalized);
      added++;
    }
    setShowContactsModal(false);
    setSelectedContactIds(new Set());
    setDeviceContacts([]);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (!(result instanceof ArrayBuffer)) {
        setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف'], mapping: [] });
        setImporting(false);
        return;
      }
      const existingPhones = new Set(customers.map((c) => c.phone));
      const parsed = smartParseExcel(result, CUSTOMER_MAPPINGS, (mapped: MappedRow) => {
        const name = String(mapped.name ?? '').trim();
        const phone = String(mapped.phone ?? '').trim();
        if (!name || !phone) return null;
        if (existingPhones.has(phone)) return null;
        const tierRaw = String(mapped.tier ?? 'regular').trim().toLowerCase();
        const tier: CustomerTier = tierRaw.includes('vip') || tierRaw.includes('مميز') ? 'vip' : 'regular';
        addCustomer({
          name,
          phone,
          tier,
          creditLimit: Number(mapped.creditLimit) || 500,
          discountPercent: Number(mapped.discountPercent) || 0,
          notes: String(mapped.notes ?? '').trim(),
          subscriptionNumber: String(mapped.subscriptionNumber ?? '').trim(),
          subscriptionExpiry: mapped.subscriptionExpiry !== null && mapped.subscriptionExpiry !== undefined ? Number(mapped.subscriptionExpiry) : null,
        });
        existingPhones.add(phone);
        return {} as unknown as Record<string, unknown>;
      });
      setImportResult({ added: parsed.rows.length, skipped: parsed.skipped, errors: parsed.errors, mapping: parsed.detectedMapping });
      setImporting(false);
      if (e.target) e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportMobile = async () => {
    const picked = await pickExcelFile();
    if (!picked) return;
    setImporting(true);
    try {
      const wb = await readPickedExcel(picked);
      const arrayBuffer = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })).buffer;
      const existingPhones = new Set(customers.map((c) => c.phone));
      const parsed = smartParseExcel(arrayBuffer, CUSTOMER_MAPPINGS, (mapped: MappedRow) => {
        const name = String(mapped.name ?? '').trim();
        const phone = String(mapped.phone ?? '').trim();
        if (!name || !phone) return null;
        if (existingPhones.has(phone)) return null;
        const tierRaw = String(mapped.tier ?? 'regular').trim().toLowerCase();
        const tier: CustomerTier = tierRaw.includes('vip') || tierRaw.includes('مميز') ? 'vip' : 'regular';
        addCustomer({
          name,
          phone,
          tier,
          creditLimit: Number(mapped.creditLimit) || 500,
          discountPercent: Number(mapped.discountPercent) || 0,
          notes: String(mapped.notes ?? '').trim(),
          subscriptionNumber: String(mapped.subscriptionNumber ?? '').trim(),
          subscriptionExpiry: mapped.subscriptionExpiry !== null && mapped.subscriptionExpiry !== undefined ? Number(mapped.subscriptionExpiry) : null,
        });
        existingPhones.add(phone);
        return {} as unknown as Record<string, unknown>;
      });
      setImportResult({ added: parsed.rows.length, skipped: parsed.skipped, errors: parsed.errors, mapping: parsed.detectedMapping });
    } catch {
      setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح'], mapping: [] });
    }
    setImporting(false);
  };

  const getDebtAgeColor = (customer: Customer): string => {
    if (customer.debt <= 0) return colors.success;
    const level = getDebtAgeLevel(customer.createdAt);
    switch (level) {
      case 'fresh': return colors.success;
      case 'warning': return colors.warning;
      case 'critical': return colors.danger;
    }
  };

  const getDebtAgeBg = (customer: Customer): string => {
    if (customer.debt <= 0) return colors.success + '15';
    const level = getDebtAgeLevel(customer.createdAt);
    switch (level) {
      case 'fresh': return colors.success + '15';
      case 'warning': return colors.warning + '15';
      case 'critical': return colors.danger + '15';
    }
  };

  const customerStatsMap = useMemo(() => {
    const map = new Map<string, { subs: number; ops: number; totalSpent: number }>();
    const fileMap = new Map<string, typeof customerFiles[number]>();
    for (const f of customerFiles) {
      if (f.primaryCustomerId) fileMap.set(f.primaryCustomerId, f);
    }
    for (const c of customers) {
      const file = fileMap.get(c.id);
      const subs = file?.simNumbers.length ?? 0;
      const txns = transactions.filter((t) => t.customerId === c.id || (t.customerName.trim() && t.customerName.trim() === c.name.trim()));
      const sales = telecomSales.filter((s) => s.customerId === c.id || s.customerPhone === c.phone);
      const ops = txns.length + sales.length;
      const totalSpent = txns.reduce((s, t) => s + (t.type === 'sale' ? t.total : 0), 0)
        + sales.reduce((s, sale) => s + sale.total, 0);
      map.set(c.id, { subs, ops, totalSpent });
    }
    return map;
  }, [customers, customerFiles, transactions, telecomSales]);

  const isWeb = Platform.OS === 'web';
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopLayout = isWeb && screenWidth >= 768;

  const renderItem = ({ item }: { item: Customer }) => {
    if (!isDesktopLayout) return renderCardItem(item);
    const isVip = item.tier === 'vip';
    const stats = customerStatsMap.get(item.id) ?? { subs: 0, ops: 0, totalSpent: 0 };
    const netBalance = item.balance - item.debt;

    return (
      <TouchableOpacity
        onPress={() => setDetailCustomer(item)}
        activeOpacity={0.7}
        style={[styles.tableRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      >
        {/* الاسم */}
        <View style={[styles.colName, { flex: 2.1 }]}>
          <View style={[styles.rowAvatar, { backgroundColor: isVip ? colors.accent + '20' : colors.primary + '15' }]}>
            <Text style={[styles.rowAvatarText, { color: isVip ? colors.accent : colors.primary }]} numberOfLines={1}>
              {item.name.charAt(0)}
            </Text>
          </View>
          <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {isVip && <Crown size={12} color={colors.accent} strokeWidth={2} />}
        </View>

        {/* رقم التواصل */}
        <View style={[styles.col, { flex: 1.5 }]}>
          <Text style={[styles.rowText, { color: colors.textMuted }]} numberOfLines={1}>{item.phone}</Text>
        </View>

        {/* الاشتراكات */}
        <View style={[styles.col, { flex: 0.9 }]}>

          <Text style={[styles.rowTextNum, { color: stats.subs > 0 ? colors.primary : colors.textMuted }]}>
            {stats.subs}
          </Text>
        </View>

        {/* العمليات */}
        <View style={[styles.col, { flex: 0.9 }]}>

          <Text style={[styles.rowTextNum, { color: stats.ops > 0 ? colors.text : colors.textMuted }]}>
            {stats.ops}
          </Text>
        </View>

        {/* اجمالي المشتريات */}
        <View style={[styles.col, { flex: 1.3 }]}>
          <Text style={[styles.rowTextNum, { color: stats.totalSpent > 0 ? colors.primary : colors.textMuted }]} numberOfLines={1}>
            {formatCurrency(stats.totalSpent, settings.currency)}
          </Text>
        </View>

        {/* الحساب */}
        <View style={[styles.col, { flex: 1.3 }]}>
          {netBalance > 0 ? (
            <View style={[styles.balancePillSmall, { backgroundColor: colors.success + '15' }]}>
              <ArrowUpRight size={12} color={colors.success} strokeWidth={2} />
              <Text style={[styles.balancePillSmallText, { color: colors.success }]} numberOfLines={1}>
                {formatCurrency(netBalance, settings.currency)}
              </Text>
            </View>
          ) : netBalance < 0 ? (
            <View style={[styles.balancePillSmall, { backgroundColor: colors.danger + '15' }]}>
              <ArrowDownRight size={12} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.balancePillSmallText, { color: colors.danger }]} numberOfLines={1}>
                {formatCurrency(Math.abs(netBalance), settings.currency)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.rowTextNum, { color: colors.textMuted }]}>—</Text>
          )}
        </View>

        {/* الإجراءات */}
        <View style={[styles.colActions, { flex: 2 }]}>
          <TouchableOpacity
            onPress={() => { setEditCustomer(item); setShowForm(true); }}
            style={[styles.rowActionBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.7}
          >
            <PlusCircle size={14} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.rowActionText}>عملية</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEditCustomer(item); setShowForm(true); }}
            style={[styles.rowIconBtn, { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.7}
          >
            <Pencil size={14} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDeleteTarget(item)}
            style={[styles.rowIconBtn, { backgroundColor: colors.danger + '15' }]}
            activeOpacity={0.7}
          >
            <Trash2 size={14} color={colors.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCardItem = (item: Customer) => {
    const isVip = item.tier === 'vip';
    const stats = customerStatsMap.get(item.id) ?? { subs: 0, ops: 0, totalSpent: 0 };
    const netBalance = item.balance - item.debt;

    return (
      <TouchableOpacity
        onPress={() => setDetailCustomer(item)}
        activeOpacity={0.7}
        style={[styles.customerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.customerCardTop}>
          <View style={styles.customerCardHeader}>
            <View style={[styles.cardAvatar, { backgroundColor: isVip ? colors.accent + '20' : colors.primary + '15' }]}>
              <Text style={[styles.cardAvatarText, { color: isVip ? colors.accent : colors.primary }]} numberOfLines={1}>
                {item.name.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.customerCardNameRow}>
                <Text style={[styles.customerCardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                {isVip && <Crown size={14} color={colors.accent} strokeWidth={2} />}
              </View>
              <Text style={[styles.customerCardPhone, { color: colors.textMuted }]} numberOfLines={1}>{item.phone}</Text>
            </View>
            {netBalance !== 0 && (
              <View style={[styles.balancePillSmall, { backgroundColor: netBalance > 0 ? colors.success + '15' : colors.danger + '15' }]}>
                {netBalance > 0 ? <ArrowUpRight size={12} color={colors.success} strokeWidth={2} /> : <ArrowDownRight size={12} color={colors.danger} strokeWidth={2} />}
                <Text style={[styles.balancePillSmallText, { color: netBalance > 0 ? colors.success : colors.danger }]} numberOfLines={1}>
                  {formatCurrency(Math.abs(netBalance), settings.currency)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.customerCardStats, { borderTopColor: colors.border }]}>
          <View style={styles.customerCardStatItem}>
            <Text style={[styles.customerCardStatLabel, { color: colors.textMuted }]}>الاشتراكات</Text>
            <Text style={[styles.customerCardStatValue, { color: stats.subs > 0 ? colors.primary : colors.textMuted }]}>
              {stats.subs}
            </Text>
          </View>
          <View style={[styles.customerCardStatDivider, { backgroundColor: colors.border }]} />
          <View style={styles.customerCardStatItem}>
            <Text style={[styles.customerCardStatLabel, { color: colors.textMuted }]}>العمليات</Text>
            <Text style={[styles.customerCardStatValue, { color: stats.ops > 0 ? colors.text : colors.textMuted }]}>
              {stats.ops}
            </Text>
          </View>
          <View style={[styles.customerCardStatDivider, { backgroundColor: colors.border }]} />
          <View style={styles.customerCardStatItem}>
            <Text style={[styles.customerCardStatLabel, { color: colors.textMuted }]}>المشتريات</Text>
            <Text style={[styles.customerCardStatValue, { color: stats.totalSpent > 0 ? colors.primary : colors.textMuted }]} numberOfLines={1}>
              {formatCurrency(stats.totalSpent, settings.currency)}
            </Text>
          </View>
        </View>

        <View style={styles.customerCardActions}>
          <TouchableOpacity
            onPress={() => { setEditCustomer(item); setShowForm(true); }}
            style={[styles.rowActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
            activeOpacity={0.7}
          >
            <PlusCircle size={15} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.rowActionText}>عملية جديدة</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setEditCustomer(item); setShowForm(true); }}
            style={[styles.cardIconBtn, { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.7}
          >
            <Pencil size={16} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDeleteTarget(item)}
            style={[styles.cardIconBtn, { backgroundColor: colors.danger + '15' }]}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.statsBar, isDesktopLayout && styles.statsBarDesktop, { backgroundColor: colors.surface }]}>
        <MiniStat icon={<Users size={18} color={colors.primary} strokeWidth={2} />} label="الإجمالي" value={customers.length.toString()} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<Wallet size={18} color={colors.danger} strokeWidth={2} />} label="الديون" value={formatCurrency(totalDebt, settings.currency)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MiniStat icon={<TrendingUp size={18} color={colors.success} strokeWidth={2} />} label="إجمالي المشتريات" value={formatCurrency(totalPurchases, settings.currency)} colors={colors} />
      </View>

      {mergeResult !== null && (
        <View style={[styles.mergeBanner, { backgroundColor: mergeResult > 0 ? colors.success + '15' : colors.surfaceAlt }]}>
          <Check size={16} color={mergeResult > 0 ? colors.success : colors.textMuted} strokeWidth={2} />
          <Text style={[styles.mergeBannerText, { color: mergeResult > 0 ? colors.success : colors.textMuted }]}>
            {mergeResult > 0 ? `تم دمج ${mergeResult} سجل مكرر` : 'لا توجد سجلات مكررة للدمج'}
          </Text>
          <TouchableOpacity onPress={() => setMergeResult(null)} activeOpacity={0.7}>
            <X size={16} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.combinedToolbar, isDesktopLayout && styles.combinedToolbarDesktop, isDesktopLayout && styles.centeredWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {([
            { key: 'all', label: 'الكل', count: customers.length },
            { key: 'vip', label: 'مميزون', count: vipCount },
            { key: 'debtors', label: 'مدينون', count: debtorsCount },
            ...(settings.businessMode === 'telecom' ? [{ key: 'expiring' as const, label: 'انتهاء قريب', count: expirySoonCount }] : []),
          ] as { key: FilterMode; label: string; count: number }[]).map((f) => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, { color: filter === f.key ? '#FFFFFF' : colors.textSecondary }]}>
                {f.label} ({f.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.toolbarSearchRow, isDesktopLayout && styles.toolbarSearchRowDesktop, { borderColor: colors.border }]}>
          <Search size={isDesktopLayout ? 15 : 16} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث عن زبون..."
            placeholderTextColor={colors.textMuted}
            style={[styles.toolbarSearchInput, { color: colors.text }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.toolbarActions, isDesktopLayout && styles.toolbarActionsDesktop]}>
          <TouchableOpacity
            onPress={handleExportTemplate}
            style={[styles.toolbarBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <FileSpreadsheet size={16} color={colors.info} strokeWidth={2} />
            <Text style={[styles.toolbarBtnText, { color: colors.textSecondary }]}>قالب</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Platform.OS === 'web' ? fileInputRef.current?.click() : handleImportMobile()}
            style={[styles.toolbarBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
            disabled={importing}
          >
            <Upload size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.toolbarBtnText, { color: colors.textSecondary }]}>{importing ? '...' : 'استيراد'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportCustomers}
            style={[styles.toolbarBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Download size={16} color={colors.success} strokeWidth={2} />
            <Text style={[styles.toolbarBtnText, { color: colors.textSecondary }]}>تصدير</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const merged = mergeDuplicateCustomers();
              setMergeResult(merged);
            }}
            style={[styles.toolbarBtn, styles.toolbarBtnPrimary, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <RefreshCw size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.toolbarBtnTextWhite}>تحديث ودمج</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filteredCustomers.length === 0 ? (
        <View style={styles.emptyWrap}>
          {customers.length === 0 ? (
            <EmptyState
              icon={<Users size={32} color={colors.primary} strokeWidth={2} />}
              title="لا يوجد زبائن"
              subtitle="أضف زبائنك لإدارة حساباتهم وديونهم"
              actionLabel="إضافة زبون"
              onAction={() => { setEditCustomer(null); setShowForm(true); }}
            />
          ) : (
            <EmptyState
              icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />}
              title="لا نتائج"
              subtitle="جرّب كلمة بحث أخرى"
            />
          )}
        </View>
      ) : isDesktopLayout ? (
        <View style={[styles.tableWrap, isDesktopLayout && styles.centeredWrap]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableScrollContent}
          >
            <View style={[styles.tableContent, isDesktopLayout && styles.tableContentDesktop]}>
              <View style={[styles.tableHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Text style={[styles.headerCell, { flex: 2.1, color: colors.textSecondary }]}>الاسم</Text>
                <Text style={[styles.headerCell, { flex: 1.5, color: colors.textSecondary }]}>رقم التواصل</Text>
                <Text style={[styles.headerCell, { flex: 0.9, color: colors.textSecondary }]}>الاشتراكات</Text>
                <Text style={[styles.headerCell, { flex: 0.9, color: colors.textSecondary }]}>العمليات</Text>
                <Text style={[styles.headerCell, { flex: 1.3, color: colors.textSecondary }]}>إجمالي المشتريات</Text>
                <Text style={[styles.headerCell, { flex: 1.3, color: colors.textSecondary }]}>الحساب</Text>
                <Text style={[styles.headerCell, { flex: 2, color: colors.textSecondary }]}>الإجراءات</Text>
              </View>
              <FlatList
                data={filteredCustomers}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.cardListWrap}>
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
          />
        </View>
      )}

      {showAddMenu && (
        <>
          <Pressable style={styles.addMenuBackdrop} onPress={() => setShowAddMenu(false)} />
          <View style={[styles.addMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AddMenuItem
              icon={<UserPlus size={19} color={colors.primary} strokeWidth={2} />}
              label="إضافة يدوية"
              colors={colors}
              onPress={() => { setShowAddMenu(false); setEditCustomer(null); setShowForm(true); }}
            />
            <AddMenuItem
              icon={<ContactIcon size={19} color={colors.accent} strokeWidth={2} />}
              label="من جهات الاتصال"
              colors={colors}
              onPress={() => { setShowAddMenu(false); handleImportFromContacts(); }}
            />
            <AddMenuItem
              icon={<Upload size={19} color={colors.primary} strokeWidth={2} />}
              label="استيراد إكسل"
              colors={colors}
              onPress={() => { setShowAddMenu(false); setShowImportModal(true); }}
            />
            <AddMenuItem
              icon={<FileSpreadsheet size={19} color={colors.info} strokeWidth={2} />}
              label="تحميل قالب إكسل"
              colors={colors}
              onPress={() => { setShowAddMenu(false); handleExportTemplate(); }}
            />
            <AddMenuItem
              icon={<Download size={19} color={colors.success} strokeWidth={2} />}
              label="تصدير الزبائن"
              colors={colors}
              onPress={() => { setShowAddMenu(false); handleExportCustomers(); }}
            />
          </View>
        </>
      )}

      <TouchableOpacity
        onPress={() => setShowAddMenu((current) => !current)}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        accessibilityLabel={showAddMenu ? 'إغلاق خيارات إضافة الزبائن' : 'خيارات إضافة الزبائن'}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <CustomerFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditCustomer(null); }}
        onSave={handleSave}
        editCustomer={editCustomer}
        businessMode={settings.businessMode}
        colors={colors}
      />

      <PaymentModal
        visible={paymentCustomer !== null}
        customer={paymentCustomer}
        currency={settings.currency}
        colors={colors}
        onClose={() => setPaymentCustomer(null)}
        onConfirm={(amount) => {
          if (paymentCustomer) {
            recordPayment(paymentCustomer.id, amount);
            setPaymentCustomer(null);
          }
        }}
      />

      <BalanceModal
        visible={balanceCustomer !== null}
        customer={balanceCustomer}
        currency={settings.currency}
        colors={colors}
        onClose={() => setBalanceCustomer(null)}
        onConfirm={(amount, note) => {
          if (balanceCustomer) {
            addCustomerBalance(balanceCustomer.id, amount, note);
            setBalanceCustomer(null);
          }
        }}
      />

      {/* Customer Profile (unified) */}
      <AddDebtModal
        visible={debtCustomer !== null}
        customer={debtCustomer}
        currency={settings.currency}
        colors={colors}
        onClose={() => setDebtCustomer(null)}
        onConfirm={(amount, note) => {
          if (debtCustomer) {
            updateCustomer(debtCustomer.id, { debt: debtCustomer.debt + amount });
            setDebtCustomer(null);
          }
        }}
      />

      <CustomerProfile
        visible={detailCustomer !== null}
        customer={detailCustomer}
        onClose={() => setDetailCustomer(null)}
        onEdit={(c) => { setEditCustomer(c); setDetailCustomer(null); setShowForm(true); }}
        onPayment={(c) => { setPaymentCustomer(c); setDetailCustomer(null); }}
        onTopUp={(c) => { setBalanceCustomer(c); setDetailCustomer(null); }}
        onAddDebt={(c) => { setDebtCustomer(c); setDetailCustomer(null); }}
        onRedeem={(id, points) => { redeemLoyalty(id, points); }}
      />

      {/* SMS Preview Modal (web) */}
      <BaseModal
        visible={smsCustomer !== null}
        onClose={() => setSmsCustomer(null)}
        title="معاينة رسالة SMS"
      >
        {smsCustomer && (
          <View>
            <View style={[styles.smsPreviewBox, { backgroundColor: colors.surfaceAlt }]}>
              <View style={styles.smsHeader}>
                <MessageSquare size={16} color={colors.info} strokeWidth={2} />
                <Text style={[styles.smsTo, { color: colors.textSecondary }]}>إلى: {smsCustomer.phone}</Text>
              </View>
              <Text style={[styles.smsBody, { color: colors.text }]}>
                {fillSmsTemplate(settings.smsTemplate, {
                  name: smsCustomer.name,
                  sub: smsCustomer.subscriptionNumber || '—',
                  amount: formatCurrency(smsCustomer.debt, settings.currency),
                  debt: formatCurrency(smsCustomer.debt, settings.currency),
                })}
              </Text>
            </View>
            <Text style={[styles.smsNote, { color: colors.textMuted }]}>
              على الهاتف المحمول سيتم فتح تطبيق الرسائل تلقائياً مع النص جاهزاً للإرسال
            </Text>
          </View>
        )}
      </BaseModal>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="حذف العميل"
        message={`هل تريد حذف "${deleteTarget?.name}"؟ سيتم حذف جميع بياناته.`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteTarget) deleteCustomer(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Import Modal */}
      <BaseModal
        visible={showImportModal}
        onClose={() => { setShowImportModal(false); setImportResult(null); }}
        title="استيراد زبائن من إكسل"
        footer={
          <View style={styles.importFooter}>
            <TouchableOpacity
              onPress={() => { setShowImportModal(false); setImportResult(null); }}
              style={[styles.importCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.importCancelText, { color: colors.textSecondary }]}>إغلاق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Platform.OS === 'web' ? fileInputRef.current?.click() : handleImportMobile()}
              style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1 }]}
              activeOpacity={0.8}
              disabled={importing}
            >
              <Upload size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.saveBtnText}>{importing ? 'جاري الاستيراد...' : 'اختيار ملف'}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={[styles.importInfoBox, { backgroundColor: colors.info + '12' }]}>
          <Info size={20} color={colors.info} strokeWidth={2} />
          <Text style={[styles.importInfoText, { color: colors.textSecondary }]}>
            يقوم التطبيق بالتعرف التلقائي على أعمدة الملف بغض النظر عن ترتيبها أو مسمياتها. يدعم: الاسم، الجوال، الفئة، الدين، حد الائتمان، الخصم، ملاحظات، رقم الاشتراك، وتاريخ الانتهاء.
          </Text>
        </View>

        <TouchableOpacity onPress={handleExportTemplate} style={[styles.templateDownloadBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
          <Download size={16} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.templateDownloadText, { color: colors.primary }]}>تحميل قالب إكسل فارغ</Text>
        </TouchableOpacity>

        {importResult && (
          <View style={[styles.importResultBox, { backgroundColor: importResult.errors.length > 0 ? colors.warning + '15' : colors.success + '15' }]}>
            <View style={styles.importResultRow}>
              <Check size={18} color={colors.success} strokeWidth={2} />
              <Text style={[styles.importResultText, { color: colors.text }]}>تمت إضافة {importResult.added} زبون</Text>
            </View>
            {importResult.skipped > 0 && (
              <View style={styles.importResultRow}>
                <AlertCircle size={18} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.importResultText, { color: colors.text }]}>تم تجاهل {importResult.skipped} صف (مكرر أو ناقص)</Text>
              </View>
            )}
            {importResult.mapping.length > 0 && (
              <View style={styles.mappingBox}>
                <Text style={[styles.mappingTitle, { color: colors.textMuted }]}>الأعمدة المتعرف عليها:</Text>
                {importResult.mapping.map((m, i) => (
                  <Text key={i} style={[styles.mappingItem, { color: colors.textSecondary }]}>
                    &quot;{m.header}&quot; ← {m.field}
                  </Text>
                ))}
              </View>
            )}
            {importResult.errors.map((err, i) => (
              <Text key={i} style={[styles.importErrorText, { color: colors.danger }]}>{err}</Text>
            ))}
          </View>
        )}

        {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        )}
      </BaseModal>

      {/* Contacts Picker Modal */}
      <BaseModal
        visible={showContactsModal}
        onClose={() => { setShowContactsModal(false); setContactsError(''); }}
        title="استيراد من جهات الاتصال"
        footer={
          <View style={styles.importFooter}>
            <TouchableOpacity
              onPress={() => { setShowContactsModal(false); setContactsError(''); }}
              style={[styles.importCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.importCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={importSelectedContacts}
              style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1 }]}
              activeOpacity={0.8}
              disabled={selectedContactIds.size === 0}
            >
              <ContactIcon size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.saveBtnText}>
                إضافة {selectedContactIds.size > 0 ? `(${selectedContactIds.size})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View>
          {contactsError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.warning + '15', marginBottom: 12 }]}>
              <AlertCircle size={18} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.errorText, { color: colors.warning, flex: 1 }]}>{contactsError}</Text>
            </View>
          ) : null}

          {contactsLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
              <Text style={[styles.noTxns, { color: colors.textMuted }]}>جاري تحميل جهات الاتصال...</Text>
            </View>
          ) : deviceContacts.length > 0 ? (
            <>
              <View style={{ paddingHorizontal: 0, marginBottom: 12 }}>
                <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Search size={18} color={colors.textMuted} strokeWidth={2} />
                  <TextInput
                    value={contactsSearch}
                    onChangeText={setContactsSearch}
                    placeholder="ابحث في جهات الاتصال..."
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textInput, { color: colors.text }]}
                  />
                </View>
              </View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 8 }]}>
                {deviceContacts.length} جهة متاحة — {selectedContactIds.size} محدد
              </Text>
              <View style={{ maxHeight: 350, gap: 6 }}>
                {filteredDeviceContacts.map((contact, idx) => {
                  const key = `${contact.name}|${contact.phone}`;
                  const isSelected = selectedContactIds.has(key);
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => toggleContactSelection(contact)}
                      style={[
                        styles.contactPickItem,
                        {
                          backgroundColor: isSelected ? colors.primary + '15' : colors.surfaceAlt,
                          borderColor: isSelected ? colors.primary : 'transparent',
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.contactPickCheck, { backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: isSelected ? colors.primary : colors.border }]}>
                        {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.contactPickName, { color: colors.text }]} numberOfLines={1}>
                          {contact.name}
                        </Text>
                        <View style={styles.phoneRow}>
                          <Phone size={11} color={colors.textMuted} strokeWidth={2} />
                          <Text style={[styles.contactPickPhone, { color: colors.textMuted }]}>
                            {contact.phone}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : !contactsError ? (
            <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
              <ContactIcon size={32} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.noTxns, { color: colors.textMuted }]}>
                {Platform.OS === 'web'
                  ? 'اضغط الزر أدناه لاختيار جهات الاتصال من جوالك'
                  : 'لا توجد جهات اتصال جديدة لإضافتها'}
              </Text>
              {Platform.OS === 'web' && isContactsSupported() && (
                <TouchableOpacity
                  onPress={handleImportFromContacts}
                  style={[styles.saveBtn, { backgroundColor: colors.primary, paddingHorizontal: 24 }]}
                  activeOpacity={0.8}
                >
                  <ContactIcon size={18} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.saveBtnText}>اختيار جهات الاتصال</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </BaseModal>
    </View>
  );
}

function AddMenuItem({
  icon, label, colors, onPress,
}: {
  icon: React.ReactNode;
  label: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.addMenuItem} activeOpacity={0.7}>
      <View style={[styles.addMenuIcon, { backgroundColor: colors.surfaceAlt }]}>{icon}</View>
      <Text style={[styles.addMenuLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function MiniStat({ icon, label, value, colors }: { icon: React.ReactNode; label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  const { width: screenWidth } = useWindowDimensions();
  const isDesktopLayout = Platform.OS === 'web' && screenWidth >= 768;
  return (
    <View style={[styles.miniStat, isDesktopLayout && { justifyContent: 'center' }]}>
      {icon}
      <View style={[isDesktopLayout && { alignItems: 'center' }]}>
        <Text style={[styles.miniStatLabel, { color: colors.textMuted, ...(isDesktopLayout ? { textAlign: 'center' } : {}) }]}>{label}</Text>
        <Text style={[styles.miniStatValue, { color: colors.text, ...(isDesktopLayout ? { textAlign: 'center' } : {}) }]}>{value}</Text>
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function CustomerFormModal({
  visible, onClose, onSave, editCustomer, businessMode, colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; phone: string; tier: CustomerTier; creditLimit: number; discountPercent: number; notes: string; subscriptionNumber: string; subscriptionExpiry: number | null }) => void;
  editCustomer: Customer | null;
  businessMode: 'retail' | 'telecom';
  colors: Colors;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<CustomerTier>('regular');
  const [creditLimit, setCreditLimit] = useState('500');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [notes, setNotes] = useState('');
  const [subNumber, setSubNumber] = useState('');
  const [subExpiry, setSubExpiry] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(editCustomer?.name ?? '');
      setPhone(editCustomer?.phone ?? '');
      setTier(editCustomer?.tier ?? 'regular');
      setCreditLimit(editCustomer?.creditLimit.toString() ?? '500');
      setDiscountPercent(editCustomer?.discountPercent.toString() ?? '0');
      setNotes(editCustomer?.notes ?? '');
      setSubNumber(editCustomer?.subscriptionNumber ?? '');
      setSubExpiry(editCustomer?.subscriptionExpiry ? new Date(editCustomer.subscriptionExpiry).toISOString().split('T')[0] : '');
      setError('');
    }
  }, [visible, editCustomer]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم العميل مطلوب'); return; }
    if (!phone.trim()) { setError('رقم الهاتف مطلوب'); return; }
    let expiryTs: number | null = null;
    if (subExpiry.trim()) {
      const d = new Date(subExpiry);
      if (!isNaN(d.getTime())) expiryTs = d.getTime();
    }
    onSave({
      name: name.trim(),
      phone: normalizePhoneNumber(phone.trim()),
      tier,
      creditLimit: parseFloat(creditLimit) || 0,
      discountPercent: parseFloat(discountPercent) || 0,
      notes: notes.trim(),
      subscriptionNumber: subNumber.trim(),
      subscriptionExpiry: expiryTs,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editCustomer ? 'تعديل العميل' : 'زبون جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editCustomer ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <FormField label="اسم العميل" colors={colors}>
        <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="مثال: أحمد محمد"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { color: colors.text }]}
          />
          <UserPlus size={20} color={colors.textMuted} strokeWidth={2} />
        </View>
      </FormField>

      <FormField label="رقم الهاتف" colors={colors}>
        <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Phone size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={phone}
            onChangeText={(value) => setPhone(normalizePhoneNumber(value))}
            placeholder="05XXXXXXXX"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.textInput, { color: colors.text }]}
          />
        </View>
      </FormField>

      <FormField label="تصنيف العميل" colors={colors}>
        <View style={styles.tierSelector}>
          <TouchableOpacity
            onPress={() => setTier('regular')}
            style={[styles.tierOption, tier === 'regular' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
          >
            <Users size={18} color={tier === 'regular' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.tierText, { color: tier === 'regular' ? '#FFFFFF' : colors.textSecondary }]}>عادي</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTier('vip')}
            style={[styles.tierOption, tier === 'vip' ? { backgroundColor: colors.accent } : { backgroundColor: colors.surfaceAlt }]}
          >
            <Crown size={18} color={tier === 'vip' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.tierText, { color: tier === 'vip' ? '#FFFFFF' : colors.textSecondary }]}>مميز VIP</Text>
          </TouchableOpacity>
        </View>
      </FormField>

      <View style={styles.formRow}>
        <FormField label="حد الائتمان" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={creditLimit}
            onChangeText={setCreditLimit}
            placeholder="500"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </FormField>
        <FormField label="خصم تلقائي %" colors={colors} style={{ flex: 1 }}>
          <TextInput
            value={discountPercent}
            onChangeText={setDiscountPercent}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </FormField>
      </View>

      {/* Telecom subscription fields */}
      {businessMode === 'telecom' && (
        <View style={styles.subFormSection}>
          <View style={[styles.subFormHeader, { backgroundColor: colors.primary + '10' }]}>
            <AlertCircle size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.subFormTitle, { color: colors.primary }]}>بيانات الاشتراك</Text>
          </View>
          <View style={styles.formRow}>
            <FormField label="رقم الاشتراك" colors={colors} style={{ flex: 1 }}>
              <TextInput
                value={subNumber}
                onChangeText={setSubNumber}
                placeholder="مثال: 05XXXXXXXX"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
              />
            </FormField>
            <FormField label="تاريخ الانتهاء" colors={colors} style={{ flex: 1 }}>
              <TextInput
                value={subExpiry}
                onChangeText={setSubExpiry}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
              />
            </FormField>
          </View>
        </View>
      )}

      <FormField label="ملاحظات" colors={colors}>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="ملاحظات حول العميل..."
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </FormField>
    </BaseModal>
  );
}

function BalanceModal({
  visible, customer, currency, colors, onClose, onConfirm,
}: {
  visible: boolean;
  customer: Customer | null;
  currency: string;
  colors: Colors;
  onClose: () => void;
  onConfirm: (amount: number, note: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
      setError('');
    }
  }, [visible, customer]);

  const handleConfirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setError('أدخل مبلغاً صحيحاً'); return; }
    onConfirm(val, note.trim());
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="شحن رصيد مسبق"
      footer={
        <TouchableOpacity onPress={handleConfirm} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <PlusCircle size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>تأكيد الشحن</Text>
        </TouchableOpacity>
      }
    >
      {customer && (
        <View>
          <View style={[styles.paymentCustomerInfo, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{customer.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={[styles.paymentName, { color: colors.text }]}>{customer.name}</Text>
              <Text style={[styles.paymentPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
            </View>
          </View>

          <View style={[styles.currentBalanceBox, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.currentDebtLabel, { color: colors.textSecondary }]}>الرصيد الحالي</Text>
            <Text style={[styles.currentBalanceValue, { color: colors.primary }]}>
              {formatCurrency(customer.balance, currency)}
            </Text>
          </View>

          <FormField label="مبلغ الشحن" colors={colors}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
            />
          </FormField>

          <View style={styles.quickAmounts}>
            <TouchableOpacity onPress={() => setAmount('50')} style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.quickAmountText, { color: colors.text }]}>50</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAmount('100')} style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.quickAmountText, { color: colors.text }]}>100</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAmount('200')} style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.quickAmountText, { color: colors.text }]}>200</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAmount('500')} style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.quickAmountText, { color: colors.text }]}>500</Text>
            </TouchableOpacity>
          </View>

          <FormField label="ملاحظة (اختياري)" colors={colors}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="ملاحظة حول الشحن..."
              placeholderTextColor={colors.textMuted}
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
            />
          </FormField>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginTop: 12 }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}
        </View>
      )}
    </BaseModal>
  );
}

function PaymentModal({
  visible, customer, currency, colors, onClose, onConfirm,
}: {
  visible: boolean;
  customer: Customer | null;
  currency: string;
  colors: Colors;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount(customer?.debt.toString() ?? '');
      setError('');
    }
  }, [visible, customer]);

  const handleConfirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setError('أدخل مبلغاً صحيحاً'); return; }
    if (customer && val > customer.debt) {
      setError(`المبلغ يتجاوز الدين (${formatCurrency(customer.debt, currency)})`);
      return;
    }
    onConfirm(val);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="تسديد دين"
      footer={
        <TouchableOpacity onPress={handleConfirm} style={[styles.saveBtn, { backgroundColor: colors.success }]} activeOpacity={0.8}>
          <Check size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>تأكيد التسديد</Text>
        </TouchableOpacity>
      }
    >
      {customer && (
        <View>
          <View style={[styles.paymentCustomerInfo, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>{customer.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={[styles.paymentName, { color: colors.text }]}>{customer.name}</Text>
              <Text style={[styles.paymentPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
            </View>
          </View>

          <View style={[styles.currentDebtBox, { backgroundColor: colors.danger + '12' }]}>
            <Text style={[styles.currentDebtLabel, { color: colors.textSecondary }]}>الدين الحالي</Text>
            <Text style={[styles.currentDebtValue, { color: colors.danger }]}>
              {formatCurrency(customer.debt, currency)}
            </Text>
          </View>

          <FormField label="مبلغ التسديد" colors={colors}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
            />
          </FormField>

          <View style={styles.quickAmounts}>
            <TouchableOpacity
              onPress={() => setAmount(customer.debt.toString())}
              style={[styles.quickAmount, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.quickAmountText}>تسديد الكل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAmount((customer.debt / 2).toFixed(2))}
              style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[styles.quickAmountText, { color: colors.text }]}>النصف</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAmount('')}
              style={[styles.quickAmount, { backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[styles.quickAmountText, { color: colors.text }]}>مسح</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginTop: 12 }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}
        </View>
      )}
    </BaseModal>
  );
}

function AddDebtModal({
  visible, customer, currency, colors, onClose, onConfirm,
}: {
  visible: boolean;
  customer: Customer | null;
  currency: string;
  colors: Colors;
  onClose: () => void;
  onConfirm: (amount: number, note: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
      setError('');
    }
  }, [visible, customer]);

  const handleConfirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setError('أدخل مبلغاً صحيحاً'); return; }
    onConfirm(val, note.trim());
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="إضافة دين جديد"
      footer={
        <TouchableOpacity onPress={handleConfirm} style={[styles.saveBtn, { backgroundColor: colors.danger }]} activeOpacity={0.8}>
          <Check size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>تأكيد إضافة الدين</Text>
        </TouchableOpacity>
      }
    >
      {customer && (
        <View>
          <View style={[styles.paymentCustomerInfo, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.avatar, { backgroundColor: colors.danger + '20' }]}>
              <Text style={[styles.avatarText, { color: colors.danger }]}>{customer.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={[styles.paymentName, { color: colors.text }]}>{customer.name}</Text>
              <Text style={[styles.paymentPhone, { color: colors.textMuted }]}>{customer.phone}</Text>
            </View>
          </View>

          <View style={[styles.currentDebtBox, { backgroundColor: colors.danger + '12' }]}>
            <Text style={[styles.currentDebtLabel, { color: colors.textSecondary }]}>الدين الحالي</Text>
            <Text style={[styles.currentDebtValue, { color: colors.danger }]}>
              {formatCurrency(customer.debt, currency)}
            </Text>
          </View>

          <FormField label="مبلغ الدين الجديد" colors={colors}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
            />
          </FormField>

          <FormField label="ملاحظة (اختيارية)" colors={colors}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="سبب الدين..."
              placeholderTextColor={colors.textMuted}
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 14, textAlign: 'right' }]}
            />
          </FormField>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginTop: 12 }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}
        </View>
      )}
    </BaseModal>
  );
}

function FormField({ label, children, colors, style }: { label: string; children: React.ReactNode; colors: Colors; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  statsBarDesktop: {
    marginHorizontal: 'auto',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    marginTop: 4,
  },
  centeredWrap: {
    marginHorizontal: 'auto',
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  mergeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 8, marginHorizontal: 16 },
  mergeBannerText: { flex: 1, fontSize: 13, fontFamily: 'Cairo-Regular' },
  miniStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.06)',
  },
  miniStatLabel: { fontSize: 11 },
  miniStatValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 1 },
  divider: { width: 1, height: 28, marginHorizontal: 0, alignSelf: 'center' },
  cardListWrap: { flex: 1, paddingHorizontal: 16, paddingBottom: 80 },
  customerCard: { borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  customerCardTop: { marginBottom: 10 },
  customerCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customerCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customerCardName: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', flexShrink: 1 },
  customerCardPhone: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 2 },
  cardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardAvatarText: { fontSize: 16, fontWeight: '700' },
  customerCardStats: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingVertical: 10, marginBottom: 10 },
  customerCardStatItem: { flex: 1, alignItems: 'center' },
  customerCardStatLabel: { fontSize: 10, fontFamily: 'Cairo-Regular', marginBottom: 3 },
  customerCardStatValue: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  customerCardStatDivider: { width: 1, height: 28 },
  customerCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIconBtn: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  combinedToolbar: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  combinedToolbarDesktop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 'auto', marginTop: 10 },
  chipsScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  toolbarSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(128,128,128,0.06)',
  },
  toolbarSearchInput: { flex: 1, fontSize: 14, fontFamily: 'Cairo-Regular', padding: 0, minHeight: 22 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  toolbarBtnText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  toolbarBtnPrimary: { borderWidth: 0 },
  toolbarBtnTextWhite: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  toolbarSearchRowDesktop: { width: 220, flexShrink: 0, paddingHorizontal: 8, paddingVertical: 6 },
  toolbarActionsDesktop: { flexShrink: 0 },
  filterChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10 },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  emptyWrap: { flex: 1 },
  tableWrap: { flex: 1, paddingHorizontal: 0, paddingBottom: 16, marginTop: 10 },
  tableContent: { width: '100%', minWidth: 920 },
  tableContentDesktop: { width: '100%', minWidth: 0, maxWidth: '100%', marginHorizontal: 'auto' },
  tableScrollContent: { minWidth: '100%' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1.5, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  headerCell: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold', paddingHorizontal: 5, textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, minHeight: 54 },
  col: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  colName: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  colActions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  rowAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { fontSize: 12, fontWeight: '700' },
  rowName: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  rowText: { fontSize: 12, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  rowTextNum: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold', textAlign: 'center' },
  balancePillSmall: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  balancePillSmallText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  rowActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  rowActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  rowIconBtn: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fab: { position: 'absolute', bottom: 80, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, zIndex: 20 },
  addMenuBackdrop: { ...StyleSheet.absoluteFill, zIndex: 10 },
  addMenu: { position: 'absolute', right: 16, bottom: 148, width: 232, borderRadius: 18, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 10, zIndex: 20 },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 8, borderRadius: 12 },
  addMenuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addMenuLabel: { flex: 1, textAlign: 'right', fontSize: 14, fontFamily: 'Cairo-SemiBold' },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  textInput: { flex: 1, fontSize: 15, padding: 0, minHeight: 22 },
  textArea: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  tierSelector: { flexDirection: 'row', gap: 10 },
  tierOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  tierText: { fontSize: 14, fontWeight: '700' },
  formRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  subFormSection: { marginBottom: 12 },
  subFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 10 },
  subFormTitle: { fontSize: 13, fontWeight: '700' },
  paymentCustomerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, marginBottom: 16 },
  paymentName: { fontSize: 15, fontWeight: '700' },
  paymentPhone: { fontSize: 13, marginTop: 2 },
  currentDebtBox: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  currentDebtLabel: { fontSize: 13, marginBottom: 4 },
  currentDebtValue: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  quickAmounts: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickAmount: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  quickAmountText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatarLarge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { fontSize: 22, fontWeight: '700' },
  detailName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  detailPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailPhone: { fontSize: 14 },
  debtCard: { borderRadius: 14, padding: 14, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  debtCardInfo: { flex: 1 },
  debtCardLabel: { fontSize: 12, marginBottom: 4 },
  debtCardValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  debtCardValue2: { fontSize: 15, fontWeight: '600' },
  ageBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 6, alignSelf: 'flex-start' },
  ageBadgeText: { fontSize: 11, fontWeight: '700' },
  subCard: { borderRadius: 14, padding: 14, marginBottom: 16, gap: 8 },
  subCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subCardLabel: { fontSize: 13, color: '#6B6F8A', flex: 1 },
  subCardValue: { fontSize: 13, fontWeight: '600' },
  notesSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  notesText: { fontSize: 14, lineHeight: 20 },
  txnCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  txnCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  txnCardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txnCardType: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnCardDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  txnCardDate: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  txnCardAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnCardItems: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  txnCardItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnCardItemName: { fontSize: 12, flex: 1, fontFamily: 'Cairo-Regular' },
  txnCardItemQty: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnCardMore: { fontSize: 11, fontFamily: 'Cairo-Regular', marginTop: 2 },
  txnCardDebtBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  txnCardDebtText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  noTxns: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  balanceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 14, marginBottom: 16 },
  balanceCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balanceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  balanceLabel: { fontSize: 12, marginBottom: 2 },
  balanceValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  topUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  topUpBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  currentBalanceBox: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  currentBalanceValue: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  detailActionText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  smsPreviewBox: { borderRadius: 14, padding: 14, gap: 10 },
  smsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smsTo: { fontSize: 13, fontWeight: '600' },
  smsBody: { fontSize: 14, lineHeight: 22 },
  smsNote: { fontSize: 12, marginTop: 12, textAlign: 'center' },
  loyaltyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 14, marginBottom: 16 },
  loyaltyCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loyaltyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loyaltyLabel: { fontSize: 12, marginBottom: 2 },
  loyaltyValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  redeemBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  importExportText: { fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  importFooter: { flexDirection: 'row', gap: 10 },
  importCancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', paddingHorizontal: 20 },
  importCancelText: { fontSize: 15, fontWeight: '700' },
  importInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, marginBottom: 16 },
  importInfoText: { fontSize: 13, lineHeight: 20, flex: 1 },
  templateDownloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  templateDownloadText: { fontSize: 14, fontWeight: '700' },
  importResultBox: { borderRadius: 12, padding: 14, gap: 8 },
  importResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importResultText: { fontSize: 14, fontWeight: '600' },
  importErrorText: { fontSize: 12, fontWeight: '600' },
  mappingBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)', gap: 2 },
  mappingTitle: { fontSize: 12, fontWeight: '700' },
  mappingItem: { fontSize: 11 },
  contactPickItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  contactPickCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  contactPickName: { fontSize: 14, fontWeight: '600' },
  contactPickPhone: { fontSize: 12, marginTop: 2 },
});
