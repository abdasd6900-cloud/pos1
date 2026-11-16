import * as XLSX from 'xlsx';

export type FieldType = 'text' | 'number' | 'date' | 'ignore';

export interface ColumnMapping {
  field: string;
  keywords: string[];
  type: FieldType;
  required?: boolean;
}

export interface MappedRow {
  [field: string]: string | number | null;
}

export interface SmartImportResult<T> {
  rows: T[];
  skipped: number;
  errors: string[];
  detectedMapping: { header: string; field: string }[];
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseDate(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d).getTime();
  }
  const parsed = new Date(String(value));
  if (!isNaN(parsed.getTime())) return parsed.getTime();
  return null;
}

function matchColumn(header: string, mappings: ColumnMapping[]): ColumnMapping | null {
  const h = header.toLowerCase().trim();
  let best: { mapping: ColumnMapping; score: number } | null = null;
  for (const mapping of mappings) {
    for (const kw of mapping.keywords) {
      const k = kw.toLowerCase();
      if (h === k) return mapping;
      if (h.includes(k)) {
        const score = k.length / h.length;
        if (!best || score > best.score) best = { mapping, score };
      }
    }
  }
  return best?.mapping ?? null;
}

export function smartParseExcel<T>(
  data: ArrayBuffer,
  mappings: ColumnMapping[],
  buildRow: (mapped: MappedRow) => T | null,
): SmartImportResult<T> {
  const errors: string[] = [];
  try {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    if (rawRows.length < 2) {
      return { rows: [], skipped: 0, errors: ['الملف فارغ أو لا يحتوي على بيانات'], detectedMapping: [] };
    }

    const headerRow = rawRows[0] as string[];
    const detectedMapping: { header: string; field: string }[] = [];
    const colToField: (string | null)[] = headerRow.map((header) => {
      const mapping = matchColumn(normalizeText(header), mappings);
      if (mapping) {
        detectedMapping.push({ header: normalizeText(header), field: mapping.field });
        return mapping.field;
      }
      return null;
    });

    const requiredFields = mappings.filter((m) => m.required).map((m) => m.field);
    const missingRequired = requiredFields.filter((f) => !colToField.includes(f));
    if (missingRequired.length > 0) {
      const fieldKeywords = mappings
        .filter((m) => missingRequired.includes(m.field))
        .map((m) => m.keywords[0]);
      errors.push(`لم يتم العثور على أعمدة مطلوبة: ${fieldKeywords.join('، ')}`);
      return { rows: [], skipped: 0, errors, detectedMapping };
    }

    if (detectedMapping.length === 0) {
      errors.push('لم يتم التعرف على أي عمود في الملف. تأكد من أن العناوين موجودة في الصف الأول.');
      return { rows: [], skipped: 0, errors, detectedMapping };
    }

    const fieldTypes = new Map(mappings.map((m) => [m.field, m.type]));
    const rows: T[] = [];
    let skipped = 0;

    for (let i = 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      if (!rawRow) continue;
      const mapped: MappedRow = {};
      for (let c = 0; c < colToField.length; c++) {
        const field = colToField[c];
        if (!field) continue;
        const type = fieldTypes.get(field) ?? 'text';
        const cellVal = rawRow[c];
        if (type === 'number') mapped[field] = parseNumber(cellVal);
        else if (type === 'date') mapped[field] = parseDate(cellVal);
        else if (type === 'ignore') continue;
        else mapped[field] = normalizeText(cellVal);
      }
      const hasData = Object.values(mapped).some((v) => v !== null && v !== '');
      if (!hasData) { skipped++; continue; }
      const built = buildRow(mapped);
      if (built) rows.push(built);
      else skipped++;
    }

    return { rows, skipped, errors, detectedMapping };
  } catch {
    return { rows: [], skipped: 0, errors: ['تعذر قراءة الملف. تأكد أنه ملف إكسل صحيح'], detectedMapping: [] };
  }
}

export const PRODUCT_MAPPINGS: ColumnMapping[] = [
  { field: 'name', keywords: ['اسم', 'المنتج', 'الصنف', 'name', 'product', 'item'], type: 'text', required: true },
  { field: 'barcode', keywords: ['باركود', 'الباركود', 'barcode', 'ean', 'sku', 'الكود'], type: 'text' },
  { field: 'localBarcode', keywords: ['باركود محلي', 'كود محلي', 'local', 'internal'], type: 'text' },
  { field: 'price', keywords: ['السعر', 'سعر', 'بيع', 'price', 'sell', 'retail'], type: 'number' },
  { field: 'cost', keywords: ['التكلفة', 'تكلفة', 'شراء', 'cost', 'purchase', 'wholesale'], type: 'number' },
  { field: 'stock', keywords: ['الكمية', 'كمية', 'المخزون', 'stock', 'quantity', 'qty', 'المخزون'], type: 'number' },
  { field: 'unit', keywords: ['الوحدة', 'وحدة', 'unit', 'measure'], type: 'text' },
  { field: 'minStock', keywords: ['حد التنبيه', 'الحد الأدنى', 'حد', 'min', 'reorder', 'alert'], type: 'number' },
  { field: 'category', keywords: ['الفئة', 'التصنيف', 'فئة', 'category', 'type', 'group'], type: 'text' },
  { field: 'expiryDate', keywords: ['الانتهاء', 'تاريخ الانتهاء', 'انتهاء', 'expiry', 'expire', 'expiration'], type: 'date' },
];

export const CUSTOMER_MAPPINGS: ColumnMapping[] = [
  { field: 'name', keywords: ['اسم', 'الزبون', 'العميل', 'name', 'customer', 'client'], type: 'text', required: true },
  { field: 'phone', keywords: ['الجوال', 'جوال', 'الهاتف', 'هاتف', 'رقم', 'phone', 'mobile', 'tel', 'number'], type: 'text', required: true },
  { field: 'tier', keywords: ['الفئة', 'مميز', 'تصنيف', 'tier', 'type', 'vip'], type: 'text' },
  { field: 'creditLimit', keywords: ['حد الائتمان', 'الائتمان', 'الحد', 'credit', 'limit'], type: 'number' },
  { field: 'discountPercent', keywords: ['الخصم', 'خصم', 'discount'], type: 'number' },
  { field: 'notes', keywords: ['ملاحظات', 'ملاحظة', 'notes', 'note', 'remark'], type: 'text' },
  { field: 'debt', keywords: ['الدين', 'دين', 'الرصيد', 'رصيد', 'debt', 'balance'], type: 'number' },
  { field: 'subscriptionNumber', keywords: ['رقم الاشتراك', 'اشتراك', 'subscription', 'sub'], type: 'text' },
  { field: 'subscriptionExpiry', keywords: ['انتهاء الاشتراك', 'تاريخ الاشتراك', 'expiry', 'sub expiry'], type: 'date' },
];
