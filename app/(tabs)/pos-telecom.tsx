import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Platform, Linking, Alert, useWindowDimensions, PermissionsAndroid } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Smartphone, CreditCard, Wallet, BookOpen, Check, MessageSquare,
  Users, Search, X, ChevronDown, Phone, Bell, Clock,
  Signal, Zap, Calculator, Send, Upload, Download, FileSpreadsheet, PlusCircle,
  AlertCircle, RefreshCw, Repeat, Pencil, Trash2, Receipt as ReceiptIcon,
  XCircle, Save, Coins, CalendarClock, Ban, PhoneCall, Image as ImageIcon, Loader2,
  UserRound, MoreVertical, ArrowUpDown, Filter,
} from 'lucide-react-native';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import { useApp } from '@/lib/app-context';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, fillSmsTemplate, normalizePhoneNumber } from '@/lib/format';
import { createEscalationState } from '@/lib/debt-escalation';
import type { TelecomCompany, SimCard, SubAgent, Customer, TelecomSale, TelecomSaleMode, SimType, PaymentMethod, PaymentStatus, DebtReminderFrequency, AgentBundle, FollowUpStatus, WalletType } from '@/types';
import { ELECTRONIC_WALLET_TYPES } from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { CashCalculator } from '@/components/CashCalculator';
import { DirectRechargeModal } from '@/components/DirectRechargeModal';
import { TelecomReceipt } from '@/components/TelecomReceipt';
import { TelecomSaleHistory, getRemainingChargeDays } from '@/components/TelecomSaleHistory';
import { CustomerProfile } from '@/components/CustomerProfile';
import { exportXlsx, pickExcelFile, readPickedExcel } from '@/lib/xlsx-export';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getDeviceContacts, hasContactsPermission, type DeviceContact } from '@/lib/native-bridge';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function TelecomPOSScreen() {
  const {
    settings, telecomCompanies, simCards, subAgents, customers, telecomSales,
    addTelecomSale, updateTelecomSale, deleteTelecomSale, checkAutoRenewals,
    addCustomer, updateCustomer, recordPayment,
    addDebtReminder, activeShift, currentStaff, readOnlyMode,
    agentBundles, logOutboundSms, updateSubAgent, phoneNumbers,
    addWalletTransaction,
  } = useApp();
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isMobileLayout = Platform.OS !== 'web' || windowWidth < 1200;
  const insets = useSafeAreaInsets();

  const [saleMode, setSaleMode] = useState<TelecomSaleMode>('sell_sim');
  const [selectedCompany, setSelectedCompany] = useState<TelecomCompany | null>(null);
  const [selectedSubAgent, setSelectedSubAgent] = useState<SubAgent | null>(null);
  const [selectedSim, setSelectedSim] = useState<SimCard | null>(null);
  const [showSimPicker, setShowSimPicker] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<AgentBundle | null>(null);
  const [showBundlePicker, setShowBundlePicker] = useState(false);
  const [simOption, setSimOption] = useState<'none' | 'plastic' | 'barcode'>('none');

  const [simNumber, setSimNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDeviceContacts, setShowDeviceContacts] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [deviceContactsSearch, setDeviceContactsSearch] = useState('');
  const [deviceContactsLoading, setDeviceContactsLoading] = useState(false);
  const [deviceContactsError, setDeviceContactsError] = useState('');

  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid_full');
  const [selectedWalletType, setSelectedWalletType] = useState<WalletType>('palpay');
  const [reminderDate, setReminderDate] = useState('');
  const [showCashCalc, setShowCashCalc] = useState(false);
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDirectRecharge, setShowDirectRecharge] = useState(false);
  const [formStep, setFormStep] = useState(0);
  const [chargeDuration, setChargeDuration] = useState<string>('month');
  const [offerPrice, setOfferPrice] = useState('');
  const [saleOperationType, setSaleOperationType] = useState<'activation' | 'renewal'>('activation');
  const [salePriceOverride, setSalePriceOverride] = useState('');

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderFreq, setReminderFreq] = useState<DebtReminderFrequency>('daily');
  const [reminderTime, setReminderTime] = useState('10:00');
  const [reminderCustomDays, setReminderCustomDays] = useState('3');

  const [showSuccess, setShowSuccess] = useState(false);
  const [lastSale, setLastSale] = useState<TelecomSale | null>(null);

  const [simSearchQuery, setSimSearchQuery] = useState('');
  const [showSimSearchResults, setShowSimSearchResults] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [mobileMoreTab, setMobileMoreTab] = useState<'import' | 'sort' | 'filter'>('import');
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeImageInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [showManualCrop, setShowManualCrop] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState('');
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropProcessing, setCropProcessing] = useState(false);
  const [manualSimInput, setManualSimInput] = useState('');

  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [renewingFromSale, setRenewingFromSale] = useState<TelecomSale | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<TelecomSale | null>(null);
  const [receiptSale, setReceiptSale] = useState<TelecomSale | null>(null);
  const [collectSale, setCollectSale] = useState<TelecomSale | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectPaymentMethod, setCollectPaymentMethod] = useState<PaymentMethod>('cash');
  const [collectWalletType, setCollectWalletType] = useState<WalletType>('palpay');
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);

  const [cancelSale, setCancelSale] = useState<TelecomSale | null>(null);
  const [cancelDeduction, setCancelDeduction] = useState('');
  const [followUpSale, setFollowUpSale] = useState<TelecomSale | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [historySort, setHistorySort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'followup' | 'cancelled'>('all');

  useEffect(() => {
    const interval = setInterval(() => checkAutoRenewals(), 3600000);
    return () => clearInterval(interval);
  }, [checkAutoRenewals]);

  // Auto-fill serial number from phone numbers registry when simNumber matches
  useEffect(() => {
    if (!simNumber) return;
    const match = phoneNumbers.find((p) => p.phoneNumber === simNumber);
    if (match?.simSerialNumber && !serialNumber) {
      setSerialNumber(match.simSerialNumber);
    }
  }, [simNumber, phoneNumbers, serialNumber]);

  // Screenshot paste listener — Ctrl+V anywhere on web triggers OCR and opens the sale form
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handlePaste = (e: ClipboardEvent) => {
      const imageItem = Array.from(e.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      if (!showForm) {
        resetForm();
        setShowForm(true);
        setFormStep(0);
      }
      void handleBarcodeImageUpload(file);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const searchParams = useLocalSearchParams<{ sim?: string; phone?: string; name?: string; renewId?: string }>();

  useEffect(() => {
    const sim = searchParams.sim;
    const phone = searchParams.phone;
    const name = searchParams.name;
    const renewId = searchParams.renewId;
    if (!sim && !phone && !name && !renewId) return;

    // Handle renewal by ID
    if (renewId) {
      const sale = telecomSales.find((s) => s.id === renewId);
      if (sale) {
        handleRenew(sale);
        return;
      }
    }

    // Pre-fill new operation form
    resetForm();
    if (sim) setSimNumber(sim.replace(/\D/g, '').slice(0, 10));
    if (phone) setCustomerPhone(normalizePhoneNumber(phone));
    if (name) {
      setCustomerName(name);
      const exact = customers.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (exact) {
        setSelectedCustomer(exact);
        if (!phone) setCustomerPhone(exact.phone);
      }
    }
    setShowForm(true);
    setFormStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.sim, searchParams.phone, searchParams.name, searchParams.renewId]);

  const availableSims = useMemo(() => {
    if (!selectedCompany) return [];
    return simCards.filter((s) => s.companyId === selectedCompany.id && s.active && s.stock > 0);
  }, [simCards, selectedCompany]);

  const availableBundles = useMemo(() => {
    if (!selectedCompany || !selectedSubAgent) return [];
    return agentBundles.filter((b) => b.subAgentId === selectedSubAgent.id && b.companyId === selectedCompany.id && b.active);
  }, [agentBundles, selectedCompany, selectedSubAgent]);

  const availableCompanies = useMemo(() => {
    if (!selectedSubAgent) return [];
    return telecomCompanies.filter((c) => c.active && selectedSubAgent.companyIds.includes(c.id));
  }, [telecomCompanies, selectedSubAgent]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.trim().toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  const simSearchResults = useMemo(() => {
    if (!simSearchQuery.trim()) return [];
    const q = simSearchQuery.trim().toLowerCase();
    return telecomSales.filter((s) =>
      (s.simNumber && s.simNumber.toLowerCase().includes(q)) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      (s.customerPhone && s.customerPhone.includes(q))
    ).slice(0, 10);
  }, [telecomSales, simSearchQuery]);

  const customerNameSuggestions = useMemo(() => {
    if (!customerName.trim()) return [];
    const q = customerName.trim().toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5);
  }, [customers, customerName]);

  const isNewPhoneQuery = useMemo(() => {
    const q = customerName.trim();
    if (q.length < 3) return false;
    const normalized = normalizePhoneNumber(q);
    if (normalized.length < 5) return false;
    return !customers.some((c) => c.phone === normalized);
  }, [customerName, customers]);

  const handleCreateNewForPhone = () => {
    const normalized = normalizePhoneNumber(customerName.trim());
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone(normalized);
    setShowNameSuggestions(false);
  };

  const offerPriceVal = parseFloat(offerPrice) || 0;
  const isOfferBundle = !!selectedBundle && (selectedBundle.bundleType === 'offer' || (selectedBundle.prices?.['3_months'] != null && selectedBundle.prices?.['month'] == null));
  const bundleHasOffer = !!selectedBundle && selectedBundle.prices?.['3_months'] != null && (selectedBundle.offerType ?? 'new_number') === saleOperationType;
  const monthlySalePrice = selectedBundle?.prices?.['month'] ?? 0;
  const bundleSalePrice = useMemo(() => {
    if (!selectedBundle) return 0;
    if (isOfferBundle) return selectedBundle.prices?.['3_months'] ?? 0;
    if (chargeDuration === 'offer') return selectedBundle.prices?.['3_months'] ?? 0;
    if (chargeDuration === 'month') return monthlySalePrice;
    switch (chargeDuration) {
      case '3_days': return Math.round((monthlySalePrice / 30 * 3) * 100) / 100;
      case 'week': return Math.round((monthlySalePrice / 30 * 7) * 100) / 100;
      case '2_weeks': return Math.round((monthlySalePrice / 30 * 14) * 100) / 100;
      case '3_weeks': return Math.round((monthlySalePrice / 30 * 21) * 100) / 100;
      case '2_months': return monthlySalePrice * 2;
      case '3_months': return monthlySalePrice * 3;
      default: return monthlySalePrice;
    }
  }, [chargeDuration, isOfferBundle, monthlySalePrice, selectedBundle]);

  const simSurcharge = useMemo(() => {
    if (simOption === 'none') return 0;
    if (simOption === 'plastic') return selectedSim?.price ?? 0;
    // barcode: 5 NIS for all, 10 for الوها
    if (selectedCompany?.name === 'الوها') return 10;
    return 5;
  }, [simOption, selectedSim, selectedCompany]);

  const simCostVal = useMemo(() => {
    if (simOption === 'none') return 0;
    if (simOption === 'plastic') return selectedSim?.cost ?? 0;
    // barcode: same cost as the surcharge charged to the customer
    if (selectedCompany?.name === 'الوها') return 10;
    return 5;
  }, [simOption, selectedSim, selectedCompany]);

  const autoTotal = bundleSalePrice + simSurcharge;
  const salePriceVal = parseFloat(salePriceOverride) || 0;
  const total = salePriceVal > 0 ? salePriceVal : autoTotal;
  const monthlyCost = selectedBundle?.cost ?? 0;
  const bundleCost = useMemo(() => {
    if (!selectedBundle) return 0;
    if (isOfferBundle) return selectedBundle.prices?.['3_months'] != null ? (selectedBundle.cost ?? 0) : 0;
    if (chargeDuration === 'offer') return selectedBundle.cost ?? 0;
    if (chargeDuration === 'month') return monthlyCost;
    switch (chargeDuration) {
      case '3_days': return Math.round((monthlyCost / 30 * 3) * 100) / 100;
      case 'week': return Math.round((monthlyCost / 30 * 7) * 100) / 100;
      case '2_weeks': return Math.round((monthlyCost / 30 * 14) * 100) / 100;
      case '3_weeks': return Math.round((monthlyCost / 30 * 21) * 100) / 100;
      case '2_months': return monthlyCost * 2;
      case '3_months': return monthlyCost * 3;
      default: return monthlyCost;
    }
  }, [chargeDuration, isOfferBundle, monthlyCost, selectedBundle]);
  const totalCost = bundleCost + simCostVal;

  const paid = paymentStatus === 'paid_full' ? total : paymentStatus === 'paid_partial' ? (parseFloat(paidAmount) || 0) : 0;
  const remaining = Math.max(0, total - paid);

  const handleSimSearchSelect = (sale: TelecomSale) => {
    setSimNumber(sale.simNumber);
    setSimSearchQuery(sale.simNumber);
    setShowSimSearchResults(false);
    if (sale.customerName) setCustomerName(sale.customerName);
    if (sale.customerPhone) setCustomerPhone(sale.customerPhone);
    const matchedCustomer = customers.find((c) => c.id === sale.customerId);
    if (matchedCustomer) setSelectedCustomer(matchedCustomer);
    const matchedCompany = telecomCompanies.find((c) => c.id === sale.companyId);
    if (matchedCompany) setSelectedCompany(matchedCompany);
  };

  const handleSimSearchAddNew = () => {
    const num = simSearchQuery.trim();
    resetForm();
    setSimNumber(num);
    setShowSimSearchResults(false);
    setShowForm(true);
    setFormStep(0);
  };

  const handleCustomerNameChange = (name: string) => {
    setCustomerName(name);
    setSelectedCustomer(null);
    setShowNameSuggestions(true);
    const exact = customers.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (exact) {
      setCustomerPhone(exact.phone);
      setSelectedCustomer(exact);
      setShowNameSuggestions(false);
    }
  };

  const openDeviceContacts = async () => {
    setDeviceContactsError('');
    setDeviceContactsLoading(true);
    setShowDeviceContacts(true);
    if (Platform.OS === 'android' && !(await hasContactsPermission())) {
      try {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS, {
          title: 'إذن الوصول لجهات الاتصال',
          message: 'يحتاج التطبيق لقراءة جهات الاتصال لاختيار اسم الزبون ورقمه',
          buttonNeutral: 'اسأل لاحقاً',
          buttonNegative: 'إلغاء',
          buttonPositive: 'موافق',
        });
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          setDeviceContactsError('يجب السماح بالوصول إلى جهات الاتصال');
          setDeviceContactsLoading(false);
          return;
        }
      } catch {
        setDeviceContactsError('تعذر طلب إذن جهات الاتصال');
        setDeviceContactsLoading(false);
        return;
      }
    }
    const contacts = await getDeviceContacts();
    setDeviceContacts(contacts);
    setDeviceContactsLoading(false);
    if (contacts.length === 0) setDeviceContactsError('لا توجد جهات اتصال متاحة على الهاتف');
  };

  const filteredDeviceContacts = useMemo(() => {
    const query = deviceContactsSearch.trim().toLowerCase();
    if (!query) return deviceContacts;
    return deviceContacts.filter((contact) => contact.name.toLowerCase().includes(query) || contact.phone.includes(query));
  }, [deviceContacts, deviceContactsSearch]);

  const selectDeviceContact = (contact: DeviceContact) => {
    setCustomerName(contact.name);
    setCustomerPhone(normalizePhoneNumber(contact.phone));
    setSelectedCustomer(null);
    setShowDeviceContacts(false);
    setDeviceContactsSearch('');
  };

  const handleExportTemplate = async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['الشركة', 'الشركة الفرعية', 'رقم الهاتف', 'مدة الشحن', 'نوع العملية', 'اسم الزبون', 'رقم الزبون', 'سعر التكلفة', 'سعر البيع', 'سعر الشريحة', 'حالة الدفع', 'المبلغ المدفوع', 'المتبقي', 'تاريخ الدفع', 'المتابعة', 'المخصوم عند الإلغاء', 'ملاحظات'],
      ['سيلكوم', 'وكيل 1', '05XXXXXXXX', 'شهر', 'تفعيل', 'أحمد محمد', '05XXXXXXXX', '25', '50', '0', 'نقدي', '50', '0', '', 'تم التحصيل', '0', ''],
    ]);
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'قالب المعاملات');
    await exportXlsx(wb, 'قالب_معاملات_الاتصالات.xlsx');
  };

  const handleExportSales = async () => {
    const PAYMENT_LABELS: Record<string, string> = { cash: 'نقدي', wallet: 'تطبيق', debt: 'دين', usdt: 'USDT' };
    const DURATION_LABELS: Record<string, string> = { '3_days': '3 أيام', week: 'أسبوع', '2_weeks': 'أسبوعين', '3_weeks': '3 أسابيع', month: 'شهر', '2_months': 'شهرين', '3_months': '3 شهور', offer: 'عرض من الشركة' };
    const OP_LABELS: Record<string, string> = { activation: 'تفعيل', renewal: 'تجديد', cancelled: 'ملغاة' };
    const FOLLOWUP_LABELS: Record<string, string> = { not_contacted: 'لم يتم', contacted: 'تم التواصل', reminder_scheduled: 'تذكير', collected: 'تم التحصيل' };
    const data = telecomSales.map((s) => ({
      'الشركة': s.companyName,
      'الشركة الفرعية': s.subAgentName,
      'رقم الهاتف': s.simNumber,
      'الحزمة': s.bundleName || '',
      'مدة الشحن': DURATION_LABELS[s.chargeDuration] || s.chargeDuration || '',
      'نوع العملية': OP_LABELS[s.operationType] || s.operationType || '',
      'اسم الزبون': s.customerName,
      'رقم الزبون': s.customerPhone,
      'سعر التكلفة': s.cost,
      'سعر البيع': s.salePrice,
      'سعر الشريحة': s.simPrice || 0,
      'حالة الدفع': PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod,
      'المبلغ المدفوع': s.paid,
      'المتبقي': s.remaining,
      'تاريخ الدفع': s.paymentDate ? new Date(s.paymentDate).toLocaleDateString('ar') : '',
      'المتابعة': FOLLOWUP_LABELS[s.followUpStatus] || s.followUpStatus || '',
      'المخصوم عند الإلغاء': s.cancellationDeduction || 0,
      'الرصيد السابق': s.customerBalanceBefore || 0,
      'الرصيد اللاحق': s.customerBalanceAfter || 0,
      'ملاحظات': s.notes || '',
      'التاريخ': new Date(s.createdAt).toLocaleString('ar'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 20 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المعاملات');
    await exportXlsx(wb, `معاملات_الاتصالات_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        const wb = XLSX.read(result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) {
          setImportResult({ added: 0, skipped: 0, errors: ['الملف فارغ أو لا يحتوي على بيانات'] });
          setImporting(false);
          return;
        }

        const normAr = (s: string): string =>
          s.replace(/ة/g, 'ه').replace(/أ|إ|آ/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim();

        // Find header row — scan first 5 rows for one containing known keywords
        let headerRowIndex = 0;
        for (let r = 0; r < Math.min(5, rows.length); r++) {
          const rowCells = (rows[r] ?? []).map((c) => normAr(String(c ?? '')));
          if (rowCells.some((h) => h.includes('الشريحه') || h.includes('الزبون') || h.includes('التواصل') || h.includes('المعامله') || h.includes('التجديد'))) {
            headerRowIndex = r;
            break;
          }
        }

        const headerRow = rows[headerRowIndex] as string[];
        const headers = headerRow.map((h) => normAr(String(h ?? '')));
        const usedCols = new Set<number>();
        const findCol = (keywords: string[]): number => {
          const normKeywords = keywords.map(normAr);
          for (let pass = 1; pass <= 3; pass++) {
            for (let i = 0; i < headers.length; i++) {
              if (usedCols.has(i)) continue;
              const h = headers[i];
              if (!h) continue;
              for (const k of normKeywords) {
                if (pass === 1 && h === k) { usedCols.add(i); return i; }
                if (pass === 2 && k.length >= 4 && h.includes(k)) { usedCols.add(i); return i; }
                if (pass === 3 && k.length >= 3 && h.includes(k)) { usedCols.add(i); return i; }
              }
            }
          }
          return -1;
        };

        const simNumIdx = findCol(['رقم الهاتف', 'رقم الشريحة', 'الشريحة', 'رقم الشريحه', 'الشريحه', 'sim']);
        const nameIdx = findCol(['اسم الزبون', 'اسم العميل', 'اسم', 'الزبون', 'الزبونه', 'اسم الزبونه']);
        const phoneIdx = findCol(['رقم التواصل', 'رقم الزبون', 'التواصل', 'الجوال', 'الهاتف', 'رقم']);
        const dateIdx = findCol(['تاريخ المعامله', 'تاريخ المعاملة', 'تاريخ التجديد', 'التجديد', 'التاريخ', 'تاريخ']);

        const errors: string[] = [];
        if (simNumIdx < 0) errors.push('لم يتم العثور على عمود "رقم الهاتف"');
        if (nameIdx < 0) errors.push('لم يتم العثور على عمود "اسم الزبون"');
        if (phoneIdx < 0) errors.push('لم يتم العثور على عمود "رقم التواصل"');
        if (errors.length > 0) {
          setImportResult({ added: 0, skipped: 0, errors });
          setImporting(false);
          return;
        }

        let added = 0;
        let skipped = 0;
        const existingPhones = new Set(customers.map((c) => normalizePhoneNumber(c.phone)));

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const simNum = String(row[simNumIdx] ?? '').trim();
          const name = String(row[nameIdx] ?? '').trim();
          const phone = String(row[phoneIdx] ?? '').trim();
          if (!simNum || !name || !phone) { skipped++; continue; }

          // Skip summary/total rows
          if (simNum === '0' && name === '0' && phone === '0') { skipped++; continue; }
          const lowerSim = simNum.toLowerCase();
          if (lowerSim.includes('اجمالي') || lowerSim.includes('مجموع') || lowerSim.includes('total')) { skipped++; continue; }

          let createdAt = Date.now();
          if (dateIdx >= 0) {
            const dateCell = row[dateIdx];
            if (dateCell instanceof Date) {
              createdAt = dateCell.getTime();
            } else if (typeof dateCell === 'number' && dateCell > 0) {
              const parsed = XLSX.SSF.parse_date_code(dateCell);
              if (parsed) createdAt = new Date(parsed.y, parsed.m - 1, parsed.d).getTime();
            } else {
              const dateStr = String(dateCell ?? '').trim();
              if (dateStr) {
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) createdAt = parsed.getTime();
              }
            }
          }

          const normalizedPhone = normalizePhoneNumber(phone);
          let customerId: string | null = null;
          if (!existingPhones.has(normalizedPhone)) {
            const newCustomer = addCustomer({
              name, phone: normalizedPhone, tier: 'regular', creditLimit: 1000, discountPercent: 0,
              notes: '', subscriptionNumber: '', subscriptionExpiry: null,
            });
            customerId = newCustomer.id;
            existingPhones.add(normalizedPhone);
          } else {
            const existingCustomer = customers.find((c) => c.phone === normalizedPhone);
            customerId = existingCustomer?.id ?? null;
          }

          addTelecomSale({
            mode: 'sell_sim',
            operationType: 'activation',
            companyId: '',
            companyName: '',
            subAgentId: '',
            subAgentName: '',
            simType: null,
            simId: null,
            simName: '',
            simPrice: 0,
            bundleId: null,
            bundleName: '',
            chargeDuration: 'month',
            simNumber: simNum,
            serialNumber: '',
            barcode: '',
            customerName: name,
            customerPhone: normalizedPhone,
            customerId,
            cost: 0,
            salePrice: 0,
            total: 0,
            paid: 0,
            remaining: 0,
            paymentMethod: 'cash',
            paymentStatus: 'paid_full',
            paymentDate: null,
            walletType: null,
            reminderDate: null,
            debtChange: 0,
            followUpStatus: 'not_contacted',
            cancellationDeduction: 0,
            cancelledAt: null,
            customerBalanceBefore: 0,
            customerBalanceAfter: 0,
            smsSent: false,
            reminderSet: false,
            reminderId: null,
            shiftId: null,
            staffId: currentStaff?.id ?? null,
            staffName: currentStaff?.name ?? '',
            notes: '',
            autoRenew: false,
            renewedFromId: null,
            carryoverDays: 0,
            escalationState: null,
          }, createdAt);
          added++;
        }
        setImportResult({ added, skipped, errors });
      } catch {
        setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح'] });
      }
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
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rows.length < 2) {
        setImportResult({ added: 0, skipped: 0, errors: ['الملف فارغ أو لا يحتوي على بيانات'] });
        setImporting(false);
        return;
      }

      const normAr = (s: string): string =>
        s.replace(/ة/g, 'ه').replace(/أ|إ|آ/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').trim();

      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        const rowCells = (rows[r] ?? []).map((c) => normAr(String(c ?? '')));
        if (rowCells.some((h) => h.includes('الشريحه') || h.includes('الزبون') || h.includes('التواصل') || h.includes('المعامله') || h.includes('التجديد'))) {
          headerRowIndex = r;
          break;
        }
      }

      const headerRow = rows[headerRowIndex] as string[];
      const headers = headerRow.map((h) => normAr(String(h ?? '')));
      const usedCols = new Set<number>();
      const findCol = (keywords: string[]): number => {
        const normKeywords = keywords.map(normAr);
        for (let pass = 1; pass <= 3; pass++) {
          for (let i = 0; i < headers.length; i++) {
            if (usedCols.has(i)) continue;
            const h = headers[i];
            if (!h) continue;
            for (const k of normKeywords) {
              if (pass === 1 && h === k) { usedCols.add(i); return i; }
              if (pass === 2 && k.length >= 4 && h.includes(k)) { usedCols.add(i); return i; }
              if (pass === 3 && k.length >= 3 && h.includes(k)) { usedCols.add(i); return i; }
            }
          }
        }
        return -1;
      };

      const simNumIdx = findCol(['رقم الهاتف', 'رقم الشريحة', 'الشريحة', 'رقم الشريحه', 'الشريحه', 'sim']);
      const nameIdx = findCol(['اسم الزبون', 'اسم العميل', 'اسم', 'الزبون', 'الزبونه', 'اسم الزبونه']);
      const phoneIdx = findCol(['رقم التواصل', 'رقم الزبون', 'التواصل', 'الجوال', 'الهاتف', 'رقم']);
      const dateIdx = findCol(['تاريخ المعامله', 'تاريخ المعاملة', 'تاريخ التجديد', 'التجديد', 'التاريخ', 'تاريخ']);

      const errors: string[] = [];
      if (simNumIdx < 0) errors.push('لم يتم العثور على عمود "رقم الهاتف"');
      if (nameIdx < 0) errors.push('لم يتم العثور على عمود "اسم الزبون"');
      if (phoneIdx < 0) errors.push('لم يتم العثور على عمود "رقم التواصل"');
      if (errors.length > 0) {
        setImportResult({ added: 0, skipped: 0, errors });
        setImporting(false);
        return;
      }

      let added = 0;
      let skipped = 0;
      const existingPhones = new Set(customers.map((c) => normalizePhoneNumber(c.phone)));

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const simNum = String(row[simNumIdx] ?? '').trim();
        const name = String(row[nameIdx] ?? '').trim();
        const phone = String(row[phoneIdx] ?? '').trim();
        if (!simNum || !name || !phone) { skipped++; continue; }
        if (simNum === '0' && name === '0' && phone === '0') { skipped++; continue; }
        const lowerSim = simNum.toLowerCase();
        if (lowerSim.includes('اجمالي') || lowerSim.includes('مجموع') || lowerSim.includes('total')) { skipped++; continue; }

        let createdAt = Date.now();
        if (dateIdx >= 0) {
          const dateCell = row[dateIdx];
          if (dateCell instanceof Date) {
            createdAt = dateCell.getTime();
          } else if (typeof dateCell === 'number' && dateCell > 0) {
            const parsed = XLSX.SSF.parse_date_code(dateCell);
            if (parsed) createdAt = new Date(parsed.y, parsed.m - 1, parsed.d).getTime();
          } else {
            const dateStr = String(dateCell ?? '').trim();
            if (dateStr) {
              const parsed = new Date(dateStr);
              if (!isNaN(parsed.getTime())) createdAt = parsed.getTime();
            }
          }
        }

        const normalizedPhone = normalizePhoneNumber(phone);
        let customerId: string | null = null;
        if (!existingPhones.has(normalizedPhone)) {
          const newCustomer = addCustomer({
            name, phone: normalizedPhone, tier: 'regular', creditLimit: 1000, discountPercent: 0,
            notes: '', subscriptionNumber: '', subscriptionExpiry: null,
          });
          customerId = newCustomer.id;
          existingPhones.add(normalizedPhone);
        } else {
          const existingCustomer = customers.find((c) => c.phone === normalizedPhone);
          customerId = existingCustomer?.id ?? null;
        }

        addTelecomSale({
          mode: 'sell_sim',
          operationType: 'activation',
          companyId: '',
          companyName: '',
          subAgentId: '',
          subAgentName: '',
          simType: null,
          simId: null,
          simName: '',
          simPrice: 0,
          bundleId: null,
          bundleName: '',
          chargeDuration: 'month',
          simNumber: simNum,
          serialNumber: '',
          barcode: '',
          customerName: name,
          customerPhone: normalizedPhone,
          customerId,
          cost: 0,
          salePrice: 0,
          total: 0,
          paid: 0,
          remaining: 0,
          paymentMethod: 'cash',
          paymentStatus: 'paid_full',
          paymentDate: null,
          walletType: null,
          reminderDate: null,
          debtChange: 0,
          followUpStatus: 'not_contacted',
          cancellationDeduction: 0,
          cancelledAt: null,
          customerBalanceBefore: 0,
          customerBalanceAfter: 0,
          smsSent: false,
          reminderSet: false,
          reminderId: null,
          shiftId: null,
          staffId: currentStaff?.id ?? null,
          staffName: currentStaff?.name ?? '',
          notes: '',
          autoRenew: false,
          renewedFromId: null,
          carryoverDays: 0,
          escalationState: null,
        }, createdAt);
        added++;
      }
      setImportResult({ added, skipped, errors });
    } catch {
      setImportResult({ added: 0, skipped: 0, errors: ['تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح'] });
    }
    setImporting(false);
  };

  const preprocessImage = (file: File, mode: 'threshold' | 'grayscale' | 'sharpen' = 'threshold'): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        // Upscale small images for better OCR — minimum 1500px on longest side
        const minDim = 1500;
        const longest = Math.max(img.width, img.height);
        const upscale = longest < minDim ? minDim / longest : 1;
        const maxDim = 4000;
        const cap = Math.min(upscale, maxDim / longest, 4);
        const w = Math.round(img.width * cap);
        const h = Math.round(img.height * cap);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const grayArr = new Uint8ClampedArray(w * h);
        const hist = new Array(256).fill(0);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          grayArr[j] = gray;
          hist[gray]++;
        }

        if (mode === 'grayscale') {
          // Grayscale + contrast stretch
          let minG = 255, maxG = 0;
          for (let g = 0; g < 256; g++) { if (hist[g] > 0) { if (g < minG) minG = g; if (g > maxG) maxG = g; } }
          const range = Math.max(1, maxG - minG);
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const stretched = Math.round(((grayArr[j] - minG) / range) * 255);
            data[i] = stretched; data[i + 1] = stretched; data[i + 2] = stretched;
          }
        } else if (mode === 'sharpen') {
          // Grayscale + unsharp mask to enhance digit edges
          const blurred = new Uint8ClampedArray(w * h);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let sum = 0, count = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx = x + dx, ny = y + dy;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    sum += grayArr[ny * w + nx];
                    count++;
                  }
                }
              }
              blurred[y * w + x] = Math.round(sum / count);
            }
          }
          const amount = 1.5;
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const sharpened = Math.max(0, Math.min(255, Math.round(grayArr[j] + amount * (grayArr[j] - blurred[j]))));
            data[i] = sharpened; data[i + 1] = sharpened; data[i + 2] = sharpened;
          }
        } else {
          // Otsu threshold
          const total = w * h;
          let sum = 0;
          for (let t = 0; t < 256; t++) sum += t * hist[t];
          let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
          for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const betweenVar = wB * wF * (mB - mF) * (mB - mF);
            if (betweenVar > maxVar) { maxVar = betweenVar; threshold = t; }
          }
          const thr = Math.max(50, Math.min(200, threshold));
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const val = grayArr[j] < thr ? 0 : 255;
            data[i] = val; data[i + 1] = val; data[i + 2] = val;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
      img.src = url;
    });
  };

  // Fix OCR digit confusions only within sequences that are mostly digits
  const fixOcrDigits = (token: string): string => {
    const digitRatio = (token.replace(/[^0-9]/g, '').length / Math.max(1, token.length));
    if (digitRatio < 0.5) return token; // mostly letters — leave as-is
    return token
      .replace(/O/g, '0').replace(/o/g, '0')
      .replace(/S/g, '5').replace(/s/g, '5')
      .replace(/Z/g, '2').replace(/z/g, '2')
      .replace(/B/g, '8')
      .replace(/I/g, '1').replace(/l/g, '1').replace(/\|/g, '1')
      .replace(/g/g, '9')
      .replace(/D/g, '0')
      .replace(/[^0-9]/g, ''); // strip any remaining non-digits
  };

  const extractNumberFields = (input: string): { sim: string; serial: string } => {
    const normalized = input
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
    // Split into lines to preserve number grouping
    const lines = normalized.split(/\n+/);
    // Join digits separated by spaces within the same line — apply repeatedly to catch 3+ fragments
    const joinedLines = lines.map((line) => {
      let prev: string;
      let curr = line;
      do {
        prev = curr;
        curr = curr.replace(/(\d)\s+(\d)/g, '$1$2');
      } while (curr !== prev);
      return curr;
    });
    const joinedText = joinedLines.join('\n');

    // Labelled fields — phone number (10 digits, may start with 0) and SIM card number (ICCID, 15-22 digits)
    const phoneMatches = joinedText.match(/(?:رقم\s*الهاتف|الهاتف|phone|mobile|tel|الرقم)\s*[:：\-]?\s*(0?\d{9,10})/i) ?? [];
    const simMatches = joinedText.match(/(?:رقم\s*الشريحة|الشريحة|sim|iccid|card|الشريحه)\s*[:：\-]?\s*([0-9OOSsSZzBIlgD|]{10,22})/i) ?? [];
    const serialMatches = joinedText.match(/(?:رقم\s*الشريحة|الشريحة|السيريال|الرقم\s*التسلسلي|serial|s\/n|sn|s\.n|iccid)\s*[:：\-]?\s*([A-Za-z0-9]{6,24})/i) ?? [];
    const phone = phoneMatches[1] ?? '';
    const labelledSimRaw = simMatches[1] ?? '';
    const labelledSim = labelledSimRaw ? fixOcrDigits(labelledSimRaw) : '';
    const labelledSerial = serialMatches[1] ?? '';

    // Collect digit runs from each line separately, applying OCR fixes
    const allTokens: string[] = [];
    for (const line of joinedLines) {
      const tokens = line.match(/[0-9OOSsSZzBIlgD|]{6,24}/g) ?? [];
      for (const token of tokens) {
        const fixed = fixOcrDigits(token);
        if (fixed.length >= 6 && fixed !== phone) allTokens.push(fixed);
      }
    }
    // Deduplicate while preserving order
    const seen = new Set<string>();
    const digitRuns = allTokens.filter((v) => {
      if (seen.has(v)) return false;
      seen.add(v); return true;
    });

    // SIM (phone number): prefer 10-digit number not starting with 0
    const tenDigitNumbers = digitRuns.filter((v) => v.length === 10 && !v.startsWith('0'));
    const anyTenDigit = digitRuns.find((v) => v.length === 10 && !v.startsWith('0'));
    const sim = labelledSim.length === 10 && !labelledSim.startsWith('0')
      ? labelledSim
      : (anyTenDigit ?? tenDigitNumbers[0] ?? '');
    // Serial (SIM card number / ICCID): labelled, or longest number >= 11 digits that isn't the sim
    const longRuns = digitRuns.filter((v) => v.length >= 11 && v !== sim).sort((a, b) => b.length - a.length);
    const serial = labelledSerial || (longRuns[0] ?? '');
    return { sim, serial };
  };

  const decodeQrImage = async (imageUrl: string): Promise<string> => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    const detectorConstructor = (window as unknown as {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect(source: HTMLImageElement): Promise<{ rawValue?: string }[]>;
      };
    }).BarcodeDetector;
    if (!detectorConstructor) return '';
    const image = new Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image-load'));
    });
    const formatSets = [
      ['qr_code', 'code_128', 'code_39', 'ean_13'],
      ['qr_code'],
    ];
    for (const formats of formatSets) {
      try {
        const detector = new detectorConstructor({ formats });
        const results = await detector.detect(image);
        if (results[0]?.rawValue) return results[0].rawValue;
      } catch {
        // try next format set
      }
    }
    return '';
  };

  const runOcrOnImage = async (dataUrl: string): Promise<{ sim: string; serial: string }> => {
    // Single worker, two recognize passes — avoids expensive worker re-creation
    let digitsText = '';
    let fullText = '';
    try {
      const worker = await createWorker('eng');
      // Pass 1: digits-only whitelist — much more accurate for 10-digit SIM numbers
      await worker.setParameters({
        tessedit_pageseg_mode: 6 as unknown as never,
        tessedit_char_whitelist: '0123456789 \n',
      });
      const resultDigits = await worker.recognize(dataUrl);
      digitsText = resultDigits.data.text || '';

      // Pass 2: full charset for serial numbers that may contain letters
      await worker.setParameters({
        tessedit_pageseg_mode: 6 as unknown as never,
        tessedit_char_whitelist: '',
      });
      const resultFull = await worker.recognize(dataUrl);
      fullText = resultFull.data.text || '';

      await worker.terminate();
    } catch { /* ignore */ }

    const combined = digitsText + '\n' + fullText;
    const fields = extractNumberFields(combined);
    if (digitsText) {
      const digitsFields = extractNumberFields(digitsText);
      if (digitsFields.sim && !fields.sim) fields.sim = digitsFields.sim;
      if (digitsFields.serial && !fields.serial) fields.serial = digitsFields.serial;
    }
    return fields;
  };

  const handleBarcodePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    await handleBarcodeImageUpload(file);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  };

  const runAiOcr = async (file: File): Promise<{ sim: string; serial: string }> => {
    const dataUrl = await fileToDataUrl(file);
    const { data, error } = await supabase.functions.invoke('ai-ocr', {
      body: { image: dataUrl },
    });
    if (error) throw error;
    if (!data) return { sim: '', serial: '' };
    if (data.type === 'sim_card' || (data.phone !== undefined || data.sim !== undefined)) {
      const phone = typeof data.phone === 'string' ? data.phone.replace(/\D/g, '').slice(0, 10) : '';
      const simCard = typeof data.sim === 'string' ? data.sim.trim() : '';
      return { sim: phone, serial: simCard };
    }
    return { sim: '', serial: '' };
  };

  const handleBarcodeImageUpload = async (file: File) => {
    setOcrLoading(true);
    setOcrError('');
    try {
      const originalUrl = URL.createObjectURL(file);
      let sim = '';
      let serial = '';

      // Strategy 1: AI vision (most accurate — understands images like a human)
      try {
        const aiResult = await runAiOcr(file);
        if (aiResult.sim) sim = aiResult.sim;
        if (aiResult.serial) serial = aiResult.serial;
      } catch {
        // AI service unavailable — fall through to local OCR
      }

      // Strategy 2: Decode QR/barcode payload
      if (!sim || !serial) {
        const qrText = await decodeQrImage(originalUrl);
        const qrFields = extractNumberFields(qrText);
        if (qrFields.sim && !sim) sim = qrFields.sim;
        if (qrFields.serial && !serial) serial = qrFields.serial;
      }

      // Strategy 3: Local OCR on sharpened image
      if (!sim || !serial) {
        const upscaledUrl = await preprocessImage(file, 'sharpen');
        const rawFields = await runOcrOnImage(upscaledUrl);
        if (rawFields.sim && !sim) sim = rawFields.sim;
        if (rawFields.serial && !serial) serial = rawFields.serial;
      }

      // Strategy 4: Local OCR on grayscale+contrast
      if (!sim || !serial) {
        const grayscaleUrl = await preprocessImage(file, 'grayscale');
        const grayscaleFields = await runOcrOnImage(grayscaleUrl);
        if (grayscaleFields.sim && !sim) sim = grayscaleFields.sim;
        if (grayscaleFields.serial && !serial) serial = grayscaleFields.serial;
      }

      // Strategy 5: Local OCR on thresholded binary
      if (!sim || !serial) {
        const thresholdUrl = await preprocessImage(file, 'threshold');
        const thresholdFields = await runOcrOnImage(thresholdUrl);
        if (thresholdFields.sim && !sim) sim = thresholdFields.sim;
        if (thresholdFields.serial && !serial) serial = thresholdFields.serial;
      }

      if (sim) setSimNumber(sim);
      if (serial) setSerialNumber(serial);
      if (!sim && !serial) {
        const reader = new FileReader();
        reader.onload = () => {
          setCropImageUrl(reader.result as string);
          setShowManualCrop(true);
          setOcrError('لم يتم التعرف على الأرقام تلقائياً. يمكنك تعليم منطقة الأرقام يدوياً.');
        };
        reader.readAsDataURL(file);
      } else if (!sim || !serial) {
        setOcrError(
          !sim
            ? 'تم التعرف على رقم الشريحة لكن لم يُتعرف على رقم الهاتف. حاول قص منطقة الرقم يدوياً.'
            : 'تم التعرف على رقم الهاتف لكن لم يُتعرف على رقم الشريحة.'
        );
      }
      URL.revokeObjectURL(originalUrl);
    } catch {
      setOcrError('حدث خطأ أثناء معالجة الصورة. حاول مرة أخرى.');
    }
    setOcrLoading(false);
  };

  const handleCropMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    cropStartRef.current = { x, y };
    setCropRect({ x, y, w: 0, h: 0 });
  };

  const handleCropMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropStartRef.current) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const start = cropStartRef.current;
    setCropRect({ x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) });
  };

  const handleCropMouseUp = () => {
    cropStartRef.current = null;
  };

  const drawCropCanvas = useCallback(() => {
    const canvas = cropCanvasRef.current;
    const img = cropImgRef.current;
    if (!canvas || !img || !cropImageUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const maxW = 900;
    const maxH = 600;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (cropRect && cropRect.w > 5 && cropRect.h > 5) {
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
    }
  }, [cropImageUrl, cropRect]);

  useEffect(() => {
    if (showManualCrop && cropImageUrl) {
      const img = new Image();
      img.onload = () => {
        cropImgRef.current = img;
        setCropRect(null);
        setTimeout(() => drawCropCanvas(), 50);
      };
      img.src = cropImageUrl;
    }
  }, [showManualCrop, cropImageUrl, drawCropCanvas]);

  useEffect(() => {
    if (showManualCrop) drawCropCanvas();
  }, [showManualCrop, cropRect, drawCropCanvas]);

  const handleCropConfirm = async () => {
    if (!cropRect || cropRect.w < 10 || cropRect.h < 10) return;
    setCropProcessing(true);
    try {
      const canvas = cropCanvasRef.current;
      const img = cropImgRef.current;
      if (!canvas || !img) return;
      const scaleX = img.width / canvas.width;
      const scaleY = img.height / canvas.height;
      const srcX = cropRect.x * scaleX;
      const srcY = cropRect.y * scaleY;
      const srcW = cropRect.w * scaleX;
      const srcH = cropRect.h * scaleY;
      const upScale = 3;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.round(srcW * upScale);
      cropCanvas.height = Math.round(srcH * upScale);
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return;
      cropCtx.imageSmoothingEnabled = true;
      cropCtx.imageSmoothingQuality = 'high';
      cropCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, cropCanvas.width, cropCanvas.height);
      const croppedUrl = cropCanvas.toDataURL('image/png');

      // Try OCR on the raw cropped image first
      let { sim, serial } = await runOcrOnImage(croppedUrl);

      // If that fails, try threshold + grayscale on the cropped canvas
      if (!sim || !serial) {
        const imageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
        const data = imageData.data;
        const grayArr = new Uint8ClampedArray(cropCanvas.width * cropCanvas.height);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          grayArr[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        // Otsu threshold
        const hist = new Array(256).fill(0);
        for (let g = 0; g < 256; g++) hist[grayArr[g]]++;
        const totalPx = cropCanvas.width * cropCanvas.height;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
        for (let t = 0; t < 256; t++) {
          wB += hist[t];
          if (wB === 0) continue;
          const wF = totalPx - wB;
          if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const betweenVar = wB * wF * (mB - mF) * (mB - mF);
          if (betweenVar > maxVar) { maxVar = betweenVar; threshold = t; }
        }
        const thr = Math.max(50, Math.min(200, threshold));
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          const val = grayArr[j] < thr ? 0 : 255;
          data[i] = val; data[i + 1] = val; data[i + 2] = val;
        }
        cropCtx.putImageData(imageData, 0, 0);
        const thresholdedUrl = cropCanvas.toDataURL('image/png');
        const thresholdedFields = await runOcrOnImage(thresholdedUrl);
        if (thresholdedFields.sim && !sim) sim = thresholdedFields.sim;
        if (thresholdedFields.serial && !serial) serial = thresholdedFields.serial;
      }

      if (sim) { setSimNumber(sim); setManualSimInput(sim); }
      if (serial) setSerialNumber(serial);
      if (!sim && manualSimInput.trim().length === 10) {
        setSimNumber(manualSimInput.trim());
      }
      setShowManualCrop(false);
      setCropImageUrl('');
    } catch {
      setOcrError('فشل معالجة المنطقة المحددة. أدخل الرقم يدوياً أدناه.');
    }
    setCropProcessing(false);
  };

  const handleCropCancel = () => {
    if (manualSimInput.trim().length === 10) {
      setSimNumber(manualSimInput.trim());
    }
    setShowManualCrop(false);
    setCropImageUrl('');
    setCropRect(null);
  };

  const handleSelectSubAgent = (agent: SubAgent) => {
    setSelectedSubAgent(agent);
    setSelectedCompany(null);
    setSelectedSim(null);
    setSelectedBundle(null);
    setSimOption('none');
    setChargeDuration('month');
    setOfferPrice('');
  };

  const handleSelectCompany = (company: TelecomCompany) => {
    setSelectedCompany(company);
    setSelectedSim(null);
    setSelectedBundle(null);
    setSimOption('none');
    setChargeDuration('month');
    setOfferPrice('');
  };

  const handleSelectSim = (sim: SimCard) => {
    setSelectedSim(sim);
    setShowSimPicker(false);
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setShowCustomerPicker(false);
    setCustomerSearch('');
  };

  const handleImportContact = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('تنبيه', 'استيراد جهات الاتصال متاح فقط على الجوال');
      return;
    }
    try {
      const supported = await Linking.canOpenURL('tel:');
      if (!supported) {
        Alert.alert('تنبيه', 'لا يمكن الوصول إلى جهات الاتصال على هذا الجهاز');
        return;
      }
      await Linking.openURL('content://contacts/people');
      Alert.alert('تنبيه', 'اختر جهة الاتصال ثم أدخل بياناتها يدوياً');
    } catch {
      Alert.alert('تنبيه', 'تعذر فتح جهات الاتصال. أدخل الاسم والرقم يدوياً');
    }
  };

  const canSubmit = useMemo(() => {
    if (!selectedSubAgent) return false;
    if (!selectedCompany) return false;
    if (!selectedBundle) return false;
    if (simOption === 'plastic' && !selectedSim) return false;
    if (simNumber.trim().length !== 10) return false;
    if (!customerName.trim()) return false;
    if (!customerPhone.trim()) return false;
    if (total <= 0) return false;
    if (readOnlyMode && !editingSaleId) return false;
    return true;
  }, [selectedSubAgent, selectedCompany, selectedBundle, simOption, selectedSim, simNumber, customerName, customerPhone, total, readOnlyMode, editingSaleId]);

  const TOTAL_STEPS = 4;
  const stepLabels = ['الشركة والحزمة', 'الشريحة والزبون', 'الدفع', 'مراجعة وحفظ'];

  const step1Valid = !!(selectedSubAgent && selectedCompany && selectedBundle);
  const step2Valid = !!(simNumber.trim().length === 10 && customerName.trim() && customerPhone.trim() && (simOption !== 'plastic' || selectedSim));
  const step3Valid = total > 0 && (!readOnlyMode || editingSaleId);

  const canGoNext = formStep === 0 ? step1Valid : formStep === 1 ? step2Valid : formStep === 2 ? step3Valid : canSubmit;

  const resetForm = () => {
    setSaleOperationType('activation');
    setSaleMode('sell_sim');
    setShowForm(false);
    setFormStep(0);
    setSelectedSubAgent(null);
    setSelectedCompany(null);
    setSelectedSim(null);
    setSelectedBundle(null);
    setSimOption('none');
    setSimNumber('');
    setSerialNumber('');
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomer(null);
    setPaidAmount('');
    setPaymentMethod('cash');
    setPaymentStatus('paid_full');
    setSelectedWalletType('palpay');
    setReminderDate('');
    setReminderEnabled(false);
    setNotes('');
    setEditingSaleId(null);
    setSimSearchQuery('');
    setChargeDuration('month');
    setOfferPrice('');
    setSalePriceOverride('');
  };

  const handleCheckout = useCallback(() => {
    if (!canSubmit || !selectedCompany || !selectedSubAgent) return;

    const normalizedPhone = normalizePhoneNumber(customerPhone.trim());
    let customerId = selectedCustomer?.id ?? null;

    // On edit, the user may have changed the name/phone to a different person.
    // If the entered name/phone no longer matches the selected customer, find or create the correct one.
    if (customerName.trim() && normalizedPhone) {
      const selectedName = selectedCustomer?.name.trim().toLowerCase();
      const selectedPhone = selectedCustomer ? normalizePhoneNumber(selectedCustomer.phone) : '';
      const nameChanged = selectedName !== customerName.trim().toLowerCase();
      const phoneChanged = selectedPhone !== normalizedPhone;
      if (!customerId || nameChanged || phoneChanged) {
        const existing = customers.find((c) =>
          c.name.trim().toLowerCase() === customerName.trim().toLowerCase() &&
          normalizePhoneNumber(c.phone) === normalizedPhone
        );
        if (existing) {
          customerId = existing.id;
        } else {
          const newCustomer = addCustomer({
            name: customerName.trim(),
            phone: normalizedPhone,
            tier: 'regular',
            creditLimit: 1000,
            discountPercent: 0,
            notes: '',
            subscriptionNumber: '',
            subscriptionExpiry: null,
          });
          customerId = newCustomer.id;
        }
      }
    }

    const effectivePaid = paymentMethod === 'balance' && selectedCustomer
      ? Math.min(total, selectedCustomer.balance)
      : paid;
    const effectiveRemaining = paymentMethod === 'balance' && selectedCustomer
      ? Math.max(0, total - effectivePaid)
      : remaining;
    const debtChange = effectiveRemaining > 0 && customerId ? effectiveRemaining : 0;

    const saleSimType: SimType | null = simOption === 'plastic' ? 'plastic' : simOption === 'barcode' ? 'electronic' : null;

    if (editingSaleId) {
      const balanceBefore = customerId ? (customers.find((c) => c.id === customerId)?.debt ?? 0) : 0;
      updateTelecomSale(editingSaleId, {
        mode: 'sell_sim',
        operationType: saleOperationType,
        companyId: selectedCompany.id,
        companyName: selectedCompany.name,
        subAgentId: selectedSubAgent.id,
        subAgentName: selectedSubAgent.name,
        simType: saleSimType,
        simId: selectedSim?.id ?? null,
        simName: selectedSim?.name ?? '',
        simPrice: simSurcharge,
        bundleId: selectedBundle?.id ?? null,
        bundleName: selectedBundle?.bundleName ?? '',
        chargeDuration,
        simNumber: simNumber.trim(),
        serialNumber: serialNumber.trim(),
        barcode: '',
        customerName: customerName.trim(),
        customerPhone: normalizePhoneNumber(customerPhone.trim()),
        customerId,
        cost: totalCost,
        salePrice: total,
        total,
        paid: effectivePaid,
        remaining: effectiveRemaining,
        paymentMethod,
        paymentStatus: effectiveRemaining > 0 ? (effectivePaid > 0 ? 'paid_partial' : 'unpaid') : 'paid_full',
        paymentDate: effectivePaid > 0 ? Date.now() : null,
        walletType: paymentMethod === 'wallet' ? selectedWalletType : null,
        reminderDate: reminderDate ? new Date(reminderDate).getTime() : null,
        debtChange,
        carryoverDays: 0,
        customerBalanceBefore: balanceBefore,
        customerBalanceAfter: balanceBefore + debtChange,
        notes: notes.trim(),
      });
      setEditingSaleId(null);
      resetForm();
      return;
    }

    const customerBalanceBefore = customerId ? (customers.find((c) => c.id === customerId)?.debt ?? 0) : 0;

    const sale = addTelecomSale({
      mode: 'sell_sim',
      operationType: saleOperationType,
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      subAgentId: selectedSubAgent.id,
      subAgentName: selectedSubAgent.name,
      simType: saleSimType,
      simId: selectedSim?.id ?? null,
      simName: selectedSim?.name ?? '',
      simPrice: simSurcharge,
      bundleId: selectedBundle?.id ?? null,
      bundleName: selectedBundle?.bundleName ?? '',
      chargeDuration,
      simNumber: simNumber.trim(),
      serialNumber: serialNumber.trim(),
      barcode: '',
      customerName: customerName.trim(),
      customerPhone: normalizePhoneNumber(customerPhone.trim()),
      customerId,
      cost: totalCost,
      salePrice: total,
      total,
      paid: effectivePaid,
      remaining: effectiveRemaining,
      paymentMethod,
      paymentStatus: effectiveRemaining > 0 ? (effectivePaid > 0 ? 'paid_partial' : 'unpaid') : 'paid_full',
      paymentDate: effectivePaid > 0 ? Date.now() : null,
      walletType: paymentMethod === 'wallet' ? selectedWalletType : null,
      reminderDate: reminderDate ? new Date(reminderDate).getTime() : null,
      debtChange,
      followUpStatus: remaining > 0 ? 'not_contacted' : 'collected',
      cancellationDeduction: 0,
      cancelledAt: null,
      customerBalanceBefore,
      customerBalanceAfter: customerBalanceBefore + debtChange,
      smsSent: settings.enableSms && !!customerId,
      reminderSet: false,
      reminderId: null,
      shiftId: activeShift?.id ?? null,
      staffId: currentStaff?.id ?? null,
      staffName: currentStaff?.name ?? '',
      notes: notes.trim(),
      autoRenew: false,
      renewedFromId: renewingFromSale?.id ?? null,
      carryoverDays: renewingFromSale ? Math.max(0, getRemainingChargeDays(renewingFromSale) ?? 0) : 0,
        escalationState: null,
    });

    if (settings.enableSms && customerId && customerPhone.trim()) {
      const smsName = customerName.trim();
      const smsPhone = customerPhone.trim();
      const chargedPhone = simNumber.trim();
      const smsCur = settings.currency;
      let smsBody: string;
      if (effectiveRemaining <= 0) {
        smsBody = `عزيزي ${smsName}، رقمك: ${chargedPhone}\nالمبلغ: ${formatCurrency(total, smsCur)}\nالمدفوع: ${formatCurrency(effectivePaid, smsCur)}\nالمتبقي: 0`;
      } else if (effectivePaid > 0) {
        smsBody = `عزيزي ${smsName}، رقمك: ${chargedPhone}\nالمبلغ: ${formatCurrency(total, smsCur)}\nالمدفوع: ${formatCurrency(effectivePaid, smsCur)}\nالمتبقي: ${formatCurrency(effectiveRemaining, smsCur)}`;
      } else {
        smsBody = `عزيزي ${smsName}، رقمك: ${chargedPhone}\nتكلفة المعاملة: ${formatCurrency(total, smsCur)}\nإجمالي الدين: ${formatCurrency(customerBalanceBefore + debtChange, smsCur)}`;
      }
      void logOutboundSms(smsPhone, smsBody, 'sms');
      updateTelecomSale(sale.id, { smsSent: true });
    }

    if (paymentMethod === 'balance' && customerId) {
      const cust = customers.find((c) => c.id === customerId);
      if (cust) {
        updateCustomer(customerId, { balance: Math.max(0, cust.balance - effectivePaid), updatedAt: Date.now() });
      }
    }

    if (paymentMethod === 'wallet' && effectivePaid > 0) {
      addWalletTransaction({
        walletType: selectedWalletType,
        type: 'sale',
        amount: effectivePaid,
        category: 'مبيعات اتصالات',
        description: `${selectedCompany.name} - ${customerName.trim() || 'عميل'} - ${simNumber.trim()}`,
        relatedTxnId: sale.id,
        shiftId: activeShift?.id ?? null,
      });
    }

    // Check if this customer's phone belongs to a dealer's customer and notify dealer with commission
    if (customerPhone.trim() && Platform.OS === 'web') {
      try {
        const dealerApiUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/dealer-portal/commission`;
        void fetch(dealerApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_phone: customerPhone.trim(),
            amount_paid: effectivePaid,
            dealer_cost: totalCost,
          }),
        }).catch(() => {});
      } catch {}
    }

    let createdReminder = false;
    if (reminderEnabled && debtChange > 0 && customerId && reminderDate) {
      const reminder = addDebtReminder({
        customerId,
        customerName: customerName.trim(),
        customerPhone: normalizePhoneNumber(customerPhone.trim()),
        frequency: reminderFreq,
        customDays: parseInt(reminderCustomDays) || 3,
        time: reminderTime,
        message: `عزيزي ${customerName.trim()}، يبلغ دينك المتبقي ${formatCurrency(debtChange, settings.currency)}. يرجى السداد في أقرب وقت. شكراً لك`,
        active: true,
      });
      updateTelecomSale(sale.id, { reminderSet: true, reminderId: reminder.id });
      createdReminder = true;
    }

    if (reminderEnabled && reminderDate && reminderFreq === 'daily_until_paid' && debtChange > 0) {
      const escState = createEscalationState(sale);
      updateTelecomSale(sale.id, { escalationState: escState });
    }

    setLastSale({ ...sale, reminderSet: createdReminder });
    setShowSuccess(true);
    resetForm();
    setRenewingFromSale(null);
    setReminderFreq('daily');
    setReminderTime('10:00');
    setReminderCustomDays('3');
  }, [canSubmit, selectedCompany, selectedSubAgent, selectedCustomer, customerName, customerPhone, selectedSim, selectedBundle, simOption, simNumber, serialNumber, totalCost, total, paid, remaining, paymentMethod, paymentStatus, reminderDate, notes, editingSaleId, settings, activeShift, currentStaff, reminderFreq, reminderTime, reminderCustomDays, chargeDuration, offerPriceVal, simSurcharge, renewingFromSale, saleOperationType, addCustomer, addTelecomSale, updateTelecomSale, addDebtReminder, customers, updateCustomer]);

  const handleRenew = (sale: TelecomSale) => {
    const company = telecomCompanies.find((c) => c.id === sale.companyId);
    const subAgent = subAgents.find((a) => a.id === sale.subAgentId);
    const bundle = agentBundles.find((b) => b.id === sale.bundleId);
    const customer = customers.find((c) => c.id === sale.customerId);

    setSaleMode('sell_sim');
    setShowForm(true);
    setFormStep(0);
    if (company) setSelectedCompany(company);
    if (subAgent) setSelectedSubAgent(subAgent);
    if (bundle) setSelectedBundle(bundle);
    if (customer) { setSelectedCustomer(customer); setCustomerName(customer.name); setCustomerPhone(customer.phone); }
    else { setCustomerName(sale.customerName); setCustomerPhone(sale.customerPhone); }
    setSimNumber(sale.simNumber);
    setSerialNumber(sale.serialNumber || '');
    setPaymentMethod('cash');
    setPaymentStatus('paid_full');
    setSelectedWalletType('palpay');
    setPaidAmount('');
    setReminderDate('');
    setNotes('');
    setEditingSaleId(null);
    setSimOption(sale.simType === 'plastic' ? 'plastic' : sale.simType === 'electronic' ? 'barcode' : 'none');
    setRenewingFromSale(sale);
    setSaleOperationType('renewal');
    // Carry over charge duration and sale price from original sale
    if (sale.chargeDuration) setChargeDuration(sale.chargeDuration);
    if (sale.salePrice) setSalePriceOverride(sale.salePrice.toString());
  };

  const handleToggleAutoRenew = (sale: TelecomSale) => {
    updateTelecomSale(sale.id, { autoRenew: !sale.autoRenew });
  };

  const handleEdit = (sale: TelecomSale) => {
    const company = telecomCompanies.find((c) => c.id === sale.companyId);
    const subAgent = subAgents.find((a) => a.id === sale.subAgentId);
    const sim = simCards.find((s) => s.id === sale.simId);
    const bundle = agentBundles.find((b) => b.id === sale.bundleId);
    const customer = customers.find((c) => c.id === sale.customerId);

    setEditingSaleId(sale.id);
    setSaleOperationType(sale.operationType === 'renewal' ? 'renewal' : 'activation');
    setSaleMode('sell_sim');
    setShowForm(true);
    setFormStep(0);
    if (company) setSelectedCompany(company);
    if (subAgent) setSelectedSubAgent(subAgent);
    if (sim) { setSelectedSim(sim); setSimOption(sim.type === 'plastic' ? 'plastic' : 'barcode'); }
    if (bundle) setSelectedBundle(bundle);
    if (customer) { setSelectedCustomer(customer); setCustomerName(customer.name); setCustomerPhone(customer.phone); }
    else { setCustomerName(sale.customerName); setCustomerPhone(sale.customerPhone); }
    setSimNumber(sale.simNumber);
    setSerialNumber(sale.serialNumber || '');
    setPaymentMethod(sale.paymentMethod);
    setSelectedWalletType(sale.walletType ?? 'palpay');
    setPaymentStatus(sale.paymentStatus || (sale.remaining <= 0 ? 'paid_full' : sale.paid > 0 ? 'paid_partial' : 'unpaid'));
    setPaidAmount(sale.paid > 0 ? sale.paid.toString() : '');
    setReminderDate(sale.reminderDate ? new Date(sale.reminderDate).toISOString().split('T')[0] : '');
    setNotes(sale.notes || '');
    setSimSearchQuery('');
    if (sale.chargeDuration) setChargeDuration(sale.chargeDuration);
    if (sale.salePrice) setSalePriceOverride(sale.salePrice.toString());
  };

  const handleDelete = (sale: TelecomSale) => {
    setSaleToDelete(sale);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (saleToDelete) {
      deleteTelecomSale(saleToDelete.id);
    }
    setShowDeleteConfirm(false);
    setSaleToDelete(null);
  };

  const handleReceipt = (sale: TelecomSale) => {
    setReceiptSale(sale);
  };

  const handleCollectDebt = (customerId: string, amount: number) => {
    recordPayment(customerId, amount);
    const customer = customers.find((c) => c.id === customerId);
    if (customer && settings.enableSms) {
      void logOutboundSms(customer.phone, `عزيزي ${customer.name}، تم تحصيل دفعة بقيمة ${formatCurrency(amount, settings.currency)}. المتبقي من الدين: ${formatCurrency(Math.max(0, customer.debt - amount), settings.currency)}`, 'sms');
    }
  };

  const handleOpenCustomer = (customerId: string | null, customerPhone: string) => {
    if (customerId) {
      const c = customers.find((cu) => cu.id === customerId);
      if (c) { setProfileCustomer(c); return; }
    }
    const c = customers.find((cu) => cu.phone === customerPhone);
    if (c) setProfileCustomer(c);
  };

  const handleCollectFromHistory = (sale: TelecomSale) => {
    setCollectSale(sale);
    setCollectAmount(sale.remaining.toString());
    setCollectPaymentMethod('cash');
    setCollectWalletType('palpay');
  };

  const confirmCollectFromHistory = () => {
    if (!collectSale || !collectSale.customerId) return;
    const amount = parseFloat(collectAmount) || 0;
    if (amount <= 0) return;
    handleCollectDebt(collectSale.customerId, amount);
    if (amount >= collectSale.remaining) {
      updateTelecomSale(collectSale.id, { remaining: 0, paid: collectSale.total, paymentMethod: collectPaymentMethod, walletType: collectPaymentMethod === 'wallet' ? collectWalletType : null, debtChange: 0, followUpStatus: 'collected', paymentDate: Date.now() });
    } else {
      updateTelecomSale(collectSale.id, { remaining: collectSale.remaining - amount, paid: collectSale.paid + amount, paymentMethod: collectPaymentMethod, walletType: collectPaymentMethod === 'wallet' ? collectWalletType : null, followUpStatus: 'contacted', paymentDate: Date.now() });
    }
    if (collectPaymentMethod === 'wallet' && amount > 0) {
      addWalletTransaction({
        walletType: collectWalletType,
        type: 'sale',
        amount,
        category: 'تحصيل دين اتصالات',
        description: `${collectSale.companyName} - ${collectSale.customerName} - ${collectSale.simNumber}`,
        relatedTxnId: collectSale.id,
        shiftId: activeShift?.id ?? null,
      });
    }
    setCollectSale(null);
    setCollectAmount('');
    setCollectPaymentMethod('cash');
    setCollectWalletType('palpay');
  };

  const handleCancelSale = (sale: TelecomSale) => {
    setCancelSale(sale);
    const daysUsed = Math.floor((Date.now() - sale.createdAt) / 86400000);
    const monthlyPrice = sale.total || 0;
    const dailyRate = monthlyPrice / 30;
    const usedCost = Math.round(dailyRate * daysUsed * 100) / 100;
    const barcodeFee = sale.simType === 'electronic' ? (sale.companyName === 'الوها' ? 10 : 5) : 0;
    const plasticFee = sale.simType === 'plastic' ? (sale.simPrice || 0) : 0;
    const autoDeduction = Math.round((usedCost + barcodeFee + plasticFee) * 100) / 100;
    setCancelDeduction(autoDeduction.toString());
  };

  const confirmCancelSale = () => {
    if (!cancelSale) return;
    const deduction = parseFloat(cancelDeduction) || 0;
    updateTelecomSale(cancelSale.id, {
      operationType: 'cancelled',
      cancelledAt: Date.now(),
      cancellationDeduction: deduction,
      followUpStatus: 'not_contacted',
    });
    if (cancelSale.customerId && cancelSale.remaining > 0) {
      recordPayment(cancelSale.customerId, 0);
    }
    if (settings.enableSms && cancelSale.customerPhone.trim()) {
      void logOutboundSms(
        cancelSale.customerPhone.trim(),
        `عزيزي ${cancelSale.customerName}، تم إلغاء معاملتك للشريحة ${cancelSale.simNumber}. المبلغ المخصوم: ${formatCurrency(deduction, settings.currency)}${cancelSale.remaining - deduction > 0 ? `\nالمسترد: ${formatCurrency(cancelSale.remaining - deduction, settings.currency)}` : ''}`,
        'sms',
      );
    }
    setCancelSale(null);
    setCancelDeduction('');
  };

  const handleFollowUp = (sale: TelecomSale) => {
    setFollowUpSale(sale);
  };

  const setFollowUpStatus = (status: FollowUpStatus) => {
    if (!followUpSale) return;
    updateTelecomSale(followUpSale.id, { followUpStatus: status });
    setFollowUpSale(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        {/* Read-only banner */}
        {readOnlyMode && !editingSaleId && (
          <View style={[styles.readOnlyBanner, { backgroundColor: colors.danger + '15' }]}>
            <Text style={[styles.readOnlyText, { color: colors.danger }]}>الاشتراك منتهي - لا يمكن إجراء معاملات جديدة</Text>
          </View>
        )}

        {/* Edit banner */}
        {editingSaleId && (
          <View style={[styles.editBanner, { backgroundColor: colors.accent + '15' }]}>
            <Pencil size={16} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.editBannerText, { color: colors.accent }]}>تعديل عملية موجودة</Text>
            <TouchableOpacity onPress={resetForm} style={styles.editCancelBtn}>
              <XCircle size={18} color={colors.accent} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Renewal banner */}
        {renewingFromSale && !editingSaleId && (
          <View style={[styles.editBanner, { backgroundColor: colors.primary + '15' }]}>
            <RefreshCw size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.editBannerText, { color: colors.primary }]}>
              تجديد العملية: {renewingFromSale.simNumber} - {renewingFromSale.customerName}
            </Text>
            <TouchableOpacity onPress={resetForm} style={styles.editCancelBtn}>
              <XCircle size={18} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Summary cards on desktop (replaces global search) */}
        {!isMobileLayout && !showForm && !editingSaleId && (
          <View style={styles.mobileSummaryGrid}>
            {[
              { label: 'الإجمالي', value: telecomSales.reduce((sum, sale) => sum + sale.total, 0), color: colors.primary },
              { label: 'المدفوع', value: telecomSales.reduce((sum, sale) => sum + sale.paid, 0), color: colors.success },
              { label: 'الديون', value: telecomSales.reduce((sum, sale) => sum + sale.remaining, 0), color: colors.danger },
              { label: 'الربح', value: telecomSales.reduce((sum, sale) => sum + sale.salePrice - sale.cost, 0), color: colors.info },
            ].map((card) => (
              <View key={card.label} style={[styles.mobileSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.mobileSummaryLabel, { color: colors.textMuted }]}>{card.label}</Text>
                <Text style={[styles.mobileSummaryValue, { color: card.color }]}>{formatCurrency(card.value, settings.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {isMobileLayout && !showForm && (
          <View style={styles.mobileSummaryGrid}>
            {[
              { label: 'الإجمالي', value: telecomSales.reduce((sum, sale) => sum + sale.total, 0), color: colors.primary },
              { label: 'المدفوع', value: telecomSales.reduce((sum, sale) => sum + sale.paid, 0), color: colors.success },
              { label: 'الديون', value: telecomSales.reduce((sum, sale) => sum + sale.remaining, 0), color: colors.danger },
              { label: 'الربح', value: telecomSales.reduce((sum, sale) => sum + sale.salePrice - sale.cost, 0), color: colors.info },
            ].map((card) => (
              <View key={card.label} style={[styles.mobileSummaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.mobileSummaryLabel, { color: colors.textMuted }]}>{card.label}</Text>
                <Text style={[styles.mobileSummaryValue, { color: card.color }]}>{formatCurrency(card.value, settings.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {isMobileLayout && !showForm && !editingSaleId && (
          <View style={styles.mobileActionsWrap}>
            <TouchableOpacity
              onPress={() => { resetForm(); setShowForm(true); }}
              style={[styles.mobileNewSaleBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <PlusCircle size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.mobileNewSaleText}>عملية جديدة</Text>
            </TouchableOpacity>
            <View style={styles.mobileMoreWrap}>
              <TouchableOpacity
                onPress={() => setShowMobileMoreMenu((v) => !v)}
                style={[styles.mobileMoreBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <MoreVertical size={18} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              {showMobileMoreMenu && (
                <View style={[styles.mobileMorePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.mobileMoreTabs}>
                    {([
                      { key: 'import' as const, label: 'استيراد', icon: <Upload size={13} color={colors.primary} strokeWidth={2} /> },
                      { key: 'sort' as const, label: 'فرز', icon: <ArrowUpDown size={13} color={colors.info} strokeWidth={2} /> },
                      { key: 'filter' as const, label: 'الدفع', icon: <Filter size={13} color={colors.accent} strokeWidth={2} /> },
                    ]).map((tab) => (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => setMobileMoreTab(tab.key)}
                        style={[styles.mobileMoreTab, mobileMoreTab === tab.key ? { backgroundColor: colors.primary + '15' } : {}]}
                        activeOpacity={0.7}
                      >
                        {tab.icon}
                        <Text style={[styles.mobileMoreTabText, { color: mobileMoreTab === tab.key ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.mobileMoreBody}>
                    {mobileMoreTab === 'import' && (
                      <>
                        <TouchableOpacity onPress={() => { setShowMobileMoreMenu(false); setShowImportModal(true); }} style={[styles.mobileMoreItem, { borderColor: colors.border }]} activeOpacity={0.7}>
                          <Upload size={15} color={colors.primary} strokeWidth={2} />
                          <Text style={[styles.mobileMoreItemText, { color: colors.text }]}>استيراد</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setShowMobileMoreMenu(false); void handleExportSales(); }} style={[styles.mobileMoreItem, { borderColor: colors.border }]} activeOpacity={0.7}>
                          <Download size={15} color={colors.success} strokeWidth={2} />
                          <Text style={[styles.mobileMoreItemText, { color: colors.text }]}>تصدير</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setShowMobileMoreMenu(false); void handleExportTemplate(); }} style={[styles.mobileMoreItem, { borderColor: colors.border }]} activeOpacity={0.7}>
                          <FileSpreadsheet size={15} color={colors.info} strokeWidth={2} />
                          <Text style={[styles.mobileMoreItemText, { color: colors.text }]}>قالب</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {mobileMoreTab === 'sort' && (
                      <View style={styles.mobileMoreChipsRow}>
                        {([
                          { key: 'newest' as const, label: 'الأحدث' },
                          { key: 'oldest' as const, label: 'الأقدم' },
                          { key: 'highest' as const, label: 'الأعلى' },
                          { key: 'lowest' as const, label: 'الأقل' },
                        ]).map((opt) => (
                          <TouchableOpacity
                            key={opt.key}
                            onPress={() => setHistorySort(opt.key)}
                            style={[styles.mobileMoreChip, { backgroundColor: historySort === opt.key ? colors.primary : colors.surfaceAlt, borderColor: historySort === opt.key ? colors.primary : colors.border }]}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.mobileMoreChipText, { color: historySort === opt.key ? '#FFFFFF' : colors.textSecondary }]}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    {mobileMoreTab === 'filter' && (
                      <View style={styles.mobileMoreChipsRow}>
                        {([
                          { key: 'all' as const, label: 'الكل' },
                          { key: 'paid' as const, label: 'مدفوعة' },
                          { key: 'unpaid' as const, label: 'غير مدفوعة' },
                          { key: 'followup' as const, label: 'متابعة' },
                          { key: 'cancelled' as const, label: 'ملغاة' },
                        ]).map((opt) => (
                          <TouchableOpacity
                            key={opt.key}
                            onPress={() => setHistoryStatusFilter(opt.key)}
                            style={[styles.mobileMoreChip, { backgroundColor: historyStatusFilter === opt.key ? colors.primary : colors.surfaceAlt, borderColor: historyStatusFilter === opt.key ? colors.primary : colors.border }]}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.mobileMoreChipText, { color: historyStatusFilter === opt.key ? '#FFFFFF' : colors.textSecondary }]}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {!isMobileLayout && !showForm && !editingSaleId && (
          <View style={[styles.mergedToolbar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => { resetForm(); setShowForm(true); }} style={[styles.mergedNewSaleBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
              <PlusCircle size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.mergedNewSaleText}>عملية جديدة</Text>
            </TouchableOpacity>
            <View style={[styles.mergedSearchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Search size={16} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={historySearch}
                onChangeText={setHistorySearch}
                placeholder="ابحث في السجل..."
                placeholderTextColor={colors.textMuted}
                style={[styles.mergedSearchInput, { color: colors.text }]}
              />
              {!!historySearch && (
                <TouchableOpacity onPress={() => setHistorySearch('')}>
                  <X size={14} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.mergedSortGroup}>
              {([
                { key: 'newest', label: 'الأحدث' },
                { key: 'oldest', label: 'الأقدم' },
                { key: 'highest', label: 'الأعلى' },
                { key: 'lowest', label: 'الأقل' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setHistorySort(opt.key)}
                  style={[styles.mergedSortChip, { backgroundColor: historySort === opt.key ? colors.primary : colors.surface, borderColor: historySort === opt.key ? colors.primary : colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.mergedSortText, { color: historySort === opt.key ? '#FFFFFF' : colors.textSecondary }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.mergedFilterGroup}>
              {([
                { key: 'all', label: 'الكل' },
                { key: 'paid', label: 'مدفوعة' },
                { key: 'unpaid', label: 'غير مدفوعة' },
                { key: 'followup', label: 'متابعة' },
                { key: 'cancelled', label: 'ملغاة' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setHistoryStatusFilter(opt.key)}
                  style={[styles.mergedFilterChip, { backgroundColor: historyStatusFilter === opt.key ? colors.primary : colors.surface, borderColor: historyStatusFilter === opt.key ? colors.primary : colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.mergedFilterText, { color: historyStatusFilter === opt.key ? '#FFFFFF' : colors.textSecondary }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.mergedActionsGroup}>
              <TouchableOpacity onPress={() => setShowImportModal(true)} style={[styles.mergedActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
                <Upload size={15} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.mergedActionText, { color: colors.text }]}>استيراد</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExportSales} style={[styles.mergedActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
                <Download size={15} color={colors.success} strokeWidth={2} />
                <Text style={[styles.mergedActionText, { color: colors.text }]}>تصدير</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleExportTemplate} style={[styles.mergedActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
                <FileSpreadsheet size={15} color={colors.info} strokeWidth={2} />
                <Text style={[styles.mergedActionText, { color: colors.text }]}>قالب</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showForm && (
        <View style={[styles.saleFormPanelFixed, isMobileLayout && styles.saleFormPanelMobile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.saleFormHeaderFixed, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => { resetForm(); setShowForm(false); }} style={styles.saleFormClose} activeOpacity={0.7}>
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={[styles.saleFormTitleFixed, { color: colors.text }]}>{editingSaleId ? 'تعديل العملية' : 'إضافة عملية جديدة'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setSaleOperationType('activation')}
                style={[styles.compactDurationBtn, saleOperationType === 'activation' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.compactDurationText, { color: saleOperationType === 'activation' ? '#FFFFFF' : colors.textSecondary }]}>رقم جديد</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSaleOperationType('renewal')}
                style={[styles.compactDurationBtn, saleOperationType === 'renewal' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.compactDurationText, { color: saleOperationType === 'renewal' ? '#FFFFFF' : colors.textSecondary }]}>تجديد</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Three-column fixed layout — no scroll */}
          <View style={[styles.form3ColBody, !isMobileLayout && styles.form3ColBodyDesktop, isMobileLayout && styles.form3ColBodyMobile]}>

            {/* ===== COLUMN 1 (right): Company & Bundle ===== */}
            <View style={[styles.form3ColItem, !isMobileLayout && styles.form3ColItemDesktopWide, isMobileLayout && styles.form3ColItemMobile, isMobileLayout && styles.mobileFormSection, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderStartColor: colors.border }]}>

        <Text style={[styles.colSectionTitle, isMobileLayout && styles.mobileColSectionTitle, { color: colors.textSecondary }]}>الشركة والحزمة</Text>

        {/* Sub-Agent */}
        <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>الوكيل</Text>
        {subAgents.filter((a) => a.active).length > 0 ? (
          <View style={styles.compactChipRow}>
            {subAgents.filter((a) => a.active).map((a) => (
              <TouchableOpacity
                key={a.id}
                onPress={() => handleSelectSubAgent(a)}
                style={[
                  styles.compactChip,
                  selectedSubAgent?.id === a.id
                    ? { backgroundColor: colors.info, borderColor: colors.info }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.compactChipText, { color: selectedSubAgent?.id === a.id ? '#FFFFFF' : colors.text }]} numberOfLines={1}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={[styles.noOptionsText, { color: colors.textMuted }]}>لا يوجد وكلاء</Text>
        )}

        {/* Company */}
        {selectedSubAgent && (
          <>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary, marginTop: 6 }]}>شركة الاتصالات</Text>
            {availableCompanies.length > 0 ? (
              <View style={styles.compactChipRow}>
                {availableCompanies.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => handleSelectCompany(c)}
                    style={[
                      styles.compactChip,
                      selectedCompany?.id === c.id
                        ? { backgroundColor: c.color, borderColor: c.color }
                        : { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.companyDot, { backgroundColor: selectedCompany?.id === c.id ? '#FFFFFF' : c.color }]} />
                    <Text style={[styles.compactChipText, { color: selectedCompany?.id === c.id ? '#FFFFFF' : colors.text }]} numberOfLines={1}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={[styles.noOptionsText, { color: colors.textMuted }]}>لا توجد شركات</Text>
            )}
          </>
        )}

        {/* Bundle */}
        {selectedCompany && (
          <>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary, marginTop: 6 }]}>الحزمة</Text>
            {availableBundles.length > 0 ? (
              <View style={styles.compactChipRow}>
                {availableBundles.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => {
                      setSelectedBundle(b);
                      const offer = b.bundleType === 'offer' || (b.prices?.['3_months'] != null && b.prices?.['month'] == null);
                      setChargeDuration(offer ? '3_months' : 'month');
                      setOfferPrice('');
                    }}
                    style={[
                      styles.compactChip,
                      selectedBundle?.id === b.id
                        ? { backgroundColor: colors.accent, borderColor: colors.accent }
                        : { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.compactChipText, { color: selectedBundle?.id === b.id ? '#FFFFFF' : colors.text }]} numberOfLines={1}>{b.bundleName}</Text>
                    <Text style={[styles.compactChipSub, { color: selectedBundle?.id === b.id ? '#FFFFFFDD' : colors.textMuted }]} numberOfLines={1}>
                      {b.bundleType === 'offer' || (b.prices?.['3_months'] != null && b.prices?.['month'] == null)
                    ? `عرض: ${formatCurrency(b.prices?.['3_months'] ?? 0, settings.currency)}`
                    : `شهري: ${formatCurrency(b.prices?.['month'] ?? 0, settings.currency)}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={[styles.noOptionsText, { color: colors.textMuted }]}>لا توجد حزم</Text>
            )}
          </>
        )}

        {/* Charge Duration */}
        {selectedBundle && isOfferBundle ? (
          <View style={[styles.durationPriceBadge, { backgroundColor: colors.success + '12', borderColor: colors.success + '30', marginTop: 6 }]}>
            <Text style={[styles.durationPriceText, { color: colors.success, fontSize: 11 }]} numberOfLines={2}>عرض 3 شهور — البيع: {formatCurrency(bundleSalePrice, settings.currency)} — التكلفة: {formatCurrency(selectedBundle.cost, settings.currency)}</Text>
          </View>
        ) : selectedBundle ? (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>مدة الشحن</Text>
            <View style={styles.durationGrid3Col}>
              {([
                { key: '3_days', label: '3 أيام' },
                { key: 'week', label: 'أسبوع' },
                { key: '2_weeks', label: 'أسبوعين' },
                { key: '3_weeks', label: '3 أسابيع' },
                { key: 'month', label: 'شهر' },
                { key: '2_months', label: 'شهرين' },
                { key: '3_months', label: '3 شهور' },
                ...(bundleHasOffer ? [{ key: 'offer', label: 'عرض' }] : []),
              ] as { key: string; label: string }[]).map((d) => (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => { setChargeDuration(d.key); setOfferPrice(''); }}
                  style={[styles.compactDurationBtn, chargeDuration === d.key ? { backgroundColor: d.key === 'offer' ? colors.accent : colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.compactDurationText, { color: chargeDuration === d.key ? '#FFFFFF' : colors.textSecondary }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.durationPriceBadge, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30', marginTop: 4 }]}>
              <Text style={[styles.durationPriceText, { color: colors.accent, fontSize: 11 }]} numberOfLines={2}>
                {chargeDuration === 'offer'
                  ? `العرض: ${formatCurrency(selectedBundle.prices?.['3_months'] ?? 0, settings.currency)}${simSurcharge > 0 ? ` + شريحة: ${formatCurrency(simSurcharge, settings.currency)}` : ''}`
                  : `البيع: ${formatCurrency(bundleSalePrice, settings.currency)} — التكلفة: ${formatCurrency(totalCost, settings.currency)}`}
              </Text>
            </View>
          </View>
        ) : null}

            </View>

            {/* ===== COLUMN 2 (middle): SIM & Customer ===== */}
            <View style={[styles.form3ColItem, !isMobileLayout && styles.form3ColItemDesktop, isMobileLayout && styles.form3ColItemMobile, isMobileLayout && styles.mobileFormSection, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderStartColor: colors.border }]}>

        <Text style={[styles.colSectionTitle, isMobileLayout && styles.mobileColSectionTitle, { color: colors.textSecondary }]}>الشريحة والزبون</Text>

        {/* SIM Option — only for new number, not renewal */}
        {selectedBundle && saleOperationType === 'activation' && (
          <View style={{ marginTop: 0 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>خيار الشريحة</Text>
            <View style={styles.durationGrid3Col}>
              <TouchableOpacity
                onPress={() => { setSimOption('none'); setSelectedSim(null); }}
                style={[styles.durationBtn3Col, simOption === 'none' ? { backgroundColor: colors.textSecondary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.durationBtn3ColText, { color: simOption === 'none' ? '#FFFFFF' : colors.textSecondary }]}>بدون</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSimOption('plastic'); if (availableSims.length === 0) setShowSimPicker(false); }}
                style={[styles.durationBtn3Col, simOption === 'plastic' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.durationBtn3ColText, { color: simOption === 'plastic' ? '#FFFFFF' : colors.textSecondary }]}>بلاستيك</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSimOption('barcode'); setSelectedSim(null); }}
                style={[styles.durationBtn3Col, simOption === 'barcode' ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.durationBtn3ColText, { color: simOption === 'barcode' ? '#FFFFFF' : colors.textSecondary }]}>باركود</Text>
              </TouchableOpacity>
            </View>

            {/* Plastic SIM picker */}
            {simOption === 'plastic' && (
              <TouchableOpacity
                onPress={() => availableSims.length > 0 && setShowSimPicker(true)}
                style={[styles.fieldInput3Col, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 4, opacity: availableSims.length > 0 ? 1 : 0.5 }]}
                activeOpacity={0.7}
                disabled={availableSims.length === 0}
              >
                {selectedSim ? (
                  <View style={styles.fieldRow}>
                    <Signal size={16} color={colors.primary} strokeWidth={2} />
                    <View>
                      <Text style={[styles.fieldValue3Col, { color: colors.text }]} numberOfLines={1}>{selectedSim.name}</Text>
                      <Text style={[styles.fieldSubValue3Col, { color: colors.textMuted }]}>
                        {formatCurrency(selectedSim.price, settings.currency)} | مخزون: {selectedSim.stock}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.fieldRow}>
                    <Signal size={16} color={colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.placeholder3Col, { color: colors.textMuted }]} numberOfLines={1}>
                      {availableSims.length > 0 ? 'اختر الشريحة' : 'لا توجد شرائح'}
                    </Text>
                  </View>
                )}
                <ChevronDown size={16} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}

            {/* Barcode surcharge + upload */}
            {simOption === 'barcode' && (
              <>
                <View style={[styles.durationPriceBadge, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '30', marginTop: 4 }]}>
                  <Text style={[styles.durationPriceText, { color: colors.accent, fontSize: 11 }]}>
                    رسوم الباركود: {formatCurrency(selectedCompany?.name === 'الوها' ? 10 : 5, settings.currency)}
                  </Text>
                </View>
                {Platform.OS === 'web' && (
                  <View style={{ marginTop: 4 }}>
                    <div
                      onPaste={handleBarcodePaste}
                      tabIndex={0}
                      style={{ outline: 'none', borderRadius: 8 }}
                    >
                    <input
                      ref={barcodeImageInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBarcodeImageUpload(f);
                        if (e.target) e.target.value = '';
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => barcodeImageInputRef.current?.click()}
                      style={[styles.barcodeUploadBtn3Col, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}
                      activeOpacity={0.7}
                      disabled={ocrLoading}
                    >
                      {ocrLoading ? (
                        <Loader2 size={14} color={colors.accent} strokeWidth={2} />
                      ) : (
                        <ImageIcon size={14} color={colors.accent} strokeWidth={2} />
                      )}
                      <Text style={[styles.barcodeUploadText3Col, { color: colors.accent }]} numberOfLines={1}>
                        {ocrLoading ? 'جاري...' : 'إدراج صورة الشريحة'}
                      </Text>
                    </TouchableOpacity>
                    </div>
                    {ocrError ? (
                      <Text style={[styles.barcodeOcrError, { color: colors.danger, fontSize: 10 }]}>{ocrError}</Text>
                    ) : null}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Sale Price Override */}
        {selectedBundle && (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>سعر البيع (اختياري)</Text>
            <View style={styles.calcRow}>
              <TextInput
                value={salePriceOverride}
                onChangeText={setSalePriceOverride}
                placeholder={autoTotal.toFixed(2)}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, flex: 1 }]}
              />
              {salePriceOverride.trim() !== '' && (
                <TouchableOpacity
                  onPress={() => setSalePriceOverride('')}
                  style={[styles.calcBtn3Col, { backgroundColor: colors.surfaceAlt }]}
                  activeOpacity={0.7}
                >
                  <X size={14} color={colors.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
            {salePriceVal > 0 && salePriceVal !== autoTotal && (
              <View style={[styles.durationPriceBadge, { backgroundColor: salePriceVal > autoTotal ? colors.success + '12' : colors.danger + '12', borderColor: salePriceVal > autoTotal ? colors.success + '30' : colors.danger + '30', marginTop: 4 }]}>
                <Text style={[styles.durationPriceText, { color: salePriceVal > autoTotal ? colors.success : colors.danger, fontSize: 11 }]}>
                  {salePriceVal > autoTotal ? `ربح: +${formatCurrency(salePriceVal - autoTotal, settings.currency)}` : `خصم: ${formatCurrency(autoTotal - salePriceVal, settings.currency)}`}
                </Text>
              </View>
            )}
            {salePriceVal > 0 && total < totalCost && (
              <View style={[styles.durationPriceBadge, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '30', marginTop: 4 }]}>
                <Text style={[styles.durationPriceText, { color: colors.danger, fontSize: 11 }]}>خسارة: {formatCurrency(totalCost - total, settings.currency)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Phone and SIM number */}
        <View style={{ marginTop: 6 }}>
          <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>رقم الهاتف</Text>
          <TextInput
            value={simNumber}
            onChangeText={(value) => setSimNumber(value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10 أرقام"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: simNumber.length > 0 && simNumber.length !== 10 ? colors.danger : colors.border }]}
          />
          {simNumber.length > 0 && simNumber.length !== 10 && <Text style={[styles.remainingText, { color: colors.danger, fontSize: 10 }]}>10 أرقام مطلوبة</Text>}
        </View>
        <View style={{ marginTop: 6 }}>
          <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>رقم الشريحة</Text>
          <TextInput
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="اختياري"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          />
        </View>

        {/* Customer name and number */}
        <View style={[styles.customerFieldsSection, { zIndex: 20 }]}>
          <View style={{ width: '100%', zIndex: 20 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>اسم الزبون</Text>
            <View style={styles.customerNameRow}>
              <View style={{ flex: 1, position: 'relative' }}>
                <TextInput
                  value={customerName}
                  onChangeText={handleCustomerNameChange}
                  placeholder="ابحث أو أدخل"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  onFocus={() => setShowNameSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowNameSuggestions(false), 300)}
                />
                {showNameSuggestions && (customerNameSuggestions.length > 0 || isNewPhoneQuery) && (
                  <View style={[styles.nameSuggestions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {customerNameSuggestions.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => { handleSelectCustomer(c); setShowNameSuggestions(false); }}
                        onPressIn={() => setShowNameSuggestions(true)}
                        style={[styles.nameSuggestionRow, { borderBottomColor: colors.border }]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                          <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerRowText, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                          <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>{c.phone}</Text>
                        </View>
                        {c.debt > 0 && (
                          <Text style={[styles.debtLabel, { color: colors.danger }]}>
                            دين: {formatCurrency(c.debt, settings.currency)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                    {isNewPhoneQuery && (
                      <TouchableOpacity
                        onPress={handleCreateNewForPhone}
                        onPressIn={() => setShowNameSuggestions(true)}
                        style={[styles.nameSuggestionRow, { borderBottomWidth: 0 }]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.avatar, { backgroundColor: colors.accent + '20' }]}>
                          <PlusCircle size={16} color={colors.accent} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerRowText, { color: colors.text }]} numberOfLines={1}>
                            إنشاء معاملة لهذا الرقم
                          </Text>
                          <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>
                            {normalizePhoneNumber(customerName.trim())}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={openDeviceContacts}
                style={[styles.iconBtn3Col, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                activeOpacity={0.7}
                accessibilityLabel="إدراج من جهات اتصال الهاتف"
              >
                <Phone size={16} color="#FFFFFF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ width: '100%', marginTop: 6, zIndex: 1 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>رقم الزبون</Text>
            <TextInput
              value={customerPhone}
              onChangeText={(value) => setCustomerPhone(normalizePhoneNumber(value))}
              placeholder="رقم الجوال"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
          </View>
        </View>

        {/* Prepaid balance + existing debt */}
        {selectedCustomer && selectedCustomer.balance > 0 && (
          <View style={[styles.miniInfoBadge, { backgroundColor: colors.primary + '12' }]}>
            <Wallet size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.miniInfoText, { color: colors.primary }]} numberOfLines={1}>رصيد: {formatCurrency(selectedCustomer.balance, settings.currency)}</Text>
          </View>
        )}
        {selectedCustomer && selectedCustomer.debt > 0 && (
          <View style={[styles.miniInfoBadge, { backgroundColor: colors.warning + '12' }]}>
            <BookOpen size={12} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.miniInfoText, { color: colors.warning }]} numberOfLines={1}>دين حالي: {formatCurrency(selectedCustomer.debt, settings.currency)}</Text>
          </View>
        )}

            </View>

            {/* ===== COLUMN 3 (left): Payment & Save ===== */}
            <View style={[styles.form3ColItem, !isMobileLayout && styles.form3ColItemDesktop, isMobileLayout && styles.form3ColItemMobile, isMobileLayout && styles.mobileFormSection, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>

        <Text style={[styles.colSectionTitle, isMobileLayout && styles.mobileColSectionTitle, { color: colors.textSecondary }]}>الدفع والحفظ</Text>

        {/* Total Display */}
        <View style={[styles.totalCard3Col, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.totalDualRow}>
            <View style={styles.totalDualItem}>
              <Text style={[styles.totalLabel3Col, { color: colors.textSecondary }]}>البيع</Text>
              <Text style={[styles.totalValue3Col, { color: colors.text }]}>{formatCurrency(bundleSalePrice, settings.currency)}</Text>
            </View>
            {simSurcharge > 0 && (
              <View style={styles.totalDualItem}>
                <Text style={[styles.totalLabel3Col, { color: colors.textSecondary }]}>
                  {simOption === 'plastic' ? 'شريحة' : 'باركود'}
                </Text>
                <Text style={[styles.totalValue3Col, { color: colors.text }]}>{formatCurrency(simSurcharge, settings.currency)}</Text>
              </View>
            )}
            <View style={styles.totalDualItem}>
              <Text style={[styles.grandTotalLabel3Col, { color: colors.text }]}>الإجمالي</Text>
              <Text style={[styles.grandTotalValue3Col, { color: colors.primary }]}>{formatCurrency(total, settings.currency)}</Text>
            </View>
          </View>
        </View>

        {/* Payment Status */}
        <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary, marginTop: 8 }]}>حالة الدفع</Text>
        <View style={[styles.paymentRow3Col, isMobileLayout && styles.paymentRowMobile]}>
          <TouchableOpacity
            onPress={() => { setPaymentStatus('paid_full'); setPaidAmount(total.toFixed(2)); }}
            style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentStatus === 'paid_full' ? { backgroundColor: colors.success } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Check size={14} color={paymentStatus === 'paid_full' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.paymentText3Col, { color: paymentStatus === 'paid_full' ? '#FFFFFF' : colors.textSecondary }]}>كلي</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPaymentStatus('paid_partial'); setPaidAmount(''); }}
            style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentStatus === 'paid_partial' ? { backgroundColor: colors.warning } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Wallet size={14} color={paymentStatus === 'paid_partial' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.paymentText3Col, { color: paymentStatus === 'paid_partial' ? '#FFFFFF' : colors.textSecondary }]}>جزئي</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setPaymentStatus('unpaid'); setPaidAmount('0'); setPaymentMethod('debt'); }}
            style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentStatus === 'unpaid' ? { backgroundColor: colors.danger } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <BookOpen size={14} color={paymentStatus === 'unpaid' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.paymentText3Col, { color: paymentStatus === 'unpaid' ? '#FFFFFF' : colors.textSecondary }]}>دين</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        {(paymentStatus === 'paid_full' || paymentStatus === 'paid_partial') && (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>طريقة الدفع</Text>
            <View style={[styles.paymentRow3Col, isMobileLayout && styles.paymentRowMobile]}>
              <TouchableOpacity
                onPress={() => setPaymentMethod('cash')}
                style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentMethod === 'cash' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Wallet size={14} color={paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary }]}>نقدي</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod('wallet')}
                style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentMethod === 'wallet' ? { backgroundColor: colors.info } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <CreditCard size={14} color={paymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: paymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary }]}>تطبيق</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod('usdt')}
                style={[styles.paymentBtn3Col, isMobileLayout && styles.mobilePaymentBtn3Col, paymentMethod === 'usdt' ? { backgroundColor: colors.accent } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Coins size={14} color={paymentMethod === 'usdt' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: paymentMethod === 'usdt' ? '#FFFFFF' : colors.textSecondary }]}>USDT</Text>
              </TouchableOpacity>
            </View>
            {paymentMethod === 'wallet' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {ELECTRONIC_WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setSelectedWalletType(w.id)}
                    style={[styles.walletChip, selectedWalletType === w.id ? { backgroundColor: w.color } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.walletChipText, { color: selectedWalletType === w.id ? '#FFFFFF' : colors.textSecondary }]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {selectedCustomer && selectedCustomer.balance > 0 && (
              <TouchableOpacity
                onPress={() => { setPaymentMethod('balance'); setPaymentStatus('paid_full'); setPaidAmount(total.toFixed(2)); }}
                style={[styles.balanceBtn3Col, { backgroundColor: paymentMethod === 'balance' ? colors.accent : colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Wallet size={14} color={paymentMethod === 'balance' ? '#FFFFFF' : colors.accent} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: paymentMethod === 'balance' ? '#FFFFFF' : colors.accent }]}>من الرصيد ({formatCurrency(selectedCustomer.balance, settings.currency)})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Paid Amount — partial only */}
        {paymentStatus === 'paid_partial' && (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary }]}>المبلغ المدفوع</Text>
            <View style={styles.calcRow}>
              <TextInput
                value={paidAmount}
                onChangeText={setPaidAmount}
                placeholder={total.toFixed(2)}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, flex: 1 }]}
              />
              <TouchableOpacity
                onPress={() => setShowCashCalc(true)}
                style={[styles.calcBtn3Col, { backgroundColor: colors.accent }]}
                activeOpacity={0.7}
              >
                <Calculator size={14} color="#FFFFFF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {paid > 0 && paid < total && (
              <Text style={[styles.remainingText, { color: colors.warning, fontSize: 11 }]}>
                المتبقي: {formatCurrency(remaining, settings.currency)}
              </Text>
            )}
          </View>
        )}

        {/* Unpaid debt banner */}
        {paymentStatus === 'unpaid' && (
          <View style={[styles.miniInfoBadge, { backgroundColor: colors.danger + '12', marginTop: 4 }]}>
            <BookOpen size={12} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.miniInfoText, { color: colors.danger }]} numberOfLines={2}>دين: {formatCurrency(total, settings.currency)}</Text>
          </View>
        )}

        {/* Reminder — compact */}
        {remaining > 0 && !!(selectedCustomer || (customerName.trim() && customerPhone.trim())) && (
          <View style={{ marginTop: 6 }}>
            <View style={styles.reminderToggleRow}>
              <TouchableOpacity
                onPress={() => { setReminderEnabled(false); setReminderDate(''); }}
                style={[styles.reminderToggleBtn, !reminderEnabled ? { backgroundColor: colors.textSecondary } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.reminderToggleText, { color: !reminderEnabled ? '#FFFFFF' : colors.textSecondary }]}>بدون تذكير</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setReminderEnabled(true);
                  if (!reminderDate) {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    setReminderDate(nextWeek.toISOString().split('T')[0]);
                  }
                }}
                style={[styles.reminderToggleBtn, reminderEnabled ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <CalendarClock size={12} color={reminderEnabled ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.reminderToggleText, { color: reminderEnabled ? '#FFFFFF' : colors.textSecondary }]}>تذكير</Text>
              </TouchableOpacity>
            </View>
            {reminderEnabled && (
              <>
                <TextInput
                  value={reminderDate}
                  onChangeText={setReminderDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginTop: 4 }]}
                />
                <View style={styles.freqRow3Col}>
                  {([
                    { key: 'daily' as DebtReminderFrequency, label: 'يومي' },
                    { key: 'weekly' as DebtReminderFrequency, label: 'أسبوعي' },
                    { key: 'custom_days' as DebtReminderFrequency, label: 'مخصص' },
                  ]).map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => setReminderFreq(f.key)}
                      style={[styles.freqBtn3Col, reminderFreq === f.key ? { backgroundColor: colors.accent } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.freqBtnText3Col, { color: reminderFreq === f.key ? '#FFFFFF' : colors.textSecondary }]}>{f.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {reminderFreq === 'custom_days' && (
                  <TextInput
                    value={reminderCustomDays}
                    onChangeText={setReminderCustomDays}
                    placeholder="3"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.textInput3Col, isMobileLayout && styles.mobileTextInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginTop: 4 }]}
                  />
                )}
              </>
            )}
          </View>
        )}

        {/* Notes */}
        <Text style={[styles.fieldLabelCompact, { color: colors.textSecondary, marginTop: 6 }]}>ملاحظات</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="اختياري"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.notesInput3Col, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        />

        {/* Date info */}
        <View style={[styles.dateTimeRow3Col, { backgroundColor: colors.surfaceAlt }]}>
          <Clock size={12} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.dateTimeText3Col, { color: colors.textMuted }]} numberOfLines={1}>
            {editingSaleId ? 'تحديث تلقائي' : new Date().toLocaleDateString('ar')}
          </Text>
        </View>

        {/* SMS preview */}
        {settings.enableSms && !!(selectedCustomer || (customerName.trim() && customerPhone.trim())) && (
          <View style={[styles.smsPreview3Col, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
            <MessageSquare size={10} color={colors.info} strokeWidth={2} />
            <Text style={[styles.smsPreviewText3Col, { color: colors.info }]} numberOfLines={2}>
              {customerName || 'العميل'}: {formatCurrency(total, settings.currency)}{remaining > 0 ? ` — متبقي: ${formatCurrency(remaining, settings.currency)}` : ''}
            </Text>
          </View>
        )}

            </View>
          </View>

          {/* Form Actions */}
          <View style={[styles.formActionsFixed, isMobileLayout && styles.formActionsMobile, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { resetForm(); setShowForm(false); }}
              style={[styles.wizardCancelBtn3Col, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <XCircle size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.wizardCancelText3Col, { color: colors.textSecondary }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDirectRecharge(true)}
              disabled={!selectedCompany || !simNumber.trim() || !selectedBundle}
              style={[styles.wizardNextBtn3Col, { backgroundColor: selectedCompany && simNumber.trim() && selectedBundle ? colors.accent : colors.border }]}
              activeOpacity={0.8}
            >
              <Zap size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.wizardNextText3Col}>الشحن المباشر</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCheckout}
              disabled={!canSubmit}
              style={[styles.wizardNextBtn3Col, { backgroundColor: canSubmit ? colors.success : colors.border, flex: 1 }]}
              activeOpacity={0.8}
            >
              {editingSaleId ? <Save size={16} color="#FFFFFF" strokeWidth={2} /> : <Check size={16} color="#FFFFFF" strokeWidth={2} />}
              <Text style={styles.wizardNextText3Col}>{editingSaleId ? 'تحديث' : 'حفظ العملية'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        {/* Sale History */}
        {!showForm && (
          <>
            {!isMobileLayout && <Text style={[styles.historyTitle, { color: colors.text }]}>العمليات الأخيرة</Text>}
            <TelecomSaleHistory
              sales={telecomSales}
              settings={settings}
              onRenew={handleRenew}
              onToggleAutoRenew={handleToggleAutoRenew}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReceipt={handleReceipt}
              onCollectDebt={handleCollectFromHistory}
              onCancelSale={handleCancelSale}
              onFollowUp={handleFollowUp}
              onOpenCustomer={handleOpenCustomer}
              hideToolbar={true}
              externalSearchQuery={historySearch}
              externalSortOrder={historySort}
              externalStatusFilter={historyStatusFilter}
              onSearchChange={setHistorySearch}
              onSortChange={setHistorySort}
              onStatusFilterChange={setHistoryStatusFilter}
            />
          </>
        )}
      </ScrollView>

      {/* Customer Profile */}
      <CustomerProfile
        visible={profileCustomer !== null}
        customer={profileCustomer}
        onClose={() => setProfileCustomer(null)}
        onEdit={() => { setProfileCustomer(null); }}
        onPayment={(c) => { setProfileCustomer(null); setCollectSale(telecomSales.find((s) => s.customerId === c.id && s.remaining > 0) ?? null); }}
        onTopUp={() => {}}
        onAddDebt={() => {}}
        onRedeem={() => {}}
      />

      {/* Sim Picker */}
      <BaseModal visible={showSimPicker} onClose={() => setShowSimPicker(false)} title="اختر شريحة">
        <ScrollView style={{ maxHeight: 400 }}>
          {availableSims.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => handleSelectSim(s)}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Signal size={20} color={colors.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{s.name}</Text>
                <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>
                  السعر: {formatCurrency(s.price, settings.currency)} | مخزون: {s.stock}
                </Text>
              </View>
              {selectedSim?.id === s.id && <Check size={18} color={colors.primary} strokeWidth={2} />}
            </TouchableOpacity>
          ))}
          {availableSims.length === 0 && (
            <Text style={[styles.noResults, { color: colors.textMuted }]}>لا توجد شرائح متاحة</Text>
          )}
        </ScrollView>
      </BaseModal>

      {/* Bundle Picker (for editing) */}
      <BaseModal visible={showBundlePicker} onClose={() => setShowBundlePicker(false)} title="اختر الحزمة">
        <ScrollView style={{ maxHeight: 400 }}>
          {availableBundles.map((b) => (
            <TouchableOpacity
              key={b.id}
              onPress={() => { setSelectedBundle(b); setShowBundlePicker(false); }}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Zap size={20} color={colors.accent} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{b.bundleName}</Text>
                <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>
                  {b.bundleType === 'offer' || (b.prices?.['3_months'] != null && b.prices?.['month'] == null)
                    ? `عرض 3 شهور: ${formatCurrency(b.prices?.['3_months'] ?? 0, settings.currency)}`
                    : `شهري: ${formatCurrency(b.prices?.['month'] ?? 0, settings.currency)}`}
                </Text>
              </View>
              {selectedBundle?.id === b.id && <Check size={18} color={colors.primary} strokeWidth={2} />}
            </TouchableOpacity>
          ))}
          {availableBundles.length === 0 && (
            <Text style={[styles.noResults, { color: colors.textMuted }]}>لا توجد حزم متاحة</Text>
          )}
        </ScrollView>
      </BaseModal>

      {/* Phone Contacts Picker */}
      <BaseModal
        visible={showDeviceContacts}
        onClose={() => { setShowDeviceContacts(false); setDeviceContactsSearch(''); }}
        title="جهات اتصال الهاتف"
      >
        <View style={styles.searchRow}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={deviceContactsSearch}
            onChangeText={setDeviceContactsSearch}
            placeholder="ابحث بالاسم أو الرقم..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        {deviceContactsLoading && <Text style={[styles.noResults, { color: colors.textMuted }]}>جاري قراءة جهات اتصال الهاتف...</Text>}
        {deviceContactsError && <Text style={[styles.noResults, { color: colors.danger }]}>{deviceContactsError}</Text>}
        <ScrollView style={{ maxHeight: 400, marginTop: 12 }}>
          {filteredDeviceContacts.map((contact) => (
            <TouchableOpacity
              key={`${contact.name}-${contact.phone}`}
              onPress={() => selectDeviceContact(contact)}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Phone size={18} color={colors.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{contact.name}</Text>
                <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>{contact.phone}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BaseModal>

      {/* Customer Picker */}
      <BaseModal visible={showCustomerPicker} onClose={() => { setShowCustomerPicker(false); setCustomerSearch(''); }} title="اختر الزبون">
        <View style={styles.searchRow}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="ابحث بالاسم أو الرقم..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <ScrollView style={{ maxHeight: 400, marginTop: 12 }}>
          {filteredCustomers.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => handleSelectCustomer(c)}
              style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{c.name}</Text>
                <Text style={[styles.pickerSubText, { color: colors.textMuted }]}>{c.phone}</Text>
              </View>
              {c.debt > 0 && (
                <Text style={[styles.debtLabel, { color: colors.danger }]}>
                  دين: {formatCurrency(c.debt, settings.currency)}
                </Text>
              )}
            </TouchableOpacity>
          ))}
          {filteredCustomers.length === 0 && (
            <Text style={[styles.noResults, { color: colors.textMuted }]}>لا يوجد زبائن</Text>
          )}
        </ScrollView>
      </BaseModal>

      <DirectRechargeModal
        visible={showDirectRecharge}
        onClose={() => setShowDirectRecharge(false)}
        onSuccess={() => {
          setShowDirectRecharge(false);
          if (canSubmit) handleCheckout();
        }}
        companyName={selectedCompany?.name ?? ''}
        phoneNumber={simNumber.trim()}
        subscriptionNumber={selectedCustomer?.subscriptionNumber || simNumber.trim()}
        durationKey={chargeDuration}
        packageType={isOfferBundle ? 'offer' : 'normal'}
      />

      {/* Cash Calculator */}
      <CashCalculator
        visible={showCashCalc}
        total={total}
        currency={settings.currency}
        onClose={() => setShowCashCalc(false)}
        onConfirm={(amount) => {
          setPaidAmount(amount.toFixed(2));
          setShowCashCalc(false);
        }}
      />

      {/* Success Modal */}
      <BaseModal
        visible={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="تمت المعاملة بنجاح"
        footer={
          <TouchableOpacity onPress={() => setShowSuccess(false)} style={[styles.confirmBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Check size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.confirmBtnText}>تم</Text>
          </TouchableOpacity>
        }
      >
        {lastSale && (
          <View style={{ gap: 10 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Smartphone size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{lastSale.companyName}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Signal size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{lastSale.simName || 'شحن حزمة'}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Users size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{lastSale.customerName} - {lastSale.customerPhone}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.primary + '15' }]}>
              <Wallet size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.primary }]}>{formatCurrency(lastSale.total, settings.currency)}</Text>
            </View>
            {lastSale.smsSent && (
              <View style={[styles.smsSentBanner, { backgroundColor: colors.info + '12' }]}>
                <MessageSquare size={14} color={colors.info} strokeWidth={2} />
                <Text style={[styles.smsSentText, { color: colors.info }]}>تم إرسال SMS للزبون</Text>
              </View>
            )}
            {lastSale.remaining > 0 && (
              <View style={[styles.debtRecordedBanner, { backgroundColor: colors.danger + '12' }]}>
                <BookOpen size={14} color={colors.danger} strokeWidth={2} />
                <Text style={[styles.debtRecordedText, { color: colors.danger }]}>
                  تم تسجيل دين: {formatCurrency(lastSale.remaining, settings.currency)}
                </Text>
              </View>
            )}
            {lastSale.remaining > 0 && lastSale.reminderSet && (
              <View style={[styles.smsSentBanner, { backgroundColor: colors.accent + '12' }]}>
                <Bell size={14} color={colors.accent} strokeWidth={2} />
                <Text style={[styles.smsSentText, { color: colors.accent }]}>تم جدولة تذكير تلقائي بالدين</Text>
              </View>
            )}
          </View>
        )}
      </BaseModal>

      {/* Delete Confirmation */}
      <BaseModal
        visible={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="تأكيد الحذف"
        footer={
          <View style={styles.deleteFooter}>
            <TouchableOpacity
              onPress={() => setShowDeleteConfirm(false)}
              style={[styles.deleteCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmDelete}
              style={[styles.deleteConfirmBtn, { backgroundColor: colors.danger }]}
              activeOpacity={0.8}
            >
              <Trash2 size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.deleteConfirmText}>حذف</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <Text style={[styles.deleteText, { color: colors.text }]}>
          هل أنت متأكد من حذف هذه العملية؟{saleToDelete ? `\n${saleToDelete.companyName} - ${saleToDelete.customerName} - ${saleToDelete.simNumber}` : ''}
        </Text>
      </BaseModal>

      {/* Collect Debt from History */}
      <BaseModal
        visible={!!collectSale}
        onClose={() => { setCollectSale(null); setCollectAmount(''); setCollectPaymentMethod('cash'); setCollectWalletType('palpay'); }}
        title="تحصيل دين"
        footer={
          <View style={styles.deleteFooter}>
            <TouchableOpacity
              onPress={() => { setCollectSale(null); setCollectAmount(''); }}
              style={[styles.deleteCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmCollectFromHistory}
              style={[styles.deleteConfirmBtn, { backgroundColor: colors.success }]}
              activeOpacity={0.8}
            >
              <Check size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.deleteConfirmText}>تحصيل</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {collectSale && (
          <View style={{ gap: 12 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Users size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{collectSale.customerName} - {collectSale.customerPhone}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Smartphone size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{collectSale.companyName} - {collectSale.simNumber}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.danger + '15' }]}>
              <BookOpen size={20} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.danger }]}>الدين المتبقي: {formatCurrency(collectSale.remaining, settings.currency)}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المبلغ المُحصّل</Text>
            <TextInput
              value={collectAmount}
              onChangeText={setCollectAmount}
              placeholder={collectSale.remaining.toString()}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 4 }]}>طريقة الدفع</Text>
            <View style={styles.paymentRow3Col}>
              <TouchableOpacity
                onPress={() => setCollectPaymentMethod('cash')}
                style={[styles.paymentBtn3Col, collectPaymentMethod === 'cash' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Wallet size={14} color={collectPaymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: collectPaymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary }]}>نقدي</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCollectPaymentMethod('wallet')}
                style={[styles.paymentBtn3Col, collectPaymentMethod === 'wallet' ? { backgroundColor: colors.info } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <CreditCard size={14} color={collectPaymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: collectPaymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary }]}>تطبيق</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCollectPaymentMethod('usdt')}
                style={[styles.paymentBtn3Col, collectPaymentMethod === 'usdt' ? { backgroundColor: colors.accent } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Coins size={14} color={collectPaymentMethod === 'usdt' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                <Text style={[styles.paymentText3Col, { color: collectPaymentMethod === 'usdt' ? '#FFFFFF' : colors.textSecondary }]}>USDT</Text>
              </TouchableOpacity>
            </View>
            {collectPaymentMethod === 'wallet' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {ELECTRONIC_WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setCollectWalletType(w.id)}
                    style={[styles.walletChip, collectWalletType === w.id ? { backgroundColor: w.color } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.walletChipText, { color: collectWalletType === w.id ? '#FFFFFF' : colors.textSecondary }]}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.collectActions}>
              <TouchableOpacity
                onPress={() => setCollectAmount(collectSale.remaining.toString())}
                style={[styles.collectBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.7}
              >
                <Text style={styles.collectBtnText}>تحصيل كامل</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCollectAmount((collectSale.remaining / 2).toFixed(2))}
                style={[styles.collectBtn, { backgroundColor: colors.accent }]}
                activeOpacity={0.7}
              >
                <Text style={styles.collectBtnText}>نصف المبلغ</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BaseModal>

      {/* Receipt */}
      <TelecomReceipt
        visible={!!receiptSale}
        sale={receiptSale}
        settings={settings}
        onClose={() => setReceiptSale(null)}
      />

      {/* Import Excel Modal */}
      <BaseModal
        visible={showImportModal}
        onClose={() => { setShowImportModal(false); setImportResult(null); }}
        title="استيراد سجل عمليات من إكسل"
        footer={
          <View style={styles.posImportFooter}>
            <TouchableOpacity
              onPress={() => { setShowImportModal(false); setImportResult(null); }}
              style={[styles.posImportCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.posImportCancelText, { color: colors.textSecondary }]}>إغلاق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Platform.OS === 'web' ? fileInputRef.current?.click() : handleImportMobile()}
              style={[styles.confirmBtn, { backgroundColor: colors.primary, flex: 1 }]}
              activeOpacity={0.8}
              disabled={importing}
            >
              <Upload size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.confirmBtnText}>{importing ? 'جاري...' : 'اختيار ملف'}</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={[styles.posImportInfoBox, { backgroundColor: colors.info + '12' }]}>
          <FileSpreadsheet size={20} color={colors.info} strokeWidth={2} />
          <Text style={[styles.posImportInfoText, { color: colors.textSecondary }]}>
            استيراد مبسّط: رقم الهاتف، اسم الزبون، رقم التواصل، وتاريخ التجديد فقط. باقي التفاصيل ستضيفها يدوياً بعد أول معاملة لكل زبون.
          </Text>
        </View>
        {importResult && (
          <View style={[styles.posImportResultBox, { backgroundColor: importResult.errors.length > 0 ? colors.warning + '15' : colors.success + '15' }]}>
            <View style={styles.posImportResultRow}>
              <Check size={18} color={colors.success} strokeWidth={2} />
              <Text style={[styles.posImportResultText, { color: colors.text }]}>تمت إضافة {importResult.added} معاملة</Text>
            </View>
            {importResult.skipped > 0 && (
              <View style={styles.posImportResultRow}>
                <AlertCircle size={18} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.posImportResultText, { color: colors.text }]}>تم تجاهل {importResult.skipped} صف</Text>
              </View>
            )}
            {importResult.errors.map((err, i) => (
              <Text key={i} style={[styles.posImportErrorText, { color: colors.danger }]}>{err}</Text>
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

      {/* Manual Crop Modal — shown when OCR fails */}
      {showManualCrop && Platform.OS === 'web' && (
        <BaseModal
          visible={showManualCrop}
          onClose={handleCropCancel}
          title="تعليم الأرقام يدوياً"
          footer={
            <View style={styles.deleteFooter}>
              <TouchableOpacity
                onPress={handleCropCancel}
                style={[styles.deleteCancelBtn, { backgroundColor: colors.surfaceAlt }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>إغلاق</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCropConfirm}
                disabled={cropProcessing || (!cropRect || cropRect.w < 10)}
                style={[styles.deleteConfirmBtn, { backgroundColor: cropRect && cropRect.w >= 10 ? colors.primary : colors.border }]}
                activeOpacity={0.8}
              >
                {cropProcessing ? <Loader2 size={18} color="#FFFFFF" strokeWidth={2} /> : <Check size={18} color="#FFFFFF" strokeWidth={2} />}
                <Text style={styles.deleteConfirmText}>استخراج من المنطقة</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={{ gap: 12 }}>
            <View style={[styles.smsPreview, { backgroundColor: colors.info + '12', borderColor: colors.info + '30' }]}>
              <AlertCircle size={14} color={colors.info} strokeWidth={2} />
              <Text style={[styles.smsPreviewText, { color: colors.info }]}>
                قم بتحديد منطقة الأرقام على الصورة بالضغط والسحب، ثم اضغط &quot;استخراج من المنطقة&quot;. إذا لم ينجح، أدخل الرقم يدوياً أدناه.
              </Text>
            </View>
            <View style={{ alignItems: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
              <canvas
                ref={cropCanvasRef}
                onMouseDown={handleCropMouseDown}
                onMouseMove={handleCropMouseMove}
                onMouseUp={handleCropMouseUp}
                onMouseLeave={handleCropMouseUp}
                style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }}
              />
            </View>
            {cropRect && cropRect.w >= 10 && (
              <Text style={{ fontSize: 12, color: colors.success, textAlign: 'center', fontFamily: 'Cairo-Regular' }}>
                تم تحديد منطقة {Math.round(cropRect.w)}×{Math.round(cropRect.h)}
              </Text>
            )}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>أدخل الرقم يدوياً (احتياطي)</Text>
            <TextInput
              value={manualSimInput}
              onChangeText={(v) => setManualSimInput(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="10 أرقام"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
          </View>
        </BaseModal>
      )}

      {/* Cancel Sale Modal */}
      <BaseModal
        visible={!!cancelSale}
        onClose={() => { setCancelSale(null); setCancelDeduction(''); }}
        title="إلغاء العملية"
        footer={
          <View style={styles.deleteFooter}>
            <TouchableOpacity
              onPress={() => { setCancelSale(null); setCancelDeduction(''); }}
              style={[styles.deleteCancelBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>تراجع</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmCancelSale}
              style={[styles.deleteConfirmBtn, { backgroundColor: colors.danger }]}
              activeOpacity={0.8}
            >
              <Ban size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.deleteConfirmText}>تأكيد الإلغاء</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {cancelSale && (
          <View style={{ gap: 12 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Smartphone size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{cancelSale.companyName} - {cancelSale.simNumber}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Users size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{cancelSale.customerName} - {cancelSale.customerPhone}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.danger + '15' }]}>
              <Wallet size={20} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.danger }]}>{formatCurrency(cancelSale.total, settings.currency)}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المبلغ المخصوم عند الإلغاء</Text>
            <TextInput
              value={cancelDeduction}
              onChangeText={setCancelDeduction}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
            <View style={[styles.smsPreview, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
              <AlertCircle size={14} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.smsPreviewText, { color: colors.warning }]}>
                سيتم احتساب المبلغ المخصوم كخسارة وتغيير نوع العملية إلى &quot;ملغاة&quot;. يمكن تعديل المخصوم يدوياً.
              </Text>
            </View>
          </View>
        )}
      </BaseModal>

      {/* Follow-up Status Modal */}
      <BaseModal
        visible={!!followUpSale}
        onClose={() => setFollowUpSale(null)}
        title="حالة المتابعة"
      >
        {followUpSale && (
          <View style={{ gap: 10 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Users size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{followUpSale.customerName} - {followUpSale.customerPhone}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.danger + '15' }]}>
              <BookOpen size={20} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.danger }]}>دين: {formatCurrency(followUpSale.remaining, settings.currency)}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 8 }]}>اختر حالة المتابعة</Text>
            {([
              { key: 'collected' as FollowUpStatus, label: 'تم التحصيل', color: colors.success, icon: <Check size={18} color={colors.success} strokeWidth={2} /> },
              { key: 'contacted' as FollowUpStatus, label: 'تم التواصل', color: colors.info, icon: <PhoneCall size={18} color={colors.info} strokeWidth={2} /> },
              { key: 'reminder_scheduled' as FollowUpStatus, label: 'تذكير لاحق', color: colors.warning, icon: <Bell size={18} color={colors.warning} strokeWidth={2} /> },
              { key: 'not_contacted' as FollowUpStatus, label: 'لم يتم التواصل', color: colors.textMuted, icon: <XCircle size={18} color={colors.textMuted} strokeWidth={2} /> },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setFollowUpStatus(opt.key)}
                style={[styles.pickerRow, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: followUpSale.followUpStatus === opt.key ? opt.color : 'transparent' }]}
                activeOpacity={0.7}
              >
                {opt.icon}
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{opt.label}</Text>
                {followUpSale.followUpStatus === opt.key && <Check size={18} color={opt.color} strokeWidth={2} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </BaseModal>
      {isMobileLayout && !showForm && !editingSaleId && (
        <View style={[styles.floatingSearchBar, { bottom: insets.bottom || 0 }]}>
          <GlobalSearch />
        </View>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  screenContent: { padding: 10, paddingBottom: 140, width: '100%', alignSelf: 'stretch' },
  saleFormPanel: { borderWidth: 1, borderRadius: 4, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  saleFormHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 10, borderBottomWidth: 1 },
  saleFormTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  saleFormClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  readOnlyText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  editBannerText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  editCancelBtn: { padding: 4 },
  newSaleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 11, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  newSaleBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  fieldLabel: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 4, marginTop: 2, textAlign: 'right' },
  fieldInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, minHeight: 38 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fieldValue: { fontSize: 15, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  fieldSubValue: { fontSize: 12, marginTop: 2 },
  placeholder: { fontSize: 14, flex: 1 },
  companyDot: { width: 14, height: 14, borderRadius: 7 },
  boxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  boxItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', minWidth: 100, minHeight: 42 },
  boxItemText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  boxItemSubText: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  noOptionsText: { fontSize: 13, fontFamily: 'Cairo-Regular', paddingVertical: 8 },
  textInput: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, fontSize: 14, fontFamily: 'Cairo-Regular', minHeight: 38, textAlign: 'right' },
  notesInput: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 7, borderWidth: 1, fontSize: 13, fontFamily: 'Cairo-Regular', minHeight: 52, textAlignVertical: 'top', textAlign: 'right' },
  customerNameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  checkboxSubLabel: { fontSize: 11, fontFamily: 'Cairo-Regular', marginTop: 2 },
  checkboxPrice: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  totalCard: { marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, gap: 5 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  totalValue: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1 },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  grandTotalValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  profitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentRow: { flexDirection: 'row', gap: 8 },
  paymentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  paymentText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  calcRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  formRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  calcBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  remainingText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', marginTop: 6 },
  debtBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  debtBannerText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  dateTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  dateTimeText: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  autoReminderCard: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  autoReminderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoReminderTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  autoReminderBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  autoReminderBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  autoReminderDesc: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 6 },
  autoReminderTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  autoReminderTimeInput: { width: 90, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, fontSize: 15, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  durationBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  durationBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  durationPriceBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  barcodeUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  barcodeUploadText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  barcodePasteHint: { fontSize: 11, textAlign: 'center', marginTop: 6, fontFamily: 'Cairo-Regular' },
  barcodeOcrError: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 6, textAlign: 'center' },
  durationPriceText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  collectCard: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, gap: 10 },
  collectInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collectText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  collectActions: { flexDirection: 'row', gap: 8 },
  collectBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  collectBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  smsPreview: { flexDirection: 'row', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  smsPreviewText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Cairo-Regular' },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  formTwoCol: { flexDirection: 'column', gap: 0 },
  formTwoColWeb: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  formCol: { flex: 1, gap: 4 },
  formColWeb: { flex: 1, minWidth: 0 },
  wizardProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  wizardStepItem: { flex: 1, alignItems: 'center', gap: 6 },
  wizardStepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  wizardStepNum: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  wizardStepLabel: { fontSize: 10, fontWeight: '600', fontFamily: 'Cairo-SemiBold', textAlign: 'center' },
  wizardContent: { maxHeight: 520 },
  wizardContentContainer: { padding: 16, paddingBottom: 24 },
  wizardNav: { flexDirection: 'row', padding: 14, borderTopWidth: 1, alignItems: 'center', justifyContent: 'space-between' },
  wizardCancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  wizardCancelText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  wizardBackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  wizardBackText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  wizardNextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14 },
  wizardNextText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  cancelBtnText: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  historyTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 16, marginBottom: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 6 },
  pickerRowText: { fontSize: 15, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  pickerSubText: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  noResults: { textAlign: 'center', paddingVertical: 20, fontSize: 14, fontFamily: 'Cairo-Regular' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Cairo-Regular', padding: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' },
  debtLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  freqBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  reminderOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  reminderOptionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  reminderOptionText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  reminderPreview: { flexDirection: 'row', gap: 8, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  reminderPreviewText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Cairo-Regular' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  successText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  successAmount: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  smsSentBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  smsSentText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  debtRecordedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  debtRecordedText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  deleteFooter: { flexDirection: 'row', gap: 10 },
  deleteCancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', paddingHorizontal: 20 },
  deleteCancelText: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  deleteConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  deleteConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  deleteText: { fontSize: 15, fontFamily: 'Cairo-Regular', lineHeight: 22 },
  simSearchContainer: { marginBottom: 12, position: 'relative', zIndex: 100 },
  simSearchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  simSearchInput: { flex: 1, fontSize: 15, fontFamily: 'Cairo-Regular', padding: 0 },
  simSearchHint: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold', marginTop: 6, marginStart: 4 },
  simSearchResults: { position: 'absolute', top: '100%', left: 0, right: 0, borderRadius: 12, borderWidth: 1, marginTop: 4, maxHeight: 250, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 200 },
  simSearchResultRow: { borderBottomWidth: 1, paddingHorizontal: 4, paddingVertical: 4 },
  simSearchResultMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8 },
  simSearchActionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
  simSearchActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  simSearchActionText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  simSearchResultNum: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  simSearchResultSub: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  simSearchMatchBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)' },
  simSearchMatchText: { fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  simSearchAddNew: { padding: 14, gap: 10 },
  simSearchNoResults: { fontSize: 13, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  simSearchAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10 },
  simSearchAddBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  posImportExportBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  mergedToolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  mergedNewSaleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9 },
  mergedNewSaleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mergedSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, minWidth: 180, flex: 1, flexBasis: 180 },
  mergedSearchInput: { flex: 1, fontSize: 13, fontFamily: 'Cairo-Regular', padding: 0, minHeight: 36 },
  mergedSortGroup: { flexDirection: 'row', gap: 4 },
  mergedSortChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, borderColor: 'transparent' },
  mergedSortText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mergedFilterGroup: { flexDirection: 'row', gap: 4 },
  mergedFilterChip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, borderColor: 'transparent' },
  mergedFilterText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mergedActionsGroup: { flexDirection: 'row', gap: 4 },
  mergedActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, borderColor: 'transparent' },
  mergedActionText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mobileSummaryGrid: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 10 },
  mobileSummaryCard: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 8 },
  mobileSummaryLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  mobileSummaryValue: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 2 },
  mobileActionsWrap: { flexDirection: 'row', gap: 8, marginBottom: 12, position: 'relative', zIndex: 500, elevation: 500 },
  floatingSearchBar: { position: 'absolute', left: 8, right: 8, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 2, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, zIndex: 100 },
  mobileNewSaleBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  mobileNewSaleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mobileMoreWrap: { position: 'relative', zIndex: 300 },
  mobileMoreBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mobileMorePanel: { position: 'absolute', top: '100%', left: 0, width: 200, borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden', elevation: 1000, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, zIndex: 1000 },
  mobileMoreTabs: { flexDirection: 'row', borderBottomWidth: 1 },
  mobileMoreTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  mobileMoreTabText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  mobileMoreBody: { padding: 8, gap: 6 },
  mobileMoreItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  mobileMoreItemText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  mobileMoreChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mobileMoreChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  mobileMoreChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  posImportExportBtn: { flexGrow: 1, flexBasis: 140, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  posImportExportText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', flexShrink: 1, textAlign: 'center' },
  customerFieldsSection: { marginTop: 6, position: 'relative' },
  nameSuggestions: { position: 'absolute', top: '100%', left: 0, right: 0, borderRadius: 12, borderWidth: 1, marginTop: 4, maxHeight: 200, overflow: 'hidden', elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 999 },
  nameSuggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  posImportFooter: { flexDirection: 'row', gap: 10 },
  posImportCancelBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', paddingHorizontal: 20 },
  posImportCancelText: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  posImportInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, marginBottom: 16 },
  posImportInfoText: { fontSize: 13, lineHeight: 20, flex: 1, fontFamily: 'Cairo-Regular' },
  posTemplateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  posTemplateBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  posImportResultBox: { borderRadius: 12, padding: 14, gap: 8 },
  posImportResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posImportResultText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  posImportErrorText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  compactChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  compactChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', minHeight: 34 },
  compactChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  compactChipSub: { fontSize: 10, fontFamily: 'Cairo-Regular' },
  compactDurationBtn: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  compactDurationText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  dualFieldRow: { flexDirection: 'row', gap: 10 },
  dualFieldItem: { flex: 1 },
  totalDualRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalDualItem: { flex: 1, alignItems: 'center' },
  saleFormPanelFixed: { width: '100%', maxWidth: 1000, minHeight: 640, maxHeight: '92%', borderWidth: 1, borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8, alignSelf: 'center', marginVertical: 10 },
  saleFormPanelMobile: { width: '100%', maxWidth: '100%', height: 'auto', minHeight: 0, borderRadius: 0, marginVertical: 0, alignSelf: 'stretch', overflow: 'hidden' },
  saleFormHeaderFixed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, paddingHorizontal: 14, borderBottomWidth: 1 },
  saleFormTitleFixed: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  form3ColBody: { flexDirection: 'column', width: '100%', flexGrow: 0, minHeight: 0, paddingHorizontal: 12, paddingVertical: 8 },
  form3ColBodyDesktop: { flexDirection: 'row', flex: 1, minHeight: 480, maxHeight: '82%', paddingHorizontal: 8, paddingVertical: 6 },
  form3ColBodyMobile: { flexDirection: 'column', width: '100%', alignSelf: 'stretch', flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, height: 'auto', paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  form3ColItem: { flex: 0, width: '100%', paddingHorizontal: 0, paddingVertical: 16, borderStartWidth: 0, borderBottomWidth: 1, gap: 4 },
  form3ColItemDesktop: { flex: 1, width: undefined, paddingHorizontal: 8, paddingVertical: 4, borderStartWidth: 1, borderBottomWidth: 0 },
  form3ColItemDesktopWide: { flex: 1.5, width: undefined, paddingHorizontal: 10, paddingVertical: 4, borderStartWidth: 1, borderBottomWidth: 0 },
  form3ColItemMobile: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch', width: '100%', minHeight: 0, height: 'auto', position: 'relative', paddingHorizontal: 14, paddingVertical: 16, borderStartWidth: 0, borderBottomWidth: 0, borderWidth: 1, borderRadius: 16, gap: 6 },
  colSectionTitle: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 6, textAlign: 'right', opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  mobileFormSection: { shadowColor: '#0F766E', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  mobileColSectionTitle: { fontSize: 15, opacity: 1, marginBottom: 10, letterSpacing: 0 },

  fieldLabelCompact: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 3, marginTop: 2, textAlign: 'right' },
  textInput3Col: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, fontSize: 13, fontFamily: 'Cairo-Regular', minHeight: 32, textAlign: 'right' },
  mobileTextInput3Col: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, fontSize: 14, minHeight: 40 },
  formActionsMobile: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10 },
  fieldInput3Col: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, minHeight: 32 },
  fieldValue3Col: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  fieldSubValue3Col: { fontSize: 10, marginTop: 1 },
  placeholder3Col: { fontSize: 13, flex: 1 },
  iconBtn3Col: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  durationGrid3Col: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  durationBtn3Col: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: 'transparent', minWidth: 60, alignItems: 'center' },
  durationBtn3ColText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  paymentRow3Col: { flexDirection: 'row', gap: 4, marginTop: 2 },
  paymentRowMobile: { flexWrap: 'wrap', width: '100%' },
  paymentBtn3Col: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: 'transparent' },
  mobilePaymentBtn3Col: { minWidth: 0, paddingVertical: 10, borderRadius: 10 },
  paymentText3Col: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  walletChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  walletChipText: { fontSize: 10, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  balanceBtn3Col: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, borderWidth: 1, marginTop: 4 },
  calcBtn3Col: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  totalCard3Col: { padding: 8, borderRadius: 8, borderWidth: 1, gap: 4 },
  totalLabel3Col: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  totalValue3Col: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  grandTotalLabel3Col: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  grandTotalValue3Col: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  miniInfoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, marginTop: 4 },
  miniInfoText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  reminderToggleRow: { flexDirection: 'row', gap: 4 },
  reminderToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 7, borderWidth: 1, borderColor: 'transparent' },
  reminderToggleText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  freqRow3Col: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  freqBtn3Col: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
  freqBtnText3Col: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  notesInput3Col: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, fontSize: 12, fontFamily: 'Cairo-Regular', minHeight: 40, textAlignVertical: 'top', textAlign: 'right' },
  dateTimeRow3Col: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  dateTimeText3Col: { fontSize: 10, fontFamily: 'Cairo-Regular' },
  smsPreview3Col: { flexDirection: 'row', gap: 4, marginTop: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  smsPreviewText3Col: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Cairo-Regular' },
  formActionsFixed: { flexDirection: 'row', gap: 8, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderTopWidth: 1 },
  wizardCancelBtn3Col: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  wizardCancelText3Col: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  wizardNextBtn3Col: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  wizardNextText3Col: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  barcodeUploadBtn3Col: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  barcodeUploadText3Col: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
});
