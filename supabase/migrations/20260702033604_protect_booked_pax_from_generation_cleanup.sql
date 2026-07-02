/*
# Protect booked pax from daily generation cleanup

## Changes
- Updates `generate_daily_demand()` function to explicitly exclude pax_pools
  with a non-null booking_id from the daily cleanup delete.
- This ensures reserved/in-transit passengers are never accidentally deleted,
  even if their status were somehow still 'waiting'.

## Important Notes
1. The previous logic only deleted `status = 'waiting'` which already preserved
   in-transit pax, but this adds a belt-and-suspenders `booking_id IS NULL` check.
2. Function is replaced via CREATE OR REPLACE (idempotent).
*/

CREATE OR REPLACE FUNCTION generate_daily_demand()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  apt RECORD;
  r RECORD;
  today DATE := CURRENT_DATE;
  total_pax INTEGER;
  direct_pax INTEGER;
  one_stop_pax INTEGER;
  two_stop_pax INTEGER;
  actual_generated INTEGER;
  per_dest INTEGER;
  remaining INTEGER;
  rand_count INTEGER;
  dest_arr TEXT[];
  dest TEXT;
  hub_codes TEXT[];
  direct_dests TEXT[];
  one_stop_dests TEXT[];
  two_stop_dests TEXT[];
  midpoint TEXT;
  mid_dest TEXT;
  third_dest TEXT;
BEGIN
  -- Clear stale waiting pools; preserve layover, arrived, and any booked/in-transit
  DELETE FROM pax_pools WHERE status = 'waiting' AND booking_id IS NULL;

  -- Get hub codes
  SELECT array_agg(icao_code) INTO hub_codes FROM airports WHERE is_hub = true;
  IF hub_codes IS NULL THEN
    hub_codes := ARRAY[]::TEXT[];
  END IF;

  -- Process each airport
  FOR apt IN SELECT * FROM airports LOOP
    -- Random pax between min and max
    total_pax := apt.min_daily_pax + floor(random() * (apt.max_daily_pax - apt.min_daily_pax + 1))::integer;

    -- Get direct destinations (active routes from this airport)
    SELECT array_agg(DISTINCT arrival_icao) INTO direct_dests
    FROM routes
    WHERE departure_icao = apt.icao_code AND is_active = true;

    IF direct_dests IS NULL THEN
      direct_dests := ARRAY[]::TEXT[];
    END IF;

    -- Skip airports with no outbound routes
    IF array_length(direct_dests, 1) IS NULL OR array_length(direct_dests, 1) = 0 THEN
      CONTINUE;
    END IF;

    -- Find one-stop destinations (via hub midpoints)
    one_stop_dests := ARRAY[]::TEXT[];
    FOR midpoint IN SELECT unnest(direct_dests) INTERSECT SELECT unnest(hub_codes) LOOP
      FOR mid_dest IN
        SELECT DISTINCT arrival_icao FROM routes
        WHERE departure_icao = midpoint AND is_active = true
          AND arrival_icao != apt.icao_code
          AND NOT (arrival_icao = ANY(direct_dests))
      LOOP
        IF NOT (mid_dest = ANY(one_stop_dests)) THEN
          one_stop_dests := array_append(one_stop_dests, mid_dest);
        END IF;
      END LOOP;
    END LOOP;

    -- Find two-stop destinations (via hub after one-stop)
    two_stop_dests := ARRAY[]::TEXT[];
    FOR midpoint IN SELECT unnest(one_stop_dests) INTERSECT SELECT unnest(hub_codes) LOOP
      FOR third_dest IN
        SELECT DISTINCT arrival_icao FROM routes
        WHERE departure_icao = midpoint AND is_active = true
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
    direct_pax := (total_pax * 70) / 100;
    one_stop_pax := (total_pax * 20) / 100;
    two_stop_pax := total_pax - direct_pax - one_stop_pax;

    -- If no one-stop destinations, fold into direct
    IF array_length(one_stop_dests, 1) IS NULL OR array_length(one_stop_dests, 1) = 0 THEN
      direct_pax := direct_pax + one_stop_pax;
      one_stop_pax := 0;
    END IF;

    -- If no two-stop destinations, fold into direct
    IF array_length(two_stop_dests, 1) IS NULL OR array_length(two_stop_dests, 1) = 0 THEN
      direct_pax := direct_pax + two_stop_pax;
      two_stop_pax := 0;
    END IF;

    actual_generated := 0;

    -- Insert direct pools
    IF direct_pax > 0 AND array_length(direct_dests, 1) > 0 THEN
      per_dest := GREATEST(1, direct_pax / array_length(direct_dests, 1));
      remaining := direct_pax;
      FOREACH dest IN ARRAY direct_dests LOOP
        rand_count := LEAST(remaining, GREATEST(1, per_dest + floor(random() * 5 - 2)::integer));
        IF rand_count > 0 THEN
          INSERT INTO pax_pools (origin_icao, destination_icao, current_airport_icao, pax_count, status, connections_remaining, generated_date)
          VALUES (apt.icao_code, dest, apt.icao_code, rand_count, 'waiting', 0, today);
          remaining := remaining - rand_count;
          actual_generated := actual_generated + rand_count;
        END IF;
        EXIT WHEN remaining <= 0;
      END LOOP;
    END IF;

    -- Insert one-stop pools
    IF one_stop_pax > 0 AND array_length(one_stop_dests, 1) > 0 THEN
      per_dest := GREATEST(1, one_stop_pax / array_length(one_stop_dests, 1));
      remaining := one_stop_pax;
      FOREACH dest IN ARRAY one_stop_dests LOOP
        rand_count := LEAST(remaining, GREATEST(1, per_dest + floor(random() * 5 - 2)::integer));
        IF rand_count > 0 THEN
          INSERT INTO pax_pools (origin_icao, destination_icao, current_airport_icao, pax_count, status, connections_remaining, generated_date)
          VALUES (apt.icao_code, dest, apt.icao_code, rand_count, 'waiting', 1, today);
          remaining := remaining - rand_count;
          actual_generated := actual_generated + rand_count;
        END IF;
        EXIT WHEN remaining <= 0;
      END LOOP;
    END IF;

    -- Insert two-stop pools
    IF two_stop_pax > 0 AND array_length(two_stop_dests, 1) > 0 THEN
      per_dest := GREATEST(1, two_stop_pax / array_length(two_stop_dests, 1));
      remaining := two_stop_pax;
      FOREACH dest IN ARRAY two_stop_dests LOOP
        rand_count := LEAST(remaining, GREATEST(1, per_dest + floor(random() * 5 - 2)::integer));
        IF rand_count > 0 THEN
          INSERT INTO pax_pools (origin_icao, destination_icao, current_airport_icao, pax_count, status, connections_remaining, generated_date)
          VALUES (apt.icao_code, dest, apt.icao_code, rand_count, 'waiting', 2, today);
          remaining := remaining - rand_count;
          actual_generated := actual_generated + rand_count;
        END IF;
        EXIT WHEN remaining <= 0;
      END LOOP;
    END IF;

    -- Log generation
    IF actual_generated > 0 THEN
      INSERT INTO demand_generation_log (airport_icao, pax_generated, generation_date)
      VALUES (apt.icao_code, actual_generated, today);
    END IF;
  END LOOP;
END;
$$;
