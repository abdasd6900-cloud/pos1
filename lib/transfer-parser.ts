// Bank SMS parser — extracts sender name, amount, and reference from transfer notification SMS

export interface ParsedTransferNotification {
  isTransfer: boolean;
  direction: 'incoming' | 'outgoing' | 'unknown';
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  amount: number;
  currency: string;
  bankName: string;
  reference: string;
}

const BANK_PATTERNS: { bank: string; patterns: RegExp[] }[] = [
  // ===== Palestinian Banks =====
  {
    bank: 'بنك فلسطين',
    patterns: [
      // "بنك فلسطين: موبايل: تحويل بنكي: علاء معين عوني المصري، بمبلغ ILS 55.00"
      /(?:بنك\s*فلسطين|Bank\s*of\s*Palestine|BOP).*?(?:تحويل\s*بنكي|تحويل)\s*[:：]?\s*([^،,\n]+?)\s*[،,]?\s*(?:بمبلغ|مبلغ)\s*(?:ILS|USD|JOD|شيكل|₪|\$)\s*([\d.,]+)/i,
      // "بنك فلسطين: تم إيداع مبلغ 70.00 ILS من محمد أحمد - مرجع BP123456"
      /(?:بنك\s*فلسطين|Bank\s*of\s*Palestine|BOP).*?(?:تم\s*إيداع|إيداع|تحويل|استلام).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
      /(?:بنك\s*فلسطين|BOP).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
      // "تم إيداع 70 ILS لحسابك من محمد أحمد - بنك فلسطين"
      /تم\s*إيداع\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:لحسابك|في\s*حسابك)?\s*(?:من|from)\s+([^\d\n,]+).*?بنك\s*فلسطين/i,
    ],
  },
  {
    bank: 'بنك القدس',
    patterns: [
      /(?:بنك\s*القدس|Bank\s*of\s*Jerusalem|BOJ).*?(?:تم\s*إيداع|إيداع|تحويل|استلام).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
      /(?:بنك\s*القدس|BOJ).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'البنك العربي - فلسطين',
    patterns: [
      /(?:البنك\s*العربي|Arab\s*Bank).*?(?:تم\s*إيداع|إيداع|تحويل|استلام).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
      /(?:البنك\s*العربي|Arab\s*Bank).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'بنك الإسكان',
    patterns: [
      /(?:بنك\s*الإسكان|Housing\s*Bank).*?(?:تم\s*إيداع|إيداع|تحويل|استلام).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
      /(?:بنك\s*الإسكان|Housing\s*Bank).*?(?:من|from)\s+([^\d]+?)\s+مبلغ[:\s]*([\d.,]+)/i,
    ],
  },
  {
    bank: 'بنك التمويل',
    patterns: [
      /(?:بنك\s*التمويل|TFB).*?(?:تم\s*إيداع|إيداع|تحويل|استلام).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
    ],
  },
  {
    bank: 'بنك الصناعة',
    patterns: [
      /(?:بنك\s*الصناعة|IB).*?(?:تم\s*إيداع|إيداع|تحويل).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:من|from)\s+([^\d\n,]+)/i,
    ],
  },
  // ===== Saudi Banks =====
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
    bank: 'بال بي (PalPay)',
    patterns: [
      // "PalPay: استلمت مبلغ ILS 70.00 من 00970595337894 رصيدك الحالي ILS 319.58"
      /(?:pal\s*pay|palpay|بال\s*بي).*?استلمت\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*من\s*(\d{5,15})/i,
      /استلمت\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)\s*([\d.,]+)\s*من\s*(\d{5,15}).*?(?:pal\s*pay|palpay|بال\s*بي)/i,
    ],
  },
  {
    bank: 'جوال بي (Jawwal Pay)',
    patterns: [
      // "Jawwal Pay: تم استلام مبلغ 70.00 ILS من 0595337894"
      /(?:jawwal\s*pay|jowal\s*pay|جوال\s*بي).*?(?:تم\s*استلام|استلمت)\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*من\s*(\d{5,15})/i,
      /(?:تم\s*استلام|استلمت)\s*مبلغ\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*من\s*(\d{5,15}).*?(?:jawwal\s*pay|جوال\s*بي)/i,
    ],
  },
  {
    bank: 'مال شات (MalChat)',
    patterns: [
      // "MalChat: استلمت 70 شيكل من 0595337894"
      /(?:mal\s*chat|malchat|مال\s*شات).*?استلمت\s*(?:مبلغ\s*)?([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*من\s*(\d{5,15})/i,
      /استلمت\s*(?:مبلغ\s*)?([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*من\s*(\d{5,15}).*?(?:mal\s*chat|malchat|مال\s*شات)/i,
    ],
  },
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

// Outgoing transfer patterns — you SENT money to someone
const OUTGOING_WALLET_PATTERNS: { bank: string; patterns: RegExp[] }[] = [
  {
    bank: 'جوال بي (Jawwal Pay)',
    patterns: [
      // "Jawwal Pay: تم تحويل مبلغ 70.00 ILS إلى 0595337894"
      /(?:jawwal\s*pay|jowal\s*pay|جوال\s*بي).*?(?:تم\s*تحويل|حولت)\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
      /(?:تم\s*تحويل|حولت)\s*مبلغ\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to)\s*(\d{5,15}).*?(?:jawwal\s*pay|جوال\s*بي)/i,
      // "Jawwal Pay: تم صرف مبلغ 70.00 ILS إلى 0595337894"
      /(?:jawwal\s*pay|jowal\s*pay|جوال\s*بي).*?(?:تم\s*صرف|صرفت)\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to)?\s*(\d{5,15})/i,
    ],
  },
  {
    bank: 'بال بي (PalPay)',
    patterns: [
      /(?:pal\s*pay|palpay|بال\s*بي).*?(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت)\s*مبلغ\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
    ],
  },
  {
    bank: 'مال شات (MalChat)',
    patterns: [
      /(?:mal\s*chat|malchat|مال\s*شات).*?(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت)\s*(?:مبلغ\s*)?([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
    ],
  },
  {
    bank: 'محفظة',
    patterns: [
      // "تم تحويل مبلغ 70.00 من محفظتك إلى 0595337894"
      /(?:تم\s*تحويل|حولت)\s*مبلغ\s*([\d.,]+)\s*(?:ILS|USD|JOD|SAR|EGP|شيكل|₪|\$)?\s*(?:من\s*محفظتك\s*)?(?:إلى|الى|to)\s*(\d{5,15})/i,
      // "تم صرف مبلغ 70 إلى 0595337894"
      /(?:تم\s*صرف|صرفت)\s*مبلغ\s*([\d.,]+)\s*(?:ILS|USD|JOD|SAR|EGP|شيكل|₪|\$)?\s*(?:إلى|الى|to)?\s*(\d{5,15})/i,
      // "حوالة صادرة بمبلغ 70 إلى 0595337894"
      /حوال[ةه]\s*صادر[ةه]?\s*(?:بمبلغ|مبلغ)\s*([\d.,]+)\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
    ],
  },
];

// Outgoing bank transfer patterns — you SENT money to a named recipient
const OUTGOING_BANK_PATTERNS: { bank: string; patterns: RegExp[] }[] = [
  {
    bank: 'بنك فلسطين',
    patterns: [
      /(?:بنك\s*فلسطين|BOP).*?(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت).*?مبلغ[:\s]*([\d.,]+)\s*(?:ILS|USD|JOD|شيكل|₪|\$)?\s*(?:إلى|الى|to|لـ)\s+([^\d\n,]+)/i,
      /(?:بنك\s*فلسطين|BOP).*?(?:إلى|الى|to)\s+([^\d\n,]+?)\s*(?:بمبلغ|مبلغ)\s*([\d.,]+)/i,
    ],
  },
  {
    bank: 'الراجحي',
    patterns: [
      /(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت).*?مبلغ[:\s]*([\d.,]+)\s*(?:ريال|SAR|Riyal|ر\.س)?\s*(?:إلى|الى|to|لـ)\s+([^\d\n,]+)/i,
    ],
  },
  {
    bank: 'STC Pay',
    patterns: [
      /(?:STC\s*Pay|stcpay).*?(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت).*?مبلغ[:\s]*([\d.,]+)\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
    ],
  },
];

// Generic patterns for unknown banks (incoming)
const GENERIC_PATTERNS: RegExp[] = [
  /(?:تم\s*إيداع|استلام\s*تحويل|حواله\s*وارد|تم\s*تحويل)\s+مبلغ[:\s]*([\d.,]+)\s*(?:من|from)\s+([^\d\n,]+)/i,
  /(?:من|from)\s+([^\d\n,]+?)\s+(?:مبلغ|amount)[:\s]*([\d.,]+)/i,
  /amount[:\s]*([\d.,]+)\s*(?:from|من)\s+([^\d\n,]+)/i,
];

// Generic outgoing patterns
const GENERIC_OUTGOING_PATTERNS: RegExp[] = [
  /(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت)\s+مبلغ[:\s]*([\d.,]+)\s*(?:إلى|الى|to)\s+([^\d\n,]+)/i,
  /(?:تم\s*تحويل|حولت|تم\s*صرف|صرفت)\s+مبلغ[:\s]*([\d.,]+)\s*(?:إلى|الى|to)\s*(\d{5,15})/i,
  /حوال[ةه]\s*صادر[ةه]?\s*(?:بمبلغ|مبلغ)\s*([\d.,]+)/i,
];

// Keywords that strongly indicate OUTGOING transfers (must check before incoming)
const OUTGOING_KEYWORDS = [
  'تم تحويل', 'حولت', 'تم صرف', 'صرفت', 'حوالة صادرة', 'حواله صادره',
  'تم التحويل', 'محول', 'sent', 'transferred', 'payment sent',
];

// Verification code keywords — these are NOT transfers
const VERIFICATION_CODE_KEYWORDS = [
  'رمز', 'كود', 'تحقق', 'تأكيد', 'verification', 'verify', 'code', 'otp',
  'رمز التحقق', 'رمز تأكيد', 'كود التحقق',
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
  return 'ILS';
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
    isTransfer: false, direction: 'unknown', senderName: '', senderPhone: '', recipientName: '', recipientPhone: '', amount: 0, currency: 'ILS', bankName: '', reference: '',
  };

  if (!sms || sms.length < 10) return empty;

  // Reject verification code messages — they are NOT transfers
  const lowerSms = sms.toLowerCase();
  for (const kw of VERIFICATION_CODE_KEYWORDS) {
    if (lowerSms.includes(kw.toLowerCase())) {
      // If the message is ONLY a verification code (short message), skip entirely
      // But if it's a transfer that also mentions a code, still parse it
      if (sms.length < 100) return empty;
    }
  }

  // PalPay friend-payment notifications include two names and place the
  // currency before the amount, for example: "تحويل دفع لصديق: yousra ibrahem: ahmaad ghunaim مبلغ ILS 60.00".
  const palPayFriendMatch = sms.match(
    /(?:تحويل\s*)?دفع\s*لصديق\s*[:：]?\s*([^:：\n]+?)\s*[:：]\s*([^\n]+?)\s+(?:بمبلغ|مبلغ)\s+(?:ILS|USD|JOD|شيكل|₪|\$)\s*([\d.,]+)/i,
  );
  if (palPayFriendMatch) {
    const firstName = cleanName(palPayFriendMatch[1]);
    const secondName = cleanName(palPayFriendMatch[2]);
    const amount = extractAmount(palPayFriendMatch[3]);
    if (firstName && secondName && amount > 0) {
      return {
        isTransfer: true,
        direction: 'incoming',
        senderName: `${firstName} ${secondName}`,
        senderPhone: '',
        recipientName: '',
        recipientPhone: '',
        amount,
        currency: extractCurrency(sms),
        bankName: 'بال باي (PalPay)',
        reference: extractReference(sms),
      };
    }
  }

  // ===== Check OUTGOING wallet patterns first (if outgoing keywords are present) =====
  const hasOutgoingKeyword = OUTGOING_KEYWORDS.some((kw) => lowerSms.includes(kw.toLowerCase()));

  if (hasOutgoingKeyword) {
    // Check outgoing wallet patterns (phone-based recipient)
    for (const { bank, patterns } of OUTGOING_WALLET_PATTERNS) {
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
              direction: 'outgoing',
              senderName: '',
              senderPhone: '',
              recipientName: '',
              recipientPhone: normalizePhone(phone),
              amount,
              currency: extractCurrency(sms),
              bankName: bank,
              reference: extractReference(sms),
            };
          }
        }
      }
    }

    // Check outgoing bank patterns (name-based recipient)
    for (const { bank, patterns } of OUTGOING_BANK_PATTERNS) {
      for (const pattern of patterns) {
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
          if (amount > 0) {
            return {
              isTransfer: true,
              direction: 'outgoing',
              senderName: '',
              senderPhone: '',
              recipientName: name,
              recipientPhone: '',
              amount,
              currency: extractCurrency(sms),
              bankName: bank,
              reference: extractReference(sms),
            };
          }
        }
      }
    }

    // Try generic outgoing patterns
    for (const pattern of GENERIC_OUTGOING_PATTERNS) {
      const match = sms.match(pattern);
      if (match) {
        const g1 = match[1];
        const g2 = match[2];
        // If g2 is a phone number
        if (g2 && /^\d{5,15}$/.test(g2.replace(/\D/g, ''))) {
          const amount = extractAmount(g1);
          const phone = g2.replace(/\D/g, '');
          if (amount > 0) {
            return {
              isTransfer: true,
              direction: 'outgoing',
              senderName: '',
              senderPhone: '',
              recipientName: '',
              recipientPhone: normalizePhone(phone),
              amount,
              currency: extractCurrency(sms),
              bankName: 'غير محدد',
              reference: extractReference(sms),
            };
          }
        }
        // If g2 is a name
        if (g2 && !/^[\d.,]+$/.test(g2)) {
          const amount = extractAmount(g1);
          const name = cleanName(g2);
          if (name && amount > 0) {
            return {
              isTransfer: true,
              direction: 'outgoing',
              senderName: '',
              senderPhone: '',
              recipientName: name,
              recipientPhone: '',
              amount,
              currency: extractCurrency(sms),
              bankName: 'غير محدد',
              reference: extractReference(sms),
            };
          }
        }
      }
    }
  }

  // ===== Check INCOMING wallet patterns (phone-based sender) =====
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
            direction: 'incoming',
            senderName: '',
            senderPhone: normalizePhone(phone),
            recipientName: '',
            recipientPhone: '',
            amount,
            currency: extractCurrency(sms),
            bankName: bank,
            reference: extractReference(sms),
          };
        }
      }
    }
  }

  // Check known bank patterns (incoming)
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
            direction: 'incoming',
            senderName: name,
            senderPhone: '',
            recipientName: '',
            recipientPhone: '',
            amount,
            currency: extractCurrency(sms),
            bankName: bank,
            reference: extractReference(sms),
          };
        }
      }
    }
  }

  // Try generic incoming patterns
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
          direction: 'incoming',
          senderName: name,
          senderPhone: '',
          recipientName: '',
          recipientPhone: '',
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
