import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, Platform, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Store, Phone, Lock, User, ShoppingCart, Smartphone, ArrowRight, AlertCircle, Key, Fingerprint } from 'lucide-react-native';
import { useAuth, type SignUpData } from '@/lib/auth-context';
import { palette } from '@/lib/color-system';
import { AppLogo } from '@/components/AppLogo';
import { isBiometricAvailable, isBiometricEnabled, saveCredentials, tryBiometricLogin, getBiometricType } from '@/lib/biometric';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessMode, setBusinessMode] = useState<'retail' | 'telecom'>('retail');
  const [activationKey, setActivationKey] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('البصمة');
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const colors = palette.light;

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricLabel(type === 'face' ? 'التعرف على الوجه' : type === 'iris' ? 'قزحية العين' : 'البصمة');
        const enabled = await isBiometricEnabled();
        setBiometricEnabled(enabled);
      }
    })();
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    setSubmitting(true);
    setError('');
    const creds = await tryBiometricLogin();
    if (!creds) {
      setError('تعذر تسجيل الدخول بالبصمة. استخدم رقم الجوال وكلمة المرور');
      setSubmitting(false);
      return;
    }
    const { error } = await signIn(creds.phone, creds.password);
    if (error) {
      setError(error);
      setSubmitting(false);
    }
  }, [signIn]);

  const revealPassword = () => {
    if (Platform.OS !== 'web') {
      setTimeout(() => scrollRef.current?.scrollTo({ y: 220, animated: true }), 120);
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!phone.trim() || !password.trim()) {
      setError('أدخل رقم الجوال وكلمة المرور');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error } = await signIn(phone.trim(), password.trim());
    if (error) {
      setError(error);
      setSubmitting(false);
    } else {
      if (biometricAvailable) {
        await saveCredentials(phone.trim(), password.trim());
      }
    }
  }, [phone, password, signIn]);

  const handleSignUp = useCallback(async () => {
    if (!phone.trim() || !password.trim()) {
      setError('رقم الجوال وكلمة المرور مطلوبان');
      return;
    }
    if (!storeName.trim()) {
      setError('اسم المحل مطلوب');
      return;
    }
    if (!ownerName.trim()) {
      setError('اسم المالك مطلوب');
      return;
    }
    if (!activationKey.trim()) {
      setError('كود التفعيل مطلوب للتسجيل');
      return;
    }
    setSubmitting(true);
    setError('');
    const data: SignUpData = {
      phone: phone.trim(),
      password: password.trim(),
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      businessMode,
      activationKey: activationKey.trim(),
    };
    const { error } = await signUp(data);
    if (error) {
      setError(error);
      setSubmitting(false);
    }
  }, [phone, password, storeName, ownerName, businessMode, signUp]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      {/* Logo / Header */}
      <View style={styles.header}>
        <AppLogo size={84} />
        <Text style={[styles.appTitle, { color: colors.text }]}>سحاب POS</Text>
        <Text style={[styles.appSubtitle, { color: colors.textSecondary }]}>نظام إدارة المبيعات والمخزون</Text>
      </View>

      {/* Mode Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: colors.surfaceAlt }]}>
        <TouchableOpacity
          onPress={() => { setMode('login'); setError(''); }}
          style={[styles.toggleBtn, mode === 'login' && { backgroundColor: colors.primary }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleText, { color: mode === 'login' ? '#FFFFFF' : colors.textSecondary }]}>
            تسجيل الدخول
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setMode('register'); setError(''); }}
          style={[styles.toggleBtn, mode === 'register' && { backgroundColor: colors.primary }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleText, { color: mode === 'register' ? '#FFFFFF' : colors.textSecondary }]}>
            حساب جديد
          </Text>
        </TouchableOpacity>
      </View>

      {/* Form Card */}
      <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
            <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* Phone */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>رقم الجوال</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Phone size={20} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="05XXXXXXXX"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={[styles.textInput, { color: colors.text }]}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>كلمة المرور</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Lock size={20} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="كلمة المرور"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              onFocus={revealPassword}
              style={[styles.textInput, { color: colors.text }]} 
            />
          </View>
        </View>

        {mode === 'register' && (
          <>
            {/* Store Name */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم المحل</Text>
              <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Store size={20} color={colors.textMuted} strokeWidth={2} />
                <TextInput
                  value={storeName}
                  onChangeText={setStoreName}
                  placeholder="مثال: متجر الأمانة"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { color: colors.text }]}
                />
              </View>
            </View>

            {/* Owner Name */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم المالك</Text>
              <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <User size={20} color={colors.textMuted} strokeWidth={2} />
                <TextInput
                  value={ownerName}
                  onChangeText={setOwnerName}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.textInput, { color: colors.text }]}
                />
              </View>
            </View>

            {/* Business Mode */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>نوع النشاط</Text>
              <View style={styles.modeSelector}>
                <TouchableOpacity
                  onPress={() => setBusinessMode('retail')}
                  style={[styles.modeBtn, businessMode === 'retail' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <ShoppingCart size={20} color={businessMode === 'retail' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                  <Text style={[styles.modeText, { color: businessMode === 'retail' ? '#FFFFFF' : colors.textSecondary }]}>تجاري</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setBusinessMode('telecom')}
                  style={[styles.modeBtn, businessMode === 'telecom' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Smartphone size={20} color={businessMode === 'telecom' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
                  <Text style={[styles.modeText, { color: businessMode === 'telecom' ? '#FFFFFF' : colors.textSecondary }]}>اتصالات</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Activation Key */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>كود التفعيل</Text>
              <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Key size={20} color={colors.textMuted} strokeWidth={2} />
                <TextInput
                  value={activationKey}
                  onChangeText={setActivationKey}
                  placeholder="أدخل كود التفعيل الذي حصلت عليه"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  style={[styles.textInput, { color: colors.text }]}
                />
              </View>
            </View>
          </>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={mode === 'login' ? handleSignIn : handleSignUp}
          disabled={submitting}
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitText}>
                {mode === 'login' ? 'دخول' : 'إنشاء حساب'}
              </Text>
              <ArrowRight size={20} color="#FFFFFF" strokeWidth={2} />
            </>
          )}
        </TouchableOpacity>

        {mode === 'login' && biometricAvailable && biometricEnabled && (
          <TouchableOpacity
            onPress={handleBiometricLogin}
            disabled={submitting}
            style={[styles.biometricBtn, { borderColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
            activeOpacity={0.7}
          >
            <Fingerprint size={24} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.biometricText, { color: colors.primary }]}>
              دخول بـ{biometricLabel}
            </Text>
          </TouchableOpacity>
        )}

        {mode === 'login' && biometricAvailable && !biometricEnabled && (
          <Text style={[styles.hintText, { color: colors.accent }]}>
            يمكنك تفعيل الدخول بالبصمة من الإعدادات بعد تسجيل الدخول
          </Text>
        )}

        {mode === 'login' && (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            رقم الجوال هو اسم المستخدم وكلمة المرور
          </Text>
        )}
        {mode === 'register' && (
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            مطلوب كود تفعيل صالح من المسؤول لإنشاء حساب جديد
          </Text>
        )}
        {mode === 'register' && (
          <Text style={[styles.hintText, { color: colors.accent }]}>
            أول حساب يتم تسجيله يصبح حساب المسؤول تلقائياً (تجربة 7 أيام)
          </Text>
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: Platform.OS === 'web' ? 40 : 280, paddingTop: Platform.OS === 'web' ? 60 : 48 },
  header: { alignItems: 'center', marginBottom: 32, gap: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  appTitle: { fontSize: 28, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  appSubtitle: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  toggleContainer: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  formCard: { borderRadius: 20, padding: 20, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1, fontFamily: 'Cairo-SemiBold' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  textInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: 'Cairo-Regular' },
  modeSelector: { flexDirection: 'row', gap: 10 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  modeText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14, marginTop: 4 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  hintText: { fontSize: 12, textAlign: 'center', fontFamily: 'Cairo-Regular' },
  biometricBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 2, marginTop: 4 },
  biometricText: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
});
