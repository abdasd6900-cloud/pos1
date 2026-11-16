interface EsimDeviceEntry {
  brand: string;
  keywords: string[];
}

const ESIM_DEVICES: EsimDeviceEntry[] = [
  { brand: 'iPhone', keywords: ['iphone', 'ايفون', 'أيفون', 'ايفون '] },
  { brand: 'iPad', keywords: ['ipad', 'ايباد', 'أيباد'] },

  { brand: 'Galaxy', keywords: ['galaxy', 'جالاكسي', 'غالاكسي', 'جالكسي'] },
  { brand: 'Samsung', keywords: ['samsung', 'سامسونج', 'سامسنج'] },

  { brand: 'Pixel', keywords: ['pixel', 'بيكسل', 'بكسل'] },

  { brand: 'Xiaomi', keywords: ['xiaomi', 'شاومي', 'شاومى', 'redmi', 'ريدمي', 'poco', 'بوكو'] },

  { brand: 'Huawei', keywords: ['huawei', 'هواوي', 'هواوى'] },

  { brand: 'Motorola', keywords: ['motorola', 'موتورولا', 'moto', 'موتو', 'razr'] },

  { brand: 'OnePlus', keywords: ['oneplus', 'ون بلس', 'وان بلس', 'ون بلس'] },

  { brand: 'Oppo', keywords: ['oppo', 'أوبو', 'اوبو', 'reno', 'فايند'] },

  { brand: 'Honor', keywords: ['honor', 'هونر', 'هونور', 'magic'] },

  { brand: 'Sony', keywords: ['sony', 'سوني', 'سونى', 'xperia'] },

  { brand: 'Nokia', keywords: ['nokia', 'نوكيا'] },

  { brand: 'Vivo', keywords: ['vivo', 'فيفو', 'iqoo'] },

  { brand: 'TCL', keywords: ['tcl'] },

  { brand: 'Fairphone', keywords: ['fairphone'] },

  { brand: 'Nothing', keywords: ['nothing phone', 'ناثنغ'] },

  { brand: 'Realme', keywords: ['realme', 'ريلمي'] },

  { brand: 'ASUS', keywords: ['asus', 'اسوس', 'zenfone'] },

  { brand: 'Sharp', keywords: ['sharp', 'شارب', 'aquos'] },

  { brand: 'Rakuten', keywords: ['rakuten', 'راكوتن'] },

  { brand: 'Alcatel', keywords: ['alcatel', 'الكاتل'] },

  { brand: 'ZTE', keywords: ['zte', 'نوبيا', 'nubia'] },
];

const ESIM_SUPPORTED_MODELS: RegExp[] = [
  /iphone\s*(1[2-9]|se|xs|xr|duo|air)/i,
  /iphone\s*1[1-8]/i,
  /ipad/i,
  /galaxy\s*(s[2-9]|note\s*20|z\s*(flip|fold|trifold)|a\s*(5[4-6]|3[5-6]|2[3-6])|xcover\s*7)/i,
  /galaxy\s*(s2[0-5]|note\s*20)/i,
  /pixel\s*([2-9]|1[01]|fold)/i,
  /xiaomi\s*(1[2-5]|14t|15t|13t|12t)/i,
  /redmi\s*note\s*1[1-4]\s*pro/i,
  /poco\s*(x7|f8)/i,
  /p?(40|mate\s*40)/i,
  /moto\s*(g3[4-9]|g4|g5|g6|g7|g8|g(2024|2025))/i,
  /edge\s*(4[0-9]|5[0-9]|6[0-9]|\+|fusion|neo|stylus)/i,
  /razr/i,
  /oneplus\s*(1[1-5]|open)/i,
  /find\s*(x[3-9]|n[25])/i,
  /reno\s*1[4-5]/i,
  /honor\s*(90|200|400|magic)/i,
  /magic[4-8]/i,
  /xperia\s*(1\s*[4-7]|5\s*[4-6]|10)/i,
  /nokia\s*(g60|x30|xr21)/i,
  /vivo\s*(x[23]00|v[2-5]0|iqoo\s*15)/i,
  /tcl\s*(60|50|40|nxtpaper)/i,
  /fairphone\s*[4-6]/i,
  /nothing\s*phone/i,
  /realme\s*14/i,
  /zenfone\s*12/i,
  /aquos/i,
  /rakuten/i,
  /alcatel\s*v3/i,
  /nubia\s*flip/i,
];

const PLASTIC_ONLY_KEYWORDS: string[] = [
  'بلاستيك', 'بلاستيكيه', 'بلاستيكية', 'plastic', 'sim card', 'شريحة عادية',
  'شريحه عاديه', 'شريحة بلاستيك', 'شريحه بلاستيك',
];

const ESIM_REQUEST_KEYWORDS: string[] = [
  'شريحة الكترونية', 'شريحه الكترونيه', 'شريحة الكترونيه', 'شريحه الكترونية',
  'شريحة رقمية', 'شريحه رقميه', 'esim', 'e-sim', 'e sim',
  'شريحة افتراضية', 'شريحه افتراضيه', 'الكترونية', 'الكترونيه',
  'بدي شريحة الكترونية', 'اريد شريحة الكترونية', 'شريحة الكترونيك',
  'رقمية', 'رقميه',
];

const ADVICE_REQUEST_KEYWORDS: string[] = [
  'نصيحة', 'نصيحه', 'نصحني', 'نصحنى', 'ماذا تنصح', 'وش تنصح',
  'ايه الاحسن', 'ايه الافضل', 'ايه احسن', 'ايش احسن', 'ايش الافضل',
  'احسن شركة', 'افضل شركة', 'اي شركة تنصح', 'وش تنصحني',
  'مش عارف', 'مش عارفة', 'ما عرف', 'ما عرفت', 'ساعدني', 'ساعدنى',
  'محتار', 'محتارة', 'استشارة', 'استشاره', 'بدي استشارة',
  'ايش اختار', 'ايش احسن', 'recommend', 'advice', 'suggest',
];

export function isEsimRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of ESIM_REQUEST_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isPlasticSimRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of PLASTIC_ONLY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function isAdviceRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  for (const kw of ADVICE_REQUEST_KEYWORDS) {
    if (lower.includes(kw.toLowerCase().trim())) return true;
  }
  return false;
}

export function extractPhoneModel(message: string): string | null {
  const cleaned = message.trim();
  for (const device of ESIM_DEVICES) {
    for (const kw of device.keywords) {
      if (cleaned.toLowerCase().includes(kw.toLowerCase())) {
        const idx = cleaned.toLowerCase().indexOf(kw.toLowerCase());
        const remainder = cleaned.substring(idx).trim();
        if (remainder.length >= 3) {
          return remainder;
        }
      }
    }
  }
  if (cleaned.length >= 3 && cleaned.length <= 60) {
    return cleaned;
  }
  return null;
}

export interface EsimCheckResult {
  supported: boolean;
  model: string | null;
  brand: string | null;
  confidence: 'high' | 'low' | 'unknown';
}

export function checkEsimCompatibility(phoneModel: string): EsimCheckResult {
  const normalized = phoneModel.toLowerCase().replace(/\s+/g, ' ').trim();

  if (!normalized || normalized.length < 2) {
    return { supported: false, model: phoneModel, brand: null, confidence: 'unknown' };
  }

  let brand: string | null = null;
  for (const device of ESIM_DEVICES) {
    for (const kw of device.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        brand = device.brand;
        break;
      }
    }
    if (brand) break;
  }

  for (const pattern of ESIM_SUPPORTED_MODELS) {
    if (pattern.test(normalized)) {
      return { supported: true, model: phoneModel, brand, confidence: 'high' };
    }
  }

  if (brand) {
    return { supported: false, model: phoneModel, brand, confidence: 'low' };
  }

  return { supported: false, model: phoneModel, brand: null, confidence: 'unknown' };
}

export async function checkEsimCompatibilityOnline(phoneModel: string): Promise<EsimCheckResult> {
  const localResult = checkEsimCompatibility(phoneModel);
  if (localResult.confidence === 'high') {
    return localResult;
  }

  try {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase
      .from('esim_devices')
      .select('brand, model, supported')
      .ilike('model', `%${phoneModel.toLowerCase()}%`)
      .limit(5);

    if (!error && data && data.length > 0) {
      const match = data.find((d: { supported: boolean }) => d.supported === true);
      if (match) {
        return { supported: true, model: phoneModel, brand: match.brand, confidence: 'high' };
      }
      const unsupported = data.find((d: { supported: boolean }) => d.supported === false);
      if (unsupported) {
        return { supported: false, model: phoneModel, brand: unsupported.brand, confidence: 'high' };
      }
    }
  } catch {
    // fall through to local result
  }

  return localResult;
}
