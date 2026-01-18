// Supabase Edge Function: Parse free-form task text into structured tasks using Gemini
import { serve } from "https://deno.land/std@0.208.0/http/server.ts"

type Task = {
  title: string
  time?: string
  duration?: number
  category?: string
  day?: string
  location?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { text, dayKey } = await req.json().catch(() => ({}))
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const modelUrl =
      Deno.env.get("VITE_GEMINI_API_URL") ??
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

    const prompt = `
You convert a user's scheduling note into JSON tasks.
Input note: "${text}"
Current day key: "${dayKey ?? ""}"
Return JSON ONLY, no prose: {"tasks":[{"title":"","time":"","duration":<minutes>,"category":"","day":"","location":""}, ...]}
Rules:
- title is concise (keep original words where possible)
- time is HH:MM in 24h; if none given use "09:00"
- duration is minutes; if none, default 60
- category simple word (Work/Personal/Errand/etc)
- day: use provided dayKey if not specified
- location optional
`

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
    }

    const aiResp = await fetch(`${modelUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!aiResp.ok) {
      const errorText = await aiResp.text()
      const status = aiResp.status
      return new Response(
        JSON.stringify({
          error: `Gemini request failed (${status})`,
          details: errorText,
        }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const aiData = await aiResp.json()
    const candidateText =
      aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    let parsed: { tasks?: Task[] } = {}
    try {
      parsed = JSON.parse(candidateText)
    } catch (_err) {
      // Try to salvage JSON from code block
      const match = candidateText.match(/\{[\s\S]*\}/)
      if (match) {
        parsed = JSON.parse(match[0])
      }
    }

    const tasks: Task[] = Array.isArray(parsed?.tasks)
      ? parsed.tasks
      : []

    return new Response(JSON.stringify({ tasks }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("ai-command error", err)
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
