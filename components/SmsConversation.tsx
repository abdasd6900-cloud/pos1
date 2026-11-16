import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Alert, Share, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  ArrowRight, Send, Copy, Check, Trash2, Phone, User, Clock,
  Link2, ExternalLink, AlertCircle, Loader, Search, Forward, Share as ShareIcon,
  Pin, PinOff, Ban, Archive, ChevronDown, Zap, Calendar, MapPin, X, CheckCheck,
  PenSquare, Crosshair,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatDateTime, timeAgo } from '@/lib/format';
import { categoryColor } from '@/lib/sms-classifier';
import { getSimInfo, getDeviceContacts, isContactsSupported, type SimInfo, type DeviceContact } from '@/lib/native-bridge';
import { PhoneNumberText } from './PhoneNumberText';
import type { SmsMessage } from '@/types';

interface SmsConversationProps {
  phone: string;
  onBack: () => void;
}

export function SmsConversation({ phone, onBack }: SmsConversationProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    smsMessages, sendSmsReply, markSmsRead, deleteSmsMessage, updateSmsMessage,
    pendingOperations, transferNotifications, supportTickets, unrecognizedMessages,
    pinnedConversations, togglePinConversation,
    blockedNumbers, toggleBlockNumber, isNumberBlocked,
    archivedConversations, toggleArchiveConversation,
    quickReplyTemplates,
    scheduledMessages, addScheduledMessage,
  } = useApp();
  const bgColor = ('background' in colors ? (colors as Record<string, string>).background : colors.bg) as string;
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [simCards, setSimCards] = useState<SimInfo[]>([]);
  const [selectedSimId, setSelectedSimId] = useState<number>(-1);
  const [showSimPicker, setShowSimPicker] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    getSimInfo().then(setSimCards);
  }, []);

  const conversation = useMemo(
    () => smsMessages.filter((m) => m.senderPhone === phone).sort((a, b) => a.timestamp - b.timestamp),
    [smsMessages, phone],
  );

  const filteredConversation = useMemo(() => {
    if (!searchQuery.trim()) return conversation;
    const q = searchQuery.trim().toLowerCase();
    return conversation.filter((m) => m.body.toLowerCase().includes(q));
  }, [conversation, searchQuery]);

  const senderName = useMemo(() => {
    const named = conversation.find((m) => m.senderName);
    return named?.senderName ?? '';
  }, [conversation]);

  const unreadCount = useMemo(() => conversation.filter((m) => m.status === 'new').length, [conversation]);
  const isPinned = pinnedConversations.includes(phone);
  const isBlocked = isNumberBlocked(phone);
  const isArchived = archivedConversations.includes(phone);

  const linkedEntity = useCallback((msg: SmsMessage) => {
    if (msg.linkedPendingOpId) {
      const op = pendingOperations.find((o) => o.id === msg.linkedPendingOpId);
      if (op) return { label: 'عملية قيد الانتظار', detail: op.simNumber || op.originalMessage.slice(0, 40), type: 'pending' as const };
    }
    if (msg.linkedTransferNotificationId) {
      const tn = transferNotifications.find((t) => t.id === msg.linkedTransferNotificationId);
      if (tn) return { label: 'إشعار تحويل', detail: `${tn.senderName} - ${tn.amount} ${tn.currency}`, type: 'transfer' as const };
    }
    if (msg.linkedSupportTicketId) {
      const st = supportTickets.find((t) => t.id === msg.linkedSupportTicketId);
      if (st) return { label: 'طلب دعم فني', detail: st.simNumber || st.customerName, type: 'support' as const };
    }
    if (msg.linkedUnrecognizedMsgId) {
      const um = unrecognizedMessages.find((u) => u.id === msg.linkedUnrecognizedMsgId);
      if (um) return { label: 'رسالة غير معروفة', detail: um.originalMessage.slice(0, 40), type: 'unrecognized' as const };
    }
    return null;
  }, [pendingOperations, transferNotifications, supportTickets, unrecognizedMessages]);

  const handleMarkRead = useCallback(() => {
    conversation.forEach((m) => { if (m.status === 'new') markSmsRead(m.id); });
  }, [conversation, markSmsRead]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    const result = await sendSmsReply(phone, replyText.trim(), selectedSimId >= 0 ? selectedSimId : undefined);
    setSending(false);
    if (result.success) {
      setReplyText('');
    } else {
      Alert.alert('فشل الإرسال', result.error ?? 'تعذر إرسال الرسالة');
    }
  };

  const handleForward = (msg: SmsMessage) => {
    Alert.prompt(
      'إعادة توجيه',
      'أدخل رقم الهاتف المطلوب إعادة التوجيه إليه:',
      (text) => {
        if (text && text.trim()) {
          void sendSmsReply(text.trim(), msg.body);
          Alert.alert('تم', 'تمت إعادة توجيه الرسالة');
        }
      },
    );
  };

  const handleShareConversation = async () => {
    const text = conversation.map((m) =>
      `${m.direction === 'inbound' ? '_FROM' : 'TO'} ${phone}\n${formatDateTime(m.timestamp)}\n${m.body}\n`,
    ).join('\n---\n\n');
    try {
      await Share.share({ message: `محادثة مع ${phone}:\n\n${text}` });
    } catch {
      // user cancelled share
    }
  };

  const handleSchedule = () => {
    if (!replyText.trim()) {
      Alert.alert('تنبيه', 'اكتب الرسالة أولاً قبل جدولتها');
      return;
    }
    setShowSchedule(true);
    setScheduleTime('');
  };

  const handleConfirmSchedule = () => {
    if (!scheduleTime.trim()) {
      Alert.alert('تنبيه', 'أدخل الوقت المراد إرسال الرسالة فيه');
      return;
    }
    // Parse time — accept formats like "HH:MM" or "HH:MM DD/MM"
    const now = new Date();
    const match = scheduleTime.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const scheduled = new Date(now);
      scheduled.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
      if (scheduled.getTime() <= now.getTime()) {
        scheduled.setDate(scheduled.getDate() + 1);
      }
      addScheduledMessage({
        phone,
        message: replyText.trim(),
        scheduledAt: scheduled.getTime(),
        subscriptionId: selectedSimId >= 0 ? selectedSimId : null,
        sent: false,
      });
      Alert.alert('تم', `تمت جدولة الرسالة لإرسالها في ${formatDateTime(scheduled.getTime())}`);
      setReplyText('');
      setShowSchedule(false);
      setScheduleTime('');
    } else {
      Alert.alert('تنسيق خاطئ', 'استخدم تنسيق HH:MM مثل 14:30');
    }
  };

  const handleConversationMenu = () => {
    Alert.alert('خيارات المحادثة', phone, [
      { text: isPinned ? 'إلغاء التثبيت' : 'تثبيت', onPress: () => togglePinConversation(phone) },
      { text: isArchived ? 'إلغاء الأرشفة' : 'أرشفة', onPress: () => toggleArchiveConversation(phone) },
      { text: isBlocked ? 'إلغاء الحظر' : 'حظر الرقم', onPress: () => toggleBlockNumber(phone) },
      { text: 'تصدير المحادثة', onPress: handleShareConversation },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  const handleCopy = (msg: SmsMessage) => {
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (msg: SmsMessage) => {
    Alert.alert('حذف الرسالة', 'هل تريد حذف هذه الرسالة؟', [
      { text: 'تراجع', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteSmsMessage(msg.id) },
    ]);
  };

  const handleInsertLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'إذن الموقع مرفوض',
          'لا يمكن جلب موقعك بدون إذن الوصول للموقع. فعّل الإذن من إعدادات التطبيق.',
        );
        setLocating(false);
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      let pos = lastKnown;

      if (!pos) {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      }

      const { latitude, longitude } = pos.coords;
      const mapsUrl = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

      setReplyText((prev) => (prev ? prev + '\n' + mapsUrl : mapsUrl));
    } catch (err) {
      Alert.alert(
        'تعذر تحديد الموقع',
        'حدث خطأ أثناء محاولة تحديد موقعك. تأكد من تفعيل GPS وحاول مرة أخرى.',
      );
    } finally {
      setLocating(false);
    }
  };

  const loadContactsAndPick = async () => {
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
    setShowContactPicker(true);
  };

  const filteredContactsForPicker = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [contacts, contactSearch]);

  const handleMsgLongPress = (msg: SmsMessage) => {
    Alert.alert('خيارات الرسالة', '', [
      { text: 'نسخ', onPress: () => handleCopy(msg) },
      { text: 'إعادة توجيه', onPress: () => handleForward(msg) },
      { text: 'حذف', style: 'destructive', onPress: () => handleDelete(msg) },
      { text: 'إلغاء', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ArrowRight size={22} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerTopRow}>
            <Phone size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.headerPhone, { color: colors.text }]} numberOfLines={1}>{phone}</Text>
            {unreadCount > 0 && <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={styles.unreadBadgeText}>{unreadCount}</Text></View>}
            {isPinned && <Pin size={12} color={colors.primary} strokeWidth={2} />}
            {isBlocked && <Ban size={12} color={colors.danger} strokeWidth={2} />}
          </View>
          {senderName ? (
            <View style={styles.headerNameRow}>
              <User size={13} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.headerName, { color: colors.textSecondary }]} numberOfLines={1}>{senderName}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.headerBtn}>
          <Search size={18} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={loadContactsAndPick} style={styles.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <PenSquare size={18} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleConversationMenu} style={styles.headerBtn}>
          <ExternalLink size={18} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
          <Search size={16} color={colors.textMuted} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="بحث داخل المحادثة..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            textAlign="right"
          />
          {searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          onLayout={handleMarkRead}
        >
          {filteredConversation.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {searchQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد رسائل في هذه المحادثة'}
              </Text>
            </View>
          ) : (
            filteredConversation.map((msg) => {
              const isInbound = msg.direction === 'inbound';
              const linked = linkedEntity(msg);
              const catColor = categoryColor(msg.category);
              return (
                <View key={msg.id} style={[styles.msgRow, isInbound ? styles.msgRowInbound : styles.msgRowOutbound]}>
                  <TouchableOpacity
                    onLongPress={() => handleMsgLongPress(msg)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.msgBubble, { backgroundColor: isInbound ? colors.surface : colors.primary }, isInbound && { borderColor: colors.border }]}>
                      <PhoneNumberText
                        text={msg.body}
                        color={isInbound ? colors.text : '#FFFFFF'}
                        style={[styles.msgBody, { color: isInbound ? colors.text : '#FFFFFF' }]}
                      />
                      <View style={styles.msgFooter}>
                        <Text style={[styles.msgTime, { color: isInbound ? colors.textMuted : '#FFFFFFAA' }]}>{timeAgo(msg.timestamp)}</Text>
                        {msg.autoReplied && msg.autoReplyText && (
                          <View style={[styles.autoReplyTag, { backgroundColor: isInbound ? colors.success + '15' : '#FFFFFF22' }]}>
                            <Text style={[styles.autoReplyText, { color: isInbound ? colors.success : '#FFFFFFCC' }]}>رد تلقائي</Text>
                          </View>
                        )}
                        {!isInbound && msg.sendStatus === 'pending' && (
                          <View style={styles.sendStatusTag}>
                            <Loader size={11} color="#FFFFFFAA" strokeWidth={2} />
                            <Text style={styles.sendStatusPending}>قيد الإرسال</Text>
                          </View>
                        )}
                        {!isInbound && msg.sendStatus === 'sent' && (
                          <View style={styles.sendStatusTag}>
                            <Check size={11} color="#FFFFFFAA" strokeWidth={2.5} />
                            <Text style={styles.sendStatusSent}>تم الإرسال</Text>
                          </View>
                        )}
                        {!isInbound && msg.sendStatus === 'delivered' && (
                          <View style={styles.sendStatusTag}>
                            <CheckCheck size={11} color="#FFFFFFAA" strokeWidth={2.5} />
                            <Text style={styles.sendStatusSent}>تم التسليم</Text>
                          </View>
                        )}
                        {!isInbound && msg.sendStatus === 'failed' && (
                          <View style={styles.sendStatusTag}>
                            <AlertCircle size={11} color="#FFFFFFAA" strokeWidth={2} />
                            <Text style={styles.sendStatusFailed}>فشل الإرسال</Text>
                          </View>
                        )}
                      </View>
                      {linked && (
                        <View style={[styles.linkedBox, { backgroundColor: isInbound ? catColor + '12' : '#FFFFFF22', borderColor: isInbound ? catColor + '30' : '#FFFFFF33' }]}>
                          <Link2 size={13} color={isInbound ? catColor : '#FFFFFFCC'} strokeWidth={2} />
                          <Text style={[styles.linkedLabel, { color: isInbound ? catColor : '#FFFFFFCC' }]}>{linked.label}</Text>
                          <Text style={[styles.linkedDetail, { color: isInbound ? colors.textSecondary : '#FFFFFFAA' }]} numberOfLines={1}>{linked.detail}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.msgActions}>
                    <TouchableOpacity onPress={() => handleCopy(msg)} style={styles.msgActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {copiedId === msg.id ? <Check size={14} color={colors.success} strokeWidth={2} /> : <Copy size={14} color={colors.textMuted} strokeWidth={2} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleForward(msg)} style={styles.msgActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Forward size={14} color={colors.textMuted} strokeWidth={2} />
                    </TouchableOpacity>
                    {isInbound && msg.status !== 'processed' && msg.status !== 'ignored' && (
                      <TouchableOpacity onPress={() => updateSmsMessage(msg.id, { status: 'processed' })} style={styles.msgActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Check size={14} color={colors.success} strokeWidth={2} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleDelete(msg)} style={styles.msgActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2 size={14} color={colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Quick reply templates bar */}
        {showQuickReplies && (
          <View style={[styles.quickReplyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
              {quickReplyTemplates.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => { setReplyText(t.body); setShowQuickReplies(false); }}
                  style={[styles.quickReplyChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                >
                  <Zap size={12} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.quickReplyText, { color: colors.primary }]} numberOfLines={1}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Schedule modal */}
        {showSchedule && (
          <View style={[styles.scheduleBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={styles.scheduleRow}>
              <Calendar size={16} color={colors.primary} strokeWidth={2} />
              <TextInput
                value={scheduleTime}
                onChangeText={setScheduleTime}
                placeholder="HH:MM (مثل 14:30)"
                placeholderTextColor={colors.textMuted}
                style={[styles.scheduleInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                textAlign="center"
              />
              <TouchableOpacity onPress={handleConfirmSchedule} style={[styles.scheduleConfirm, { backgroundColor: colors.primary }]}>
                <Check size={16} color="#FFFFFF" strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSchedule(false)} style={[styles.scheduleCancel, { backgroundColor: colors.surfaceAlt }]}>
                <X size={16} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={[styles.replyBox, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.replyActions}>
            <TouchableOpacity onPress={() => setShowQuickReplies(!showQuickReplies)} style={styles.replyActionBtn}>
              <Zap size={18} color={showQuickReplies ? colors.primary : colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleInsertLocation} style={styles.replyActionBtn} disabled={locating}>
              {locating ? (
                <Loader size={18} color={colors.primary} strokeWidth={2} />
              ) : (
                <MapPin size={18} color={colors.textMuted} strokeWidth={2} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSchedule} style={styles.replyActionBtn}>
              <Calendar size={18} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
            {/* SIM selector for dual SIM */}
            {simCards.length > 1 && (
              <TouchableOpacity
                onPress={() => setShowSimPicker(!showSimPicker)}
                style={[styles.simMiniBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Text style={[styles.simMiniText, { color: colors.text }]}>
                  {selectedSimId >= 0 ? `SIM${simCards.find((s) => s.subscriptionId === selectedSimId)?.simSlotIndex ?? 0 + 1}` : 'SIM'}
                </Text>
                <ChevronDown size={10} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {showSimPicker && simCards.length > 1 && (
            <View style={[styles.simPickerInline, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setSelectedSimId(-1); setShowSimPicker(false); }} style={styles.simPickerItemInline}>
                <Text style={[styles.simPickerItemTextInline, { color: colors.text }]}>الشريحة الافتراضية</Text>
              </TouchableOpacity>
              {simCards.map((sim) => (
                <TouchableOpacity
                  key={sim.subscriptionId}
                  onPress={() => { setSelectedSimId(sim.subscriptionId); setShowSimPicker(false); }}
                  style={styles.simPickerItemInline}
                >
                  <Text style={[styles.simPickerItemTextInline, { color: colors.text }]}>
                    SIM {sim.simSlotIndex + 1} - {sim.carrierName}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.replyInputRow}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="اكتب ردك هنا..."
              placeholderTextColor={colors.textMuted}
              style={[styles.replyInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !replyText.trim()}
              style={[styles.sendBtn, { backgroundColor: sending || !replyText.trim() ? colors.surfaceAlt : colors.primary }]}
              activeOpacity={0.8}
            >
              <Send size={20} color={sending || !replyText.trim() ? colors.textMuted : '#FFFFFF'} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      {showContactPicker && (
        <View style={[styles.contactPickerOverlay, { paddingTop: insets.top + 12 }]}>
          <View style={[styles.contactPickerSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.contactPickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.contactPickerTitle, { color: colors.text }]}>اختر جهة اتصال</Text>
              <TouchableOpacity onPress={() => setShowContactPicker(false)} style={styles.composeCloseBtn2}>
                <X size={20} color={colors.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <View style={[styles.contactSearchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Search size={16} color={colors.textMuted} strokeWidth={2} />
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="بحث بالاسم أو الرقم..."
                placeholderTextColor={colors.textMuted}
                style={[styles.contactSearchInput, { color: colors.text }]}
                textAlign="right"
              />
            </View>
            <ScrollView style={styles.flex} contentContainerStyle={{ padding: 12 }}>
              {filteredContactsForPicker.length === 0 ? (
                <Text style={[styles.contactEmptyText, { color: colors.textMuted }]}>لا توجد نتائج</Text>
              ) : (
                filteredContactsForPicker.map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setShowContactPicker(false);
                      setReplyText('');
                      sendSmsReply(c.phone, '', undefined).then(() => {
                        onBack();
                      });
                    }}
                    style={[styles.contactPickerItem, { borderBottomColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.contactPickerAvatar, { backgroundColor: colors.primary + '18' }]}>
                      <User size={18} color={colors.primary} strokeWidth={2} />
                    </View>
                    <View style={styles.contactPickerInfo}>
                      <Text style={[styles.contactPickerName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                      <Text style={[styles.contactPickerPhone, { color: colors.textMuted }]} numberOfLines={1}>{c.phone}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 6,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerPhone: { fontSize: 16, fontFamily: 'Cairo-Bold', flexShrink: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Cairo-Bold' },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerName: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  headerBtn: { padding: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Cairo-Regular' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  msgRow: { marginBottom: 12, maxWidth: '82%' },
  msgRowInbound: { alignSelf: 'flex-start' },
  msgRowOutbound: { alignSelf: 'flex-end' },
  msgBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  msgBody: { fontSize: 14, fontFamily: 'Cairo-Regular', lineHeight: 22, writingDirection: 'rtl' },
  msgFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  msgTime: { fontSize: 10, fontFamily: 'Cairo-Regular' },
  autoReplyTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  autoReplyText: { fontSize: 9, fontFamily: 'Cairo-SemiBold' },
  sendStatusTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sendStatusPending: { fontSize: 9, fontFamily: 'Cairo-SemiBold', color: '#FFFFFFAA' },
  sendStatusSent: { fontSize: 9, fontFamily: 'Cairo-SemiBold', color: '#FFFFFFCC' },
  sendStatusFailed: { fontSize: 9, fontFamily: 'Cairo-SemiBold', color: '#FFFFFFAA' },
  linkedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkedLabel: { fontSize: 11, fontFamily: 'Cairo-SemiBold' },
  linkedDetail: { fontSize: 11, fontFamily: 'Cairo-Regular', flex: 1 },
  msgActions: { flexDirection: 'row', gap: 8, marginTop: 4, paddingHorizontal: 4 },
  msgActionBtn: { padding: 4 },
  replyBox: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  replyActionBtn: { padding: 6 },
  simMiniBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginLeft: 'auto' },
  simMiniText: { fontSize: 11, fontFamily: 'Cairo-SemiBold' },
  simPickerInline: { borderRadius: 10, borderWidth: 1, marginBottom: 6, overflow: 'hidden' },
  simPickerItemInline: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  simPickerItemTextInline: { fontSize: 13, fontFamily: 'Cairo-Regular' },
  replyInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Cairo-Regular',
    borderWidth: 1,
    writingDirection: 'rtl',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReplyBar: { borderTopWidth: 1, paddingVertical: 8 },
  quickReplyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  quickReplyText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  scheduleBar: { borderTopWidth: 1, padding: 12 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: 'Cairo-Regular', borderWidth: 1 },
  scheduleConfirm: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scheduleCancel: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contactPickerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 },
  contactPickerSheet: { flex: 1, marginTop: 60, borderRadius: 20, overflow: 'hidden' },
  contactPickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  contactPickerTitle: { fontSize: 17, fontFamily: 'Cairo-Bold' },
  composeCloseBtn2: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contactSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, margin: 12, borderRadius: 12, borderWidth: 1 },
  contactSearchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: 'Cairo-Regular' },
  contactEmptyText: { fontSize: 14, fontFamily: 'Cairo-Regular', textAlign: 'center', paddingVertical: 20 },
  contactPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  contactPickerAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactPickerInfo: { flex: 1 },
  contactPickerName: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  contactPickerPhone: { fontSize: 13, fontFamily: 'Cairo-Regular', marginTop: 2 },
});
