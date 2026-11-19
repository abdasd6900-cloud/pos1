import { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, RefreshControl,
  Modal, Platform, Alert, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight, Smartphone, Hash, Inbox, Search,
  Trash2, Check, Clock, Banknote, CreditCard, AlertCircle, Send,
  ExternalLink, Link2, PenSquare, X, User, Pin, PinOff, Ban, Archive,
  ArchiveRestore, MapPin, ChevronDown, Zap, Calendar, Share as ShareIcon,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { timeAgo, formatDateTime } from '@/lib/format';
import { classifySmsMessage, categoryLabel, categoryColor } from '@/lib/sms-classifier';
import { getDeviceContacts, isContactsSupported, getSimInfo, type DeviceContact, type SimInfo } from '@/lib/native-bridge';
import type { SmsMessage, SmsMessageCategory } from '@/types';
import { SmsConversation } from './SmsConversation';
import { PhoneNumberText } from './PhoneNumberText';

interface ConversationSummary {
  phone: string;
  senderName: string;
  lastMessage: SmsMessage;
  unreadCount: number;
  messageCount: number;
  category: SmsMessageCategory;
}

export function SmsInbox({ initialPhone }: { initialPhone?: string | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    smsMessages, markSmsRead, deleteSmsMessage, updateSmsMessage, sendSmsReply,
    pendingOperations, transferNotifications, supportTickets,
    unrecognizedMessages, settings,
    pinnedConversations, togglePinConversation,
    blockedNumbers, toggleBlockNumber, isNumberBlocked,
    archivedConversations, toggleArchiveConversation,
  } = useApp();
  const bgColor = ('background' in colors ? (colors as Record<string, string>).background : colors.bg) as string;
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(initialPhone ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composePhone, setComposePhone] = useState('');
  const [composeContactName, setComposeContactName] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const [showArchived, setShowArchived] = useState(false);
  const [simCards, setSimCards] = useState<SimInfo[]>([]);
  const [selectedSimId, setSelectedSimId] = useState<number>(-1);
  const [showSimPicker, setShowSimPicker] = useState(false);

  const conversations = useMemo(() => {
    const byPhone = new Map<string, ConversationSummary>();
    for (const msg of smsMessages) {
      const existing = byPhone.get(msg.senderPhone);
      if (!existing || msg.timestamp > existing.lastMessage.timestamp) {
        byPhone.set(msg.senderPhone, {
          phone: msg.senderPhone,
          senderName: msg.senderName,
          lastMessage: msg,
          unreadCount: existing?.unreadCount ?? 0,
          messageCount: (existing?.messageCount ?? 0) + 1,
          category: msg.category,
        });
      } else {
        existing.messageCount += 1;
      }
      if (msg.status === 'new') {
        const entry = byPhone.get(msg.senderPhone)!;
        entry.unreadCount += 1;
      }
    }
    return Array.from(byPhone.values()).sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
  }, [smsMessages]);

  const filteredConversations = useMemo(() => {
    let list = [...conversations];
    // Filter out archived unless showArchived is on
    if (!showArchived) {
      list = list.filter((c) => !archivedConversations.includes(c.phone));
    } else {
      list = list.filter((c) => archivedConversations.includes(c.phone));
    }
    // Filter out blocked numbers
    list = list.filter((c) => !isNumberBlocked(c.phone));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        c.phone.toLowerCase().includes(q) ||
        c.senderName.toLowerCase().includes(q) ||
        c.lastMessage.body.toLowerCase().includes(q),
      );
    }
    // Sort: pinned first
    list.sort((a, b) => {
      const aPinned = pinnedConversations.includes(a.phone) ? 1 : 0;
      const bPinned = pinnedConversations.includes(b.phone) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.lastMessage.timestamp - a.lastMessage.timestamp;
    });
    return list;
  }, [conversations, search, showArchived, archivedConversations, isNumberBlocked, pinnedConversations]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleOpenConversation = (phone: string) => {
    setSelectedPhone(phone);
  };

  const handleDeleteConversation = (phone: string) => {
    Alert.alert('حذف المحادثة', 'هل تريد حذف جميع رسائل هذه المحادثة؟', [
      { text: 'تراجع', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => {
        const msgs = smsMessages.filter((m) => m.senderPhone === phone);
        msgs.forEach((m) => deleteSmsMessage(m.id));
      } },
    ]);
  };

  const handleLongPressConversation = (phone: string) => {
    const isPinned = pinnedConversations.includes(phone);
    const isBlocked = isNumberBlocked(phone);
    const isArchived = archivedConversations.includes(phone);
    Alert.alert(
      'خيارات المحادثة',
      phone,
      [
        { text: isPinned ? 'إلغاء التثبيت' : 'تثبيت في الأعلى', onPress: () => togglePinConversation(phone) },
        { text: isArchived ? 'إلغاء الأرشفة' : 'أرشفة', onPress: () => toggleArchiveConversation(phone) },
        { text: isBlocked ? 'إلغاء الحظر' : 'حظر الرقم', onPress: () => toggleBlockNumber(phone) },
        { text: 'حذف المحادثة', style: 'destructive', onPress: () => handleDeleteConversation(phone) },
        { text: 'إلغاء', style: 'cancel' },
      ],
    );
  };

  const handleMarkAllRead = () => {
    smsMessages.forEach((m) => { if (m.status === 'new') markSmsRead(m.id); });
  };

  const loadSimCards = useCallback(async () => {
    const sims = await getSimInfo();
    setSimCards(sims);
  }, []);

  const handleOpenCompose = () => {
    setComposePhone('');
    setComposeContactName('');
    setComposeMessage('');
    setComposeError(null);
    setSelectedSimId(-1);
    setShowCompose(true);
    void loadSimCards();
  };

  const handlePickContacts = async () => {
    if (!isContactsSupported()) {
      Alert.alert('غير مدعوم', 'اختيار جهات الاتصال غير مدعوم على هذا الجهاز');
      return;
    }
    const fetched = await getDeviceContacts();
    if (fetched.length === 0) {
      Alert.alert('لا توجد جهات اتصال', 'لم يتم العثور على جهات اتصال أو لم يتم منح الإذن');
      return;
    }
    setContacts(fetched);
    setContactSearch('');
    setShowContacts(true);
  };

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [contacts, contactSearch]);

  const handleInsertLocation = () => {
    // Insert a location placeholder — on Android this would use Geocoder
    // For now insert a maps link placeholder the user can edit
    setComposeMessage((prev) => {
      const locText = 'https://maps.google.com/?q=الموقع';
      return prev ? prev + '\n' + locText : locText;
    });
  };

  const handleSendCompose = async () => {
    const phone = composePhone.trim();
    const msg = composeMessage.trim();
    if (!phone || !msg) {
      setComposeError('يرجى إدخال رقم الهاتف والرسالة');
      return;
    }
    setComposeSending(true);
    setComposeError(null);
    const result = await sendSmsReply(phone, msg, selectedSimId >= 0 ? selectedSimId : undefined);
    setComposeSending(false);
    if (result.success) {
      setShowCompose(false);
      setComposePhone('');
      setComposeMessage('');
      setSelectedPhone(phone);
    } else {
      setComposeError(result.error ?? 'فشل إرسال الرسالة');
    }
  };

  const linkedEntity = useCallback((msg: SmsMessage) => {
    if (msg.linkedPendingOpId) {
      const op = pendingOperations.find((o) => o.id === msg.linkedPendingOpId);
      if (op) return { label: 'عملية', detail: op.simNumber || 'بدون رقم', color: colors.info };
    }
    if (msg.linkedTransferNotificationId) {
      const tn = transferNotifications.find((t) => t.id === msg.linkedTransferNotificationId);
      if (tn) return { label: 'تحويل', detail: `${tn.amount} ${tn.currency}`, color: colors.success };
    }
    if (msg.linkedSupportTicketId) {
      const st = supportTickets.find((t) => t.id === msg.linkedSupportTicketId);
      if (st) return { label: 'دعم', detail: st.simNumber || st.customerName, color: colors.warning };
    }
    if (msg.linkedUnrecognizedMsgId) {
      return { label: 'غير معروفة', detail: '', color: colors.textMuted };
    }
    return null;
  }, [pendingOperations, transferNotifications, supportTickets, colors]);

  if (selectedPhone) {
    return <SmsConversation phone={selectedPhone} onBack={() => setSelectedPhone(null)} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleRow}>
            <Inbox size={22} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>صندوق الرسائل</Text>
          </View>
          {smsMessages.some((m) => m.status === 'new') && (
            <TouchableOpacity onPress={handleMarkAllRead} style={[styles.markAllBtn, { backgroundColor: colors.primary + '15' }]}>
              <Check size={14} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.markAllText, { color: colors.primary }]}>قراءة الكل</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleOpenCompose} style={[styles.composeBtn, { backgroundColor: colors.primary }]}>
            <PenSquare size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.composeBtnText}>رسالة جديدة</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث برقم الهاتف أو الاسم أو نص الرسالة..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            textAlign="right"
          />
        </View>

        <View style={styles.subBar}>
          <TouchableOpacity
            onPress={() => setShowArchived(!showArchived)}
            style={[styles.archiveToggle, { backgroundColor: showArchived ? colors.primary + '15' : 'transparent', borderColor: showArchived ? colors.primary + '30' : colors.border }]}
          >
            {showArchived ? <ArchiveRestore size={14} color={colors.primary} strokeWidth={2} /> : <Archive size={14} color={colors.textMuted} strokeWidth={2} />}
            <Text style={[styles.archiveToggleText, { color: showArchived ? colors.primary : colors.textMuted }]}>
              {showArchived ? 'المحادثات المؤرشفة' : 'المؤرشفة'}
            </Text>
            {archivedConversations.length > 0 && (
              <Text style={[styles.archiveCount, { color: showArchived ? colors.primary : colors.textMuted }]}>{archivedConversations.length}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
      >
        {filteredConversations.length === 0 ? (
          <View style={styles.emptyState}>
            <Inbox size={48} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {showArchived ? 'لا توجد محادثات مؤرشفة' : search.trim() ? 'لا توجد نتائج مطابقة' : 'لا توجد رسائل في هذا القسم'}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
              {showArchived ? 'لا توجد محادثات مؤرشفة' : 'لا توجد رسائل بعد'}
            </Text>
          </View>
        ) : (
          filteredConversations.map((conv) => {
            const catColor = categoryColor(conv.category);
            const linked = linkedEntity(conv.lastMessage);
            const isInbound = conv.lastMessage.direction === 'inbound';
            const isPinned = pinnedConversations.includes(conv.phone);
            return (
              <TouchableOpacity
                key={conv.phone}
                onPress={() => handleOpenConversation(conv.phone)}
                onLongPress={() => handleLongPressConversation(conv.phone)}
                style={[styles.convCard, { backgroundColor: colors.surface, borderColor: conv.unreadCount > 0 ? catColor + '40' : colors.border }]}
                activeOpacity={0.75}
              >
                {isPinned && <Pin size={12} color={catColor} strokeWidth={2} style={{ position: 'absolute', top: 8, left: 8 }} />}
                <View style={[styles.convAvatar, { backgroundColor: catColor + '18' }]}>
                  {isInbound ? <ArrowRight size={18} color={catColor} strokeWidth={2} /> : <Send size={18} color={catColor} strokeWidth={2} />}
                </View>
                <View style={styles.convBody}>
                  <View style={styles.convHeader}>
                    <Text style={[styles.convPhone, { color: colors.text }]} numberOfLines={1}>{conv.phone}</Text>
                    <Text style={[styles.convTime, { color: conv.unreadCount > 0 ? catColor : colors.textMuted }]}>{timeAgo(conv.lastMessage.timestamp)}</Text>
                  </View>
                  {conv.senderName ? (
                    <Text style={[styles.convName, { color: colors.textSecondary }]} numberOfLines={1}>{conv.senderName}</Text>
                  ) : null}
                    <PhoneNumberText
                      text={conv.lastMessage.body}
                      color={conv.unreadCount > 0 ? colors.text : colors.textSecondary}
                      style={[styles.convPreview, { color: conv.unreadCount > 0 ? colors.text : colors.textSecondary }]}
                    />
                  <View style={styles.convMeta}>
                    {linked && (
                      <View style={[styles.convLinkedTag, { backgroundColor: linked.color + '12' }]}>
                        <Link2 size={11} color={linked.color} strokeWidth={2} />
                        <Text style={[styles.convLinkedText, { color: linked.color }]}>{linked.label}</Text>
                      </View>
                    )}
                    {conv.unreadCount > 0 && (
                      <View style={[styles.convUnreadBadge, { backgroundColor: catColor }]}>
                        <Text style={styles.convUnreadText}>{conv.unreadCount}</Text>
                      </View>
                    )}
                    <Text style={[styles.convCount, { color: colors.textMuted }]}>{conv.messageCount} رسالة</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Compose New Message Modal */}
      <Modal visible={showCompose} animationType="slide" transparent onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.composeModal, { backgroundColor: colors.surface }]}>
            <View style={[styles.composeHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.composeTitle, { color: colors.text }]}>رسالة جديدة</Text>
              <TouchableOpacity onPress={() => setShowCompose(false)} style={styles.composeCloseBtn}>
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.composeBody}
              contentContainerStyle={styles.composeBodyContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.phoneRow}>
                <View style={styles.phoneInputWrap}>
                  {composeContactName ? (
                    <View style={[styles.selectedContactChip, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                      <User size={14} color={colors.primary} strokeWidth={2} />
                      <Text style={[styles.selectedContactName, { color: colors.primary }]} numberOfLines={1}>{composeContactName}</Text>
                      <TouchableOpacity onPress={() => { setComposeContactName(''); setComposePhone(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X size={14} color={colors.primary} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TextInput
                    value={composePhone}
                    onChangeText={(text) => { setComposePhone(text); setComposeContactName(''); }}
                    placeholder="رقم الهاتف"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.composePhoneInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                    keyboardType="phone-pad"
                    textAlign="right"
                  />
                </View>
                {isContactsSupported() && (
                  <TouchableOpacity onPress={handlePickContacts} style={[styles.contactsBtn, { backgroundColor: colors.primary + '15' }]}>
                    <User size={18} color={colors.primary} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>

              {/* SIM selector */}
              {simCards.length > 1 && (
                <TouchableOpacity
                  onPress={() => setShowSimPicker(!showSimPicker)}
                  style={[styles.simSelector, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                >
                  <Smartphone size={14} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.simSelectorText, { color: colors.text }]}>
                    {selectedSimId >= 0
                      ? `SIM ${(simCards.find((s) => s.subscriptionId === selectedSimId)?.simSlotIndex ?? 0) + 1} - ${simCards.find((s) => s.subscriptionId === selectedSimId)?.carrierName ?? ''}`
                      : 'الشريحة الافتراضية'}
                  </Text>
                  <ChevronDown size={14} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              )}
              {showSimPicker && simCards.length > 1 && (
                <View style={[styles.simPickerList, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <TouchableOpacity
                    onPress={() => { setSelectedSimId(-1); setShowSimPicker(false); }}
                    style={styles.simPickerItem}
                  >
                    <Text style={[styles.simPickerItemText, { color: colors.text }]}>الشريحة الافتراضية</Text>
                  </TouchableOpacity>
                  {simCards.map((sim) => (
                    <TouchableOpacity
                      key={sim.subscriptionId}
                      onPress={() => { setSelectedSimId(sim.subscriptionId); setShowSimPicker(false); }}
                      style={styles.simPickerItem}
                    >
                      <Text style={[styles.simPickerItemText, { color: colors.text }]}>
                        SIM {sim.simSlotIndex + 1} - {sim.carrierName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                value={composeMessage}
                onChangeText={setComposeMessage}
                placeholder="اكتب الرسالة هنا..."
                placeholderTextColor={colors.textMuted}
                style={[styles.composeMsgInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                multiline
                maxLength={500}
                textAlignVertical="top"
                textAlign="right"
              />

              <View style={styles.composeActions}>
                <TouchableOpacity onPress={handleInsertLocation} style={[styles.composeActionBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <MapPin size={16} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.composeActionText, { color: colors.primary }]}>إدراج موقع</Text>
                </TouchableOpacity>
              </View>

              {composeError && (
                <Text style={[styles.composeError, { color: colors.danger }]}>{composeError}</Text>
              )}

              <TouchableOpacity
                onPress={handleSendCompose}
                disabled={composeSending || !composePhone.trim() || !composeMessage.trim()}
                style={[styles.composeSendBtn, { backgroundColor: (!composePhone.trim() || !composeMessage.trim() || composeSending) ? colors.surfaceAlt : colors.primary }]}
                activeOpacity={0.8}
              >
                <Send size={18} color={(!composePhone.trim() || !composeMessage.trim() || composeSending) ? colors.textMuted : '#FFFFFF'} strokeWidth={2} />
                <Text style={[styles.composeSendText, { color: (!composePhone.trim() || !composeMessage.trim() || composeSending) ? colors.textMuted : '#FFFFFF' }]}>
                  {composeSending ? 'جاري الإرسال...' : 'إرسال'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Contacts Picker Modal */}
      <Modal visible={showContacts} animationType="slide" transparent onRequestClose={() => setShowContacts(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.contactsModal, { backgroundColor: colors.surface }]}>
            <View style={[styles.composeHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.composeTitle, { color: colors.text }]}>اختر جهة اتصال</Text>
              <TouchableOpacity onPress={() => setShowContacts(false)} style={styles.composeCloseBtn}>
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, margin: 12 }]}>
              <Search size={16} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="بحث في جهات الاتصال..."
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.text }]}
                textAlign="right"
              />
            </View>
            <ScrollView style={styles.flex} contentContainerStyle={{ padding: 12 }}>
              {filteredContacts.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    setComposePhone(c.phone);
                    setComposeContactName(c.name);
                    setShowContacts(false);
                  }}
                  style={[styles.contactItem, { borderBottomColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: colors.primary + '18' }]}>
                    <User size={18} color={colors.primary} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                    <Text style={[styles.contactPhone, { color: colors.textMuted }]} numberOfLines={1}>{c.phone}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 0, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontFamily: 'Cairo-Bold' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  markAllText: { fontSize: 11, fontFamily: 'Cairo-SemiBold' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: 'Cairo-Regular' },
  subBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  archiveToggleText: { fontSize: 11, fontFamily: 'Cairo-SemiBold' },
  archiveCount: { fontSize: 11, fontFamily: 'Cairo-Bold' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: 'Cairo-SemiBold' },
  emptyHint: { fontSize: 13, fontFamily: 'Cairo-Regular', textAlign: 'center', paddingHorizontal: 32 },
  convCard: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  convAvatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  convBody: { flex: 1 },
  convHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convPhone: { fontSize: 15, fontFamily: 'Cairo-Bold', flex: 1 },
  convTime: { fontSize: 11, fontFamily: 'Cairo-Regular' },
  convName: { fontSize: 12, fontFamily: 'Cairo-Regular', marginTop: 2 },
  convPreview: { fontSize: 13, fontFamily: 'Cairo-Regular', lineHeight: 20, marginTop: 4, writingDirection: 'rtl' },
  convMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  convLinkedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  convLinkedText: { fontSize: 10, fontFamily: 'Cairo-SemiBold' },
  convUnreadBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  convUnreadText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Cairo-Bold' },
  convCount: { fontSize: 10, fontFamily: 'Cairo-Regular', flex: 1, textAlign: 'left' },
  composeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  composeBtnText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Cairo-SemiBold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  composeModal: { width: '100%', maxWidth: 440, maxHeight: '90%', borderRadius: 16, overflow: 'hidden' },
  composeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  composeTitle: { fontSize: 17, fontFamily: 'Cairo-Bold' },
  composeCloseBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  composeBody: { flexGrow: 0 },
  composeBodyContent: { padding: 16, paddingBottom: 28 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  phoneInputWrap: { flex: 1, gap: 6 },
  selectedContactChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, alignSelf: 'flex-start' },
  selectedContactName: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  composePhoneInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Cairo-Regular', borderWidth: 1 },
  contactsBtn: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  simSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  simSelectorText: { flex: 1, fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  simPickerList: { borderRadius: 10, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  simPickerItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  simPickerItemText: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  composeMsgInput: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Cairo-Regular', borderWidth: 1, minHeight: 100, maxHeight: 200, marginBottom: 12 },
  composeActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  composeActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  composeActionText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  composeError: { fontSize: 13, fontFamily: 'Cairo-Regular', marginBottom: 10 },
  composeSendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  composeSendText: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  contactsModal: { width: '100%', maxWidth: 440, maxHeight: '70%', borderRadius: 16, overflow: 'hidden' },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  contactAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactName: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  contactPhone: { fontSize: 13, fontFamily: 'Cairo-Regular', marginTop: 2 },
});
