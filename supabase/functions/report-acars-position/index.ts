import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      latitude,
      longitude,
      altitude_ft,
      ground_speed_kts,
      heading_deg,
      vs_fpm,
      fuel_lbs,
      sim_rate,
      phase,
      on_ground,
    } = body;

    if (latitude == null || longitude == null) {
      return new Response(
        JSON.stringify({ error: "latitude and longitude are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the user's active ACARS flight (ended_at IS NULL)
    const { data: activeFlight, error: flightError } = await supabase
      .from("acars_flights")
      .select("id, booking_id, phase")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (flightError) {
      return new Response(
        JSON.stringify({ error: "Failed to find active flight", details: flightError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!activeFlight) {
      return new Response(
        JSON.stringify({ error: "No active ACARS flight found for this user" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the acars_flights row with latest telemetry
    const flightUpdate: Record<string, unknown> = {
      latitude,
      longitude,
      altitude_ft: altitude_ft ?? null,
      ground_speed_kts: ground_speed_kts ?? null,
      heading_deg: heading_deg ?? null,
      vs_fpm: vs_fpm ?? null,
      fuel_lbs: fuel_lbs ?? null,
      sim_rate: sim_rate ?? 1,
      last_report_at: new Date().toISOString(),
    };

    if (phase) {
      flightUpdate.phase = phase;
    }

    // Auto-end flight if phase is parked
    if (phase === "parked") {
      flightUpdate.ended_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("acars_flights")
      .update(flightUpdate)
      .eq("id", activeFlight.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update flight", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert position history breadcrumb
    const { error: historyError } = await supabase
      .from("acars_position_history")
      .insert({
        acars_flight_id: activeFlight.id,
        latitude,
        longitude,
        altitude_ft: altitude_ft ?? null,
        ground_speed_kts: ground_speed_kts ?? null,
        heading_deg: heading_deg ?? null,
        vs_fpm: vs_fpm ?? null,
        phase: phase ?? activeFlight.phase,
      });

    if (historyError) {
      return new Response(
        JSON.stringify({ error: "Failed to log position history", details: historyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        flight_id: activeFlight.id,
        phase: phase ?? activeFlight.phase,
        ended: phase === "parked",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
