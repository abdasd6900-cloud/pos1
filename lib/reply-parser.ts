import type { EscalationPhase } from '@/types';

export interface ParsedReplyResult {
  hasDate: boolean;
  timestamp: number | null;
  isAskingForExtension: boolean;
  isPayingNow: boolean;
  isRefusing: boolean;
  extractedText: string;
}

const DAY_MS = 86400000;

const ARABIC_DAYS: Record<string, number> = {
  'الأحد': 0, 'الاحد': 0,
  'الاثنين': 1, 'الإثنين': 1,
  'الثلاثاء': 2, 'الثلااء': 2,
  'الأربعاء': 3, 'الاربعاء': 3,
  'الخميس': 4,
  'الجمعة': 5, 'الجمعه': 5,
  'السبت': 6,
};

const ARABIC_NUMBERS: Record<string, number> = {
  '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4,
  '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9,
};

function normalizeArabicNumbers(text: string): string {
  let result = text;
  for (const [ar, num] of Object.entries(ARABIC_NUMBERS)) {
    result = result.replaceAll(ar, String(num));
  }
  return result;
}

function getNextWeekday(targetDay: number): number {
  const now = new Date();
  const currentDay = now.getDay();
  let diff = targetDay - currentDay;
  if (diff <= 0) diff += 7;
  return Date.now() + diff * DAY_MS;
}

function parseDateFromString(text: string): number | null {
  // YYYY-MM-DD or DD/MM/YYYY
  const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    return d.getTime();
  }

  const dmyMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    return d.getTime();
  }

  // "بعد X يوم/أيام"
  const afterDaysMatch = text.match(/بعد\s*(\d+)\s*(يوم|أيام|يومين)/);
  if (afterDaysMatch) {
    const days = parseInt(afterDaysMatch[1]);
    return Date.now() + days * DAY_MS;
  }

  // "يومين" = 2 days
  if (text.includes('يومين')) {
    return Date.now() + 2 * DAY_MS;
  }

  // "تمديد X" or "X أيام"
  const extensionMatch = text.match(/(?:تمديد|مهلة|تأجيل)\s*(\d+)/);
  if (extensionMatch) {
    const days = parseInt(extensionMatch[1]);
    return Date.now() + days * DAY_MS;
  }

  const daysOnlyMatch = text.match(/(\d+)\s*(يوم|أيام)/);
  if (daysOnlyMatch) {
    const days = parseInt(daysOnlyMatch[1]);
    return Date.now() + days * DAY_MS;
  }

  // "بعد أسبوع" / "أسبوعين"
  if (text.includes('أسبوعين') || text.includes('اسبوعين')) {
    return Date.now() + 14 * DAY_MS;
  }
  if (text.includes('أسبوع') || text.includes('اسبوع')) {
    return Date.now() + 7 * DAY_MS;
  }

  // "بعد شهر" / "شهر"
  if (text.includes('شهرين') || text.includes('شهرين')) {
    return Date.now() + 60 * DAY_MS;
  }
  if (text.includes('شهر')) {
    return Date.now() + 30 * DAY_MS;
  }

  // Day names: "الجمعة القادم" etc.
  for (const [dayName, dayNum] of Object.entries(ARABIC_DAYS)) {
    if (text.includes(dayName)) {
      return getNextWeekday(dayNum);
    }
  }

  // "بكرة" / "غدا"
  if (text.includes('بكرة') || text.includes('بكره') || text.includes('غدا') || text.includes('غداً')) {
    return Date.now() + DAY_MS;
  }

  // "اليوم"
  if (text.includes('اليوم')) {
    return Date.now();
  }

  return null;
}

const PAYMENT_KEYWORDS = ['دفع', 'دفعت', 'سددت', 'سأدفع', 'تم الدفع', 'دفعت المبلغ', 'حولت', 'سيحول', 'تم التحويل'];
const EXTENSION_KEYWORDS = ['مهلة', 'تمديد', 'تأجيل', 'تاجيل', 'بعد', 'أسبوع', 'اسبوع', 'يوم', 'أيام', 'شهر', 'بكرة', 'بكره', 'غدا', 'غداً', 'اليوم'];
const REFUSE_KEYWORDS = ['لا أستطيع', 'ما بقدر', 'لا يمكنني', 'مستحيل', 'رفض'];

export function parseCustomerReply(rawMessage: string): ParsedReplyResult {
  const message = normalizeArabicNumbers(rawMessage.toLowerCase().trim());

  const timestamp = parseDateFromString(message);
  const isPayingNow = PAYMENT_KEYWORDS.some((kw) => message.includes(kw)) && (message.includes('دفعت') || message.includes('سددت') || message.includes('حولت') || message.includes('تم الدفع') || message.includes('تم التحويل'));
  const isAskingForExtension = EXTENSION_KEYWORDS.some((kw) => message.includes(kw));
  const isRefusing = REFUSE_KEYWORDS.some((kw) => message.includes(kw));

  return {
    hasDate: timestamp !== null,
    timestamp,
    isAskingForExtension,
    isPayingNow,
    isRefusing,
    extractedText: rawMessage.trim(),
  };
}

export function buildAskForDateMessage(customerName: string): string {
  return `عزيزي ${customerName}،\nيرجى تحديد موعد دقيق للدفع (مثلاً: بعد 3 أيام، أو يوم الجمعة القادم، أو تاريخ محدد).\nشكراً لتعاونكم.`;
}

export function buildFreezeWarningMessage(customerName: string): string {
  return `عزيزي ${customerName}،\nنعتذر، سيتم تجميد الاشتراك لوجود مستحقات عليكم وعدم تلقي رد من طرفكم لتحديد موعد الدفع.\nلإعادة التفعيل يرجى التواصل معنا وتحديد موعد للدفع أو تسديد المبلغ المستحق.\nشكراً لتفهمكم.`;
}

export function buildReminderMessage(customerName: string, remaining: number, currency: string, reminderCount: number): string {
  const urgency = reminderCount >= 2 ? 'نرجو السداد العاجل.' : 'يرجى السداد في أقرب وقت.';
  return `عزيزي ${customerName}،\nتذكير رقم ${reminderCount}: يبلغ دينك المتبقي ${remaining.toFixed(2)} ${currency}.\n${urgency}\nإذا كنت بحاجة لمهلة، يرجى تحديد موعد للدفع.\nشكراً لكم.`;
}

export function buildReactivationMessage(customerName: string, reason: string): string {
  return `عزيزي ${customerName}،\n${reason}\nتمت إعادة تفعيل اشتراككم.\nشكراً لتعاونكم.`;
}

export function shouldEscalateToFreeze(remindersSent: number, maxReminders: number): boolean {
  return remindersSent >= maxReminders;
}

export function getPhaseLabel(phase: EscalationPhase): string {
  const labels: Record<EscalationPhase, string> = {
    none: 'لا يوجد تصعيد',
    reminding: 'جاري إرسال التذكيرات',
    awaiting_reply: 'بانتظار رد الزبون',
    freeze_pending: 'بانتظار التجميد',
    frozen: 'مجمّد',
    reactivated: 'مُعاد تفعيله',
  };
  return labels[phase] ?? labels.none;
}
