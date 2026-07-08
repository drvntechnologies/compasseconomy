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
    const url = new URL(req.url);
    const target = url.searchParams.get("target") || "windows";
    const arch = url.searchParams.get("arch") || "x86_64";
    const currentVersion = url.searchParams.get("current_version");

    if (!currentVersion) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const platform = `${target}-${arch}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: release, error } = await supabase
      .from("app_releases")
      .select("*")
      .eq("platform", platform)
      .eq("active", true)
      .order("pub_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!release) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Compare versions - only update if release is newer
    if (!isNewer(release.version, currentVersion)) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Return the update manifest in Tauri's expected format
    const manifest = {
      version: release.version,
      notes: release.notes || "",
      pub_date: release.pub_date,
      url: release.download_url,
      signature: release.signature,
    };

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map(Number);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}
