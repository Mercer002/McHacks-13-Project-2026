// supabase/functions/ai-command/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
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

type Category = "Work" | "Personal" | "Urgent";
type ParsedTask = {
  title: string;
  day: string;
  time: string;
  duration: number;
  category: Category;
  location: string | null;
};

function extractJson(text: string): string {
  let t = (text ?? "").trim();

  // Remove ```json ... ``` or ``` ... ``` fences
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/```$/i, "");
    t = t.trim();
  }

  // If there’s extra text, grab the JSON portion
  const firstBrace = t.indexOf("{");
  const firstBracket = t.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);

  if (start > 0) t = t.slice(start);

  const lastBrace = t.lastIndexOf("}");
  const lastBracket = t.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end !== -1) t = t.slice(0, end + 1);

  return t.trim();
}

serve(async (req) => {
  // CORS preflight always allowed
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in function env" }, 500);
    }

    // --- Manual auth verification (instead of verifyJWT gateway) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = match?.[1];
    if (!accessToken) return json({ error: "Missing Authorization Bearer token" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid/expired session", details: userErr?.message }, 401);
    }

    // --- Parse request body ---
    const body = await req.json().catch(() => ({}));
    const text = body?.text;
    const dayKey = body?.dayKey;

    if (!text || typeof text !== "string") return json({ error: "Missing/invalid text" }, 400);
    if (!dayKey || typeof dayKey !== "string") return json({ error: "Missing/invalid dayKey" }, 400);

    // --- Gemini ---
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY secret" }, 500);

    // Use a current model (1.5 often causes issues now)
    const model = "gemini-2.5-flash-lite";

    const systemInstruction = `
You convert a user's calendar request into JSON tasks.
Return ONLY JSON.

Schema:
{
  "tasks": [
    { "title": string, "day": "YYYY-MM-DD", "time": "HH:mm", "duration": number,
      "category": "Work" | "Personal" | "Urgent", "location": string | null }
  ]
}

Rules:
- If the user says "tonight", use dayKey and choose 19:00 if time missing.
- If time is missing, pick a reasonable default.
- If duration missing: yoga=60, restaurant=90, game=150.
- Category: restaurant/yoga => Personal. Work keywords => Work. "urgent/ASAP" => Urgent.
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [
            { role: "user", parts: [{ text: `dayKey=${dayKey}\nUser: ${text}` }] },
          ],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: "application/json",
          },
        }),
      }
    );


    const raw = await geminiRes.json();

    if (!geminiRes.ok) {
      // Return a real error code so your frontend sees res.ok === false
      return json({ error: "Gemini API error", status: geminiRes.status, raw }, 502);
    }

    const textOut =
      raw?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";

    const cleaned = extractJson(textOut);

    let parsed: { tasks?: ParsedTask[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return jsonResponse(
        { error: "Gemini returned non-JSON", raw: textOut, cleaned },
        502
      );
    }


    if (!Array.isArray(parsed.tasks)) return json({ error: "JSON missing tasks[]", raw: parsed }, 502);

    const cleanedTasks: ParsedTask[] = parsed.tasks
      .filter((t) => t && typeof t === "object")
      .map((t: any) => ({
        title: String(t.title ?? "").trim(),
        day: String(t.day ?? dayKey).trim(),
        time: String(t.time ?? "19:00").trim(),
        duration: Number.isFinite(Number(t.duration)) ? Number(t.duration) : 60,
        category:
          t.category === "Work" || t.category === "Personal" || t.category === "Urgent"
            ? t.category
            : "Personal",
        location: t.location == null ? null : String(t.location).trim(),
      }))
      .filter((t) => t.title.length > 0);

    return json({ tasks: cleanedTasks }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
