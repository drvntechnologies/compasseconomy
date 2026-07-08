/*
# Add atomic balance adjustment function

1. New Functions
  - `adjust_balance(amount_delta numeric)` - Atomically adjusts the airline balance 
    by the given delta using a single UPDATE statement, preventing race conditions
    where concurrent reads could cause one write to overwrite the other.

2. Notes
  - Returns the new balance after adjustment
  - Used by edge functions and frontend to safely modify the balance
  - Replaces the read-then-write pattern that was vulnerable to concurrent updates
*/

CREATE OR REPLACE FUNCTION adjust_balance(amount_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE airline_financials
  SET balance_usd = balance_usd + amount_delta,
      updated_at = now()
  WHERE id = 1
  RETURNING balance_usd INTO new_balance;
  
  RETURN new_balance;
END;
$$;
