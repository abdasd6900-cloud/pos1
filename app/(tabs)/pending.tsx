import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert, TextInput, Modal, Linking } from 'react-native';
import { useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, MessageSquare, Smartphone, Check, X, Trash2,
  Inbox, ArrowRightCircle, Phone, User, Snowflake, RefreshCw,
  AlertTriangle, CalendarClock, Headphones, Send, GraduationCap, Sparkles, Banknote,
} from 'lucide-react-native';
import { useApp } from '@/lib/app-context';
import { useTheme } from '@/lib/theme-context';
import { formatDateTime, formatCurrency } from '@/lib/format';
import { openWhatsApp } from '@/lib/customer-classifier';
import type { PendingOperation, FreezeRequest, TelecomSale, SupportTicket, UnrecognizedMessage, TransferNotification, TransferReport } from '@/types';

type TabKey = 'pending' | 'freeze' | 'support' | 'learning' | 'reactivation' | 'transfers' | 'executed';

export default function PendingOperationsScreen() {
  const {
    pendingOperations, executePendingOperation, deletePendingOperation,
    freezeRequests, executeFreezeRequest, cancelFreezeRequest,
    telecomSales, reactivateSale, customers, telecomCompanies,
    supportTickets, updateSupportTicket, deleteSupportTicket, forwardSupportReply, confirmRechargeBySupport, confirmUpdateDone,
    unrecognizedMessages, learnFromMessage, ignoreUnrecognizedMessage, deleteUnrecognizedMessage,
    transferNotifications, transferReports, confirmTransferNotification, rejectTransferNotification,
    deleteTransferNotification, linkTransferNotification, pendingOperations: pendingOpsAll,
  } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('pending');
  const [replyModal, setReplyModal] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [teachModal, setTeachModal] = useState<UnrecognizedMessage | null>(null);
  const [teachReply, setTeachReply] = useState('');
  const [teachKeywords, setTeachKeywords] = useState('');
  const [waLoadingId, setWaLoadingId] = useState<string | null>(null);

  const pending = useMemo(() => pendingOperations.filter((o) => o.status === 'pending'), [pendingOperations]);
  const executed = useMemo(() => pendingOperations.filter((o) => o.status !== 'pending'), [pendingOperations]);
  const pendingFreeze = useMemo(() => freezeRequests.filter((r) => r.status === 'pending'), [freezeRequests]);
  const executedFreeze = useMemo(() => freezeRequests.filter((r) => r.status !== 'pending'), [freezeRequests]);
  const reactivatedSales = useMemo(() => telecomSales.filter((s) => s.escalationState?.phase === 'reactivated'), [telecomSales]);
  const pendingSupport = useMemo(() => supportTickets.filter((t) => t.status === 'pending' || t.status === 'forwarded' || t.status === 'auto_forwarded' || t.status === 'queued_off_hours'), [supportTickets]);
  const resolvedSupport = useMemo(() => supportTickets.filter((t) => t.status === 'replied' || t.status === 'closed' || t.status === 'recharged_by_support' || t.status === 'update_done'), [supportTickets]);
  const pendingUnrecognized = useMemo(() => unrecognizedMessages.filter((m) => m.status === 'pending'), [unrecognizedMessages]);
  const resolvedUnrecognized = useMemo(() => unrecognizedMessages.filter((m) => m.status !== 'pending'), [unrecognizedMessages]);
  const unmatchedNotifications = useMemo(() => transferNotifications.filter((n) => n.status === 'unmatched'), [transferNotifications]);
  const matchedNotifications = useMemo(() => transferNotifications.filter((n) => n.status !== 'unmatched'), [transferNotifications]);

  const handleConfirmTransfer = (n: TransferNotification) => {
    Alert.alert(
      'تأكيد التحويل',
      `هل تريد تأكيد تحويل من ${n.senderName} بمبلغ ${n.amount} ${n.currency}؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'تأكيد', onPress: () => confirmTransferNotification(n.id, n.matchedPendingOpId, n.matchedSaleId) },
      ],
    );
  };

  const handleRejectTransfer = (n: TransferNotification) => {
    Alert.alert(
      'رفض التحويل',
      `هل تريد رفض هذا الإشعار؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'رفض', style: 'destructive', onPress: () => rejectTransferNotification(n.id, 'رفض يدوي') },
      ],
    );
  };

  const handleDeleteTransfer = (n: TransferNotification) => {
    Alert.alert(
      'حذف',
      `هل تريد حذف إشعار التحويل من ${n.senderName}؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteTransferNotification(n.id) },
      ],
    );
  };

  const handleExecute = (op: PendingOperation) => {
    executePendingOperation(op.id);
    Alert.alert('تم التنفيذ', 'تم نقل العملية إلى السجل. يمكنك الآن فتح شاشة البيع لإتمام المعاملة.');
  };

  const handleCancel = (op: PendingOperation) => {
    Alert.alert(
      'إلغاء العملية',
      `هل تريد إلغاء العملية للرقم ${op.simNumber}؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إلغاء العملية', style: 'destructive', onPress: () => deletePendingOperation(op.id) },
      ],
    );
  };

  const handleExecuteFreeze = (req: FreezeRequest) => {
    Alert.alert(
      'تنفيذ التجميد',
      `سيتم تجميد اشتراك ${req.customerName} - ${req.simNumber}.\nالاشتراك سيتحول من "نشط" إلى "مجمّد".`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'تنفيذ التجميد', style: 'destructive', onPress: () => executeFreezeRequest(req.id) },
      ],
    );
  };

  const handleCancelFreeze = (req: FreezeRequest) => {
    Alert.alert(
      'إلغاء طلب التجميد',
      `هل تريد إلغاء طلب تجميد ${req.customerName}؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إلغاء الطلب', onPress: () => cancelFreezeRequest(req.id) },
      ],
    );
  };

  const handleReactivate = (sale: TelecomSale) => {
    if (!sale.escalationState) return;
    const reason = sale.escalationState.reactivationReason || 'تم الدفع';
    Alert.alert(
      'إعادة التفعيل',
      `سيتم إعادة تفعيل اشتراك ${sale.customerName} - ${sale.simNumber}.\nالسبب: ${reason}`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إعادة التفعيل', onPress: () => reactivateSale(sale.id, reason) },
      ],
    );
  };

  const handleOpenWhatsApp = async (ticket: SupportTicket) => {
    setWaLoadingId(ticket.id);
    const url = openWhatsApp(ticket.companySupportPhone, ticket.supportMessage);
    try {
      await Linking.openURL(url);
      updateSupportTicket(ticket.id, { status: 'forwarded', whatsappOpened: true });
    } catch {
      Alert.alert('خطأ', 'تعذر فتح واتس أب. تأكد من تثبيت التطبيق.');
    }
    setWaLoadingId(null);
  };

  const handleForwardReply = () => {
    if (!replyModal || !replyText.trim()) return;
    forwardSupportReply(replyModal.id, replyText.trim());
    setReplyModal(null);
    setReplyText('');
  };

  const handleConfirmRecharge = (ticket: SupportTicket) => {
    Alert.alert(
      'تأكيد الشحن',
      `هل تم شحن الرقم ${ticket.simNumber} من الدعم الفني؟\nسيتم إرسال رسالة تأكيد للزبون.`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'تأكيد الشحن', onPress: () => confirmRechargeBySupport(ticket.id, '') },
      ],
    );
  };

  const handleDeleteTicket = (ticket: SupportTicket) => {
    Alert.alert(
      'حذف الطلب',
      `هل تريد حذف طلب الدعم الفني لـ ${ticket.customerName}؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteSupportTicket(ticket.id) },
      ],
    );
  };

  const handleTeachReply = () => {
    if (!teachModal || !teachReply.trim() || !teachKeywords.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال الكلمات المفتاحية والرد');
      return;
    }
    const keywords = teachKeywords.split(',').map((k) => k.trim()).filter(Boolean);
    learnFromMessage(teachModal.id, teachReply.trim(), keywords);
    setTeachModal(null);
    setTeachReply('');
    setTeachKeywords('');
  };

  const handleIgnoreMessage = (msg: UnrecognizedMessage) => {
    Alert.alert(
      'تجاهل الرسالة',
      `هل تريد تجاهل هذه الرسالة دون تعلم رد لها؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'تجاهل', onPress: () => ignoreUnrecognizedMessage(msg.id) },
      ],
    );
  };

  const handleDeleteUnrecognized = (msg: UnrecognizedMessage) => {
    Alert.alert(
      'حذف',
      `هل تريد حذف هذه الرسالة؟`,
      [
        { text: 'تراجع', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => deleteUnrecognizedMessage(msg.id) },
      ],
    );
  };

  const renderOp = (op: PendingOperation) => {
    const sourceIcon = op.source === 'sms' ? <MessageSquare size={16} color={colors.info} strokeWidth={2} /> : op.source === 'whatsapp' ? <MessageSquare size={16} color={colors.success} strokeWidth={2} /> : <Smartphone size={16} color={colors.primary} strokeWidth={2} />;
    const sourceLabel = op.source === 'sms' ? 'SMS' : op.source === 'whatsapp' ? 'واتساب' : 'يدوي';
    const company = telecomCompanies.find((c) => c.id === op.companyGuess);

    return (
      <View key={op.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.opCardTop}>
          <View style={[styles.opSource, { backgroundColor: colors.surfaceAlt }]}>
            {sourceIcon}
            <Text style={[styles.opSourceText, { color: colors.textSecondary }]}>{sourceLabel}</Text>
          </View>
          <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(op.createdAt)}</Text>
        </View>

        <View style={styles.opBody}>
          <View style={styles.opRow}>
            <Smartphone size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>رقم الشريحة:</Text>
            <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{op.simNumber}</Text>
          </View>
          <View style={styles.opRow}>
            <Phone size={16} color={colors.info} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>المرسل:</Text>
            <Text style={[styles.opValue, { color: colors.text }]}>{op.senderPhone}</Text>
          </View>
          {op.senderName ? (
            <View style={styles.opRow}>
              <User size={16} color={colors.accent} strokeWidth={2} />
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الاسم:</Text>
              <Text style={[styles.opValue, { color: colors.text }]}>{op.senderName}</Text>
            </View>
          ) : null}
          {company ? (
            <View style={styles.opRow}>
              <View style={[styles.companyDot, { backgroundColor: company.color }]} />
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الشركة:</Text>
              <Text style={[styles.opValue, { color: colors.text }]}>{company.name}</Text>
            </View>
          ) : null}
          <View style={styles.opRow}>
            <User size={16} color={op.customerMatched ? colors.success : colors.warning} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الزبون:</Text>
            <Text style={[styles.opValue, { color: op.customerMatched ? colors.success : colors.warning }]}>
              {op.customerMatched ? op.customerName : 'زبون جديد'}
            </Text>
          </View>
        </View>

        {op.originalMessage ? (
          <View style={[styles.opMessage, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.opMessageText, { color: colors.textSecondary }]} numberOfLines={3}>
              {op.originalMessage}
            </Text>
          </View>
        ) : null}

        {op.status === 'pending' ? (
          <View style={styles.opActions}>
            <TouchableOpacity
              onPress={() => handleExecute(op)}
              style={[styles.opBtn, { backgroundColor: colors.primary }]}
            >
              <Check size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.opBtnText}>تنفيذ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleCancel(op)}
              style={[styles.opBtn, { backgroundColor: colors.danger + '15' }]}
            >
              <X size={16} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.opBtnText, { color: colors.danger }]}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.opStatusBadge, { backgroundColor: op.status === 'executed' ? colors.success + '15' : colors.danger + '15' }]}>
            <Check size={14} color={op.status === 'executed' ? colors.success : colors.danger} strokeWidth={2} />
            <Text style={[styles.opStatusText, { color: op.status === 'executed' ? colors.success : colors.danger }]}>
              {op.status === 'executed' ? 'تم التنفيذ' : 'ملغاة'}
              {op.executedAt ? ` - ${formatDateTime(op.executedAt)}` : ''}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderFreezeRequest = (req: FreezeRequest) => (
    <View key={req.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: colors.danger + '40' }]}>
      <View style={styles.opCardTop}>
        <View style={[styles.opSource, { backgroundColor: colors.danger + '15' }]}>
          <Snowflake size={16} color={colors.danger} strokeWidth={2} />
          <Text style={[styles.opSourceText, { color: colors.danger }]}>طلب تجميد</Text>
        </View>
        <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(req.createdAt)}</Text>
      </View>

      <View style={styles.opBody}>
        <View style={styles.opRow}>
          <Smartphone size={16} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>رقم الشريحة:</Text>
          <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{req.simNumber}</Text>
        </View>
        <View style={styles.opRow}>
          <User size={16} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الزبون:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{req.customerName}</Text>
        </View>
        <View style={styles.opRow}>
          <Phone size={16} color={colors.info} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الهاتف:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{req.customerPhone}</Text>
        </View>
        <View style={styles.opRow}>
          <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>المتبقي:</Text>
          <Text style={[styles.opValue, { color: colors.warning, fontFamily: 'Cairo-Bold' }]}>{formatCurrency(req.remaining)}</Text>
        </View>
        <View style={styles.opRow}>
          <Clock size={16} color={colors.textMuted} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>عدد التذكيرات:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{req.remindersSent}</Text>
        </View>
      </View>

      {req.status === 'pending' ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => handleExecuteFreeze(req)}
            style={[styles.opBtn, { backgroundColor: colors.danger }]}
          >
            <Snowflake size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>تنفيذ التجميد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleCancelFreeze(req)}
            style={[styles.opBtn, { backgroundColor: colors.surfaceAlt }]}
          >
            <X size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.opBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.opStatusBadge, { backgroundColor: req.status === 'executed' ? colors.danger + '15' : colors.surfaceAlt }]}>
          {req.status === 'executed' ? (
            <>
              <Snowflake size={14} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.opStatusText, { color: colors.danger }]}>
                تم التجميد{req.executedAt ? ` - ${formatDateTime(req.executedAt)}` : ''}
              </Text>
            </>
          ) : (
            <>
              <X size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.opStatusText, { color: colors.textMuted }]}>تم الإلغاء</Text>
            </>
          )}
        </View>
      )}
    </View>
  );

  const renderReactivation = (sale: TelecomSale) => {
    const st = sale.escalationState!;
    return (
      <View key={sale.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: colors.success + '40' }]}>
        <View style={styles.opCardTop}>
          <View style={[styles.opSource, { backgroundColor: colors.success + '15' }]}>
            <RefreshCw size={16} color={colors.success} strokeWidth={2} />
            <Text style={[styles.opSourceText, { color: colors.success }]}>إعادة تفعيل</Text>
          </View>
          <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(st.updatedAt)}</Text>
        </View>

        <View style={styles.opBody}>
          <View style={styles.opRow}>
            <Smartphone size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>رقم الشريحة:</Text>
            <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{sale.simNumber}</Text>
          </View>
          <View style={styles.opRow}>
            <User size={16} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الزبون:</Text>
            <Text style={[styles.opValue, { color: colors.text }]}>{sale.customerName}</Text>
          </View>
          <View style={styles.opRow}>
            <Phone size={16} color={colors.info} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الهاتف:</Text>
            <Text style={[styles.opValue, { color: colors.text }]}>{sale.customerPhone}</Text>
          </View>
          <View style={styles.opRow}>
            <CalendarClock size={16} color={colors.success} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>السبب:</Text>
            <Text style={[styles.opValue, { color: colors.success }]}>{st.reactivationReason || 'تم الدفع'}</Text>
          </View>
          {st.customerReplyDate ? (
            <View style={styles.opRow}>
              <CalendarClock size={16} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>موعد الدفع:</Text>
              <Text style={[styles.opValue, { color: colors.warning }]}>{formatDateTime(st.customerReplyDate)}</Text>
            </View>
          ) : null}
        </View>

        {st.customerReplyText ? (
          <View style={[styles.opMessage, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.opMessageText, { color: colors.textSecondary }]} numberOfLines={3}>
              {st.customerReplyText}
            </Text>
          </View>
        ) : null}

        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => handleReactivate(sale)}
            style={[styles.opBtn, { backgroundColor: colors.success }]}
          >
            <RefreshCw size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>إعادة التفعيل</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSupportTicket = (ticket: SupportTicket) => (
    <View key={ticket.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: colors.info + '40' }]}>
      <View style={styles.opCardTop}>
        <View style={[styles.opSource, { backgroundColor: colors.info + '15' }]}>
          <Headphones size={16} color={colors.info} strokeWidth={2} />
          <Text style={[styles.opSourceText, { color: colors.info }]}>دعم فني</Text>
        </View>
        <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(ticket.createdAt)}</Text>
      </View>

      <View style={styles.opBody}>
        <View style={styles.opRow}>
          <Smartphone size={16} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>رقم الشريحة:</Text>
          <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{ticket.simNumber}</Text>
        </View>
        <View style={styles.opRow}>
          <User size={16} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الزبون:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{ticket.customerName || ticket.customerPhone}</Text>
        </View>
        <View style={styles.opRow}>
          <Headphones size={16} color={colors.info} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الدعم:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{ticket.companySupportPhone}</Text>
        </View>
      </View>

      <View style={[styles.opMessage, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.opMessageLabel, { color: colors.textMuted }]}>رسالة الزبون:</Text>
        <Text style={[styles.opMessageText, { color: colors.textSecondary }]} numberOfLines={3}>
          {ticket.originalMessage}
        </Text>
      </View>

      <View style={[styles.opMessage, { backgroundColor: colors.info + '10' }]}>
        <Text style={[styles.opMessageLabel, { color: colors.info }]}>رسالة الدعم الفني:</Text>
        <Text style={[styles.opMessageText, { color: colors.text }]}>
          {ticket.supportMessage}
        </Text>
      </View>

      {ticket.status === 'replied' && ticket.customerReplySent ? (
        <View style={[styles.opMessage, { backgroundColor: colors.success + '10' }]}>
          <Text style={[styles.opMessageLabel, { color: colors.success }]}>الرد المرسل للزبون:</Text>
          <Text style={[styles.opMessageText, { color: colors.text }]}>
            {ticket.customerReplySent}
          </Text>
        </View>
      ) : null}

      {ticket.autoForwarded && (ticket.status === 'auto_forwarded') ? (
        <View style={[styles.opMessage, { backgroundColor: colors.warning + '10' }]}>
          <Text style={[styles.opMessageLabel, { color: colors.warning }]}>
            {ticket.forwardReason === 'timeout' ? 'تم التحويل التلقائي بعد انتهاء المهلة' : ticket.forwardReason === 'off_hours' ? 'تم التحويل التلقائي عند بدء الدوام' : 'تم التحويل التلقائي للاستعجال'}
          </Text>
        </View>
      ) : null}

      {ticket.status === 'queued_off_hours' ? (
        <View style={[styles.opMessage, { backgroundColor: colors.warning + '10' }]}>
          <Text style={[styles.opMessageLabel, { color: colors.warning }]}>معلق خارج وقت الدوام</Text>
          <Text style={[styles.opMessageText, { color: colors.textSecondary }]}>
            سيتم تحويل الطلب للدعم الفني تلقائياً عند بدء دوام الوكيل
          </Text>
          {ticket.customerReplySent ? (
            <Text style={[styles.opMessageText, { color: colors.textMuted, marginTop: 4 }]}>
              تم إشعار الزبون: {ticket.customerReplySent}
            </Text>
          ) : null}
        </View>
      ) : null}

      {ticket.status === 'pending' && (ticket.forwardReason === 'update_request' || ticket.forwardReason === 'update_not_working') ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => confirmUpdateDone(ticket.id)}
            style={[styles.opBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Check size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>تم</Text>
          </TouchableOpacity>
        </View>
      ) : ticket.status === 'pending' ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => handleOpenWhatsApp(ticket)}
            disabled={waLoadingId === ticket.id}
            style={[styles.opBtn, { backgroundColor: colors.success, opacity: waLoadingId === ticket.id ? 0.6 : 1 }]}
          >
            {waLoadingId === ticket.id ? (
              <RefreshCw size={16} color="#FFFFFF" strokeWidth={2} />
            ) : (
              <MessageSquare size={16} color="#FFFFFF" strokeWidth={2} />
            )}
            <Text style={styles.opBtnText}>{waLoadingId === ticket.id ? 'جارٍ...' : 'فتح واتس أب'}</Text>
          </TouchableOpacity>
        </View>
      ) : ticket.status === 'forwarded' ? (
        <View style={styles.opActions}>
          <View style={[styles.opStatusBadge, { backgroundColor: colors.info + '15', flex: 1 }]}>
            <Check size={14} color={colors.info} strokeWidth={2} />
            <Text style={[styles.opStatusText, { color: colors.info }]}>تم الإرسال للدعم</Text>
          </View>
          <TouchableOpacity
            onPress={() => { setReplyModal(ticket); setReplyText(''); }}
            style={[styles.opBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Send size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>إرسال رد للزبون</Text>
          </TouchableOpacity>
        </View>
      ) : ticket.status === 'auto_forwarded' ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => handleOpenWhatsApp(ticket)}
            disabled={waLoadingId === ticket.id}
            style={[styles.opBtn, { backgroundColor: colors.success, flex: 1, opacity: waLoadingId === ticket.id ? 0.6 : 1 }]}
          >
            {waLoadingId === ticket.id ? (
              <RefreshCw size={16} color="#FFFFFF" strokeWidth={2} />
            ) : (
              <MessageSquare size={16} color="#FFFFFF" strokeWidth={2} />
            )}
            <Text style={styles.opBtnText}>{waLoadingId === ticket.id ? 'جارٍ...' : 'فتح واتس أب'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleConfirmRecharge(ticket)}
            style={[styles.opBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Check size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>تأكيد الشحن</Text>
          </TouchableOpacity>
        </View>
      ) : ticket.status === 'queued_off_hours' ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => handleOpenWhatsApp(ticket)}
            disabled={waLoadingId === ticket.id}
            style={[styles.opBtn, { backgroundColor: colors.success, flex: 1, opacity: waLoadingId === ticket.id ? 0.6 : 1 }]}
          >
            {waLoadingId === ticket.id ? (
              <RefreshCw size={16} color="#FFFFFF" strokeWidth={2} />
            ) : (
              <MessageSquare size={16} color="#FFFFFF" strokeWidth={2} />
            )}
            <Text style={styles.opBtnText}>{waLoadingId === ticket.id ? 'جارٍ...' : 'تحويل يدوي'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleConfirmRecharge(ticket)}
            style={[styles.opBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Check size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>تأكيد الشحن</Text>
          </TouchableOpacity>
        </View>
      ) : ticket.status === 'recharged_by_support' ? (
        <View style={[styles.opStatusBadge, { backgroundColor: colors.success + '15' }]}>
          <Check size={14} color={colors.success} strokeWidth={2} />
          <Text style={[styles.opStatusText, { color: colors.success }]}>
            تم الشحن من الدعم الفني{ticket.rechargeConfirmedAt ? ` - ${formatDateTime(ticket.rechargeConfirmedAt)}` : ''}
          </Text>
        </View>
      ) : ticket.status === 'update_done' ? (
        <View style={[styles.opStatusBadge, { backgroundColor: colors.success + '15' }]}>
          <Check size={14} color={colors.success} strokeWidth={2} />
          <Text style={[styles.opStatusText, { color: colors.success }]}>
            تم التحديث{ticket.rechargeConfirmedAt ? ` - ${formatDateTime(ticket.rechargeConfirmedAt)}` : ''}
          </Text>
        </View>
      ) : (
        <View style={[styles.opStatusBadge, { backgroundColor: colors.success + '15' }]}>
          <Check size={14} color={colors.success} strokeWidth={2} />
          <Text style={[styles.opStatusText, { color: colors.success }]}>
            تم الرد{ticket.updatedAt ? ` - ${formatDateTime(ticket.updatedAt)}` : ''}
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => handleDeleteTicket(ticket)}
        style={styles.deleteBtn}
      >
        <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );

  const renderUnrecognizedMessage = (msg: UnrecognizedMessage) => (
    <View key={msg.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }]}>
      <View style={styles.opCardTop}>
        <View style={[styles.opSource, { backgroundColor: colors.warning + '15' }]}>
          <Sparkles size={16} color={colors.warning} strokeWidth={2} />
          <Text style={[styles.opSourceText, { color: colors.warning }]}>رسالة غير مفهومة</Text>
        </View>
        <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(msg.createdAt)}</Text>
      </View>

      <View style={styles.opBody}>
        <View style={styles.opRow}>
          <Phone size={16} color={colors.info} strokeWidth={2} />
          <Text style={[styles.opLabel, { color: colors.textSecondary }]}>المرسل:</Text>
          <Text style={[styles.opValue, { color: colors.text }]}>{msg.senderPhone}</Text>
        </View>
        {msg.senderName ? (
          <View style={styles.opRow}>
            <User size={16} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>الاسم:</Text>
            <Text style={[styles.opValue, { color: colors.text }]}>{msg.senderName}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.opMessage, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.opMessageLabel, { color: colors.textMuted }]}>رسالة الزبون:</Text>
        <Text style={[styles.opMessageText, { color: colors.text }]}>
          {msg.originalMessage}
        </Text>
      </View>

      {msg.status === 'pending' ? (
        <View style={styles.opActions}>
          <TouchableOpacity
            onPress={() => {
              setTeachModal(msg);
              setTeachReply('');
              setTeachKeywords(msg.originalMessage.split(' ').slice(0, 3).join(', '));
            }}
            style={[styles.opBtn, { backgroundColor: colors.primary }]}
          >
            <GraduationCap size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.opBtnText}>تعليم الرد</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleIgnoreMessage(msg)}
            style={[styles.opBtn, { backgroundColor: colors.surfaceAlt }]}
          >
            <X size={16} color={colors.textSecondary} strokeWidth={2} />
            <Text style={[styles.opBtnText, { color: colors.textSecondary }]}>تجاهل</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.opStatusBadge, { backgroundColor: msg.status === 'learned' ? colors.success + '15' : colors.surfaceAlt }]}>
          {msg.status === 'learned' ? (
            <>
              <Check size={14} color={colors.success} strokeWidth={2} />
              <Text style={[styles.opStatusText, { color: colors.success }]}>
                تم تعلم رد تلقائي{msg.resolvedAt ? ` - ${formatDateTime(msg.resolvedAt)}` : ''}
              </Text>
            </>
          ) : (
            <>
              <X size={14} color={colors.textMuted} strokeWidth={2} />
              <Text style={[styles.opStatusText, { color: colors.textMuted }]}>تم التجاهل</Text>
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={() => handleDeleteUnrecognized(msg)}
        style={styles.deleteBtn}
      >
        <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );

  const renderTransferNotification = (n: TransferNotification) => {
    const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
      unmatched: { label: 'غير مطابق', color: colors.warning, bg: colors.warning + '15' },
      matched: { label: 'مطابق', color: colors.info, bg: colors.info + '15' },
      confirmed: { label: 'مؤكد', color: colors.success, bg: colors.success + '15' },
      rejected: { label: 'مرفوض', color: colors.danger, bg: colors.danger + '15' },
      expired: { label: 'منتهي', color: colors.textMuted, bg: colors.surfaceAlt },
    };
    const st = statusConfig[n.status] ?? statusConfig.unmatched;
    const matchedSale = n.matchedSaleId ? telecomSales.find((s) => s.id === n.matchedSaleId) : null;

    return (
      <View key={n.id} style={[styles.opCard, { backgroundColor: colors.surface, borderColor: st.color + '40' }]}>
        <View style={styles.opCardTop}>
          <View style={[styles.opSource, { backgroundColor: st.bg }]}>
            <Banknote size={16} color={st.color} strokeWidth={2} />
            <Text style={[styles.opSourceText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={[styles.opTime, { color: colors.textMuted }]}>{formatDateTime(n.receivedAt)}</Text>
        </View>

        <View style={styles.opBody}>
          <View style={styles.opRow}>
            <User size={16} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>المرسل:</Text>
            <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{n.senderName}</Text>
          </View>
          <View style={styles.opRow}>
            <Banknote size={16} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.opLabel, { color: colors.textSecondary }]}>المبلغ:</Text>
            <Text style={[styles.opValue, { color: colors.text, fontFamily: 'Cairo-Bold' }]}>{n.amount} {n.currency}</Text>
          </View>
          {n.bankName ? (
            <View style={styles.opRow}>
              <View style={[styles.companyDot, { backgroundColor: colors.info }]} />
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>البنك:</Text>
              <Text style={[styles.opValue, { color: colors.text }]}>{n.bankName}</Text>
            </View>
          ) : null}
          {matchedSale ? (
            <View style={styles.opRow}>
              <Smartphone size={16} color={colors.success} strokeWidth={2} />
              <Text style={[styles.opLabel, { color: colors.textSecondary }]}>مطابق لـ:</Text>
              <Text style={[styles.opValue, { color: colors.success }]}>{matchedSale.customerName} - {matchedSale.simNumber}</Text>
            </View>
          ) : null}
        </View>

        {n.rawSms ? (
          <View style={[styles.opMessage, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.opMessageText, { color: colors.textSecondary }]} numberOfLines={3}>
              {n.rawSms}
            </Text>
          </View>
        ) : null}

        {n.status === 'matched' ? (
          <View style={styles.opActions}>
            <TouchableOpacity
              onPress={() => handleConfirmTransfer(n)}
              style={[styles.opBtn, { backgroundColor: colors.success }]}
            >
              <Check size={16} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.opBtnText}>تأكيد</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleRejectTransfer(n)}
              style={[styles.opBtn, { backgroundColor: colors.danger + '15' }]}
            >
              <X size={16} color={colors.danger} strokeWidth={2} />
              <Text style={[styles.opBtnText, { color: colors.danger }]}>رفض</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => handleDeleteTransfer(n)}
          style={styles.deleteBtn}
        >
          <Trash2 size={14} color={colors.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  };

  const tabs: { key: TabKey; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'بانتظار', count: pending.length, icon: <Inbox size={16} color={tab === 'pending' ? colors.primary : colors.textMuted} strokeWidth={2} /> },
    { key: 'freeze', label: 'تجميد', count: pendingFreeze.length, icon: <Snowflake size={16} color={tab === 'freeze' ? colors.danger : colors.textMuted} strokeWidth={2} /> },
    { key: 'support', label: 'دعم فني', count: pendingSupport.length, icon: <Headphones size={16} color={tab === 'support' ? colors.info : colors.textMuted} strokeWidth={2} /> },
    { key: 'learning', label: 'تعلم', count: pendingUnrecognized.length, icon: <GraduationCap size={16} color={tab === 'learning' ? colors.warning : colors.textMuted} strokeWidth={2} /> },
    { key: 'reactivation', label: 'إعادة تفعيل', count: reactivatedSales.length, icon: <RefreshCw size={16} color={tab === 'reactivation' ? colors.success : colors.textMuted} strokeWidth={2} /> },
    { key: 'transfers', label: 'تحويلات', count: unmatchedNotifications.length, icon: <Banknote size={16} color={tab === 'transfers' ? colors.primary : colors.textMuted} strokeWidth={2} /> },
    { key: 'executed', label: 'السجل', count: executed.length + executedFreeze.length + resolvedSupport.length, icon: <ArrowRightCircle size={16} color={tab === 'executed' ? colors.primary : colors.textMuted} strokeWidth={2} /> },
  ];

  const isEmpty = (tab === 'pending' && pending.length === 0) ||
    (tab === 'freeze' && pendingFreeze.length === 0) ||
    (tab === 'support' && pendingSupport.length === 0) ||
    (tab === 'learning' && pendingUnrecognized.length === 0) ||
    (tab === 'reactivation' && reactivatedSales.length === 0) ||
    (tab === 'transfers' && unmatchedNotifications.length === 0 && matchedNotifications.length === 0) ||
    (tab === 'executed' && executed.length === 0 && executedFreeze.length === 0 && resolvedSupport.length === 0 && resolvedUnrecognized.length === 0);

  const emptyMessages: Record<TabKey, { title: string; sub: string }> = {
    pending: { title: 'لا توجد عمليات بانتظار التنفيذ', sub: 'سيتم عرض العمليات المستخرجة من الرسائل هنا' },
    freeze: { title: 'لا توجد طلبات تجميد', sub: 'تظهر هنا بعد 3 تذكيرات بدون رد من الزبون' },
    support: { title: 'لا توجد طلبات دعم فني', sub: 'تظهر هنا عند إبلاغ زبون عن مشكلة في الاتصال' },
    learning: { title: 'لا توجد رسائل بحاجة لتعلم', sub: 'عند وصول رسالة لم يفهمها البرنامج، تظهر هنا لتعليمه الرد المناسب' },
    reactivation: { title: 'لا توجد عمليات لإعادة التفعيل', sub: 'عندما يدفع الزبون أو يحدد موعد، تظهر العملية هنا' },
    executed: { title: 'لا يوجد سجل بعد', sub: 'العمليات المنفذة أو الملغاة ستظهر هنا' },
    transfers: { title: 'لا توجد إشعارات تحويل', sub: 'إشعارات التحويل البنكي الواردة تظهر هنا للمطابقة' },
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabBarContent}
        bounces={false}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, { borderBottomColor: tab === t.key ? colors.primary : 'transparent' }]}
          >
            {t.icon}
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.textMuted }]}>
              {t.label}
            </Text>
            {t.count > 0 ? (
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? colors.primary : colors.surfaceAlt }]}>
                <Text style={[styles.tabBadgeText, { color: tab === t.key ? '#FFFFFF' : colors.textSecondary }]}>
                  {t.count}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.listContent}>
        {isEmpty ? (
          <View style={styles.emptyState}>
            <Inbox size={48} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.textMuted }]}>
              {emptyMessages[tab].title}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {emptyMessages[tab].sub}
            </Text>
          </View>
        ) : (
          <>
            {tab === 'pending' && pending.map(renderOp)}
            {tab === 'freeze' && pendingFreeze.map(renderFreezeRequest)}
            {tab === 'support' && pendingSupport.map(renderSupportTicket)}
            {tab === 'learning' && pendingUnrecognized.map(renderUnrecognizedMessage)}
            {tab === 'reactivation' && reactivatedSales.map(renderReactivation)}
            {tab === 'transfers' && (
              <>
                {unmatchedNotifications.map(renderTransferNotification)}
                {matchedNotifications.map(renderTransferNotification)}
              </>
            )}
            {tab === 'executed' && (
              <>
                {resolvedUnrecognized.map(renderUnrecognizedMessage)}
                {resolvedSupport.map(renderSupportTicket)}
                {executedFreeze.map(renderFreezeRequest)}
                {executed.map(renderOp)}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Reply Forward Modal */}
      <Modal
        visible={replyModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setReplyModal(null); setReplyText(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              إرسال رد الدعم الفني للزبون
            </Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              الزبون: {replyModal?.customerName || replyModal?.customerPhone}
            </Text>
            <View style={[styles.modalField, { borderColor: colors.border }]}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>نص الرد</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="أدخل رد الدعم الفني هنا..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setReplyModal(null); setReplyText(''); }}
                style={[styles.modalCancel, { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleForwardReply}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
              >
                <Send size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.modalSaveText}>إرسال</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Teach Reply Modal */}
      <Modal
        visible={teachModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setTeachModal(null); setTeachReply(''); setTeachKeywords(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              تعليم رد تلقائي
            </Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              رسالة الزبون: {teachModal?.originalMessage}
            </Text>
            <View style={[styles.modalField, { borderColor: colors.border }]}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>الكلمات المفتاحية (افصل بفاصلة)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border, minHeight: 44 }]}
                value={teachKeywords}
                onChangeText={setTeachKeywords}
                placeholder="رقم تحويل, رقم الحساب, تحويل"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={[styles.opMessageText, { color: colors.textMuted, marginTop: 6, fontSize: 12 }]}>عند وصول رسالة تحتوي على أي من هذه الكلمات، سيتم الرد تلقائياً</Text>
            </View>
            <View style={[styles.modalField, { borderColor: colors.border }]}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>الرد</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
                value={teachReply}
                onChangeText={setTeachReply}
                placeholder="أدخل الرد الذي تريد إرساله تلقائياً..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setTeachModal(null); setTeachReply(''); setTeachKeywords(''); }}
                style={[styles.modalCancel, { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleTeachReply}
                style={[styles.modalSave, { backgroundColor: colors.primary }]}
              >
                <GraduationCap size={18} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.modalSaveText}>تعليم وإرسال</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexGrow: 0, borderBottomWidth: 1 },
  tabBarContent: { flexDirection: 'row-reverse', alignItems: 'stretch' },
  tab: { width: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderBottomWidth: 3, paddingHorizontal: 8 },
  tabText: { fontSize: 12, fontFamily: 'Cairo-SemiBold', textAlign: 'center' },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { fontSize: 10, fontFamily: 'Cairo-Bold' },
  listContent: { padding: 16, paddingBottom: 40 },
  opCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  opCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  opSource: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  opSourceText: { fontSize: 12, fontFamily: 'Cairo-SemiBold' },
  opTime: { fontSize: 12, fontFamily: 'Cairo-Regular' },
  opBody: { gap: 8, marginBottom: 10 },
  opRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  opLabel: { fontSize: 14, fontFamily: 'Cairo-Regular' },
  opValue: { fontSize: 14, fontFamily: 'Cairo-SemiBold' },
  companyDot: { width: 10, height: 10, borderRadius: 5 },
  opMessage: { borderRadius: 10, padding: 10, marginBottom: 10 },
  opMessageLabel: { fontSize: 12, fontFamily: 'Cairo-SemiBold', marginBottom: 4 },
  opMessageText: { fontSize: 13, fontFamily: 'Cairo-Regular', lineHeight: 20 },
  opActions: { flexDirection: 'row', gap: 10 },
  opBtn: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  opBtnText: { fontSize: 14, fontFamily: 'Cairo-SemiBold', color: '#FFFFFF' },
  opStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' },
  opStatusText: { fontSize: 13, fontFamily: 'Cairo-SemiBold' },
  deleteBtn: { position: 'absolute', top: 12, left: 12, padding: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Cairo-SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Cairo-Regular', textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalSheet: { width: '90%', maxWidth: 440, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: 'Cairo-Bold', marginBottom: 6 },
  modalSub: { fontSize: 14, fontFamily: 'Cairo-Regular', marginBottom: 16 },
  modalField: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  modalLabel: { fontSize: 14, fontFamily: 'Cairo-SemiBold', marginBottom: 8 },
  modalInput: { borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'Cairo-Regular', minHeight: 80, borderWidth: 1, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalCancelText: { fontSize: 15, fontFamily: 'Cairo-SemiBold' },
  modalSave: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  modalSaveText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Cairo-SemiBold' },
});
