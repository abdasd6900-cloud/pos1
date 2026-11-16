// Arabic/English name normalization and fuzzy matching engine

const ARABIC_TO_LATIN: Record<string, string> = {
  'أ': 'a', 'إ': 'a', 'آ': 'a', 'ا': 'a', 'ى': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h',
  'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't',
  'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h',
  'و': 'w', 'ي': 'y', 'ئ': 'y', 'ؤ': 'w', 'ة': 'h',
  'ء': '',
};

const LATIN_TO_ARABIC: Record<string, string> = {
  'mohammed': 'محمد', 'mohamed': 'محمد', 'muhamed': 'محمد', 'muhammed': 'محمد',
  'ahmed': 'احمد', 'ahmad': 'احمد',
  'ali': 'علي', 'khaled': 'خالد', 'khalid': 'خالد',
  'abdullah': 'عبدالله', 'abdallah': 'عبدالله',
  'omar': 'عمر', 'yousef': 'يوسف', 'yusuf': 'يوسف',
  'ibrahim': 'ابراهيم', 'salem': 'سالم', 'said': 'سعيد', 'saed': 'سعيد',
  'nasser': 'ناصر', 'naser': 'ناصر', 'faisal': 'فيصل',
  'abdul': 'عبد', 'rahman': 'رحمن', 'aziz': 'عزيز',
  'saud': 'سعود', 'turki': 'تركي', 'fahd': 'فهد', 'fahad': 'فهد',
  'bandar': 'بندر', 'majed': 'ماجد', 'maged': 'ماجد',
  'rashed': 'راشد', 'rashid': 'راشد', 'sultan': 'سلطان',
  'hamad': 'حمد', 'hamed': 'حمد', 'tariq': 'طارق', 'tareq': 'طارق',
  'waleed': 'وليد', 'walid': 'وليد', 'fadi': 'فادي',
  'samir': 'سمير', 'sameer': 'سمير', 'kareem': 'كريم', 'karim': 'كريم',
  'hassan': 'حسن', 'hussein': 'حسين', 'husain': 'حسين',
  'ismail': 'اسماعيل', 'yasin': 'ياسين', 'yassen': 'ياسين',
};

const STOP_WORDS = ['بن', 'ابن', 'ابو', 'أبو', 'ال', 'abdul', 'bin', 'ibn', 'abu', 'al', 'el'];

function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u065F]/g, '') // remove diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ء/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function arabicToLatin(s: string): string {
  let result = '';
  for (const ch of s) {
    result += ARABIC_TO_LATIN[ch] ?? ch;
  }
  return result.toLowerCase().replace(/\s+/g, ' ').trim();
}

function latinToArabic(s: string): string {
  let result = s.toLowerCase();
  for (const [lat, ar] of Object.entries(LATIN_TO_ARABIC)) {
    result = result.replace(new RegExp(lat, 'gi'), ar);
  }
  return result;
}

export function normalizeName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const arabicNormalized = normalizeArabic(trimmed);
  const latinVersion = arabicToLatin(arabicNormalized);
  const arabicFromLatin = normalizeArabic(latinToArabic(latinVersion));
  // Return the shorter normalized form — prefer Arabic
  return arabicNormalized.length <= arabicFromLatin.length ? arabicNormalized : arabicFromLatin;
}

export function extractNameTokens(name: string): string[] {
  const normalized = normalizeName(name);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP_WORDS.includes(t));
}

export interface NameMatchResult {
  matched: boolean;
  confidence: number; // 0-1
  matchedTokens: string[];
}

export function matchNames(nameA: string, nameB: string): NameMatchResult {
  const tokensA = extractNameTokens(nameA);
  const tokensB = extractNameTokens(nameB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return { matched: false, confidence: 0, matchedTokens: [] };
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const matched: string[] = [];
  for (const t of setA) {
    if (setB.has(t)) {
      matched.push(t);
    }
  }

  // Also try partial matching — first name initial match
  if (matched.length === 0) {
    const firstA = tokensA[0];
    const firstB = tokensB[0];
    if (firstA === firstB) {
      matched.push(firstA);
    } else if (firstA.length >= 3 && firstB.length >= 3 && firstA.startsWith(firstB.slice(0, 3))) {
      matched.push(firstA);
    } else if (firstB.length >= 3 && firstA.length >= 3 && firstB.startsWith(firstA.slice(0, 3))) {
      matched.push(firstB);
    }
  }

  if (matched.length === 0) {
    return { matched: false, confidence: 0, matchedTokens: [] };
  }

  // Confidence: matched tokens / min(total meaningful tokens)
  const minTokens = Math.min(tokensA.length, tokensB.length);
  const confidence = Math.min(1, matched.length / minTokens);

  // At least first name + one other name for confidence >= 0.5
  // Single first name match = confidence based on how common
  const matchedFirst = matched.includes(tokensA[0]) || matched.includes(tokensB[0]);
  const finalConfidence = matchedFirst && matched.length >= 2 ? Math.max(confidence, 0.7) : confidence * 0.6;

  return {
    matched: finalConfidence >= 0.35,
    confidence: finalConfidence,
    matchedTokens: matched,
  };
}

export function matchNameAgainstCustomers(
  senderName: string,
  customers: { id: string; name: string; phone: string }[],
  nameMappings: { fromNameNormalized: string; toCustomerId: string | null }[],
): { customerId: string | null; customerName: string; confidence: number } | null {
  const normalized = normalizeName(senderName);
  if (!normalized) return null;

  // Check learned mappings first
  for (const m of nameMappings) {
    if (m.fromNameNormalized === normalized && m.toCustomerId) {
      const customer = customers.find((c) => c.id === m.toCustomerId);
      if (customer) {
        return { customerId: customer.id, customerName: customer.name, confidence: 1 };
      }
    }
  }

  // Fuzzy match against customers
  let bestMatch: { customerId: string; customerName: string; confidence: number } | null = null;
  for (const c of customers) {
    const result = matchNames(senderName, c.name);
    if (result.matched && (!bestMatch || result.confidence > bestMatch.confidence)) {
      bestMatch = { customerId: c.id, customerName: c.name, confidence: result.confidence };
    }
  }

  return bestMatch;
}
