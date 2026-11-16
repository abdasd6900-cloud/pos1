import { StyleSheet, Text, View } from 'react-native';
import { Smartphone, Monitor, Wifi, WifiOff } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { useConnectionStatus } from '@/lib/heartbeat';

export function ConnectionIndicator({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const { info } = useConnectionStatus();

  const bothOnline = info.androidOnline && info.webOnline;
  const partialOnline = info.androidOnline || info.webOnline;

  const dotColor = bothOnline ? colors.success : partialOnline ? colors.warning : colors.danger;
  const bgColor = bothOnline ? colors.success + '18' : partialOnline ? colors.warning + '18' : colors.danger + '18';

  if (compact) {
    return (
      <View style={[styles.compactWrap, { backgroundColor: bgColor }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Wifi size={12} color={dotColor} strokeWidth={2.5} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor: dotColor + '30' }]}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.title, { color: colors.text }]}>
          {bothOnline ? 'الاتصال نشط' : partialOnline ? 'اتصال جزئي' : 'لا يوجد اتصال'}
        </Text>
        {bothOnline ? (
          <Wifi size={16} color={dotColor} strokeWidth={2} />
        ) : (
          <WifiOff size={16} color={dotColor} strokeWidth={2} />
        )}
      </View>
      <View style={styles.row}>
        <Smartphone size={14} color={info.androidOnline ? colors.success : colors.textMuted} strokeWidth={2} />
        <Text style={[styles.label, { color: info.androidOnline ? colors.text : colors.textMuted }]}>
          الهاتف {info.androidOnline ? 'متصل' : 'غير متصل'}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: info.androidOnline ? colors.success : colors.danger }]} />
      </View>
      <View style={styles.row}>
        <Monitor size={14} color={info.webOnline ? colors.success : colors.textMuted} strokeWidth={2} />
        <Text style={[styles.label, { color: info.webOnline ? colors.text : colors.textMuted }]}>
          النظام {info.webOnline ? 'متصل' : 'غير متصل'}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: info.webOnline ? colors.success : colors.danger }]} />
      </View>
      {(info.androidLastSeen || info.webLastSeen) && (
        <Text style={[styles.lastSeen, { color: colors.textMuted }]}>
          آخر تحديث: {formatLastSeen(info.androidLastSeen, info.webLastSeen)}
        </Text>
      )}
    </View>
  );
}

function formatLastSeen(android: string | null, web: string | null): string {
  const times: string[] = [];
  if (android) times.push(`الهاتف ${timeAgo(android)}`);
  if (web) times.push(`النظام ${timeAgo(web)}`);
  return times.join(' · ');
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `قبل ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `قبل ${hours} ساعة`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Cairo-Bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Cairo-Regular',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  lastSeen: {
    fontSize: 10,
    fontFamily: 'Cairo-Regular',
  },
  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
});
