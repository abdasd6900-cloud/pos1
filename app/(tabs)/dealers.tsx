import { StyleSheet, View, Text, ScrollView, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Users, Plus, Send, Tag, Smartphone, AlertCircle, Clock,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { storage } from '@/lib/storage';
import { enqueueSmsOutbox } from '@/lib/sms-gateway';
import type { Bundle, AgentBundle } from '@/types';
import { EmptyState } from '@/components/EmptyState';
import { Platform } from 'react-native';
import { dealerStyles as styles } from '@/components/dealers/styles';
import type { Dealer, RechargeRequest, PricingEntry, PlasticSim, EsimRequest, Tab } from '@/components/dealers/types';
import { EsimRequestRow, RequestRow, DealerRow, PricingRow, SimRow } from '@/components/dealers/DealerRows';
import { AddDealerModal, PricingModal, ProcessRequestModal, ProcessEsimModal } from '@/components/dealers/DealerModals';

export default function DealersManagementScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('requests');
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [requests, setRequests] = useState<RechargeRequest[]>([]);
  const [pricing, setPricing] = useState<PricingEntry[]>([]);
  const [sims, setSims] = useState<PlasticSim[]>([]);
  const [esimRequests, setEsimRequests] = useState<EsimRequest[]>([]);
  const [dealerCustomers, setDealerCustomers] = useState<{ dealer_id: string; status: string }[]>([]);
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

  const autoSyncPricing = useCallback(async (ownerId: string, existingPricing: PricingEntry[]) => {
    const [bundles, agentBundles] = await Promise.all([
      storage.getBundles(),
      storage.getAgentBundles(),
    ]);

    type InvRow = { company_name: string; bundle_name: string; bundle_type: string; dealer_price: number; cost: number; duration_days: number };
    const invRows: InvRow[] = [];

    for (const b of bundles as Bundle[]) {
      if (!b.active) continue;
      invRows.push({
        company_name: b.companyName,
        bundle_name: b.name,
        bundle_type: 'monthly',
        dealer_price: b.price,
        cost: b.cost,
        duration_days: b.durationDays,
      });
    }

    for (const ab of agentBundles as AgentBundle[]) {
      if (!ab.active) continue;
      const monthPrice = ab.prices?.['month'] ?? ab.prices?.['1_month'] ?? Object.values(ab.prices)[0] ?? 0;
      if (monthPrice <= 0) continue;
      invRows.push({
        company_name: ab.companyName,
        bundle_name: ab.bundleName,
        bundle_type: ab.bundleType || 'offer',
        dealer_price: monthPrice,
        cost: ab.cost,
        duration_days: 30,
      });
    }

    const existingMap = new Map(existingPricing.map((p) => [`${p.company_name}|${p.bundle_name}`, p]));

    const toInsert = invRows.filter((r) => !existingMap.has(`${r.company_name}|${r.bundle_name}`));
    const toDelete = existingPricing.filter((p) => !invRows.some((r) => r.company_name === p.company_name && r.bundle_name === p.bundle_name));
    const toUpdate = invRows.filter((r) => {
      const ex = existingMap.get(`${r.company_name}|${r.bundle_name}`);
      if (!ex) return false;
      return ex.dealer_price !== r.dealer_price || ex.cost !== r.cost || ex.duration_days !== r.duration_days || ex.bundle_type !== r.bundle_type;
    });

    const changed = toInsert.length > 0 || toDelete.length > 0 || toUpdate.length > 0;
    if (changed) {
      if (toInsert.length > 0) {
        await supabase.from('dealer_pricing').insert(toInsert.map((r) => ({ owner_user_id: ownerId, ...r, sale_price: 0, active: true })));
      }
      for (const p of toDelete) {
        await supabase.from('dealer_pricing').delete().eq('id', p.id);
      }
      for (const r of toUpdate) {
        const ex = existingMap.get(`${r.company_name}|${r.bundle_name}`)!;
        await supabase.from('dealer_pricing').update({ dealer_price: r.dealer_price, cost: r.cost, duration_days: r.duration_days, bundle_type: r.bundle_type, updated_at: new Date().toISOString() }).eq('id', ex.id);
      }
    }
    return changed;
  }, []);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError('');
    try {
      let pricingRes = await supabase.from('dealer_pricing').select('*').eq('owner_user_id', session.user.id).order('company_name', { ascending: false });
      let existingPricing = (pricingRes.data || []) as PricingEntry[];

      const changed = await autoSyncPricing(session.user.id, existingPricing);

      if (changed) {
        pricingRes = await supabase.from('dealer_pricing').select('*').eq('owner_user_id', session.user.id).order('company_name', { ascending: false });
        existingPricing = (pricingRes.data || []) as PricingEntry[];
      }

      const [dealersRes, reqRes, simsRes, esimRes, customersRes] = await Promise.all([
        supabase.from('dealers').select('*').eq('owner_user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('dealer_recharge_requests').select('*, dealer_id').order('created_at', { ascending: false }).limit(100),
        supabase.from('dealer_plastic_sims').select('*').order('created_at', { ascending: false }),
        supabase.from('dealer_esim_requests').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('dealer_customers').select('dealer_id, status').order('created_at', { ascending: false }).limit(500),
      ]);
      if (customersRes.data) setDealerCustomers(customersRes.data as { dealer_id: string; status: string }[]);

      if (dealersRes.data) setDealers(dealersRes.data as Dealer[]);
      if (reqRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setRequests((reqRes.data as RechargeRequest[]).filter((r) => dealerIds.has(r.dealer_id)));
      }
      setPricing(existingPricing);
      if (simsRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setSims((simsRes.data as PlasticSim[]).filter((s) => dealerIds.has(s.dealer_id)));
      }
      if (esimRes.data) {
        const dealerIds = new Set((dealersRes.data || []).map((d) => d.id));
        setEsimRequests((esimRes.data as EsimRequest[]).filter((e) => dealerIds.has(e.dealer_id)));
      }
    } catch {
      setError('تعذر تحميل البيانات');
    }
    setLoading(false);
  }, [session?.user?.id, autoSyncPricing]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length + esimRequests.filter((e) => e.status === 'pending').length;
  const getDealerNumbersCount = (dealerId: string) => {
    const dealerNums = dealerCustomers.filter((c) => c.dealer_id === dealerId);
    const active = dealerNums.filter((c) => c.status === 'active').length;
    const inactive = dealerNums.filter((c) => c.status !== 'active').length;
    return { active, inactive, total: dealerNums.length };
  };
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

      if (extra?.phoneAssigned && req.contact_phone) {
        const welcomeMsg = `أهلا وسهلا بكم في العبادله تيلكوم\nتم تفعيل الشريحه الخاصه بكم على الرقم : "${extra.phoneAssigned}"\nفي حال تعرض للحظر  يرجى ارسال رقمك الى الرقم 0599991274 باللغه الانجليزيه دون أي اضافات.\nشكرا لثقتكم بنا`;
        void enqueueSmsOutbox(req.contact_phone, welcomeMsg);
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

      if (extra?.phoneAssigned && req.contact_phone) {
        const welcomeMsg = `أهلا وسهلا بكم في العبادله تيلكوم\nتم تفعيل الشريحه الخاصه بكم على الرقم : "${extra.phoneAssigned}"\nفي حال تعرض للحظر  يرجى ارسال رقمك الى الرقم 0599991274 باللغه الانجليزيه دون أي اضافات.\nشكرا لثقتكم بنا`;
        void enqueueSmsOutbox(req.contact_phone, welcomeMsg);
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
    { key: 'dealers', label: 'الموزعون', icon: <Users size={18} color={tab === 'dealers' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'pricing', label: 'التسعير', icon: <Tag size={18} color={tab === 'pricing' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
    { key: 'sims', label: 'الشرائح', icon: <Smartphone size={18} color={tab === 'sims' ? '#FFFFFF' : colors.textSecondary} strokeWidth={2} /> },
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
          data={[
            ...esimRequests.map((e) => ({ type: 'esim' as const, item: e, sortDate: e.created_at })),
            ...requests.map((r) => ({ type: 'recharge' as const, item: r, sortDate: r.created_at })),
          ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())}
          keyExtractor={(entry) => entry.item.id}
          renderItem={({ item: entry }) => entry.type === 'esim'
            ? <EsimRequestRow req={entry.item as EsimRequest} dealerName={dealerName((entry.item as EsimRequest).dealer_id)} colors={colors} onProcess={() => setProcessingEsim(entry.item as EsimRequest)} />
            : <RequestRow req={entry.item as RechargeRequest} dealerName={dealerName((entry.item as RechargeRequest).dealer_id)} colors={colors} onProcess={() => setProcessingRequest(entry.item as RechargeRequest)} />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={<Send size={32} color={colors.textMuted} strokeWidth={2} />} title="لا توجد طلبات" subtitle="ستظهر طلبات الشحن و eSIM من الموزعين هنا" />
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
              <DealerRow dealer={item} colors={colors} numbersCount={getDealerNumbersCount(item.id)} onToggle={() => toggleDealerStatus(item)} onDelete={() => deleteDealer(item.id)} onTopUp={(amt) => updateDealerBalance(item, amt, 'topup')} />
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
      ) : tab === 'pricing' ? (
        <>
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
                <EmptyState icon={<Tag size={32} color={colors.textMuted} strokeWidth={2} />} title="لا يوجد تسعير" subtitle="سيتم مزامنة الحزم من المخزون تلقائياً" />
              </View>
            }
          />
        </>
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
