import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { AlertCircle, Check, Circle, Loader2, Zap } from 'lucide-react-native';
import { BaseModal } from '@/components/BaseModal';
import { useTheme } from '@/lib/theme-context';
import { executeAreenLogin, executeAreenRechargeWithCode } from '@/lib/areen-automation';
import { executeLayanLogin, executeLayanRechargeWithCode } from '@/lib/layan-automation';
import { executeSkyRecharge } from '@/lib/sky-automation';

interface DirectRechargeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  companyName: string;
  phoneNumber: string;
  subscriptionNumber: string;
  durationKey: string;
  packageType: 'normal' | 'offer';
}

type Provider = 'sky' | 'layan' | 'areen' | 'unknown';
type StepStatus = 'pending' | 'running' | 'success' | 'failed';
type RechargeStep = { id: string; label: string; status: StepStatus; detail?: string };

const initialSteps = (): RechargeStep[] => [
  { id: 'prepare', label: 'تجهيز بيانات العملية', status: 'pending' },
  { id: 'login', label: 'تسجيل الدخول إلى بوابة الشركة', status: 'pending' },
  { id: 'verify', label: 'التحقق من الجلسة والبيانات', status: 'pending' },
  { id: 'search', label: 'البحث عن الرقم أو الاشتراك', status: 'pending' },
  { id: 'recharge', label: 'تنفيذ الشحن وتأكيد العملية', status: 'pending' },
  { id: 'complete', label: 'قراءة النتيجة النهائية', status: 'pending' },
];

const providerFor = (name: string): Provider => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('sky') || normalized.includes('سكاي')) return 'sky';
  if (normalized.includes('layan') || normalized.includes('ليان')) return 'layan';
  if (normalized.includes('areen') || normalized.includes('أرين') || normalized.includes('ارين')) return 'areen';
  return 'unknown';
};

const providerLabel: Record<Provider, string> = {
  sky: 'سكاي',
  layan: 'ليان',
  areen: 'أرين',
  unknown: 'غير معروف',
};

export function DirectRechargeModal({
  visible,
  onClose,
  onSuccess,
  companyName,
  phoneNumber,
  subscriptionNumber,
  durationKey,
  packageType,
}: DirectRechargeModalProps) {
  const { colors } = useTheme();
  const provider = useMemo(() => providerFor(companyName), [companyName]);
  const [steps, setSteps] = useState<RechargeStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setSteps(initialSteps());
      setRunning(false);
      setAwaitingCode(false);
      setCode('');
      setError('');
    }
  }, [visible]);

  const updateStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, status, detail } : step));
  };

  const fail = (stepId: string, message: string) => {
    updateStep(stepId, 'failed', message);
    setError(message);
    setRunning(false);
  };

  const runRecharge = async () => {
    setError('');
    if (provider === 'unknown') {
      fail('prepare', `لا يوجد تكامل مباشر مخصص للشركة ${companyName}`);
      return;
    }
    if (!phoneNumber.trim()) {
      fail('prepare', 'أدخل رقم الهاتف في شاشة البيع أولاً');
      return;
    }
    if (provider === 'areen' && !subscriptionNumber.trim()) {
      fail('prepare', 'أدخل رقم الاشتراك في بيانات الزبون أو شاشة البيع أولاً');
      return;
    }
    if (awaitingCode && code.trim() === '') {
      setError('أدخل رمز التحقق المرسل لإكمال الشحن');
      return;
    }

    setRunning(true);
    updateStep('prepare', 'running');
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    updateStep('prepare', 'success');
    updateStep('login', 'running');

    try {
      if (provider === 'sky') {
        const result = await executeSkyRecharge({ phoneNumber: phoneNumber.trim(), durationKey });
        if (!result.success) {
          fail('login', result.error || 'فشل تسجيل الدخول إلى سكاي');
          return;
        }
        updateStep('login', 'success');
        updateStep('verify', 'success');
        updateStep('search', 'running');
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        updateStep('search', 'success');
        updateStep('recharge', 'running');
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        updateStep('recharge', 'success');
      } else if (provider === 'layan') {
        if (!awaitingCode) {
          const loginResult = await executeLayanLogin();
          if (!loginResult.success) {
            fail('login', loginResult.error || 'فشل تسجيل الدخول إلى ليان');
            return;
          }
          updateStep('login', 'success');
          updateStep('verify', 'running', 'تم إرسال رمز التحقق عبر واتساب');
          setAwaitingCode(true);
          setRunning(false);
          return;
        }
        updateStep('login', 'success');
        updateStep('verify', 'running', 'جارٍ التحقق من الرمز');
        const result = await executeLayanRechargeWithCode(code.trim(), {
          phoneNumber: phoneNumber.trim(), packageType, durationKey,
        });
        if (!result.success) {
          fail('verify', result.error || 'فشل التحقق في ليان');
          return;
        }
        updateStep('verify', 'success');
        updateStep('search', 'success');
        updateStep('recharge', 'success');
      } else {
        if (!awaitingCode) {
          const loginResult = await executeAreenLogin();
          if (!loginResult.success) {
            fail('login', loginResult.error || 'فشل تسجيل الدخول إلى أرين');
            return;
          }
          updateStep('login', 'success');
          updateStep('verify', 'running', 'تم إرسال رمز التحقق عبر SMS');
          setAwaitingCode(true);
          setRunning(false);
          return;
        }
        updateStep('login', 'success');
        updateStep('verify', 'running', 'جارٍ التحقق من الرمز');
        updateStep('search', 'running');
        const result = await executeAreenRechargeWithCode(code.trim(), { subscriptionNumber: subscriptionNumber.trim() });
        if (!result.success) {
          fail('search', result.error || 'فشل البحث أو التحقق في أرين');
          return;
        }
        updateStep('search', 'success');
        updateStep('recharge', 'success');
      }
      updateStep('complete', 'running');
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
      updateStep('complete', 'success', 'تم تنفيذ الشحن بنجاح — سيتم تسجيل العملية وخصم الرصيد');
      setAwaitingCode(false);
      setRunning(false);
      onSuccess?.();
    } catch (caught) {
      fail('complete', caught instanceof Error ? caught.message : 'حدث خطأ غير متوقع أثناء الشحن');
    }
  };

  const hasStarted = steps.some((step) => step.status !== 'pending');
  const isComplete = steps.every((step) => step.status === 'success');

  return (
    <BaseModal
      visible={visible}
      onClose={running ? () => undefined : onClose}
      title="الشحن المباشر"
      footer={
        <View style={styles.footer}>
          {(provider === 'layan' || provider === 'areen') && awaitingCode && (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={provider === 'layan' ? 'رمز واتساب' : 'رمز SMS'}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            />
          )}
          <TouchableOpacity
            onPress={isComplete ? onClose : runRecharge}
            disabled={running}
            style={[styles.executeButton, { backgroundColor: isComplete ? colors.success : colors.primary, opacity: running ? 0.65 : 1 }]}
            activeOpacity={0.8}
          >
            {running ? <ActivityIndicator color="#FFFFFF" size="small" /> : isComplete ? <Check size={18} color="#FFFFFF" /> : <Zap size={18} color="#FFFFFF" />}
            <Text style={styles.executeText}>{running ? 'جاري التنفيذ...' : isComplete ? 'إغلاق' : awaitingCode ? 'متابعة الشحن' : 'بدء الشحن المباشر'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.content}>
        <View style={[styles.summary, { backgroundColor: colors.surfaceAlt }]}> 
          <Text style={[styles.summaryTitle, { color: colors.text }]}>شركة {providerLabel[provider]}</Text>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>الرقم: {phoneNumber || 'غير مدخل'}</Text>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>الباقة: {durationKey}</Text>
        </View>
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.danger + '12' }]}>
            <AlertCircle size={17} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.steps}>
          {steps.map((step) => (
            <View key={step.id} style={[styles.stepRow, { borderBottomColor: colors.border }]}> 
              {step.status === 'running' ? <Loader2 size={19} color={colors.primary} /> : step.status === 'success' ? <Check size={19} color={colors.success} /> : step.status === 'failed' ? <AlertCircle size={19} color={colors.danger} /> : <Circle size={19} color={colors.textMuted} />}
              <View style={styles.stepCopy}>
                <Text style={[styles.stepLabel, { color: step.status === 'failed' ? colors.danger : colors.text }]}>{step.label}</Text>
                {step.detail ? <Text style={[styles.stepDetail, { color: colors.textSecondary }]}>{step.detail}</Text> : null}
              </View>
              <Text style={[styles.stepStatus, { color: step.status === 'success' ? colors.success : step.status === 'failed' ? colors.danger : step.status === 'running' ? colors.primary : colors.textMuted }]}>
                {step.status === 'success' ? 'تم التنفيذ' : step.status === 'failed' ? 'فشل' : step.status === 'running' ? 'جاري التنفيذ' : 'بانتظار'}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  summary: { gap: 5, padding: 14, borderRadius: 12 },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  summaryText: { fontSize: 13 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  steps: { gap: 0 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1 },
  stepCopy: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 13, fontWeight: '600' },
  stepDetail: { fontSize: 11 },
  stepStatus: { fontSize: 11, fontWeight: '700' },
  footer: { gap: 10 },
  codeInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center', fontSize: 18, letterSpacing: 4 },
  executeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  executeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
