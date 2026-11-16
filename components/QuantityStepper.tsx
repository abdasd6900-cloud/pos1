import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/lib/theme-context';

interface QuantityStepperProps {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  size?: 'sm' | 'md';
}

export function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
  min = 1,
  size = 'md',
}: QuantityStepperProps) {
  const { colors } = useTheme();
  const dim = size === 'sm' ? 28 : 34;
  const fontSize = size === 'sm' ? 15 : 17;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt }]}>
      <TouchableOpacity
        onPress={onDecrement}
        disabled={value <= min}
        style={[styles.btn, { width: dim, height: dim, opacity: value <= min ? 0.4 : 1 }]}
        activeOpacity={0.6}
      >
        <Text style={[styles.sign, { color: colors.text, fontSize }]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.value, { color: colors.text, fontSize }]}>{value}</Text>
      <TouchableOpacity
        onPress={onIncrement}
        style={[styles.btn, { width: dim, height: dim }]}
        activeOpacity={0.6}
      >
        <Text style={[styles.sign, { color: colors.text, fontSize }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    gap: 2,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sign: {
    fontWeight: '700',
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontWeight: '700',
  },
});
