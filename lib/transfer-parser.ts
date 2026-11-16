// Bank SMS parser — extracts sender name, amount, and reference from transfer notification SMS

export interface ParsedTransferNotification {
  isTransfer: boolean;
  senderName: string;
  senderPhone: string;
  amount: number;
  currency: string;
  bankName: string;
  reference: string;
}

const BANK_PATTERNS: { bank: string; patterns: RegExp[] }[] = [
  {
    bank: 'الراجحي',
    patterns: [
      /(?:تم\s*إيداع|استلام\s*تحويل|حواله\s*وارد).*?مبلغ[:\s]*([\d.,]+)\s*(ريال|SAR|Riyal|ر\.س)?/i,
      /(?:from|من)\s*([^\d]+?)[\s,]*(?:مبلغ|amount)[:\s]*([\d.,]+)/i,
      /الراجحي.*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'الأهلي',
    patterns: [
      /(?:تم\s*تحويل|إيداع).*?مبلغ[:\s]*([\d.,]+).*?(?:من|from)\s+([^\d]+)/i,
      /الأهلي.*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'STC Pay',
    patterns: [
      /(?:STC\s*Pay|stcpay).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
      /(?:تم\s*استلام|حواله).*?([\d.,]+).*?(?:من|from)\s+([^\d]+)/i,
    ],
  },
  {
    bank: 'بنك البلاد',
    patterns: [
      /(?:بنك\s*البلاد|AlBilad).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'البنك العربي',
    patterns: [
      /(?:البنك\s*العربي|Arab\s*Bank).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'أنماء',
    patterns: [
      /(?:أنماء|Alinma).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'الرياض',
    patterns: [
      /(?:بنك\s*الرياض|Riyad\s*Bank).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'ساب',
    patterns: [
      /(?:ساب|SABB).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
];

// Palestinian / wallet transfer patterns — sender identified by phone number
const WALLET_PATTERNS: { bank: string; patterns: RegExp[] }[] = [
  {
    bank: 'محفظة',
    patterns: [
      // "استلمت مبلغ ILS 70.00 من 00970595337894 رصيدك الحالي ILS 319.58"
      /استلمت\s*مبلغ\s*(?:ILS|USD|JOD|SAR|EGP|شيكل|₪|\$)\s*([\d.,]+)\s*من\s*(\d{5,15})/i,
      // "استلمت مبلغ 70.00 شيكل من 00970595337894"
      /استلمت\s*مبلغ\s*([\d.,]+)\s*(?:ILS|USD|JOD|SAR|EGP|شيكل|₪|\$)?\s*من\s*(\d{5,15})/i,
      // "تم استلام مبلغ 70 من 0595337894"
      /تم\s*استلام\s*مبلغ\s*([\d.,]+)\s*من\s*(\d{5,15})/i,
      // "وصلني تحويل 70 شيكل من 0595337894"
      /وصلني\s*تحويل\s*([\d.,]+)\s*(?:شيكل|ILS|₪|USD|\$)?\s*من\s*(\d{5,15})/i,
    ],
  },
];

// Generic patterns for unknown banks
const GENERIC_PATTERNS: RegExp[] = [
  /(?:تم\s*إيداع|استلام\s*تحويل|حواله\s*وارد|تم\s*تحويل)\s+مبلغ[:\s]*([\d.,]+)\s*(?:من|from)\s+([^\d\n,]+)/i,
  /(?:من|from)\s+([^\d\n,]+?)\s+(?:مبلغ|amount)[:\s]*([\d.,]+)/i,
  /amount[:\s]*([\d.,]+)\s*(?:from|من)\s+([^\d\n,]+)/i,
];

const CURRENCY_MAP: Record<string, string> = {
  'ريال': 'SAR', 'ر.س': 'SAR', 'SAR': 'SAR', 'riyal': 'SAR',
  'شيكل': 'ILS', '₪': 'ILS', 'ILS': 'ILS',
  'دولار': 'USD', '$': 'USD', 'USD': 'USD',
  'دينار': 'JOD', 'د.أ': 'JOD', 'JOD': 'JOD',
  'جنيه': 'EGP', 'ج.م': 'EGP', 'EGP': 'EGP',
};

function extractAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, '')) || 0;
}

function extractCurrency(text: string): string {
  for (const [key, val] of Object.entries(CURRENCY_MAP)) {
    if (text.includes(key)) return val;
  }
  return 'SAR';
}

function extractReference(text: string): string {
  const refMatch = text.match(/(?:مرجع|reference|ref|رقم\s*العملية|operation\s*no)[:\s]*([A-Za-z0-9]+)/i);
  return refMatch?.[1] ?? '';
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\d:,.\-#/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(من|from)\s+/i, '')
    .replace(/\s+(to|إلى|الى)\s+.*$/i, '')
    .trim();
}

export function parseTransferSms(sms: string): ParsedTransferNotification {
  const empty: ParsedTransferNotification = {
    isTransfer: false, senderName: '', senderPhone: '', amount: 0, currency: 'SAR', bankName: '', reference: '',
  };

  if (!sms || sms.length < 10) return empty;

  // Check wallet patterns first (phone-based, most common for Palestinian market)
  for (const { bank, patterns } of WALLET_PATTERNS) {
    for (const pattern of patterns) {
      const match = sms.match(pattern);
      if (match) {
        const g1 = match[1];
        const g2 = match[2];
        const amount = extractAmount(g1);
        const phone = g2.replace(/\D/g, '');
        if (phone && amount > 0) {
          return {
            isTransfer: true,
            senderName: '',
            senderPhone: normalizePhone(phone),
            amount,
            currency: extractCurrency(sms),
            bankName: bank,
            reference: extractReference(sms),
          };
        }
      }
    }
  }

  // Check known bank patterns
  for (const { bank, patterns } of BANK_PATTERNS) {
    for (const pattern of patterns) {
      const match = sms.match(pattern);
      if (match) {
        // Try to figure out which group is name and which is amount
        const g1 = match[1];
        const g2 = match[2];
        let name = '';
        let amount = 0;

        if (/^[\d.,]+$/.test(g1)) {
          amount = extractAmount(g1);
          name = cleanName(g2);
        } else if (/^[\d.,]+$/.test(g2)) {
          amount = extractAmount(g2);
          name = cleanName(g1);
        } else {
          name = cleanName(g1);
          const amountMatch = sms.match(/مبلغ[:\s]*([\d.,]+)|amount[:\s]*([\d.,]+)/i);
          amount = amountMatch ? extractAmount(amountMatch[1] || amountMatch[2]) : 0;
        }

        if (name && amount > 0) {
          return {
            isTransfer: true,
            senderName: name,
            senderPhone: '',
            amount,
            currency: extractCurrency(sms),
            bankName: bank,
            reference: extractReference(sms),
          };
        }
      }
    }
  }

  // Try generic patterns
  for (const pattern of GENERIC_PATTERNS) {
    const match = sms.match(pattern);
    if (match) {
      const g1 = match[1];
      const g2 = match[2];
      let name = '';
      let amount = 0;

      if (/^[\d.,]+$/.test(g1)) {
        amount = extractAmount(g1);
        name = cleanName(g2);
      } else if (/^[\d.,]+$/.test(g2)) {
        amount = extractAmount(g2);
        name = cleanName(g1);
      }

      if (name && amount > 0) {
        return {
          isTransfer: true,
          senderName: name,
          senderPhone: '',
          amount,
          currency: extractCurrency(sms),
          bankName: 'غير محدد',
          reference: extractReference(sms),
        };
      }
    }
  }

  return empty;
}

// Normalize phone number — strip country codes, keep digits
function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('00970') || p.startsWith('00972')) p = '0' + p.slice(5);
  else if (p.startsWith('970') || p.startsWith('972')) p = '0' + p.slice(3);
  else if (p.startsWith('00')) p = '0' + p.slice(2);
  return p;
}

// Match a phone number (full or partial last 2-3 digits) against customer phones
export function matchPhoneToCustomer(
  senderPhone: string,
  customers: { id: string; name: string; phone: string }[],
): { customerId: string; customerName: string; confidence: number; fullMatch: boolean } | null {
  const normalized = senderPhone.replace(/\D/g, '');
  if (!normalized || normalized.length < 2) return null;

  // Exact match
  const exact = customers.find((c) => c.phone.replace(/\D/g, '') === normalized);
  if (exact) {
    return { customerId: exact.id, customerName: exact.name, confidence: 1, fullMatch: true };
  }

  // Try last 4 digits match
  if (normalized.length >= 4) {
    const last4 = normalized.slice(-4);
    const candidates = customers.filter((c) => c.phone.replace(/\D/g, '').endsWith(last4));
    if (candidates.length === 1) {
      return { customerId: candidates[0].id, customerName: candidates[0].name, confidence: 0.85, fullMatch: true };
    }
  }

  // Try last 3 digits match
  if (normalized.length >= 3) {
    const last3 = normalized.slice(-3);
    const candidates = customers.filter((c) => c.phone.replace(/\D/g, '').endsWith(last3));
    if (candidates.length === 1) {
      return { customerId: candidates[0].id, customerName: candidates[0].name, confidence: 0.7, fullMatch: true };
    }
  }

  // Try last 2 digits — only if there's exactly one match (low confidence)
  if (normalized.length >= 2) {
    const last2 = normalized.slice(-2);
    const candidates = customers.filter((c) => c.phone.replace(/\D/g, '').endsWith(last2));
    if (candidates.length === 1) {
      return { customerId: candidates[0].id, customerName: candidates[0].name, confidence: 0.5, fullMatch: false };
    }
  }

  return null;
}

// Keywords that indicate a customer is reporting a transfer
const TRANSFER_REPORT_KEYWORDS = [
  'حولت', 'تم التحويل', 'تم تحويل', 'عملت تحويل', 'حوالة', 'حواله',
  'تم الدفع', 'دفعت', 'دفعت المبلغ', 'تم السداد', 'سددت',
  'i transferred', 'i paid', 'payment sent', 'transfer done',
  'تم الايداع', 'اودعت', 'تم ايداع',
];

export function isTransferReport(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of TRANSFER_REPORT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// Extract sender name and amount from a customer's transfer report message
export function parseTransferReport(message: string): { senderName: string; amount: number | null } {
  // Try to extract amount
  const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

  // Try to extract sender name — look for patterns like "الاسم: X" or "المرسل: X" or "من: X"
  const namePatterns = [
    /(?:الاسم|المرسل|from|اسم\s*المرسل|by)\s*[:：]\s*([^\d\n,]+)/i,
    /(?:الاسم|المرسل)\s+([^\d\n,]+)/i,
  ];

  for (const p of namePatterns) {
    const m = message.match(p);
    if (m && m[1]) {
      const name = m[1].replace(/[\d:,.\-#]/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.length >= 2) {
        return { senderName: name, amount };
      }
    }
  }

  return { senderName: '', amount };
}
