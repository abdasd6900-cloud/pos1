import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Switch, Image , Platform, PermissionsAndroid } from 'react-native';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Moon, Sun, Smartphone, WifiOff, MessageSquare,
  Download, Trash2, Info, ChevronLeft, Check, Shield,
  Crown, ShoppingBag, Save, Lock, Cloud,
  CloudDownload, Bell, KeyRound, Printer,
  ScrollText, Star, Mic, Zap, Pause, QrCode, Clock, Truck,
  ClipboardCheck, Tag, Paperclip, Plus, Pencil,
  Send, RefreshCw, AlertCircle, CheckCircle,
  Inbox,
  UserCog, LogOut, Image as ImageIcon, X, Camera, Fingerprint,
} from 'lucide-react-native';
import { useSmsGateway } from '@/lib/sms-gateway';
import { createSmsAppShortcut, isDefaultSmsApp, requestDefaultSmsApp, hasSmsPermissions, requestSmsPermissions } from '@/lib/native-bridge';
import { isBiometricAvailable, isBiometricEnabled as getBiometricEnabled, setBiometricEnabled, getBiometricType, clearCredentials } from '@/lib/biometric';
import type { TelecomCompany, AutoReplyTemplates } from '@/types';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { BaseModal } from '@/components/BaseModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AuditLogScreen } from '@/components/AuditLogScreen';
import { SkyIntegrationModal } from '@/components/SkyIntegrationModal';
import { LayanIntegrationModal } from '@/components/LayanIntegrationModal';
import { AreenIntegrationModal } from '@/components/AreenIntegrationModal';
import { CloudBackupScreen } from '@/components/CloudBackupScreen';
import { DEFAULT_SMS_TEMPLATE, DEFAULT_AUTO_REPLY_TEMPLATES } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function SettingsScreen() {
  const { settings, updateSettings, resetAllData, seedDemoData, createBackup, restoreBackup, hasBackup, exportBackupFile, auditLog, clearAuditLog, telecomCompanies, addTelecomCompany, updateTelecomCompany, deleteTelecomCompany } = useApp();
  const { colors, isDark, toggleTheme } = useTheme();
  const { profile, signOut } = useAuth();
  const [showBusinessMode, setShowBusinessMode] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showSkyModal, setShowSkyModal] = useState(false);
  const [showLayanModal, setShowLayanModal] = useState(false);
  const [showAreenModal, setShowAreenModal] = useState(false);
  const [showCloudBackup, setShowCloudBackup] = useState(false);
  const [showTelecomCompanies, setShowTelecomCompanies] = useState(false);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editCompany, setEditCompany] = useState<TelecomCompany | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<TelecomCompany | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyColor, setCompanyColor] = useState('#E63946');
  const [companySupportPhone, setCompanySupportPhone] = useState('');
  const [showAutoReplyModal, setShowAutoReplyModal] = useState(false);
  const [autoReplyDraft, setAutoReplyDraft] = useState<AutoReplyTemplates>(DEFAULT_AUTO_REPLY_TEMPLATES);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('البصمة');
  const [backupExists, setBackupExists] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [storeName, setStoreName] = useState(settings.storeName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [currency, setCurrency] = useState(settings.currency);
  const [taxRate, setTaxRate] = useState(settings.taxRate.toString());
  const [receiptLogo, setReceiptLogo] = useState(settings.receiptLogo || '');
  const [receiptHeaderText, setReceiptHeaderText] = useState(settings.receiptHeaderText || '');
  const [receiptFooterText, setReceiptFooterText] = useState(settings.receiptFooterText || '');
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const isWeb = Platform.OS === 'web';
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [smsPermissionGranted, setSmsPermissionGranted] = useState<boolean | null>(null);
  const [contactsPermissionGranted, setContactsPermissionGranted] = useState<boolean | null>(null);
  const smsGateway = useSmsGateway();

  useEffect(() => {
    hasBackup().then(setBackupExists);
  }, [hasBackup]);

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      setBiometricSupported(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricLabel(type === 'face' ? 'التعرف على الوجه' : type === 'iris' ? 'قزحية العين' : 'البصمة');
        const enabled = await getBiometricEnabled();
        setBiometricOn(enabled);
      }
    })();
  }, []);

  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      await setBiometricEnabled(true);
      setBiometricOn(true);
      showToast(`تم تفعيل الدخول بـ${biometricLabel}. سيتم تسجيل بياناتك عند تسجيل الدخول القادم`);
    } else {
      await setBiometricEnabled(false);
      await clearCredentials();
      setBiometricOn(false);
      showToast('تم إيقاف الدخول بالبصمة وحذف البيانات المحفوظة');
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS).then(setSmsPermissionGranted);
      PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS).then(setContactsPermissionGranted);
    } else {
      setSmsPermissionGranted(false);
      setContactsPermissionGranted(false);
    }
  }, []);

  const requestSmsPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'إذن إرسال SMS',
          message: 'يحتاج التطبيق لإذن إرسال رسائل تلقائية للعملاء من شريحة الجوال',
          buttonNeutral: 'اسأل لاحقاً',
          buttonNegative: 'إلغاء',
          buttonPositive: 'موافق',
        }
      );
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setSmsPermissionGranted(ok);
      if (!ok) setGatewayError('يجب منح إذن إرسال SMS من إعدادات الأندرويد');
      return ok;
    } catch {
      setGatewayError('تعذر طلب إذن SMS');
      return false;
    }
  }, []);

  const requestContactsPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'إذن الوصول لجهات الاتصال',
          message: 'يحتاج التطبيق لقراءة جهات الاتصال لعرض أسماء المرسلين بدلاً من أرقامهم فقط',
          buttonNeutral: 'اسأل لاحقاً',
          buttonNegative: 'إلغاء',
          buttonPositive: 'موافق',
        }
      );
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setContactsPermissionGranted(ok);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleStartGateway = useCallback(async () => {
    setGatewayError(null);
    if (Platform.OS === 'web') {
      setGatewayError('البوابة تعمل فقط من جهاز الأندرويد');
      return;
    }
    let ok = smsPermissionGranted;
    if (!ok) ok = await requestSmsPermission();
    if (!ok) return;
    if (!contactsPermissionGranted) await requestContactsPermission();
    // Request POST_NOTIFICATIONS for Android 13+ (API 33+)
    try {
      const apiLevel = Platform.Version as number;
      if (apiLevel >= 33) {
        const notifGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS as any,
          {
            title: 'إذن الإشعارات',
            message: 'يحتاج التطبيق لإذن عرض إشعارات الرسائل الواردة مع إمكانية الرد المباشر',
            buttonNeutral: 'اسأل لاحقاً',
            buttonNegative: 'إلغاء',
            buttonPositive: 'موافق',
          }
        );
        if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          // Non-fatal — SMS gateway still works, just no rich notifications
        }
      }
    } catch {
      // POST_NOTIFICATIONS may not exist on older Android — ignore
    }
    smsGateway.start();
    showToast('تم تفعيل بوابة SMS');
  }, [smsPermissionGranted, requestSmsPermission, contactsPermissionGranted, requestContactsPermission, smsGateway]);

  const handleStopGateway = useCallback(() => {
    smsGateway.stop();
    setGatewayError(null);
    showToast('تم إيقاف بوابة SMS');
  }, [smsGateway]);

  const handleSmsInboxToggle = (enabled: boolean) => {
    updateSettings({ enableSmsInbox: enabled, enableSmsMonitoring: enabled });
    showToast(enabled ? 'تم تفعيل استقبال وفرز الرسائل' : 'تم إيقاف استقبال وفرز الرسائل');
  };

  const showToast = (msg: string) => {
    setBackupMsg(msg);
    setTimeout(() => setBackupMsg(''), 2500);
  };

  const handleCreateShortcut = async () => {
    const ok = await createSmsAppShortcut();
    showToast(ok ? 'تم إنشاء اختصار الرسائل على الشاشة الرئيسية' : 'يتطلب هذا هاتف أندرويد');
  };

  const [defaultSmsStatus, setDefaultSmsStatus] = useState<'checking' | 'default' | 'not_default' | 'unsupported'>('checking');

  useEffect(() => {
    isDefaultSmsApp().then((isDefault) => {
      if (isDefault) setDefaultSmsStatus('default');
      else setDefaultSmsStatus('not_default');
    });
  }, []);

  const handleRequestDefaultSms = async () => {
    if (Platform.OS !== 'android') {
      setDefaultSmsStatus('unsupported');
      showToast('يتطلب هذا هاتف أندرويد');
      return;
    }

    const isDefault = await isDefaultSmsApp();
    if (!isDefault) {
      await requestDefaultSmsApp();
      showToast('اختر سحاب POS كتطبيق الرسائل الافتراضي ثم اضغط مرة أخرى');
      setTimeout(() => {
        isDefaultSmsApp().then((isNowDefault) => {
          setDefaultSmsStatus(isNowDefault ? 'default' : 'not_default');
        });
      }, 3000);
      return;
    }

    const hasPerms = await hasSmsPermissions();
    if (!hasPerms) {
      showToast('اسمح بالوصول إلى الرسائل من نافذة أندرويد');
      await requestSmsPermissions();
      setTimeout(async () => {
        const granted = await hasSmsPermissions();
        showToast(granted ? 'تم تفعيل صلاحيات الرسائل' : 'لم يتم منح صلاحيات الرسائل');
      }, 2000);
      return;
    }

    const ok = await requestDefaultSmsApp();
    if (ok) {
      setDefaultSmsStatus('default');
      showToast('التطبيق هو البرنامج الافتراضي للرسائل');
    } else {
      showToast('سيظهر إعداد النظام - اختر سحاب POS كبرنامج الرسائل الافتراضي');
      setTimeout(() => {
        isDefaultSmsApp().then((isDefault) => {
          setDefaultSmsStatus(isDefault ? 'default' : 'not_default');
        });
      }, 3000);
    }
  };

  const handleSaveStoreInfo = () => {
    updateSettings({
      storeName: storeName.trim() || 'سحاب POS',
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      currency: currency.trim() || 'ر.س',
      taxRate: parseFloat(taxRate) || 0,
      receiptLogo: receiptLogo.trim(),
      receiptHeaderText: receiptHeaderText.trim(),
      receiptFooterText: receiptFooterText.trim(),
    });
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      showToast('حجم الصورة كبير. اختر صورة أقل من 500 كيلوبايت');
      if (e.target) e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (typeof result === 'string') {
        setReceiptLogo(result);
      }
      if (e.target) e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const pickLogoMobile = () => {
    showToast('رفع الشعار متاح من نسخة الويب فقط حالياً');
  };

  const handleBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupMsg('جاري إنشاء النسخة الاحتياطية...');
    try {
      await createBackup();
      const saved = await hasBackup();
      if (!saved) throw new Error('backup_not_saved');
      setBackupExists(true);
      showToast('تم إنشاء نسخة احتياطية بنجاح');
    } catch {
      showToast('تعذر حفظ النسخة الاحتياطية. حاول مرة أخرى');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupMsg('جاري استعادة النسخة الاحتياطية...');
    try {
      const ok = await restoreBackup();
      showToast(ok ? 'تم استعادة البيانات بنجاح' : 'لا توجد نسخة احتياطية');
    } catch {
      showToast('تعذر استعادة النسخة الاحتياطية');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleExportFile = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupMsg('جاري تصدير النسخة...');
    try {
      await exportBackupFile();
      showToast('تم تصدير النسخة الاحتياطية');
    } catch {
      showToast('تعذر تصدير النسخة');
    } finally {
      setBackupBusy(false);
    }
  };


  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>الإعدادات</Text>
      </View>

      {/* Theme */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>المظهر</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.surfaceAlt }]}>
                {isDark ? <Moon size={20} color={colors.primary} strokeWidth={2} /> : <Sun size={20} color={colors.primary} strokeWidth={2} />}
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>الوضع الداكن</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                  {isDark ? 'مفعّل - مريح للعين' : 'معطّل - الوضع الفاتح'}
                </Text>
              </View>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: colors.surfaceAlt, true: colors.primary }} thumbColor="#FFFFFF" />
          </View>
        </View>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الأمان والحماية</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: settings.pinEnabled ? colors.primary + '20' : colors.surfaceAlt }]}>
                <Lock size={20} color={settings.pinEnabled ? colors.primary : colors.textMuted} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>قفل التطبيق برمز سري</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                  {settings.pinEnabled ? 'مفعّل - التطبيق محمي' : 'معطّل - لا يوجد قفل'}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.pinEnabled}
              onValueChange={(v) => {
                if (v && !settings.ownerPin) {
                  setShowPinModal(true);
                } else if (!v) {
                  updateSettings({ pinEnabled: false });
                } else {
                  updateSettings({ pinEnabled: true });
                }
              }}
              trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {settings.pinEnabled && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <ActionRow
                icon={<KeyRound size={20} color={colors.primary} strokeWidth={2} />}
                label="تغيير الرمز السري"
                hint="تعديل رمز قفل التطبيق"
                onPress={() => setShowPinModal(true)}
                colors={colors}
              />
            </>
          )}
          {biometricSupported && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <View style={[styles.settingIcon, { backgroundColor: biometricOn ? colors.primary + '20' : colors.surfaceAlt }]}>
                    <Fingerprint size={20} color={biometricOn ? colors.primary : colors.textMuted} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={[styles.settingLabel, { color: colors.text }]}>الدخول بالبصمة</Text>
                    <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                      {biometricOn ? `مفعّل - سجل دخولك بـ${biometricLabel}` : 'سجل دخولك بلمسة بدلاً من كتابة البيانات'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={biometricOn}
                  onValueChange={handleBiometricToggle}
                  trackColor={{ false: colors.surfaceAlt, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </>
          )}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>نوع النشاط التجاري</Text>
        <TouchableOpacity onPress={() => setShowBusinessMode(true)} style={[styles.card, { backgroundColor: colors.surface }]} activeOpacity={0.7}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
                {settings.businessMode === 'retail' ? <ShoppingBag size={20} color={colors.primary} strokeWidth={2} /> : <Smartphone size={20} color={colors.primary} strokeWidth={2} />}
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {settings.businessMode === 'retail' ? 'تجاري / بقالة / سوبرماركت' : 'وكالة اتصالات'}
                </Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>اضغط لتغيير نوع النشاط</Text>
              </View>
            </View>
            <ChevronLeft size={20} color={colors.textMuted} strokeWidth={2} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Telecom Companies Management */}
      {settings.businessMode === 'telecom' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>شركات الاتصالات</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <ActionRow
              icon={<Smartphone size={20} color={colors.primary} strokeWidth={2} />}
              label="إدارة شركات الاتصال"
              hint={`${telecomCompanies.length} شركة مسجلة - إضافة/تعديل/حذف`}
              onPress={() => setShowTelecomCompanies(true)}
              colors={colors}
            />
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            <ActionRow
              icon={<Zap size={20} color={colors.accent} strokeWidth={2} />}
              label="تكامل شحن سكاي - Sky 5G"
              hint="أتمتة الشحن من موقع سكاي بدون تدخل يدوي"
              onPress={() => setShowSkyModal(true)}
              colors={colors}
            />
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            <ActionRow
              icon={<Zap size={20} color={colors.info} strokeWidth={2} />}
              label="تكامل شحن ليان - Layan"
              hint="أتمتة الشحن من موقع ليان مع كود واتساب"
              onPress={() => setShowLayanModal(true)}
              colors={colors}
            />
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            <ActionRow
              icon={<Zap size={20} color={colors.warning} strokeWidth={2} />}
              label="تكامل شحن أرين - Areen"
              hint="أتمتة الشحن من موقع أرين برقم الاشتراك"
              onPress={() => setShowAreenModal(true)}
              colors={colors}
            />
          </View>
        </View>
      )}

      {/* Store Info */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>معلومات المتجر</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <FormField label="اسم المتجر" colors={colors}>
            <TextInput value={storeName} onChangeText={setStoreName} placeholder="اسم متجرك" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </FormField>
          <FormField label="اسم المالك" colors={colors}>
            <TextInput value={ownerName} onChangeText={setOwnerName} placeholder="اسمك" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </FormField>
          <FormField label="رقم الهاتف" colors={colors}>
            <TextInput value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </FormField>
          <View style={styles.formRow}>
            <FormField label="العملة" colors={colors} style={{ flex: 1 }}>
              <TextInput value={currency} onChangeText={setCurrency} placeholder="ر.س" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
            <FormField label="نسبة الضريبة %" colors={colors} style={{ flex: 1 }}>
              <TextInput value={taxRate} onChangeText={setTaxRate} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
            </FormField>
          </View>
          <TouchableOpacity onPress={handleSaveStoreInfo} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Save size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>حفظ المعلومات</Text>
          </TouchableOpacity>
          {showSavedToast && (
            <View style={[styles.toast, { backgroundColor: colors.success + '15' }]}>
              <Check size={16} color={colors.success} strokeWidth={2} />
              <Text style={[styles.toastText, { color: colors.success }]}>تم الحفظ بنجاح</Text>
            </View>
          )}
        </View>
      </View>

      {/* Receipt Customization */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>تخصيص الوصولات</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <FormField label="شعار المتجر على الوصولات" colors={colors}>
            <View style={styles.logoUploadRow}>
              {receiptLogo ? (
                <Image source={{ uri: receiptLogo }} style={styles.logoPreview} resizeMode="contain" />
              ) : (
                <View style={[styles.logoPlaceholder, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <ImageIcon size={24} color={colors.textMuted} strokeWidth={2} />
                </View>
              )}
              <View style={{ flex: 1, gap: 8 }}>
                <TouchableOpacity
                  onPress={isWeb ? () => logoInputRef.current?.click() : pickLogoMobile}
                  style={[styles.logoUploadBtn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                >
                  <ImageIcon size={16} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.logoUploadBtnText}>اختيار صورة</Text>
                </TouchableOpacity>
                {receiptLogo ? (
                  <TouchableOpacity
                    onPress={() => setReceiptLogo('')}
                    style={[styles.logoRemoveBtn, { backgroundColor: colors.surfaceAlt }]}
                    activeOpacity={0.7}
                  >
                    <X size={16} color={colors.danger} strokeWidth={2} />
                    <Text style={[styles.logoRemoveBtnText, { color: colors.danger }]}>إزالة الشعار</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={[styles.logoHint, { color: colors.textMuted }]}>PNG أو JPG، أقل من 500 كيلوبايت</Text>
              </View>
              {isWeb && (
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
              )}
            </View>
          </FormField>
          <FormField label="نص أعلى الوصل (اختياري)" colors={colors}>
            <TextInput
              value={receiptHeaderText}
              onChangeText={setReceiptHeaderText}
              placeholder="مثال: فرع وسط المدينة - هاتف: 05XXXXXXXX"
              placeholderTextColor={colors.textMuted}
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
            />
          </FormField>
          <FormField label="نص أسفل الوصل (اختياري)" colors={colors}>
            <TextInput
              value={receiptFooterText}
              onChangeText={setReceiptFooterText}
              placeholder="مثال: لا يُقبل إرجاع أو استبدال بعد مرور 3 أيام"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60, textAlignVertical: 'top' }]}
            />
          </FormField>
          <TouchableOpacity onPress={handleSaveStoreInfo} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
            <Save size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>حفظ التخصيص</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>المميزات</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ToggleRow icon={<MessageSquare size={20} color={colors.info} strokeWidth={2} />} label="إرسال SMS تلقائي" hint="إرسال إيصالات البيع والتسديد عبر رسائل SMS" value={settings.enableSms} onValueChange={(v) => updateSettings({ enableSms: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Crown size={20} color={colors.accent} strokeWidth={2} />} label="خصم العملاء المميزين" hint="تطبيق خصم تلقائي على عملاء VIP" value={settings.enableVipDiscount} onValueChange={(v) => updateSettings({ enableVipDiscount: v })} colors={colors} />
          {settings.enableSms && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <ActionRow icon={<MessageSquare size={20} color={colors.info} strokeWidth={2} />} label="قالب رسالة SMS" hint="تعديل صيغة الرسائل المرسلة للعملاء" onPress={() => setShowSmsModal(true)} colors={colors} />
            </>
          )}
          {settings.businessMode === 'telecom' && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <ActionRow icon={<MessageSquare size={20} color={colors.accent} strokeWidth={2} />} label="قالب الردود التلقائية" hint="تعديل رسائل الترحيب، الشحن، الدعم الفني، والاستعجال" onPress={() => { setAutoReplyDraft(settings.autoReplyTemplates ?? DEFAULT_AUTO_REPLY_TEMPLATES); setShowAutoReplyModal(true); }} colors={colors} />
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <FormField label="مهلة التحويل التلقائي للدعم (دقائق)" colors={colors}>
                <TextInput
                  value={(settings.autoForwardTimeoutMinutes ?? 60).toString()}
                  onChangeText={(v) => updateSettings({ autoForwardTimeoutMinutes: parseInt(v) || 60 })}
                  placeholder="60"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                />
              </FormField>
            </>
          )}
        </View>
      </View>

      {/* SMS Gateway */}
      {settings.enableSms && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>بوابة SMS للجوال</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <View style={[styles.settingIcon, { backgroundColor: smsGateway.status.active ? colors.success + '20' : colors.surfaceAlt }]}>
                  {smsGateway.status.active ? <CheckCircle size={20} color={colors.success} strokeWidth={2} /> : <Send size={20} color={colors.textMuted} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>بوابة إرسال SMS</Text>
                  <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                    {Platform.OS === 'web' ? 'تعمل فقط من جهاز الأندرويد' : smsGateway.status.active ? 'تعمل - تراقب طابور الرسائل' : 'معطّلة - اضغط للتفعيل'}
                  </Text>
                </View>
              </View>
              <Switch
                value={smsGateway.status.active}
                onValueChange={(v) => { if (v) handleStartGateway(); else handleStopGateway(); }}
                trackColor={{ false: colors.surfaceAlt, true: colors.success }}
                thumbColor="#FFFFFF"
              />
            </View>

            {smsGateway.status.active && (
              <>
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.gatewayStatsRow}>
                  <View style={styles.gatewayStat}>
                    <Text style={[styles.gatewayStatNum, { color: colors.warning }]}>{smsGateway.status.pendingCount}</Text>
                    <Text style={[styles.gatewayStatLabel, { color: colors.textMuted }]}>في الانتظار</Text>
                  </View>
                  <View style={styles.gatewayStat}>
                    <Text style={[styles.gatewayStatNum, { color: colors.success }]}>{smsGateway.status.sentCount}</Text>
                    <Text style={[styles.gatewayStatLabel, { color: colors.textMuted }]}>تم الإرسال</Text>
                  </View>
                  <View style={styles.gatewayStat}>
                    <Text style={[styles.gatewayStatNum, { color: colors.danger }]}>{smsGateway.status.failedCount}</Text>
                    <Text style={[styles.gatewayStatLabel, { color: colors.textMuted }]}>فشل</Text>
                  </View>
                </View>
                {smsGateway.status.sending && (
                  <View style={[styles.gatewaySendingBox, { backgroundColor: colors.info + '10' }]}>
                    <RefreshCw size={14} color={colors.info} strokeWidth={2} />
                    <Text style={[styles.gatewaySendingText, { color: colors.info }]}>جاري إرسال الرسائل...</Text>
                  </View>
                )}
                {smsGateway.status.failedCount > 0 && (
                  <TouchableOpacity onPress={() => smsGateway.retryFailed()} style={[styles.retryBtn, { backgroundColor: colors.warning + '15' }]} activeOpacity={0.7}>
                    <RefreshCw size={16} color={colors.warning} strokeWidth={2} />
                    <Text style={[styles.retryBtnText, { color: colors.warning }]}>إعادة إرسال الفاشلة</Text>
                  </TouchableOpacity>
                )}
                {smsGateway.status.pendingCount > 0 && (
                  <TouchableOpacity onPress={() => smsGateway.retryAllPending()} style={[styles.retryBtn, { backgroundColor: colors.info + '15' }]} activeOpacity={0.7}>
                    <RefreshCw size={16} color={colors.info} strokeWidth={2} />
                    <Text style={[styles.retryBtnText, { color: colors.info }]}>إعادة إرسال العالقة ({smsGateway.status.pendingCount})</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {gatewayError && (
              <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginTop: 8 }]}>
                <AlertCircle size={16} color={colors.danger} strokeWidth={2} />
                <Text style={[styles.errorText, { color: colors.danger, flex: 1 }]}>{gatewayError}</Text>
              </View>
            )}

            {Platform.OS === 'android' && smsPermissionGranted === false && (
              <TouchableOpacity onPress={requestSmsPermission} style={[styles.retryBtn, { backgroundColor: colors.danger + '15', marginTop: 8 }]} activeOpacity={0.7}>
                <AlertCircle size={16} color={colors.danger} strokeWidth={2} />
                <Text style={[styles.retryBtnText, { color: colors.danger }]}>منح إذن إرسال SMS</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* SMS Inbox */}
      {settings.businessMode === 'telecom' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>صندوق الرسائل المدمج</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <ToggleRow icon={<Inbox size={20} color={colors.primary} strokeWidth={2} />} label="صندوق الرسائل المدمج" hint="استقبال وفرز الرسائل داخل البرنامج بدلاً من برنامج الرسائل الخارجي" value={settings.enableSmsInbox} onValueChange={handleSmsInboxToggle} colors={colors} />
            {settings.enableSmsInbox && (
              <>
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <View style={[styles.settingIcon, { backgroundColor: colors.info + '20' }]}>
                      <MessageSquare size={20} color={colors.info} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingLabel, { color: colors.text }]}>الفرز التلقائي للرسائل</Text>
                      <Text style={[styles.settingHint, { color: colors.textMuted }]}>الرسائل تصنّف تلقائياً: عمليات، شرائح، عامة</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: settings.enableSmsMonitoring ? colors.success + '20' : colors.warning + '20' }]}>
                    <Text style={[styles.statusText, { color: settings.enableSmsMonitoring ? colors.success : colors.warning }]}>{settings.enableSmsMonitoring ? 'نشط' : 'متوقف'}</Text>
                  </View>
                </View>
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <ActionRow icon={<Smartphone size={20} color={colors.accent} strokeWidth={2} />} label="اختصار الرسائل للشاشة الرئيسية" hint="إنشاء اختصار يفتح شاشة الرسائل داخل سحاب مباشرة" onPress={handleCreateShortcut} colors={colors} />
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <ActionRow
                  icon={<MessageSquare size={20} color={defaultSmsStatus === 'default' ? colors.success : colors.warning} strokeWidth={2} />}
                  label="تعيين كبرنامج الرسائل الافتراضي"
                  hint={
                    defaultSmsStatus === 'default' ? 'التطبيق هو البرنامج الافتراضي للرسائل - يمكنه قراءة وحذف وإدارة كل الرسائل'
                    : defaultSmsStatus === 'not_default' ? 'اضغط لجعل التطبيق البرنامج الافتراضي للرسائل (قراءة، استلام، رد، حذف)'
                    : defaultSmsStatus === 'unsupported' ? 'يتطلب هاتف أندرويد'
                    : 'جاري التحقق...'
                  }
                  onPress={handleRequestDefaultSms}
                  colors={colors}
                />
              </>
            )}
          </View>
        </View>
      )}

      {/* Advanced Features */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>المميزات المتقدمة</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ToggleRow icon={<Star size={20} color={colors.accent} strokeWidth={2} />} label="نظام نقاط الولاء" hint="كسب نقاط مع كل عملية بيع" value={settings.enableLoyalty} onValueChange={(v) => updateSettings({ enableLoyalty: v })} colors={colors} />
          {settings.enableLoyalty && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <FormField label="نسبة النقاط لكل وحدة عملة" colors={colors}>
                <TextInput
                  value={settings.loyaltyRate.toString()}
                  onChangeText={(v) => updateSettings({ loyaltyRate: parseFloat(v) || 0 })}
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                />
              </FormField>
            </>
          )}
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Mic size={20} color={colors.info} strokeWidth={2} />} label="البحث الصوتي" hint="البحث عن المنتجات بالصوت" value={settings.enableVoiceSearch} onValueChange={(v) => updateSettings({ enableVoiceSearch: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Zap size={20} color={colors.warning} strokeWidth={2} />} label="التنبؤ بنفاد المخزون" hint="تنبيه ذكي قبل نفاد المنتجات" value={settings.enableStockPrediction} onValueChange={(v) => updateSettings({ enableStockPrediction: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Zap size={20} color={colors.primary} strokeWidth={2} />} label="الوضع السريع للذروة" hint="بيع نقدي سريع بضغطة واحدة أثناء الازدحام" value={settings.enablePeakMode} onValueChange={(v) => updateSettings({ enablePeakMode: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Pause size={20} color={colors.info} strokeWidth={2} />} label="تعليق الفواتير" hint="حفظ الفاتورة الحالية كمسودة ومراجعتها لاحقاً" value={settings.enableDraftBills} onValueChange={(v) => updateSettings({ enableDraftBills: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<QrCode size={20} color={colors.text} strokeWidth={2} />} label="إيصال QR" hint="مشاركة الفاتورة رقمياً عبر رمز QR" value={settings.enableQrReceipt} onValueChange={(v) => updateSettings({ enableQrReceipt: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Clock size={20} color={colors.danger} strokeWidth={2} />} label="القفل التلقائي للخمول" hint="قفل الشاشة تلقائياً عند عدم الاستخدام" value={settings.enableAutoLock} onValueChange={(v) => updateSettings({ enableAutoLock: v })} colors={colors} />
          {settings.enableAutoLock && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <FormField label="مدة الخمول (دقائق)" colors={colors}>
                <TextInput
                  value={settings.autoLockMinutes.toString()}
                  onChangeText={(v) => updateSettings({ autoLockMinutes: parseInt(v) || 3 })}
                  placeholder="3"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                />
              </FormField>
            </>
          )}
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Camera size={20} color={colors.info} strokeWidth={2} />} label="التقاط لقطات الشاشة" hint="مراقبة لقطات الشاشة لاستخراج أرقام الشرائح والتحويلات تلقائياً" value={settings.enableScreenshotDetection} onValueChange={(v) => updateSettings({ enableScreenshotDetection: v })} colors={colors} />
        </View>
      </View>

      {/* Operations Features */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>مميزات التشغيل</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ToggleRow icon={<Truck size={20} color={colors.primary} strokeWidth={2} />} label="إدارة الموردين" hint="إدارة حسابات الموردين والمشتريات" value={true} onValueChange={() => {}} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Shield size={20} color={colors.success} strokeWidth={2} />} label="إدارة الورديات والخزينة" hint="فتح/إغلاق الوردية وتسجيل المصروفات" value={settings.enableShiftManagement} onValueChange={(v) => updateSettings({ enableShiftManagement: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Clock size={20} color={colors.warning} strokeWidth={2} />} label="تسجيل المصروفات" hint="تسجيل المصروفات النثرية اليومية" value={settings.enableExpenses} onValueChange={(v) => updateSettings({ enableExpenses: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Download size={20} color={colors.info} strokeWidth={2} />} label="دعم العملات المتعددة" hint="تحديد عملة لكل معاملة مع سعر صرف" value={settings.enableMultiCurrency} onValueChange={(v) => updateSettings({ enableMultiCurrency: v })} colors={colors} />
        </View>
      </View>

      {/* Round 5 Features */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>مميزات إضافية</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ToggleRow icon={<Shield size={20} color={colors.success} strokeWidth={2} />} label="إدارة الموظفين" hint="دخول بالرمز السري وصلاحيات مختلفة" value={settings.enableStaffManagement} onValueChange={(v) => updateSettings({ enableStaffManagement: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Bell size={20} color={colors.warning} strokeWidth={2} />} label="تنبيهات ذكية" hint="تنبيه بالديون والمنتجات منتهية الصلاحية" value={settings.enableSmartAlerts} onValueChange={(v) => updateSettings({ enableSmartAlerts: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<ClipboardCheck size={20} color={colors.primary} strokeWidth={2} />} label="الجرد السريع" hint="جرد المخزون ومقارنة الكميات" value={settings.enableStocktake} onValueChange={(v) => updateSettings({ enableStocktake: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Tag size={20} color={colors.accent} strokeWidth={2} />} label="محرك العروض" hint="عروض ترويجية تطبق تلقائياً في نقطة البيع" value={settings.enablePromotions} onValueChange={(v) => updateSettings({ enablePromotions: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Paperclip size={20} color={colors.info} strokeWidth={2} />} label="المرفقات والتوقيع" hint="إرفاق صور وتوقيعات على الفواتير" value={settings.enableAttachments} onValueChange={(v) => updateSettings({ enableAttachments: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<KeyRound size={20} color={colors.success} strokeWidth={2} />} label="نظام الترخيص والاشتراكات" hint="فترة تجريبية، أكواد تفعيل، حماية ضد التلاعب" value={settings.enableLicenseSystem} onValueChange={(v) => updateSettings({ enableLicenseSystem: v })} colors={colors} />
          {settings.enableLicenseSystem && (
            <>
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <FormField label="مدة الفترة التجريبية (أيام)" colors={colors}>
                <TextInput
                  value={settings.trialDays.toString()}
                  onChangeText={(v) => updateSettings({ trialDays: parseInt(v) || 7 })}
                  placeholder="7"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                />
              </FormField>
            </>
          )}
        </View>
      </View>

      {/* Expiry Alerts (telecom) */}
      {settings.businessMode === 'telecom' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>تنبيهات انتهاء الاشتراكات</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <ToggleRow icon={<Bell size={20} color={colors.warning} strokeWidth={2} />} label="تنبيهات الانتهاء" hint="تنبيه قبل انتهاء اشتراك العميل" value={settings.enableExpiryAlerts} onValueChange={(v) => updateSettings({ enableExpiryAlerts: v })} colors={colors} />
            {settings.enableExpiryAlerts && (
              <>
                <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                <FormField label="عدد أيام التنبيه المسبق" colors={colors}>
                  <TextInput
                    value={settings.expiryAlertDays.toString()}
                    onChangeText={(v) => updateSettings({ expiryAlertDays: parseInt(v) || 1 })}
                    placeholder="2"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                  />
                </FormField>
              </>
            )}
          </View>
        </View>
      )}

      {/* Offline Status */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>حالة التطبيق</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.success + '20' }]}>
                <WifiOff size={20} color={colors.success} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>وضع عدم الاتصال</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>يعمل بدون إنترنت 100%</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.success + '20' }]}>
              <Text style={[styles.statusText, { color: colors.success }]}>نشط</Text>
            </View>
          </View>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
                <Shield size={20} color={colors.primary} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>تخزين محلي مشفّر</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>البيانات محفوظة بأمان على الجهاز</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.statusText, { color: colors.primary }]}>مفعّل</Text>
            </View>
          </View>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.info + '20' }]}>
                <Printer size={20} color={colors.info} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>طباعة بلوتوث حرارية</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>طباعة الإيصالات عبر طابعات 58mm/80mm</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors.textMuted + '20' }]}>
              <Text style={[styles.statusText, { color: colors.textMuted }]}>جاهز</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Backup & Restore */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>النسخ الاحتياطي</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ActionRow icon={<Cloud size={20} color={colors.info} strokeWidth={2} />} label="إنشاء نسخة احتياطية" hint="حفظ نسخة من جميع البيانات" onPress={handleBackup} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ToggleRow icon={<Clock size={20} color={colors.primary} strokeWidth={2} />} label="النسخ الاحتياطي التلقائي" hint="إنشاء نسخة محلية كل ساعة تلقائياً" value={settings.enableAutoBackup} onValueChange={(v) => updateSettings({ enableAutoBackup: v })} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ActionRow icon={<Download size={20} color={colors.primary} strokeWidth={2} />} label="تصدير نسخة كملف" hint="حفظ نسخة كملف ومشاركتها عبر Gmail أو واتساب" onPress={handleExportFile} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ActionRow icon={<CloudDownload size={20} color={colors.success} strokeWidth={2} />} label="استعادة النسخة المحلية" hint={backupExists ? 'نسخة محلية متوفرة' : 'لا توجد نسخة محلية'} onPress={handleRestore} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ActionRow icon={<Cloud size={20} color={colors.primary} strokeWidth={2} />} label="النسخ السحابية" hint="عرض واستعادة النسخ المحفوظة في السحابة" onPress={() => setShowCloudBackup(true)} colors={colors} />
        </View>
        {backupMsg ? (
          <View style={[styles.toast2, { backgroundColor: colors.success + '15' }]}>
            <Check size={16} color={colors.success} strokeWidth={2} />
            <Text style={[styles.toastText, { color: colors.success }]}>{backupMsg}</Text>
          </View>
        ) : null}
      </View>

      {/* Data Management */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>إدارة البيانات</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ActionRow icon={<Download size={20} color={colors.info} strokeWidth={2} />} label="تحميل بيانات تجريبية" hint="إضافة منتجات وزبائن نموذجيين للتجربة" onPress={async () => { await seedDemoData(); }} colors={colors} />
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <ActionRow icon={<Trash2 size={20} color={colors.danger} strokeWidth={2} />} label="حذف جميع البيانات" hint="إعادة ضبط التطبيق وحذف كل المعاملات" onPress={() => setShowResetConfirm(true)} danger colors={colors} />
        </View>
      </View>

      {/* Audit Log */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>سجل التدقيق</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ActionRow
            icon={<ScrollText size={20} color={colors.primary} strokeWidth={2} />}
            label="سجل النشاطات"
            hint={`${auditLog.length} عملية مسجلة`}
            onPress={() => setShowAuditLog(true)}
            colors={colors}
          />
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>حول التطبيق</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.aboutRow}>
            <Info size={20} color={colors.textMuted} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>سحاب POS</Text>
              <Text style={[styles.settingHint, { color: colors.textMuted }]}>الإصدار 2.0.0 - نظام متكامل لإدارة المبيعات</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Business Mode Modal */}
      <BaseModal visible={showBusinessMode} onClose={() => setShowBusinessMode(false)} title="اختر نوع النشاط">
        <BusinessModeOption icon={<ShoppingBag size={28} color={settings.businessMode === 'retail' ? '#FFFFFF' : colors.primary} strokeWidth={2} />} title="تجاري / بقالة / سوبرماركت" desc="مسح باركود سريع، إدارة مخزون بالوحدات، حساب الأرباح اليومية" selected={settings.businessMode === 'retail'} onSelect={() => { updateSettings({ businessMode: 'retail' }); setShowBusinessMode(false); }} colors={colors} />
        <View style={{ height: 12 }} />
        <BusinessModeOption icon={<Smartphone size={28} color={settings.businessMode === 'telecom' ? '#FFFFFF' : colors.primary} strokeWidth={2} />} title="وكالة اتصالات وتجديد اشتراكات" desc="تجديد اشتراك تفاعلي، تتبع انتهاء الاشتراكات، إرسال SMS تلقائي" selected={settings.businessMode === 'telecom'} onSelect={() => { updateSettings({ businessMode: 'telecom' }); setShowBusinessMode(false); }} colors={colors} />
      </BaseModal>

      {/* PIN Modal */}
      <PinSetupModal
        visible={showPinModal}
        colors={colors}
        onClose={() => setShowPinModal(false)}
        onSave={(pin) => {
          updateSettings({ pinEnabled: true, ownerPin: pin });
          setShowPinModal(false);
          showToast('تم تعيين الرمز السري بنجاح');
        }}
      />

      {/* SMS Template Modal */}
      <SmsTemplateModal
        visible={showSmsModal}
        colors={colors}
        currentTemplate={settings.smsTemplate}
        onClose={() => setShowSmsModal(false)}
        onSave={(template) => {
          updateSettings({ smsTemplate: template });
          setShowSmsModal(false);
          showToast('تم حفظ قالب الرسالة');
        }}
      />

      <AutoReplyTemplatesModal
        visible={showAutoReplyModal}
        colors={colors}
        current={autoReplyDraft}
        onClose={() => setShowAutoReplyModal(false)}
        onSave={(t) => {
          updateSettings({ autoReplyTemplates: t });
          setShowAutoReplyModal(false);
          showToast('تم حفظ قوالب الردود التلقائية');
        }}
      />

      {/* Reset Confirm */}
      <ConfirmDialog
        visible={showResetConfirm}
        title="حذف جميع البيانات"
        message="سيتم حذف جميع المنتجات والزبائن والمعاملات نهائياً. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف الكل"
        kind="danger"
        onConfirm={async () => { await resetAllData(); setShowResetConfirm(false); }}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Audit Log Screen */}
      <AuditLogScreen
        visible={showAuditLog}
        onClose={() => setShowAuditLog(false)}
        entries={auditLog}
        onClear={() => { clearAuditLog(); showToast('تم مسح السجل'); }}
      />

      {/* Telecom Companies Management Modal */}
      <BaseModal
        visible={showTelecomCompanies}
        onClose={() => setShowTelecomCompanies(false)}
        title="شركات الاتصالات"
        footer={
          <TouchableOpacity
            onPress={() => { setEditCompany(null); setCompanyName(''); setCompanyColor('#E63946'); setShowCompanyForm(true); }}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>إضافة شركة جديدة</Text>
          </TouchableOpacity>
        }
      >
        <View style={{ gap: 10 }}>
          {telecomCompanies.length === 0 ? (
            <Text style={[styles.noResults, { color: colors.textMuted }]}>لا توجد شركات بعد</Text>
          ) : (
            telecomCompanies.map((c, i) => (
              <View
                key={c.id}
                style={[styles.telecomCompanyRow, { backgroundColor: colors.surfaceAlt, borderBottomWidth: i < telecomCompanies.length - 1 ? 1 : 0, borderBottomColor: colors.border }]}
              >
                <View style={[styles.companyColorDot, { backgroundColor: c.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.telecomCompanyName, { color: colors.text }]}>{c.name}</Text>
                  {c.supportPhone ? (
                    <Text style={[styles.settingHint, { color: colors.textMuted, marginTop: 2 }]}>دعم فني: {c.supportPhone}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => { setEditCompany(c); setCompanyName(c.name); setCompanyColor(c.color); setCompanySupportPhone(c.supportPhone || ''); setShowCompanyForm(true); }}
                  style={[styles.iconBtnSmall, { backgroundColor: colors.surface }]}
                >
                  <Pencil size={15} color={colors.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteCompany(c)}
                  style={[styles.iconBtnSmall, { backgroundColor: colors.danger + '15' }]}
                >
                  <Trash2 size={15} color={colors.danger} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </BaseModal>

      {/* Company Form Modal */}
      <BaseModal
        visible={showCompanyForm}
        onClose={() => { setShowCompanyForm(false); setEditCompany(null); }}
        title={editCompany ? 'تعديل شركة' : 'إضافة شركة اتصال'}
        footer={
          <TouchableOpacity
            onPress={() => {
              if (!companyName.trim()) return;
              if (editCompany) {
                updateTelecomCompany(editCompany.id, { name: companyName.trim(), color: companyColor, supportPhone: companySupportPhone.trim() });
              } else {
                addTelecomCompany({ name: companyName.trim(), color: companyColor, supportPhone: companySupportPhone.trim(), active: true });
              }
              setShowCompanyForm(false);
              setEditCompany(null);
              setCompanyName('');
              setCompanyColor('#E63946');
              setCompanySupportPhone('');
            }}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Check size={18} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.saveBtnText}>حفظ</Text>
          </TouchableOpacity>
        }
      >
        <FormField label="اسم الشركة" colors={colors}>
          <TextInput
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="مثال: سيلكوم"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </FormField>
        <FormField label="رقم الدعم الفني (واتس أب)" colors={colors} style={{ marginTop: 12 }}>
          <TextInput
            value={companySupportPhone}
            onChangeText={setCompanySupportPhone}
            placeholder="مثال: +970599123456"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </FormField>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8, marginTop: 12 }]}>اللون</Text>
        <View style={styles.colorPickerRow}>
          {['#E63946', '#457B9D', '#2A9D8F', '#F4A261', '#E76F51', '#264653', '#6A4C93', '#1D7874', '#D62828', '#3D5A80'].map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setCompanyColor(c)}
              style={[styles.colorPickerDot, { backgroundColor: c, borderWidth: companyColor === c ? 3 : 0, borderColor: colors.text }]}
            />
          ))}
        </View>
      </BaseModal>

      {/* Delete Company Confirm */}
      <ConfirmDialog
        visible={deleteCompany !== null}
        title="حذف الشركة"
        message={`هل تريد حذف "${deleteCompany?.name}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteCompany) deleteTelecomCompany(deleteCompany.id); setDeleteCompany(null); }}
        onCancel={() => setDeleteCompany(null)}
      />

      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>الحساب</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
                <UserCog size={20} color={colors.primary} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{profile?.store_name || 'مستخدم'}</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>{profile?.phone}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            onPress={signOut}
            activeOpacity={0.7}
            style={styles.settingRow}
          >
            <View style={styles.settingInfo}>
              <View style={[styles.settingIcon, { backgroundColor: colors.danger + '15' }]}>
                <LogOut size={20} color={colors.danger} strokeWidth={2} />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.danger }]}>تسجيل الخروج</Text>
                <Text style={[styles.settingHint, { color: colors.textMuted }]}>الخروج من الحساب والعودة لشاشة الدخول</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sky Integration Modal */}
      <SkyIntegrationModal visible={showSkyModal} onClose={() => setShowSkyModal(false)} />

      {/* Layan Integration Modal */}
      <LayanIntegrationModal visible={showLayanModal} onClose={() => setShowLayanModal(false)} />

      {/* Areen Integration Modal */}
      <AreenIntegrationModal visible={showAreenModal} onClose={() => setShowAreenModal(false)} />

      {/* Cloud Backup Screen */}
      <CloudBackupScreen visible={showCloudBackup} onClose={() => setShowCloudBackup(false)} />

      {/* Toast */}
      {backupMsg ? (
        <View style={[styles.globalToast, { backgroundColor: colors.success }]}>
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.globalToastText}>{backupMsg}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function FormField({ label, children, colors, style }: { label: string; children: React.ReactNode; colors: Colors; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ icon, label, hint, value, onValueChange, colors }: {
  icon: React.ReactNode; label: string; hint: string; value: boolean; onValueChange: (v: boolean) => void; colors: Colors;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceAlt }]}>{icon}</View>
        <View>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.settingHint, { color: colors.textMuted }]}>{hint}</Text>
        </View>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.surfaceAlt, true: colors.primary }} thumbColor="#FFFFFF" />
    </View>
  );
}

function ActionRow({ icon, label, hint, onPress, danger, colors }: {
  icon: React.ReactNode; label: string; hint: string; onPress: () => void; danger?: boolean; colors: Colors;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <View style={[styles.settingIcon, { backgroundColor: danger ? colors.danger + '15' : colors.surfaceAlt }]}>{icon}</View>
        <View>
          <Text style={[styles.settingLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
          <Text style={[styles.settingHint, { color: colors.textMuted }]}>{hint}</Text>
        </View>
      </View>
      <ChevronLeft size={20} color={colors.textMuted} strokeWidth={2} />
    </TouchableOpacity>
  );
}

function BusinessModeOption({ icon, title, desc, selected, onSelect, colors }: {
  icon: React.ReactNode; title: string; desc: string; selected: boolean; onSelect: () => void; colors: Colors;
}) {
  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.7} style={[styles.bizModeOption, { backgroundColor: selected ? colors.primary : colors.surfaceAlt, borderColor: selected ? colors.primary : 'transparent' }]}>
      <View style={[styles.bizModeIcon, { backgroundColor: selected ? 'rgba(255,255,255,0.2)' : colors.primary + '20' }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bizModeTitle, { color: selected ? '#FFFFFF' : colors.text }]}>{title}</Text>
        <Text style={[styles.bizModeDesc, { color: selected ? 'rgba(255,255,255,0.8)' : colors.textMuted }]}>{desc}</Text>
      </View>
      {selected && <Check size={22} color="#FFFFFF" strokeWidth={2.5} />}
    </TouchableOpacity>
  );
}

function PinSetupModal({ visible, colors, onClose, onSave }: {
  visible: boolean; colors: Colors; onClose: () => void; onSave: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setPin(''); setConfirm(''); setError(''); }
  }, [visible]);

  const handleSave = () => {
    if (pin.length < 4) { setError('الرمز يجب أن يكون 4 أرقام على الأقل'); return; }
    if (pin !== confirm) { setError('الرمزان غير متطابقين'); return; }
    onSave(pin);
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title="تعيين الرمز السري" footer={
      <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
        <Lock size={18} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.saveBtnText}>تعيين الرمز</Text>
      </TouchableOpacity>
    }>
      <View style={[styles.pinInfoBox, { backgroundColor: colors.primary + '10' }]}>
        <Shield size={20} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.pinInfoText, { color: colors.primary }]}>
          سيُطلب هذا الرمز عند فتح التطبيق. احتفظ به في مكان آمن.
        </Text>
      </View>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="الرمز السري" colors={colors}>
        <TextInput value={pin} onChangeText={setPin} placeholder="••••" placeholderTextColor={colors.textMuted} keyboardType="numeric" secureTextEntry style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, textAlign: 'center', fontSize: 24, letterSpacing: 8 }]} />
      </FormField>
      <FormField label="تأكيد الرمز" colors={colors}>
        <TextInput value={confirm} onChangeText={setConfirm} placeholder="••••" placeholderTextColor={colors.textMuted} keyboardType="numeric" secureTextEntry style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, textAlign: 'center', fontSize: 24, letterSpacing: 8 }]} />
      </FormField>
    </BaseModal>
  );
}

function SmsTemplateModal({ visible, colors, currentTemplate, onClose, onSave }: {
  visible: boolean; colors: Colors; currentTemplate: string; onClose: () => void; onSave: (template: string) => void;
}) {
  const [template, setTemplate] = useState(currentTemplate);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setTemplate(currentTemplate); setError(''); }
  }, [visible, currentTemplate]);

  const handleSave = () => {
    if (!template.trim()) { setError('القالب لا يمكن أن يكون فارغاً'); return; }
    onSave(template.trim());
  };

  const handleReset = () => setTemplate(DEFAULT_SMS_TEMPLATE);

  return (
    <BaseModal visible={visible} onClose={onClose} title="قالب رسالة SMS" footer={
      <View style={styles.smsModalFooter}>
        <TouchableOpacity onPress={handleReset} style={[styles.resetTemplateBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
          <Text style={[styles.resetTemplateText, { color: colors.textSecondary }]}>استعادة الافتراضي</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1 }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>حفظ القالب</Text>
        </TouchableOpacity>
      </View>
    }>
      <View style={[styles.varHintBox, { backgroundColor: colors.info + '10' }]}>
        <Text style={[styles.varHintTitle, { color: colors.info }]}>المتغيرات المتاحة:</Text>
        <Text style={[styles.varHintText, { color: colors.textSecondary }]}>{'{name}'} - اسم العميل</Text>
        <Text style={[styles.varHintText, { color: colors.textSecondary }]}>{'{sub}'} - رقم الاشتراك</Text>
        <Text style={[styles.varHintText, { color: colors.textSecondary }]}>{'{amount}'} - المبلغ</Text>
        <Text style={[styles.varHintText, { color: colors.textSecondary }]}>{'{debt}'} - الدين المتبقي</Text>
      </View>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <FormField label="نص الرسالة" colors={colors}>
        <TextInput value={template} onChangeText={setTemplate} placeholder="أدخل نص الرسالة..." placeholderTextColor={colors.textMuted} multiline style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 120 }]} />
      </FormField>
    </BaseModal>
  );
}

const AUTO_REPLY_FIELDS: { key: keyof AutoReplyTemplates; label: string; hint: string }[] = [
  { key: 'greeting', label: 'رسالة الترحيب الأولى', hint: 'أول رسالة تُرسل تلقائياً لأي زبون جديد أو غير مسجل عند مراسلته للمرة الأولى. تشرح الخيارات المتاحة (شحن، eSIM، تحويل)' },
  { key: 'welcome', label: 'رسالة الترحيب لزبون معروف', hint: 'عند وصول رسالة من زبون معروف وبقي في شحنته 5 أيام أو أكثر. المتغيرات: {name} {days}' },
  { key: 'rechargeRequestReceived', label: 'استلام طلب تجديد', hint: 'عند وصول طلب شحن/تجديد من زبون. المتغيرات: {sim}' },
  { key: 'supportAcknowledgement', label: 'تأكيد تحويل الدعم', hint: 'رسالة فورية للزبون عند تحويل الطلب للدعم الفني' },
  { key: 'supportForwardMessage', label: 'رسالة الدعم الفني', hint: 'الرسالة المرسلة للدعم الفني عبر واتس أب. المتغيرات: {sim}' },
  { key: 'rechargeConfirmed', label: 'تأكيد الشحن', hint: 'بعد شحن الرقم من الدعم الفني. المتغيرات: {sim}' },
  { key: 'urgencyDetected', label: 'كشف الاستعجال', hint: 'عند إرسال الزبون رسالة استعجال قبل انتهاء المهلة' },
  { key: 'offHoursMessage', label: 'رسالة خارج وقت الدوام', hint: 'عند وصول طلب خارج وقت دوام الوكيل. تبلغ الزبون أن الطلب سيُنفذ غداً' },
  { key: 'transferNumbersMessage', label: 'رسالة أرقام التحويل', hint: 'أرقام الحسابات البنكية للتحويل. تُرسل تلقائياً عند طلب الزبون رقم التحويل، وكرسالة ثانية بعد الشحن غير المدفوع' },
  { key: 'transferRequestReply', label: 'رسالة طلب بيانات التحويل', hint: 'تُرسل تلقائياً عند إخبار الزبون بأنه حوّل، لطلب اسم المرسل والمبلغ. المتغيرات: لا توجد' },
  { key: 'esimAskPhoneModel', label: 'eSIM - طلب نوع الجوال', hint: 'تُرسل تلقائياً عند طلب الزبون شريحة eSIM بدون ذكر نوع الجوال. تطلب من الزبون إرسال الموديل' },
  { key: 'esimNotSupported', label: 'eSIM - جوال غير مدعوم', hint: 'تُرسل تلقائياً عند اكتشاف أن جوال الزبون لا يدعم eSIM. تقترح شريحة بلاستيك بديلة' },
  { key: 'esimSupportedAskCompany', label: 'eSIM - جوال مدعوم + اختيار الشركة', hint: 'تُرسل تلقائياً عند تأكيد دعم الجوال لـ eSIM. تطلب من الزبون اختيار الشركة المطلوبة' },
  { key: 'esimCompanyList', label: 'eSIM - قائمة الشركات', hint: 'تُرسل تلقائياً عند عدم التعرف على اسم الشركة في رد الزبون. تعرض قائمة الشركات المتوفرة' },
  { key: 'esimAskDuration', label: 'eSIM - طلب مدة الشحن', hint: 'تُرسل تلقائياً عند اختيار شركة بدون باقات مُعدة، أو عند عدم تحديد المدة. تطلب من الزبون تحديد مدة الباقة' },
  { key: 'esimTransferToStaff', label: 'eSIM - تحويل للموظف', hint: 'تُرسل تلقائياً عند طلب الزبون استشارة/نصيحة أثناء محادثة eSIM. تخبره بالتحويل للموظف' },
  { key: 'rechargeAccepted', label: 'تأكيد استلام طلب الشحن بالمدة', hint: 'تُرسل تلقائياً عند تحديد الزبون لمدة الشحن (شهر، شهرين، إلخ) أو اختيار باقة من القائمة' },
  { key: 'specifyDuration', label: 'طلب تحديد مدة الشحن', hint: 'تُرسل تلقائياً عند طلب شحن لشركة تتطلب تحديد المدة ولم يحددها الزبون. تطلب تحديد المدة (شهر، شهرين، إلخ)' },
];

function AutoReplyTemplatesModal({ visible, colors, current, onClose, onSave }: {
  visible: boolean; colors: Colors; current: AutoReplyTemplates; onClose: () => void; onSave: (t: AutoReplyTemplates) => void;
}) {
  const [draft, setDraft] = useState<AutoReplyTemplates>(current);

  useEffect(() => {
    if (visible) setDraft(current);
  }, [visible, current]);

  const handleReset = () => setDraft(DEFAULT_AUTO_REPLY_TEMPLATES);

  return (
    <BaseModal visible={visible} onClose={onClose} title="قالب الردود التلقائية" footer={
      <View style={styles.smsModalFooter}>
        <TouchableOpacity onPress={handleReset} style={[styles.resetTemplateBtn, { backgroundColor: colors.surfaceAlt }]} activeOpacity={0.7}>
          <Text style={[styles.resetTemplateText, { color: colors.textSecondary }]}>استعادة الافتراضي</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSave(draft)} style={[styles.saveBtn, { backgroundColor: colors.primary, flex: 1 }]} activeOpacity={0.8}>
          <Text style={styles.saveBtnText}>حفظ القوالب</Text>
        </TouchableOpacity>
      </View>
    }>
      <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 12 }}>
        {AUTO_REPLY_FIELDS.map((f) => (
          <View key={f.key}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>{f.label}</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, lineHeight: 16 }}>{f.hint}</Text>
            <TextInput
              value={draft[f.key]}
              onChangeText={(v) => setDraft((prev) => ({ ...prev, [f.key]: v }))}
              placeholder="أدخل نص الرسالة..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.textArea, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]}
            />
          </View>
        ))}
      </ScrollView>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  settingInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  settingHint: { fontSize: 12, marginTop: 2 },
  rowDivider: { height: 1, marginVertical: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  formRow: { flexDirection: 'row', gap: 10 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  textArea: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, textAlignVertical: 'top' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  logoUploadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoPreview: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderColor: '#E2E4ED' },
  logoPlaceholder: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  logoUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  logoUploadBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  logoRemoveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  logoRemoveBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  logoHint: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  toast: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 10, borderRadius: 12 },
  toast2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, paddingVertical: 10, borderRadius: 12 },
  toastText: { fontSize: 13, fontWeight: '700' },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bizModeOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 2 },
  bizModeIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bizModeTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  bizModeDesc: { fontSize: 13, lineHeight: 18 },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  pinInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  pinInfoText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20 },
  varHintBox: { borderRadius: 12, padding: 14, marginBottom: 16, gap: 4 },
  varHintTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  varHintText: { fontSize: 13 },
  smsModalFooter: { flexDirection: 'row', gap: 10 },
  resetTemplateBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', paddingHorizontal: 16 },
  resetTemplateText: { fontSize: 14, fontWeight: '700' },
  globalToast: { position: 'absolute', bottom: 20, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  globalToastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  noResults: { textAlign: 'center', paddingVertical: 20, fontSize: 14 },
  gatewayStatsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
  gatewayStat: { alignItems: 'center' },
  gatewayStatNum: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  gatewayStatLabel: { fontSize: 11, marginTop: 2 },
  gatewaySendingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
  gatewaySendingText: { fontSize: 12, fontWeight: '600' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12, marginTop: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '700' },
  telecomCompanyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  companyColorDot: { width: 24, height: 24, borderRadius: 12 },
  telecomCompanyName: { fontSize: 14, fontWeight: '600' },
  iconBtnSmall: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorPickerDot: { width: 36, height: 36, borderRadius: 18 },
});
