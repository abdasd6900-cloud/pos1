import { StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import {
  Wallet, Play, Square, Plus, Trash2, TrendingUp,
  Receipt, AlertTriangle, Check, Clock,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime, isToday } from '@/lib/format';
import { EXPENSE_CATEGORIES } from '@/types';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function CashDrawerScreen() {
  const { activeShift, shifts, expenses, transactions, settings, openShift, closeShift, addExpense, deleteExpense, stats } = useApp();
  const { colors } = useTheme();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeResult, setCloseResult] = useState<{ expected: number; actual: number; diff: number } | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseDesc, setExpenseDesc] = useState('');

  const shiftSales = useMemo(() => {
    if (!activeShift) return 0;
    return transactions
      .filter((t) => t.type === 'sale' && t.createdAt >= activeShift.openedAt && t.paymentMethod === 'cash')
      .reduce((sum, t) => sum + t.paid, 0);
  }, [transactions, activeShift]);

  const shiftExpenses = useMemo(() => {
    if (!activeShift) return 0;
    return expenses.filter((e) => e.shiftId === activeShift.id).reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, activeShift]);

  const expectedCash = activeShift ? activeShift.openingCash + shiftSales - shiftExpenses : 0;
  const todayExpenses = expenses.filter((e) => isToday(e.createdAt));

  const handleOpenShift = () => {
    const amount = parseFloat(openingCash) || 0;
    openShift(amount);
    setShowOpenModal(false);
    setOpeningCash('');
  };

  const handleCloseShift = () => {
    const actual = parseFloat(closingCash) || 0;
    const result = closeShift(actual);
    if (result) {
      setCloseResult({ expected: result.expectedCash ?? 0, actual: result.closingCash ?? 0, diff: result.difference ?? 0 });
    }
    setShowCloseModal(false);
    setClosingCash('');
  };

  const handleAddExpense = () => {
    const amount = parseFloat(expenseAmount) || 0;
    if (amount <= 0) return;
    addExpense(amount, expenseCategory, expenseDesc.trim());
    setExpenseAmount('');
    setExpenseDesc('');
    setShowExpenseModal(false);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Wallet size={24} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الخزينة</Text>
      </View>

      {/* Active Shift Status */}
      <View style={styles.section}>
        {activeShift ? (
          <View style={[styles.shiftCard, { backgroundColor: colors.surface }]}>
            <View style={styles.shiftStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.shiftStatusText, { color: colors.success }]}>وردية مفتوحة</Text>
            </View>
            <View style={styles.shiftGrid}>
              <ShiftStat label="رصيد الافتتاح" value={formatCurrency(activeShift.openingCash, settings.currency)} colors={colors} />
              <ShiftStat label="مبيعات نقدية" value={formatCurrency(shiftSales, settings.currency)} colors={colors} colorsValue={colors.success} />
              <ShiftStat label="مصروفات" value={formatCurrency(shiftExpenses, settings.currency)} colors={colors} colorsValue={colors.danger} />
              <ShiftStat label="النقدية المتوقعة" value={formatCurrency(expectedCash, settings.currency)} colors={colors} colorsValue={colors.primary} />
            </View>
            <View style={styles.shiftTimeRow}>
              <Clock size={12} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.shiftTime, { color: colors.textMuted }]}>
                فُتحت: {formatDateTime(activeShift.openedAt)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowCloseModal(true)}
              style={[styles.closeShiftBtn, { backgroundColor: colors.danger }]}
              activeOpacity={0.7}
            >
              <Square size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.closeShiftText}>إغلاق الوردية</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.noShiftCard, { backgroundColor: colors.surface }]}>
            <Wallet size={40} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.noShiftTitle, { color: colors.text }]}>لا توجد وردية مفتوحة</Text>
            <Text style={[styles.noShiftHint, { color: colors.textMuted }]}>افتح وردية جديدة لبدء تسجيل المبيعات والمصروفات</Text>
            <TouchableOpacity
              onPress={() => setShowOpenModal(true)}
              style={[styles.openShiftBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.7}
            >
              <Play size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.openShiftText}>فتح وردية جديدة</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Quick Stats */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ملخص اليوم</Text>
        <View style={styles.quickGrid}>
          <QuickCard icon={<TrendingUp size={18} color="#FFFFFF" strokeWidth={2} />} label="مبيعات اليوم" value={formatCurrency(stats.todaySales, settings.currency)} bg={colors.primary} colors={colors} />
          <QuickCard icon={<Wallet size={18} color="#FFFFFF" strokeWidth={2} />} label="مصروفات اليوم" value={formatCurrency(stats.todayExpenses, settings.currency)} bg={colors.danger} colors={colors} />
          <QuickCard icon={<Receipt size={18} color="#FFFFFF" strokeWidth={2} />} label="عدد المعاملات" value={stats.todayTransactions.toString()} bg={colors.info} colors={colors} />
          <QuickCard icon={<AlertTriangle size={18} color="#FFFFFF" strokeWidth={2} />} label="صافي اليوم" value={formatCurrency(stats.todaySales - stats.todayExpenses, settings.currency)} bg={colors.success} colors={colors} />
        </View>
      </View>

      {/* Expenses */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>المصروفات ({todayExpenses.length})</Text>
          {activeShift && (
            <TouchableOpacity onPress={() => setShowExpenseModal(true)} style={[styles.addExpenseBtn, { backgroundColor: colors.danger + '15' }]}>
              <Plus size={16} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.addExpenseText, { color: colors.danger }]}>مصروف جديد</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.expenseList, { backgroundColor: colors.surface }]}>
          {todayExpenses.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مصروفات اليوم</Text>
          ) : (
            todayExpenses.slice(0, 15).map((e, i) => (
              <View key={e.id} style={[styles.expenseRow, i < Math.min(todayExpenses.length, 15) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.expenseIcon, { backgroundColor: colors.danger + '15' }]}>
                  <Wallet size={16} color={colors.danger} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expenseCategory, { color: colors.text }]}>{e.category}</Text>
                  {e.description ? <Text style={[styles.expenseDesc, { color: colors.textMuted }]} numberOfLines={1}>{e.description}</Text> : null}
                  <Text style={[styles.expenseTime, { color: colors.textMuted }]}>{formatDateTime(e.createdAt)}</Text>
                </View>
                <Text style={[styles.expenseAmount, { color: colors.danger }]}>
                  -{formatCurrency(e.amount, settings.currency)}
                </Text>
                <TouchableOpacity onPress={() => deleteExpense(e.id)} style={styles.deleteExpenseBtn}>
                  <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>

      {/* Shift History */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>سجل الورديات ({shifts.filter((s) => s.status === 'closed').length})</Text>
        {shifts.filter((s) => s.status === 'closed').length === 0 ? (
          <View style={[styles.emptyShifts, { backgroundColor: colors.surface }]}>
            <EmptyState icon={<Clock size={32} color={colors.textMuted} strokeWidth={2} />} title="لا يوجد سجل ورديات" subtitle="ستظهر هنا الورديات المغلقة" />
          </View>
        ) : (
          <View style={styles.shiftHistory}>
            {shifts.filter((s) => s.status === 'closed').slice(0, 10).map((s) => (
              <View key={s.id} style={[styles.shiftHistoryCard, { backgroundColor: colors.surface }]}>
                <View style={styles.shiftHistoryHeader}>
                  <Text style={[styles.shiftHistoryDate, { color: colors.text }]}>
                    {formatDateTime(s.openedAt)}
                  </Text>
                  <View style={[styles.diffBadge, { backgroundColor: (s.difference ?? 0) === 0 ? colors.success + '15' : (s.difference ?? 0) > 0 ? colors.warning + '15' : colors.danger + '15' }]}>
                    <Text style={[styles.diffText, { color: (s.difference ?? 0) === 0 ? colors.success : (s.difference ?? 0) > 0 ? colors.warning : colors.danger }]}>
                      الفرق: {formatCurrency(s.difference ?? 0, settings.currency)}
                    </Text>
                  </View>
                </View>
                <View style={styles.shiftHistoryGrid}>
                  <Text style={[styles.shiftHistoryStat, { color: colors.textMuted }]}>
                    افتتاح: {formatCurrency(s.openingCash, settings.currency)}
                  </Text>
                  <Text style={[styles.shiftHistoryStat, { color: colors.textMuted }]}>
                    إغلاق: {formatCurrency(s.closingCash ?? 0, settings.currency)}
                  </Text>
                  <Text style={[styles.shiftHistoryStat, { color: colors.textMuted }]}>
                    متوقع: {formatCurrency(s.expectedCash ?? 0, settings.currency)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Open Shift Modal */}
      <BaseModal
        visible={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        title="فتح وردية جديدة"
        footer={
          <TouchableOpacity onPress={handleOpenShift} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.7}>
            <Play size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>فتح الوردية</Text>
          </TouchableOpacity>
        }
      >
        <View style={[styles.infoBox, { backgroundColor: colors.primary + '10' }]}>
          <Clock size={20} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.primary }]}>أدخل المبلغ النقدي المتوفر في الخزينة الآن</Text>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>رصيد الافتتاح ({settings.currency})</Text>
        <TextInput
          value={openingCash}
          onChangeText={setOpeningCash}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 24, fontWeight: '700', textAlign: 'center' }]}
        />
      </BaseModal>

      {/* Close Shift Modal */}
      <BaseModal
        visible={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        title="إغلاق الوردية"
        footer={
          <TouchableOpacity onPress={handleCloseShift} style={[styles.saveBtn, { backgroundColor: colors.danger }]} activeOpacity={0.7}>
            <Square size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>تأكيد الإغلاق</Text>
          </TouchableOpacity>
        }
      >
        <View style={[styles.expectedBox, { backgroundColor: colors.info + '12' }]}>
          <Text style={[styles.expectedLabel, { color: colors.textSecondary }]}>النقدية المتوقعة في الخزينة:</Text>
          <Text style={[styles.expectedValue, { color: colors.info }]}>{formatCurrency(expectedCash, settings.currency)}</Text>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>النقدية الفعلية ({settings.currency})</Text>
        <TextInput
          value={closingCash}
          onChangeText={setClosingCash}
          placeholder={expectedCash.toString()}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 24, fontWeight: '700', textAlign: 'center' }]}
        />
      </BaseModal>

      {/* Close Result Modal */}
      <BaseModal
        visible={closeResult !== null}
        onClose={() => setCloseResult(null)}
        title="نتيجة إغلاق الوردية"
      >
        {closeResult && (
          <View>
            <View style={[styles.resultBox, { backgroundColor: closeResult.diff === 0 ? colors.success + '12' : closeResult.diff > 0 ? colors.warning + '12' : colors.danger + '12' }]}>
              {closeResult.diff === 0 ? (
                <Check size={48} color={colors.success} strokeWidth={2} />
              ) : (
                <AlertTriangle size={48} color={closeResult.diff > 0 ? colors.warning : colors.danger} strokeWidth={2} />
              )}
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {closeResult.diff === 0 ? 'الخزينة متوازنة' : closeResult.diff > 0 ? 'زيادة في الخزينة' : 'عجز في الخزينة'}
              </Text>
              <Text style={[styles.resultDiff, { color: closeResult.diff === 0 ? colors.success : closeResult.diff > 0 ? colors.warning : colors.danger }]}>
                {closeResult.diff > 0 ? '+' : ''}{formatCurrency(closeResult.diff, settings.currency)}
              </Text>
            </View>
            <View style={styles.resultDetails}>
              <ResultRow label="النقدية المتوقعة" value={formatCurrency(closeResult.expected, settings.currency)} colors={colors} />
              <ResultRow label="النقدية الفعلية" value={formatCurrency(closeResult.actual, settings.currency)} colors={colors} />
            </View>
          </View>
        )}
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
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>المبلغ ({settings.currency})</Text>
        <TextInput
          value={expenseAmount}
          onChangeText={setExpenseAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16 }]}
        />
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>التصنيف</Text>
        <View style={styles.categoryRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>الوصف (اختياري)</Text>
        <TextInput
          value={expenseDesc}
          onChangeText={setExpenseDesc}
          placeholder="تفاصيل المصروف..."
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </BaseModal>
    </ScrollView>
  );
}

function ShiftStat({ label, value, colors, colorsValue }: { label: string; value: string; colors: Colors; colorsValue?: string }) {
  return (
    <View style={styles.shiftStatBox}>
      <Text style={[styles.shiftStatLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.shiftStatValue, { color: colorsValue ?? colors.text }]}>{value}</Text>
    </View>
  );
}

function QuickCard({ icon, label, value, bg, colors }: { icon: React.ReactNode; label: string; value: string; bg: string; colors: Colors }) {
  return (
    <View style={[styles.quickCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.quickIcon, { backgroundColor: bg }]}>{icon}</View>
      <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.quickValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ResultRow({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultRowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.resultRowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  shiftCard: { borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  shiftStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  shiftStatusText: { fontSize: 15, fontWeight: '700' },
  shiftGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  shiftStatBox: { width: '50%', marginBottom: 10 },
  shiftStatLabel: { fontSize: 12, marginBottom: 4 },
  shiftStatValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  shiftTime: { fontSize: 12, marginBottom: 14 },
  shiftTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  closeShiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  closeShiftText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  noShiftCard: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 10 },
  noShiftTitle: { fontSize: 18, fontWeight: '700' },
  noShiftHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  openShiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 8, paddingHorizontal: 28 },
  openShiftText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { flex: 1, minWidth: '46%', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  quickIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 12, marginBottom: 4 },
  quickValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  addExpenseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  addExpenseText: { fontSize: 12, fontWeight: '600' },
  expenseList: { borderRadius: 16, overflow: 'hidden' },
  emptyText: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  expenseIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  expenseCategory: { fontSize: 14, fontWeight: '600' },
  expenseDesc: { fontSize: 12, marginTop: 2 },
  expenseTime: { fontSize: 11, marginTop: 2 },
  expenseAmount: { fontSize: 14, fontWeight: '700' },
  deleteExpenseBtn: { padding: 4 },
  emptyShifts: { borderRadius: 16, padding: 20 },
  shiftHistory: { gap: 10 },
  shiftHistoryCard: { borderRadius: 14, padding: 14 },
  shiftHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  shiftHistoryDate: { fontSize: 13, fontWeight: '600' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  diffText: { fontSize: 12, fontWeight: '700' },
  shiftHistoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shiftHistoryStat: { fontSize: 12, marginEnd: 12 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  infoText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  expectedBox: { borderRadius: 14, padding: 16, alignItems: 'center' },
  expectedLabel: { fontSize: 13, marginBottom: 6 },
  expectedValue: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  resultBox: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 12, marginBottom: 16 },
  resultTitle: { fontSize: 18, fontWeight: '700' },
  resultDiff: { fontSize: 28, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  resultDetails: { gap: 8 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  resultRowLabel: { fontSize: 14 },
  resultRowValue: { fontSize: 14, fontWeight: '700' },
  categoryRow: { flexDirection: 'row' },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginEnd: 8 },
  categoryText: { fontSize: 13, fontWeight: '600' },
});
