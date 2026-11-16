import { StyleSheet, View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import {
  Tag, Plus, Trash2, Edit2, Check, Calendar,
  Percent, Gift, Package,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/format';
import type { Promotion, PromotionType } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function PromotionsScreen() {
  const { promotions, addPromotion, updatePromotion, deletePromotion, settings } = useApp();
  const { colors } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editPromo, setEditPromo] = useState<Promotion | null>(null);

  if (!settings.enablePromotions) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>العروض والتخفيضات</Text>
        </View>
        <View style={styles.disabledWrap}>
          <EmptyState
            icon={<Tag size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="الميزة معطّلة"
            subtitle="فعّل محرك العروض من الإعدادات"
          />
        </View>
      </View>
    );
  }

  const now = Date.now();
  const activeCount = promotions.filter((p) => p.active && now >= p.startDate && now <= p.endDate).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>العروض والتخفيضات</Text>
        <View style={[styles.activeBadge, { backgroundColor: colors.success + '20' }]}>
          <Tag size={14} color={colors.success} strokeWidth={2} />
          <Text style={[styles.activeText, { color: colors.success }]}>{activeCount} نشط</Text>
        </View>
      </View>

      <FlatList
        data={promotions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <EmptyState
            icon={<Tag size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="لا توجد عروض"
            subtitle="أنشئ عرضاً ترويجياً لتطبيقه تلقائياً في نقطة البيع"
          />
        }
        renderItem={({ item }) => {
          const isActive = item.active && now >= item.startDate && now <= item.endDate;
          const isExpired = now > item.endDate;
          return (
            <View style={[styles.promoCard, { backgroundColor: colors.surface }]}>
              <View style={styles.promoHeader}>
                <View style={[styles.promoIcon, { backgroundColor: isActive ? colors.success + '20' : isExpired ? colors.danger + '20' : colors.surfaceAlt }]}>
                  {item.type === 'bogo' ? <Gift size={20} color={isActive ? colors.success : isExpired ? colors.danger : colors.textMuted} strokeWidth={2} /> :
                   item.type === 'bundle' ? <Package size={20} color={isActive ? colors.success : isExpired ? colors.danger : colors.textMuted} strokeWidth={2} /> :
                   <Percent size={20} color={isActive ? colors.success : isExpired ? colors.danger : colors.textMuted} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.promoDesc, { color: colors.textMuted }]}>
                    {item.type === 'bogo'
                      ? `اشترِ ${item.buyQty} واحصل على ${item.freeQty} مجاناً`
                      : item.type === 'discount'
                        ? `خصم ${item.value}%${item.category ? ` - ${item.category}` : ' - جميع المنتجات'}`
                        : 'عرض حزم'}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isActive ? colors.success + '20' : isExpired ? colors.danger + '20' : colors.warning + '20' }]}>
                  <Text style={[styles.statusText, { color: isActive ? colors.success : isExpired ? colors.danger : colors.warning }]}>
                    {isActive ? 'نشط' : isExpired ? 'منتهي' : 'مجدول'}
                  </Text>
                </View>
              </View>
              <View style={[styles.promoFooter, { borderTopColor: colors.border }]}>
                <View style={styles.dateRow}>
                  <Calendar size={14} color={colors.textMuted} strokeWidth={2} />
                  <Text style={[styles.dateText, { color: colors.textMuted }]}>
                    {formatDateTime(item.startDate)} - {formatDateTime(item.endDate)}
                  </Text>
                </View>
                <View style={styles.promoActions}>
                  <TouchableOpacity
                    onPress={() => updatePromotion(item.id, { active: !item.active })}
                    style={[styles.toggleBtn, { backgroundColor: item.active ? colors.success + '15' : colors.surfaceAlt }]}
                  >
                    <Text style={[styles.toggleText, { color: item.active ? colors.success : colors.textMuted }]}>
                      {item.active ? 'إيقاف' : 'تفعيل'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditPromo(item); setShowForm(true); }}
                    style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt }]}
                  >
                    <Edit2 size={16} color={colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deletePromotion(item.id)}
                    style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]}
                  >
                    <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />

      <TouchableOpacity
        onPress={() => { setEditPromo(null); setShowForm(true); }}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <PromotionFormModal
        visible={showForm}
        editPromo={editPromo}
        colors={colors}
        onClose={() => setShowForm(false)}
        onSave={(data) => {
          if (editPromo) {
            updatePromotion(editPromo.id, data);
          } else {
            addPromotion(data);
          }
          setShowForm(false);
        }}
      />
    </View>
  );
}

function PromotionFormModal({ visible, editPromo, colors, onClose, onSave }: {
  visible: boolean;
  editPromo: Promotion | null;
  colors: Colors;
  onClose: () => void;
  onSave: (data: Omit<Promotion, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PromotionType>('discount');
  const [value, setValue] = useState('10');
  const [category, setCategory] = useState('');
  const [buyQty, setBuyQty] = useState('2');
  const [freeQty, setFreeQty] = useState('1');
  const [startDays, setStartDays] = useState('0');
  const [endDays, setEndDays] = useState('30');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(editPromo?.name ?? '');
      setType(editPromo?.type ?? 'discount');
      setValue(editPromo?.value.toString() ?? '10');
      setCategory(editPromo?.category ?? '');
      setBuyQty(editPromo?.buyQty.toString() ?? '2');
      setFreeQty(editPromo?.freeQty.toString() ?? '1');
      if (editPromo) {
        const now = Date.now();
        const dayMs = 86400000;
        setStartDays(Math.round((editPromo.startDate - now) / dayMs).toString());
        setEndDays(Math.round((editPromo.endDate - now) / dayMs).toString());
      } else {
        setStartDays('0');
        setEndDays('30');
      }
      setError('');
    }
  }, [visible, editPromo]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم العرض مطلوب'); return; }
    const now = Date.now();
    const dayMs = 86400000;
    const startDate = now + (parseInt(startDays) || 0) * dayMs;
    const endDate = now + (parseInt(endDays) || 30) * dayMs;
    if (endDate <= startDate) { setError('تاريخ الانتهاء يجب أن يكون بعد البداية'); return; }
    onSave({
      name: name.trim(),
      type,
      value: parseFloat(value) || 0,
      category: category.trim(),
      buyQty: parseInt(buyQty) || 1,
      freeQty: parseInt(freeQty) || 1,
      startDate,
      endDate,
      active: editPromo?.active ?? true,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editPromo ? 'تعديل العرض' : 'عرض جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>حفظ</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم العرض</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="مثال: خصم الصيف"
        placeholderTextColor={colors.textMuted}
        style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>نوع العرض</Text>
      <View style={styles.typeRow}>
        <TypeBtn icon={<Percent size={18} color={type === 'discount' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />} label="خصم %" selected={type === 'discount'} onPress={() => setType('discount')} colors={colors} />
        <TypeBtn icon={<Gift size={18} color={type === 'bogo' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />} label="اشترِ واحصل" selected={type === 'bogo'} onPress={() => setType('bogo')} colors={colors} />
      </View>

      {type === 'discount' && (
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>نسبة الخصم %</Text>
            <TextInput value={value} onChangeText={setValue} placeholder="10" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>الفئة (اختياري)</Text>
            <TextInput value={category} onChangeText={setCategory} placeholder="جميع الفئات" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
        </View>
      )}

      {type === 'bogo' && (
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>اشترِ (عدد)</Text>
            <TextInput value={buyQty} onChangeText={setBuyQty} placeholder="2" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>احصل على (مجاناً)</Text>
            <TextInput value={freeQty} onChangeText={setFreeQty} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
        </View>
      )}

      {type === 'bogo' && (
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>الفئة (اختياري)</Text>
          <TextInput value={category} onChangeText={setCategory} placeholder="جميع الفئات" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
      )}

      <View style={styles.formRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>يبدأ بعد (أيام)</Text>
          <TextInput value={startDays} onChangeText={setStartDays} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>ينتهي بعد (أيام)</Text>
          <TextInput value={endDays} onChangeText={setEndDays} placeholder="30" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
      </View>
    </BaseModal>
  );
}

function TypeBtn({ icon, label, selected, onPress, colors }: {
  icon: React.ReactNode; label: string; selected: boolean; onPress: () => void; colors: Colors;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.typeBtn, selected ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
    >
      {icon}
      <Text style={[styles.typeBtnText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  activeText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  disabledWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  promoCard: { borderRadius: 14, padding: 14, marginBottom: 10 },
  promoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  promoIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  promoName: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  promoDesc: { fontSize: 13, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  promoFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dateText: { fontSize: 11 },
  promoActions: { flexDirection: 'row', gap: 8 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleText: { fontSize: 12, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  formRow: { flexDirection: 'row', gap: 10 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  typeBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center', fontFamily: 'Cairo-SemiBold' },
});
