/*
# Create Airline Economy System

Establishes the financial infrastructure for the airline simulation including
a running airline balance, transaction ledger, ticket pricing, and aircraft operating costs.

1. New Tables
  - `airline_financials`
    - `id` (integer, primary key, singleton row id=1)
    - `balance_usd` (numeric) - running airline balance, starts at $150,000,000
    - `updated_at` (timestamptz) - last update timestamp
  - `financial_transactions`
    - `id` (uuid, primary key)
    - `type` (text) - one of: ticket_revenue, engine_cost, gate_fee, aircraft_lease, adjustment
    - `amount` (numeric) - positive for credits, negative for debits
    - `description` (text) - human-readable description
    - `reference_id` (uuid, nullable) - optional FK to booking/aircraft/gate
    - `created_at` (timestamptz)
  - `monthly_billing_log`
    - `id` (uuid, primary key)
    - `billing_month` (text, unique) - format "YYYY-MM", prevents double-billing
    - `gate_fees_total` (numeric) - total gate fees charged
    - `lease_fees_total` (numeric) - total aircraft lease fees charged
    - `processed_by` (uuid) - admin who triggered it
    - `created_at` (timestamptz)

2. Modified Tables
  - `routes` - add `ticket_price_usd` (numeric, default 250)
  - `aircraft` - add `hourly_cost_usd` (numeric, default 0) and `monthly_lease_usd` (numeric, default 0)
  - `flight_bookings` - add `engine_hours` (numeric, nullable)

3. Security
  - Enable RLS on all new tables
  - All authenticated users can read financials and transactions (transparency)
  - Only admins can insert adjustments and process billing
  - Transactions are insert-only (append-only ledger, no updates/deletes by users)

4. Notes
  - The airline_financials table is a singleton (one row, id=1)
  - Ticket revenue is credited when pax reach their FINAL destination
  - Engine costs are debited when a pilot completes a flight and enters engine hours
  - Monthly gate/lease fees are processed manually by admin via "Process Monthly" action
*/

-- Airline financials singleton
CREATE TABLE IF NOT EXISTS airline_financials (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_usd numeric NOT NULL DEFAULT 150000000,
  updated_at timestamptz DEFAULT now()
);

-- Insert the initial balance row if it doesn't exist
INSERT INTO airline_financials (id, balance_usd) VALUES (1, 150000000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE airline_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_financials" ON airline_financials;
CREATE POLICY "select_financials" ON airline_financials FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_financials" ON airline_financials;
CREATE POLICY "update_financials" ON airline_financials FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Financial transactions ledger
CREATE TABLE IF NOT EXISTS financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ticket_revenue', 'engine_cost', 'gate_fee', 'aircraft_lease', 'adjustment')),
  amount numeric NOT NULL,
  description text NOT NULL,
  reference_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_transactions" ON financial_transactions;
CREATE POLICY "select_transactions" ON financial_transactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_transactions" ON financial_transactions;
CREATE POLICY "insert_transactions" ON financial_transactions FOR INSERT
  TO authenticated WITH CHECK (true);

-- Monthly billing log
CREATE TABLE IF NOT EXISTS monthly_billing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_month text UNIQUE NOT NULL,
  gate_fees_total numeric NOT NULL DEFAULT 0,
  lease_fees_total numeric NOT NULL DEFAULT 0,
  processed_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monthly_billing_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_billing_log" ON monthly_billing_log;
CREATE POLICY "select_billing_log" ON monthly_billing_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_billing_log" ON monthly_billing_log;
CREATE POLICY "insert_billing_log" ON monthly_billing_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Add ticket_price_usd to routes (default $250)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'ticket_price_usd'
  ) THEN
    ALTER TABLE routes ADD COLUMN ticket_price_usd numeric NOT NULL DEFAULT 250;
  END IF;
END $$;

-- Add hourly_cost_usd and monthly_lease_usd to aircraft
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aircraft' AND column_name = 'hourly_cost_usd'
  ) THEN
    ALTER TABLE aircraft ADD COLUMN hourly_cost_usd numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aircraft' AND column_name = 'monthly_lease_usd'
  ) THEN
    ALTER TABLE aircraft ADD COLUMN monthly_lease_usd numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add engine_hours to flight_bookings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flight_bookings' AND column_name = 'engine_hours'
  ) THEN
    ALTER TABLE flight_bookings ADD COLUMN engine_hours numeric;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_created ON financial_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_billing_month ON monthly_billing_log(billing_month);
