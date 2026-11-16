import { StyleSheet, View, Text, TouchableOpacity, ScrollView, FlatList, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { Search, Trash2, Filter } from 'lucide-react-native';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/lib/theme-context';
import { formatDateTime } from '@/lib/format';
import type { AuditEntry, AuditAction } from '@/types';

interface AuditLogScreenProps {
  visible: boolean;
  onClose: () => void;
  entries: AuditEntry[];
  onClear: () => void;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  sale: 'عملية بيع',
  return: 'مرتجع',
  payment: 'تسديد دين',
  stock_adjust: 'تعديل مخزون',
  price_change: 'تغيير سعر',
  login: 'تسجيل دخول',
  backup: 'نسخ احتياطي',
  restore: 'استعادة',
  shift_open: 'فتح وردية',
  shift_close: 'إغلاق وردية',
  expense: 'مصروف',
  supplier_payment: 'تسديد مورد',
  stocktake: 'جرد مخزون',
  promotion: 'عرض ترويجي',
};

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'danger' | 'primary' | 'info'> = {
  create: 'success',
  sale: 'success',
  update: 'warning',
  price_change: 'warning',
  stock_adjust: 'warning',
  shift_open: 'warning',
  delete: 'danger',
  return: 'danger',
  shift_close: 'danger',
  expense: 'danger',
  payment: 'primary',
  supplier_payment: 'primary',
  backup: 'info',
  restore: 'info',
  login: 'info',
  stocktake: 'warning',
  promotion: 'primary',
};

export function AuditLogScreen({ visible, onClose, entries, onClear }: AuditLogScreenProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const colorFor = (k: string) => {
    const c = ACTION_COLORS[k];
    if (c === 'success') return colors.success;
    if (c === 'warning') return colors.warning;
    if (c === 'danger') return colors.danger;
    if (c === 'info') return colors.info;
    return colors.primary;
  };

  const filtered = useMemo(() => {
    return entries
      .filter((e) => filter === 'all' || e.action === filter)
      .filter((e) => {
        if (!search) return true;
        const label = ACTION_LABELS[e.action] ?? e.action;
        return label.includes(search) || e.description.includes(search);
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [entries, search, filter]);

  const filterOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'الكل' },
    { value: 'create', label: 'إضافات' },
    { value: 'update', label: 'تعديلات' },
    { value: 'delete', label: 'حذف' },
    { value: 'sale', label: 'مبيعات' },
    { value: 'return', label: 'مرتجع' },
    { value: 'payment', label: 'مدفوعات' },
  ];

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="سجل التدقيق"
      footer={
        <TouchableOpacity onPress={onClear} style={[styles.clearBtn, { borderColor: colors.danger }]}>
          <Trash2 size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.clearText, { color: colors.danger }]}>مسح السجل</Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="بحث في السجل..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        {filterOptions.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[
              styles.filterChip,
              { backgroundColor: filter === f.value ? colors.primary : colors.surfaceAlt },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === f.value ? '#FFFFFF' : colors.text }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Filter size={48} color={colors.textMuted} strokeWidth={1.5} />}
          title="لا توجد سجلات"
          subtitle="ستظهر هنا جميع العمليات التي تتم في التطبيق"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.entryRow, { backgroundColor: index % 2 === 0 ? colors.surfaceAlt : 'transparent' }]}>
              <View style={[styles.entryDot, { backgroundColor: colorFor(item.action) }]} />
              <View style={styles.entryContent}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.entryAction, { color: colors.text }]}>
                    {ACTION_LABELS[item.action] ?? item.action}
                  </Text>
                  <Text style={[styles.entryTime, { color: colors.textMuted }]}>
                    {formatDateTime(item.timestamp)}
                  </Text>
                </View>
                {item.description ? (
                  <Text style={[styles.entryDetails, { color: colors.textMuted }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  searchRow: { marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  filtersRow: { maxHeight: 40, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  filterText: { fontSize: 13, fontWeight: '600' },
  list: { maxHeight: 400 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  entryDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 10 },
  entryContent: { flex: 1 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  entryAction: { fontSize: 14, fontWeight: '600' },
  entryTime: { fontSize: 12 },
  entryDetails: { fontSize: 13, lineHeight: 18 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  clearText: { fontSize: 14, fontWeight: '700' },
});
