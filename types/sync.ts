export interface SyncEventRow {
  event_id: string;
  event_type: 'transaction' | 'telecom_sale';
  payload: Record<string, unknown>;
  phone: string | null;
  message: string | null;
  source: 'web' | 'android';
  created_at: string;
}
