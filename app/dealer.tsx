import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, Platform, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Phone, Crown, Wallet, Clock, Calendar, TrendingUp, Bell, Package,
  Smartphone, Plus, Send, Check, X, ChevronLeft, Users, Tag,
  CreditCard, MessageSquare, RefreshCw, AlertCircle, LogOut,
} from 'lucide-react-native';

// ============ TYPES ============
interface DealerInfo {
  id: string;
  name: string;
  phone: string;
  balance: number;
  credit_limit: number;
}

interface RechargeRequest {
  id: string;
  customer_name: string;
  contact_phone: string;
  sim_number: string;
  company_name: string;
  bundle_name: string;
  duration: string;
  sale_price: number;
  status: string;
  owner_reply: string;
  phone_number_assigned: string;
  completed_at: string;
  sms_sent: boolean;
  sms_message: string;
  created_at: string;
}

interface DealerCustomer {
  id: string;
  phone_number: string;
  customer_name: string;
  contact_phone: string;
  company_name: string;
  status: string;
  created_at: string;
}

interface PricingEntry {
  id: string;
  company_name: string;
  bundle_name: string;
  bundle_type: string;
  offer_type: string;
  dealer_price: number;
  sale_price: number;
  cost: number;
  duration_days: number;
  active: boolean;
}

interface PlasticSim {
  id: string;
  sim_number: string;
  company_name: string;
  bundle_name: string;
  status: string;
  assigned_phone: string;
  created_at: string;
}

interface DealerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  related_phone?: string;
  created_at: string;
}

interface DealerCustomPrice {
  id: string;
  dealer_id: string;
  pricing_id: string;
  custom_sale_price: number;
}

interface DealerCustomerDebt {
  id: string;
  dealer_id: string;
  customer_id: string | null;
  amount: number;
  paid_amount: number;
  payment_status: 'full' | 'partial' | 'debt';
  description: string | null;
  related_request_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DealerEsimRequest {
  id: string;
  dealer_id: string;
  pricing_id: string | null;
  customer_name: string;
  contact_phone: string | null;
  company_name: string | null;
  bundle_name: string | null;
  sale_price: number;
  status: string;
  owner_reply: string | null;
  barcode_image_url: string | null;
  phone_number_assigned: string | null;
  completed_at: string | null;
  created_at: string;
}

interface DealerTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

// ============ COLORS ============
const C = {
  bg: '#0F1117',
  surface: '#1A1D28',
  surfaceAlt: '#222634',
  border: '#2A2E3E',
  text: '#F1F3F8',
  textSecondary: '#9CA3B8',
  textMuted: '#6B7186',
  primary: '#3B82F6',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  accent: '#F59E0B',
  info: '#06B6D4',
};

const API_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/dealer-portal`
  : '';

type Tab = 'dashboard' | 'customers' | 'requests' | 'offers' | 'sims' | 'debts' | 'notifications' | 'transactions';

// ============ MAIN COMPONENT ============
export default function DealerPortalPage() {
  const params = useLocalSearchParams<{ action?: string; phone?: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [dealer, setDealer] = useState<DealerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [error, setError] = useState('');

  // Restore session from storage on mount
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setLoading(false);
      return;
    }
    const saved = sessionStorage.getItem('dealer_token');
    const savedDealer = sessionStorage.getItem('dealer_info');
    if (saved && savedDealer) {
      setToken(saved);
      try { setDealer(JSON.parse(savedDealer)); } catch {}
    }
    if (params.action === 'new-request') {
      setActiveTab('requests');
    }
    setLoading(false);
  }, [params.action]);

  const handleLogin = (t: string, d: DealerInfo) => {
    setToken(t);
    setDealer(d);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      sessionStorage.setItem('dealer_token', t);
      sessionStorage.setItem('dealer_info', JSON.stringify(d));
    }
  };

  const handleLogout = () => {
    setToken(null);
    setDealer(null);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      sessionStorage.removeItem('dealer_token');
      sessionStorage.removeItem('dealer_info');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!token || !dealer) {
    return <LoginScreen onLogin={handleLogin} error={error} setError={setError} initialPhone={params.phone || ''} />;
  }

  return (
    <DealerDashboard
      token={token}
      dealer={dealer}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onLogout={handleLogout}
      onDealerUpdate={setDealer}
    />
  );
}

// ============ LOGIN SCREEN ============
function LoginScreen({ onLogin, error, setError, initialPhone }: { onLogin: (t: string, d: DealerInfo) => void; error: string; setError: (e: string) => void; initialPhone?: string }) {
  const [phone, setPhone] = useState(initialPhone || '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      setError('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'فشل تسجيل الدخول');
        return;
      }
      onLogin(data.token, data.dealer);
    } catch {
      setError('تعذر الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: C.bg }]} contentContainerStyle={styles.loginContent}>
      <View style={styles.loginCard}>
        <View style={styles.logoContainer}>
          <View style={[styles.logoCircle, { backgroundColor: C.primary + '20' }]}>
            <Smartphone size={32} color={C.primary} strokeWidth={2} />
          </View>
          <Text style={styles.loginTitle}>بوابة الموزع</Text>
          <Text style={styles.loginSubtitle}>سحب المتجر — نظام الموزعين</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>رقم الهاتف</Text>
          <View style={styles.inputWrapper}>
            <Phone size={18} color={C.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.textInput}
              placeholder="05XXXXXXXX"
              placeholderTextColor={C.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>كلمة المرور</Text>
          <View style={styles.inputWrapper}>
            <CreditCard size={18} color={C.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor={C.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color={C.danger} strokeWidth={2} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.loginButton, submitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============ DASHBOARD ============
function DealerDashboard({
  token, dealer, activeTab, setActiveTab, onLogout, onDealerUpdate,
}: {
  token: string;
  dealer: DealerInfo;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  onLogout: () => void;
  onDealerUpdate: (d: DealerInfo) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const lastNotifIdRef = useRef<string | null>(null);

  // Poll for new notifications and show browser notifications
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    const poll = async () => {
      try {
        const resp = await fetch(`${API_BASE}/notifications`, {
          headers: { 'Content-Type': 'application/json', 'X-Dealer-Token': token },
        });
        if (!resp.ok) return;
        const notifs = await resp.json() as DealerNotification[];
        if (!Array.isArray(notifs) || notifs.length === 0) return;

        const latest = notifs[0];
        if (lastNotifIdRef.current === null) {
          lastNotifIdRef.current = latest.id;
          return;
        }

        // Find new notifications since last poll
        const newOnes = [];
        for (const n of notifs) {
          if (n.id === lastNotifIdRef.current) break;
          if (!n.read) newOnes.push(n);
        }

        if (newOnes.length > 0) {
          lastNotifIdRef.current = notifs[0].id;
          for (const n of newOnes) {
            if (Notification.permission === 'granted') {
              try {
                new Notification(n.title, { body: n.body || '', icon: '/favicon.png' });
              } catch {}
            }
          }
        }
      } catch {}
    };

    void poll();
    const interval = setInterval(() => void poll(), 15000);
    return () => clearInterval(interval);
  }, [token]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'الرئيسية', icon: <TrendingUp size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'customers', label: 'الزبائن', icon: <Users size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'requests', label: 'الطلبات', icon: <Send size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'offers', label: 'العروض', icon: <Tag size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'sims', label: 'الشرائح', icon: <Smartphone size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'debts', label: 'الديون', icon: <Wallet size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'notifications', label: 'الإشعارات', icon: <Bell size={18} color={C.textSecondary} strokeWidth={2} /> },
    { key: 'transactions', label: 'الحركات', icon: <Wallet size={18} color={C.textSecondary} strokeWidth={2} /> },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarTitle}>بوابة الموزع</Text>
          <Text style={styles.topBarName}>{dealer.name}</Text>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.balancePill}>
            <Wallet size={14} color={C.success} strokeWidth={2} />
            <Text style={styles.balanceText}>₪{Number(dealer.balance).toFixed(2)}</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
            <LogOut size={18} color={C.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive, isActive && { borderBottomColor: C.primary }]}
              onPress={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <Text style={[styles.tabLabel, isActive && { color: C.primary }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView style={styles.dashboardContent} contentContainerStyle={styles.dashboardContentPad}>
        {activeTab === 'dashboard' && <DashboardTab token={token} dealer={dealer} onDealerUpdate={onDealerUpdate} />}
        {activeTab === 'customers' && <CustomersTab token={token} />}
        {activeTab === 'requests' && <RequestsTab token={token} dealer={dealer} />}
        {activeTab === 'offers' && <OffersTab token={token} />}
        {activeTab === 'sims' && <SimsTab token={token} />}
        {activeTab === 'debts' && <DebtsTab token={token} />}
        {activeTab === 'notifications' && <NotificationsTab token={token} />}
        {activeTab === 'transactions' && <TransactionsTab token={token} />}
      </ScrollView>
    </View>
  );
}

// ============ API HELPER ============
function useApi(token: string) {
  const call = useCallback(async (path: string, options: RequestInit = {}) => {
    const resp = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Dealer-Token': token,
        ...options.headers,
      },
    });
    return resp;
  }, [token]);
  return call;
}

// ============ DASHBOARD TAB ============
function DashboardTab({ token, dealer, onDealerUpdate }: { token: string; dealer: DealerInfo; onDealerUpdate: (d: DealerInfo) => void }) {
  const api = useApi(token);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api('/dashboard');
      const d = await resp.json();
      if (!resp.ok) { setError(d.error || 'خطأ'); return; }
      setData(d);
      onDealerUpdate({ ...dealer, balance: d.balance, credit_limit: d.credit_limit });
    } catch {
      setError('تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <View style={styles.tabContent}>
      {/* Summary cards */}
      <View style={styles.cardGrid}>
        <SummaryCard icon={<Wallet size={20} color={C.success} strokeWidth={2} />} label="الرصيد" value={`₪${Number(data.balance).toFixed(2)}`} color={C.success} />
        <SummaryCard icon={<TrendingUp size={20} color={C.primary} strokeWidth={2} />} label="عمولات مكتسبة" value={`₪${Number(data.total_commission || 0).toFixed(2)}`} color={C.primary} />
        <SummaryCard icon={<Clock size={20} color={C.warning} strokeWidth={2} />} label="طلبات معلقة" value={String(data.pending_requests)} color={C.warning} />
        <SummaryCard icon={<Users size={20} color={C.info} strokeWidth={2} />} label="زبائن نشطون" value={String(data.active_customers)} color={C.info} />
        <SummaryCard icon={<Send size={20} color={C.accent} strokeWidth={2} />} label="إجمالي الطلبات" value={String(data.total_requests || 0)} color={C.accent} />
        <SummaryCard icon={<Smartphone size={20} color={C.success} strokeWidth={2} />} label="شرائح متوفرة" value={String(data.plastic_sims || 0)} color={C.success} />
      </View>

      {/* Recent requests */}
      <Text style={styles.sectionTitle}>آخر الطلبات</Text>
      {data.recent_requests?.length > 0 ? (
        data.recent_requests.map((req: RechargeRequest) => (
          <RequestCard key={req.id} req={req} compact />
        ))
      ) : (
        <EmptyState icon={<Send size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد طلبات بعد" />
      )}

      {/* Recent transactions */}
      <Text style={styles.sectionTitle}>آخر الحركات</Text>
      {data.recent_transactions?.length > 0 ? (
        data.recent_transactions.map((txn: DealerTransaction) => (
          <TransactionCard key={txn.id} txn={txn} />
        ))
      ) : (
        <EmptyState icon={<Wallet size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد حركات" />
      )}
    </View>
  );
}

// ============ CUSTOMERS TAB ============
function CustomersTab({ token }: { token: string }) {
  const api = useApi(token);
  const [customers, setCustomers] = useState<DealerCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DealerCustomer | null>(null);
  const [form, setForm] = useState({ customer_name: '', phone_number: '', contact_phone: '', company_name: '', status: 'active' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api('/customers');
      const d = await resp.json();
      if (resp.ok) setCustomers(d);
    } catch {} finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;
    if (editing) {
      await api(`/customers/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await api('/customers', { method: 'POST', body: JSON.stringify(form) });
    }
    setShowAdd(false);
    setEditing(null);
    setForm({ customer_name: '', phone_number: '', contact_phone: '', company_name: '', status: 'active' });
    void load();
  };

  const handleDelete = async (id: string) => {
    await api(`/customers/${id}`, { method: 'DELETE' });
    void load();
  };

  if (loading) return <LoadingState />;

  return (
    <View style={styles.tabContent}>
      <View style={styles.tabHeader}>
        <Text style={styles.sectionTitle}>زبائني ({customers.length})</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditing(null); setForm({ customer_name: '', phone_number: '', contact_phone: '', company_name: '', status: 'active' }); setShowAdd(true); }}>
          <Plus size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.addBtnText}>إضافة زبون</Text>
        </TouchableOpacity>
      </View>

      {showAdd && (
        <ModalForm title={editing ? 'تعديل زبون' : 'إضافة زبون جديد'} onClose={() => { setShowAdd(false); setEditing(null); }} onSave={handleSave}>
          <FormField label="اسم الزبون" value={form.customer_name} onChangeText={(v) => setForm({ ...form, customer_name: v })} />
          <FormField label="رقم الهاتف (الاشتراك)" value={form.phone_number} onChangeText={(v) => setForm({ ...form, phone_number: v })} keyboardType="phone-pad" />
          <FormField label="رقم التواصل" value={form.contact_phone} onChangeText={(v) => setForm({ ...form, contact_phone: v })} keyboardType="phone-pad" />
          <FormField label="الشركة" value={form.company_name} onChangeText={(v) => setForm({ ...form, company_name: v })} />
        </ModalForm>
      )}

      {customers.length === 0 ? (
        <EmptyState icon={<Users size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا يوجد زبائن — أضف زبوناً جديداً" />
      ) : (
        customers.map((c) => (
          <View key={c.id} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.cardHeader}>
              <View style={styles.customerAvatar}>
                <Text style={styles.customerAvatarText}>{c.customer_name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.customer_name}</Text>
                {c.phone_number && <Text style={styles.cardSubtitle}>📱 {c.phone_number}</Text>}
                {c.contact_phone && <Text style={styles.cardSubtitle}>☎ {c.contact_phone}</Text>}
                {c.company_name && <Text style={styles.cardSubtitle}>🏢 {c.company_name}</Text>}
              </View>
              <View style={[styles.statusBadge, c.status === 'active' ? { backgroundColor: C.success + '20' } : { backgroundColor: C.danger + '20' }]}>
                <Text style={[styles.statusText, { color: c.status === 'active' ? C.success : C.danger }]}>
                  {c.status === 'active' ? 'نشط' : 'متوقف'}
                </Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => { setEditing(c); setForm({ customer_name: c.customer_name, phone_number: c.phone_number || '', contact_phone: c.contact_phone || '', company_name: c.company_name || '', status: c.status }); setShowAdd(true); }}>
                <Text style={styles.actionBtnText}>تعديل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.danger + '40' }]} onPress={() => handleDelete(c.id)}>
                <Text style={[styles.actionBtnText, { color: C.danger }]}>حذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ============ REQUESTS TAB ============
function RequestsTab({ token, dealer }: { token: string; dealer: DealerInfo }) {
  const api = useApi(token);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [offers, setOffers] = useState<PricingEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqResp, offersResp] = await Promise.all([
        api('/requests'),
        api('/offers'),
      ]);
      const reqData = await reqResp.json();
      const offData = await offersResp.json();
      if (reqResp.ok) setRequests(reqData);
      if (offersResp.ok) setOffers(offData);
    } catch {} finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  return (
    <View style={styles.tabContent}>
      <View style={styles.tabHeader}>
        <Text style={styles.sectionTitle}>طلبات الشحن ({requests.length})</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)}>
          <Plus size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.addBtnText}>طلب جديد</Text>
        </TouchableOpacity>
      </View>

      {showNew && (
        <NewRequestModal
          offers={offers}
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            await api('/requests', { method: 'POST', body: JSON.stringify(data) });
            setShowNew(false);
            void load();
          }}
        />
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'قيد الانتظار' },
          { key: 'approved', label: 'موافق عليه' },
          { key: 'completed', label: 'مكتمل' },
          { key: 'rejected', label: 'مرفوض' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && { backgroundColor: C.primary + '20', borderColor: C.primary }]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && { color: C.primary }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Send size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد طلبات" />
      ) : (
        filtered.map((req) => <RequestCard key={req.id} req={req} />)
      )}
    </View>
  );
}

// ============ NEW REQUEST MODAL ============
function NewRequestModal({ offers, onClose, onSubmit }: { offers: PricingEntry[]; onClose: () => void; onSubmit: (data: any) => void }) {
  const [customerName, setCustomerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [bundleName, setBundleName] = useState('');
  const [duration, setDuration] = useState('');
  const [salePrice, setSalePrice] = useState('0');
  const [smsMessage, setSmsMessage] = useState('');
  const [sendSms, setSendSms] = useState(false);

  const companies = [...new Set(offers.map((o) => o.company_name))];
  const bundles = offers.filter((o) => o.company_name === companyName);

  const handleSubmit = () => {
    if (!customerName.trim()) return;
    const data: any = {
      customer_name: customerName,
      contact_phone: contactPhone,
      sim_number: simNumber,
      company_name: companyName,
      bundle_name: bundleName,
      duration,
      sale_price: parseFloat(salePrice) || 0,
    };
    if (sendSms && smsMessage) {
      data.sms_message = smsMessage;
    }
    onSubmit(data);

    // If SMS is requested, open the device's SMS app
    if (sendSms && smsMessage && Platform.OS === 'web' && typeof window !== 'undefined') {
      const smsUrl = `sms:?body=${encodeURIComponent(smsMessage)}`;
      window.open(smsUrl, '_blank');
    }
  };

  return (
    <ModalForm title="طلب شحن جديد" onClose={onClose} onSubmit={handleSubmit} submitLabel="إرسال الطلب">
      <FormField label="اسم الزبون" value={customerName} onChangeText={setCustomerName} />
      <FormField label="رقم التواصل" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
      <FormField label="رقم الشريحة (اختياري)" value={simNumber} onChangeText={setSimNumber} keyboardType="phone-pad" />

      {/* Company selector */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>الشركة</Text>
        <View style={styles.selectWrapper}>
          {companies.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.selectChip, companyName === c && { backgroundColor: C.primary + '20', borderColor: C.primary }]}
              onPress={() => { setCompanyName(c); setBundleName(''); }}
            >
              <Text style={[styles.selectChipText, companyName === c && { color: C.primary }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bundle selector */}
      {bundles.length > 0 && (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>الحزمة</Text>
          <View style={styles.selectWrapper}>
            {bundles.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.selectChip, bundleName === b.bundle_name && { backgroundColor: C.primary + '20', borderColor: C.primary }]}
                onPress={() => { setBundleName(b.bundle_name); setSalePrice(String(b.sale_price)); setDuration(b.duration_days + ' يوم'); }}
              >
                <Text style={[styles.selectChipText, bundleName === b.bundle_name && { color: C.primary }]}>
                  {b.bundle_name} (₪{b.sale_price})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <FormField label="المدة" value={duration} onChangeText={setDuration} />
      <FormField label="سعر البيع (₪)" value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" />

      {/* SMS option */}
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setSendSms(!sendSms)}
      >
        <View style={[styles.checkbox, sendSms && { backgroundColor: C.primary, borderColor: C.primary }]}>
          {sendSms && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
        <Text style={styles.checkboxLabel}>إرسال الطلب أيضاً عبر SMS (يفتح برنامج الرسائل)</Text>
      </TouchableOpacity>

      {sendSms && (
        <FormField label="نص الرسالة" value={smsMessage} onChangeText={setSmsMessage} multiline placeholder="اكتب نص طلب الشحن هنا..." />
      )}
    </ModalForm>
  );
}

// ============ OFFERS TAB ============
function OffersTab({ token }: { token: string }) {
  const api = useApi(token);
  const [offers, setOffers] = useState<PricingEntry[]>([]);
  const [customPrices, setCustomPrices] = useState<DealerCustomPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState<{ pricingId: string; currentPrice: number } | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [esimModal, setEsimModal] = useState<PricingEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [offersResp, pricesResp] = await Promise.all([
        api('/offers'),
        api('/custom-prices'),
      ]);
      const offData = await offersResp.json();
      const priceData = await pricesResp.json();
      if (offersResp.ok) setOffers(offData);
      if (pricesResp.ok) setCustomPrices(priceData);
    } catch {} finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const getCustomPrice = (pricingId: string): number | null => {
    const cp = customPrices.find((c) => c.pricing_id === pricingId);
    return cp ? Number(cp.custom_sale_price) : null;
  };

  const handleSavePrice = async () => {
    if (!editingPrice) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) return;
    await api('/custom-prices', {
      method: 'POST',
      body: JSON.stringify({ pricing_id: editingPrice.pricingId, custom_sale_price: price }),
    });
    setEditingPrice(null);
    setNewPrice('');
    void load();
  };

  const handleEsimRequest = async (offer: PricingEntry, customerName: string, contactPhone: string) => {
    await api('/esim-requests', {
      method: 'POST',
      body: JSON.stringify({
        pricing_id: offer.id,
        customer_name: customerName,
        contact_phone: contactPhone,
        company_name: offer.company_name,
        bundle_name: offer.bundle_name,
        sale_price: getCustomPrice(offer.id) || offer.sale_price,
      }),
    });
    setEsimModal(null);
  };

  if (loading) return <LoadingState />;

  const grouped: Record<string, PricingEntry[]> = {};
  offers.forEach((o) => {
    if (!grouped[o.company_name]) grouped[o.company_name] = [];
    grouped[o.company_name].push(o);
  });

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>العروض والأسعار</Text>
      {offers.length === 0 ? (
        <EmptyState icon={<Tag size={32} color={C.textMuted} strokeWidth={1.5} />} text="لم يتم تحديد عروض بعد" />
      ) : (
        Object.entries(grouped).map(([company, items]) => (
          <View key={company} style={styles.offerGroup}>
            <Text style={styles.offerGroupTitle}>{company}</Text>
            {items.map((o) => {
              const customPrice = getCustomPrice(o.id);
              const effectiveSale = customPrice ?? o.sale_price;
              const profit = effectiveSale - o.dealer_price;
              return (
                <View key={o.id} style={[styles.offerCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.offerName}>{o.bundle_name}</Text>
                    <Text style={styles.offerDuration}>{o.duration_days} يوم{o.bundle_type === 'offer' ? ' — عرض خاص' : ''}</Text>
                  </View>
                  <View style={styles.offerPrices}>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>سعر الموزع</Text>
                      <Text style={[styles.priceValue, { color: C.warning }]}>₪{o.dealer_price}</Text>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>{customPrice ? 'سعري المخصص' : 'سعر البيع'}</Text>
                      <Text style={[styles.priceValue, { color: customPrice ? C.primary : C.success }]}>₪{effectiveSale}</Text>
                    </View>
                    <View style={styles.priceCol}>
                      <Text style={styles.priceLabel}>ربحي</Text>
                      <Text style={[styles.priceValue, { color: profit > 0 ? C.success : C.danger }]}>₪{profit.toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.offerActions}>
                    <TouchableOpacity
                      style={[styles.offerActionBtn, { backgroundColor: C.primary + '15', borderColor: C.primary + '40' }]}
                      onPress={() => { setEditingPrice({ pricingId: o.id, currentPrice: customPrice ?? o.sale_price }); setNewPrice(String(customPrice ?? o.sale_price)); }}
                    >
                      <Tag size={13} color={C.primary} strokeWidth={2} />
                      <Text style={[styles.offerActionText, { color: C.primary }]}>{customPrice ? 'تعديل سعري' : 'تحديد سعري'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.offerActionBtn, { backgroundColor: C.info + '15', borderColor: C.info + '40' }]}
                      onPress={() => setEsimModal(o)}
                    >
                      <Smartphone size={13} color={C.info} strokeWidth={2} />
                      <Text style={[styles.offerActionText, { color: C.info }]}>طلب eSIM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      )}

      {/* Custom Price Modal */}
      {editingPrice && (
        <ModalForm title="تحديد سعر البيع الخاص بك" onClose={() => { setEditingPrice(null); setNewPrice(''); }} onSubmit={handleSavePrice} submitLabel="حفظ السعر">
          <FormField label="سعر البيع الجديد (₪)" value={newPrice} onChangeText={setNewPrice} keyboardType="numeric" />
          <View style={[styles.replyBox, { backgroundColor: C.info + '10', borderColor: C.info + '30' }]}>
            <TrendingUp size={14} color={C.info} strokeWidth={2} />
            <Text style={styles.replyText}>سيتم حساب ربحك بناءً على هذا السعر بدلاً من السعر الافتراضي</Text>
          </View>
        </ModalForm>
      )}

      {/* eSIM Request Modal */}
      {esimModal && (
        <EsimRequestModal offer={esimModal} customPrice={getCustomPrice(esimModal.id)} onClose={() => setEsimModal(null)} onSubmit={handleEsimRequest} />
      )}
    </View>
  );
}

function EsimRequestModal({ offer, customPrice, onClose, onSubmit }: { offer: PricingEntry; customPrice: number | null; onClose: () => void; onSubmit: (offer: PricingEntry, customerName: string, contactPhone: string) => void }) {
  const [customerName, setCustomerName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const salePrice = customPrice ?? offer.sale_price;
  const profit = salePrice - offer.dealer_price;

  return (
    <ModalForm title={`طلب شريحة إلكترونية — ${offer.company_name} ${offer.bundle_name}`} onClose={onClose} onSubmit={() => { if (customerName.trim()) onSubmit(offer, customerName, contactPhone); }} submitLabel="إرسال الطلب">
      <FormField label="اسم الزبون" value={customerName} onChangeText={setCustomerName} />
      <FormField label="رقم التواصل" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
      <View style={styles.offerPrices}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>سعر البيع</Text>
          <Text style={[styles.priceValue, { color: C.success }]}>₪{salePrice}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>سعر الموزع</Text>
          <Text style={[styles.priceValue, { color: C.warning }]}>₪{offer.dealer_price}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>ربحك</Text>
          <Text style={[styles.priceValue, { color: C.primary }]}>₪{profit.toFixed(2)}</Text>
        </View>
      </View>
      <View style={[styles.replyBox, { backgroundColor: C.info + '10', borderColor: C.info + '30' }]}>
        <Smartphone size={14} color={C.info} strokeWidth={2} />
        <Text style={styles.replyText}>سيصل الطلب للبرنامج الرئيسي وسيتم التعامل معه كمعاملة جديدة. سيتم إرسال صورة الباركود مع الرد.</Text>
      </View>
    </ModalForm>
  );
}

// ============ DEBTS TAB ============
function DebtsTab({ token }: { token: string }) {
  const api = useApi(token);
  const [debts, setDebts] = useState<DealerCustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectingDebt, setCollectingDebt] = useState<DealerCustomerDebt | null>(null);
  const [collectAmount, setCollectAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api('/debts');
      const d = await resp.json();
      if (resp.ok) setDebts(d);
    } catch {} finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleCollect = async () => {
    if (!collectingDebt) return;
    const amount = parseFloat(collectAmount) || 0;
    if (amount <= 0) return;
    const newPaid = Number(collectingDebt.paid_amount) + amount;
    const remaining = Number(collectingDebt.amount) - newPaid;
    const newStatus = remaining <= 0 ? 'full' : 'partial';
    await api(`/debts/${collectingDebt.id}`, {
      method: 'PUT',
      body: JSON.stringify({ paid_amount: newPaid, payment_status: newStatus }),
    });
    setCollectingDebt(null);
    setCollectAmount('');
    void load();
  };

  if (loading) return <LoadingState />;

  const totalDebt = debts.reduce((sum, d) => sum + (Number(d.amount) - Number(d.paid_amount)), 0);
  const statusColors: Record<string, string> = { full: C.success, partial: C.warning, debt: C.danger };
  const statusLabels: Record<string, string> = { full: 'مدفوع كامل', partial: 'مدفوع جزئي', debt: 'دين' };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>ديون الزبائن ({debts.length})</Text>
      <View style={[styles.summaryCard, { backgroundColor: C.surface, borderColor: C.border, marginBottom: 8 }]}>
        <View style={[styles.summaryIcon, { backgroundColor: C.danger + '15' }]}>
          <Wallet size={20} color={C.danger} strokeWidth={2} />
        </View>
        <Text style={styles.summaryLabel}>إجمالي الديون المتبقية</Text>
        <Text style={[styles.summaryValue, { color: C.danger }]}>₪{totalDebt.toFixed(2)}</Text>
      </View>
      {debts.length === 0 ? (
        <EmptyState icon={<Wallet size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد ديون — سيظهر هنا ما يستحق على زبائنك" />
      ) : (
        debts.map((debt) => {
          const remaining = Number(debt.amount) - Number(debt.paid_amount);
          const color = statusColors[debt.payment_status] || C.textMuted;
          return (
            <View key={debt.id} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>₪{Number(debt.amount).toFixed(2)}</Text>
                  {debt.description && <Text style={styles.cardSubtitle}>{debt.description}</Text>}
                  <Text style={styles.notifTime}>{new Date(debt.created_at).toLocaleString('ar')}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.statusText, { color }]}>{statusLabels[debt.payment_status] || debt.payment_status}</Text>
                </View>
              </View>
              {debt.paid_amount > 0 && (
                <View style={styles.reqPriceRow}>
                  <Text style={styles.reqPriceLabel}>المدفوع: ₪{Number(debt.paid_amount).toFixed(2)}</Text>
                  <Text style={[styles.reqPriceValue, { color: C.warning }]}>المتبقي: ₪{remaining.toFixed(2)}</Text>
                </View>
              )}
              {remaining > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: C.success + '15', borderColor: C.success + '40', borderWidth: 1, marginTop: 8 }]}
                  onPress={() => { setCollectingDebt(debt); setCollectAmount(remaining.toString()); }}
                >
                  <Wallet size={14} color={C.success} strokeWidth={2} />
                  <Text style={[styles.actionBtnText, { color: C.success }]}>تحصيل</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}

      {/* Collect Modal */}
      {collectingDebt && (
        <ModalForm
          title="تحصيل دين"
          onClose={() => { setCollectingDebt(null); setCollectAmount(''); }}
          onSubmit={handleCollect}
          submitLabel="تأكيد التحصيل"
        >
          <View style={[styles.replyBox, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.replyText, { color: C.text }]}>
              المبلغ الأصلي: ₪{Number(collectingDebt.amount).toFixed(2)}
            </Text>
            <Text style={[styles.replyText, { color: C.warning }]}>
              المتبقي: ₪{(Number(collectingDebt.amount) - Number(collectingDebt.paid_amount)).toFixed(2)}
            </Text>
          </View>
          <FormField label="مبلغ التحصيل (₪)" value={collectAmount} onChangeText={setCollectAmount} keyboardType="numeric" />
          <View style={styles.collectActions}>
            <TouchableOpacity
              onPress={() => setCollectAmount((Number(collectingDebt.amount) - Number(collectingDebt.paid_amount)).toString())}
              style={[styles.collectBtn, { backgroundColor: C.primary }]}
            >
              <Text style={styles.collectBtnText}>تحصيل كامل</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCollectAmount(((Number(collectingDebt.amount) - Number(collectingDebt.paid_amount)) / 2).toFixed(2))}
              style={[styles.collectBtn, { backgroundColor: C.accent }]}
            >
              <Text style={styles.collectBtnText}>نصف المبلغ</Text>
            </TouchableOpacity>
          </View>
        </ModalForm>
      )}
    </View>
  );
}

// ============ SIMS TAB ============
function SimsTab({ token }: { token: string }) {
  const api = useApi(token);
  const [sims, setSims] = useState<PlasticSim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ sim_number: '', company_name: '', bundle_name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api('/sims');
      const d = await resp.json();
      if (resp.ok) setSims(d);
    } catch {} finally { setLoading(false); }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!form.sim_number.trim()) return;
    await api('/sims', { method: 'POST', body: JSON.stringify(form) });
    setShowAdd(false);
    setForm({ sim_number: '', company_name: '', bundle_name: '' });
    void load();
  };

  const statusColors: Record<string, string> = {
    in_stock: C.success,
    assigned: C.warning,
    used: C.textMuted,
  };

  const statusLabels: Record<string, string> = {
    in_stock: 'متوفرة',
    assigned: 'مخصصة',
    used: 'مستهلكة',
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.tabHeader}>
        <Text style={styles.sectionTitle}>الشرائح البلاستيكية ({sims.length})</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Plus size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.addBtnText}>إضافة شريحة</Text>
        </TouchableOpacity>
      </View>

      {showAdd && (
        <ModalForm title="إضافة شريحة بلاستيكية" onClose={() => setShowAdd(false)} onSubmit={handleAdd} submitLabel="إضافة">
          <FormField label="رقم الشريحة" value={form.sim_number} onChangeText={(v) => setForm({ ...form, sim_number: v })} keyboardType="phone-pad" />
          <FormField label="الشركة" value={form.company_name} onChangeText={(v) => setForm({ ...form, company_name: v })} />
          <FormField label="الحزمة (اختياري)" value={form.bundle_name} onChangeText={(v) => setForm({ ...form, bundle_name: v })} />
        </ModalForm>
      )}

      {loading ? (
        <LoadingState />
      ) : sims.length === 0 ? (
        <EmptyState icon={<Smartphone size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد شرائح" />
      ) : (
        sims.map((sim) => (
          <View key={sim.id} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.simIcon, { backgroundColor: (statusColors[sim.status] || C.textMuted) + '20' }]}>
                <Smartphone size={20} color={statusColors[sim.status] || C.textMuted} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{sim.sim_number}</Text>
                <Text style={styles.cardSubtitle}>🏢 {sim.company_name}</Text>
                {sim.bundle_name && <Text style={styles.cardSubtitle}>📦 {sim.bundle_name}</Text>}
                {sim.assigned_phone && <Text style={styles.cardSubtitle}>📱 {sim.assigned_phone}</Text>}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (statusColors[sim.status] || C.textMuted) + '20' }]}>
                <Text style={[styles.statusText, { color: statusColors[sim.status] || C.textMuted }]}>
                  {statusLabels[sim.status] || sim.status}
                </Text>
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ============ NOTIFICATIONS TAB ============
function NotificationsTab({ token }: { token: string }) {
  const api = useApi(token);
  const [notifications, setNotifications] = useState<DealerNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await api('/notifications');
        const d = await resp.json();
        if (resp.ok) setNotifications(d);
      } catch {} finally { setLoading(false); }
    })();
  }, [api]);

  const markRead = async (id: string) => {
    await api(`/notifications/${id}`, { method: 'PUT' });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  if (loading) return <LoadingState />;

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>الإشعارات ({notifications.length})</Text>
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد إشعارات" />
      ) : (
        notifications.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.card, { backgroundColor: n.read ? C.surface : C.surfaceAlt, borderColor: n.read ? C.border : C.primary + '40' }]}
            onPress={() => { if (!n.read) void markRead(n.id); }}
          >
            <View style={styles.notifRow}>
              {!n.read && <View style={styles.unreadDot} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                {n.body && <Text style={styles.cardSubtitle}>{n.body}</Text>}
                <Text style={styles.notifTime}>{new Date(n.created_at).toLocaleString('ar')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ============ TRANSACTIONS TAB ============
function TransactionsTab({ token }: { token: string }) {
  const api = useApi(token);
  const [txns, setTxns] = useState<DealerTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp = await api('/transactions');
        const d = await resp.json();
        if (resp.ok) setTxns(d);
      } catch {} finally { setLoading(false); }
    })();
  }, [api]);

  if (loading) return <LoadingState />;

  const typeLabels: Record<string, string> = {
    recharge: 'شحن',
    topup: 'إيداع رصيد',
    adjustment: 'تسوية',
    commission: 'عمولة',
  };
  const typeColors: Record<string, string> = {
    recharge: C.danger,
    topup: C.success,
    adjustment: C.warning,
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>كشف الحساب ({txns.length})</Text>
      {txns.length === 0 ? (
        <EmptyState icon={<Wallet size={32} color={C.textMuted} strokeWidth={1.5} />} text="لا توجد حركات" />
      ) : (
        txns.map((txn) => (
          <TransactionCard key={txn.id} txn={txn} />
        ))
      )}
    </View>
  );
}

// ============ SHARED COMPONENTS ============
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: color + '15' }]}>{icon}</View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function RequestCard({ req, compact }: { req: RechargeRequest; compact?: boolean }) {
  const statusColors: Record<string, string> = {
    pending: C.warning,
    approved: C.info,
    completed: C.success,
    rejected: C.danger,
  };
  const statusLabels: Record<string, string> = {
    pending: 'قيد الانتظار',
    approved: 'موافق عليه',
    completed: 'مكتمل',
    rejected: 'مرفوض',
  };
  const color = statusColors[req.status] || C.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }, compact && { padding: 10 }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{req.customer_name}</Text>
          {req.company_name && <Text style={styles.cardSubtitle}>🏢 {req.company_name} — {req.bundle_name}</Text>}
          {req.sim_number && <Text style={styles.cardSubtitle}>📱 {req.sim_number}</Text>}
          {req.duration && <Text style={styles.cardSubtitle}>⏱ {req.duration}</Text>}
          {req.contact_phone && <Text style={styles.cardSubtitle}>☎ {req.contact_phone}</Text>}
          {req.phone_number_assigned && req.status === 'completed' && (
            <Text style={[styles.cardSubtitle, { color: C.success }]}>✓ رقم مفعّل: {req.phone_number_assigned}</Text>
          )}
          <Text style={styles.notifTime}>{new Date(req.created_at).toLocaleString('ar')}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
          <Text style={[styles.statusText, { color }]}>{statusLabels[req.status] || req.status}</Text>
        </View>
      </View>

      {req.sale_price > 0 && (
        <View style={styles.reqPriceRow}>
          <Text style={styles.reqPriceLabel}>سعر البيع:</Text>
          <Text style={styles.reqPriceValue}>₪{Number(req.sale_price).toFixed(2)}</Text>
        </View>
      )}

      {req.owner_reply && (
        <View style={[styles.replyBox, { backgroundColor: C.info + '10', borderColor: C.info + '30' }]}>
          <MessageSquare size={14} color={C.info} strokeWidth={2} />
          <Text style={styles.replyText}>{req.owner_reply}</Text>
        </View>
      )}

      {req.sms_sent && (
        <View style={styles.smsBadge}>
          <Send size={12} color={C.success} strokeWidth={2} />
          <Text style={styles.smsBadgeText}>تم إرسال SMS</Text>
        </View>
      )}
    </View>
  );
}

function TransactionCard({ txn }: { txn: DealerTransaction }) {
  const typeLabels: Record<string, string> = {
    recharge: 'شحن',
    topup: 'إيداع',
    adjustment: 'تسوية',
    commission: 'عمولة',
  };
  const typeColors: Record<string, string> = {
    recharge: C.danger,
    topup: C.success,
    adjustment: C.warning,
    commission: C.primary,
  };
  const color = typeColors[txn.type] || C.textMuted;
  const isPositive = txn.type === 'topup' || txn.type === 'commission';

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.txnIcon, { backgroundColor: color + '20' }]}>
          <Wallet size={16} color={color} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{typeLabels[txn.type] || txn.type}</Text>
          {txn.description && <Text style={styles.cardSubtitle}>{txn.description}</Text>}
          <Text style={styles.notifTime}>{new Date(txn.created_at).toLocaleString('ar')}</Text>
        </View>
        <View style={styles.txnAmounts}>
          <Text style={[styles.txnAmount, { color: isPositive ? C.success : C.danger }]}>
            {isPositive ? '+' : '-'}₪{Number(txn.amount).toFixed(2)}
          </Text>
          <Text style={styles.txBalance}>الرصيد: ₪{Number(txn.balance_after).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={styles.loadingText}>جاري التحميل...</Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <AlertCircle size={40} color={C.danger} strokeWidth={1.5} />
      <Text style={styles.errorTitle}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <RefreshCw size={16} color="#fff" strokeWidth={2} />
        <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.emptyContainer}>
      {icon}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function ModalForm({ title, onClose, onSave, onSubmit, submitLabel = "حفظ", children }: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const handleSave = () => {
    if (onSubmit) onSubmit();
    else if (onSave) onSave();
  };
  return (
    <View style={styles.modalOverlay}>
      <View style={[styles.modalCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}><X size={20} color={C.textMuted} strokeWidth={2} /></TouchableOpacity>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={{ gap: 12 }}>
          {children}
        </ScrollView>
        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>إلغاء</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSave}>
            <Text style={styles.modalSaveText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function FormField({ label, value, onChangeText, keyboardType, multiline, placeholder }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        textAlign="right"
      />
    </View>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Login
  loginContent: { justifyContent: 'center', alignItems: 'center', minHeight: '100%', padding: 20 },
  loginCard: { width: '100%', maxWidth: 400, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 28, gap: 16 },
  logoContainer: { alignItems: 'center', gap: 8, marginBottom: 12 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  loginTitle: { fontSize: 24, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.text },
  loginSubtitle: { fontSize: 13, fontFamily: 'Cairo-Regular', color: C.textMuted },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 13, fontFamily: 'Cairo-SemiBold', color: C.textSecondary },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 4 },
  textInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: 'Cairo-Regular', color: C.text, textAlign: 'right' },
  fieldInput: { backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Cairo-Regular', color: C.text },
  fieldInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.danger + '15', borderRadius: 10, padding: 12 },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Cairo-Regular', color: C.danger },
  loginButton: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', color: '#fff' },

  // Dashboard
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  topBarLeft: { gap: 2 },
  topBarTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.text },
  topBarName: { fontSize: 12, fontFamily: 'Cairo-Regular', color: C.textMuted },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.success + '15', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  balanceText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.success },
  logoutBtn: { padding: 8 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: {},
  tabLabel: { fontSize: 13, fontFamily: 'Cairo-SemiBold', color: C.textSecondary },
  dashboardContent: { flex: 1 },
  dashboardContentPad: { padding: 16, maxWidth: 800, width: '100%', alignSelf: 'center', paddingBottom: 80 },
  tabContent: { gap: 10 },

  // Cards
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, minWidth: '47%', borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  summaryIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 12, fontFamily: 'Cairo-Regular', color: C.textMuted },
  summaryValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.text, marginBottom: 6 },
  tabHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold', color: '#fff' },

  // Customer card
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary + '20', alignItems: 'center', justifyContent: 'center' },
  customerAvatarText: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.primary },
  cardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.text },
  cardSubtitle: { fontSize: 12, fontFamily: 'Cairo-Regular', color: C.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontFamily: 'Cairo-SemiBold', color: C.textSecondary },

  // Filter
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterChip: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  filterText: { fontSize: 12, fontFamily: 'Cairo-SemiBold', color: C.textMuted },

  // Request
  reqPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  reqPriceLabel: { fontSize: 12, fontFamily: 'Cairo-Regular', color: C.textMuted },
  reqPriceValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.accent },
  replyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },
  replyText: { flex: 1, fontSize: 12, fontFamily: 'Cairo-Regular', color: C.info, lineHeight: 18 },
  smsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  smsBadgeText: { fontSize: 11, fontFamily: 'Cairo-Regular', color: C.success },

  // Offers
  offerGroup: { marginBottom: 16, gap: 6 },
  offerGroupTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.primary, marginBottom: 4 },
  offerCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  offerName: { fontSize: 14, fontWeight: '600', fontFamily: 'Cairo-SemiBold', color: C.text },
  offerDuration: { fontSize: 11, fontFamily: 'Cairo-Regular', color: C.textMuted, marginTop: 2 },
  offerPrices: { flexDirection: 'row', gap: 12 },
  offerActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  offerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  offerActionText: { fontSize: 11, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  priceCol: { alignItems: 'center' },
  priceLabel: { fontSize: 10, fontFamily: 'Cairo-Regular', color: C.textMuted },
  priceValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 2 },
  collectActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  collectBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  collectBtnText: { fontSize: 13, fontWeight: '700', fontFamily: 'Cairo-Bold', color: '#fff' },

  // SIM
  simIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6 },
  notifTime: { fontSize: 11, fontFamily: 'Cairo-Regular', color: C.textMuted, marginTop: 4 },

  // Transaction
  txnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txnAmounts: { alignItems: 'flex-end' },
  txnAmount: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  txBalance: { fontSize: 11, fontFamily: 'Cairo-Regular', color: C.textMuted, marginTop: 2 },

  // Loading / Error / Empty
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, fontFamily: 'Cairo-Regular', color: C.textMuted },
  errorContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  errorTitle: { fontSize: 16, fontFamily: 'Cairo-Bold', color: C.text, textAlign: 'center' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryBtnText: { fontSize: 13, fontFamily: 'Cairo-SemiBold', color: '#fff' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular', color: C.textMuted },

  // Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  modalCard: { width: '90%', maxWidth: 460, maxHeight: '85%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold', color: C.text },
  modalBody: { padding: 16 },
  modalFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontFamily: 'Cairo-SemiBold', color: C.textSecondary },
  modalSaveBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  modalSaveText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', color: '#fff' },

  // Select
  selectWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectChip: { borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  selectChipText: { fontSize: 13, fontFamily: 'Cairo-Regular', color: C.textSecondary },

  // Checkbox
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { flex: 1, fontSize: 13, fontFamily: 'Cairo-Regular', color: C.textSecondary, lineHeight: 20 },
});
