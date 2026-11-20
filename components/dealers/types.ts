export interface Dealer {
  id: string;
  owner_user_id: string;
  name: string;
  phone: string;
  balance: number;
  credit_limit: number;
  active: boolean;
  created_at: string;
}

export interface RechargeRequest {
  id: string;
  dealer_id: string;
  customer_name: string;
  contact_phone: string;
  sim_number: string;
  company_name: string;
  bundle_name: string;
  duration: string;
  sale_price: number;
  status: string;
  owner_reply: string;
  phone_number_assigned: string;
  completed_at: string | null;
  sms_sent: boolean;
  sms_message: string;
  created_at: string;
}

export interface PricingEntry {
  id: string;
  owner_user_id: string;
  company_name: string;
  bundle_name: string;
  bundle_type: string;
  offer_type: string | null;
  dealer_price: number;
  sale_price: number;
  cost: number;
  duration_days: number;
  active: boolean;
}

export interface PlasticSim {
  id: string;
  dealer_id: string;
  sim_number: string;
  company_name: string;
  bundle_name: string;
  status: string;
  assigned_phone: string;
}

export interface EsimRequest {
  id: string;
  dealer_id: string;
  pricing_id: string | null;
  customer_name: string;
  contact_phone: string | null;
  company_name: string | null;
  bundle_name: string | null;
  sale_price: number;
  status: string;
  owner_reply: string | null;
  barcode_image_url: string | null;
  phone_number_assigned: string | null;
  completed_at: string | null;
  created_at: string;
}

export type Tab = 'dealers' | 'requests' | 'pricing' | 'sims';
