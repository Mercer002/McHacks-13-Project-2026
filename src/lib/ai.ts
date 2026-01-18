import { supabase } from './supabase'

type PastTask = {
  title: string
  estimated_time: number | null
  actual_time: number | null
  created_at?: string | null
}

type AnalyzeResult = {
  message: string | null
  suggestedDuration?: number | null
  family?: string | null
  sampleSize?: number | null
  computedMedian?: number | null
}

// Simple keyword-based similarity score (cheap local heuristic)
function similarityScore(a: string, b: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const stem = (w: string) => {
    // very small, safe stemmer: handle plural/suffixes
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
    if (w.endsWith('ing')) return w.slice(0, -3)
    if (w.endsWith('ed')) return w.slice(0, -2)
    if (w.endsWith('s')) return w.slice(0, -1)
    return w
  }

  const wa = normalize(a).split(/\s+/).filter(Boolean).map(stem)
  const wb = normalize(b).split(/\s+/).filter(Boolean).map(stem)
  if (wa.length === 0 || wb.length === 0) return 0
  const setB = new Set(wb)
  const common = wa.filter(w => setB.has(w)).length
  if (common > 0) return common / Math.max(wa.length, wb.length)

  // Loose match: check token inclusion (handles grocery vs groceries, synonyms not covered)
  const inclusion = wa.filter(w => wb.some(x => x.includes(w) || w.includes(x))).length
  if (inclusion > 0) return inclusion / Math.max(wa.length, wb.length) * 0.75

  return 0
}

// Statistical helpers
function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function iqrFilter(values: number[]) {
  // return values within [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
  if (values.length < 4) return values.slice()
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)))
  const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)))
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return sorted.filter(v => v >= lower && v <= upper)
}

function weightedMedian(values: number[], weights: number[]) {
  if (values.length === 0) return 0
  const pairs = values.map((v, i) => ({ v, w: weights[i] ?? 1 }))
  pairs.sort((a, b) => a.v - b.v)
  const total = pairs.reduce((s, p) => s + p.w, 0)
  let cum = 0
  for (const p of pairs) {
    cum += p.w
    if (cum >= total / 2) return p.v
  }
  return pairs[pairs.length - 1].v
}

function formatMinutesToHoursMinutes(mins: number) {
  if (mins == null || isNaN(mins)) return '0 minutes'
  const m = Math.round(mins)
  const hours = Math.floor(m / 60)
  const minutes = m % 60
  const parts: string[] = []
  if (hours > 0) parts.push(hours === 1 ? `${hours} hour` : `${hours} hours`)
  if (minutes > 0) parts.push(minutes === 1 ? `${minutes} minute` : `${minutes} minutes`)
  if (parts.length === 0) return '0 minutes'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} and ${parts[1]}`
}

function replaceMinutesWithHoursText(text: string) {
  if (!text) return text
  return text.replace(/(\d{1,5})\s*(minutes|minute|mins|min|m)\b/gi, (_m, p1) => {
    const n = Number(p1)
    if (isNaN(n)) return _m
    return formatMinutesToHoursMinutes(n)
  })
}

function recencyWeight(createdAt?: string | null, lambda = 0.06) {
  // simple exponential decay weight based on days since the event
  if (!createdAt) return 1
  const then = new Date(createdAt).getTime()
  if (isNaN(then)) return 1
  const daysAgo = (Date.now() - then) / (1000 * 60 * 60 * 24)
  return Math.exp(-lambda * daysAgo)
}

// Call Gemini (Google Generative Language) using the v1beta generateContent/style endpoint.
// Configure VITE_GEMINI_API_URL (full model: `https://.../models/gemini-pro:generateContent`) and VITE_GEMINI_API_KEY in your env.
async function callGemini(prompt: string): Promise<string | null> {
  const url = import.meta.env.VITE_GEMINI_API_URL
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!url || !key) {
    console.warn('Gemini URL or key not configured (VITE_GEMINI_API_URL / VITE_GEMINI_API_KEY)')
    return null
  }

  // Build request body compatible with Google's generative API (v1beta). We send prompt.text
  const body = {
    prompt: {
      text: prompt,
    },
    // adjust token limit as needed
    maxOutputTokens: 256,
  }

  // Verbose logging to help debug request/response shape
  console.log('Gemini request URL:', url)
  console.log('Gemini request body:', body)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We attach the API key as a Bearer token; some Google APIs also accept ?key= in URL.
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })

    let text: string | null = null
    const raw = await res.text()
    let json: any = null
    try {
      json = raw ? JSON.parse(raw) : null
    } catch (err) {
      console.warn('Gemini response not valid JSON', raw)
    }

    console.log('Gemini response status:', res.status)
    console.log('Gemini raw response:', raw)
    console.log('Gemini parsed response:', json)

    if (!res.ok) {
      // If we have parsed JSON with error details, log them
      if (json && json.error) console.warn('Gemini API error body:', json.error)
      return null
    }

    // Try common response shapes (be permissive):
    // - { candidates: [ { output: '...' } ] }
    // - { candidates: [ { content: [ { text: '...' } ] } ] }
    // - { output: '...' }
    // - { text: '...' }
    if (json) {
      if (Array.isArray(json.candidates) && json.candidates.length > 0) {
        const cand = json.candidates[0]
        text = cand.output ?? (cand.content && cand.content[0] && cand.content[0].text) ?? null
      }
      text = text ?? json.output ?? json.text ?? (json.result && String(json.result)) ?? null
    }

    // Some endpoints embed the message in response.response.candidates
    if (!text && json && json.response && Array.isArray(json.response.candidates) && json.response.candidates.length) {
      const cand = json.response.candidates[0]
      text = cand.output ?? (cand.content && cand.content[0] && cand.content[0].text) ?? null
    }

    // Fallback: if raw contains a short string, use it
    if (!text && typeof raw === 'string' && raw.length < 2000) text = raw

    if (text) return String(text).trim()
    return null
  } catch (err) {
    console.warn('Gemini call failed', err)
    return null
  }
}

export async function analyzeEstimate(userId: string, title: string, estimatedMinutes: number): Promise<AnalyzeResult | null> {
  // First try the classify-and-match approach which asks Gemini to label the new task's family
  // and return indices of similar past tasks and a brief JSON suggestion.
  const classResult = await classifyAndMatch(userId, title, estimatedMinutes)
  if (classResult) return classResult

  // Fallback: previous lightweight heuristic (keyword overlap + optional Gemini prompt)
  if (!userId) return null

  const { data, error } = await supabase
    .from('task_completions')
    .select('title, estimated_time, actual_time, created_at')
    .eq('user_id', userId)
    .not('actual_time', 'is', null)
    .limit(200)

  if (error) {
    console.warn('Failed to load past tasks for AI analysis', error)
    return null
  }

  const past = (data as PastTask[]) ?? []
  if (past.length === 0) return null

  const scored = past
    .map((p, i) => ({ p, idx: i, score: similarityScore(title, p.title || '') }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  const top = scored.slice(0, 12)
  // Build arrays for actual times and recency weights
  const actuals = top.map(t => (t.p.actual_time ?? 0)).filter(v => v > 0)
  if (actuals.length === 0) return null

  // Remove outliers using IQR on the raw actuals
  const filtered = iqrFilter(actuals)
  if (filtered.length === 0) return null

  // Compute recency weights for the filtered values. Map back to created_at using top indices.
  const filteredWithMeta = top
    .map(t => ({ v: t.p.actual_time ?? 0, created_at: t.p.created_at ?? null }))
    .filter(x => filtered.includes(x.v))

  const weights = filteredWithMeta.map(x => recencyWeight(x.created_at))
  const vals = filteredWithMeta.map(x => x.v)
  const suggested = Math.round(weightedMedian(vals, weights))

  // Only suggest when suggested is meaningfully larger than the user's estimate
  if (suggested > estimatedMinutes + Math.max(5, Math.round(estimatedMinutes * 0.2))) {
    const examples = top.map(t => `Title: ${t.p.title} — estimated ${t.p.estimated_time}m, actual ${t.p.actual_time}m`).join('\n')
    const prompt = `You are an assistant that helps users estimate task durations. The user proposes a new task:\nTitle: ${title}\nEstimated duration: ${estimatedMinutes} minutes\n\nHere are similar past tasks and their durations:\n${examples}\n\nBased on the examples, give a short, friendly suggestion if the user's estimate seems low and optionally suggest a more realistic duration in minutes. Keep the message concise and non-judgmental.\n\nIMPORTANT: When giving a suggestion, include a human-facing sentence that provides context using this style when appropriate: "When you did this, it typically took about X minutes (you estimated Y minutes)." Example: "When you did this it typically took about 45 minutes — you estimated 20 minutes. Consider increasing your estimate." If you provide a numeric suggestion, include that sentence or a close variant.`
    const suggestion = await callGemini(prompt)
    if (!suggestion) {
      return { message: `When you did this it typically took about ${formatMinutesToHoursMinutes(suggested)} (you estimated ${formatMinutesToHoursMinutes(estimatedMinutes)}). Consider increasing your estimate.`, suggestedDuration: suggested, family: null, sampleSize: filteredWithMeta.length, computedMedian: suggested }
    }
    const m = suggestion.match(/(\d{1,4})\s*(minutes|mins|m)/i)
    const suggestedDuration = m ? Number(m[1]) : suggested
    return { message: replaceMinutesWithHoursText(suggestion.trim()), suggestedDuration, family: null, sampleSize: filteredWithMeta.length, computedMedian: suggested }
  }

  return null
}

/**
 * Ask Gemini to classify the task into a family and identify similar past tasks.
 * Returns a structured AnalyzeResult when useful, or null when no suggestion.
 */
export async function classifyAndMatch(userId: string, title: string, estimatedMinutes: number): Promise<AnalyzeResult | null> {
  if (!userId) return null

  const { data, error } = await supabase
    .from('task_completions')
    .select('title, estimated_time, actual_time, created_at')
    .eq('user_id', userId)
    .not('actual_time', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) {
    console.warn('Failed to load past tasks for classifyAndMatch', error)
    return null
  }

  const past = (data as PastTask[]) ?? []
  if (past.length === 0) return null

  // Build few-shot examples (keep them short)
  const fewShot = [
    { title: 'Grocery shop for the week', family: 'grocery' },
    { title: '1 hour gym session', family: 'workout' },
    { title: 'Drive to office (commute)', family: 'commute' },
  ]

  const examplesText = fewShot.map(f => `Title: ${f.title} => family: ${f.family}`).join('\n')

  const pastList = past.map((p, i) => `${i}: ${p.title} — estimated ${p.estimated_time ?? 'N/A'}m, actual ${p.actual_time ?? 'N/A'}m`).join('\n')

  const prompt = `You are an assistant that groups tasks into families (e.g. grocery, workout, commute) and finds past tasks similar to a new task.\n\nExamples:\n${examplesText}\n\nUser's new task:\nTitle: ${title}\nEstimated: ${estimatedMinutes} minutes\n\nPast completed tasks for this user (index: title — estimated, actual):\n${pastList}\n\nReturn only valid JSON with these keys: family (string|null), similar_indices (array of indices from the past list), avg_actual (number|null), suggested_duration (number|null), message (string|null). If no similar tasks, set similar_indices: [] and message: null. Keep the message concise.\n\nIMPORTANT: Make the 'message' a short, friendly, human-facing sentence that gives context. Prefer phrasing like: "When you did this, it typically took about X minutes (you estimated Y minutes).\" Example JSON message: { \"message\": \"When you did this it typically took about 45 minutes — you estimated 20 minutes. Consider increasing your estimate.\" } Ensure the message mentions the average actual time and the user's estimate when suggesting an increase.`

  const raw = await callGemini(prompt)
  console.log('classifyAndMatch raw model output:', raw)
  if (!raw) return null

  // Try to extract JSON from the raw output
  let parsed: any = null
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    // try to find a JSON substring
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch (e) { parsed = null }
    }
  }

  if (!parsed) return null

  const family = parsed.family ?? null
  const similar: number[] = Array.isArray(parsed.similar_indices) ? parsed.similar_indices.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n) && n >= 0 && n < past.length) : []
  const suggested_duration = parsed.suggested_duration ?? parsed.suggestedDuration ?? null
  const message = parsed.message ?? null

  // Basic validation and fallback logic
  if (similar.length === 0) return null

  // Build arrays for actual times and recency weights from the similar indices
  const similarData = similar.map((idx: number) => ({ v: past[idx].actual_time ?? 0, created_at: past[idx].created_at ?? null })).filter((x: { v: number; created_at?: string | null }) => x.v > 0)
  if (similarData.length === 0) return null

  const rawVals = similarData.map((x: { v: number }) => x.v)
  const filtered = iqrFilter(rawVals)
  if (filtered.length === 0) return null

  const filteredWithMeta = similarData.filter((x: { v: number }) => filtered.includes(x.v))
  const weights = filteredWithMeta.map((x: { created_at?: string | null }) => recencyWeight(x.created_at))
  const vals = filteredWithMeta.map((x: { v: number }) => x.v)
  const computedMedian = Math.round(weightedMedian(vals, weights))

  if (computedMedian > estimatedMinutes + Math.max(5, Math.round(estimatedMinutes * 0.2))) {
    return { message: message ?? `When you did this it typically took about ${computedMedian} minutes (you estimated ${estimatedMinutes}). Consider increasing your estimate.`, suggestedDuration: suggested_duration ?? computedMedian, family: family ?? null, sampleSize: filteredWithMeta.length, computedMedian }
  }

  return null
}

export default { analyzeEstimate }
