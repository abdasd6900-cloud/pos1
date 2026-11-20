import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import {
  Phone, Trash2, Power, Wallet, Check, Send, Tag, Smartphone,
  CreditCard, MessageSquare,
} from 'lucide-react-native';
import { router } from 'expo-router';
import { dealerStyles as styles } from './styles';
import type { Dealer, RechargeRequest, PricingEntry, PlasticSim, EsimRequest } from './types';

export function EsimRequestRow({ req, dealerName, colors, onProcess }: { req: EsimRequest; dealerName: string; colors: any; onProcess: () => void }) {
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{req.customer_name}</Text>
              <View style={[styles.typeBadge, { backgroundColor: colors.info + '20' }]}>
                <Text style={[styles.typeBadgeText, { color: colors.info }]}>eSIM</Text>
              </View>
            </View>
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

export function RequestRow({ req, dealerName, colors, onProcess }: { req: RechargeRequest; dealerName: string; colors: any; onProcess: () => void }) {
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

export function DealerRow({ dealer, colors, numbersCount, onToggle, onDelete, onTopUp }: { dealer: Dealer; colors: any; numbersCount: { active: number; inactive: number; total: number }; onToggle: () => void; onDelete: () => void; onTopUp: (amount: number) => void }) {
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);

  const copyLoginLink = async () => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const link = `${origin}/dealer?phone=${encodeURIComponent(dealer.phone)}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      router.push('/dealer');
    }
  };

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

      <View style={[styles.numbersSummary, { borderColor: colors.border }]}>
        <View style={styles.summaryChip}>
          <Text style={[styles.summaryChipLabel, { color: colors.textMuted }]}>الأرقام</Text>
          <Text style={[styles.summaryChipValue, { color: colors.text }]}>{numbersCount.total}</Text>
        </View>
        <View style={styles.summaryChip}>
          <Text style={[styles.summaryChipLabel, { color: colors.success }]}>فعالة</Text>
          <Text style={[styles.summaryChipValue, { color: colors.success }]}>{numbersCount.active}</Text>
        </View>
        <View style={styles.summaryChip}>
          <Text style={[styles.summaryChipLabel, { color: colors.danger }]}>غير فعالة</Text>
          <Text style={[styles.summaryChipValue, { color: colors.danger }]}>{numbersCount.inactive}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success + '15' }]} onPress={() => setShowTopUp(!showTopUp)}>
          <Wallet size={15} color={colors.success} strokeWidth={2} />
          <Text style={[styles.actionText, { color: colors.success }]}>شحن رصيد</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary + '15' }]} onPress={copyLoginLink}>
          {copied ? <Check size={15} color={colors.primary} strokeWidth={2} /> : <Send size={15} color={colors.primary} strokeWidth={2} />}
          <Text style={[styles.actionText, { color: colors.primary }]}>{copied ? 'تم النسخ' : 'رابط الدخول'}</Text>
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

export function PricingRow({ entry, colors, onEdit, onDelete }: { entry: PricingEntry; colors: any; onEdit: () => void; onDelete: () => void }) {
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

export function SimRow({ sim, dealerName, dealers, colors, onTransfer, onDelete }: { sim: PlasticSim; dealerName: string; dealers: Dealer[]; colors: any; onTransfer: (toId: string) => void; onDelete: () => void }) {
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
