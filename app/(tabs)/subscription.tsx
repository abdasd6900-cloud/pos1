import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import {
  Shield, KeyRound, Clock, Check, X, AlertTriangle,
  Gift, Calendar, Smartphone, Copy, MessageSquare, Lock,
  Crown, RefreshCw,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/format';
import {
  getLicenseStatusText, getDaysRemaining, generateExpirySms,
  generateActivationKey,
} from '@/lib/license-engine';
import type { LicensePlan } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function SubscriptionScreen() {
  const { license, activateLicense, refreshLicense, settings, readOnlyMode } = useApp();
  const { colors } = useTheme();
  const [showActivate, setShowActivate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [toast, setToast] = useState('');

  if (!license) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الاشتراك</Text>
        </View>
        <View style={styles.disabledWrap}>
          <EmptyState
            icon={<Shield size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="النظام غير مفعّل"
            subtitle="فعّل نظام الترخيص من الإعدادات"
          />
        </View>
      </View>
    );
  }

  const daysRemaining = getDaysRemaining(license);
  const statusText = getLicenseStatusText(license.status);
  const isTrial = license.status === 'trial';
  const isActive = license.status === 'active';
  const isExpired = license.status === 'expired';
  const isLocked = license.status === 'locked';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleCopyFingerprint = () => {
    // Web fallback - just show toast
    showToast('تم نسخ بصمة الجهاز');
  };

  const handleSendReminder = () => {
    if (!license.expiresAt && license.plan !== 'lifetime') return;
    const sms = generateExpirySms(settings.storeName, settings.ownerName, daysRemaining, license.expiresAt ?? Date.now());
    showToast('تم تجهيز رسالة التذكير');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الاشتراك</Text>
        <TouchableOpacity onPress={refreshLicense} style={[styles.refreshBtn, { backgroundColor: colors.surfaceAlt }]}>
          <RefreshCw size={18} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Status Card */}
      <View style={styles.section}>
        <View style={[styles.statusCard, {
          backgroundColor: isActive ? colors.success + '15' :
            isTrial ? colors.info + '15' :
            isLocked ? colors.danger + '15' :
            colors.warning + '15',
          borderColor: isActive ? colors.success :
            isTrial ? colors.info :
            isLocked ? colors.danger :
            colors.warning,
        }]}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIcon, {
              backgroundColor: isActive ? colors.success :
                isTrial ? colors.info :
                isLocked ? colors.danger :
                colors.warning,
            }]}>
              {isActive ? <Check size={24} color="#FFFFFF" strokeWidth={2.5} /> :
               isTrial ? <Gift size={24} color="#FFFFFF" strokeWidth={2} /> :
               isLocked ? <Lock size={24} color="#FFFFFF" strokeWidth={2} /> :
               <AlertTriangle size={24} color="#FFFFFF" strokeWidth={2} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusLabel, { color: colors.text }]}>{statusText}</Text>
              {isActive && license.plan && (
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                  {license.plan === 'monthly' ? 'اشتراك شهري' : license.plan === 'yearly' ? 'اشتراك سنوي' : 'ترخيص مدى الحياة'}
                </Text>
              )}
              {isTrial && (
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
                  {daysRemaining > 0 ? `متبقي ${daysRemaining} يوم` : 'انتهت الفترة التجريبية'}
                </Text>
              )}
              {isExpired && (
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>الوضع للقراءة فقط - التجديد مطلوب</Text>
              )}
              {isLocked && (
                <Text style={[styles.statusSub, { color: colors.textSecondary }]}>تم اكتشاف تلاعب بالتاريخ</Text>
              )}
            </View>
          </View>

          {/* Countdown bar for trial */}
          {isTrial && daysRemaining > 0 && (
            <View style={styles.countdownBar}>
              <View style={[styles.countdownFill, {
                backgroundColor: colors.info,
                width: `${(daysRemaining / license.trialDays) * 100}%`,
              }]} />
            </View>
          )}
        </View>
      </View>

      {/* Read-only warning */}
      {readOnlyMode && (
        <View style={styles.section}>
          <View style={[styles.warningBox, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
            <AlertTriangle size={20} color={colors.warning} strokeWidth={2} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              انتهى اشتراكك. التطبيق في وضع القراءة فقط - يمكنك تصفح بياناتك ولكن لا يمكن إضافة مبيعات أو فواتير جديدة. جدّد الآن لمواصلة العمل.
            </Text>
          </View>
        </View>
      )}

      {/* License Details */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>تفاصيل الترخيص</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <DetailRow icon={<Smartphone size={18} color={colors.primary} strokeWidth={2} />} label="بصمة الجهاز" value={license.deviceFingerprint} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <DetailRow icon={<Calendar size={18} color={colors.info} strokeWidth={2} />} label="تاريخ التثبيت" value={formatDateTime(license.installDate)} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          {license.activatedAt && (
            <>
              <DetailRow icon={<Check size={18} color={colors.success} strokeWidth={2} />} label="تاريخ التفعيل" value={formatDateTime(license.activatedAt)} colors={colors} />
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            </>
          )}
          {license.expiresAt && license.plan !== 'lifetime' && (
            <DetailRow icon={<Clock size={18} color={colors.warning} strokeWidth={2} />} label="تاريخ الانتهاء" value={formatDateTime(license.expiresAt)} colors={colors} />
          )}
          {license.plan === 'lifetime' && (
            <DetailRow icon={<Crown size={18} color={colors.accent} strokeWidth={2} />} label="الترخيص" value="مدى الحياة" colors={colors} />
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        {(isTrial || isExpired) && (
          <TouchableOpacity
            onPress={() => setShowActivate(true)}
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <KeyRound size={20} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.actionBtnText}>إدخال كود التفعيل</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={handleCopyFingerprint}
            style={[styles.secondaryBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Copy size={18} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>نسخ بصمة الجهاز</Text>
          </TouchableOpacity>
          {(isTrial || isExpired) && license.expiresAt && (
            <TouchableOpacity
              onPress={handleSendReminder}
              style={[styles.secondaryBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <MessageSquare size={18} color={colors.info} strokeWidth={2} />
              <Text style={[styles.secondaryBtnText, { color: colors.info }]}>تذكير بالتجديد</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Provider section - generate keys */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>لوحة المزود (توليد أكواد التفعيل)</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardHint, { color: colors.textMuted }]}>
            استخدم هذه اللوحة لتوليد كود تفعيل لهذا الجهاز. أدخل نوع الاشتراك وعدد الأيام للحصول على الكود.
          </Text>
          <TouchableOpacity
            onPress={() => setShowGenerate(true)}
            style={[styles.genBtn, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]}
            activeOpacity={0.7}
          >
            <KeyRound size={18} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.genBtnText, { color: colors.accent }]}>توليد كود تفعيل</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Toast */}
      {toast ? (
        <View style={[styles.toast, { backgroundColor: colors.success }]}>
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Activation Modal */}
      <ActivationModal
        visible={showActivate}
        colors={colors}
        onClose={() => setShowActivate(false)}
        onActivate={(key, plan) => {
          const result = activateLicense(key, plan);
          if (result.success) {
            showToast(result.message);
            setShowActivate(false);
          } else {
            showToast(result.message);
          }
        }}
      />

      {/* Key Generation Modal */}
      <GenerateKeyModal
        visible={showGenerate}
        colors={colors}
        fingerprint={license.deviceFingerprint}
        onClose={() => setShowGenerate(false)}
        onCopy={() => showToast('تم نسخ كود التفعيل')}
      />
    </ScrollView>
  );
}

function DetailRow({ icon, label, value, colors }: {
  icon: React.ReactNode; label: string; value: string; colors: Colors;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function ActivationModal({ visible, colors, onClose, onActivate }: {
  visible: boolean;
  colors: Colors;
  onClose: () => void;
  onActivate: (key: string, plan: LicensePlan) => void;
}) {
  const [key, setKey] = useState('');
  const [plan, setPlan] = useState<LicensePlan>('monthly');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setKey(''); setError(''); }
  }, [visible]);

  const handleActivate = () => {
    if (!key.trim()) { setError('أدخل كود التفعيل'); return; }
    onActivate(key.trim(), plan);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="تفعيل الاشتراك"
      footer={
        <TouchableOpacity onPress={handleActivate} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <KeyRound size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>تفعيل</Text>
        </TouchableOpacity>
      }
    >
      <View style={[styles.pinInfoBox, { backgroundColor: colors.info + '10' }]}>
        <KeyRound size={20} color={colors.info} strokeWidth={2} />
        <Text style={[styles.pinInfoText, { color: colors.info }]}>
          أدخل كود التفعيل الذي حصلت عليه من مزود النظام
        </Text>
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>نوع الاشتراك</Text>
      <View style={styles.planRow}>
        <PlanBtn label="شهري" selected={plan === 'monthly'} onPress={() => setPlan('monthly')} colors={colors} />
        <PlanBtn label="سنوي" selected={plan === 'yearly'} onPress={() => setPlan('yearly')} colors={colors} />
        <PlanBtn label="مدى الحياة" selected={plan === 'lifetime'} onPress={() => setPlan('lifetime')} colors={colors} />
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>كود التفعيل</Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="M30-XXXX-XXXXXXXX"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        style={[styles.keyInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
      />
    </BaseModal>
  );
}

function PlanBtn({ label, selected, onPress, colors }: {
  label: string; selected: boolean; onPress: () => void; colors: Colors;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.planBtn, selected ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
    >
      <Text style={[styles.planBtnText, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function GenerateKeyModal({ visible, colors, fingerprint, onClose, onCopy }: {
  visible: boolean;
  colors: Colors;
  fingerprint: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  const [plan, setPlan] = useState<LicensePlan>('monthly');
  const [days, setDays] = useState('30');
  const [generatedKey, setGeneratedKey] = useState('');

  useEffect(() => {
    if (visible) { setPlan('monthly'); setDays('30'); setGeneratedKey(''); }
  }, [visible]);

  const handleGenerate = () => {
    const durationDays = plan === 'monthly' ? 30 : plan === 'yearly' ? 365 : parseInt(days) || 36500;
    const key = generateActivationKey(fingerprint, plan, durationDays);
    setGeneratedKey(key);
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="توليد كود تفعيل"
      footer={
        generatedKey ? (
          <View style={styles.genFooter}>
            <TouchableOpacity onPress={onCopy} style={[styles.copyKeyBtn, { backgroundColor: colors.surfaceAlt }]}>
              <Copy size={18} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.copyKeyText, { color: colors.primary }]}>نسخ</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setGeneratedKey('')} style={[styles.saveBtn, { backgroundColor: colors.surfaceAlt, flex: 1 }]}>
              <Text style={[styles.saveBtnText, { color: colors.text }]}>كود جديد</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleGenerate} style={[styles.saveBtn, { backgroundColor: colors.accent }]} activeOpacity={0.8}>
            <KeyRound size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>توليد الكود</Text>
          </TouchableOpacity>
        )
      }
    >
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>نوع الاشتراك</Text>
      <View style={styles.planRow}>
        <PlanBtn label="شهري" selected={plan === 'monthly'} onPress={() => { setPlan('monthly'); setDays('30'); }} colors={colors} />
        <PlanBtn label="سنوي" selected={plan === 'yearly'} onPress={() => { setPlan('yearly'); setDays('365'); }} colors={colors} />
        <PlanBtn label="مدى الحياة" selected={plan === 'lifetime'} onPress={() => { setPlan('lifetime'); setDays('36500'); }} colors={colors} />
      </View>

      {plan !== 'lifetime' && (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>عدد الأيام</Text>
          <TextInput
            value={days}
            onChangeText={setDays}
            placeholder="30"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </View>
      )}

      <View style={[styles.fingerprintBox, { backgroundColor: colors.surfaceAlt }]}>
        <Smartphone size={16} color={colors.textMuted} strokeWidth={2} />
        <Text style={[styles.fingerprintText, { color: colors.textMuted }]}>{fingerprint}</Text>
      </View>

      {generatedKey && (
        <View style={[styles.keyResultBox, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
          <Check size={18} color={colors.success} strokeWidth={2} />
          <Text style={[styles.keyResultText, { color: colors.success }]} selectable>{generatedKey}</Text>
        </View>
      )}
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  refreshBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  disabledWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  statusCard: { borderRadius: 16, padding: 18, borderWidth: 2 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  statusIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statusSub: { fontSize: 14, marginTop: 4, fontFamily: 'Cairo-SemiBold' },
  countdownBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(128,128,128,0.15)', overflow: 'hidden' },
  countdownFill: { height: '100%', borderRadius: 3 },
  warningBox: { flexDirection: 'row', gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  warningText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 20, fontFamily: 'Cairo-SemiBold' },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHint: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  detailIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 12, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold', marginTop: 2 },
  rowDivider: { height: 1, marginVertical: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16 },
  actionBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  genBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  pinInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  pinInfoText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20, fontFamily: 'Cairo-SemiBold' },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center', fontFamily: 'Cairo-SemiBold' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  planRow: { flexDirection: 'row', gap: 8 },
  planBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  planBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  keyInput: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, fontSize: 18, textAlign: 'center', fontFamily: 'Cairo-Bold', letterSpacing: 2 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  fingerprintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  fingerprintText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  keyResultBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, borderWidth: 2, marginTop: 16 },
  keyResultText: { flex: 1, fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', letterSpacing: 1 },
  genFooter: { flexDirection: 'row', gap: 10 },
  copyKeyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, paddingHorizontal: 20 },
  copyKeyText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  toast: { position: 'absolute', bottom: 20, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, elevation: 6 },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
});
