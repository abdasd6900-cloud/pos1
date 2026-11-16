import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BusinessHoursConfig, KeywordReply } from '@/types';
import { isStoreOpen } from './business-hours';

const COOLDOWN_KEY_PREFIX = 'sahab_reply_cooldown_';

interface ProcessedMessageResult {
  shouldReply: boolean;
  replyText: string | null;
  matchedKeyword: boolean;
}

const IMAGE_MESSAGE_PATTERNS = [
  /mms/i,
  /image\/(jpeg|png|gif|webp)/i,
  /\bimage\b/i,
  /صورة/i,
  /صوره/i,
  /صور/i,
  /multimedia message/i,
  /\/mms\//i,
];

const VOICE_MESSAGE_PATTERNS = [
  /voice message/i,
  /audio message/i,
  /voice note/i,
  /audio clip/i,
  /رسالة صوتية/i,
  /رساله صوتيه/i,
  /رسالة صوتيه/i,
  /رساله صوتية/i,
  /ملف صوتي/i,
  /ملف صوتى/i,
  /\/voice\//i,
  /\/audio\//i,
];

export function isImageMessage(message: string): boolean {
  return IMAGE_MESSAGE_PATTERNS.some((p) => p.test(message));
}

export function isVoiceMessage(message: string): boolean {
  return VOICE_MESSAGE_PATTERNS.some((p) => p.test(message));
}

export function matchKeyword(message: string, replies: KeywordReply[]): KeywordReply | null {
  const lower = message.toLowerCase().trim();
  for (const reply of replies) {
    if (!reply.active) continue;
    for (const kw of reply.keywords) {
      if (lower.includes(kw.toLowerCase().trim())) {
        return reply;
      }
    }
  }
  return null;
}

export async function canSendAutoReply(phone: string, cooldownMinutes: number): Promise<boolean> {
  if (cooldownMinutes <= 0) return true;
  try {
    const key = COOLDOWN_KEY_PREFIX + phone;
    const last = await AsyncStorage.getItem(key);
    if (!last) return true;
    const elapsed = Date.now() - parseInt(last, 10);
    return elapsed >= cooldownMinutes * 60 * 1000;
  } catch {
    return true;
  }
}

export async function recordAutoReplySent(phone: string): Promise<void> {
  try {
    await AsyncStorage.setItem(COOLDOWN_KEY_PREFIX + phone, Date.now().toString());
  } catch {
    // ignore
  }
}

export async function processIncomingMessage(
  message: string,
  senderPhone: string,
  config: BusinessHoursConfig,
  keywordReplies: KeywordReply[],
  greetingMessage?: string,
): Promise<ProcessedMessageResult> {
  // Image message — ask customer to type the sim number as text
  if (isImageMessage(message)) {
    const canSend = await canSendAutoReply(senderPhone, config.autoReplyCooldownMinutes);
    if (canSend) {
      await recordAutoReplySent(senderPhone);
      return {
        shouldReply: true,
        replyText: 'استلمنا صورتك، لكننا لا نستطيع قراءة الأرقام من الصور تلقائياً. يرجى كتابة رقم الشريحة كنص حتى نتمكن من تنفيذ طلبك.',
        matchedKeyword: false,
      };
    }
    return { shouldReply: false, replyText: null, matchedKeyword: false };
  }

  // Voice message — ask customer to type their request as text
  if (isVoiceMessage(message)) {
    const canSend = await canSendAutoReply(senderPhone, config.autoReplyCooldownMinutes);
    if (canSend) {
      await recordAutoReplySent(senderPhone);
      return {
        shouldReply: true,
        replyText: 'أنا مساعدة آلية ولا أستطيع الاستماع للرسائل الصوتية. يرجى كتابة ما تريد نصاً حتى أتمكن من مساعدتك.',
        matchedKeyword: false,
      };
    }
    return { shouldReply: false, replyText: null, matchedKeyword: false };
  }

  const keywordMatch = matchKeyword(message, keywordReplies);
  if (keywordMatch) {
    const canSend = await canSendAutoReply(senderPhone, config.autoReplyCooldownMinutes);
    if (canSend) {
      await recordAutoReplySent(senderPhone);
      return { shouldReply: true, replyText: keywordMatch.reply, matchedKeyword: true };
    }
    return { shouldReply: false, replyText: null, matchedKeyword: true };
  }

  // No keyword match — send greeting as first reply, then business hours message
  const storeOpen = isStoreOpen(config);
  const canSend = await canSendAutoReply(senderPhone, config.autoReplyCooldownMinutes);
  if (!canSend) {
    return { shouldReply: false, replyText: null, matchedKeyword: false };
  }

  await recordAutoReplySent(senderPhone);

  // If greeting is provided, send it as the first-contact welcome
  if (greetingMessage && greetingMessage.trim()) {
    return { shouldReply: true, replyText: greetingMessage, matchedKeyword: false };
  }

  // Fall back to business hours message
  const replyText = storeOpen ? config.openMessage : config.closedMessage;
  return { shouldReply: true, replyText, matchedKeyword: false };
}

export async function processIncomingCall(
  callerPhone: string,
  config: BusinessHoursConfig,
): Promise<{ shouldReply: boolean; replyText: string | null }> {
  if (!config.enableCallRejection) return { shouldReply: false, replyText: null };
  const storeOpen = isStoreOpen(config);
  if (storeOpen) return { shouldReply: false, replyText: null };

  const canSend = await canSendAutoReply(callerPhone, config.autoReplyCooldownMinutes);
  if (!canSend) return { shouldReply: false, replyText: null };

  await recordAutoReplySent(callerPhone);
  return { shouldReply: true, replyText: config.closedMessage };
}
