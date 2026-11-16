import { StyleSheet, View, Text, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import {
  Truck, Plus, Search, Trash2, Pencil, Phone, Wallet,
  Building2, Check,
} from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Supplier } from '@/types';
import { OmniSearchBar } from '@/components/OmniSearchBar';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function SuppliersScreen() {
  const { settings } = useApp();

  if (settings.businessMode === 'telecom') {
    return <RetailSuppliers />;
  }

  return <RetailSuppliers />;
}

function RetailSuppliers() {
  const { suppliers, transactions, addSupplier, updateSupplier, deleteSupplier, recordSupplierPayment, settings } = useApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [preselectAmount, setPreselectAmount] = useState('');
  const searchParams = useLocalSearchParams<{ paymentAmount?: string; senderName?: string; recipientName?: string }>();

  // Handle deep link from screenshot detection — pre-fill payment amount
  useEffect(() => {
    if (!searchParams.paymentAmount) return;
    const amount = searchParams.paymentAmount;
    setPreselectAmount(amount);

    // Try to match sender/recipient name to an existing supplier
    const nameParam = searchParams.senderName || searchParams.recipientName || '';
    if (nameParam) {
      const matched = suppliers.find(
        (s) => s.name.trim().toLowerCase() === nameParam.trim().toLowerCase()
      );
      if (matched) {
        setPaymentSupplier(matched);
        return;
      }
    }

    // If no supplier matched, show a prompt to select one
    if (suppliers.length > 0) {
      setPaymentSupplier(suppliers[0]);
    }
  }, [searchParams.paymentAmount, searchParams.senderName, searchParams.recipientName, suppliers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.company.toLowerCase().includes(q));
  }, [suppliers, search]);

  const totalBalance = suppliers.reduce((s, sup) => s + sup.balance, 0);

  const handleSave = (data: { name: string; phone: string; company: string; notes: string }) => {
    if (editSupplier) {
      updateSupplier(editSupplier.id, data);
    } else {
      addSupplier(data);
    }
    setShowForm(false);
    setEditSupplier(null);
  };

  const supplierTxns = useMemo(() => {
    if (!paymentSupplier) return [];
    return transactions
      .filter((t) => t.supplierId === paymentSupplier!.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
  }, [paymentSupplier, transactions]);

  const renderItem = ({ item }: { item: Supplier }) => (
    <TouchableOpacity
      onPress={() => setPaymentSupplier(item)}
      activeOpacity={0.7}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: item.balance > 0 ? colors.danger + '20' : colors.success + '20' }]}>
          <Building2 size={20} color={item.balance > 0 ? colors.danger : colors.success} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          {item.company ? <Text style={[styles.company, { color: colors.textMuted }]}>{item.company}</Text> : null}
          <View style={styles.phoneRow}>
            <Phone size={11} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.phone, { color: colors.textMuted }]}>{item.phone}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <View style={[styles.balancePill, { backgroundColor: item.balance > 0 ? colors.danger + '15' : colors.success + '15' }]}>
          <Wallet size={14} color={item.balance > 0 ? colors.danger : colors.success} strokeWidth={2} />
          <Text style={[styles.balanceText, { color: item.balance > 0 ? colors.danger : colors.success }]}>
            {item.balance > 0 ? `مستحق: ${formatCurrency(item.balance, settings.currency)}` : 'خالص'}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => setEditSupplier(item)} style={[styles.iconBtn, { backgroundColor: colors.surfaceAlt }]}>
            <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDeleteTarget(item)} style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]}>
            <Trash2 size={15} color={colors.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.miniStat}>
          <Truck size={18} color={colors.primary} strokeWidth={2} />
          <View>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>الموردون</Text>
            <Text style={[styles.miniValue, { color: colors.text }]}>{suppliers.length}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.miniStat}>
          <Wallet size={18} color={colors.danger} strokeWidth={2} />
          <View>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>إجمالي المستحقات</Text>
            <Text style={[styles.miniValue, { color: colors.danger }]}>{formatCurrency(totalBalance, settings.currency)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchArea}>
        <OmniSearchBar value={search} onChangeText={setSearch} placeholder="ابحث عن مورد..." />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          {suppliers.length === 0 ? (
            <EmptyState
              icon={<Truck size={32} color={colors.primary} strokeWidth={2} />}
              title="لا يوجد موردون"
              subtitle="أضف موردينك لإدارة حساباتهم وفواتير المشتريات"
              actionLabel="إضافة مورد"
              onAction={() => { setEditSupplier(null); setShowForm(true); }}
            />
          ) : (
            <EmptyState icon={<Search size={32} color={colors.textMuted} strokeWidth={2} />} title="لا نتائج" subtitle="جرّب كلمة بحث أخرى" />
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity
        onPress={() => { setEditSupplier(null); setShowForm(true); }}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <SupplierFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditSupplier(null); }}
        onSave={handleSave}
        editSupplier={editSupplier}
        colors={colors}
      />

      {/* Supplier Detail / Payment Modal */}
      <BaseModal
        visible={paymentSupplier !== null}
        onClose={() => setPaymentSupplier(null)}
        title="حساب المورد"
      >
        {paymentSupplier && (
          <View>
            <View style={styles.detailHeader}>
              <View style={[styles.avatarLarge, { backgroundColor: paymentSupplier.balance > 0 ? colors.danger + '20' : colors.success + '20' }]}>
                <Building2 size={24} color={paymentSupplier.balance > 0 ? colors.danger : colors.success} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailName, { color: colors.text }]}>{paymentSupplier.name}</Text>
                {paymentSupplier.company ? <Text style={[styles.detailCompany, { color: colors.textMuted }]}>{paymentSupplier.company}</Text> : null}
                <View style={styles.detailPhoneRow}>
                  <Phone size={14} color={colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.detailPhone, { color: colors.textMuted }]}>{paymentSupplier.phone}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.balanceCard, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>الرصيد المستحق</Text>
              <Text style={[styles.balanceAmount, { color: paymentSupplier.balance > 0 ? colors.danger : colors.success }]}>
                {formatCurrency(paymentSupplier.balance, settings.currency)}
              </Text>
            </View>

            {paymentSupplier.notes ? (
              <View style={styles.notesSection}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ملاحظات</Text>
                <Text style={[styles.notesText, { color: colors.text }]}>{paymentSupplier.notes}</Text>
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 16, marginBottom: 8 }]}>
              آخر المعاملات ({supplierTxns.length})
            </Text>
            {supplierTxns.length === 0 ? (
              <Text style={[styles.noTxns, { color: colors.textMuted }]}>لا توجد معاملات</Text>
            ) : (
              <View style={[styles.txnList, { backgroundColor: colors.surfaceAlt, borderRadius: 14 }]}>
                {supplierTxns.map((t, i) => (
                  <View key={t.id} style={[styles.txnRow, i < supplierTxns.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View>
                      <Text style={[styles.txnType, { color: colors.text }]}>
                        {t.type === 'supplier_payment' ? 'تسديد' : t.type === 'purchase' ? 'مشتريات' : t.type}
                      </Text>
                      <Text style={[styles.txnDate, { color: colors.textMuted }]}>{formatDateTime(t.createdAt)}</Text>
                    </View>
                    <Text style={[styles.txnAmount, { color: t.type === 'supplier_payment' ? colors.success : colors.danger }]}>
                      {t.type === 'supplier_payment' ? '-' : '+'}{formatCurrency(t.type === 'supplier_payment' ? t.paid : t.total, settings.currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {paymentSupplier.balance > 0 && (
              <PaymentForm
                supplier={paymentSupplier}
                currency={settings.currency}
                colors={colors}
                preselectAmount={preselectAmount}
                onPay={(amount) => {
                  recordSupplierPayment(paymentSupplier.id, amount);
                  setPaymentSupplier(null);
                  setPreselectAmount('');
                }}
              />
            )}
          </View>
        )}
      </BaseModal>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="حذف المورد"
        message={`هل تريد حذف "${deleteTarget?.name}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteTarget) deleteSupplier(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function PaymentForm({ supplier, currency, colors, preselectAmount, onPay }: {
  supplier: Supplier;
  currency: string;
  colors: Colors;
  preselectAmount?: string;
  onPay: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(preselectAmount || supplier.balance.toString());

  useEffect(() => {
    if (preselectAmount) setAmount(preselectAmount);
  }, [preselectAmount]);

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 8 }]}>تسديد دفعة</Text>
      <View style={styles.payRow}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          style={[styles.payInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
        <TouchableOpacity
          onPress={() => onPay(parseFloat(amount) || 0)}
          style={[styles.payBtn, { backgroundColor: colors.success }]}
          activeOpacity={0.7}
        >
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.payBtnText}>تسديد</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => setAmount(supplier.balance.toString())}
        style={[styles.fullPayBtn, { borderColor: colors.success }]}
      >
        <Text style={[styles.fullPayText, { color: colors.success }]}>تسديد الكل ({formatCurrency(supplier.balance, currency)})</Text>
      </TouchableOpacity>
    </View>
  );
}

function SupplierFormModal({ visible, onClose, onSave, editSupplier, colors }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; phone: string; company: string; notes: string }) => void;
  editSupplier: Supplier | null;
  colors: Colors;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(editSupplier?.name ?? '');
      setPhone(editSupplier?.phone ?? '');
      setCompany(editSupplier?.company ?? '');
      setNotes(editSupplier?.notes ?? '');
      setError('');
    }
  }, [visible, editSupplier]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم المورد مطلوب'); return; }
    onSave({ name: name.trim(), phone: phone.trim(), company: company.trim(), notes: notes.trim() });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editSupplier ? 'تعديل مورد' : 'مورد جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>{editSupplier ? 'حفظ' : 'إضافة'}</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="اسم المورد" colors={colors}>
        <TextInput value={name} onChangeText={setName} placeholder="مثال: شركة الإمداد" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
      <FormField label="رقم الهاتف" colors={colors}>
        <TextInput value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
      <FormField label="اسم الشركة" colors={colors}>
        <TextInput value={company} onChangeText={setCompany} placeholder="اسم الشركة" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
      <FormField label="ملاحظات" colors={colors}>
        <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات..." placeholderTextColor={colors.textMuted} multiline style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
      </FormField>
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
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  miniStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniLabel: { fontSize: 11 },
  miniValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  divider: { width: 1, height: 28, marginHorizontal: 4 },
  searchArea: { paddingHorizontal: 16, paddingBottom: 8 },
  emptyWrap: { flex: 1 },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarLarge: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  company: { fontSize: 13, marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  phone: { fontSize: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  balanceText: { fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 80, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  textArea: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  detailCompany: { fontSize: 14, marginBottom: 4 },
  detailPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailPhone: { fontSize: 14 },
  balanceCard: { borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  balanceLabel: { fontSize: 13, marginBottom: 6 },
  balanceAmount: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  notesSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  notesText: { fontSize: 14, lineHeight: 20 },
  noTxns: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  txnList: { overflow: 'hidden' },
  txnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  txnType: { fontSize: 14, fontWeight: '600' },
  txnDate: { fontSize: 11, marginTop: 2 },
  txnAmount: { fontSize: 14, fontWeight: '700' },
  payRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  payInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  payBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  fullPayBtn: { paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  fullPayText: { fontSize: 13, fontWeight: '700' },
});
