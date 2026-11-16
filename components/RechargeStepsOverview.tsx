import { StyleSheet, View, Text } from 'react-native';
import { ListOrdered } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';

interface RechargeStepsOverviewProps {
  steps: string[];
}

export function RechargeStepsOverview({ steps }: RechargeStepsOverviewProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <View style={styles.header}>
        <ListOrdered size={16} color={colors.textSecondary} strokeWidth={2} />
        <Text style={[styles.title, { color: colors.textSecondary }]}>خطوات الشحن المعتمدة</Text>
      </View>
      <View style={styles.list}>
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          return (
            <View key={idx} style={styles.row}>
              <View style={[styles.num, { backgroundColor: (isLast ? colors.success : colors.primary) + '20' }]}>
                <Text style={[styles.numText, { color: isLast ? colors.success : colors.primary }]}>
                  {isLast ? '✓' : String(idx + 1)}
                </Text>
              </View>
              <Text style={[styles.text, { color: colors.textSecondary }]}>{step}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: '700' },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '700' },
  text: { flex: 1, fontSize: 12, lineHeight: 18 },
});
