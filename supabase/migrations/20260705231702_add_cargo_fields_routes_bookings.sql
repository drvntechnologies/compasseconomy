/*
# Add Cargo Fields to Routes and Flight Bookings

1. Modified Tables
   - `routes`
     - `cargo_price_per_kg` (numeric, default 0.45) - revenue earned per kg of cargo delivered
   - `flight_bookings`
     - `cargo_kg` (integer, default 0) - total cargo loaded on this flight in kg

2. Financial Transactions Type Update
   - Adds 'cargo_revenue' to the allowed types for financial_transactions

3. Notes
   - Routes with flight_type='cargo' are dedicated freight routes (freighter-exclusive)
   - cargo_price_per_kg applies to all route types (pax planes earn belly cargo revenue too)
   - cargo_kg in bookings tracks total cargo weight assigned to a flight
*/

-- Add cargo_price_per_kg to routes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'routes' AND column_name = 'cargo_price_per_kg') THEN
    ALTER TABLE routes ADD COLUMN cargo_price_per_kg numeric NOT NULL DEFAULT 0.45;
  END IF;
END $$;

-- Add cargo_kg to flight_bookings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'flight_bookings' AND column_name = 'cargo_kg') THEN
    ALTER TABLE flight_bookings ADD COLUMN cargo_kg integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Update the financial_transactions type constraint to include cargo_revenue
-- First check the current constraint name
DO $$ BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE table_name = 'financial_transactions' AND constraint_type = 'CHECK'
             AND constraint_name = 'financial_transactions_type_check') THEN
    ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_type_check;
  END IF;
END $$;

-- Re-add with cargo_revenue included
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE table_name = 'financial_transactions' AND constraint_type = 'CHECK'
                 AND constraint_name = 'financial_transactions_type_check') THEN
    ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_type_check 
      CHECK (type IN ('ticket_revenue', 'engine_cost', 'gate_fee', 'aircraft_lease', 'adjustment', 'cargo_revenue'));
  END IF;
END $$;
