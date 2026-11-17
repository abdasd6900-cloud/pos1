import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, FlatList } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import {
  Wallet, Plus, Trash2, TrendingUp, TrendingDown,
  ArrowRightLeft, Banknote, Building2, Smartphone, Store,
  Receipt, Settings2, Check, Cloud, Zap,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime, isToday } from '@/lib/format';
import {
  EXPENSE_CATEGORIES, WALLET_TYPES, ELECTRONIC_WALLET_TYPES,
  RECHARGE_COMPANIES,
  type WalletType, type WalletTxnType, type RechargeCompanyId,
} from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';

type Colors = ReturnType<typeof useTheme>['colors'];

const WALLET_ICONS: Record<WalletType, React.ReactNode> = {
  cash: <Banknote size={20} color="#FFFFFF" strokeWidth={2} />,
  bank_palestine: <Building2 size={20} color="#FFFFFF" strokeWidth={2} />,
  palpay: <Wallet size={20} color="#FFFFFF" strokeWidth={2} />,
  jawwal_pay: <Smartphone size={20} color="#FFFFFF" strokeWidth={2} />,
  jawwal_pay_merchant: <Store size={20} color="#FFFFFF" strokeWidth={2} />,
  malchat: <Wallet size={20} color="#FFFFFF" strokeWidth={2} />,
};

const COMPANY_ICONS: Record<RechargeCompanyId, React.ReactNode> = {
  sky: <Cloud size={18} color="#FFFFFF" strokeWidth={2} />,
  layan: <Zap size={18} color="#FFFFFF" strokeWidth={2} />,
  areen: <Building2 size={18} color="#FFFFFF" strokeWidth={2} />,
};

const TXN_TYPE_LABELS: Record<WalletTxnType, string> = {
  income: 'إيداع',
  expense: 'مصروف',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  supplier_payment: 'دفع مورد',
  sale: 'بيع',
  adjustment: 'تسوية',
};

const TXN_TYPE_COLORS: Record<WalletTxnType, 'success' | 'danger' | 'info' | 'warning' | 'primary'> = {
  income: 'success',
  expense: 'danger',
  transfer_in: 'success',
  transfer_out: 'warning',
  supplier_payment: 'danger',
  sale: 'success',
  adjustment: 'info',
};

export default function CashDrawerScreen() {
  const {
    walletTxns, getWalletBalance, getTotalWalletsBalance,
    addExpense, deleteExpense, expenses,
    transferBetweenWallets, adjustWalletBalance, deleteWalletTransaction,
    companyBalanceTxns, getCompanyBalance, getTotalCompaniesBalance,
    addCompanyBalanceTxn, deleteCompanyBalanceTxn,
    settings,
  } = useApp();
  const { colors } = useTheme();

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyWallet, setHistoryWallet] = useState<WalletType | 'all'>('all');
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showCompanyHistoryModal, setShowCompanyHistoryModal] = useState(false);
  const [companyHistoryFilter, setCompanyHistoryFilter] = useState<RechargeCompanyId | 'all'>('all');

  // Transfer state
  const [transferFrom, setTransferFrom] = useState<WalletType>('cash');
  const [transferTo, setTransferTo] = useState<WalletType>('bank_palestine');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // Expense state
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseWallet, setExpenseWallet] = useState<WalletType>('cash');

  // Adjust state
  const [adjustWallet, setAdjustWallet] = useState<WalletType>('cash');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Company balance state
  const [companySelected, setCompanySelected] = useState<RechargeCompanyId>('sky');
  const [companyTxnType, setCompanyTxnType] = useState<'recharge_in' | 'recharge_out'>('recharge_in');
  const [companyAmount, setCompanyAmount] = useState('');
  const [companyNote, setCompanyNote] = useState('');

  const totalBalance = getTotalWalletsBalance();
  const cashBalance = getWalletBalance('cash');
  const electronicTotal = ELECTRONIC_WALLET_TYPES.reduce((sum, w) => sum + getWalletBalance(w.id), 0);
  const totalCompaniesBalance = getTotalCompaniesBalance();

  const todayWalletTxns = useMemo(() => {
    return walletTxns.filter((w) => isToday(w.createdAt));
  }, [walletTxns]);

  const todayExpenses = useMemo(() => {
    return expenses.filter((e) => isToday(e.createdAt));
  }, [expenses]);

  const filteredHistory = useMemo(() => {
    if (historyWallet === 'all') return walletTxns;
    return walletTxns.filter((w) => w.walletType === historyWallet);
  }, [walletTxns, historyWallet]);

  const filteredCompanyHistory = useMemo(() => {
    if (companyHistoryFilter === 'all') return companyBalanceTxns;
    return companyBalanceTxns.filter((t) => t.companyId === companyHistoryFilter);
  }, [companyBalanceTxns, companyHistoryFilter]);

  const handleTransfer = useCallback(() => {
    const amount = parseFloat(transferAmount) || 0;
    if (amount <= 0 || transferFrom === transferTo) return;
    transferBetweenWallets(transferFrom, transferTo, amount, transferNote.trim());
    setTransferAmount('');
    setTransferNote('');
    setShowTransferModal(false);
  }, [transferFrom, transferTo, transferAmount, transferNote, transferBetweenWallets]);

  const handleAddExpense = useCallback(() => {
    const amount = parseFloat(expenseAmount) || 0;
    if (amount <= 0) return;
    addExpense(amount, expenseCategory, expenseDesc.trim(), expenseWallet);
    setExpenseAmount('');
    setExpenseDesc('');
    setShowExpenseModal(false);
  }, [expenseAmount, expenseCategory, expenseDesc, expenseWallet, addExpense]);

  const handleAdjust = useCallback(() => {
    const newBalance = parseFloat(adjustAmount) || 0;
    adjustWalletBalance(adjustWallet, newBalance, adjustNote.trim());
    setAdjustAmount('');
    setAdjustNote('');
    setShowAdjustModal(false);
  }, [adjustWallet, adjustAmount, adjustNote, adjustWalletBalance]);

  const handleAddCompanyTxn = useCallback(() => {
    const amount = parseFloat(companyAmount) || 0;
    if (amount <= 0) return;
    addCompanyBalanceTxn({
      companyId: companySelected,
      type: companyTxnType,
      amount,
      description: companyNote.trim(),
    });
    setCompanyAmount('');
    setCompanyNote('');
    setShowCompanyModal(false);
  }, [companySelected, companyTxnType, companyAmount, companyNote, addCompanyBalanceTxn]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Wallet size={24} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>الصندوق</Text>
      </View>

      {/* Total Balance Hero Card */}
      <View style={styles.section}>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>إجمالي الرصيد</Text>
            <Wallet size={22} color="#FFFFFF80" strokeWidth={2} />
          </View>
          <Text style={styles.heroValue}>{formatCurrency(totalBalance, settings.currency)}</Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroBreakdown}>
            <View style={styles.heroBreakdownItem}>
              <Banknote size={16} color="#FFFFFFCC" strokeWidth={2} />
              <Text style={styles.heroBreakdownLabel}>نقدي</Text>
              <Text style={styles.heroBreakdownValue}>{formatCurrency(cashBalance, settings.currency)}</Text>
            </View>
            <View style={styles.heroBreakdownItem}>
              <Smartphone size={16} color="#FFFFFFCC" strokeWidth={2} />
              <Text style={styles.heroBreakdownLabel}>المحافظ</Text>
              <Text style={styles.heroBreakdownValue}>{formatCurrency(electronicTotal, settings.currency)}</Text>
            </View>
            <View style={styles.heroBreakdownItem}>
              <Cloud size={16} color="#FFFFFFCC" strokeWidth={2} />
              <Text style={styles.heroBreakdownLabel}>الشركات</Text>
              <Text style={styles.heroBreakdownValue}>{formatCurrency(totalCompaniesBalance, settings.currency)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.section}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => setShowTransferModal(true)}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primary + '18' }]}>
              <ArrowRightLeft size={20} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>تحويل بين المحافظ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowExpenseModal(true)}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.danger + '18' }]}>
              <Plus size={20} color={colors.danger} strokeWidth={2} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>مصروف جديد</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowAdjustModal(true)}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.info + '18' }]}>
              <Settings2 size={20} color={colors.info} strokeWidth={2} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>تسوية رصيد</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowCompanyModal(true)}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.warning + '18' }]}>
              <Cloud size={20} color={colors.warning} strokeWidth={2} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]}>رصيد شركة</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Wallet Cards */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>أرصدة المحافظ</Text>
        <View style={styles.walletGrid}>
          {WALLET_TYPES.map((w) => {
            const balance = getWalletBalance(w.id);
            const isNegative = balance < 0;
            return (
              <View key={w.id} style={[styles.walletCard, { backgroundColor: colors.surface }]}>
                <View style={[styles.walletIconBox, { backgroundColor: w.color }]}>
                  {WALLET_ICONS[w.id]}
                </View>
                <Text style={[styles.walletName, { color: colors.text }]}>{w.name}</Text>
                <Text style={[styles.walletBalance, { color: isNegative ? colors.danger : colors.text }]}>
                  {formatCurrency(balance, settings.currency)}
                </Text>
                <TouchableOpacity
                  onPress={() => { setHistoryWallet(w.id); setShowHistoryModal(true); }}
                  style={[styles.walletHistoryBtn, { borderColor: colors.border }]}
                >
                  <Receipt size={12} color={colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.walletHistoryText, { color: colors.textMuted }]}>السجل</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>

      {/* Electronic Wallets Summary */}
      <View style={styles.section}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
          <View style={styles.summaryHeader}>
            <Smartphone size={18} color={colors.info} strokeWidth={2} />
            <Text style={[styles.summaryTitle, { color: colors.text }]}>ملخص المحافظ الإلكترونية</Text>
          </View>
          {ELECTRONIC_WALLET_TYPES.map((w, i) => {
            const balance = getWalletBalance(w.id);
            return (
              <View
                key={w.id}
                style={[
                  styles.summaryRow,
                  i < ELECTRONIC_WALLET_TYPES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.summaryRowLeft}>
                  <View style={[styles.summaryDot, { backgroundColor: w.color }]} />
                  <Text style={[styles.summaryRowName, { color: colors.text }]}>{w.name}</Text>
                </View>
                <Text style={[styles.summaryRowValue, { color: balance < 0 ? colors.danger : colors.text }]}>
                  {formatCurrency(balance, settings.currency)}
                </Text>
              </View>
            );
          })}
          <View style={[styles.summaryTotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>مجموع المحافظ</Text>
            <Text style={[styles.summaryTotalValue, { color: colors.primary }]}>
              {formatCurrency(electronicTotal, settings.currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Recharge Company Balances Summary */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>أرصدة الشركات (سكاي - ليان - أرين)</Text>
          <TouchableOpacity
            onPress={() => { setCompanyHistoryFilter('all'); setShowCompanyHistoryModal(true); }}
            style={[styles.seeAllBtn, { backgroundColor: colors.warning + '15' }]}
          >
            <Text style={[styles.seeAllText, { color: colors.warning }]}>السجل</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
          <View style={styles.summaryHeader}>
            <Cloud size={18} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.summaryTitle, { color: colors.text }]}>ملخص أرصدة الشركات</Text>
          </View>
          {RECHARGE_COMPANIES.map((c, i) => {
            const balance = getCompanyBalance(c.id);
            return (
              <View
                key={c.id}
                style={[
                  styles.summaryRow,
                  i < RECHARGE_COMPANIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.summaryRowLeft}>
                  <View style={[styles.companyIconSmall, { backgroundColor: c.color }]}>
                    {COMPANY_ICONS[c.id]}
                  </View>
                  <Text style={[styles.summaryRowName, { color: colors.text }]}>{c.name}</Text>
                </View>
                <Text style={[styles.summaryRowValue, { color: balance < 0 ? colors.danger : colors.text }]}>
                  {formatCurrency(balance, settings.currency)}
                </Text>
              </View>
            );
          })}
          <View style={[styles.summaryTotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.summaryTotalLabel, { color: colors.text }]}>إجمالي أرصدة الشركات</Text>
            <Text style={[styles.summaryTotalValue, { color: colors.warning }]}>
              {formatCurrency(totalCompaniesBalance, settings.currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Today's Transactions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>عمليات اليوم ({todayWalletTxns.length})</Text>
          <TouchableOpacity
            onPress={() => { setHistoryWallet('all'); setShowHistoryModal(true); }}
            style={[styles.seeAllBtn, { backgroundColor: colors.primary + '12' }]}
          >
            <Text style={[styles.seeAllText, { color: colors.primary }]}>عرض الكل</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.txnList, { backgroundColor: colors.surface }]}>
          {todayWalletTxns.length === 0 ? (
            <EmptyState
              icon={<Wallet size={32} color={colors.textMuted} strokeWidth={2} />}
              title="لا توجد عمليات اليوم"
              subtitle="ستظهر هنا جميع العمليات المالية"
            />
          ) : (
            todayWalletTxns.slice(0, 12).map((w, i) => {
              const wtd = WALLET_TYPES.find((wt) => wt.id === w.walletType);
              const isIncome = w.type === 'income' || w.type === 'transfer_in' || w.type === 'sale';
              const isExpense = w.type === 'expense' || w.type === 'transfer_out' || w.type === 'supplier_payment';
              const colorKey = TXN_TYPE_COLORS[w.type];
              const txnColor = colorKey === 'success' ? colors.success : colorKey === 'danger' ? colors.danger : colorKey === 'warning' ? colors.warning : colorKey === 'info' ? colors.info : colors.primary;
              return (
                <View
                  key={w.id}
                  style={[
                    styles.txnRow,
                    i < Math.min(todayWalletTxns.length, 12) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.txnIcon, { backgroundColor: (wtd?.color ?? colors.primary) + '18' }]}>
                    {isIncome ? (
                      <TrendingUp size={16} color={colors.success} strokeWidth={2} />
                    ) : isExpense ? (
                      <TrendingDown size={16} color={colors.danger} strokeWidth={2} />
                    ) : (
                      <Settings2 size={16} color={colors.info} strokeWidth={2} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txnType, { color: colors.text }]}>{TXN_TYPE_LABELS[w.type]}</Text>
                    <Text style={[styles.txnWallet, { color: colors.textMuted }]}>{wtd?.name}</Text>
                    {w.description ? <Text style={[styles.txnDesc, { color: colors.textMuted }]} numberOfLines={1}>{w.description}</Text> : null}
                    <Text style={[styles.txnTime, { color: colors.textMuted }]}>{formatDateTime(w.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: isIncome ? colors.success : isExpense ? colors.danger : txnColor }]}>
                    {isIncome ? '+' : isExpense ? '-' : ''}{formatCurrency(w.amount, settings.currency)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Today's Expenses */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>مصروفات اليوم ({todayExpenses.length})</Text>
        <View style={[styles.txnList, { backgroundColor: colors.surface }]}>
          {todayExpenses.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مصروفات اليوم</Text>
          ) : (
            todayExpenses.slice(0, 10).map((e, i) => {
              const wtd = WALLET_TYPES.find((w) => w.id === (e.walletType ?? 'cash'));
              return (
                <View
                  key={e.id}
                  style={[
                    styles.txnRow,
                    i < Math.min(todayExpenses.length, 10) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <View style={[styles.txnIcon, { backgroundColor: colors.danger + '15' }]}>
                    <TrendingDown size={16} color={colors.danger} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txnType, { color: colors.text }]}>{e.category}</Text>
                    {e.description ? <Text style={[styles.txnDesc, { color: colors.textMuted }]} numberOfLines={1}>{e.description}</Text> : null}
                    <View style={styles.expenseMetaRow}>
                      <Text style={[styles.txnTime, { color: colors.textMuted }]}>{formatDateTime(e.createdAt)}</Text>
                      {wtd && (
                        <View style={[styles.walletTag, { backgroundColor: (wtd.color) + '15' }]}>
                          <Text style={[styles.walletTagText, { color: wtd.color }]}>{wtd.name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.txnAmount, { color: colors.danger }]}>
                    -{formatCurrency(e.amount, settings.currency)}
                  </Text>
                  <TouchableOpacity onPress={() => deleteExpense(e.id)} style={styles.deleteBtn}>
                    <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Transfer Modal */}
      <BaseModal
        visible={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="تحويل بين المحافظ"
        footer={
          <TouchableOpacity onPress={handleTransfer} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.7}>
            <ArrowRightLeft size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>تنفيذ التحويل</Text>
          </TouchableOpacity>
        }
      >
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>من محفظة</Text>
        <WalletSelector value={transferFrom} onChange={setTransferFrom} colors={colors} exclude={transferTo} />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>إلى محفظة</Text>
        <WalletSelector value={transferTo} onChange={setTransferTo} colors={colors} exclude={transferFrom} />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>المبلغ ({settings.currency})</Text>
        <TextInput
          value={transferAmount}
          onChangeText={setTransferAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>ملاحظة (اختياري)</Text>
        <TextInput
          value={transferNote}
          onChangeText={setTransferNote}
          placeholder="سبب التحويل..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </BaseModal>

      {/* Expense Modal */}
      <BaseModal
        visible={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title="تسجيل مصروف"
        footer={
          <TouchableOpacity onPress={handleAddExpense} style={[styles.saveBtn, { backgroundColor: colors.danger }]} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>تسجيل المصروف</Text>
          </TouchableOpacity>
        }
      >
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>من محفظة</Text>
        <WalletSelector value={expenseWallet} onChange={setExpenseWallet} colors={colors} />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>المبلغ ({settings.currency})</Text>
        <TextInput
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>التصنيف</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
          {EXPENSE_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setExpenseCategory(cat)}
              style={[styles.categoryChip, { backgroundColor: expenseCategory === cat ? colors.danger : colors.surfaceAlt }]}
            >
              <Text style={[styles.categoryText, { color: expenseCategory === cat ? '#FFFFFF' : colors.text }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>جهة الصرف (اختياري)</Text>
        <TextInput
          value={expenseDesc}
          onChangeText={setExpenseDesc}
          placeholder="تفاصيل المصروف..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </BaseModal>

      {/* Adjust Balance Modal */}
      <BaseModal
        visible={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="تسوية رصيد محفظة"
        footer={
          <TouchableOpacity onPress={handleAdjust} style={[styles.saveBtn, { backgroundColor: colors.info }]} activeOpacity={0.7}>
            <Check size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>تطبيق التسوية</Text>
          </TouchableOpacity>
        }
      >
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المحفظة</Text>
        <WalletSelector value={adjustWallet} onChange={setAdjustWallet} colors={colors} />
        <View style={[styles.currentBalanceBox, { backgroundColor: colors.info + '12' }]}>
          <Text style={[styles.currentBalanceLabel, { color: colors.textSecondary }]}>الرصيد الحالي:</Text>
          <Text style={[styles.currentBalanceValue, { color: colors.info }]}>
            {formatCurrency(getWalletBalance(adjustWallet), settings.currency)}
          </Text>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>الرصيد الجديد ({settings.currency})</Text>
        <TextInput
          value={adjustAmount}
          onChangeText={setAdjustAmount}
          placeholder={getWalletBalance(adjustWallet).toString()}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>ملاحظة (اختياري)</Text>
        <TextInput
          value={adjustNote}
          onChangeText={setAdjustNote}
          placeholder="سبب التسوية..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </BaseModal>

      {/* Company Balance Modal */}
      <BaseModal
        visible={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        title="رصيد الشركات"
        footer={
          <TouchableOpacity onPress={handleAddCompanyTxn} style={[styles.saveBtn, { backgroundColor: colors.warning }]} activeOpacity={0.7}>
            <Text style={styles.saveBtnText}>تأكيد العملية</Text>
          </TouchableOpacity>
        }
      >
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>الشركة</Text>
        <View style={styles.companySelectorRow}>
          {RECHARGE_COMPANIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCompanySelected(c.id)}
              style={[
                styles.companyChip,
                {
                  backgroundColor: companySelected === c.id ? c.color : colors.surfaceAlt,
                  borderColor: companySelected === c.id ? c.color : colors.border,
                },
              ]}
            >
              <View style={[styles.companyChipIcon, { backgroundColor: companySelected === c.id ? '#FFFFFF20' : c.color + '15' }]}>
                {COMPANY_ICONS[c.id]}
              </View>
              <Text style={[styles.companyChipText, { color: companySelected === c.id ? '#FFFFFF' : colors.text }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.currentBalanceBox, { backgroundColor: colors.warning + '12', marginTop: 12 }]}>
          <Text style={[styles.currentBalanceLabel, { color: colors.textSecondary }]}>الرصيد الحالي:</Text>
          <Text style={[styles.currentBalanceValue, { color: colors.warning }]}>
            {formatCurrency(getCompanyBalance(companySelected), settings.currency)}
          </Text>
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>نوع العملية</Text>
        <View style={styles.companyTypeRow}>
          <TouchableOpacity
            onPress={() => setCompanyTxnType('recharge_in')}
            style={[styles.companyTypeBtn, { backgroundColor: companyTxnType === 'recharge_in' ? colors.success : colors.surfaceAlt, borderColor: companyTxnType === 'recharge_in' ? colors.success : colors.border }]}
          >
            <TrendingUp size={16} color={companyTxnType === 'recharge_in' ? '#FFFFFF' : colors.success} strokeWidth={2} />
            <Text style={[styles.companyTypeText, { color: companyTxnType === 'recharge_in' ? '#FFFFFF' : colors.text }]}>شحن رصيد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCompanyTxnType('recharge_out')}
            style={[styles.companyTypeBtn, { backgroundColor: companyTxnType === 'recharge_out' ? colors.danger : colors.surfaceAlt, borderColor: companyTxnType === 'recharge_out' ? colors.danger : colors.border }]}
          >
            <TrendingDown size={16} color={companyTxnType === 'recharge_out' ? '#FFFFFF' : colors.danger} strokeWidth={2} />
            <Text style={[styles.companyTypeText, { color: companyTxnType === 'recharge_out' ? '#FFFFFF' : colors.text }]}>خصم / استخدام</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>المبلغ ({settings.currency})</Text>
        <TextInput
          value={companyAmount}
          onChangeText={setCompanyAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 14 }]}>ملاحظة (اختياري)</Text>
        <TextInput
          value={companyNote}
          onChangeText={setCompanyNote}
          placeholder="تفاصيل العملية..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </BaseModal>

      {/* Full Wallet History Modal */}
      <BaseModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="سجل العمليات"
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setHistoryWallet('all')}
            style={[styles.filterChip, { backgroundColor: historyWallet === 'all' ? colors.primary : colors.surfaceAlt }]}
          >
            <Text style={[styles.filterText, { color: historyWallet === 'all' ? '#FFFFFF' : colors.text }]}>الكل</Text>
          </TouchableOpacity>
          {WALLET_TYPES.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => setHistoryWallet(w.id)}
              style={[styles.filterChip, { backgroundColor: historyWallet === w.id ? w.color : colors.surfaceAlt }]}
            >
              <Text style={[styles.filterText, { color: historyWallet === w.id ? '#FFFFFF' : colors.text }]}>{w.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ maxHeight: 400 }}>
          <FlatList
            data={filteredHistory.slice(0, 100)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const wtd = WALLET_TYPES.find((wt) => wt.id === item.walletType);
              const isIncome = item.type === 'income' || item.type === 'transfer_in' || item.type === 'sale';
              const isExpense = item.type === 'expense' || item.type === 'transfer_out' || item.type === 'supplier_payment';
              return (
                <View style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyType, { color: colors.text }]}>{TXN_TYPE_LABELS[item.type]}</Text>
                    <Text style={[styles.historyWallet, { color: colors.textMuted }]}>{wtd?.name}</Text>
                    {item.description ? <Text style={[styles.historyDesc, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text> : null}
                    <Text style={[styles.historyTime, { color: colors.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
                  </View>
                  <Text style={[styles.historyAmount, { color: isIncome ? colors.success : isExpense ? colors.danger : colors.info }]}>
                    {isIncome ? '+' : isExpense ? '-' : ''}{formatCurrency(item.amount, settings.currency)}
                  </Text>
                  <TouchableOpacity onPress={() => deleteWalletTransaction(item.id)} style={styles.deleteBtn}>
                    <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
          />
        </View>
      </BaseModal>

      {/* Company Balance History Modal */}
      <BaseModal
        visible={showCompanyHistoryModal}
        onClose={() => setShowCompanyHistoryModal(false)}
        title="سجل أرصدة الشركات"
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setCompanyHistoryFilter('all')}
            style={[styles.filterChip, { backgroundColor: companyHistoryFilter === 'all' ? colors.warning : colors.surfaceAlt }]}
          >
            <Text style={[styles.filterText, { color: companyHistoryFilter === 'all' ? '#FFFFFF' : colors.text }]}>الكل</Text>
          </TouchableOpacity>
          {RECHARGE_COMPANIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCompanyHistoryFilter(c.id)}
              style={[styles.filterChip, { backgroundColor: companyHistoryFilter === c.id ? c.color : colors.surfaceAlt }]}
            >
              <Text style={[styles.filterText, { color: companyHistoryFilter === c.id ? '#FFFFFF' : colors.text }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ maxHeight: 400 }}>
          {filteredCompanyHistory.length === 0 ? (
            <EmptyState
              icon={<Cloud size={32} color={colors.textMuted} strokeWidth={2} />}
              title="لا توجد عمليات"
              subtitle="ستظهر هنا عمليات الشحن والخصم"
            />
          ) : (
            <FlatList
              data={filteredCompanyHistory.slice(0, 100)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const cDef = RECHARGE_COMPANIES.find((c) => c.id === item.companyId);
                const isIncome = item.type === 'recharge_in';
                const isAdjust = item.type === 'adjustment';
                return (
                  <View style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyType, { color: colors.text }]}>
                        {isIncome ? 'شحن رصيد' : isAdjust ? 'تسوية' : 'خصم / استخدام'}
                      </Text>
                      <Text style={[styles.historyWallet, { color: colors.textMuted }]}>{cDef?.name}</Text>
                      {item.description ? <Text style={[styles.historyDesc, { color: colors.textMuted }]} numberOfLines={1}>{item.description}</Text> : null}
                      <Text style={[styles.historyTime, { color: colors.textMuted }]}>{formatDateTime(item.createdAt)}</Text>
                    </View>
                    <Text style={[styles.historyAmount, { color: isIncome ? colors.success : isAdjust ? colors.info : colors.danger }]}>
                      {isIncome ? '+' : isAdjust ? '+' : '-'}{formatCurrency(item.amount, settings.currency)}
                    </Text>
                    <TouchableOpacity onPress={() => deleteCompanyBalanceTxn(item.id)} style={styles.deleteBtn}>
                      <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            />
          )}
        </View>
      </BaseModal>
    </ScrollView>
  );
}

function WalletSelector({
  value, onChange, colors, exclude,
}: {
  value: WalletType;
  onChange: (w: WalletType) => void;
  colors: Colors;
  exclude?: WalletType;
}) {
  const available = WALLET_TYPES.filter((w) => w.id !== exclude);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
      {available.map((w) => (
        <TouchableOpacity
          key={w.id}
          onPress={() => onChange(w.id)}
          style={[
            styles.walletSelectorChip,
            {
              backgroundColor: value === w.id ? w.color : colors.surfaceAlt,
              borderColor: value === w.id ? w.color : colors.border,
            },
          ]}
        >
          <View style={[styles.walletSelectorIcon, { backgroundColor: value === w.id ? '#FFFFFF20' : w.color + '15' }]}>
            {WALLET_ICONS[w.id]}
          </View>
          <Text style={[styles.walletSelectorText, { color: value === w.id ? '#FFFFFF' : colors.text }]}>{w.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  section: { paddingHorizontal: 16, marginBottom: 18 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },

  // Hero card
  heroCard: { borderRadius: 20, padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  heroValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 8 },
  heroDivider: { height: 1, backgroundColor: '#FFFFFF30', marginVertical: 16 },
  heroBreakdown: { flexDirection: 'row', gap: 12 },
  heroBreakdownItem: { flex: 1, gap: 4 },
  heroBreakdownLabel: { color: '#FFFFFFCC', fontSize: 11, fontFamily: 'Cairo-Regular' },
  heroBreakdownValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: { width: '48%', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold', textAlign: 'center' },

  // Wallet grid
  walletGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  walletCard: { width: '47%', borderRadius: 16, padding: 14, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  walletIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  walletName: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  walletBalance: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  walletHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 2 },
  walletHistoryText: { fontSize: 11 },

  // Summary card
  summaryCard: { borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  summaryRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  companyIconSmall: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  summaryRowName: { fontSize: 14, fontWeight: '500' },
  summaryRowValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  summaryTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 4, borderTopWidth: 2 },
  summaryTotalLabel: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  summaryTotalValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },

  // Transaction list
  txnList: { borderRadius: 16, overflow: 'hidden' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  txnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txnType: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  txnWallet: { fontSize: 12, marginTop: 2 },
  txnDesc: { fontSize: 12, marginTop: 2 },
  txnTime: { fontSize: 11, marginTop: 2 },
  txnAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  expenseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  walletTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  walletTagText: { fontSize: 10, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  seeAllBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  seeAllText: { fontSize: 12, fontWeight: '600' },

  // History modal
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginEnd: 8 },
  filterText: { fontSize: 13, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  historyType: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  historyWallet: { fontSize: 12, marginTop: 2 },
  historyDesc: { fontSize: 12, marginTop: 2 },
  historyTime: { fontSize: 11, marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },

  // Form fields
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginEnd: 8 },
  categoryText: { fontSize: 13, fontWeight: '600' },

  // Wallet selector
  walletSelectorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, marginEnd: 8 },
  walletSelectorIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  walletSelectorText: { fontSize: 12, fontWeight: '600' },

  // Adjust box
  currentBalanceBox: { borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  currentBalanceLabel: { fontSize: 13 },
  currentBalanceValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },

  // Company selector
  companySelectorRow: { flexDirection: 'row', gap: 10 },
  companyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: 'center' },
  companyChipIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  companyChipText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },

  // Company type buttons
  companyTypeRow: { flexDirection: 'row', gap: 10 },
  companyTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  companyTypeText: { fontSize: 13, fontWeight: '600' },
});
