import type { SmsMessageCategory, SmsProcessAction } from '@/types';
import { parseTransferSms, isTransferReport } from './transfer-parser';
import { extractSimNumbers, detectChargeDuration } from './sms-parser';

const RECHARGE_KEYWORDS = ['شحن', 'تجديد', 'باقة', 'اشحن', 'جدد', 'recharge', 'renew'];
const ESIM_KEYWORDS = [
  'شريحة الكترونية', 'شريحه الكترونيه', 'شريحة الكترونيه', 'شريحه الكترونية',
  'شريحة رقمية', 'شريحه رقميه', 'esim', 'e-sim', 'e sim',
  'شريحة افتراضية', 'شريحه افتراضيه', 'الكترونية', 'الكترونيه',
  'رقمية', 'رقميه',
];
const SERIAL_KEYWORDS = [' serial', 'سيريال', 'باركود', 'barcode', 'رقم تسلسلي', 'رقم تسلسلى'];

const BANK_SENDER_PATTERNS = [
  'الراجحي', 'الأهلي', 'stc pay', 'stcpay', 'بنك البلاد', 'البنك العربي',
  'أنماء', 'الرياض', 'ساب', 'sabb', 'بنك', 'bank', 'محفظة', 'wallet',
  'jawwal', 'jawwal pay', 'palpay', 'pal tel', 'حوالة', 'تحويل',
];

export interface ClassificationResult {
  category: SmsMessageCategory;
  processAction: SmsProcessAction;
  isTransfer: boolean;
  isRecharge: boolean;
  isEsim: boolean;
  hasSerial: boolean;
  simNumber: string | null;
  duration: string | null;
}

export function classifySmsMessage(
  body: string,
  senderPhone: string,
): ClassificationResult {
  const lower = body.toLowerCase();
  const isTransfer = parseTransferSms(body).isTransfer;
  const isReport = isTransferReport(body);
  const { primarySimNumber } = extractSimNumbers(body);
  const isRecharge = RECHARGE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  const isEsim = ESIM_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  const hasSerial = SERIAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  const isBankSender = BANK_SENDER_PATTERNS.some((p) => lower.includes(p.toLowerCase()) || senderPhone.toLowerCase().includes(p.toLowerCase()));
  const duration = detectChargeDuration(body);

  let category: SmsMessageCategory = 'general';
  let processAction: SmsProcessAction = 'none';

  if (isTransfer || isReport || isBankSender) {
    category = 'transaction';
    if (isTransfer) {
      processAction = 'transfer_notification';
    } else if (isReport) {
      processAction = 'pending_op';
    }
  } else if (isEsim || (hasSerial && primarySimNumber)) {
    category = 'esim';
    if (isRecharge || isEsim) {
      processAction = 'pending_op';
    } else if (hasSerial) {
      processAction = 'pending_op';
    }
  } else if (isRecharge && primarySimNumber) {
    category = 'transaction';
    processAction = 'pending_op';
  } else if (primarySimNumber && isRecharge) {
    category = 'transaction';
    processAction = 'pending_op';
  } else if (!primarySimNumber && !isRecharge && !isEsim) {
    category = 'general';
    if (body.trim().length > 0) {
      processAction = 'unrecognized';
    }
  }

  return {
    category,
    processAction,
    isTransfer,
    isRecharge,
    isEsim,
    hasSerial,
    simNumber: primarySimNumber,
    duration,
  };
}

export function categoryLabel(category: SmsMessageCategory): string {
  switch (category) {
    case 'transaction': return 'العمليات والإيصالات';
    case 'esim': return 'الشرائح والأرقام';
    case 'general': return 'الرسائل العامة';
  }
}

export function categoryColor(category: SmsMessageCategory): string {
  switch (category) {
    case 'transaction': return '#3A86FF';
    case 'esim': return '#2A9D8F';
    case 'general': return '#6C757D';
  }
}
