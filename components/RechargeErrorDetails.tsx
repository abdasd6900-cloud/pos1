import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';

export interface ErrorDetails {
  step?: string;
  url?: string;
  rawResult?: string;
}

interface RechargeErrorDetailsProps {
  details?: ErrorDetails;
}

export function RechargeErrorDetails({ details }: RechargeErrorDetailsProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (!details) return null;

  const hasDetails = details.step || details.url || details.rawResult;
  if (!hasDetails) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={[styles.toggleBtn, { backgroundColor: colors.danger + '10' }]}
        activeOpacity={0.7}
      >
        <AlertCircle size={14} color={colors.danger} strokeWidth={2} />
        <Text style={[styles.toggleText, { color: colors.danger }]}>تفاصيل الخطأ</Text>
        {expanded ? (
          <ChevronUp size={14} color={colors.danger} strokeWidth={2} />
        ) : (
          <ChevronDown size={14} color={colors.danger} strokeWidth={2} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.detailsBox, { backgroundColor: colors.danger + '08', borderColor: colors.danger + '20' }]}>
          {details.step && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>الخطوة:</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{details.step}</Text>
            </View>
          )}
          {details.url && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>الرابط:</Text>
              <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>{details.url}</Text>
            </View>
          )}
          {details.rawResult && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>النتيجة:</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{details.rawResult}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 6 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  toggleText: { fontSize: 12, fontWeight: '700' },
  detailsBox: { gap: 6, padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailLabel: { fontSize: 12, fontWeight: '600' },
  detailValue: { fontSize: 12, flex: 1 },
});
