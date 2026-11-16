import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { TrendingDown, AlertTriangle, Zap, Package } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import type { StockPrediction } from '@/types';

interface StockPredictionsProps {
  predictions: StockPrediction[];
  currency: string;
  onViewAll?: () => void;
  onOrderProduct?: (productId: string) => void;
}

export function StockPredictions({ predictions, onViewAll, onOrderProduct }: StockPredictionsProps) {
  const { colors } = useTheme();

  if (predictions.length === 0) return null;

  const urgencyColor = (u: StockPrediction['urgency']) =>
    u === 'critical' ? colors.danger : u === 'soon' ? colors.warning : colors.success;

  const urgencyBg = (u: StockPrediction['urgency']) =>
    u === 'critical' ? colors.danger + '15' : u === 'soon' ? colors.warning + '15' : colors.success + '15';

  const urgencyIcon = (u: StockPrediction['urgency']) =>
    u === 'critical' ? <AlertTriangle size={14} color={urgencyColor(u)} strokeWidth={2} />
      : u === 'soon' ? <TrendingDown size={14} color={urgencyColor(u)} strokeWidth={2} />
        : <Package size={14} color={urgencyColor(u)} strokeWidth={2} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Zap size={18} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.title, { color: colors.text }]}>التنبؤ بنفاد المخزون</Text>
        </View>
        {onViewAll && predictions.length > 3 && (
          <TouchableOpacity onPress={onViewAll}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>عرض الكل ({predictions.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {predictions.slice(0, 6).map((p) => (
          <View key={p.productId} style={[styles.card, { backgroundColor: urgencyBg(p.urgency), borderColor: urgencyColor(p.urgency) + '30' }]}>
            <View style={styles.cardHeader}>
              {urgencyIcon(p.urgency)}
              <Text style={[styles.cardUrgency, { color: urgencyColor(p.urgency) }]}>
                {p.urgency === 'critical' ? 'عاجل' : p.urgency === 'soon' ? 'قريباً' : 'آمن'}
              </Text>
            </View>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>{p.productName}</Text>
            <Text style={[styles.cardDays, { color: urgencyColor(p.urgency) }]}>
              {p.daysUntilEmpty !== null ? `${p.daysUntilEmpty} يوم` : '—'}
            </Text>
            <Text style={[styles.cardRate, { color: colors.textMuted }]}>
              {p.dailyRate} وحدة/يوم
            </Text>
            {p.urgency !== 'safe' && onOrderProduct && (
              <TouchableOpacity
                onPress={() => onOrderProduct(p.productId)}
                style={[styles.orderBtn, { backgroundColor: urgencyColor(p.urgency) }]}
                activeOpacity={0.7}
              >
                <Text style={styles.orderBtnText}>طلب شراء</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  viewAll: { fontSize: 13, fontWeight: '600' },
  scrollContent: { gap: 10, paddingRight: 4 },
  card: { width: 140, borderRadius: 14, padding: 12, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardUrgency: { fontSize: 12, fontWeight: '700' },
  cardName: { fontSize: 13, fontWeight: '600', marginBottom: 6, lineHeight: 18, minHeight: 36 },
  cardDays: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cardRate: { fontSize: 11, marginTop: 2, marginBottom: 8 },
  orderBtn: { paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  orderBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
