import type { LearnedSmsCategory, LearnedSmsRule } from '@/types';

const STOP_WORDS = new Set([
  'في', 'من', 'الى', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي',
  'الذي', 'ما', 'لا', 'نعم', 'لكن', 'او', 'أو', 'ثم', 'قد', 'كان', 'كانت',
  'هو', 'هي', 'هم', 'نحن', 'انا', 'أنا', 'انت', 'أنت', 'الله', 'شكرا',
  'السلام', 'عليكم', 'ورحمة', 'وبركاته', 'مرحبا', 'تحية', 'طيب', 'خير',
  'please', 'the', 'a', 'an', 'is', 'are', 'to', 'from', 'and', 'or',
]);

export function extractKeywords(message: string, maxCount = 5): string[] {
  const words = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, maxCount).map(([w]) => w);
}

export function matchLearnedRule(
  message: string,
  senderPhone: string,
  rules: LearnedSmsRule[],
): { rule: LearnedSmsRule; category: LearnedSmsCategory } | null {
  const lower = message.toLowerCase();
  const activeRules = rules.filter((r) => r.active);

  for (const rule of activeRules) {
    if (rule.senderPhone && rule.senderPhone !== senderPhone) continue;
    const matched = rule.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (matched) {
      return { rule, category: rule.category };
    }
  }
  return null;
}

export const CATEGORY_LABELS: Record<LearnedSmsCategory, string> = {
  recharge: 'تجديد',
  update: 'تحديث',
  problem: 'مشاكل',
  transfer: 'حواله مالية',
  normal: 'عادية',
};

export const CATEGORY_ICONS: Record<LearnedSmsCategory, string> = {
  recharge: 'Smartphone',
  update: 'RefreshCw',
  problem: 'AlertTriangle',
  transfer: 'Banknote',
  normal: 'MessageSquare',
};

export const CATEGORY_COLORS: Record<LearnedSmsCategory, string> = {
  recharge: '#3A86FF',
  update: '#2A9D8F',
  problem: '#E63946',
  transfer: '#FFB703',
  normal: '#6C757D',
};

export const ALL_CATEGORIES: LearnedSmsCategory[] = ['recharge', 'update', 'problem', 'transfer', 'normal'];

export function categoryToProcessAction(category: LearnedSmsCategory): 'pending_op' | 'transfer_notification' | 'support_ticket' | 'none' {
  switch (category) {
    case 'recharge': return 'pending_op';
    case 'update': return 'pending_op';
    case 'problem': return 'support_ticket';
    case 'transfer': return 'transfer_notification';
    case 'normal': return 'none';
  }
}
