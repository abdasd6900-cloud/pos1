import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Platform, Linking } from 'react-native';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ShoppingCart, Search, X, Plus, Minus, Trash2, Check,
  Wallet, CreditCard, BookOpen, Users, Calculator, Clock,
  Package, Tag, User, Phone, AlertCircle, Barcode,
  Percent, Save, Receipt as ReceiptIcon, ChevronDown,
  Download, Upload, FileSpreadsheet, ChevronLeft, ChevronRight,
  TrendingUp, ShoppingCart as CartIcon, DollarSign, ListFilter,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, normalizePhoneNumber } from '@/lib/format';
import type { Product, Customer, CartItem, PaymentMethod, Transaction } from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { CashCalculator } from '@/components/CashCalculator';
import { ReceiptPreview } from '@/components/ReceiptPreview';
import { CustomerProfile } from '@/components/CustomerProfile';
import { exportXlsx, pickExcelFile, readPickedExcel } from '@/lib/xlsx-export';
import * as XLSX from 'xlsx';

export default function RetailPOSScreen() {
  const {
    settings, products, customers, transactions,
    addTransaction, addCustomer, recordPayment,
    activeShift, currentStaff, readOnlyMode,
    logOutboundSms,
  } = useApp();
  const { colors } = useTheme();

  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [paidAmount, setPaidAmount] = useState('');
  const [showCashCalc, setShowCashCalc] = useState(false);
  const [showBalanceConfirm, setShowBalanceConfirm] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTxn, setLastTxn] = useState<Transaction | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [quickProductName, setQuickProductName] = useState('');
  const [quickProductPrice, setQuickProductPrice] = useState('');
  const [quickProductCost, setQuickProductCost] = useState('');
  const [editingCartItem, setEditingCartItem] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [txnSearch, setTxnSearch] = useState('');
  const [txnSort, setTxnSort] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [txnPageSize, setTxnPageSize] = useState(3);
  const [txnPage, setTxnPage] = useState(0);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [importingTxn, setImportingTxn] = useState(false);
  const [txnImportResult, setTxnImportResult] = useState<string | null>(null);
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.filter((p) => p.stock > 0).slice(0, 50);
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.localBarcode.includes(q) ||
      p.category.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [products, searchQuery]);

  const customerNameSuggestions = useMemo(() => {
    if (!customerName.trim()) return [];
    const q = customerName.trim().toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [customers, customerName]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.trim().toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  const sortedTxns = useMemo(() => {
    let list = transactions.filter((t) => t.type === 'sale');
    const q = txnSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        t.customerName.toLowerCase().includes(q) ||
        String(t.id).includes(q) ||
        t.items.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    switch (txnSort) {
      case 'oldest': list = [...list].sort((a, b) => a.createdAt - b.createdAt); break;
      case 'highest': list = [...list].sort((a, b) => b.total - a.total); break;
      case 'lowest': list = [...list].sort((a, b) => a.total - b.total); break;
      default: list = [...list].sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [transactions, txnSearch, txnSort]);

  const txnPageCount = Math.ceil(sortedTxns.length / txnPageSize);
  const pagedTxns = useMemo(() => {
    const start = txnPage * txnPageSize;
    return sortedTxns.slice(start, start + txnPageSize);
  }, [sortedTxns, txnPage, txnPageSize]);

  const salesTxns = transactions.filter((t) => t.type === 'sale');
  const todaySalesTotal = salesTxns.filter((t) => { const d = new Date(t.createdAt); const n = new Date(); return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).reduce((s, t) => s + t.total, 0);
  const todayTxnCount = salesTxns.filter((t) => { const d = new Date(t.createdAt); const n = new Date(); return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length;
  const avgSale = salesTxns.length > 0 ? salesTxns.reduce((s, t) => s + t.total, 0) / salesTxns.length : 0;

  const handleExportTxns = useCallback(async () => {
    setShowActionsMenu(false);
    const data = salesTxns.map((t) => ({
      'رقم': t.id,
      'التاريخ': new Date(t.createdAt).toLocaleString('ar'),
      'العميل': t.customerName,
      'عدد الأصناف': t.items.length,
      'المجموع': t.total,
      'المدفوع': t.paid,
      'المتبقي': t.remaining,
      'طريقة الدفع': t.paymentMethod,
      'العملة': t.currencyCode,
      'ملاحظات': t.note,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المعاملات');
    await exportXlsx(wb, `المعاملات_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [salesTxns]);

  const handleDownloadTemplate = useCallback(async () => {
    setShowActionsMenu(false);
    const ws = XLSX.utils.json_to_sheet([{ 'التاريخ': '', 'العميل': '', 'المجموع': 0, 'المدفوع': 0, 'المتبقي': 0, 'طريقة الدفع': 'cash', 'العملة': 'SAR', 'ملاحظات': '' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'القالب');
    await exportXlsx(wb, 'قالب_المعاملات.xlsx');
  }, []);

  const handleImportTxns = useCallback(async () => {
    setShowActionsMenu(false);
    setImportingTxn(true);
    setTxnImportResult(null);
    const file = await pickExcelFile();
    if (!file) { setImportingTxn(false); return; }
    try {
      const wb = await readPickedExcel(file);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      let added = 0;
      for (const row of rows) {
        const dateStr = String(row['التاريخ'] ?? row['date'] ?? '').trim();
        const customerName = String(row['العميل'] ?? row['customer'] ?? '').trim();
        const totalNum = parseFloat(String(row['المجموع'] ?? row['total'] ?? '0').replace(/[^\d.-]/g, '')) || 0;
        const paidNum = parseFloat(String(row['المدفوع'] ?? row['paid'] ?? '0').replace(/[^\d.-]/g, '')) || 0;
        if (!customerName || totalNum <= 0) continue;
        addTransaction({
          type: 'sale',
          customerId: null,
          customerName,
          supplierId: null,
          supplierName: '',
          items: [],
          total: totalNum,
          paid: paidNum,
          remaining: Math.max(0, totalNum - paidNum),
          paymentMethod: String(row['طريقة الدفع'] ?? row['payment'] ?? 'cash') as PaymentMethod,
          splitPayment: null,
          debtChange: 0,
          loyaltyEarned: 0,
          note: String(row['ملاحظات'] ?? row['notes'] ?? ''),
          smsSent: false,
          returnReason: '',
          originalTxnId: null,
          currencyCode: String(row['العملة'] ?? row['currency'] ?? (settings.defaultCurrencyCode || 'SAR')),
          shiftId: activeShift?.id ?? null,
          staffId: currentStaff?.id ?? null,
          staffName: currentStaff?.name ?? '',
          promotionApplied: null,
          discountAmount: 0,
          walletType: null,
        });
        added++;
      }
      setTxnImportResult(`تم استيراد ${added} معاملة`);
    } catch {
      setTxnImportResult('فشل قراءة الملف');
    }
    setImportingTxn(false);
    setTimeout(() => setTxnImportResult(null), 5000);
  }, [addTransaction, settings, activeShift, currentStaff]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const discountAmount = useMemo(() => Math.round(subtotal * discountPercent) / 100, [subtotal, discountPercent]);
  const taxAmount = useMemo(() => Math.round((subtotal - discountAmount) * settings.taxRate) / 100, [subtotal, discountAmount, settings.taxRate]);
  const total = useMemo(() => subtotal - discountAmount + taxAmount, [subtotal, discountAmount, taxAmount]);

  const paid = parseFloat(paidAmount) || (paymentMethod === 'debt' ? 0 : total);
  const remaining = Math.max(0, total - paid);

  const addToCart = useCallback((product: Product) => {
    if (product.stock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        price: product.price,
        cost: product.cost,
        quantity: 1,
        unit: product.unit,
      }];
    });
  }, []);

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const product = products.find((p) => p.id === productId);
      return prev.map((item) => {
        if (item.productId !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (product && newQty > product.stock) return item;
        return { ...item, quantity: newQty };
      });
    });
  };

  const setCartQty = (productId: string, qty: number) => {
    setCart((prev) => prev.map((item) =>
      item.productId === productId ? { ...item, quantity: Math.max(1, qty) } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
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

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setShowCustomerPicker(false);
    setCustomerSearch('');
  };

  const handleBarcodeSearch = () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.focus();
    }
  };

  const canCheckout = cart.length > 0 && (!readOnlyMode);

  const resetSale = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
    setPaymentMethod('wallet');
    setPaidAmount('');
    setDiscountPercent(0);
    setNotes('');
    setSearchQuery('');
  };

  const handleCheckout = useCallback(() => {
    if (!canCheckout || cart.length === 0) return;

    let customerId = selectedCustomer?.id ?? null;
    if (!customerId && customerName.trim() && customerPhone.trim()) {
      const normalizedPhone = normalizePhoneNumber(customerPhone.trim());
      const existing = customers.find((c) => c.phone === normalizedPhone);
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

    const debtChange = remaining > 0 && customerId ? remaining : 0;

    const effectivePaid = paymentMethod === 'balance' && selectedCustomer
      ? Math.min(total, selectedCustomer.balance)
      : paid;
    const effectiveRemaining = paymentMethod === 'balance' && selectedCustomer
      ? Math.max(0, total - effectivePaid)
      : remaining;

    const balanceDebtChange = paymentMethod === 'balance' && effectiveRemaining > 0 && customerId ? effectiveRemaining : 0;

    const txn = addTransaction({
      type: 'sale',
      customerId,
      customerName: customerName.trim() || 'عميل نقدي',
      supplierId: null,
      supplierName: '',
      items: cart,
      total,
      paid: effectivePaid,
      remaining: effectiveRemaining,
      paymentMethod,
      splitPayment: null,
      debtChange: paymentMethod === 'balance' ? balanceDebtChange : debtChange,
      loyaltyEarned: settings.enableLoyalty && customerId ? Math.floor(total * settings.loyaltyRate) : 0,
      note: notes.trim(),
      smsSent: settings.enableSms && !!customerId,
      returnReason: '',
      originalTxnId: null,
      currencyCode: settings.defaultCurrencyCode || 'SAR',
      shiftId: activeShift?.id ?? null,
      staffId: currentStaff?.id ?? null,
      staffName: currentStaff?.name ?? '',
      promotionApplied: null,
      discountAmount,
      walletType: null,
    });

    if (settings.enableSms && customerId && customerPhone.trim()) {
      void logOutboundSms(normalizePhoneNumber(customerPhone.trim()), `عزيزي ${customerName.trim()}، تمت عملية الشراء بنجاح. المبلغ: ${formatCurrency(total, settings.currency)}${debtChange > 0 ? `\nالمتبقي: ${formatCurrency(debtChange, settings.currency)}` : ''}`, 'sms');
    }

    setLastTxn(txn);
    setShowSuccess(true);
    resetSale();
  }, [canCheckout, cart, selectedCustomer, customerName, customerPhone, paymentMethod, total, paid, remaining, discountAmount, notes, settings, activeShift, currentStaff, addTransaction, addCustomer]);

  const sendSms = (phone: string, message: string) => {
    void logOutboundSms(phone, message, 'sms');
  };

  const isWeb = Platform.OS === 'web';

  const readOnlyBanner = readOnlyMode ? (
    <View style={[styles.readOnlyBanner, { backgroundColor: colors.danger + '15' }]}>
      <Text style={[styles.readOnlyText, { color: colors.danger }]}>الاشتراك منتهي - لا يمكن إجراء مبيعات</Text>
    </View>
  ) : null;

  const productSearchBar = (
    <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Search size={22} color={colors.textMuted} strokeWidth={2} />
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="ابحث بالاسم أو الباركود أو الفئة..."
        placeholderTextColor={colors.textMuted}
        style={[styles.searchInput, { color: colors.text }]}
        autoFocus={!isWeb}
      />
      {searchQuery.trim() ? (
        <TouchableOpacity onPress={() => setSearchQuery('')}>
          <X size={20} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleBarcodeSearch}>
          <Barcode size={20} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </View>
  );

  const productGridContent = filteredProducts.length > 0 ? (
    <View style={[styles.productGrid, isWeb && styles.productGridWeb]}>
      {filteredProducts.map((product) => (
        <TouchableOpacity
          key={product.id}
          onPress={() => addToCart(product)}
          disabled={product.stock <= 0}
          style={[
            styles.productCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: product.stock <= 0 ? 0.4 : 1 },
            isWeb && styles.productCardWeb,
          ]}
          activeOpacity={0.7}
        >
          <View style={[styles.productIcon, { backgroundColor: colors.primary + '15' }]}>
            <Package size={18} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
          <Text style={[styles.productPrice, { color: colors.primary }]}>{formatCurrency(product.price, settings.currency)}</Text>
          <Text style={[styles.productStock, { color: product.stock <= product.minStock ? colors.danger : colors.textMuted }]}>
            المتوفر: {product.stock} {product.unit}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : (
    <View style={styles.emptyProducts}>
      <Package size={40} color={colors.textMuted} strokeWidth={2} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        {searchQuery.trim() ? 'لا توجد منتجات مطابقة' : 'لا توجد منتجات - أضف منتجات من شاشة المخزون'}
      </Text>
    </View>
  );

  const cartContent = cart.length > 0 ? (
    <View style={[styles.cartSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cartHeader}>
        <ShoppingCart size={20} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.cartTitle, { color: colors.text }]}>السلة ({cart.length})</Text>
        <TouchableOpacity onPress={() => setCart([])} style={styles.clearCartBtn}>
          <Trash2 size={16} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.clearCartText, { color: colors.danger }]}>إفراغ</Text>
        </TouchableOpacity>
      </View>

      {cart.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return (
          <View key={item.productId} style={[styles.cartItem, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cartItemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.cartItemPrice, { color: colors.textMuted }]}>
                {formatCurrency(item.price, settings.currency)} / {item.unit}
              </Text>
            </View>
            <View style={styles.qtyControl}>
              <TouchableOpacity onPress={() => updateCartQty(item.productId, -1)} style={[styles.qtyBtn, { backgroundColor: colors.surfaceAlt }]}>
                <Minus size={14} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
              <TextInput
                value={item.quantity.toString()}
                onChangeText={(v) => setCartQty(item.productId, parseInt(v) || 1)}
                keyboardType="numeric"
                style={[styles.qtyInput, { color: colors.text }]}
              />
              <TouchableOpacity onPress={() => updateCartQty(item.productId, 1)} style={[styles.qtyBtn, { backgroundColor: colors.surfaceAlt }]}>
                <Plus size={14} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.cartItemTotal, { color: colors.text }]}>
              {formatCurrency(item.price * item.quantity, settings.currency)}
            </Text>
            <TouchableOpacity onPress={() => removeFromCart(item.productId)} style={styles.removeBtn}>
              <X size={16} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        );
      })}

      {settings.enableVipDiscount && (
        <View style={[styles.discountRow, { borderTopColor: colors.border }]}>
          <Percent size={16} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.discountLabel, { color: colors.textSecondary }]}>خصم %</Text>
          <View style={[styles.discountInput, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              value={discountPercent.toString()}
              onChangeText={(v) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(v) || 0)))}
              keyboardType="numeric"
              style={[styles.discountTextInput, { color: colors.text }]}
            />
          </View>
          <Text style={[styles.discountAmount, { color: colors.accent }]}>
            -{formatCurrency(discountAmount, settings.currency)}
          </Text>
        </View>
      )}

      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>المجموع الفرعي</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>{formatCurrency(subtotal, settings.currency)}</Text>
        </View>
        {discountAmount > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>الخصم</Text>
            <Text style={[styles.totalValue, { color: colors.accent }]}>-{formatCurrency(discountAmount, settings.currency)}</Text>
          </View>
        )}
        {settings.taxRate > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>ضريبة {settings.taxRate}%</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>{formatCurrency(taxAmount, settings.currency)}</Text>
          </View>
        )}
        <View style={[styles.grandTotalRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.grandTotalLabel, { color: colors.text }]}>الإجمالي</Text>
          <Text style={[styles.grandTotalValue, { color: colors.primary }]}>{formatCurrency(total, settings.currency)}</Text>
        </View>
      </View>
    </View>
  ) : null;

  const customerContent = cart.length > 0 ? (
    <>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>العميل (اختياري)</Text>
      <View style={styles.customerRow}>
        <View style={{ flex: 1, position: 'relative' }}>
          <TextInput
            value={customerName}
            onChangeText={handleCustomerNameChange}
            placeholder="ابحث بالاسم أو اترك فارغ لعميل نقدي..."
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            onFocus={() => setShowNameSuggestions(true)}
            onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
          />
          {showNameSuggestions && customerNameSuggestions.length > 0 && (
            <View style={[styles.nameSuggestions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {customerNameSuggestions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => { handleSelectCustomer(c); setShowNameSuggestions(false); }}
                  style={[styles.nameSuggestionRow, { borderBottomColor: colors.border }]}
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
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowCustomerPicker(true)}
          style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Users size={20} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {customerName.trim() && (
        <TextInput
          value={customerPhone}
          onChangeText={(value) => setCustomerPhone(normalizePhoneNumber(value))}
          placeholder="رقم الجوال"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, marginTop: 8 }]}
        />
      )}

      {selectedCustomer && selectedCustomer.debt > 0 && (
        <View style={[styles.debtCard, { backgroundColor: colors.warning + '12', borderColor: colors.warning + '30' }]}>
          <BookOpen size={16} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.debtCardText, { color: colors.warning }]}>
            دين حالي: {formatCurrency(selectedCustomer.debt, settings.currency)}
          </Text>
          <TouchableOpacity
            onPress={() => recordPayment(selectedCustomer.id, selectedCustomer.debt)}
            style={[styles.collectBtn, { backgroundColor: colors.success }]}
            activeOpacity={0.7}
          >
            <Text style={styles.collectBtnText}>تحصيل</Text>
          </TouchableOpacity>
        </View>
      )}

      {selectedCustomer && selectedCustomer.balance > 0 && (
        <View style={[styles.balanceCardPos, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
          <Wallet size={16} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.balanceCardPosText, { color: colors.primary }]}>
            رصيد مسبق: {formatCurrency(selectedCustomer.balance, settings.currency)}
          </Text>
        </View>
      )}
    </>
  ) : null;

  const paymentContent = cart.length > 0 ? (
    <>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>طريقة الدفع</Text>
      <View style={styles.paymentRow}>
        <TouchableOpacity
          onPress={() => { setPaymentMethod('wallet'); setPaidAmount(''); }}
          style={[styles.paymentBtn, paymentMethod === 'wallet' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <CreditCard size={18} color={paymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.paymentText, { color: paymentMethod === 'wallet' ? '#FFFFFF' : colors.textSecondary }]}>تطبيق</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setPaymentMethod('cash'); setPaidAmount(''); }}
          style={[styles.paymentBtn, paymentMethod === 'cash' ? { backgroundColor: colors.success } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Wallet size={18} color={paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.paymentText, { color: paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary }]}>نقدي</Text>
        </TouchableOpacity>
        {selectedCustomer && selectedCustomer.balance > 0 && (
          <TouchableOpacity
            onPress={() => { setPaymentMethod('balance'); setPaidAmount(total.toFixed(2)); }}
            style={[styles.paymentBtn, paymentMethod === 'balance' ? { backgroundColor: colors.accent } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Wallet size={18} color={paymentMethod === 'balance' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.paymentText, { color: paymentMethod === 'balance' ? '#FFFFFF' : colors.textSecondary }]}>من الرصيد</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => { setPaymentMethod('debt'); setPaidAmount('0'); }}
          style={[styles.paymentBtn, paymentMethod === 'debt' ? { backgroundColor: colors.danger } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <BookOpen size={18} color={paymentMethod === 'debt' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.paymentText, { color: paymentMethod === 'debt' ? '#FFFFFF' : colors.textSecondary }]}>دين</Text>
        </TouchableOpacity>
      </View>

      {(paymentMethod === 'cash' || paymentMethod === 'wallet') && (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المبلغ المدفوع</Text>
          <View style={styles.calcRow}>
            <TextInput
              value={paidAmount}
              onChangeText={setPaidAmount}
              placeholder={total.toFixed(2)}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border, flex: 1 }]}
            />
            <TouchableOpacity
              onPress={() => setShowCashCalc(true)}
              style={[styles.calcBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.7}
            >
              <Calculator size={18} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {paid >= total && total > 0 ? (
            <View style={[styles.payStatusPill, { backgroundColor: colors.success + '15' }]}>
              <Check size={14} color={colors.success} strokeWidth={2} />
              <Text style={[styles.payStatusText, { color: colors.success }]}>كلي — مدفوع بالكامل</Text>
            </View>
          ) : paid > 0 && paid < total ? (
            <View style={[styles.payStatusPill, { backgroundColor: colors.warning + '15' }]}>
              <AlertCircle size={14} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.payStatusText, { color: colors.warning }]}>
                جزئي — مدفوع {formatCurrency(paid, settings.currency)} • المتبقي دين: {formatCurrency(remaining, settings.currency)}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {paymentMethod === 'balance' && selectedCustomer && (
        <View style={[styles.balanceConfirmBanner, { backgroundColor: colors.accent + '12' }]}>
          <Wallet size={16} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.balanceConfirmText, { color: colors.accent }]}>
            {`سيتم خصم ${formatCurrency(Math.min(total, selectedCustomer.balance), settings.currency)} من رصيد العميل (المتاح: ${formatCurrency(selectedCustomer.balance, settings.currency)})`}
          </Text>
        </View>
      )}

      {paymentMethod === 'balance' && selectedCustomer && total > selectedCustomer.balance && (
        <View style={[styles.balanceInsufficientBanner, { backgroundColor: colors.warning + '12' }]}>
          <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.balanceInsufficientText, { color: colors.warning }]}>
            الرصيد لا يكفي! المتبقي {formatCurrency(total - selectedCustomer.balance, settings.currency)} سيُسجل كدين
          </Text>
        </View>
      )}

      {paymentMethod === 'debt' && (
        <View style={[styles.debtBanner, { backgroundColor: colors.danger + '12' }]}>
          <BookOpen size={16} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.debtBannerText, { color: colors.danger }]}>
            سيتم تسجيل {formatCurrency(total, settings.currency)} كدين{selectedCustomer ? ` على ${selectedCustomer.name}` : ''}
          </Text>
        </View>
      )}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>ملاحظات (اختياري)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="أضف ملاحظات للفاتورة..."
        placeholderTextColor={colors.textMuted}
        multiline
        style={[styles.notesInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
      />

      <TouchableOpacity
        onPress={() => {
          if (paymentMethod === 'balance' && selectedCustomer) {
            setShowBalanceConfirm(true);
          } else {
            handleCheckout();
          }
        }}
        disabled={!canCheckout}
        style={[styles.checkoutBtn, { backgroundColor: canCheckout ? colors.primary : colors.border }]}
        activeOpacity={0.8}
      >
        <Check size={22} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.checkoutBtnText}>إتمام البيع — {formatCurrency(total, settings.currency)}</Text>
      </TouchableOpacity>
    </>
  ) : null;

  const summaryCards = (
    <View style={styles.summaryCards}>
      <View style={[styles.summaryCard, { backgroundColor: colors.primary + '12' }]}>
        <TrendingUp size={16} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(todaySalesTotal, settings.currency)}</Text>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>مبيعات اليوم</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: colors.success + '12' }]}>
        <CartIcon size={16} color={colors.success} strokeWidth={2} />
        <Text style={[styles.summaryValue, { color: colors.success }]}>{todayTxnCount}</Text>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>معاملات اليوم</Text>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: colors.accent + '12' }]}>
        <DollarSign size={16} color={colors.accent} strokeWidth={2} />
        <Text style={[styles.summaryValue, { color: colors.accent }]}>{formatCurrency(avgSale, settings.currency)}</Text>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>متوسط البيع</Text>
      </View>
    </View>
  );

  const actionsRow = (
    <View style={styles.actionsRow}>
      <TouchableOpacity
        onPress={() => { setCart([]); setSearchQuery(''); }}
        style={[styles.newTxnBtn, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
      >
        <Plus size={18} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.newTxnBtnText}>معاملة جديدة</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          onPress={() => setShowActionsMenu((v) => !v)}
          style={[styles.importBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Download size={16} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.importBtnText, { color: colors.primary }]}>استيراد</Text>
          <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        {showActionsMenu && (
          <View style={[styles.actionsMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity onPress={handleImportTxns} style={styles.actionsMenuItem} activeOpacity={0.7}>
              <Upload size={16} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.actionsMenuText, { color: colors.text }]}>استيراد</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportTxns} style={styles.actionsMenuItem} activeOpacity={0.7}>
              <Download size={16} color={colors.success} strokeWidth={2} />
              <Text style={[styles.actionsMenuText, { color: colors.text }]}>تصدير</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDownloadTemplate} style={styles.actionsMenuItem} activeOpacity={0.7}>
              <FileSpreadsheet size={16} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.actionsMenuText, { color: colors.text }]}>قالب</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  const txnSortButtons = (
    <View style={styles.txnSortRow}>
      {([
        { key: 'newest', label: 'الأحدث' },
        { key: 'oldest', label: 'الأقدم' },
        { key: 'highest', label: 'الأعلى' },
        { key: 'lowest', label: 'الأقل' },
      ] as const).map((s) => (
        <TouchableOpacity
          key={s.key}
          onPress={() => { setTxnSort(s.key); setTxnPage(0); }}
          style={[styles.sortChip, txnSort === s.key ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.sortChipText, { color: txnSort === s.key ? '#FFFFFF' : colors.textSecondary }]}>{s.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => {
          const sizes = [3, 5, 10, 9999];
          const idx = sizes.indexOf(txnPageSize);
          const next = sizes[(idx + 1) % sizes.length];
          setTxnPageSize(next);
          setTxnPage(0);
        }}
        style={[styles.sortChip, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '30' }]}
        activeOpacity={0.7}
      >
        <ListFilter size={12} color={colors.accent} strokeWidth={2} />
        <Text style={[styles.sortChipText, { color: colors.accent }]}>
          {txnPageSize >= 9999 ? 'الكل' : `${txnPageSize}`}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const txnSearchBar = (
    <View style={[styles.txnSearchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Search size={16} color={colors.textMuted} strokeWidth={2} />
      <TextInput
        value={txnSearch}
        onChangeText={(v) => { setTxnSearch(v); setTxnPage(0); }}
        placeholder="بحث في المعاملات..."
        placeholderTextColor={colors.textMuted}
        style={[styles.txnSearchInput, { color: colors.text }]}
      />
      {txnSearch.trim() ? (
        <TouchableOpacity onPress={() => setTxnSearch('')}>
          <X size={16} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const recentTransactionsContent = cart.length === 0 && transactions.length > 0 ? (
    <>
      <Text style={[styles.historyTitle, { color: colors.text }]}>سجل المعاملات</Text>
      {txnImportResult && (
        <View style={[styles.txnImportBanner, { backgroundColor: colors.success + '15' }]}>
          <Text style={[styles.txnImportBannerText, { color: colors.success }]}>{txnImportResult}</Text>
        </View>
      )}
      {pagedTxns.map((txn) => (
        <TouchableOpacity
          key={txn.id}
          onPress={() => { setSelectedTxn(txn); setShowTxnModal(true); }}
          style={[styles.txnRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <View style={[styles.txnIcon, { backgroundColor: colors.success + '15' }]}>
            <ReceiptIcon size={16} color={colors.success} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                const c = customers.find((cu) => cu.id === txn.customerId);
                if (c) setProfileCustomer(c);
              }}
              disabled={!txn.customerId || !customers.some((cu) => cu.id === txn.customerId)}
              activeOpacity={0.6}
            >
              <Text style={[styles.txnCustomer, { color: colors.text }]} numberOfLines={1}>{txn.customerName}</Text>
            </TouchableOpacity>
            <Text style={[styles.txnItems, { color: colors.textMuted }]}>{txn.items.length} صنف — {new Date(txn.createdAt).toLocaleString('ar')}</Text>
          </View>
          <Text style={[styles.txnAmount, { color: colors.primary }]}>{formatCurrency(txn.total, settings.currency)}</Text>
        </TouchableOpacity>
      ))}
      {txnPageCount > 1 && (
        <View style={styles.paginationRow}>
          <TouchableOpacity
            onPress={() => setTxnPage((p) => Math.max(0, p - 1))}
            disabled={txnPage === 0}
            style={[styles.pageBtn, { backgroundColor: txnPage === 0 ? colors.surfaceAlt : colors.primary }]}
            activeOpacity={0.7}
          >
            <ChevronRight size={18} color={txnPage === 0 ? colors.textMuted : '#FFFFFF'} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={[styles.pageText, { color: colors.textSecondary }]}>
            {txnPage + 1} / {txnPageCount}
          </Text>
          <TouchableOpacity
            onPress={() => setTxnPage((p) => Math.min(txnPageCount - 1, p + 1))}
            disabled={txnPage >= txnPageCount - 1}
            style={[styles.pageBtn, { backgroundColor: txnPage >= txnPageCount - 1 ? colors.surfaceAlt : colors.primary }]}
            activeOpacity={0.7}
          >
            <ChevronLeft size={18} color={txnPage >= txnPageCount - 1 ? colors.textMuted : '#FFFFFF'} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}
    </>
  ) : null;

  const modals = (
    <>
      <BaseModal visible={showCustomerPicker} onClose={() => { setShowCustomerPicker(false); setCustomerSearch(''); }} title="اختر العميل">
        <View style={styles.searchRow}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="ابحث بالاسم أو الرقم..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInputModal, { color: colors.text }]}
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
            <Text style={[styles.noResults, { color: colors.textMuted }]}>لا يوجد عملاء</Text>
          )}
        </ScrollView>
      </BaseModal>

      <BaseModal
        visible={showBalanceConfirm}
        onClose={() => setShowBalanceConfirm(false)}
        title="تأكيد الدفع من الرصيد"
        footer={
          <View style={styles.successFooter}>
            <TouchableOpacity
              onPress={() => setShowBalanceConfirm(false)}
              style={[styles.receiptBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.receiptBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setShowBalanceConfirm(false); handleCheckout(); }}
              style={[styles.confirmBtn, { backgroundColor: colors.accent }]}
              activeOpacity={0.8}
            >
              <Check size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.confirmBtnText}>تأكيد الخصم</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {selectedCustomer && (
          <View style={{ gap: 12 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <User size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{selectedCustomer.name}</Text>
            </View>
            <View style={[styles.balanceConfirmDetailRow, { backgroundColor: colors.primary + '10' }]}>
              <Text style={[styles.balanceConfirmDetailLabel, { color: colors.textSecondary }]}>الرصيد المتاح</Text>
              <Text style={[styles.balanceConfirmDetailValue, { color: colors.primary }]}>{formatCurrency(selectedCustomer.balance, settings.currency)}</Text>
            </View>
            <View style={[styles.balanceConfirmDetailRow, { backgroundColor: colors.accent + '10' }]}>
              <Text style={[styles.balanceConfirmDetailLabel, { color: colors.textSecondary }]}>مبلغ الشراء</Text>
              <Text style={[styles.balanceConfirmDetailValue, { color: colors.accent }]}>{formatCurrency(total, settings.currency)}</Text>
            </View>
            <View style={[styles.balanceConfirmDetailRow, { backgroundColor: total > selectedCustomer.balance ? colors.warning + '10' : colors.success + '10' }]}>
              <Text style={[styles.balanceConfirmDetailLabel, { color: colors.textSecondary }]}>
                {total > selectedCustomer.balance ? 'الرصيد المتبقي بعد الخصم' : 'الرصيد بعد الخصم'}
              </Text>
              <Text style={[styles.balanceConfirmDetailValue, { color: total > selectedCustomer.balance ? colors.warning : colors.success }]}>
                {formatCurrency(Math.max(0, selectedCustomer.balance - total), settings.currency)}
              </Text>
            </View>
            {total > selectedCustomer.balance && (
              <View style={[styles.balanceInsufficientBanner, { backgroundColor: colors.warning + '12' }]}>
                <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.balanceInsufficientText, { color: colors.warning }]}>
                  الرصيد لا يكفي! سيتم خصم {formatCurrency(selectedCustomer.balance, settings.currency)} من الرصيد و تسجيل {formatCurrency(total - selectedCustomer.balance, settings.currency)} كدين
                </Text>
              </View>
            )}
          </View>
        )}
      </BaseModal>

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

      <BaseModal
        visible={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="تم البيع بنجاح"
        footer={
          <View style={styles.successFooter}>
            <TouchableOpacity
              onPress={() => { setShowSuccess(false); setShowReceipt(true); }}
              style={[styles.receiptBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <ReceiptIcon size={18} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.receiptBtnText, { color: colors.textSecondary }]}>عرض الإيصال</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowSuccess(false)}
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Check size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.confirmBtnText}>تم</Text>
            </TouchableOpacity>
          </View>
        }
      >
        {lastTxn && (
          <View style={{ gap: 10 }}>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <User size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{lastTxn.customerName}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Package size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{lastTxn.items.length} صنف</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.primary + '15' }]}>
              <Wallet size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.primary }]}>{formatCurrency(lastTxn.total, settings.currency)}</Text>
            </View>
            {lastTxn.remaining > 0 && (
              <View style={[styles.debtRecordedBanner, { backgroundColor: colors.danger + '12' }]}>
                <BookOpen size={14} color={colors.danger} strokeWidth={2} />
                <Text style={[styles.debtRecordedText, { color: colors.danger }]}>
                  تم تسجيل دين: {formatCurrency(lastTxn.remaining, settings.currency)}
                </Text>
              </View>
            )}
          </View>
        )}
      </BaseModal>

      <CustomerProfile
        visible={profileCustomer !== null}
        customer={profileCustomer}
        onClose={() => setProfileCustomer(null)}
        onEdit={() => { setProfileCustomer(null); }}
        onPayment={(c) => { setProfileCustomer(null); recordPayment(c.id, c.debt); }}
        onTopUp={() => {}}
        onAddDebt={() => {}}
        onRedeem={() => {}}
      />

      {lastTxn && (
        <ReceiptPreview
          visible={showReceipt}
          txn={lastTxn}
          storeName={settings.storeName}
          currency={settings.currency}
          onClose={() => setShowReceipt(false)}
          receiptLogo={settings.receiptLogo}
          receiptHeaderText={settings.receiptHeaderText}
          receiptFooterText={settings.receiptFooterText}
        />
      )}

      <BaseModal
        visible={showTxnModal}
        onClose={() => setShowTxnModal(false)}
        title="تفاصيل المعاملة"
        footer={
          <TouchableOpacity
            onPress={() => setShowTxnModal(false)}
            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>إغلاق</Text>
          </TouchableOpacity>
        }
      >
        {selectedTxn && (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                if (selectedTxn.customerId) {
                  const c = customers.find((cu) => cu.id === selectedTxn.customerId);
                  if (c) { setShowTxnModal(false); setProfileCustomer(c); }
                }
              }}
              disabled={!selectedTxn.customerId || !customers.some((cu) => cu.id === selectedTxn.customerId)}
              style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.6}
            >
              <User size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{selectedTxn.customerName}</Text>
            </TouchableOpacity>
            <View style={[styles.successRow, { backgroundColor: colors.surfaceAlt }]}>
              <Clock size={20} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.successText, { color: colors.text }]}>{new Date(selectedTxn.createdAt).toLocaleString('ar')}</Text>
            </View>
            <View style={[styles.successRow, { backgroundColor: colors.primary + '15' }]}>
              <Wallet size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.successAmount, { color: colors.primary }]}>{formatCurrency(selectedTxn.total, settings.currency)}</Text>
            </View>
            {selectedTxn.items.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                {selectedTxn.items.map((item, i) => (
                  <View key={i} style={[styles.successRow, { backgroundColor: colors.surfaceAlt, paddingVertical: 8 }]}>
                    <Package size={16} color={colors.textSecondary} strokeWidth={2} />
                    <Text style={[styles.successText, { color: colors.text, fontSize: 13 }]}>{item.name} ×{item.quantity}</Text>
                    <Text style={[styles.txnAmount, { color: colors.primary, fontSize: 13 }]}>{formatCurrency(item.price * item.quantity, settings.currency)}</Text>
                  </View>
                ))}
              </View>
            )}
            {selectedTxn.remaining > 0 && (
              <View style={[styles.debtRecordedBanner, { backgroundColor: colors.danger + '12' }]}>
                <BookOpen size={14} color={colors.danger} strokeWidth={2} />
                <Text style={[styles.debtRecordedText, { color: colors.danger }]}>
                  دين متبقي: {formatCurrency(selectedTxn.remaining, settings.currency)}
                </Text>
              </View>
            )}
          </View>
        )}
      </BaseModal>
    </>
  );

  if (isWeb) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {readOnlyBanner && <View style={{ paddingHorizontal: 16 }}>{readOnlyBanner}</View>}
        <View style={styles.webSplit}>
          <View style={styles.webLeftPanel}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {summaryCards}
              {actionsRow}
              {productSearchBar}
              {productGridContent}
              {recentTransactionsContent}
            </ScrollView>
          </View>

          <View style={styles.webRightPanel}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {cart.length > 0 ? (
                <>
                  {cartContent}
                  {customerContent}
                  {paymentContent}
                </>
              ) : (
                <View style={styles.webEmptyCart}>
                  <ShoppingCart size={48} color={colors.textMuted} strokeWidth={1.5} />
                  <Text style={[styles.webEmptyCartText, { color: colors.textMuted }]}>السلة فارغة</Text>
                  <Text style={[styles.webEmptyCartSub, { color: colors.textMuted }]}>اختر منتجات من القائمة على اليمين</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
        {modals}
      </View>
    );
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {readOnlyBanner}
        <View style={{ marginBottom: 10 }}>
          <GlobalSearch />
        </View>
        {summaryCards}
        {actionsRow}
        {productGridContent}
        {cartContent}
        {customerContent}
        {paymentContent}
        {txnSortButtons}
        {txnSearchBar}
        {recentTransactionsContent}
      </ScrollView>
      <View style={[styles.floatingSearchBar, { backgroundColor: colors.surface, borderColor: colors.border, bottom: insets.bottom || 0 }]}>
        {productSearchBar}
      </View>
      {modals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  readOnlyText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  floatingSearchBar: { position: 'absolute', left: 8, right: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, zIndex: 100 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Cairo-Regular', padding: 0 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productGridWeb: { gap: 8 },
  productCard: { width: '48%', minWidth: 140, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: 'transparent', gap: 4 },
  productCardWeb: { width: '31%', minWidth: 110, maxWidth: 180, padding: 8 },
  productIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold', minHeight: 30 },
  productPrice: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  productStock: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  emptyProducts: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  cartSection: { marginTop: 10, borderRadius: 10, borderWidth: 1, padding: 9, gap: 6 },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cartTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  clearCartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearCartText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  cartItemName: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  cartItemPrice: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 40, textAlign: 'center', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', padding: 0 },
  cartItemTotal: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', minWidth: 70, textAlign: 'left' },
  removeBtn: { padding: 4 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1 },
  discountLabel: { fontSize: 14, fontFamily: 'Cairo-SemiBold', flex: 1 },
  discountInput: { width: 60, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  discountTextInput: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', padding: 0 },
  discountAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', minWidth: 70, textAlign: 'left' },
  totalsSection: { gap: 6, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  totalValue: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1 },
  grandTotalLabel: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  grandTotalValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  fieldLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold', marginBottom: 4 },
  textInput: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, fontSize: 14, fontFamily: 'Cairo-Regular', minHeight: 40 },
  notesInput: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, fontSize: 13, fontFamily: 'Cairo-Regular', minHeight: 52, textAlignVertical: 'top' },
  customerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: { width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  nameSuggestions: { position: 'absolute', top: '100%', left: 0, right: 0, borderRadius: 12, borderWidth: 1, marginTop: 4, maxHeight: 200, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 200 },
  nameSuggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' },
  pickerRowText: { fontSize: 15, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  pickerSubText: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  debtLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  debtCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  debtCardText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  collectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  collectBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  paymentRow: { flexDirection: 'row', gap: 8 },
  paymentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  paymentText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  calcRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  calcBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  remainingText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', marginTop: 6 },
  payStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 8 },
  payStatusText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  debtBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  debtBannerText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  balanceCardPos: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  balanceCardPosText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  balanceConfirmBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  balanceConfirmText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  balanceInsufficientBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  balanceInsufficientText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  balanceConfirmDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  balanceConfirmDetailLabel: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  balanceConfirmDetailValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 11, marginTop: 12 },
  checkoutBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  historyTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 24, marginBottom: 12 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginBottom: 8 },
  txnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txnCustomer: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnItems: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  txnAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  searchInputModal: { flex: 1, fontSize: 15, fontFamily: 'Cairo-Regular', padding: 0 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 6 },
  noResults: { textAlign: 'center', paddingVertical: 20, fontSize: 14, fontFamily: 'Cairo-Regular' },
  successFooter: { flexDirection: 'row', gap: 10 },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, paddingHorizontal: 20 },
  receiptBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  successText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  successAmount: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  debtRecordedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  debtRecordedText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', flex: 1 },
  webSplit: { flex: 1, flexDirection: 'row' },
  webLeftPanel: { flex: 1.4 },
  webRightPanel: { flex: 1, maxWidth: 420 },
  webEmptyCart: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  webEmptyCartText: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  webEmptyCartSub: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  summaryCards: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  summaryLabel: { fontSize: 10, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  newTxnBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  newTxnBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  importBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  importBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  actionsMenu: { position: 'absolute', top: '100%', left: 0, right: 0, borderRadius: 12, borderWidth: 1, marginTop: 4, padding: 4, zIndex: 300, elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  actionsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  actionsMenuText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnSortRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 16, marginBottom: 8 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  sortChipText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  txnSearchInput: { flex: 1, fontSize: 14, fontFamily: 'Cairo-Regular', padding: 0 },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 },
  pageBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pageText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txnImportBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 8 },
  txnImportBannerText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
});
