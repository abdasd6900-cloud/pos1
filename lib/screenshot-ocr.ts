import { supabase } from '@/lib/supabase';

export interface ScreenshotOcrResult {
  type: 'sim_card' | 'transfer_receipt' | 'whatsapp_voice' | 'whatsapp_image_sim' | 'unknown';
  // SIM card fields
  phone?: string;
  sim?: string;
  // Transfer receipt fields
  senderName?: string;
  recipientName?: string;
  amount?: number;
  currency?: string;
  reference?: string;
}

const fileToDataUrl = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
};

export async function analyzeScreenshotImage(image: File | Blob): Promise<ScreenshotOcrResult> {
  const dataUrl = await fileToDataUrl(image);
  const { data, error } = await supabase.functions.invoke('ai-ocr', {
    body: { image: dataUrl },
  });
  if (error) throw error;
  if (!data) return { type: 'unknown' };

  if (data.type === 'sim_card') {
    return {
      type: 'sim_card',
      phone: String(data.phone ?? '').replace(/\D/g, '').slice(0, 10),
      sim: String(data.sim ?? '').trim(),
    };
  }

  if (data.type === 'transfer_receipt') {
    return {
      type: 'transfer_receipt',
      senderName: String(data.senderName ?? '').trim(),
      recipientName: String(data.recipientName ?? '').trim(),
      amount: typeof data.amount === 'number' ? data.amount : parseFloat(String(data.amount ?? '0')) || 0,
      currency: String(data.currency ?? '').trim().toUpperCase() || undefined,
      reference: String(data.reference ?? '').trim(),
    };
  }

  return { type: 'unknown' };
}
