import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "Missing Supabase env" }, 500);
    if (!GOOGLE_MAPS_API_KEY) return json({ error: "Missing GOOGLE_MAPS_API_KEY" }, 500);

    // manual auth (keep verifyJWT OFF)
    const authHeader = req.headers.get("Authorization") ?? "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = m?.[1];
    if (!accessToken) return json({ error: "Missing Bearer token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const { originLat, originLng, destinationText, travelMode } = body;

    if (originLat == null || originLng == null) {
      return json({ error: "Missing originLat/originLng" }, 400);
    }
    if (!destinationText || typeof destinationText !== "string") {
      return json({ error: "Missing destinationText" }, 400);
    }

    const mode = (travelMode ?? "DRIVE").toUpperCase();
    const normalizedMode =
      mode === "DRIVE" || mode === "WALK" || mode === "BICYCLE" || mode === "TRANSIT"
        ? (mode as "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT")
        : "DRIVE";


    // 1) geocode destination
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        destinationText
      )}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const geo = await geoRes.json();
    if (geo.status !== "OK" || !geo.results?.length) {
      return json({ error: "Could not geocode destination", geo }, 422);
    }

    const best = geo.results[0];
    const destLat = best.geometry.location.lat;
    const destLng = best.geometry.location.lng;

    // 2) routes API (Directions v2)
    const routesRes = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: normalizedMode,
      }),
    });

    const routesJson = await routesRes.json();
    if (!routesRes.ok || !routesJson?.routes?.length) {
      return json({ error: "Routes API failed", routesJson }, 502);
    }

    const durStr: string = routesJson.routes[0].duration; // "1234s"
    const seconds = Number(String(durStr).replace("s", ""));
    const travelMinutes = Math.max(5, Math.round(seconds / 60));

    return json(
      {
        travelMinutes,
        resolvedAddress: best.formatted_address ?? null,
      },
      200
    );
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
