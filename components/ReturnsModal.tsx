import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useState, useMemo } from 'react';
import { Undo2, Trash2 } from 'lucide-react-native';
import { BaseModal } from '@/components/BaseModal';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency } from '@/lib/format';
import type { Transaction } from '@/types';

interface ReturnsModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  productNames: Record<string, string>;
  currency: string;
  onSubmit: (items: { productId: string; quantity: number }[], reason: string) => void;
}

const RETURN_REASONS = [
  { value: 'defective', label: 'عيب/تالف' },
  { value: 'wrong_item', label: 'صنف خاطئ' },
  { value: 'customer_return', label: 'إرجاع من الزبون' },
  { value: 'expired', label: 'منتهي الصلاحية' },
  { value: 'other', label: 'أخرى' },
];

export function ReturnsModal({ visible, onClose, transaction, productNames, currency, onSubmit }: ReturnsModalProps) {
  const { colors } = useTheme();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');

  const txnItems = useMemo(() => transaction?.items ?? [], [transaction]);

  const reset = () => {
    setQuantities({});
    setReason('');
  };

  const handleSubmit = () => {
    const items = txnItems
      .filter((it) => (quantities[it.productId] ?? 0) > 0)
      .map((it) => ({ productId: it.productId, quantity: quantities[it.productId] }));
    if (items.length === 0 || !reason) return;
    onSubmit(items, reason);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const totalRefund = useMemo(
    () => txnItems.reduce((sum, it) => sum + (quantities[it.productId] ?? 0) * it.price, 0),
    [txnItems, quantities],
  );

  return (
    <BaseModal visible={visible} onClose={handleClose} title="مرتجع / تالف">
      {!transaction ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>لا يوجد فاتورة محددة</Text>
      ) : (
        <View style={styles.content}>
          <View style={[styles.txnInfo, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.txnId, { color: colors.text }]}>
              فاتورة #{transaction.id.slice(-6)}
            </Text>
            <Text style={[styles.txnTotal, { color: colors.primary }]}>
              {formatCurrency(transaction.total, currency)}
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>اختر الكميات المرتجعة:</Text>
          <ScrollView style={styles.itemsList}>
            {txnItems.map((it) => {
              const qty = quantities[it.productId] ?? 0;
              const max = it.quantity;
              return (
                <View key={it.productId} style={[styles.itemRow, { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
                      {productNames[it.productId] ?? it.name}
                    </Text>
                    <Text style={[styles.itemMax, { color: colors.textMuted }]}>
                      الكمية المشتراة: {it.quantity}
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <QuantityStepper
                      value={qty}
                      onDecrement={() => setQuantities((p) => ({ ...p, [it.productId]: Math.max(0, (p[it.productId] ?? 0) - 1) }))}
                      onIncrement={() => setQuantities((p) => ({ ...p, [it.productId]: Math.min(max, (p[it.productId] ?? 0) + 1) }))}
                      min={0}
                    />
                    <Text style={[styles.itemAmount, { color: colors.primary }]}>
                      {formatCurrency(qty * it.price, currency)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>سبب الإرجاع:</Text>
          <View style={styles.reasonsRow}>
            {RETURN_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => setReason(r.value)}
                style={[
                  styles.reasonChip,
                  { backgroundColor: reason === r.value ? colors.primary : colors.surfaceAlt, borderColor: reason === r.value ? colors.primary : colors.border },
                ]}
              >
                <Text style={[styles.reasonText, { color: reason === r.value ? '#FFFFFF' : colors.text }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>إجمالي المبلغ المرتجع:</Text>
            <Text style={[styles.totalValue, { color: colors.danger }]}>
              {formatCurrency(totalRefund, currency)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={totalRefund === 0 || !reason}
            style={[
              styles.submitBtn,
              { backgroundColor: totalRefund === 0 || !reason ? colors.border : colors.danger },
            ]}
            activeOpacity={0.7}
          >
            <Trash2 size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.submitText}>تأكيد المرتجع</Text>
          </TouchableOpacity>
        </View>
      )}
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 16 },
  empty: { textAlign: 'center', paddingVertical: 40, fontSize: 15 },
  txnInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, padding: 12, marginBottom: 16 },
  txnId: { fontSize: 15, fontWeight: '700' },
  txnTotal: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  itemsList: { maxHeight: 240 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 12, marginBottom: 8 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  itemMax: { fontSize: 12 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemAmount: { fontSize: 13, fontWeight: '700', minWidth: 70, textAlign: 'left' },
  reasonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  reasonChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  reasonText: { fontSize: 13, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, marginBottom: 16 },
  totalLabel: { fontSize: 15, fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
