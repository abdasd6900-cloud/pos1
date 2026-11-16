import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme-context';

interface BadgeProps {
  label: string;
  color?: string;
  bg?: string;
  size?: 'sm' | 'md';
}

export function Badge({ label, color, bg, size = 'sm' }: BadgeProps) {
  const { colors } = useTheme();
  const fontSize = size === 'sm' ? 12 : 14;
  const paddingV = size === 'sm' ? 4 : 6;
  const paddingH = size === 'sm' ? 8 : 12;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg ?? colors.surfaceAlt,
          paddingVertical: paddingV,
          paddingHorizontal: paddingH,
        },
      ]}
    >
      <Text style={[styles.text, { color: color ?? colors.textSecondary, fontSize }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
  },
  text: {
    fontWeight: '600',
  },
});
