// PharmaSnap scan-medicine Worker
//
// Receives a photo of a medicine box from the app, sends it to Google's
// Gemini API (free tier), and returns structured JSON the app can use to
// pre-fill the "Add Medicine" form. The Gemini API key never touches the
// browser — it lives only in this Worker as a secret.
//
// NOTE ON FREE TIER: Gemini's free tier is rate-limited (roughly 10-15
// requests/minute, ~1000-1500/day as of writing) and Google's terms say
// free-tier usage may be used to improve their models, and exclude
// commercial use. If PharmaSnap becomes a real paid product for a real
// pharmacy, revisit this — either move to a paid Gemini tier or switch
// back to Claude's API, which has a normal commercial-use API tier.

const ALLOWED_ORIGIN = "*" // tighten to your app's domain once deployed

const GEMINI_MODEL = "gemini-2.5-flash" // free tier: Flash and Flash-Lite; Pro is paid-only

const PROMPT = `You read photos of medicine packaging for a pharmacy inventory app.

Return the fields below. Rules:
- If you cannot read a field clearly, set it to null and mark confidence "low". Never guess.
- Expiry dates are often small print, foil-embossed, or in DD/MM/YYYY or MM/YYYY format —
  convert confidently-read dates to YYYY-MM-DD. If the day isn't printed (MM/YYYY only),
  use the last day of that month.
- "name" should be the medicine name plus strength, e.g. "Paracetamol 500mg".

Read this medicine box and return the structured fields.`

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", nullable: true },
    expiry: { type: "STRING", nullable: true },
    confidence: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", enum: ["high", "low"] },
        expiry: { type: "STRING", enum: ["high", "low"] }
      },
      required: ["name", "expiry"]
    },
    notes: { type: "STRING", nullable: true }
  },
  required: ["name", "expiry", "confidence", "notes"]
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() })
    }

    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405)
    }

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: "Invalid JSON body" }, 400)
    }

    const { image, media_type } = body
    if (!image || !media_type) {
      return json({ error: "Expected { image: base64, media_type: 'image/jpeg' }" }, 400)
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: media_type, data: image } }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA
          }
        })
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      // Gemini free tier returns 429 when you hit the RPM/RPD limit
      const status = geminiRes.status === 429 ? 429 : 502
      return json({ error: "Gemini API error", detail: errText }, status)
    }

    const data = await geminiRes.json()
    const textBlock = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text ?? ""

    let parsed
    try {
      parsed = JSON.parse(textBlock.trim())
    } catch {
      return json({ error: "Could not parse model output", raw: textBlock }, 502)
    }

    return json(parsed, 200)
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  })
}
