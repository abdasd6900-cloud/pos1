import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, Building2, Receipt,
  ArrowRightLeft, Banknote, Check, User,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import {
  EXPENSE_CATEGORIES, WALLET_TYPES,
  type WalletType, type TransferNotification, type TransferMatchType,
  type Supplier, type Customer,
} from '@/types';

interface TransferMatchModalProps {
  visible: boolean;
  notification: TransferNotification | null;
  suppliers: Supplier[];
  customers: Customer[];
  onMatch: (notificationId: string, matchType: TransferMatchType, params: {
    supplierId?: string;
    customerId?: string;
    expenseCategory?: string;
    fromWallet?: WalletType;
    toWallet?: WalletType;
    walletType?: WalletType;
    description?: string;
  }) => void;
  onClose: () => void;
}

type Direction = 'incoming' | 'outgoing' | null;
type OutgoingCategory = 'supplier_payment' | 'expense' | 'account_transfer' | null;

export function TransferMatchModal({
  visible, notification, suppliers, customers, onMatch, onClose,
}: TransferMatchModalProps) {
  const { colors } = useTheme();
  const [direction, setDirection] = useState<Direction>(null);
  const [outgoingCategory, setOutgoingCategory] = useState<OutgoingCategory>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [fromWallet, setFromWallet] = useState<WalletType>('cash');
  const [toWallet, setToWallet] = useState<WalletType>('bank_palestine');
  const [walletType, setWalletType] = useState<WalletType>('jawwal_pay');
  const [description, setDescription] = useState('');

  // Reset state when notification changes
  const notifId = notification?.id;
  const initialDirection = notification?.direction ?? 'unknown';
  useMemo(() => {
    if (!visible) return;
    if (initialDirection === 'incoming') {
      setDirection('incoming');
      setOutgoingCategory(null);
    } else if (initialDirection === 'outgoing') {
      setDirection('outgoing');
      setOutgoingCategory(null);
    } else {
      setDirection(null);
      setOutgoingCategory(null);
    }
    setSelectedSupplierId('');
    setSelectedCustomerId('');
    setExpenseCategory(EXPENSE_CATEGORIES[0]);
    setFromWallet('cash');
    setToWallet('bank_palestine');
    setWalletType('jawwal_pay');
    setDescription('');
  }, [visible, notifId, initialDirection]);

  const customersWithDebt = useMemo(() => {
    return customers.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt);
  }, [customers]);

  if (!notification) return null;

  const canSubmit = (): boolean => {
    if (direction === 'incoming') {
      return !!selectedCustomerId;
    }
    if (direction === 'outgoing') {
      if (outgoingCategory === 'supplier_payment') return !!selectedSupplierId;
      if (outgoingCategory === 'expense') return true;
      if (outgoingCategory === 'account_transfer') return fromWallet !== toWallet;
    }
    return false;
  };

  const handleSubmit = () => {
    if (!canSubmit() || !notification) return;
    const matchType: TransferMatchType =
      direction === 'incoming' ? 'debt_collection' :
      outgoingCategory === 'supplier_payment' ? 'supplier_payment' :
      outgoingCategory === 'expense' ? 'expense' :
      outgoingCategory === 'account_transfer' ? 'account_transfer' : 'none';

    onMatch(notification.id, matchType, {
      supplierId: selectedSupplierId || undefined,
      customerId: selectedCustomerId || undefined,
      expenseCategory: expenseCategory || undefined,
      fromWallet: fromWallet || undefined,
      toWallet: toWallet || undefined,
      walletType: walletType || undefined,
      description: description.trim() || undefined,
    });
    onClose();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Transfer info summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>المبلغ</Text>
          <Text style={[styles.summaryValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>
            {notification.amount} {notification.currency}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
            {notification.direction === 'outgoing' ? 'المستقبل' : 'المرسل'}
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {notification.direction === 'outgoing'
              ? (notification.senderName || notification.senderPhone || 'غير محدد')
              : (notification.senderName || notification.senderPhone || 'غير محدد')}
          </Text>
        </View>
        {notification.bankName ? (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>المصدر</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{notification.bankName}</Text>
          </View>
        ) : null}
      </View>

      {/* Direction selector */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>نوع الحوالة</Text>
      <View style={styles.directionRow}>
        <TouchableOpacity
          onPress={() => { setDirection('incoming'); setOutgoingCategory(null); }}
          style={[
            styles.directionBtn,
            {
              backgroundColor: direction === 'incoming' ? colors.success + '15' : colors.surfaceAlt,
              borderColor: direction === 'incoming' ? colors.success : colors.border,
            },
          ]}
        >
          <ArrowDownToLine size={22} color={direction === 'incoming' ? colors.success : colors.textMuted} strokeWidth={2} />
          <Text style={[styles.directionText, { color: direction === 'incoming' ? colors.success : colors.textMuted }]}>
            وارد
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setDirection('outgoing'); }}
          style={[
            styles.directionBtn,
            {
              backgroundColor: direction === 'outgoing' ? colors.warning + '15' : colors.surfaceAlt,
              borderColor: direction === 'outgoing' ? colors.warning : colors.border,
            },
          ]}
        >
          <ArrowUpFromLine size={22} color={direction === 'outgoing' ? colors.warning : colors.textMuted} strokeWidth={2} />
          <Text style={[styles.directionText, { color: direction === 'outgoing' ? colors.warning : colors.textMuted }]}>
            صادر
          </Text>
        </TouchableOpacity>
      </View>

      {/* Incoming: debt collection from customers with debt */}
      {direction === 'incoming' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            مطابقة مع زبون عليه دين لتحصيل الدين
          </Text>
          {customersWithDebt.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                لا يوجد زبائن عليهم دين حالياً
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {customersWithDebt.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedCustomerId(c.id)}
                  style={[
                    styles.optionItem,
                    {
                      backgroundColor: selectedCustomerId === c.id ? colors.primary + '15' : colors.surfaceAlt,
                      borderColor: selectedCustomerId === c.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <User size={16} color={selectedCustomerId === c.id ? colors.primary : colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.optionText, { color: colors.text, flex: 1 }]}>
                    {c.name}
                  </Text>
                  <Text style={[styles.optionAmount, { color: colors.danger, fontFamily: 'Cairo-Bold' }]}>
                    {c.debt.toFixed(2)}
                  </Text>
                  {selectedCustomerId === c.id ? <Check size={18} color={colors.primary} strokeWidth={2} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* Outgoing: category selection */}
      {direction === 'outgoing' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>نوع الصرف</Text>
          <View style={styles.categoryGrid}>
            <TouchableOpacity
              onPress={() => setOutgoingCategory('supplier_payment')}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: outgoingCategory === 'supplier_payment' ? colors.primary + '15' : colors.surfaceAlt,
                  borderColor: outgoingCategory === 'supplier_payment' ? colors.primary : colors.border,
                },
              ]}
            >
              <Building2 size={22} color={outgoingCategory === 'supplier_payment' ? colors.primary : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.categoryText, { color: outgoingCategory === 'supplier_payment' ? colors.primary : colors.textMuted }]}>
                لمورد
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOutgoingCategory('expense')}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: outgoingCategory === 'expense' ? colors.danger + '15' : colors.surfaceAlt,
                  borderColor: outgoingCategory === 'expense' ? colors.danger : colors.border,
                },
              ]}
            >
              <Receipt size={22} color={outgoingCategory === 'expense' ? colors.danger : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.categoryText, { color: outgoingCategory === 'expense' ? colors.danger : colors.textMuted }]}>
                مصروف
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOutgoingCategory('account_transfer')}
              style={[
                styles.categoryCard,
                {
                  backgroundColor: outgoingCategory === 'account_transfer' ? colors.info + '15' : colors.surfaceAlt,
                  borderColor: outgoingCategory === 'account_transfer' ? colors.info : colors.border,
                },
              ]}
            >
              <ArrowRightLeft size={22} color={outgoingCategory === 'account_transfer' ? colors.info : colors.textMuted} strokeWidth={2} />
              <Text style={[styles.categoryText, { color: outgoingCategory === 'account_transfer' ? colors.info : colors.textMuted }]}>
                تحويل بين حسابات
              </Text>
            </TouchableOpacity>
          </View>

          {/* Supplier payment: select supplier + wallet */}
          {outgoingCategory === 'supplier_payment' ? (
            <View style={styles.subSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اختر المورد</Text>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                {suppliers.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setSelectedSupplierId(s.id)}
                    style={[
                      styles.optionItem,
                      {
                        backgroundColor: selectedSupplierId === s.id ? colors.primary + '15' : colors.surfaceAlt,
                        borderColor: selectedSupplierId === s.id ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Building2 size={16} color={selectedSupplierId === s.id ? colors.primary : colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.optionText, { color: colors.text, flex: 1 }]}>{s.name}</Text>
                    {s.balance > 0 ? (
                      <Text style={[styles.optionAmount, { color: colors.danger, fontFamily: 'Cairo-Bold' }]}>
                        {s.balance.toFixed(2)}
                      </Text>
                    ) : null}
                    {selectedSupplierId === s.id ? <Check size={18} color={colors.primary} strokeWidth={2} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {suppliers.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا يوجد موردين مسجلين</Text>
              ) : null}

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>من حساب</Text>
              <View style={styles.walletGrid}>
                {WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setWalletType(w.id as WalletType)}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: walletType === w.id ? w.color + '20' : colors.surfaceAlt,
                        borderColor: walletType === w.id ? w.color : colors.border,
                      },
                    ]}
                  >
                    <Banknote size={14} color={walletType === w.id ? w.color : colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.walletChipText, { color: walletType === w.id ? w.color : colors.textSecondary }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {/* Expense: select category + wallet */}
          {outgoingCategory === 'expense' ? (
            <View style={styles.subSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>فئة المصروف</Text>
              <View style={styles.walletGrid}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setExpenseCategory(cat)}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: expenseCategory === cat ? colors.danger + '15' : colors.surfaceAlt,
                        borderColor: expenseCategory === cat ? colors.danger : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.walletChipText, { color: expenseCategory === cat ? colors.danger : colors.textSecondary }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>من حساب</Text>
              <View style={styles.walletGrid}>
                {WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setWalletType(w.id as WalletType)}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: walletType === w.id ? w.color + '20' : colors.surfaceAlt,
                        borderColor: walletType === w.id ? w.color : colors.border,
                      },
                    ]}
                  >
                    <Banknote size={14} color={walletType === w.id ? w.color : colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.walletChipText, { color: walletType === w.id ? w.color : colors.textSecondary }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>وصف المصروف (اختياري)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="وصف المصروف..."
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          {/* Account transfer: from wallet + to wallet */}
          {outgoingCategory === 'account_transfer' ? (
            <View style={styles.subSection}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>من حساب</Text>
              <View style={styles.walletGrid}>
                {WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setFromWallet(w.id as WalletType)}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: fromWallet === w.id ? w.color + '20' : colors.surfaceAlt,
                        borderColor: fromWallet === w.id ? w.color : colors.border,
                      },
                    ]}
                  >
                    <Banknote size={14} color={fromWallet === w.id ? w.color : colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.walletChipText, { color: fromWallet === w.id ? w.color : colors.textSecondary }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>إلى حساب</Text>
              <View style={styles.walletGrid}>
                {WALLET_TYPES.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => setToWallet(w.id as WalletType)}
                    style={[
                      styles.walletChip,
                      {
                        backgroundColor: toWallet === w.id ? w.color + '20' : colors.surfaceAlt,
                        borderColor: toWallet === w.id ? w.color : colors.border,
                      },
                    ]}
                  >
                    <Banknote size={14} color={toWallet === w.id ? w.color : colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.walletChipText, { color: toWallet === w.id ? w.color : colors.textSecondary }]}>
                      {w.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {fromWallet === toWallet ? (
                <Text style={[styles.errorText, { color: colors.danger }]}>
                  يجب اختيار حسابين مختلفين
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>إلغاء</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit()}
          style={[styles.submitBtn, { backgroundColor: canSubmit() ? colors.primary : colors.border }]}
        >
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.submitText}>تأكيد المطابقة</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 },
  summaryCard: { borderRadius: 12, padding: 14, marginBottom: 20, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  summaryValue: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  sectionTitle: { fontSize: 15, fontFamily: 'Cairo-SemiBold', marginBottom: 10 },
  section: { marginBottom: 16 },
  subSection: { marginTop: 16 },
  directionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  directionBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 20, borderRadius: 14, borderWidth: 1.5, gap: 8,
  },
  directionText: { fontSize: 16, fontFamily: 'Cairo-Bold' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: {
    width: '31%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, borderRadius: 14, borderWidth: 1.5, gap: 8,
  },
  categoryText: { fontSize: 14, fontFamily: 'Cairo-SemiBold', textAlign: 'center' },
  fieldLabel: { fontSize: 14, fontFamily: 'Cairo-SemiBold', marginBottom: 8 },
  dropdownScroll: { maxHeight: 200 },
  optionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8,
  },
  optionText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  optionAmount: { fontSize: 14, fontFamily: 'Cairo-Bold' },
  walletGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  walletChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5,
  },
  walletChipText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  textInput: {
    borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Cairo-Regular',
    borderWidth: 1, minHeight: 44, marginTop: 4,
  },
  emptyBox: { borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular', textAlign: 'center' },
  errorText: { fontSize: 13, fontFamily: 'Cairo-SemiBold', marginTop: 8 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  submitBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Cairo-SemiBold' },
});
