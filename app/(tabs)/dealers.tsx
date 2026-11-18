import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Users, Phone, Plus, Search, Trash2, Power, AlertCircle, Check,
  Clock, X, Wallet, Send, Tag, Smartphone, MessageSquare, ChevronLeft,
  CreditCard, Image as ImageIcon,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { BaseModal } from '@/components/BaseModal';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Linking, Platform } from 'react-native';

interface Dealer {
  id: string;
  owner_user_id: string;
  name: string;
  phone: string;
  balance: number;
  credit_limit: number;
  active: boolean;
  created_at: string;
}

interface RechargeRequest {
  id: string;
  dealer_id: string;
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
  completed_at: string | null;
  sms_sent: boolean;
  sms_message: string;
  created_at: string;
}

interface PricingEntry {
  id: string;
  owner_user_id: string;
  company_name: string;
  bundle_name: string;
  bundle_type: string;
  offer_type: string | null;
  dealer_price: number;
  sale_price: number;
  cost: number;
  duration_days: number;
  active: boolean;
}

interface PlasticSim {
  id: string;
  dealer_id: string;
  sim_number: string;
  company_name: string;
  bundle_name: string;
  status: string;
  assigned_phone: string;
}

interface EsimRequest {
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

interface CustomerDebt {
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

type Tab = 'dealers' | 'requests' | 'pricing' | 'sims' | 'esim' | 'debts';

export default function DealersManagementScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('requests');
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [sims, setSims] = useState<PlasticSim[]>([]);
  const [esimRequests, setEsimRequests] = useState<EsimRequest[]>([]);
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showDealerModal, setShowDealerModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [editingPricing, setEditingPricing] = useState<PricingEntry | null>(null);
  const [processingRequest, setProcessingRequest] = useState<RechargeRequest | null>(null);
  const [processingEsim, setProcessingEsim] = useState<EsimRequest | null>(null);
  const lastPendingIdRef = useRef<string | null>(null);

  // Poll for new pending recharge requests and show browser notifications
  useEffect(() => {
    if (!session?.user?.id) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('dealer_recharge_requests')
          .select('id, status, dealer_id, customer_name, company_name, bundle_name, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error || !data || data.length === 0) {
          if (data && data.length === 0) lastPendingIdRef.current = null;
          return;
        }

        const latest = data[0] as { id: string };
        if (lastPendingIdRef.current === null) {
          lastPendingIdRef.current = latest.id;
          return;
        }

        const newOnes: { id: string; customer_name: string; company_name: string; bundle_name: string }[] = [];
        for (const r of data as { id: string; customer_name: string; company_name: string; bundle_name: string }[]) {
          if (r.id === lastPendingIdRef.current) break;
          newOnes.push(r);
        }

        if (newOnes.length > 0) {
          lastPendingIdRef.current = latest.id;
          if (Notification.permission === 'granted') {
            for (const n of newOnes) {
              try {
                new Notification('طلب شحن جديد', {
                  body: `${n.customer_name} — ${n.company_name || ''} ${n.bundle_name || ''}`,
                  icon: '/favicon.png',
                });
              } catch {}
            }
          }
        }
      } catch {}
    };

    void poll();
    const interval = setInterval(() => void poll(), 20000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError('');
    try {
      const [dealersRes, reqRes, pricingRes, simsRes, esimRes, debtsRes] = await Promise.all([
        supabase.from('dealers').select('*').eq('owner_user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('dealer_recharge_requests').select('*, dealer_id').order('created_at', { ascending: false }).limit(100),
        supabase.from('dealer_pricing').select('*').eq('owner_user_id', session.user.id).order('company_name', { ascending: true }),
        supabase.from('dealer_plastic_sims').select('*').order('created_at', { ascending: false }),
        supabase.from('dealer_esim_requests').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('dealer_customer_debts').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      if (dealersRes.data) setDealers(dealersRes.data as Dealer[]);
      if (reqRes.data) {
        // Filter to only this owner's dealers' requests
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setRequests((reqRes.data as RechargeRequest[]).filter((r) => dealerIds.has(r.dealer_id)));
      }
      if (pricingRes.data) setPricing(pricingRes.data as PricingEntry[]);
      if (simsRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setSims((simsRes.data as PlasticSim[]).filter((s) => dealerIds.has(s.dealer_id)));
      }
      if (esimRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setEsimRequests((esimRes.data as EsimRequest[]).filter((e) => dealerIds.has(e.dealer_id)));
      }
      if (debtsRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setDebts((debtsRes.data as CustomerDebt[]).filter((db) => dealerIds.has(db.dealer_id)));
      }
    } catch {
      setError('تعذر تحميل البيانات');
    }
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const pendingEsimCount = esimRequests.filter((e) => e.status === 'pending').length;
  const totalDebtRemaining = debts.reduce((sum, d) => sum + (Number(d.amount) - Number(d.paid_amount)), 0);
  const filteredDealers = dealers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return d.name.toLowerCase().includes(q) || d.phone.includes(q);
  });

  const toggleDealerStatus = async (dealer: Dealer) => {
    const { error } = await supabase.from('dealers').update({ active: !dealer.active, updated_at: new Date().toISOString() }).eq('id', dealer.id);
    if (error) { setError('تعذر تغيير حالة الموزع'); return; }
    setDealers((prev) => prev.map((d) => d.id === dealer.id ? { ...d, active: !d.active } : d));
  };

  const deleteDealer = async (id: string) => {
    await supabase.from('dealers').delete().eq('id', id);
    setDealers((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDealerBalance = async (dealer: Dealer, amount: number, type: 'topup' | 'adjustment') => {
    const newBalance = type === 'topup' ? dealer.balance + amount : amount;
    const { error: updateError } = await supabase.from('dealers').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', dealer.id);
    if (updateError) { setError('تعذر تحديث الرصيد'); return; }

    await supabase.from('dealer_transactions').insert({
      dealer_id: dealer.id,
      type,
      amount: type === 'topup' ? amount : newBalance - dealer.balance,
      balance_after: newBalance,
      description: type === 'topup' ? 'إيداع رصيد' : 'تسوية يدوية',
    });

    setDealers((prev) => prev.map((d) => d.id === dealer.id ? { ...d, balance: newBalance } : d));
  };

  const processEsimRequest = async (req: EsimRequest, action: 'complete' | 'reject', extra?: { reply?: string; phoneAssigned?: string; barcodeUrl?: string }) => {
    const updates: any = { updated_at: new Date().toISOString() };
    if (action === 'reject') { updates.status = 'rejected'; updates.owner_reply = extra?.reply || ''; }
    if (action === 'complete') {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
      updates.phone_number_assigned = extra?.phoneAssigned || '';
      updates.barcode_image_url = extra?.barcodeUrl || null;
      updates.owner_reply = extra?.reply || '';
    }

    const { error: updateError } = await supabase.from('dealer_esim_requests').update(updates).eq('id', req.id);
    if (updateError) { setError('تعذر تحديث طلب eSIM'); return; }

    const notifTitle = action === 'complete' ? 'تم استكمال طلب eSIM' : 'تم رفض طلب eSIM';
    const notifBody = action === 'complete'
      ? `تم تفعيل شريحة إلكترونية للزبون ${req.customer_name}${extra?.phoneAssigned ? ' — الرقم: ' + extra.phoneAssigned : ''}${extra?.barcodeUrl ? ' — تم إرسال صورة الباركود' : ''}`
      : extra?.reply || `الزبون ${req.customer_name} — ${req.company_name || ''} ${req.bundle_name || ''}`;

    await supabase.from('dealer_notifications').insert({
      dealer_id: req.dealer_id,
      type: action === 'complete' ? 'esim_completed' : 'esim_rejected',
      title: notifTitle,
      body: notifBody,
    });

    if (action === 'complete') {
      const dealer = dealers.find((d) => d.id === req.dealer_id);
      if (dealer) {
        const newBalance = dealer.balance - Number(req.sale_price);
        await supabase.from('dealers').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', dealer.id);
        await supabase.from('dealer_transactions').insert({
          dealer_id: dealer.id,
          type: 'recharge',
          amount: Number(req.sale_price),
          balance_after: newBalance,
          description: `eSIM ${req.customer_name} — ${req.company_name || ''} ${req.bundle_name || ''}`,
        });
        setDealers((prev) => prev.map((d) => d.id === dealer.id ? { ...d, balance: newBalance } : d));
      }
    }

    setEsimRequests((prev) => prev.map((e) => e.id === req.id ? { ...e, ...updates } : e));
    setProcessingEsim(null);
  };

  const processRequest = async (req: RechargeRequest, action: 'approve' | 'reject' | 'complete', extra?: { reply?: string; phoneAssigned?: string }) => {
    const updates: any = { updated_at: new Date().toISOString() };
    if (action === 'approve') { updates.status = 'approved'; updates.owner_reply = extra?.reply || ''; }
    if (action === 'reject') { updates.status = 'rejected'; updates.owner_reply = extra?.reply || ''; }
    if (action === 'complete') {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
      updates.phone_number_assigned = extra?.phoneAssigned || '';
    }

    const { error: updateError } = await supabase.from('dealer_recharge_requests').update(updates).eq('id', req.id);
    if (updateError) { setError('تعذر تحديث الطلب'); return; }

    // Create notification for dealer
    const notifTitle = action === 'complete' ? 'تم استكمال عملية الشحن' : action === 'approve' ? 'تمت الموافقة على طلبك' : 'تم رفض طلبك';
    const notifBody = action === 'complete' && extra?.phoneAssigned
      ? `تم تفعيل الرقم: ${extra.phoneAssigned} للزبون ${req.customer_name}`
      : extra?.reply || `${req.customer_name} — ${req.company_name || ''} ${req.bundle_name || ''}`;

    await supabase.from('dealer_notifications').insert({
      dealer_id: req.dealer_id,
      type: action === 'complete' ? 'recharge_completed' : action === 'approve' ? 'request_approved' : 'request_rejected',
      title: notifTitle,
      body: notifBody,
      related_request_id: req.id,
    });

    // If completed with phone assigned, deduct from dealer balance and create transaction
    if (action === 'complete' && extra?.phoneAssigned) {
      const dealer = dealers.find((d) => d.id === req.dealer_id);
      if (dealer) {
        const newBalance = dealer.balance - Number(req.sale_price);
        await supabase.from('dealers').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', dealer.id);
        await supabase.from('dealer_transactions').insert({
          dealer_id: dealer.id,
          type: 'recharge',
          amount: Number(req.sale_price),
          balance_after: newBalance,
          description: `شحن ${req.customer_name} — ${req.phone_number_assigned || extra.phoneAssigned}`,
          related_request_id: req.id,
        });
        setDealers((prev) => prev.map((d) => d.id === dealer.id ? { ...d, balance: newBalance } : d));
      }
    }

    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, ...updates } : r));
    setProcessingRequest(null);
  };

  const deletePricing = async (id: string) => {
    await supabase.from('dealer_pricing').delete().eq('id', id);
    setPricing((prev) => prev.filter((p) => p.id !== id));
  };

  const deleteSim = async (id: string) => {
    await supabase.from('dealer_plastic_sims').delete().eq('id', id);
    setSims((prev) => prev.filter((s) => s.id !== id));
  };

  const transferSim = async (sim: PlasticSim, toDealerId: string) => {
    const { error } = await supabase.from('dealer_plastic_sims').update({ dealer_id: toDealerId, updated_at: new Date().toISOString() }).eq('id', sim.id);
    if (error) { setError('تعذر نقل الشريحة'); return; }
    setSims((prev) => prev.map((s) => s.id === sim.id ? { ...s, dealer_id: toDealerId } : s));
  };

  const dealerName = (id: string) => dealers.find((d) => d.id === id)?.name || 'غير معروف';

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'requests', label: 'الطلبات', icon: <Send size={18} color={tab === 'requests' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />, badge: pendingCount },
    { key: 'esim', label: 'eSIM', icon: <CreditCard size={18} color={tab === 'esim' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} />, badge: pendingEsimCount },
    { key: 'dealers', label: 'الموزعون', icon: <Users size={18} color={tab === 'dealers' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'pricing', label: 'التسعير', icon: <Tag size={18} color={tab === 'pricing' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'sims', label: 'الشرائح', icon: <Smartphone size={18} color={tab === 'sims' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'debts', label: 'الديون', icon: <Wallet size={18} color={tab === 'debts' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerInfo}>
          <Users size={24} color={colors.primary} strokeWidth={2} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>إدارة الموزعين</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>بوابة الموزع الذكية</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Users size={18} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{dealers.length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>موزع</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Clock size={18} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{pendingCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>طلب معلق</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Smartphone size={18} color={colors.info} strokeWidth={2} />
          <Text style={[styles.statValue, { color: colors.text }]}>{sims.filter(s => s.status === 'in_stock').length}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>شريحة متوفرة</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabBtn, t.key === tab ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
          >
            {t.icon}
            <Text style={[styles.tabText, { color: t.key === tab ? '#FFFFFF' : colors.textSecondary }]}>{t.label}</Text>
            {t.badge ? (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{t.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15' }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestRow req={item} dealerName={dealerName(item.dealer_id)} colors={colors} onProcess={() => setProcessingRequest(item)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<Send size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد طلبات" subtitle="ستظهر طلبات الشحن من الموزعين هنا" />
            </View>
          }
        />
      ) : tab === 'dealers' ? (
        <>
          <View style={styles.addActionArea}>
            <TouchableOpacity onPress={() => setShowDealerModal(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.addBtnText}>إضافة موزع</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={filteredDealers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <DealerRow dealer={item} colors={colors} onToggle={() => toggleDealerStatus(item)} onDelete={() => deleteDealer(item.id)} onTopUp={(amt) => updateDealerBalance(item, amt, 'topup')} />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyState icon={<Users size={32} color={colors.textMuted} strokeWidth={2} />} title="لا يوجد موزعون" subtitle="أضف موزعاً للبدء" />
              </View>
            }
          />
        </>
      ) : tab === 'esim' ? (
        <FlatList
          data={esimRequests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EsimRequestRow req={item} dealerName={dealerName(item.dealer_id)} colors={colors} onProcess={() => setProcessingEsim(item)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<CreditCard size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد طلبات eSIM" subtitle="ستظهر طلبات الشرائح الإلكترونية من الموزعين هنا" />
            </View>
          }
        />
      ) : tab === 'pricing' ? (
        <>
          <View style={styles.addActionArea}>
            <TouchableOpacity onPress={() => { setEditingPricing(null); setShowPricingModal(true); }} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.addBtnText}>إضافة تسعير</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={pricing}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PricingRow entry={item} colors={colors} onEdit={() => { setEditingPricing(item); setShowPricingModal(true); }} onDelete={() => deletePricing(item.id)} />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <EmptyState icon={<Tag size={32} color={colors.textMuted} strokeWidth={2} />} title="لا يوجد تسعير" subtitle="أضف أسعار الحزم للموزعين" />
              </View>
            }
          />
        </>
      ) : tab === 'debts' ? (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DebtRow debt={item} dealerName={dealerName(item.dealer_id)} colors={colors} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={debts.length > 0 ? (
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 }]}>
              <Wallet size={20} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>إجمالي الديون المتبقية</Text>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>₪{totalDebtRemaining.toFixed(2)}</Text>
            </View>
          ) : undefined}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<Wallet size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد ديون" subtitle="ستظهر ديون زبائن الموزعين هنا" />
            </View>
          }
        />
      ) : (
        <FlatList
          data={sims}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SimRow sim={item} dealerName={dealerName(item.dealer_id)} dealers={dealers} colors={colors} onTransfer={(toId) => transferSim(item, toId)} onDelete={() => deleteSim(item.id)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<Smartphone size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد شرائح" subtitle="أضف شرائح بلاستيكية للموزعين" />
            </View>
          }
        />
      )}

      {/* Modals */}
      <AddDealerModal visible={showDealerModal} onClose={() => setShowDealerModal(false)} onCreated={() => { setShowDealerModal(false); void fetchData(); }} colors={colors} ownerId={session?.user?.id || ''} />
      <PricingModal visible={showPricingModal} onClose={() => { setShowPricingModal(false); setEditingPricing(null); }} onSaved={() => { setShowPricingModal(false); setEditingPricing(null); void fetchData(); }} colors={colors} ownerId={session?.user?.id || ''} editing={editingPricing} />
      <ProcessRequestModal req={processingRequest} dealerName={processingRequest ? dealerName(processingRequest.dealer_id) : ''} colors={colors} onClose={() => setProcessingRequest(null)} onProcess={processRequest} />
      <ProcessEsimModal req={processingEsim} dealerName={processingEsim ? dealerName(processingEsim.dealer_id) : ''} colors={colors} onClose={() => setProcessingEsim(null)} onProcess={processEsimRequest} />
    </ScrollView>
  );
}

// ============ ROW COMPONENTS ============
function EsimRequestRow({ req, dealerName, colors, onProcess }: { req: EsimRequest; dealerName: string; colors: any; onProcess: () => void }) {
  const statusColors: Record<string, string> = { pending: colors.warning, completed: colors.success, rejected: colors.danger };
  const statusLabels: Record<string, string> = { pending: 'قيد الانتظار', completed: 'مكتمل', rejected: 'مرفوض' };
  const color = statusColors[req.status] || colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.simIcon, { backgroundColor: (color) + '20' }]}>
          <CreditCard size={18} color={color} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.reqTopRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{req.customer_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: color + '20' }]}>
              <Text style={[styles.statusText, { color }]}>{statusLabels[req.status] || req.status}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>الموزع: {dealerName}</Text>
          {req.company_name && <Text style={[styles.cardSub, { color: colors.textMuted }]}>🏢 {req.company_name} — {req.bundle_name}</Text>}
          {req.contact_phone && <Text style={[styles.cardSub, { color: colors.textMuted }]}>☎ {req.contact_phone}</Text>}
          {req.sale_price > 0 && <Text style={[styles.cardSub, { color: colors.accent }]}>💰 سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>}
          {req.phone_number_assigned && req.status === 'completed' && (
            <Text style={[styles.cardSub, { color: colors.success }]}>✓ رقم مفعّل: {req.phone_number_assigned}</Text>
          )}
          {req.barcode_image_url && req.status === 'completed' && (
            <Text style={[styles.cardSub, { color: colors.info }]}>📷 باركود: {req.barcode_image_url}</Text>
          )}
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{new Date(req.created_at).toLocaleString('ar')}</Text>
        </View>
      </View>

      {req.owner_reply && (
        <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
          <MessageSquare size={14} color={colors.info} strokeWidth={2} />
          <Text style={[styles.replyText, { color: colors.info }]}>{req.owner_reply}</Text>
        </View>
      )}

      {req.status === 'pending' && (
        <TouchableOpacity style={[styles.processBtn, { backgroundColor: colors.primary }]} onPress={onProcess}>
          <Text style={styles.processBtnText}>معالجة طلب eSIM</Text>
        </TouchableOpacity>
      )}
      {req.status === 'completed' && (
        <TouchableOpacity style={[styles.processBtn, { backgroundColor: colors.success + '20', borderColor: colors.success, borderWidth: 1 }]} onPress={onProcess}>
          <Text style={[styles.processBtnText, { color: colors.success }]}>عرض / تعديل</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function DebtRow({ debt, dealerName, colors }: { debt: CustomerDebt; dealerName: string; colors: any }) {
  const statusColors: Record<string, string> = { full: colors.success, partial: colors.warning, debt: colors.danger };
  const statusLabels: Record<string, string> = { full: 'مدفوع كامل', partial: 'مدفوع جزئي', debt: 'دين' };
  const remaining = Number(debt.amount) - Number(debt.paid_amount);
  const color = statusColors[debt.payment_status] || colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.simIcon, { backgroundColor: color + '20' }]}>
          <Wallet size={18} color={color} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.reqTopRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>₪{Number(debt.amount).toFixed(2)}</Text>
            <View style={[styles.statusPill, { backgroundColor: color + '20' }]}>
              <Text style={[styles.statusText, { color }]}>{statusLabels[debt.payment_status] || debt.payment_status}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>الموزع: {dealerName}</Text>
          {debt.description && <Text style={[styles.cardSub, { color: colors.textMuted }]}>{debt.description}</Text>}
          {debt.paid_amount > 0 && (
            <View style={styles.priceRow}>
              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: colors.textMuted }]}>المدفوع</Text>
                <Text style={[styles.priceValue, { color: colors.success }]}>₪{Number(debt.paid_amount).toFixed(2)}</Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: colors.textMuted }]}>المتبقي</Text>
                <Text style={[styles.priceValue, { color: colors.warning }]}>₪{remaining.toFixed(2)}</Text>
              </View>
            </View>
          )}
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{new Date(debt.created_at).toLocaleString('ar')}</Text>
        </View>
      </View>
    </View>
  );
}

function RequestRow({ req, dealerName, colors, onProcess }: { req: RechargeRequest; dealerName: string; colors: any; onProcess: () => void }) {
  const statusColors: Record<string, string> = { pending: colors.warning, approved: colors.info, completed: colors.success, rejected: colors.danger };
  const statusLabels: Record<string, string> = { pending: 'قيد الانتظار', approved: 'موافق عليه', completed: 'مكتمل', rejected: 'مرفوض' };
  const color = statusColors[req.status] || colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.reqTopRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{req.customer_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: color + '20' }]}>
              <Text style={[styles.statusText, { color }]}>{statusLabels[req.status] || req.status}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>الموزع: {dealerName}</Text>
          {req.company_name && <Text style={[styles.cardSub, { color: colors.textMuted }]}>🏢 {req.company_name} — {req.bundle_name}</Text>}
          {req.sim_number && <Text style={[styles.cardSub, { color: colors.textMuted }]}>📱 {req.sim_number}</Text>}
          {req.duration && <Text style={[styles.cardSub, { color: colors.textMuted }]}>⏱ {req.duration}</Text>}
          {req.contact_phone && <Text style={[styles.cardSub, { color: colors.textMuted }]}>☎ {req.contact_phone}</Text>}
          {req.sale_price > 0 && <Text style={[styles.cardSub, { color: colors.accent }]}>💰 سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>}
          {req.phone_number_assigned && req.status === 'completed' && (
            <Text style={[styles.cardSub, { color: colors.success }]}>✓ رقم مفعّل: {req.phone_number_assigned}</Text>
          )}
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{new Date(req.created_at).toLocaleString('ar')}</Text>
        </View>
      </View>

      {req.owner_reply && (
        <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
          <MessageSquare size={14} color={colors.info} strokeWidth={2} />
          <Text style={[styles.replyText, { color: colors.info }]}>{req.owner_reply}</Text>
        </View>
      )}

      {req.status === 'pending' && (
        <TouchableOpacity style={[styles.processBtn, { backgroundColor: colors.primary }]} onPress={onProcess}>
          <Text style={styles.processBtnText}>معالجة الطلب</Text>
        </TouchableOpacity>
      )}
      {(req.status === 'approved' || req.status === 'completed') && (
        <TouchableOpacity style={[styles.processBtn, { backgroundColor: colors.success + '20', borderColor: colors.success, borderWidth: 1 }]} onPress={onProcess}>
          <Text style={[styles.processBtnText, { color: colors.success }]}>عرض / تعديل</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function DealerRow({ dealer, colors, onToggle, onDelete, onTopUp }: { dealer: Dealer; colors: any; onToggle: () => void; onDelete: () => void; onTopUp: (amount: number) => void }) {
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState('');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: dealer.active ? colors.primary + '20' : colors.danger + '20' }]}>
          <Text style={[styles.avatarText, { color: dealer.active ? colors.primary : colors.danger }]}>{dealer.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{dealer.name}</Text>
          <View style={styles.phoneRow}>
            <Phone size={12} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.phoneText, { color: colors.textMuted }]}>{dealer.phone}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Wallet size={12} color={colors.success} strokeWidth={2} />
            <Text style={[styles.balanceText, { color: colors.success }]}>الرصيد: ₪{Number(dealer.balance).toFixed(2)}</Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: dealer.active ? colors.success + '20' : colors.danger + '20' }]}>
          <Text style={[styles.statusText, { color: dealer.active ? colors.success : colors.danger }]}>
            {dealer.active ? 'نشط' : 'معطل'}
          </Text>
        </View>
      </View>

      {showTopUp && (
        <View style={styles.topUpRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="المبلغ"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.topUpInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
          />
          <TouchableOpacity style={[styles.topUpBtn, { backgroundColor: colors.success }]} onPress={() => { const amt = parseFloat(amount); if (amt > 0) { onTopUp(amt); setAmount(''); setShowTopUp(false); } }}>
            <Check size={16} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success + '15' }]} onPress={() => setShowTopUp(!showTopUp)}>
          <Wallet size={15} color={colors.success} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.success }]}>شحن رصيد</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: dealer.active ? colors.danger + '15' : colors.success + '15' }]} onPress={onToggle}>
          <Power size={15} color={dealer.active ? colors.danger : colors.success} strokeWidth={2} />
          <Text style={[styles.actionText, { color: dealer.active ? colors.danger : colors.success }]}>{dealer.active ? 'تعطيل' : 'تفعيل'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]} onPress={onDelete}>
          <Trash2 size={15} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PricingRow({ entry, colors, onEdit, onDelete }: { entry: PricingEntry; colors: any; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.tagIcon, { backgroundColor: colors.primary + '20' }]}>
          <Tag size={18} color={colors.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{entry.company_name} — {entry.bundle_name}</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>{entry.duration_days} يوم — {entry.bundle_type === 'offer' ? 'عرض خاص' : 'شهري'}</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>سعر الموزع</Text>
              <Text style={[styles.priceValue, { color: colors.warning }]}>₪{entry.dealer_price}</Text>
            </View>
            <View style={styles.priceCol}>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>سعر البيع</Text>
              <Text style={[styles.priceValue, { color: colors.success }]}>₪{entry.sale_price}</Text>
            </View>
            <View style={styles.priceCol}>
              <Text style={[styles.priceLabel, { color: colors.textMuted }]}>التكلفة</Text>
              <Text style={[styles.priceValue, { color: colors.danger }]}>₪{entry.cost}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]} onPress={onEdit}>
          <Text style={[styles.actionText, { color: colors.primary }]}>تعديل</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]} onPress={onDelete}>
          <Trash2 size={15} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SimRow({ sim, dealerName, dealers, colors, onTransfer, onDelete }: { sim: PlasticSim; dealerName: string; dealers: Dealer[]; colors: any; onTransfer: (toId: string) => void; onDelete: () => void }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const statusColors: Record<string, string> = { in_stock: colors.success, assigned: colors.warning, used: colors.textMuted };
  const statusLabels: Record<string, string> = { in_stock: 'متوفرة', assigned: 'مخصصة', used: 'مستهلكة' };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.simIcon, { backgroundColor: (statusColors[sim.status] || colors.textMuted) + '20' }]}>
          <Smartphone size={18} color={statusColors[sim.status] || colors.textMuted} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{sim.sim_number}</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>🏢 {sim.company_name} — {dealerName}</Text>
          {sim.bundle_name && <Text style={[styles.cardSub, { color: colors.textMuted }]}>📦 {sim.bundle_name}</Text>}
          {sim.assigned_phone && <Text style={[styles.cardSub, { color: colors.textMuted }]}>📱 {sim.assigned_phone}</Text>}
        </View>
        <View style={[styles.statusPill, { backgroundColor: (statusColors[sim.status] || colors.textMuted) + '20' }]}>
          <Text style={[styles.statusText, { color: statusColors[sim.status] || colors.textMuted }]}>{statusLabels[sim.status] || sim.status}</Text>
        </View>
      </View>

      {showTransfer && (
        <View style={styles.transferList}>
          <Text style={[styles.transferLabel, { color: colors.textSecondary }]}>نقل إلى:</Text>
          {dealers.filter((d) => d.id !== sim.dealer_id && d.active).map((d) => (
            <TouchableOpacity key={d.id} style={[styles.transferOption, { borderColor: colors.border }]} onPress={() => { onTransfer(d.id); setShowTransfer(false); }}>
              <Text style={[styles.transferOptionText, { color: colors.text }]}>{d.name} — {d.phone}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.info + '15' }]} onPress={() => setShowTransfer(!showTransfer)}>
          <Text style={[styles.actionText, { color: colors.info }]}>نقل لموزع آخر</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]} onPress={onDelete}>
          <Trash2 size={15} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.danger }]}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============ MODALS ============
function AddDealerModal({ visible, onClose, onCreated, colors, ownerId }: { visible: boolean; onClose: () => void; onCreated: () => void; colors: any; ownerId: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError('جميع الحقول مطلوبة');
      return;
    }
    setCreating(true);
    setError('');

    // Hash password (same algorithm as edge function)
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'sahab-dealer-salt-v1');
    const hash = await crypto.subtle.digest('SHA-256', data);
    const passwordHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const { error: insertError } = await supabase.from('dealers').insert({
      owner_user_id: ownerId,
      name: name.trim(),
      phone: phone.replace(/\D/g, ''),
      password_hash: passwordHash,
      credit_limit: parseFloat(creditLimit) || 0,
    });

    if (insertError) {
      setError('تعذر إنشاء الموزع');
      setCreating(false);
      return;
    }
    setName(''); setPhone(''); setPassword(''); setCreditLimit('0');
    setCreating(false);
    onCreated();
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title="إضافة موزع جديد"
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
      <View style={{ gap: 10 }}>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>اسم الموزع</Text>
          <TextInput value={name} onChangeText={setName} placeholder="اسم الموزع" placeholderTextColor={colors.textMuted} style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="05XXXXXXXX" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>كلمة المرور</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textMuted} secureTextEntry style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سقف الدين (₪)</Text>
          <TextInput value={creditLimit} onChangeText={setCreditLimit} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
      </View>
    </BaseModal>
  );
}

function PricingModal({ visible, onClose, onSaved, colors, ownerId, editing }: { visible: boolean; onClose: () => void; onSaved: () => void; colors: any; ownerId: string; editing: PricingEntry | null }) {
  const [company, setCompany] = useState(editing?.company_name || '');
  const [bundle, setBundle] = useState(editing?.bundle_name || '');
  const [bundleType, setBundleType] = useState(editing?.bundle_type || 'monthly');
  const [dealerPrice, setDealerPrice] = useState(String(editing?.dealer_price || '0'));
  const [salePrice, setSalePrice] = useState(String(editing?.sale_price || '0'));
  const [cost, setCost] = useState(String(editing?.cost || '0'));
  const [duration, setDuration] = useState(String(editing?.duration_days || '30'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!company.trim() || !bundle.trim()) { setError('الشركة واسم الحزمة مطلوبة'); return; }
    setSaving(true);
    setError('');

    const body = {
      owner_user_id: ownerId,
      company_name: company.trim(),
      bundle_name: bundle.trim(),
      bundle_type: bundleType,
      dealer_price: parseFloat(dealerPrice) || 0,
      sale_price: parseFloat(salePrice) || 0,
      cost: parseFloat(cost) || 0,
      duration_days: parseInt(duration) || 30,
      active: true,
    };

    if (editing) {
      const { error: updateError } = await supabase.from('dealer_pricing').update({ ...body, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (updateError) { setError('تعذر التحديث'); setSaving(false); return; }
    } else {
      const { error: insertError } = await supabase.from('dealer_pricing').insert(body);
      if (insertError) { setError('تعذر الإضافة'); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <BaseModal visible={visible} onClose={onClose} title={editing ? 'تعديل التسعير' : 'إضافة تسعير جديد'}
      footer={
        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>حفظ</Text>}
        </TouchableOpacity>
      }
    >
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', marginBottom: 12 }]}>
          <AlertCircle size={18} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>الشركة</Text>
          <TextInput value={company} onChangeText={setCompany} placeholder="سيلكوم، بيلفون..." style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>اسم الحزمة</Text>
          <TextInput value={bundle} onChangeText={setBundle} placeholder="حزمة 29..." style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>
        <View style={styles.planSelector}>
          {(['monthly', 'offer'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setBundleType(t)} style={[styles.planBtn, bundleType === t ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={[styles.planText, { color: bundleType === t ? '#FFFFFF' : colors.textSecondary }]}>{t === 'monthly' ? 'شهري' : 'عرض'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.priceRowModal}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سعر الموزع</Text>
            <TextInput value={dealerPrice} onChangeText={setDealerPrice} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>سعر البيع</Text>
            <TextInput value={salePrice} onChangeText={setSalePrice} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
        </View>
        <View style={styles.priceRowModal}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>التكلفة</Text>
            <TextInput value={cost} onChangeText={setCost} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>المدة (أيام)</Text>
            <TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
          </View>
        </View>
      </View>
    </BaseModal>
  );
}

function ProcessRequestModal({ req, dealerName, colors, onClose, onProcess }: { req: RechargeRequest | null; dealerName: string; colors: any; onClose: () => void; onProcess: (req: RechargeRequest, action: 'approve' | 'reject' | 'complete', extra?: { reply?: string; phoneAssigned?: string }) => void }) {
  const [action, setAction] = useState<'approve' | 'reject' | 'complete'>('approve');
  const [reply, setReply] = useState('');
  const [phoneAssigned, setPhoneAssigned] = useState('');

  useEffect(() => {
    if (req) {
      setReply(req.owner_reply || '');
      setPhoneAssigned(req.phone_number_assigned || '');
      setAction(req.status === 'completed' ? 'complete' : req.status === 'approved' ? 'complete' : 'approve');
    }
  }, [req]);

  if (!req) return null;

  return (
    <BaseModal visible={req !== null} onClose={onClose} title={`معالجة طلب: ${req.customer_name}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {req.status === 'pending' && (
            <TouchableOpacity onPress={() => onProcess(req, 'reject', { reply })} style={[styles.submitBtn, { backgroundColor: colors.danger, flex: 1 }]}>
              <Text style={styles.submitText}>رفض</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onProcess(req, action, { reply, phoneAssigned })} style={[styles.submitBtn, { backgroundColor: colors.success, flex: 1 }]}>
            <Text style={styles.submitText}>{action === 'complete' ? 'استكمال' : 'موافقة'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <View style={[styles.reqDetailBox, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.reqDetailText, { color: colors.text }]}>الموزع: {dealerName}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الشركة: {req.company_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الحزمة: {req.bundle_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>المدة: {req.duration}</Text>
          {req.sim_number && <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>رقم الشريحة: {req.sim_number}</Text>}
          <Text style={[styles.reqDetailText, { color: colors.accent }]}>سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>
        </View>

        {req.sms_message && (
          <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
            <MessageSquare size={14} color={colors.info} strokeWidth={2} />
            <Text style={[styles.replyText, { color: colors.info }]}>رسالة SMS: {req.sms_message}</Text>
          </View>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف المفعّل (لاستكمال العملية)</Text>
          <TextInput value={phoneAssigned} onChangeText={setPhoneAssigned} placeholder="رقم الهاتف الجديد" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رد على الموزع</Text>
          <TextInput value={reply} onChangeText={setReply} placeholder="مثال: اعتذر عن الشحن الآن لعدم توفر رصيد، سيتم شحنه غداً" placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
        </View>
      </View>
    </BaseModal>
  );
}

function ProcessEsimModal({ req, dealerName, colors, onClose, onProcess }: { req: EsimRequest | null; dealerName: string; colors: any; onClose: () => void; onProcess: (req: EsimRequest, action: 'complete' | 'reject', extra?: { reply?: string; phoneAssigned?: string; barcodeUrl?: string }) => void }) {
  const [phoneAssigned, setPhoneAssigned] = useState('');
  const [barcodeUrl, setBarcodeUrl] = useState('');
  const [reply, setReply] = useState('');

  useEffect(() => {
    if (req) {
      setPhoneAssigned(req.phone_number_assigned || '');
      setBarcodeUrl(req.barcode_image_url || '');
      setReply(req.owner_reply || '');
    }
  }, [req]);

  if (!req) return null;

  return (
    <BaseModal visible={req !== null} onClose={onClose} title={`معالجة eSIM: ${req.customer_name}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {req.status === 'pending' && (
            <TouchableOpacity onPress={() => onProcess(req, 'reject', { reply })} style={[styles.submitBtn, { backgroundColor: colors.danger, flex: 1 }]}>
              <Text style={styles.submitText}>رفض</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onProcess(req, 'complete', { reply, phoneAssigned, barcodeUrl })} style={[styles.submitBtn, { backgroundColor: colors.success, flex: 1 }]}>
            <Text style={styles.submitText}>{req.status === 'completed' ? 'تحديث' : 'استكمال'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <View style={[styles.reqDetailBox, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.reqDetailText, { color: colors.text }]}>الموزع: {dealerName}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الشركة: {req.company_name}</Text>
          <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>الحزمة: {req.bundle_name}</Text>
          {req.contact_phone && <Text style={[styles.reqDetailText, { color: colors.textMuted }]}>رقم التواصل: {req.contact_phone}</Text>}
          <Text style={[styles.reqDetailText, { color: colors.accent }]}>سعر البيع: ₪{Number(req.sale_price).toFixed(2)}</Text>
        </View>

        {req.barcode_image_url && req.status === 'completed' && (
          <View style={[styles.replyBox, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
            <ImageIcon size={14} color={colors.info} strokeWidth={2} />
            <Text style={[styles.replyText, { color: colors.info }]}>باركود حالي: {req.barcode_image_url}</Text>
          </View>
        )}

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رقم الهاتف المفعّل</Text>
          <TextInput value={phoneAssigned} onChangeText={setPhoneAssigned} placeholder="رقم الهاتف الجديد" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رابط صورة الباركود</Text>
          <TextInput value={barcodeUrl} onChangeText={setBarcodeUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} keyboardType="url" autoCapitalize="none" style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>رد على الموزع</Text>
          <TextInput value={reply} onChangeText={setReply} placeholder="رد اختياري..." placeholderTextColor={colors.textMuted} multiline style={[styles.textInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 60 }]} />
        </View>
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
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  statDivider: { width: 1, height: 32 },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, position: 'relative' },
  tabText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginHorizontal: 16, marginBottom: 8 },
  errorText: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyWrap: { paddingVertical: 40 },
  addActionArea: { paddingHorizontal: 16, paddingBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  addBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  card: { borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Cairo-Bold', flex: 1 },
  cardSub: { fontSize: 12, marginTop: 2, fontFamily: 'Cairo-Regular' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  phoneText: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  balanceText: { fontSize: 12, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  timeText: { fontSize: 11, marginTop: 4, fontFamily: 'Cairo-Regular' },
  reqTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  replyText: { flex: 1, fontSize: 12, fontFamily: 'Cairo-Regular', lineHeight: 18 },
  processBtn: { paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  processBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, flex: 1, justifyContent: 'center' },
  actionText: { fontSize: 11, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  tagIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  priceCol: { alignItems: 'flex-start' },
  priceLabel: { fontSize: 10, fontFamily: 'Cairo-Regular' },
  priceValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 2 },
  simIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  transferList: { gap: 6, marginTop: 8 },
  transferLabel: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  transferOption: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  transferOptionText: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  topUpRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  topUpInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: 'Cairo-Regular' },
  topUpBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Cairo-SemiBold' },
  textInput: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, fontSize: 15, fontFamily: 'Cairo-Regular' },
  submitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  planSelector: { flexDirection: 'row', gap: 8 },
  planBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  planText: { fontSize: 14, fontWeight: '700', fontFamily: 'Cairo-SemiBold' },
  priceRowModal: { flexDirection: 'row', gap: 8 },
  reqDetailBox: { borderRadius: 10, padding: 12, gap: 4 },
  reqDetailText: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'transparent' },
  summaryLabel: { flex: 1, fontSize: 13, fontFamily: 'Cairo-Regular' },
  summaryValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Cairo-Bold' },
});
