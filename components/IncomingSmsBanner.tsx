import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Platform } from 'react-native';
import { X, Send, MessageSquare, Check } from 'lucide-react-native';
import { useTheme } from '@/lib/theme-context';
import { useApp } from '@/lib/app-context';
import type { IncomingSms } from '@/lib/use-incoming-sms';

interface IncomingSmsBannerProps {
  message: IncomingSms | null;
  onDismiss: () => void;
}

export function IncomingSmsBanner({ message, onDismiss }: IncomingSmsBannerProps) {
  const { colors } = useTheme();
  const { logOutboundSms } = useApp();
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReply = useCallback(async () => {
    if (!message || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const result = await logOutboundSms(message.senderPhone, replyText.trim(), 'sms');
      if (result.success) {
        setSent(true);
        setTimeout(() => {
          setSent(false);
          setReplyText('');
          onDismiss();
        }, 1500);
      } else {
        setError(result.error ?? 'فشل الإرسال');
      }
    } catch {
      setError('تعذر إرسال الرد');
    } finally {
      setSending(false);
    }
  }, [message, replyText, onDismiss]);

  if (!message) return null;

  return (
    <View style={[styles.overlay, Platform.OS === 'web' && styles.webOverlay]} pointerEvents="box-none">
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.primary + '30' }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
              <MessageSquare size={18} color={colors.primary} strokeWidth={2} />
            </View>
            <View>
              <Text style={[styles.senderName, { color: colors.text }]} numberOfLines={1}>
                {message.senderName || message.senderPhone}
              </Text>
              <Text style={[styles.timeLabel, { color: colors.textMuted }]}>
                رسالة واردة
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Message body */}
        <View style={styles.body}>
          <Text style={[styles.messageText, { color: colors.text }]}>
            {message.message}
          </Text>
        </View>

        {/* Reply section */}
        {sent ? (
          <View style={[styles.sentRow, { backgroundColor: colors.success + '15' }]}>
            <Check size={18} color={colors.success} strokeWidth={2} />
            <Text style={[styles.sentText, { color: colors.success }]}>تم إرسال الرد</Text>
          </View>
        ) : (
          <View style={styles.replyRow}>
            <TextInput
              style={[styles.replyInput, { backgroundColor: colors.surfaceAlt, color: colors.text, borderColor: colors.border }]}
              placeholder="اكتب ردك..."
              placeholderTextColor={colors.textMuted}
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleReply}
              disabled={sending || !replyText.trim()}
              style={[
                styles.sendBtn,
                { backgroundColor: (sending || !replyText.trim()) ? colors.surfaceAlt : colors.primary },
              ]}
              activeOpacity={0.7}
            >
              <Send size={18} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  webOverlay: {
    paddingTop: 20,
  },
  banner: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderName: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Cairo-Bold',
  },
  timeLabel: {
    fontSize: 11,
    fontFamily: 'Cairo-Regular',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 14,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Cairo-Regular',
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 14,
    paddingTop: 0,
  },
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
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    margin: 14,
    marginTop: 0,
    borderRadius: 12,
  },
  sentText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Cairo-SemiBold',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Cairo-Regular',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
});
