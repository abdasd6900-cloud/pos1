export function normalizePhoneNumber(value: string): string {
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

export function formatCurrency(amount: number | undefined | null, currency = 'ر.س'): string {
  const safe = typeof amount === 'number' ? amount : 0;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export function formatNumber(n: number | undefined | null): string {
  const safe = typeof n === 'number' ? n : 0;
  return safe.toLocaleString('en-US');
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'م' : 'ص';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m} ${period}`;
}

export function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp)} - ${formatTime(timestamp)}`;
}

export function isToday(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function isThisWeek(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return dayDiff <= 7;
}

export function isThisMonth(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  if (hours < 24) return `قبل ${hours} ساعة`;
  if (days < 30) return `قبل ${days} يوم`;
  return formatDate(timestamp);
}

export function calculateProfit(
  items: { productId: string; price: number; quantity: number }[],
  products: { id: string; cost: number }[],
): number {
  return items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    const cost = product ? product.cost : 0;
    return sum + (item.price - cost) * item.quantity;
  }, 0);
}

export type DebtAgeLevel = 'fresh' | 'warning' | 'critical';

export function getDebtAgeLevel(createdAt: number): DebtAgeLevel {
  const daysSince = (Date.now() - createdAt) / 86400000;
  if (daysSince > 14) return 'critical';
  if (daysSince > 7) return 'warning';
  return 'fresh';
}

export function debtAgeLabel(level: DebtAgeLevel): string {
  switch (level) {
    case 'fresh': return 'حديث';
    case 'warning': return 'تجاوز أسبوعين';
    case 'critical': return 'متأخر جداً';
  }
}

export function daysUntilExpiry(expiry: number | null): number | null {
  if (!expiry) return null;
  return Math.ceil((expiry - Date.now()) / 86400000);
}

export function formatExpiry(expiry: number | null): string {
  if (!expiry) return 'لا يوجد';
  const days = daysUntilExpiry(expiry);
  if (days === null) return 'لا يوجد';
  if (days < 0) return `منتهي منذ ${Math.abs(days)} يوم`;
  if (days === 0) return 'ينتهي اليوم';
  if (days === 1) return 'ينتهي غداً';
  return `ينتهي بعد ${days} يوم`;
}

export function fillSmsTemplate(
  template: string,
  vars: { name: string; sub: string; amount: string; debt: string },
): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{sub\}/g, vars.sub)
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{debt\}/g, vars.debt);
}

export interface StockPredictionResult {
  productId: string;
  productName: string;
  currentStock: number;
  dailyRate: number;
  daysUntilEmpty: number | null;
  urgency: 'safe' | 'soon' | 'critical';
  recommendation: string;
}

export function predictStockOut(
  productId: string,
  productName: string,
  currentStock: number,
  transactions: { type: string; createdAt: number; items: { productId: string; quantity: number }[] }[],
): StockPredictionResult | null {
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recentSales = transactions.filter(
    (t) => t.type === 'sale' && t.createdAt >= sevenDaysAgo,
  );

  let totalSold = 0;
  recentSales.forEach((t) => {
    t.items.forEach((item) => {
      if (item.productId === productId) totalSold += item.quantity;
    });
  });

  if (totalSold === 0) return null;

  const dailyRate = totalSold / 7;
  const daysUntilEmpty = currentStock > 0 ? Math.floor(currentStock / dailyRate) : 0;

  let urgency: 'safe' | 'soon' | 'critical';
  if (daysUntilEmpty <= 2) urgency = 'critical';
  else if (daysUntilEmpty <= 5) urgency = 'soon';
  else urgency = 'safe';

  const recommendation =
    urgency === 'critical'
      ? `سينفد خلال ${daysUntilEmpty} يوم - اطلب شراء عاجل`
      : urgency === 'soon'
        ? `سينفد خلال ${daysUntilEmpty} يوم - يفضل تجهيز طلب شراء`
        : `مخزون كافٍ لـ ${daysUntilEmpty} يوم`;

  return {
    productId,
    productName,
    currentStock,
    dailyRate: Math.round(dailyRate * 10) / 10,
    daysUntilEmpty,
    urgency,
    recommendation,
  };
}
