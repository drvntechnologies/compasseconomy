import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "DISCORD_WEBHOOK_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { event_type, record } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let embed: DiscordEmbed | null = null;

    if (event_type === "flight_booked") {
      const pilotName = await getPilotName(supabase, record.user_id);
      embed = {
        title: "New Flight Booked",
        color: 0x3b82f6,
        fields: [
          { name: "Flight", value: `CPZ${record.flight_number}`, inline: true },
          { name: "Route", value: `${record.departure_icao} \u2192 ${record.arrival_icao}`, inline: true },
          { name: "Pilot", value: pilotName, inline: true },
          { name: "Passengers", value: `${record.pax_count}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Copperas Airlines Dispatch" },
      };
    } else if (event_type === "flight_departed") {
      const booking = await getBooking(supabase, record.booking_id);
      const pilotName = await getPilotName(supabase, record.user_id);
      embed = {
        title: "Flight Departing",
        color: 0x10b981,
        fields: [
          { name: "Flight", value: booking ? `CPZ${booking.flight_number}` : "Unknown", inline: true },
          { name: "Route", value: booking ? `${booking.departure_icao} \u2192 ${booking.arrival_icao}` : "Unknown", inline: true },
          { name: "Pilot", value: pilotName, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Copperas Airlines ACARS" },
      };
    } else if (event_type === "flight_landed") {
      const booking = await getBooking(supabase, record.booking_id);
      const pilotName = await getPilotName(supabase, record.user_id);
      const duration = record.started_at && record.ended_at
        ? formatDuration(new Date(record.started_at), new Date(record.ended_at))
        : "N/A";
      embed = {
        title: "Flight Landed",
        color: 0xf59e0b,
        fields: [
          { name: "Flight", value: booking ? `CPZ${booking.flight_number}` : "Unknown", inline: true },
          { name: "Destination", value: booking?.arrival_icao || "Unknown", inline: true },
          { name: "Pilot", value: pilotName, inline: true },
          { name: "Flight Time", value: duration, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "Copperas Airlines ACARS" },
      };
    } else if (event_type === "daily_airport_report") {
      embed = await buildDailyReport(supabase);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown event_type: ${event_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!embed) {
      return new Response(
        JSON.stringify({ error: "Could not build embed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const discordPayload = {
      username: "CPZ Dispatch",
      embeds: [embed],
    };

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      return new Response(
        JSON.stringify({ error: "Discord API error", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getPilotName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name || "Unknown Pilot";
}

async function getBooking(supabase: any, bookingId: string) {
  const { data } = await supabase
    .from("flight_bookings")
    .select("flight_number, departure_icao, arrival_icao, pax_count")
    .eq("id", bookingId)
    .maybeSingle();
  return data;
}

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

async function buildDailyReport(supabase: any): Promise<DiscordEmbed> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data: departures } = await supabase
    .from("flight_bookings")
    .select("departure_icao")
    .gte("created_at", startOfDay.toISOString())
    .in("status", ["booked", "in_progress", "completed"]);

  const { data: arrivals } = await supabase
    .from("flight_bookings")
    .select("arrival_icao")
    .gte("created_at", startOfDay.toISOString())
    .in("status", ["booked", "in_progress", "completed"]);

  const airportCounts: Record<string, number> = {};

  if (departures) {
    for (const row of departures) {
      airportCounts[row.departure_icao] = (airportCounts[row.departure_icao] || 0) + 1;
    }
  }
  if (arrivals) {
    for (const row of arrivals) {
      airportCounts[row.arrival_icao] = (airportCounts[row.arrival_icao] || 0) + 1;
    }
  }

  const sorted = Object.entries(airportCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalFlights = departures?.length || 0;

  const fields = sorted.map(([icao, count], i) => ({
    name: `${["1st", "2nd", "3rd", "4th", "5th"][i]} - ${icao}`,
    value: `${count} movements`,
    inline: true,
  }));

  if (fields.length === 0) {
    fields.push({ name: "No Activity", value: "No flights recorded today", inline: false });
  }

  return {
    title: "Daily Airport Report",
    description: `Top 5 busiest airports today (${totalFlights} total flights)`,
    color: 0x8b5cf6,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Copperas Airlines Daily Briefing" },
  };
}
