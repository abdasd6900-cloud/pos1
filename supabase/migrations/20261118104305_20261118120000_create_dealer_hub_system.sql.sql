/*
# Sahab Dealer Hub — بوابة الموزع الذكية

## Overview
Creates the complete database schema for the dealer portal system. Dealers can log in,
view their customers/numbers, submit recharge requests, view offers with custom pricing,
manage plastic SIM cards, receive notifications, and track their wallet balance.

## New Tables

1. **dealers** — Dealer profiles linked to the main store owner (user_id from profiles).
   - id (uuid PK), owner_user_id (uuid FK→profiles.id), name, phone, password_hash,
     balance, credit_limit, active, created_at, updated_at.

2. **dealer_customers** — Customers assigned to a dealer. Maps phone numbers to customer names.
   - id (uuid PK), dealer_id (uuid FK→dealers.id), phone_number, customer_name,
     contact_phone, company_name, status (active/expired/suspended), created_at, updated_at.

3. **dealer_recharge_requests** — Recharge requests from dealers to the store owner.
   - id (uuid PK), dealer_id (uuid FK→dealers.id), customer_name, contact_phone,
     sim_number, company_name, bundle_name, duration, sale_price, status (pending/approved/rejected/completed),
     owner_reply, phone_number_assigned, completed_at, sms_sent, created_at, updated_at.

4. **dealer_pricing** — Custom pricing per bundle for all dealers (uniform pricing set by owner).
   - id (uuid PK), company_name, bundle_name, bundle_type (monthly/offer), offer_type,
     dealer_price, sale_price, cost, duration_days, active, created_at, updated_at.

5. **dealer_plastic_sims** — Plastic SIM cards held by dealers.
   - id (uuid PK), dealer_id (uuid FK→dealers.id), sim_number, company_name,
     bundle_name, status (in_stock/assigned/used), assigned_phone, created_at, updated_at.

6. **dealer_notifications** — Notifications for dealers (recharge completed, request reply, etc).
   - id (uuid PK), dealer_id (uuid FK→dealers.id), type, title, body, read,
     related_request_id, created_at.

7. **dealer_transactions** — Dealer wallet ledger (recharge deductions, balance top-ups).
   - id (uuid PK), dealer_id (uuid FK→dealers.id), type (recharge/topup/adjustment),
     amount, balance_after, description, related_request_id, created_at.

## Security
- RLS enabled on ALL tables.
- Policies: dealers can only access their own rows (scoped by dealer_id or owner_user_id).
- The store owner (authenticated user with role 'admin' or 'user') can access all dealer data
  scoped to their own user_id (owner_user_id).
- Grants: authenticated role gets CRUD on tables they own.
- Service role granted for edge functions.
*/

-- ============ dealers table ============
CREATE TABLE IF NOT EXISTS dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  credit_limit numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealers TO service_role;

DROP POLICY IF EXISTS "select_own_dealers" ON dealers;
CREATE POLICY "select_own_dealers" ON dealers FOR SELECT
  TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_dealers" ON dealers;
CREATE POLICY "insert_own_dealers" ON dealers FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_dealers" ON dealers;
CREATE POLICY "update_own_dealers" ON dealers FOR UPDATE
  TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_dealers" ON dealers;
CREATE POLICY "delete_own_dealers" ON dealers FOR DELETE
  TO authenticated USING (owner_user_id = auth.uid());

-- ============ dealer_customers table ============
CREATE TABLE IF NOT EXISTS dealer_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  phone_number text,
  customer_name text NOT NULL,
  contact_phone text,
  company_name text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_customers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_customers TO service_role;

DROP POLICY IF EXISTS "select_dealer_customers" ON dealer_customers;
CREATE POLICY "select_dealer_customers" ON dealer_customers FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customers.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_customers" ON dealer_customers;
CREATE POLICY "insert_dealer_customers" ON dealer_customers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customers.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_customers" ON dealer_customers;
CREATE POLICY "update_dealer_customers" ON dealer_customers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customers.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customers.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_customers" ON dealer_customers;
CREATE POLICY "delete_dealer_customers" ON dealer_customers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_customers.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_recharge_requests table ============
CREATE TABLE IF NOT EXISTS dealer_recharge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  contact_phone text,
  sim_number text,
  company_name text,
  bundle_name text,
  duration text,
  sale_price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  owner_reply text,
  phone_number_assigned text,
  completed_at timestamptz,
  sms_sent boolean NOT NULL DEFAULT false,
  sms_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_recharge_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_recharge_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_recharge_requests TO service_role;

DROP POLICY IF EXISTS "select_recharge_requests" ON dealer_recharge_requests;
CREATE POLICY "select_recharge_requests" ON dealer_recharge_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_recharge_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_recharge_requests" ON dealer_recharge_requests;
CREATE POLICY "insert_recharge_requests" ON dealer_recharge_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_recharge_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_recharge_requests" ON dealer_recharge_requests;
CREATE POLICY "update_recharge_requests" ON dealer_recharge_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_recharge_requests.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_recharge_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_recharge_requests" ON dealer_recharge_requests;
CREATE POLICY "delete_recharge_requests" ON dealer_recharge_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_recharge_requests.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_pricing table ============
CREATE TABLE IF NOT EXISTS dealer_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  bundle_name text NOT NULL,
  bundle_type text NOT NULL DEFAULT 'monthly',
  offer_type text,
  dealer_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_pricing ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_pricing TO service_role;

DROP POLICY IF EXISTS "select_dealer_pricing" ON dealer_pricing;
CREATE POLICY "select_dealer_pricing" ON dealer_pricing FOR SELECT
  TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "insert_dealer_pricing" ON dealer_pricing;
CREATE POLICY "insert_dealer_pricing" ON dealer_pricing FOR INSERT
  TO authenticated WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "update_dealer_pricing" ON dealer_pricing;
CREATE POLICY "update_dealer_pricing" ON dealer_pricing FOR UPDATE
  TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "delete_dealer_pricing" ON dealer_pricing;
CREATE POLICY "delete_dealer_pricing" ON dealer_pricing FOR DELETE
  TO authenticated USING (owner_user_id = auth.uid());

-- ============ dealer_plastic_sims table ============
CREATE TABLE IF NOT EXISTS dealer_plastic_sims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  sim_number text NOT NULL,
  company_name text NOT NULL,
  bundle_name text,
  status text NOT NULL DEFAULT 'in_stock',
  assigned_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_plastic_sims ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_plastic_sims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_plastic_sims TO service_role;

DROP POLICY IF EXISTS "select_plastic_sims" ON dealer_plastic_sims;
CREATE POLICY "select_plastic_sims" ON dealer_plastic_sims FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_plastic_sims.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_plastic_sims" ON dealer_plastic_sims;
CREATE POLICY "insert_plastic_sims" ON dealer_plastic_sims FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_plastic_sims.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_plastic_sims" ON dealer_plastic_sims;
CREATE POLICY "update_plastic_sims" ON dealer_plastic_sims FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_plastic_sims.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_plastic_sims.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_plastic_sims" ON dealer_plastic_sims;
CREATE POLICY "delete_plastic_sims" ON dealer_plastic_sims FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_plastic_sims.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_notifications table ============
CREATE TABLE IF NOT EXISTS dealer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  related_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_notifications TO service_role;

DROP POLICY IF EXISTS "select_dealer_notifications" ON dealer_notifications;
CREATE POLICY "select_dealer_notifications" ON dealer_notifications FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_notifications.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_notifications" ON dealer_notifications;
CREATE POLICY "insert_dealer_notifications" ON dealer_notifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_notifications.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_notifications" ON dealer_notifications;
CREATE POLICY "update_dealer_notifications" ON dealer_notifications FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_notifications.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_notifications.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_notifications" ON dealer_notifications;
CREATE POLICY "delete_dealer_notifications" ON dealer_notifications FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_notifications.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ dealer_transactions table ============
CREATE TABLE IF NOT EXISTS dealer_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  description text,
  related_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealer_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_transactions TO service_role;

DROP POLICY IF EXISTS "select_dealer_transactions" ON dealer_transactions;
CREATE POLICY "select_dealer_transactions" ON dealer_transactions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_transactions.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_dealer_transactions" ON dealer_transactions;
CREATE POLICY "insert_dealer_transactions" ON dealer_transactions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_transactions.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_dealer_transactions" ON dealer_transactions;
CREATE POLICY "update_dealer_transactions" ON dealer_transactions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_transactions.dealer_id AND d.owner_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_transactions.dealer_id AND d.owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_dealer_transactions" ON dealer_transactions;
CREATE POLICY "delete_dealer_transactions" ON dealer_transactions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM dealers d WHERE d.id = dealer_transactions.dealer_id AND d.owner_user_id = auth.uid())
  );

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_dealers_owner ON dealers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_customers_dealer ON dealer_customers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_recharge_requests_dealer ON dealer_recharge_requests(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_recharge_requests_status ON dealer_recharge_requests(status);
CREATE INDEX IF NOT EXISTS idx_dealer_pricing_owner ON dealer_pricing(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_plastic_sims_dealer ON dealer_plastic_sims(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_notifications_dealer ON dealer_notifications(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_transactions_dealer ON dealer_transactions(dealer_id);
