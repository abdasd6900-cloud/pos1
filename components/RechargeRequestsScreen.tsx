import { StyleSheet, View, Text, TouchableOpacity, FlatList, Linking } from 'react-native';
import { useState, useMemo } from 'react';
import { BatteryLow, Send, MessageCircle, Check, X, RefreshCw, Phone, CheckCircle2, XCircle } from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatCurrency, formatDateTime, timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { sendSmsAuto, sendWhatsappAuto } from '@/lib/sms-gateway';
import type { RechargeRequest, SubAgent } from '@/types';

type FilterTab = 'all' | 'pending' | 'sent' | 'confirmed';

export function RechargeRequestsScreen() {
  const {
    rechargeRequests, subAgents, telecomSuppliers,
    addRechargeRequest, updateRechargeRequest, confirmRechargeRequest,
    deleteRechargeRequest, settings,
  } = useApp();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [confirmTarget, setConfirmTarget] = useState<RechargeRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<RechargeRequest | null>(null);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
  const [batchSending, setBatchSending] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return rechargeRequests;
    return rechargeRequests.filter((r) => r.status === filter);
  }, [rechargeRequests, filter]);

  const pendingCount = rechargeRequests.filter((r) => r.status === 'pending' || r.status === 'sent').length;
  const confirmedCount = rechargeRequests.filter((r) => r.status === 'confirmed').length;
  const totalAmount = rechargeRequests.filter((r) => r.status === 'pending' || r.status === 'sent').reduce((s, r) => s + r.amount, 0);

  const agentsBelowThreshold = useMemo(() => {
    return subAgents.filter((a) => a.active && a.rechargeEnabled && a.balance <= a.rechargeThreshold);
  }, [subAgents]);

  const handleSendSms = async (req: RechargeRequest) => {
    setSendingSmsId(req.id);
    const { success } = await sendSmsAuto(req.supplierPhone, req.message);
    updateRechargeRequest(req.id, {
      status: success ? 'sent' : 'pending',
      smsSent: success,
      sentAt: success ? Date.now() : req.sentAt,
    });
    setSendingSmsId(null);
  };

  const handleBatchSms = async () => {
    const pending = rechargeRequests.filter((r) => r.status === 'pending');
    if (pending.length === 0) return;
    setBatchSending(true);
    setBatchResult(null);
    let sent = 0;
    let failed = 0;
    for (const req of pending) {
      const { success } = await sendSmsAuto(req.supplierPhone, req.message);
      if (success) {
        sent++;
        updateRechargeRequest(req.id, { smsSent: true, status: 'sent', sentAt: Date.now() });
      } else {
        failed++;
      }
    }
    setBatchSending(false);
    setBatchResult(`تم إرسال ${sent} رسالة SMS${failed > 0 ? `، فشل ${failed}` : ''}`);
    setTimeout(() => setBatchResult(null), 4000);
  };

  const handleSendWhatsApp = async (req: RechargeRequest) => {
    setSendingWaId(req.id);
    const result = await sendWhatsappAuto(req.supplierPhone, req.message);
    if (result.success) {
      updateRechargeRequest(req.id, { whatsappSent: true, status: 'sent', sentAt: Date.now() });
    }
    setSendingWaId(null);
  };

  const handleManualCreate = (agent: SubAgent) => {
    const supplier = agent.supplierId ? telecomSuppliers.find((s) => s.id === agent.supplierId) : null;
    const amount = agent.rechargeAmount > 0 ? agent.rechargeAmount : 100;
    const msg = `مرحباً ${supplier?.name ?? ''}،\nالوكيل ${agent.name} وصل رصيده إلى ${agent.balance.toFixed(2)}.\nنرجو شحن الوكالة بمبلغ ${amount.toFixed(2)}.\nشكراً لكم`;
    addRechargeRequest({
      subAgentId: agent.id,
      subAgentName: agent.name,
      supplierId: agent.supplierId,
      supplierName: supplier?.name ?? '',
      supplierPhone: agent.supplierPhone,
      amount,
      message: msg,
      status: 'pending',
      smsSent: false,
      whatsappSent: false,
      sentAt: null,
      confirmedAt: null,
    });
  };

  const statusColor = (status: string) => {
    if (status === 'confirmed') return colors.success;
    if (status === 'sent') return colors.info;
    if (status === 'cancelled') return colors.textMuted;
    return colors.warning;
  };

  const statusLabel = (status: string) => {
    if (status === 'confirmed') return 'تم التأكيد';
    if (status === 'sent') return 'تم الإرسال';
    if (status === 'cancelled') return 'ملغي';
    return 'بانتظار الإرسال';
  };

  const renderItem = ({ item }: { item: RechargeRequest }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.agentName, { color: colors.text }]} numberOfLines={1}>{item.subAgentName}</Text>
          <Text style={[styles.supplierName, { color: colors.textMuted }]} numberOfLines={1}>
            المورد: {item.supplierName || 'غير محدد'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={[styles.amountRow, { borderTopColor: colors.border }]}>
        <View>
          <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>المبلغ المطلوب</Text>
          <Text style={[styles.amountValue, { color: colors.primary }]}>
            {formatCurrency(item.amount, settings.currency)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.dateLabel, { color: colors.textMuted }]}>{timeAgo(item.createdAt)}</Text>
          {item.sentAt ? (
            <Text style={[styles.dateLabel, { color: colors.textMuted }]}>إرسال: {formatDateTime(item.sentAt)}</Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.messageBox, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.messageText, { color: colors.textSecondary }]}>{item.message}</Text>
      </View>

      <View style={styles.phoneRow}>
        <Phone size={14} color={colors.textMuted} strokeWidth={2} />
        <Text style={[styles.phoneText, { color: colors.textMuted }]}>{item.supplierPhone}</Text>
      </View>

      {(item.status === 'pending' || item.status === 'sent') ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => handleSendSms(item)}
            disabled={sendingSmsId === item.id}
            style={[styles.actionBtn, { backgroundColor: colors.info + '15', opacity: sendingSmsId === item.id ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            {sendingSmsId === item.id ? (
              <RefreshCw size={16} color={colors.info} strokeWidth={2} />
            ) : (
              <Send size={16} color={colors.info} strokeWidth={2} />
            )}
            <Text style={[styles.actionBtnText, { color: colors.info }]}>
              {sendingSmsId === item.id ? 'جارٍ...' : 'SMS'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleSendWhatsApp(item)}
            disabled={sendingWaId === item.id}
            style={[styles.actionBtn, { backgroundColor: colors.success + '15', opacity: sendingWaId === item.id ? 0.5 : 1 }]}
            activeOpacity={0.7}
          >
            {sendingWaId === item.id ? (
              <RefreshCw size={16} color={colors.success} strokeWidth={2} />
            ) : (
              <MessageCircle size={16} color={colors.success} strokeWidth={2} />
            )}
            <Text style={[styles.actionBtnText, { color: colors.success }]}>
              {sendingWaId === item.id ? 'جارٍ...' : 'واتساب'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfirmTarget(item)}
            style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]}
            activeOpacity={0.7}
          >
            <Check size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>تأكيد الشحن</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCancelTarget(item)}
            style={[styles.actionBtn, { backgroundColor: colors.danger + '15' }]}
            activeOpacity={0.7}
          >
            <X size={16} color={colors.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      ) : item.status === 'confirmed' ? (
        <View style={[styles.confirmedBadge, { backgroundColor: colors.success + '15' }]}>
          <CheckCircle2 size={16} color={colors.success} strokeWidth={2} />
          <Text style={[styles.confirmedText, { color: colors.success }]}>
            تم تأكيد الشحن وإضافة الرصيد كدين للمورد
          </Text>
        </View>
      ) : (
        <View style={[styles.confirmedBadge, { backgroundColor: colors.textMuted + '15' }]}>
          <XCircle size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.confirmedText, { color: colors.textMuted }]}>تم إلغاء الطلب</Text>
        </View>
      )}
    </View>
  );

  const filters: { key: FilterTab; label: string }[] = [
    { key: 'pending', label: 'بانتظار' },
    { key: 'sent', label: 'مرسلة' },
    { key: 'confirmed', label: 'مؤكدة' },
    { key: 'all', label: 'الكل' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.statsBar, { backgroundColor: colors.surface }]}>
        <View style={styles.miniStat}>
          <BatteryLow size={18} color={colors.warning} strokeWidth={2} />
          <View>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>طلبات نشطة</Text>
            <Text style={[styles.miniValue, { color: colors.warning }]}>{pendingCount}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.miniStat}>
          <CheckCircle2 size={18} color={colors.success} strokeWidth={2} />
          <View>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>مؤكدة</Text>
            <Text style={[styles.miniValue, { color: colors.success }]}>{confirmedCount}</Text>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.miniStat}>
          <RefreshCw size={18} color={colors.primary} strokeWidth={2} />
          <View>
            <Text style={[styles.miniLabel, { color: colors.textMuted }]}>إجمالي الطلبات</Text>
            <Text style={[styles.miniValue, { color: colors.primary }]}>{formatCurrency(totalAmount, settings.currency)}</Text>
          </View>
        </View>
      </View>

      {batchResult && (
        <View style={[styles.alertBar, { backgroundColor: colors.success + '15' }]}>
          <Check size={16} color={colors.success} strokeWidth={2} />
          <Text style={[styles.alertText, { color: colors.success }]}>{batchResult}</Text>
        </View>
      )}

      {rechargeRequests.filter((r) => r.status === 'pending').length > 1 && filter === 'pending' ? (
        <View style={[styles.alertBar, { backgroundColor: colors.info + '15' }]}>
          <Send size={16} color={colors.info} strokeWidth={2} />
          <Text style={[styles.alertText, { color: colors.info }]}>
            إرسال كل الطلبات ({rechargeRequests.filter((r) => r.status === 'pending').length}) عبر SMS
          </Text>
          <TouchableOpacity
            onPress={handleBatchSms}
            disabled={batchSending}
            style={[styles.alertBtn, { backgroundColor: colors.info, opacity: batchSending ? 0.6 : 1 }]}
            activeOpacity={0.7}
          >
            <Text style={styles.alertBtnText}>{batchSending ? 'جارٍ...' : 'إرسال الكل'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {agentsBelowThreshold.length > 0 && filter === 'pending' ? (
        <View style={[styles.alertBar, { backgroundColor: colors.warning + '15' }]}>
          <BatteryLow size={16} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.alertText, { color: colors.warning }]}>
            {agentsBelowThreshold.length} وكيل وصل للحد الأدنى
          </Text>
          <TouchableOpacity
            onPress={() => agentsBelowThreshold.forEach(handleManualCreate)}
            style={[styles.alertBtn, { backgroundColor: colors.warning }]}
            activeOpacity={0.7}
          >
            <Text style={styles.alertBtnText}>إنشاء طلبات</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.filterBtn, filter === f.key ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceAlt }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, { color: filter === f.key ? '#FFFFFF' : colors.textSecondary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<BatteryLow size={32} color={colors.primary} strokeWidth={2} />}
            title="لا توجد طلبات شحن"
            subtitle={filter === 'pending' ? 'سيتم إنشاء طلبات شحن تلقائياً عند وصول رصيد الوكلاء للحد الأدنى' : 'لا توجد طلبات في هذه الفئة'}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80, gap: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ConfirmDialog
        visible={confirmTarget !== null}
        title="تأكيد استلام الشحن"
        message={`هل تم شحن ${formatCurrency(confirmTarget?.amount ?? 0, settings.currency)} للوكيل "${confirmTarget?.subAgentName}"؟ سيتم إضافة المبلغ للرصيد وتسجيله كدين على المورد "${confirmTarget?.supplierName}".`}
        confirmLabel="نعم، تم الشحن"
        kind="success"
        onConfirm={() => {
          if (confirmTarget) confirmRechargeRequest(confirmTarget.id);
          setConfirmTarget(null);
        }}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="إلغاء الطلب"
        message={`هل تريد إلغاء طلب الشحن للوكيل "${cancelTarget?.subAgentName}"؟`}
        confirmLabel="إلغاء الطلب"
        kind="danger"
        onConfirm={() => {
          if (cancelTarget) updateRechargeRequest(cancelTarget.id, { status: 'cancelled' });
          setCancelTarget(null);
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  miniLabel: { fontSize: 11, fontWeight: '600' },
  miniValue: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  divider: { width: 1, height: 28, marginHorizontal: 8 },
  alertBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600' },
  alertBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  alertBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  filterText: { fontSize: 13, fontWeight: '700' },
  emptyWrap: { flex: 1 },
  card: { borderRadius: 16, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  agentName: { fontSize: 16, fontWeight: '700', fontFamily: 'Cairo-Bold' },
  supplierName: { fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12 },
  amountLabel: { fontSize: 12, fontWeight: '600' },
  amountValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Cairo-Bold', marginTop: 2 },
  dateLabel: { fontSize: 11, marginTop: 2 },
  messageBox: { borderRadius: 10, padding: 12 },
  messageText: { fontSize: 13, lineHeight: 20 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  confirmedText: { fontSize: 12, fontWeight: '600', flex: 1 },
});
