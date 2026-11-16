import type { TelecomCompany } from '@/types';

const PHONE_REGEXES = [
  /0\d{9,10}/g,
  /\+970\d{9,10}/g,
  /\+972\d{9,10}/g,
  /\b\d{10}\b/g,
];

const PALESTINIAN_PREFIXES = ['050', '052', '053', '054', '055', '056', '058', '059'];

export interface ExtractedSimInfo {
  simNumbers: string[];
  primarySimNumber: string | null;
}

export function extractSimNumbers(message: string): ExtractedSimInfo {
  const numbers: string[] = [];
  for (const regex of PHONE_REGEXES) {
    const matches = message.match(regex);
    if (matches) {
      for (const m of matches) {
        let normalized = m.replace(/\+970/, '0').replace(/\+972/, '0');
        if (PALESTINIAN_PREFIXES.some((p) => normalized.startsWith(p))) {
          numbers.push(normalized);
        }
      }
    }
  }
  const unique = [...new Set(numbers)];
  return {
    simNumbers: unique,
    primarySimNumber: unique.length > 0 ? unique[unique.length - 1] : null,
  };
}

export function guessCompanyFromMessage(
  message: string,
  companies: TelecomCompany[],
): string {
  const lower = message.toLowerCase();
  for (const c of companies) {
    if (lower.includes(c.name.toLowerCase())) {
      return c.id;
    }
  }
  return '';
}

export function guessBundleFromMessage(message: string): { bundleName: string } {
  const lower = message.toLowerCase();
  const priceMatch = lower.match(/(\d{2,3})\s*(شيكل|ج\.م|ر\.س|usd|\$)/);
  const bundleName = priceMatch ? `حزمة ${priceMatch[1]}` : '';
  return { bundleName };
}

const DURATION_PATTERNS: { keywords: string[]; duration: string }[] = [
  { keywords: ['3 ايام', '3 أيام', 'ثلاث ايام', 'ثلاث أيام', '3 days'], duration: '3_days' },
  { keywords: ['اسبوع', 'أسبوع', '7 ايام', '7 أيام', ' week'], duration: 'week' },
  { keywords: ['اسبوعين', 'أسبوعين', '14 يوم', '14 ايام', '2 weeks'], duration: '2_weeks' },
  { keywords: ['3 اسابيع', '3 أسابيع', '21 يوم', '21 ايام', '3 weeks'], duration: '3_weeks' },
  { keywords: ['شهر', 'شهر واحد', '30 يوم', '30 ايام', ' month', 'monthly'], duration: 'month' },
  { keywords: ['شهرين', 'شهرين متتالين', '60 يوم', '60 ايام', '2 months'], duration: '2_months' },
  { keywords: ['3 شهور', 'ثلاث شهور', '90 يوم', '90 ايام', '3 months'], duration: '3_months' },
  { keywords: ['عرض', 'عروض', ' offer'], duration: 'offer' },
];

export function detectChargeDuration(message: string): string | null {
  const lower = message.toLowerCase().trim();
  for (const pat of DURATION_PATTERNS) {
    for (const kw of pat.keywords) {
      if (lower.includes(kw.toLowerCase().trim())) return pat.duration;
    }
  }
  return null;
}

export const COMPANIES_REQUIRING_DURATION = ['ويكم', 'الوها'];

export function findCompanyBySimNumber(
  simNumber: string,
  sales: { simNumber: string; companyName: string; companyId: string; createdAt?: number }[],
  companies: { id: string; name: string }[],
): { companyId: string; companyName: string } | null {
  const normalized = normalizeSimNumber(simNumber);
  const sale = sales
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .find((s) => normalizeSimNumber(s.simNumber) === normalized);
  if (sale) {
    const company = companies.find((c) => c.id === sale.companyId);
    if (company) return { companyId: company.id, companyName: company.name };
  }
  return null;
}

function normalizeSimNumber(num: string): string {
  return num.replace(/[^0-9]/g, '');
}
