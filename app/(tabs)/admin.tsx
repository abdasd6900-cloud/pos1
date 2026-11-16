import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { Users, Phone, Store, Shield, Crown, Key, Plus, Search, Trash2, Power, AlertCircle, Check, Clock, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth, type UserProfile, type SubscriptionStatus } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface ActivationKey {
  id: string;
  key_code: string;
  plan: string;
  duration_days: number;
  assigned_to: string | null;
  assigned_at: string | null;
  is_used: boolean;
  created_at: string;
  notes: string;
}

type Tab = 'accounts' | 'keys';

export default function AdminScreen() {
  const { profile, signOut } = useAuth();
  const { colors } = useTheme();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [keys, setKeys] = useState<ActivationKey[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UserProfile | null>(null);
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<ActivationKey | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [accRes, keyRes] = await Promise.all([
        supabase.from('profiles').select('id, phone, store_name, owner_name, role, activation_key, subscription_status, subscription_plan, subscription_expires_at, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('activation_keys').select('id, key_code, plan, duration_days, assigned_to, assigned_at, is_used, created_at, notes').order('created_at', { ascending: false }),
      ]);
      if (accRes.data) setAccounts(accRes.data as UserProfile[]);
      if (keyRes.data) setKeys(keyRes.data as ActivationKey[]);
    } catch {
      setError('تعذر تحميل البيانات');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) void fetchData(); else setLoading(false); }, [fetchData, isAdmin]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const filteredAccounts = accounts.filter((a) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return a.phone.includes(q) || a.store_name.toLowerCase().includes(q) || a.owner_name.toLowerCase().includes(q);
  });

  const filteredKeys = keys.filter((k) => {
    if (!search.trim()) return true;
    return k.key_code.toLowerCase().includes(search.trim().toLowerCase());
  });

  const toggleAccountStatus = useCallback(async (account: UserProfile) => {
    const newStatus = !account.is_active;
    const { error } = await supabase.rpc('admin_update_profile_status', {
      p_target_id: account.id,
      p_is_active: newStatus,
    });
    if (error) {
      setError('تعذر تغيير حالة الحساب — تحقق من صلاحياتك');
      return;
    }
    setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, is_active: newStatus } : a));
  }, []);

  const setAccountRole = useCallback(async (account: UserProfile) => {
    const newRole = account.role === 'admin' ? 'user' : 'admin';
    const { error } = await supabase.rpc('admin_update_profile_role', {
      p_target_id: account.id,
      p_role: newRole,
    });
    if (error) {
      setError('تعذر تغيير الدور — يتطلب صلاحيات المدير');
      return;
    }
    setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, role: newRole as 'admin' | 'user' } : a));
  }, [setAccounts]);

  const assignKeyToAccount = useCallback(async (keyId: string, account: UserProfile) => {
    const key = keys.find((k) => k.id === keyId);
    if (!key) return;
    const { error: assignError } = await supabase.rpc('admin_assign_activation_key', {
      p_key_id: keyId,
      p_target_id: account.id,
    });
    if (assignError) {
      setError('تعذر تعيين الكود — تحقق من صلاحياتك');
      return;
    }

    const expiresAt = key.plan === 'lifetime' ? null : new Date(Date.now() + key.duration_days * 86400000).toISOString();

    setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, assigned_to: account.id, assigned_at: new Date().toISOString(), is_used: true } : k));
    setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, activation_key: key.key_code, subscription_status: 'active', subscription_plan: key.plan, subscription_expires_at: expiresAt } : a));
    setSelectedAccount(null);
  }, [keys, setAccounts]);

  const deleteKey = useCallback(async (keyId: string) => {
    await supabase.from('activation_keys').delete().eq('id', keyId);
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
    setDeleteKeyTarget(null);
  }, []);

  const getStatusColor = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return colors.success;
      case 'trial': return colors.info;
      case 'expired': return colors.warning;
      case 'locked': return colors.danger;
    }
  };

  const getStatusLabel = (status: SubscriptionStatus) => {
    switch (status) {
      case 'active': return 'فعّال';
      case 'trial': return 'تجريبي';
      case 'expired': return 'منتهي';
      case 'locked': return 'مقفل';
    }
  };

  const renderAccount = ({ item }: { item: UserProfile }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: item.role === 'admin' ? colors.accent + '25' : colors.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: item.role === 'admin' ? colors.accent : colors.primary }]}>
            {item.store_name.charAt(0) || item.owner_name.charAt(0) || '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.store_name || 'بدون اسم'}</Text>
            {item.role === 'admin' && <Crown size={14} color={colors.accent} strokeWidth={2} />}
          </View>
          <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>{item.owner_name}</Text>
          <View style={styles.phoneRow}>
            <Phone size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.phoneText, { color: colors.textMuted }]}>{item.phone}</Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.subscription_status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.subscription_status) }]}>
            {getStatusLabel(item.subscription_status)}
          </Text>
        </View>
      </View>

      {!item.is_active && (
        <View style={[styles.inactiveBanner, { backgroundColor: colors.danger + '15' }]}>
          <Power size={14} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.inactiveText, { color: colors.danger }]}>الحساب معطل</Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={() => setSelectedAccount(item)}
          style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]}
        >
          <Key size={15} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.primary }]}>تعيين كود</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAccountRole(item)}
          style={[styles.actionBtn, { backgroundColor: item.role === 'admin' ? colors.warning + '15' : colors.info + '15' }]}
        >
          {item.role === 'admin' ? <Shield size={15} color={colors.warning} strokeWidth={2} /> : <Crown size={15} color={colors.info} strokeWidth={2} />}
          <Text style={[styles.actionText, { color: item.role === 'admin' ? colors.warning : colors.info }]}>
            {item.role === 'admin' ? 'مستخدم عادي' : 'مدير'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => toggleAccountStatus(item)}
          style={[styles.actionBtn, { backgroundColor: item.is_active ? colors.danger + '15' : colors.success + '15' }]}
        >
          <Power size={15} color={item.is_active ? colors.danger : colors.success} strokeWidth={2} />
          <Text style={[styles.actionText, { color: item.is_active ? colors.danger : colors.success }]}>
            {item.is_active ? 'تعطيل' : 'تفعيل'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderKey = ({ item }: { item: ActivationKey }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.keyIcon, { backgroundColor: (item.is_used ? colors.success : colors.warning) + '20' }]}>
          <Key size={18} color={item.is_used ? colors.success : colors.warning} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.keyCode, { color: colors.text }]} numberOfLines={1}>{item.key_code}</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {item.plan === 'monthly' ? 'شهري' : item.plan === 'yearly' ? 'سنوي' : 'مدى الحياة'} • {item.duration_days} يوم
          </Text>
          {item.is_used && (
            <Text style={[styles.assignedText, { color: colors.success }]}>
              تم التعيين {item.assigned_at ? new Date(item.assigned_at).toLocaleDateString('ar') : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setDeleteKeyTarget(item)}
          style={[styles.iconActionBtn, { backgroundColor: colors.danger + '15' }]}
        >
          <Trash2 size={16} color={colors.danger} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <Shield size={48} color={colors.danger} strokeWidth={2} />
        <Text style={[styles.headerTitle, { color: colors.text, marginTop: 16, textAlign: 'center' }]}>
          الوصول مرفوض
        </Text>
        <Text style={[styles.headerSub, { color: colors.textMuted, marginTop: 8, textAlign: 'center' }]}>
          هذه الصفحة متاحة للمدير فقط. تواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerInfo}>
          <Crown size={24} color={colors.accent} strokeWidth={2} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>لوحة المدير</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>{profile?.store_name}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={signOut}
          style={[styles.logoutBtn, { backgroundColor: colors.danger + '15' }]}
        >
          <Text style={[styles.logoutText, { color: colors.danger }]}>خروج</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Users size={18} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{accounts.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>حساب</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Key size={18} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{keys.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>كود</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Check size={18} color={colors.success} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{keys.filter(k => k.is_used).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>مستخدم</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          onPress={() => setTab('accounts')}
          style={[styles.tabBtn, tab === 'accounts' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
        >
          <Users size={18} color={tab === 'accounts' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: tab === 'accounts' ? '#FFFFFF' : colors.textSecondary }]}>الحسابات</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('keys')}
          style={[styles.tabBtn, tab === 'keys' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
        >
          <Key size={18} color={tab === 'keys' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.tabText, { color: tab === 'keys' ? '#FFFFFF' : colors.textSecondary }]}>أكواد التفعيل</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {/* Search */}
      <View style={styles.searchArea}>
        <View style={[styles.searchInput, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={18} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={tab === 'accounts' ? 'ابحث برقم الجوال أو الاسم...' : 'ابحث بكود التفعيل...'}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchTextInput, { color: colors.text }]}
          />
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === 'accounts' ? (
        <FlatList
          data={filteredAccounts}
          keyExtractor={(item) => item.id}
          renderItem={renderAccount}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<Users size={32} color={colors.textMuted} strokeWidth={2} />} title="لا يوجد حسابات" subtitle="ستظهر الحسابات هنا عند تسجيل المستخدمين" />
            </View>
          }
        />
      ) : (
        <>
          <View style={styles.addActionArea}>
            <TouchableOpacity
              onPress={() => setShowKeyModal(true)}
              style={[styles.addKeyBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              <Plus size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.addKeyText}>إنشاء كود تفعيل</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={filteredKeys}
            keyExtractor={(item) => item.id}
            renderItem={renderKey}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyState icon={<Key size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد أكواد" subtitle="أنشئ أكواد تفعيل لتعيينها للمستخدمين" />
              </View>
            }
          />
        </>
      )}

      {/* Key Assignment Modal */}
      <BaseModal
        visible={selectedAccount !== null}
        onClose={() => setSelectedAccount(null)}
        title={`تعيين كود لـ ${selectedAccount?.store_name ?? ''}`}
      >
        {selectedAccount && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.modalInfo, { color: colors.textSecondary }]}>
              اختر كود تفعيل غير مستخدم من القائمة:
            </Text>
            {keys.filter((k) => !k.is_used).length === 0 ? (
              <Text style={[styles.modalInfo, { color: colors.warning }]}>لا توجد أكواد متاحة. أنشئ كوداً جديداً أولاً.</Text>
            ) : (
              keys.filter((k) => !k.is_used).map((k) => (
                <TouchableOpacity
                  key={k.id}
                  onPress={() => assignKeyToAccount(k.id, selectedAccount)}
                  style={[styles.keyOption, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                >
                  <Key size={18} color={colors.warning} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.keyCode, { color: colors.text }]}>{k.key_code}</Text>
                    <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                      {k.plan === 'monthly' ? 'شهري' : k.plan === 'yearly' ? 'سنوي' : 'مدى الحياة'} • {k.duration_days} يوم
                    </Text>
                  </View>
                  <Check size={18} color={colors.success} strokeWidth={2} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </BaseModal>

      {/* Create Key Modal */}
      <CreateKeyModal
        visible={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onCreated={() => { setShowKeyModal(false); void fetchData(); }}
        colors={colors}
      />

      {/* Delete Key Confirm */}
      <ConfirmDialog
        visible={deleteKeyTarget !== null}
        title="حذف كود التفعيل"
        message={`هل تريد حذف الكود "${deleteKeyTarget?.key_code}"؟`}
        confirmLabel="حذف"
        kind="danger"
        onConfirm={() => { if (deleteKeyTarget) deleteKey(deleteKeyTarget.id); }}
        onCancel={() => setDeleteKeyTarget(null)}
      />
    </ScrollView>
  );
}

function CreateKeyModal({ visible, onClose, onCreated, colors }: { visible: boolean; onClose: () => void; onCreated: () => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  const [plan, setPlan] = useState<'monthly' | 'yearly' | 'lifetime'>('monthly');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setCreating(true);
    setError('');

    const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedSession.session) {
      setError('انتهت جلسة المدير. أغلق النافذة وسجّل الدخول مرة أخرى.');
      setCreating(false);
      return;
    }

    const planCode = plan === 'monthly' ? 'M' : plan === 'yearly' ? 'Y' : 'L';
    const durationDays = parseInt(duration) || 30;
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const keyCode = `${planCode}${durationDays.toString().padStart(2, '0')}-${random}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const { error: insertError } = await supabase.from('activation_keys').insert({
      key_code: keyCode,
      plan,
      duration_days: durationDays,
      notes: notes.trim(),
    });

    if (insertError) {
      setError(insertError.code === '42501' || insertError.message.toLowerCase().includes('row-level security')
        ? 'لا تملك جلسة الدخول الحالية صلاحية المدير. سجّل الخروج ثم ادخل بحساب المدير.'
        : `تعذر إنشاء الكود: ${insertError.message}`);
      setCreating(false);
      return;
    }
    setCreating(false);
    setPlan('monthly');
    setDuration('30');
    setNotes('');
    onCreated();
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="إنشاء كود تفعيل"
      footer={
        <TouchableOpacity onPress={handleCreate} disabled={creating} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}>
          {creating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>إنشاء</Text>}
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginBottom: 12 }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>نوع الاشتراك</Text>
      <View style={styles.planSelector}>
        {(['monthly', 'yearly', 'lifetime'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => { setPlan(p); setDuration(p === 'monthly' ? '30' : p === 'yearly' ? '365' : '9999'); }}
            style={[styles.planBtn, plan === p ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            <Text style={[styles.planText, { color: plan === p ? '#FFFFFF' : colors.textSecondary }]}>
              {p === 'monthly' ? 'شهري' : p === 'yearly' ? 'سنوي' : 'مدى الحياة'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {plan !== 'lifetime' && (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>المدة (أيام)</Text>
          <TextInput
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>ملاحظات (اختياري)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="ملاحظات حول هذا الكود"
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
        />
      </View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  headerSub: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  logoutBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  logoutText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  statDivider: { width: 1, height: 32 },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  tabText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 8 },
  errorText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  searchArea: { paddingHorizontal: 16, paddingBottom: 12 },
  searchInput: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  searchTextInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: 'Cairo-Regular' },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyWrap: { paddingVertical: 40 },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  cardSub: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  phoneText: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  inactiveBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 8 },
  inactiveText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, flex: 1, justifyContent: 'center' },
  actionText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  iconActionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  keyIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  keyCode: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  assignedText: { fontSize: 11, marginTop: 2, fontFamily: 'Cairo-SemiBold' },
  addActionArea: { paddingHorizontal: 16, paddingBottom: 12 },
  addKeyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  addKeyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  modalInfo: { fontSize: 14, fontFamily: 'Cairo-Regular', lineHeight: 22 },
  keyOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  planSelector: { flexDirection: 'row', gap: 8 },
  planBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  planText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: 'Cairo-Regular' },
  submitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
});
