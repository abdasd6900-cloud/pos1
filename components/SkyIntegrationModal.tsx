import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Zap, Check, AlertCircle, KeyRound, RefreshCw, LogOut, Trash2, ExternalLink } from 'lucide-react-native';
import { BaseModal } from '@/components/BaseModal';
import { useTheme } from '@/lib/theme-context';
import {
  isSkyAutomationSupported,
  getSkyCredentials,
  saveSkyCredentials,
  clearSkyCredentials,
  generateSkyTotpCode,
  checkSkySession,
  logoutSky,
  clearSkySession,
} from '@/lib/sky-automation';
import { getSkyRechargeConfig, saveSkyRechargeConfig, DEFAULT_SKY_CONFIG, type RechargeConfig } from '@/lib/recharge-config';
import { RechargeConfigSection } from '@/components/RechargeConfigSection';
import { RechargeStepsOverview } from '@/components/RechargeStepsOverview';

type Colors = ReturnType<typeof useTheme>['colors'];

export function SkyIntegrationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [hasCreds, setHasCreds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totpPreview, setTotpPreview] = useState<{ code: string; secondsRemaining: number } | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ loggedIn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skyConfig, setSkyConfig] = useState<RechargeConfig | null>(null);

  const supported = isSkyAutomationSupported();

  const loadCreds = useCallback(async () => {
    const creds = await getSkyCredentials();
    if (creds) {
      setUsername(creds.username);
      setPassword(creds.password);
      setTotpSecret(creds.totpSecret);
      setHasCreds(true);
    } else {
      setUsername('');
      setPassword('');
      setTotpSecret('');
      setHasCreds(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadCreds();
      setMsg(null);
      setSessionInfo(null);
      setTotpPreview(null);
      getSkyRechargeConfig().then(setSkyConfig);
    }
  }, [visible, loadCreds]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleSave = async () => {
    if (!username.trim() || !password.trim() || !totpSecret.trim()) {
      showToast('error', 'يرجى إدخال اسم المستخدم وكلمة المرور والمفتاح السري لرمز التحقق');
      return;
    }
    setSaving(true);
    try {
      await saveSkyCredentials({
        username: username.trim(),
        password: password.trim(),
        totpSecret: totpSecret.trim().replace(/\s+/g, ''),
      });
      setHasCreds(true);
      showToast('success', 'تم حفظ بيانات سكاي بنجاح');
    } catch {
      showToast('error', 'تعذر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearSkyCredentials();
      clearSkySession();
      setUsername('');
      setPassword('');
      setTotpSecret('');
      setHasCreds(false);
      setTotpPreview(null);
      setSessionInfo(null);
      showToast('success', 'تم حذف بيانات سكاي');
    } catch {
      showToast('error', 'تعذر الحذف');
    } finally {
      setBusy(false);
    }
  };

  const handleTestTotp = async () => {
    setBusy(true);
    try {
      const result = await generateSkyTotpCode();
      if (result) {
        setTotpPreview(result);
      } else {
        showToast('error', 'لم يتم العثور على بيانات أو المفتاح غير صالح');
      }
    } catch {
      showToast('error', 'المفتاح السري غير صالح');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckSession = async () => {
    setBusy(true);
    try {
      const info = await checkSkySession();
      setSessionInfo(info);
    } catch {
      showToast('error', 'تعذر فحص الجلسة');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logoutSky();
      setSessionInfo({ loggedIn: false });
      showToast('success', 'تم تسجيل الخروج من سكاي');
    } catch {
      showToast('error', 'تعذر تسجيل الخروج');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="تكامل شحن سكاي - Sky 5G"
      footer={
        <View style={{ gap: 8 }}>
          {!supported && (
            <Text style={[styles.notSupportedText, { color: colors.warning }]}>
              الأتمتة تعمل فقط على أجهزة أندرويد
            </Text>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !supported}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: (saving || !supported) ? 0.5 : 1 }]}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.saveBtnText}>حفظ البيانات</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.info + '12' }]}>
          <Zap size={18} color={colors.info} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.info }]}>
            يقوم التطبيق بتسجيل الدخول لموقع سكاي تلقائياً وتنفيذ عمليات الشحن بالكامل دون تدخل يدوي. أدخل المفتاح السري ليتم توليد رمز التحقق تلقائياً.
          </Text>
        </View>

        {!supported && (
          <View style={[styles.warnBox, { backgroundColor: colors.warning + '15' }]}>
            <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.warnText, { color: colors.warning }]}>
              هذه الميزة تتطلب تشغيل التطبيق على جهاز أندرويد. النسخة الحالية: {Platform.OS}
            </Text>
          </View>
        )}

        {/* TOTP Secret */}
        <View style={[styles.field, styles.requiredSecretField, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '35' }]}>
          <View style={styles.secretLabelRow}>
            <KeyRound size={17} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.fieldLabel, { color: colors.primary }]}>المفتاح السري لرمز التحقق (إلزامي)</Text>
          </View>
          <TextInput
            value={totpSecret}
            onChangeText={setTotpSecret}
            placeholder="أدخل المفتاح الذي حصلت عليه من ente Auth"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.primary + '55', fontFamily: 'monospace' }]}
          />
          <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>يُستخدم هذا المفتاح لإنشاء رمز التحقق المطلوب لتسجيل الدخول إلى سكاي.</Text>
        </View>

        {/* Username */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم المستخدم (Sky)</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="اسم المستخدم"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>كلمة المرور</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="كلمة المرور"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </View>

        {/* TOTP Preview */}
        {totpPreview && (
          <View style={[styles.totpBox, { backgroundColor: colors.primary + '12' }]}>
            <KeyRound size={18} color={colors.primary} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.totpCode, { color: colors.primary }]}>{totpPreview.code}</Text>
              <Text style={[styles.totpTimer, { color: colors.textMuted }]}>
                ينتهي خلال {totpPreview.secondsRemaining} ثانية
              </Text>
            </View>
          </View>
        )}

        {/* Session Status */}
        {sessionInfo && (
          <View style={[styles.sessionBox, { backgroundColor: sessionInfo.loggedIn ? colors.success + '12' : colors.danger + '12' }]}>
            <View style={[styles.sessionDot, { backgroundColor: sessionInfo.loggedIn ? colors.success : colors.danger }]} />
            <Text style={[styles.sessionText, { color: sessionInfo.loggedIn ? colors.success : colors.danger }]}>
              {sessionInfo.loggedIn ? 'الجلسة نشطة - مسجل الدخول' : 'غير مسجل الدخول'}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleTestTotp}
            disabled={busy || !hasCreds}
            style={[styles.actionBtn, { backgroundColor: colors.info + '15', opacity: (busy || !hasCreds) ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            <KeyRound size={16} color={colors.info} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.info }]}>تجربة الكود</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleCheckSession}
            disabled={busy || !hasCreds || !supported}
            style={[styles.actionBtn, { backgroundColor: colors.warning + '15', opacity: (busy || !hasCreds || !supported) ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            <RefreshCw size={16} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.warning }]}>فحص الجلسة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogout}
            disabled={busy || !supported}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt, opacity: (busy || !supported) ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            <LogOut size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>خروج</Text>
          </TouchableOpacity>
        </View>

        {/* Delete credentials */}
        {hasCreds && (
          <TouchableOpacity
            onPress={handleClear}
            disabled={busy}
            style={[styles.dangerBtn, { backgroundColor: colors.danger + '10', opacity: busy ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>حذف بيانات سكاي نهائياً</Text>
          </TouchableOpacity>
        )}

        {/* Recharge Steps Overview */}
        <RechargeStepsOverview steps={[
          'تحميل بوابة سكاي في متصفح مخفي',
          'تسجيل الدخول تلقائياً (اسم المستخدم + كلمة المرور + رمز التحقق المُولّد من المفتاح السري)',
          'البحث عن رقم الزبون في صندوق البحث',
          'الضغط على زر الشحن',
          'اختيار مدة الشحن من القائمة المنسدلة',
          'الضغط على زر التأكيد الأول',
          'الضغط على زر التأكيد الثاني (إتمام العملية)',
          'قراءة نتيجة العملية (نجاح / فشل) من الصفحة',
        ]} />

        {/* Recharge method config */}
        <RechargeConfigSection
          config={skyConfig}
          onLoad={getSkyRechargeConfig}
          onSave={async (c) => { await saveSkyRechargeConfig(c); setSkyConfig(c); showToast('success', 'تم حفظ إعدادات طريقة الشحن'); }}
          defaults={DEFAULT_SKY_CONFIG}
        />

        {/* Link to portal */}
        <TouchableOpacity
          onPress={() => {}}
          style={styles.linkRow}
          activeOpacity={0.7}
        >
          <ExternalLink size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.linkText, { color: colors.textMuted }]}>sales-ps.sky5g.ps</Text>
        </TouchableOpacity>

        {/* Toast */}
        {msg && (
          <View style={[styles.msgBox, { backgroundColor: msg.type === 'success' ? colors.success + '15' : colors.danger + '15' }]}>
            {msg.type === 'success' ? (
              <Check size={16} color={colors.success} strokeWidth={2} />
            ) : (
              <AlertCircle size={16} color={colors.danger} strokeWidth={2} />
            )}
            <Text style={[styles.msgText, { color: msg.type === 'success' ? colors.success : colors.danger }]}>
              {msg.text}
            </Text>
          </View>
        )}
      </View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  infoBanner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '500' },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  warnText: { flex: 1, fontSize: 12, fontWeight: '600' },
  notSupportedText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  fieldHint: { fontSize: 11, marginTop: 2, lineHeight: 17 },
  requiredSecretField: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  secretLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  totpBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  totpCode: { fontSize: 24, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 3 },
  totpTimer: { fontSize: 11, marginTop: 2 },
  sessionBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10 },
  sessionDot: { width: 8, height: 8, borderRadius: 4 },
  sessionText: { fontSize: 13, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 4 },
  dangerBtnText: { fontSize: 13, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  linkText: { fontSize: 12 },
  msgBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  msgText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
