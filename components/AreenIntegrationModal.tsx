import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Zap, Check, AlertCircle, RefreshCw, LogOut, Trash2, ExternalLink } from 'lucide-react-native';
import { BaseModal } from '@/components/BaseModal';
import { useTheme } from '@/lib/theme-context';
import {
  isAreenAutomationSupported,
  getAreenCredentials,
  saveAreenCredentials,
  clearAreenCredentials,
  checkAreenSession,
  logoutAreen,
  clearAreenSession,
} from '@/lib/areen-automation';
import { getAreenRechargeConfig, saveAreenRechargeConfig, DEFAULT_AREEN_CONFIG, type RechargeConfig } from '@/lib/recharge-config';
import { RechargeConfigSection } from '@/components/RechargeConfigSection';
import { RechargeStepsOverview } from '@/components/RechargeStepsOverview';

type Colors = ReturnType<typeof useTheme>['colors'];

export function AreenIntegrationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasCreds, setHasCreds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ loggedIn: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [areenConfig, setAreenConfig] = useState<RechargeConfig | null>(null);

  const supported = isAreenAutomationSupported();

  const loadCreds = useCallback(async () => {
    const creds = await getAreenCredentials();
    if (creds) {
      setUsername(creds.username);
      setPassword(creds.password);
      setHasCreds(true);
    } else {
      setUsername('');
      setPassword('');
      setHasCreds(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadCreds();
      setMsg(null);
      setSessionInfo(null);
      getAreenRechargeConfig().then(setAreenConfig);
    }
  }, [visible, loadCreds]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      showToast('error', 'يرجى ملء جميع الحقول');
      return;
    }
    setSaving(true);
    try {
      await saveAreenCredentials({
        username: username.trim(),
        password: password.trim(),
      });
      setHasCreds(true);
      showToast('success', 'تم حفظ بيانات أرين بنجاح');
    } catch {
      showToast('error', 'تعذر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearAreenCredentials();
      clearAreenSession();
      setUsername('');
      setPassword('');
      setHasCreds(false);
      setSessionInfo(null);
      showToast('success', 'تم حذف بيانات أرين');
    } catch {
      showToast('error', 'تعذر الحذف');
    } finally {
      setBusy(false);
    }
  };

  const handleCheckSession = async () => {
    setBusy(true);
    try {
      const info = await checkAreenSession();
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
      await logoutAreen();
      setSessionInfo({ loggedIn: false });
      showToast('success', 'تم تسجيل الخروج من أرين');
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
      title="تكامل شحن أرين - Areen"
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
        <View style={[styles.infoBanner, { backgroundColor: colors.accent + '12' }]}>
          <Zap size={18} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.infoText, { color: colors.accent }]}>
            يقوم التطبيق بتسجيل الدخول لموقع أرين تلقائياً والبحث برقم الاشتراك، ثم استخراج رقم المسار وإدخاله كمبلغ شحن وتنفيذ الشحن. عند أول تسجيل دخول يرسل أرين رمز تحقق عبر رسالة SMS على رقم الجوال، ويجب إدخال الرمز لإتمام العملية.
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

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم المستخدم (Areen)</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="اسم المستخدم"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </View>

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

        {sessionInfo && (
          <View style={[styles.sessionBox, { backgroundColor: sessionInfo.loggedIn ? colors.success + '12' : colors.danger + '12' }]}>
            <View style={[styles.sessionDot, { backgroundColor: sessionInfo.loggedIn ? colors.success : colors.danger }]} />
            <Text style={[styles.sessionText, { color: sessionInfo.loggedIn ? colors.success : colors.danger }]}>
              {sessionInfo.loggedIn ? 'الجلسة نشطة - مسجل الدخول' : 'غير مسجل الدخول'}
            </Text>
          </View>
        )}

        <View style={styles.actionsRow}>
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

        {hasCreds && (
          <TouchableOpacity
            onPress={handleClear}
            disabled={busy}
            style={[styles.dangerBtn, { backgroundColor: colors.danger + '10', opacity: busy ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.dangerBtnText, { color: colors.danger }]}>حذف بيانات أرين نهائياً</Text>
          </TouchableOpacity>
        )}

        {/* Recharge Steps Overview */}
        <RechargeStepsOverview steps={[
          'تحميل بوابة أرين في متصفح مخفي',
          'تسجيل الدخول تلقائياً (اسم المستخدم + كلمة المرور)',
          'إدخال رمز التحقق المرسل عبر SMS',
          'البحث برقم الاشتراك في صندوق البحث',
          'استخراج رقم المسار من تفاصيل النتيجة',
          'إدخال رقم المسار كمبلغ شحن في حقل الشحن',
          'الضغط على زر الشحن (اشحن)',
          'معالجة نافذة التأكيد إن وجدت',
          'قراءة نتيجة العملية (نجاح / فشل) من الصفحة',
        ]} />

        {/* Recharge method config */}
        <RechargeConfigSection
          config={areenConfig}
          onLoad={getAreenRechargeConfig}
          onSave={async (c) => { await saveAreenRechargeConfig(c); setAreenConfig(c); showToast('success', 'تم حفظ إعدادات طريقة الشحن'); }}
          defaults={DEFAULT_AREEN_CONFIG}
        />

        <TouchableOpacity
          onPress={() => {}}
          style={styles.linkRow}
          activeOpacity={0.7}
        >
          <ExternalLink size={14} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.linkText, { color: colors.textMuted }]}>agents.areen.net</Text>
        </TouchableOpacity>

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
  textInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
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
