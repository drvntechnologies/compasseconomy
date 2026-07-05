/*
# Create Daily Cargo Generation Function

## Overview
Creates a PL/pgSQL function that generates cargo demand pools for all airports,
scheduled to run daily at 0400 UTC alongside pax generation via pg_cron.

## New Functions
- `generate_daily_cargo()` - Generates cargo pools for all airports

## Scheduled Jobs
- `daily_cargo_generation` - Runs at 0400 UTC daily

## Notes
- Only routes reachable from each airport are used for cargo destination discovery
- Booked cargo is preserved across regenerations
- Shipment sizes randomized 200-8000 kg
*/

CREATE OR REPLACE FUNCTION generate_daily_cargo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  apt RECORD;
  today DATE := CURRENT_DATE;
  total_cargo_kg INTEGER;
  direct_cargo INTEGER;
  one_stop_cargo INTEGER;
  two_stop_cargo INTEGER;
  actual_generated INTEGER;
  remaining INTEGER;
  shipment_size INTEGER;
  dest TEXT;
  hub_codes TEXT[];
  direct_dests TEXT[];
  one_stop_dests TEXT[];
  two_stop_dests TEXT[];
  midpoint TEXT;
  mid_dest TEXT;
  third_dest TEXT;
BEGIN
  -- Clear stale unbooked waiting cargo pools
  DELETE FROM cargo_pools WHERE status = 'waiting' AND booking_id IS NULL;

  -- Get hub codes
  SELECT array_agg(icao_code) INTO hub_codes FROM airports WHERE is_hub = true;
  IF hub_codes IS NULL THEN
    hub_codes := ARRAY[]::TEXT[];
  END IF;

  -- Process each airport with cargo generation enabled
  FOR apt IN SELECT * FROM airports WHERE max_daily_cargo_kg > 0 LOOP
    total_cargo_kg := apt.min_daily_cargo_kg + floor(random() * (apt.max_daily_cargo_kg - apt.min_daily_cargo_kg + 1))::integer;

    -- Get direct destinations from active routes
    SELECT array_agg(DISTINCT arrival_icao) INTO direct_dests
    FROM routes
    WHERE departure_icao = apt.icao_code AND is_active = true
      AND flight_type IN ('cargo', 'pax');

    IF direct_dests IS NULL THEN
      direct_dests := ARRAY[]::TEXT[];
    END IF;

    IF array_length(direct_dests, 1) IS NULL OR array_length(direct_dests, 1) = 0 THEN
      CONTINUE;
    END IF;

    -- Find one-stop destinations via hub midpoints
    one_stop_dests := ARRAY[]::TEXT[];
    FOR midpoint IN SELECT unnest(direct_dests) INTERSECT SELECT unnest(hub_codes) LOOP
      FOR mid_dest IN
        SELECT DISTINCT arrival_icao FROM routes
        WHERE departure_icao = midpoint AND is_active = true
          AND flight_type IN ('cargo', 'pax')
          AND arrival_icao != apt.icao_code
          AND NOT (arrival_icao = ANY(direct_dests))
      LOOP
        IF NOT (mid_dest = ANY(one_stop_dests)) THEN
          one_stop_dests := array_append(one_stop_dests, mid_dest);
        END IF;
      END LOOP;
    END LOOP;

    -- Find two-stop destinations
    two_stop_dests := ARRAY[]::TEXT[];
    FOR midpoint IN SELECT unnest(one_stop_dests) INTERSECT SELECT unnest(hub_codes) LOOP
      FOR third_dest IN
        SELECT DISTINCT arrival_icao FROM routes
        WHERE departure_icao = midpoint AND is_active = true
          AND flight_type IN ('cargo', 'pax')
          AND arrival_icao != apt.icao_code
          AND NOT (arrival_icao = ANY(direct_dests))
          AND NOT (arrival_icao = ANY(one_stop_dests))
      LOOP
        IF NOT (third_dest = ANY(two_stop_dests)) THEN
          two_stop_dests := array_append(two_stop_dests, third_dest);
        END IF;
      END LOOP;
    END LOOP;

    -- Distribution: 70% direct, 20% one-stop, 10% two-stop
    direct_cargo := (total_cargo_kg * 70) / 100;
    one_stop_cargo := (total_cargo_kg * 20) / 100;
    two_stop_cargo := total_cargo_kg - direct_cargo - one_stop_cargo;

    IF array_length(one_stop_dests, 1) IS NULL OR array_length(one_stop_dests, 1) = 0 THEN
      direct_cargo := direct_cargo + one_stop_cargo;
      one_stop_cargo := 0;
    END IF;
    IF array_length(two_stop_dests, 1) IS NULL OR array_length(two_stop_dests, 1) = 0 THEN
      direct_cargo := direct_cargo + two_stop_cargo;
      two_stop_cargo := 0;
    END IF;

    actual_generated := 0;

    -- Insert direct cargo pools (split into shipments of 200-8000 kg)
    IF direct_cargo > 0 AND array_length(direct_dests, 1) > 0 THEN
      remaining := direct_cargo;
      WHILE remaining > 0 LOOP
        dest := direct_dests[1 + floor(random() * array_length(direct_dests, 1))::integer];
        shipment_size := LEAST(remaining, 200 + floor(random() * 7800)::integer);
        INSERT INTO cargo_pools (origin_icao, destination_icao, current_airport_icao, weight_kg, status, connections_remaining, generated_date)
        VALUES (apt.icao_code, dest, apt.icao_code, shipment_size, 'waiting', 0, today);
        remaining := remaining - shipment_size;
        actual_generated := actual_generated + shipment_size;
      END LOOP;
    END IF;

    -- Insert one-stop cargo pools
    IF one_stop_cargo > 0 AND array_length(one_stop_dests, 1) > 0 THEN
      remaining := one_stop_cargo;
      WHILE remaining > 0 LOOP
        dest := one_stop_dests[1 + floor(random() * array_length(one_stop_dests, 1))::integer];
        shipment_size := LEAST(remaining, 200 + floor(random() * 7800)::integer);
        INSERT INTO cargo_pools (origin_icao, destination_icao, current_airport_icao, weight_kg, status, connections_remaining, generated_date)
        VALUES (apt.icao_code, dest, apt.icao_code, shipment_size, 'waiting', 1, today);
        remaining := remaining - shipment_size;
        actual_generated := actual_generated + shipment_size;
      END LOOP;
    END IF;

    -- Insert two-stop cargo pools
    IF two_stop_cargo > 0 AND array_length(two_stop_dests, 1) > 0 THEN
      remaining := two_stop_cargo;
      WHILE remaining > 0 LOOP
        dest := two_stop_dests[1 + floor(random() * array_length(two_stop_dests, 1))::integer];
        shipment_size := LEAST(remaining, 200 + floor(random() * 7800)::integer);
        INSERT INTO cargo_pools (origin_icao, destination_icao, current_airport_icao, weight_kg, status, connections_remaining, generated_date)
        VALUES (apt.icao_code, dest, apt.icao_code, shipment_size, 'waiting', 2, today);
        remaining := remaining - shipment_size;
        actual_generated := actual_generated + shipment_size;
      END LOOP;
    END IF;

    IF actual_generated > 0 THEN
      INSERT INTO cargo_generation_log (airport_icao, cargo_generated_kg, generation_date)
      VALUES (apt.icao_code, actual_generated, today);
    END IF;
  END LOOP;
END;
$$;

-- Schedule the cron job (safe: drop only if exists, then create)
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily_cargo_generation';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('daily_cargo_generation', '0 4 * * *', 'SELECT generate_daily_cargo()');
