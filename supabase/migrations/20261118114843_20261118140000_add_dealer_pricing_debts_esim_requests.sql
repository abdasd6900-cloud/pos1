/*
# Dealer Hub Enhancement — Custom Sale Prices, Customer Debts, eSIM Requests, Owner Commission

## Overview
Adds support for:
1. Dealer-custom sale prices per pricing entry (dealer sets their own selling price).
2. Dealer customer debts with payment status (full/partial/debt) and collection.
3. eSIM (electronic SIM) requests from dealer portal for bundles/offers.
4. Owner-commission tracking: when owner recharges a dealer's customer directly, the price difference is credited to dealer balance and notifications are sent to both.

## New Tables

1. **dealer_custom_prices** — Dealer-specific sale price overrides per pricing entry.
   - id (uuid PK), dealer_id (FK→dealers), pricing_id (FK→dealer_pricing), custom_sale_price (numeric),
     created_at, updated_at.
   - UNIQUE(dealer_id, pricing_id).

2. **dealer_customer_debts** — Debt records for dealer's customers (payment status tracking).
   - id (uuid PK), dealer_id (FK→dealers), customer_id (FK→dealer_customers),
     amount (numeric), paid_amount (numeric), payment_status (full/partial/debt),
     description, related_request_id, created_at, updated_at.

3. **dealer_esim_requests** — eSIM requests from dealers for bundles/offers.
   - id (uuid PK), dealer_id (FK→dealers), pricing_id (FK→dealer_pricing),
     customer_name, contact_phone, company_name, bundle_name, sale_price,
     status (pending/approved/rejected/completed), owner_reply, barcode_image_url,
     phone_number_assigned, completed_at, created_at, updated_at.

## Modified Tables

- **dealer_recharge_requests** — Added columns: is_esim (boolean default false), esim_request_id (uuid nullable).
- **dealer_transactions** — Added column: commission_amount (numeric default 0) for owner-commission credits.
- **dealer_notifications** — Added column: related_phone (text nullable) for commission notifications.

## Security
- RLS enabled on ALL new tables.
- Policies: dealer-scoped access through dealer_id→dealers.owner_user_id = auth.uid().
- Grants: authenticated + service_role CRUD on all new tables.
- All new tables follow the same ownership pattern as existing dealer tables.
*/

-- ============ dealer_custom_prices ============
CREATE TABLE IF NOT EXISTS dealer_custom_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  pricing_id uuid NOT NULL REFERENCES dealer_pricing(id) ON DELETE CASCADE,
  custom_sale_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dealer_id, pricing_id)
);

ALTER TABLE dealer_custom_prices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_custom_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_custom_prices TO service_role;

DROP POLICY IF EXISTS "select_dealer_custom_prices" ON dealer_custom_prices;
CREATE POLICY "select_dealer_custom_prices" ON dealer_custom_prices FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_custom_prices.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_custom_prices" ON dealer_custom_prices;
CREATE POLICY "insert_dealer_custom_prices" ON dealer_custom_prices FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_custom_prices.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_custom_prices" ON dealer_custom_prices;
CREATE POLICY "update_dealer_custom_prices" ON dealer_custom_prices FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_custom_prices.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_custom_prices.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_custom_prices" ON dealer_custom_prices;
CREATE POLICY "delete_dealer_custom_prices" ON dealer_custom_prices FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_custom_prices.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_customer_debts ============
CREATE TABLE IF NOT EXISTS dealer_customer_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES dealer_customers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'debt',
  description text,
  related_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_customer_debts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_customer_debts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_customer_debts TO service_role;

DROP POLICY IF EXISTS "select_dealer_customer_debts" ON dealer_customer_debts;
CREATE POLICY "select_dealer_customer_debts" ON dealer_customer_debts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customer_debts.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_customer_debts" ON dealer_customer_debts;
CREATE POLICY "insert_dealer_customer_debts" ON dealer_customer_debts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customer_debts.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_customer_debts" ON dealer_customer_debts;
CREATE POLICY "update_dealer_customer_debts" ON dealer_customer_debts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customer_debts.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customer_debts.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_customer_debts" ON dealer_customer_debts;
CREATE POLICY "delete_dealer_customer_debts" ON dealer_customer_debts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customer_debts.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_esim_requests ============
CREATE TABLE IF NOT EXISTS dealer_esim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  pricing_id uuid REFERENCES dealer_pricing(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  contact_phone text,
  company_name text,
  bundle_name text,
  sale_price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  owner_reply text,
  barcode_image_url text,
  phone_number_assigned text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_esim_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_esim_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_esim_requests TO service_role;

DROP POLICY IF EXISTS "select_dealer_esim_requests" ON dealer_esim_requests;
CREATE POLICY "select_dealer_esim_requests" ON dealer_esim_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_esim_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_esim_requests" ON dealer_esim_requests;
CREATE POLICY "insert_dealer_esim_requests" ON dealer_esim_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_esim_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_esim_requests" ON dealer_esim_requests;
CREATE POLICY "update_dealer_esim_requests" ON dealer_esim_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_esim_requests.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_esim_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_esim_requests" ON dealer_esim_requests;
CREATE POLICY "delete_dealer_esim_requests" ON dealer_esim_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_esim_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ Add columns to existing tables ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dealer_recharge_requests' AND column_name = 'is_esim') THEN
    ALTER TABLE dealer_recharge_requests ADD COLUMN is_esim boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dealer_recharge_requests' AND column_name = 'esim_request_id') THEN
    ALTER TABLE dealer_recharge_requests ADD COLUMN esim_request_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dealer_transactions' AND column_name = 'commission_amount') THEN
    ALTER TABLE dealer_transactions ADD COLUMN commission_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dealer_notifications' AND column_name = 'related_phone') THEN
    ALTER TABLE dealer_notifications ADD COLUMN related_phone text;
  END IF;
END $$;

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_dealer_custom_prices_dealer ON dealer_custom_prices(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_custom_prices_pricing ON dealer_custom_prices(pricing_id);
CREATE INDEX IF NOT EXISTS idx_dealer_customer_debts_dealer ON dealer_customer_debts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_customer_debts_customer ON dealer_customer_debts(customer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_esim_requests_dealer ON dealer_esim_requests(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_esim_requests_status ON dealer_esim_requests(status);
