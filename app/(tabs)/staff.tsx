import { StyleSheet, View, Text, TouchableOpacity, TextInput, Switch, FlatList } from 'react-native';
import { useState, useEffect } from 'react';
import {
  UserCog, Plus, Trash2, Edit2, Lock, Shield, LogOut,
  Check, KeyRound, Eye, EyeOff, Users,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import type { Staff, StaffRole } from '@/types';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function StaffScreen() {
  const { staff, addStaff, updateStaff, deleteStaff, currentStaff, staffLogin, staffLogout, settings } = useApp();
  const { colors } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editMember, setEditMember] = useState<Staff | null>(null);
  const [showPinLogin, setShowPinLogin] = useState(false);

  if (!settings.enableStaffManagement) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الموظفين</Text>
        </View>
        <View style={styles.disabledWrap}>
          <EmptyState
            icon={<UserCog size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="الميزة معطّلة"
            subtitle="فعّل إدارة الموظفين من الإعدادات"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الموظفين</Text>
        {currentStaff ? (
          <View style={styles.loginBadge}>
            <View style={[styles.loginDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.loginName, { color: colors.text }]}>{currentStaff.name}</Text>
            <TouchableOpacity onPress={staffLogout} style={[styles.logoutBtn, { backgroundColor: colors.danger + '15' }]}>
              <LogOut size={14} color={colors.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowPinLogin(true)} style={[styles.loginBtn, { backgroundColor: colors.primary }]}>
            <Lock size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.loginBtnText}>دخول الموظف</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Users size={20} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{staff.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>إجمالي</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Shield size={20} color={colors.success} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{staff.filter((s) => s.role === 'manager').length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>مدراء</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <UserCog size={20} color={colors.info} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{staff.filter((s) => s.active).length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>نشطون</Text>
        </View>
      </View>

      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <EmptyState
            icon={<UserCog size={48} color={colors.textMuted} strokeWidth={1.5} />}
            title="لا يوجد موظفون"
            subtitle="أضف كاشير أو مدير لبدء تتبع النشاطات"
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.memberCard, { backgroundColor: colors.surface }]}>
            <View style={styles.memberHeader}>
              <View style={[styles.memberAvatar, { backgroundColor: item.role === 'manager' ? colors.success + '20' : colors.primary + '20' }]}>
                <Text style={[styles.memberAvatarText, { color: item.role === 'manager' ? colors.success : colors.primary }]}>
                  {item.name.charAt(0)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: colors.text }]}>{item.name}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: item.role === 'manager' ? colors.success + '20' : colors.info + '20' }]}>
                    <Text style={[styles.roleText, { color: item.role === 'manager' ? colors.success : colors.info }]}>
                      {item.role === 'manager' ? 'مدير' : 'كاشير'}
                    </Text>
                  </View>
                  {!item.active && (
                    <View style={[styles.roleBadge, { backgroundColor: colors.danger + '20' }]}>
                      <Text style={[styles.roleText, { color: colors.danger }]}>معطّل</Text>
                    </View>
                  )}
                </View>
                <View style={styles.permissionsRow}>
                  {item.canEditPrice && <PermIcon icon="price" colors={colors} />}
                  {item.canDiscount && <PermIcon icon="discount" colors={colors} />}
                  {item.canDelete && <PermIcon icon="delete" colors={colors} />}
                  {item.canProcessReturn && <PermIcon icon="return" colors={colors} />}
                </View>
              </View>
              <View style={styles.memberActions}>
                <TouchableOpacity
                  onPress={() => { setEditMember(item); setShowForm(true); }}
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceAlt }]}
                >
                  <Edit2 size={16} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteStaff(item.id)}
                  style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]}
                >
                  <Trash2 size={16} color={colors.danger} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      <TouchableOpacity
        onPress={() => { setEditMember(null); setShowForm(true); }}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <StaffFormModal
        visible={showForm}
        editMember={editMember}
        colors={colors}
        onClose={() => setShowForm(false)}
        onSave={(data) => {
          if (editMember) {
            updateStaff(editMember.id, data);
          } else {
            addStaff(data);
          }
          setShowForm(false);
        }}
      />

      <StaffLoginModal
        visible={showPinLogin}
        colors={colors}
        onClose={() => setShowPinLogin(false)}
        onLogin={(pin) => {
          const member = staffLogin(pin);
          if (member) {
            setShowPinLogin(false);
          }
          return member;
        }}
      />
    </View>
  );
}

function PermIcon({ icon, colors }: { icon: string; colors: Colors }) {
  const labels: Record<string, string> = {
    price: 'تعديل سعر',
    discount: 'خصم',
    delete: 'حذف',
    return: 'مرتجع',
  };
  return (
    <View style={[styles.permChip, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.permText, { color: colors.textSecondary }]}>{labels[icon]}</Text>
    </View>
  );
}

function StaffFormModal({ visible, editMember, colors, onClose, onSave }: {
  visible: boolean;
  editMember: Staff | null;
  colors: Colors;
  onClose: () => void;
  onSave: (data: Omit<Staff, 'id' | 'createdAt'>) => void;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [active, setActive] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [canEditPrice, setCanEditPrice] = useState(false);
  const [canDiscount, setCanDiscount] = useState(false);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState('10');
  const [canProcessReturn, setCanProcessReturn] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(editMember?.name ?? '');
      setPin(editMember?.pin ?? '');
      setRole(editMember?.role ?? 'cashier');
      setActive(editMember?.active ?? true);
      setCanDelete(editMember?.canDelete ?? false);
      setCanEditPrice(editMember?.canEditPrice ?? false);
      setCanDiscount(editMember?.canDiscount ?? false);
      setMaxDiscountPercent(editMember?.maxDiscountPercent.toString() ?? '10');
      setCanProcessReturn(editMember?.canProcessReturn ?? false);
      setError('');
    }
  }, [visible, editMember]);

  const handleSave = () => {
    if (!name.trim()) { setError('اسم الموظف مطلوب'); return; }
    if (pin.length < 4) { setError('الرمز يجب أن يكون 4 أرقام على الأقل'); return; }
    onSave({
      name: name.trim(),
      pin,
      role,
      active,
      canDelete,
      canEditPrice,
      canDiscount,
      maxDiscountPercent: parseFloat(maxDiscountPercent) || 0,
      canProcessReturn,
    });
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title={editMember ? 'تعديل موظف' : 'موظف جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <Check size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>حفظ</Text>
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>اسم الموظف</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="مثال: محمد أحمد"
        placeholderTextColor={colors.textMuted}
        style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
      />

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>الرمز السري (PIN)</Text>
      <View style={styles.pinRow}>
        <TextInput
          value={pin}
          onChangeText={setPin}
          placeholder="••••"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          secureTextEntry={!showPin}
          style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, flex: 1 }]}
        />
        <TouchableOpacity onPress={() => setShowPin(!showPin)} style={[styles.eyeBtn, { backgroundColor: colors.surfaceAlt }]}>
          {showPin ? <EyeOff size={20} color={colors.textMuted} strokeWidth={2} /> : <Eye size={20} color={colors.textMuted} strokeWidth={2} />}
        </TouchableOpacity>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>الصلاحية</Text>
      <View style={styles.roleRow}>
        <TouchableOpacity
          onPress={() => setRole('manager')}
          style={[styles.roleBtn, role === 'manager' ? { backgroundColor: colors.success } : { backgroundColor: colors.surfaceAlt }]}
        >
          <Shield size={18} color={role === 'manager' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.roleBtnText, { color: role === 'manager' ? '#FFFFFF' : colors.textSecondary }]}>مدير</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setRole('cashier')}
          style={[styles.roleBtn, role === 'cashier' ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
        >
          <UserCog size={18} color={role === 'cashier' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.roleBtnText, { color: role === 'cashier' ? '#FFFFFF' : colors.textSecondary }]}>كاشير</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>الصلاحيات</Text>
      <View style={[styles.permSection, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <PermToggle label="حذف المنتجات والمعاملات" value={canDelete} onChange={setCanDelete} colors={colors} />
        <PermToggle label="تعديل الأسعار" value={canEditPrice} onChange={setCanEditPrice} colors={colors} />
        <PermToggle label="منح خصومات" value={canDiscount} onChange={setCanDiscount} colors={colors} />
        {canDiscount && (
          <View style={styles.maxDiscountRow}>
            <Text style={[styles.permLabel, { color: colors.text }]}>أقصى نسبة خصم %</Text>
            <TextInput
              value={maxDiscountPercent}
              onChangeText={setMaxDiscountPercent}
              placeholder="10"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.maxDiscountInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            />
          </View>
        )}
        <PermToggle label="معالجة المرتجعات" value={canProcessReturn} onChange={setCanProcessReturn} colors={colors} />
        <PermToggle label="حساب نشط" value={active} onChange={setActive} colors={colors} />
      </View>
    </BaseModal>
  );
}

function PermToggle({ label, value, onChange, colors }: {
  label: string; value: boolean; onChange: (v: boolean) => void; colors: Colors;
}) {
  return (
    <View style={styles.permToggleRow}>
      <Text style={[styles.permLabel, { color: colors.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.surface, true: colors.primary }} thumbColor="#FFFFFF" />
    </View>
  );
}

function StaffLoginModal({ visible, colors, onClose, onLogin }: {
  visible: boolean; colors: Colors; onClose: () => void; onLogin: (pin: string) => Staff | null;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setPin(''); setError(''); }
  }, [visible]);

  const handleLogin = () => {
    if (pin.length < 4) { setError('أدخل رمزاً صحيحاً'); return; }
    const member = onLogin(pin);
    if (!member) setError('رمز خاطئ');
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      title="دخول الموظف"
      footer={
        <TouchableOpacity onPress={handleLogin} style={[styles.saveBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8}>
          <KeyRound size={18} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.saveBtnText}>دخول</Text>
        </TouchableOpacity>
      }
    >
      <View style={[styles.pinInfoBox, { backgroundColor: colors.primary + '10' }]}>
        <Lock size={20} color={colors.primary} strokeWidth={2} />
        <Text style={[styles.pinInfoText, { color: colors.primary }]}>
          أدخل رمزك السري للوصول إلى نظام المبيعات
        </Text>
      </View>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <TextInput
        value={pin}
        onChangeText={setPin}
        placeholder="••••"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        secureTextEntry
        autoFocus
        style={[styles.pinInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
      />
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  loginBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loginDot: { width: 8, height: 8, borderRadius: 4 },
  loginName: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  logoutBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loginBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  loginBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  disabledWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statLabel: { fontSize: 11 },
  memberCard: { borderRadius: 14, padding: 14, marginBottom: 10 },
  memberHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  memberAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  memberName: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  roleText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  permissionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  permChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  permText: { fontSize: 10, fontWeight: '600' },
  memberActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 16, width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15 },
  pinRow: { flexDirection: 'row', gap: 8 },
  eyeBtn: { width: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  roleBtnText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  permSection: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  permToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  permLabel: { fontSize: 14, fontWeight: '600' },
  maxDiscountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  maxDiscountInput: { width: 70, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, fontSize: 14, textAlign: 'center' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  errorBox: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center', fontFamily: 'Cairo-SemiBold' },
  pinInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginBottom: 16 },
  pinInfoText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 20, fontFamily: 'Cairo-SemiBold' },
  pinInput: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, fontSize: 24, textAlign: 'center', letterSpacing: 12, fontFamily: 'Cairo-Bold' },
});
