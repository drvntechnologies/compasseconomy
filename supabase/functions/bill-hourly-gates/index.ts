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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find all per-hour gates that are currently occupied
    const { data: occupiedGates, error: gatesError } = await supabase
      .from("gates")
      .select("*")
      .eq("lease_type", "per_hour")
      .eq("status", "occupied")
      .not("occupied_since", "is", null);

    if (gatesError) {
      return new Response(
        JSON.stringify({ error: gatesError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!occupiedGates || occupiedGates.length === 0) {
      return new Response(
        JSON.stringify({ message: "No occupied per-hour gates to bill", billed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    let totalBilled = 0;
    let gatesBilled = 0;

    for (const gate of occupiedGates) {
      if (!gate.hourly_price || gate.hourly_price <= 0) continue;

      const billingStart = gate.last_billed_at ?? gate.occupied_since;
      const minutesParked = (now.getTime() - new Date(billingStart).getTime()) / 60000;

      if (minutesParked < 10) continue;

      const tenMinBlocks = Math.floor(minutesParked / 10);
      if (tenMinBlocks <= 0) continue;

      const fee = tenMinBlocks * (gate.hourly_price / 6);
      totalBilled += fee;
      gatesBilled += 1;

      const { error: txErr } = await supabase.from("financial_transactions").insert({
        type: "gate_fee",
        amount: -fee,
        description: `Gate ${gate.gate_number} at ${gate.airport_icao}: ${tenMinBlocks * 10}min parked @ $${gate.hourly_price}/hr (daily billing)`,
        reference_id: gate.id,
      });

      if (txErr) {
        console.error(`Failed to insert gate fee for ${gate.gate_number}:`, txErr.message);
        totalBilled -= fee;
        gatesBilled -= 1;
        continue;
      }

      const billedUpTo = new Date(
        new Date(billingStart).getTime() + tenMinBlocks * 10 * 60000
      ).toISOString();
      const { error: updateErr } = await supabase
        .from("gates")
        .update({ last_billed_at: billedUpTo })
        .eq("id", gate.id);

      if (updateErr) {
        console.error(`Failed to update last_billed_at for ${gate.gate_number}:`, updateErr.message);
      }
    }

    // Atomically deduct from airline balance
    if (totalBilled > 0) {
      const { error: rpcErr } = await supabase.rpc("adjust_balance", {
        amount_delta: -totalBilled,
      });
      if (rpcErr) {
        console.error("Failed to adjust balance:", rpcErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Billed ${gatesBilled} gates`,
        totalBilled: Math.round(totalBilled * 100) / 100,
        gatesBilled,
        timestamp: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
