import { StyleSheet, View, Text, TouchableOpacity, Modal } from 'react-native';
import { useState, useCallback } from 'react';
import { Lock, Delete, Fingerprint, Shield } from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';

interface LockScreenProps {
  visible: boolean;
  onUnlock: () => void;
}

export function LockScreen({ visible, onUnlock }: LockScreenProps) {
  const { settings } = useApp();
  const { colors } = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handlePress = useCallback((digit: string) => {
    setError(false);
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  }, []);

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  }, []);

  const handleBiometric = useCallback(() => {
    onUnlock();
    setPin('');
    setError(false);
  }, [onUnlock]);

  // Auto-check when pin reaches target length
  const checkPin = useCallback((value: string) => {
    if (value.length === settings.ownerPin.length) {
      if (value === settings.ownerPin) {
        setPin('');
        setError(false);
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 600);
      }
    }
  }, [settings.ownerPin, onUnlock]);

  const onPressDigit = (d: string) => {
    const next = pin + d;
    if (next.length <= settings.ownerPin.length) {
      setPin(next);
      checkPin(next);
    }
  };

  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20' }]}>
            <Shield size={36} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>سحاب POS</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            أدخل الرمز السري للمالك
          </Text>

          {/* PIN dots */}
          <View style={styles.dotsRow}>
            {Array.from({ length: settings.ownerPin.length }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: error ? colors.danger : i < pin.length ? colors.primary : colors.border,
                    borderColor: error ? colors.danger : colors.border,
                  },
                ]}
              />
            ))}
          </View>

          {error && (
            <Text style={[styles.errorText, { color: colors.danger }]}>رمز خاطئ، حاول مرة أخرى</Text>
          )}

          {/* Keypad */}
          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => onPressDigit(d)}
                style={[styles.key, { backgroundColor: colors.surface }]}
                activeOpacity={0.6}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{d}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleBiometric}
              style={[styles.key, { backgroundColor: 'transparent' }]}
              activeOpacity={0.6}
            >
              <Fingerprint size={26} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onPressDigit('0')}
              style={[styles.key, { backgroundColor: colors.surface }]}
              activeOpacity={0.6}
            >
              <Text style={[styles.keyText, { color: colors.text }]}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              style={[styles.key, { backgroundColor: 'transparent' }]}
              activeOpacity={0.6}
            >
              <Delete size={24} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={[styles.secureNote, { backgroundColor: colors.primary + '10' }]}>
            <Lock size={14} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.secureText, { color: colors.primary }]}>
              بياناتك محمية ومشفّرة محلياً
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 32, width: '100%' },
  iconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  dotsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  errorText: { fontSize: 13, fontWeight: '600', marginTop: 4, height: 18 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 16, maxWidth: 280 },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontWeight: '700' },
  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginTop: 24 },
  secureText: { fontSize: 12, fontWeight: '600' },
});
