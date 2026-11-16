import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Settings2, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import type { RechargeConfig } from '@/lib/recharge-config';

interface RechargeConfigSectionProps {
  config: RechargeConfig | null;
  onLoad: () => Promise<RechargeConfig>;
  onSave: (config: RechargeConfig) => Promise<void>;
  defaults: RechargeConfig;
}

export function RechargeConfigSection({ config, onLoad, onSave, defaults }: RechargeConfigSectionProps) {
  const { colors } = useTheme();
  const [portalUrl, setPortalUrl] = useState('');
  const [pageLoadDelay, setPageLoadDelay] = useState('');
  const [loginDelay, setLoginDelay] = useState('');
  const [rechargeDelay, setRechargeDelay] = useState('');
  const [dirty, setDirty] = useState(false);

  const loadConfig = useCallback(async () => {
    const c = await onLoad();
    setPortalUrl(c.portalUrl);
    setPageLoadDelay(String(c.pageLoadDelay));
    setLoginDelay(String(c.loginDelay));
    setRechargeDelay(String(c.rechargeDelay));
    setDirty(false);
  }, [onLoad]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleFieldChange = (setter: (v: string) => void, original: string) => (v: string) => {
    setter(v);
    setDirty(true);
  };

  const handleSave = async () => {
    const parsed: RechargeConfig = {
      portalUrl: portalUrl.trim() || defaults.portalUrl,
      pageLoadDelay: parseInt(pageLoadDelay, 10) || defaults.pageLoadDelay,
      loginDelay: parseInt(loginDelay, 10) || defaults.loginDelay,
      rechargeDelay: parseInt(rechargeDelay, 10) || defaults.rechargeDelay,
    };
    await onSave(parsed);
    setDirty(false);
  };

  const handleReset = async () => {
    setPortalUrl(defaults.portalUrl);
    setPageLoadDelay(String(defaults.pageLoadDelay));
    setLoginDelay(String(defaults.loginDelay));
    setRechargeDelay(String(defaults.rechargeDelay));
    await onSave(defaults);
    setDirty(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Settings2 size={16} color={colors.textSecondary} strokeWidth={2} />
        <Text style={[styles.title, { color: colors.textSecondary }]}>طريقة الشحن (إعدادات متقدمة)</Text>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textMuted }]}>رابط البوابة</Text>
        <TextInput
          value={portalUrl}
          onChangeText={handleFieldChange(setPortalUrl, config?.portalUrl ?? '')}
          placeholder={defaults.portalUrl}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
        />
      </View>

      <View style={styles.delayRow}>
        <View style={styles.delayField}>
          <Text style={[styles.label, { color: colors.textMuted }]}>انتظار التحميل (ms)</Text>
          <TextInput
            value={pageLoadDelay}
            onChangeText={handleFieldChange(setPageLoadDelay, String(config?.pageLoadDelay ?? ''))}
            placeholder={String(defaults.pageLoadDelay)}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          />
        </View>
        <View style={styles.delayField}>
          <Text style={[styles.label, { color: colors.textMuted }]}>انتظار الدخول (ms)</Text>
          <TextInput
            value={loginDelay}
            onChangeText={handleFieldChange(setLoginDelay, String(config?.loginDelay ?? ''))}
            placeholder={String(defaults.loginDelay)}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          />
        </View>
        <View style={styles.delayField}>
          <Text style={[styles.label, { color: colors.textMuted }]}>انتظار الشحن (ms)</Text>
          <TextInput
            value={rechargeDelay}
            onChangeText={handleFieldChange(setRechargeDelay, String(config?.rechargeDelay ?? ''))}
            placeholder={String(defaults.rechargeDelay)}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!dirty}
          style={[styles.saveBtn, { backgroundColor: dirty ? colors.primary : colors.surface, opacity: dirty ? 1 : 0.5 }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.saveBtnText, { color: dirty ? '#FFFFFF' : colors.textMuted }]}>حفظ الإعدادات</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReset}
          style={[styles.resetBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <RotateCcw size={14} color={colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>استعادة الافتراضي</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: '700' },
  field: { gap: 4 },
  label: { fontSize: 11, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  delayRow: { flexDirection: 'row', gap: 8 },
  delayField: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  saveBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { fontSize: 13, fontWeight: '700' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  resetBtnText: { fontSize: 12, fontWeight: '600' },
});
