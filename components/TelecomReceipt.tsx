import { StyleSheet, View, Text, TouchableOpacity, Modal, Pressable, ScrollView, Platform, Image } from 'react-native';
import { X, Printer, Check, MessageSquare } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { TelecomSale, Settings } from '@/types';

interface TelecomReceiptProps {
  visible: boolean;
  sale: TelecomSale | null;
  settings: Settings;
  onClose: () => void;
}

export function TelecomReceipt({ visible, sale, settings, onClose }: TelecomReceiptProps) {
  const { colors } = useTheme();

  if (!sale || !visible) return null;

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      window.print();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Printer size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.title, { color: colors.text }]}>وصل المعاملة</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={[styles.receipt, { backgroundColor: colors.bg }]}>
              <View style={styles.receiptInner}>
                {settings.receiptLogo ? (
                  <Image source={{ uri: settings.receiptLogo }} style={styles.receiptLogo} resizeMode="contain" />
                ) : null}
                <Text style={[styles.receiptStore, { color: colors.text }]}>{settings.storeName}</Text>
                {settings.receiptHeaderText ? (
                  <Text style={[styles.receiptHeaderText, { color: colors.textSecondary }]}>{settings.receiptHeaderText}</Text>
                ) : null}
                <Text style={[styles.receiptDate, { color: colors.textSecondary }]}>
                  {formatDateTime(sale.createdAt)}
                </Text>
                <Text style={[styles.receiptId, { color: colors.textMuted }]}>
                  رقم: {sale.id.slice(-8).toUpperCase()}
                </Text>

                <View style={[styles.receiptDivider, { borderTopColor: colors.border }]} />

                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الشركة:</Text>
                  <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.companyName}</Text>
                </View>
                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الشركة الفرعية:</Text>
                  <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.subAgentName}</Text>
                </View>
                {sale.simName ? (
                  <View style={styles.receiptLine}>
                    <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الشريحة:</Text>
                    <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.simName}</Text>
                  </View>
                ) : null}
                {sale.bundleName ? (
                  <View style={styles.receiptLine}>
                    <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الحزمة:</Text>
                    <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.bundleName}</Text>
                  </View>
                ) : null}
                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>رقم الهاتف:</Text>
                  <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.simNumber}</Text>
                </View>
                {sale.barcode ? (
                  <View style={styles.receiptLine}>
                    <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الباركود:</Text>
                    <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.barcode}</Text>
                  </View>
                ) : null}

                <View style={[styles.receiptDivider, { borderTopColor: colors.border }]} />

                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الزبون:</Text>
                  <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.customerName}</Text>
                </View>
                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الهاتف:</Text>
                  <Text style={[styles.receiptValue, { color: colors.text }]}>{sale.customerPhone}</Text>
                </View>

                <View style={[styles.receiptDivider, { borderTopColor: colors.border }]} />

                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>الإجمالي:</Text>
                  <Text style={[styles.receiptTotalValue, { color: colors.text }]}>
                    {formatCurrency(sale.total, settings.currency)}
                  </Text>
                </View>
                <View style={styles.receiptLine}>
                  <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>المدفوع:</Text>
                  <Text style={[styles.receiptValue, { color: colors.success }]}>
                    {formatCurrency(sale.paid, settings.currency)}
                  </Text>
                </View>
                {sale.remaining > 0 && (
                  <View style={styles.receiptLine}>
                    <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>المتبقي (دين):</Text>
                    <Text style={[styles.receiptValue, { color: colors.danger }]}>
                      {formatCurrency(sale.remaining, settings.currency)}
                    </Text>
                  </View>
                )}

                {sale.notes ? (
                  <>
                    <View style={[styles.receiptDivider, { borderTopColor: colors.border }]} />
                    <Text style={[styles.receiptLabel, { color: colors.textSecondary }]}>ملاحظات:</Text>
                    <Text style={[styles.receiptValue, { color: colors.text, textAlign: 'center', marginTop: 4 }]}>
                      {sale.notes}
                    </Text>
                  </>
                ) : null}

                <View style={[styles.receiptDivider, { borderTopColor: colors.border }]} />

                <Text style={[styles.receiptThanks, { color: colors.textSecondary }]}>
                  شكراً لزيارتكم
                </Text>
                {settings.receiptFooterText ? (
                  <Text style={[styles.receiptFooterText, { color: colors.textMuted }]}>
                    {settings.receiptFooterText}
                  </Text>
                ) : null}

                {sale.smsSent && (
                  <View style={[styles.smsBadge, { backgroundColor: colors.success + '15' }]}>
                    <Check size={12} color={colors.success} strokeWidth={2.5} />
                    <Text style={[styles.smsBadgeText, { color: colors.success }]}>تم إرسال SMS</Text>
                  </View>
                )}
                {sale.autoRenew && (
                  <View style={[styles.smsBadge, { backgroundColor: colors.info + '15' }]}>
                    <MessageSquare size={12} color={colors.info} strokeWidth={2.5} />
                    <Text style={[styles.smsBadgeText, { color: colors.info }]}>تجديد تلقائي مفعّل</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnText, { color: colors.text }]}>إغلاق</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePrint}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Printer size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.actionBtnTextWhite}>طباعة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { padding: 20, paddingBottom: 32 },
  receipt: { borderRadius: 12, overflow: 'hidden', padding: 20 },
  receiptInner: { alignItems: 'center' },
  receiptStore: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 4 },
  receiptLogo: { width: 56, height: 56, marginBottom: 8, borderRadius: 8 },
  receiptHeaderText: { fontSize: 11, textAlign: 'center', marginBottom: 4, fontFamily: 'Cairo-Regular' },
  receiptFooterText: { fontSize: 11, textAlign: 'center', marginTop: 6, fontFamily: 'Cairo-Regular', lineHeight: 16 },
  receiptDate: { fontSize: 12, marginBottom: 2 },
  receiptId: { fontSize: 11, marginBottom: 8 },
  receiptDivider: { width: '100%', borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 8 },
  receiptLine: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 2 },
  receiptLabel: { fontSize: 13 },
  receiptValue: { fontSize: 13, fontWeight: '600' },
  receiptTotalValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  receiptThanks: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  smsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 8 },
  smsBadgeText: { fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, padding: 20, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  actionBtnTextWhite: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
