import { supabase } from './supabase';

export interface CloudSnapshot {
  id: string;
  label: string;
  data_size: number;
  created_at: string;
}

export interface FullBackupData {
  products: unknown[];
  customers: unknown[];
  transactions: unknown[];
  settings: unknown;
  auditLog: unknown[];
  suppliers: unknown[];
  expenses: unknown[];
  shifts: unknown[];
  currencies: unknown[];
  staff: unknown[];
  promotions: unknown[];
  stocktakes: unknown[];
  attachments: unknown[];
  telecomCompanies: unknown[];
  simCards: unknown[];
  bundles: unknown[];
  subAgents: unknown[];
  debtReminders: unknown[];
  telecomSales: unknown[];
  agentBundles: unknown[];
  simLocations: unknown[];
  simLocationStock: unknown[];
  telecomSuppliers: unknown[];
  shipments: unknown[];
  rechargeRequests: unknown[];
  businessHours: unknown;
  keywordReplies: unknown[];
  pendingOperations: unknown[];
  freezeRequests: unknown[];
  supportTickets: unknown[];
  unrecognizedMessages: unknown[];
  transferNotifications: unknown[];
  transferReports: unknown[];
  nameMappings: unknown[];
  customerFiles: unknown[];
  smsMessages: unknown[];
  timestamp: number;
  version: number;
}

export async function uploadCloudSnapshot(data: FullBackupData, label: string): Promise<{ success: boolean; error?: string }> {
  const jsonStr = JSON.stringify(data);
  const { error } = await supabase.from('backup_snapshots').insert({
    label: label || `نسخة ${new Date().toLocaleString('ar')}`,
    snapshot_data: data,
    data_size: jsonStr.length,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function listCloudSnapshots(): Promise<{ data: CloudSnapshot[] | null; error?: string }> {
  const { data, error } = await supabase
    .from('backup_snapshots')
    .select('id, label, data_size, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { data: null, error: error.message };
  return { data: data as CloudSnapshot[] };
}

export async function downloadCloudSnapshot(id: string): Promise<{ data: FullBackupData | null; error?: string }> {
  const { data, error } = await supabase
    .from('backup_snapshots')
    .select('snapshot_data')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'النسخة غير موجودة' };
  return { data: data.snapshot_data as FullBackupData };
}

export async function deleteCloudSnapshot(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('backup_snapshots').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
