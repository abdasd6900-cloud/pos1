import { StyleSheet, View, Text, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { useState, useMemo } from 'react';
import {
  ClipboardCheck, Plus, Trash2, Check, Search,
  Package, AlertTriangle, History,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/format';
import type { Stocktake } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function StocktakeScreen() {
  const { products, stocktakes, addStocktake, deleteStocktake, settings, currentStaff } = useApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q));
  }, [products, search]);

  const countedItems = Object.entries(counts).filter(([, v]) => v !== '').length;
  const differences = useMemo(() => {
    return Object.entries(counts).map(([pid, val]) => {
      const product = products.find((p) => p.id === pid);
      const actual = parseInt(val) || 0;
      const expected = product?.stock ?? 0;
      return { pid, productName: product?.name ?? '', expected, actual, diff: actual - expected };
    }).filter((d) => d.diff !== 0);
  }, [counts, products]);

  if (!settings.enableStocktake) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}> 
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>جرد المخزون</Text>
        </View>
        <View style={styles.disabledWrap}>
          <EmptyState
            icon={<ClipboardCheck size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="الميزة معطّلة"
            subtitle="فعّل الجرد السريع من الإعدادات"
          />
        </View>
      </View>
    );
  }

  const handleSave = () => {
    const items = Object.entries(counts).map(([pid, val]) => ({
      productId: pid,
      actualQty: parseInt(val) || 0,
    })).filter((item) => counts[item.productId] !== '');
    if (items.length === 0) return;
    addStocktake(items, currentStaff?.id ?? null);
    setCounts({});
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>جرد المخزون</Text>
        <TouchableOpacity
          onPress={() => setShowHistory(true)}
          style={[styles.historyBtn, { backgroundColor: colors.surfaceAlt }]}
        >
          <History size={18} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>السجل</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Package size={20} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{products.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>إجمالي</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <ClipboardCheck size={20} color={colors.success} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{stocktakes.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>جردات</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <AlertTriangle size={20} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{differences.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>فروقات</Text>
        </View>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <EmptyState
            icon={<Package size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="لا توجد منتجات"
            subtitle="أضف منتجات من شاشة المخزون أولاً"
          />
        }
        ListHeaderComponent={
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Search size={18} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث بالاسم أو الباركود..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
        }
        renderItem={({ item }) => {
          const count = counts[item.id] ?? '';
          const hasDiff = count !== '' && parseInt(count) !== item.stock;
          return (
            <View style={[styles.countRow, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.countName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.countExpected, { color: colors.textMuted }]}>
                  المسجل: {item.stock} {item.unit}
                </Text>
              </View>
              <View style={[styles.countInputWrap, { backgroundColor: hasDiff ? colors.warning + '15' : colors.surfaceAlt, borderColor: hasDiff ? colors.warning : colors.border }]}>
                <TextInput
                  value={count}
                  onChangeText={(v) => setCounts((prev) => ({ ...prev, [item.id]: v }))}
                  placeholder={item.stock.toString()}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.countInput, { color: hasDiff ? colors.warning : colors.text }]}
                />
              </View>
              {hasDiff && (
                <Text style={[styles.diffText, { color: parseInt(count) > item.stock ? colors.success : colors.danger }]}>
                  {parseInt(count) > item.stock ? '+' : ''}{parseInt(count) - item.stock}
                </Text>
              )}
            </View>
          );
        }}
      />

      {countedItems > 0 && (
        <View style={[styles.saveBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.saveBarText, { color: colors.text }]}>
            تم عد {countedItems} صنف
            {differences.length > 0 && ` - ${differences.length} فرق`}
          </Text>
          <TouchableOpacity onPress={handleSave} style={[styles.saveBarBtn, { backgroundColor: colors.primary }]}>
            <Check size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBarBtnText}>حفظ الجرد</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        onPress={() => { setCounts({}); setSearch(''); }}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <StocktakeHistoryModal
        visible={showHistory}
        stocktakes={stocktakes}
        colors={colors}
        onClose={() => setShowHistory(false)}
        onDelete={deleteStocktake}
      />
    </View>
  );
}

function StocktakeHistoryModal({ visible, stocktakes, colors, onClose, onDelete }: {
  visible: boolean;
  stocktakes: Stocktake[];
  colors: Colors;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <BaseModal visible={visible} onClose={onClose} title="سجل الجردات">
      {stocktakes.length === 0 ? (
        <EmptyState
          icon={<History size={48} color={colors.textMuted} strokeWidth={1.5} />}
          title="لا يوجد سجل"
          subtitle="لم يتم إجراء أي جرد بعد"
        />
      ) : (
        <FlatList
          data={stocktakes}
          keyExtractor={(item) => item.id}
          style={{ maxHeight: 400 }}
          renderItem={({ item }) => {
            const totalDiffs = item.items.filter((i) => i.difference !== 0).length;
            return (
              <View style={[styles.historyCard, { backgroundColor: colors.surfaceAlt }]}>
                <View style={styles.historyHeader}>
                  <View>
                    <Text style={[styles.historyDate, { color: colors.text }]}>{formatDateTime(item.createdAt)}</Text>
                    <Text style={[styles.historyStaff, { color: colors.textMuted }]}>بواسطة: {item.staffName}</Text>
                  </View>
                  <View style={styles.historyInfo}>
                    <View style={[styles.historyBadge, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.historyBadgeText, { color: colors.primary }]}>{item.items.length} صنف</Text>
                    </View>
                    {totalDiffs > 0 && (
                      <View style={[styles.historyBadge, { backgroundColor: colors.warning + '20' }]}>
                        <Text style={[styles.historyBadgeText, { color: colors.warning }]}>{totalDiffs} فرق</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => onDelete(item.id)} style={[styles.delBtn, { backgroundColor: colors.danger + '15' }]}>
                      <Trash2 size={14} color={colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
                {totalDiffs > 0 && (
                  <View style={[styles.diffsList, { borderTopColor: colors.border }]}>
                    {item.items.filter((i) => i.difference !== 0).slice(0, 5).map((i) => (
                      <View key={i.productId} style={styles.diffRow}>
                        <Text style={[styles.diffName, { color: colors.text }]} numberOfLines={1}>{i.productName}</Text>
                        <Text style={[styles.diffValues, { color: colors.textMuted }]}>
                          {i.expectedQty} → {i.actualQty}
                        </Text>
                        <Text style={[styles.diffAmount, { color: i.difference > 0 ? colors.success : colors.danger }]}>
                          {i.difference > 0 ? '+' : ''}{i.difference}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  historyBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  disabledWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statLabel: { fontSize: 11 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  scanBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, marginBottom: 8 },
  countName: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  countExpected: { fontSize: 12, marginTop: 2 },
  countInputWrap: { width: 70, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
  countInput: { fontSize: 16, fontWeight: '700', textAlign: 'center', fontFamily: 'Cairo-Bold' },
  diffText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', width: 40, textAlign: 'center' },
  saveBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  saveBarText: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  saveBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  saveBarBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  fab: { position: 'absolute', bottom: 80, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  historyCard: { borderRadius: 14, padding: 14, marginBottom: 10 },
  historyHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  historyDate: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  historyStaff: { fontSize: 12, marginTop: 4 },
  historyInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  delBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  diffsList: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 6 },
  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diffName: { flex: 1, fontSize: 13 },
  diffValues: { fontSize: 12 },
  diffAmount: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', width: 40, textAlign: 'right' },
});
