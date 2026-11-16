import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { useState } from 'react';
import { X, Calculator } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency } from '@/lib/format';

interface CashCalculatorProps {
  visible: boolean;
  total: number;
  currency: string;
  onClose: () => void;
  onConfirm: (paidAmount: number) => void;
}

const DENOMINATIONS = [1, 5, 10, 20, 50, 100, 200];

export function CashCalculator({ visible, total, currency, onClose, onConfirm }: CashCalculatorProps) {
  const { colors } = useTheme();
  const [paid, setPaid] = useState(0);

  const reset = () => setPaid(0);

  const addDenomination = (value: number) => setPaid((p) => p + value);

  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);
  const canConfirm = paid >= total;

  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Calculator size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.title, { color: colors.text }]}>حاسبة الباقي السريعة</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {/* Amounts display */}
            <View style={styles.displayArea}>
              <View style={[styles.amountBox, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>الإجمالي المطلوب</Text>
                <Text style={[styles.amountValue, { color: colors.text }]}>{formatCurrency(total, currency)}</Text>
              </View>
              <View style={[styles.amountBox, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>المبلغ المدفوع</Text>
                <Text style={[styles.amountValue, { color: colors.primary }]}>{formatCurrency(paid, currency)}</Text>
              </View>
            </View>

            {/* Change / Remaining */}
            <View
              style={[
                styles.resultBox,
                { backgroundColor: remaining > 0 ? colors.warning + '15' : colors.success + '15' },
              ]}
            >
              {remaining > 0 ? (
                <>
                  <Text style={[styles.resultLabel, { color: colors.warning }]}>المتبقي على العميل</Text>
                  <Text style={[styles.resultValue, { color: colors.warning }]}>{formatCurrency(remaining, currency)}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.resultLabel, { color: colors.success }]}>الباقي للعميل</Text>
                  <Text style={[styles.resultValue, { color: colors.success }]}>{formatCurrency(change, currency)}</Text>
                </>
              )}
            </View>

            {/* Denominations */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>اضغط على الأوراق النقدية</Text>
            <View style={styles.denominations}>
              {DENOMINATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => addDenomination(d)}
                  style={[styles.denomBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.denomText, { color: colors.text }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                onPress={() => setPaid(total)}
                style={[styles.quickBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.7}
              >
                <Text style={styles.quickBtnText}>المبلغ بالضبط</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={reset}
                style={[styles.quickBtn, { backgroundColor: colors.surfaceAlt }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickBtnText, { color: colors.text }]}>تصفير</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm */}
            <TouchableOpacity
              onPress={() => { onConfirm(paid); reset(); }}
              disabled={!canConfirm}
              style={[styles.confirmBtn, { backgroundColor: canConfirm ? colors.primary : colors.border }]}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>تأكيد المبلغ المدفوع</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { padding: 20, paddingBottom: 32 },
  displayArea: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  amountBox: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  amountLabel: { fontSize: 12, marginBottom: 6 },
  amountValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  resultBox: { borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  resultLabel: { fontSize: 13, marginBottom: 4 },
  resultValue: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  denominations: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  denomBtn: { width: '30%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  denomText: { fontSize: 20, fontWeight: '700' },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  quickBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  quickBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  confirmBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
