# PharmaSnap scan-medicine Worker

A tiny Cloudflare Worker that proxies medicine-box photos to Google's
Gemini API (free tier). This exists so your Gemini API key never has
to sit in the browser (React app) where anyone could open dev tools
and steal it — and, on a free key, use up your daily quota.

## Read this first: free tier tradeoffs

- **Rate limits**: roughly 10-15 requests/minute and ~1,000-1,500
  requests/day on Gemini 2.5 Flash as of mid-2026. Fine for a single
  pharmacy adding stock; not fine for high traffic. Check current
  numbers at https://ai.google.dev/gemini-api/docs/rate-limits
- **Data use**: Google's terms allow free-tier prompts/responses to be
  used to improve their models. Don't send anything sensitive through
  a free key.
- **Commercial use**: Google's free-tier terms are explicitly meant
  for prototyping/personal projects, not commercial products. If
  PharmaSnap becomes a real paid product, plan to move to a paid
  Gemini tier (still cheap) or switch this Worker back to Claude's
  API, which has a normal commercial-use tier from day one.

## One-time setup (free, no credit card required)

1. Get a free Gemini API key from Google AI Studio:
   https://aistudio.google.com/apikey

2. Install deps and log in to Cloudflare (free account, no card needed):
   ```
   cd cf-worker
   npm install
   npx wrangler login
   ```

3. Store your Gemini key as a Worker secret (never committed to git):
   ```
   npx wrangler secret put GEMINI_API_KEY
   ```
   Paste the key when prompted.

4. Deploy:
   ```
   npm run deploy
   ```
   Wrangler prints a URL like `https://pharmasnap-scan-medicine.YOUR-SUBDOMAIN.workers.dev`
   — copy it.

5. Back in the main project, put that URL in `.env`:
   ```
   VITE_SCAN_WORKER_URL=https://pharmasnap-scan-medicine.YOUR-SUBDOMAIN.workers.dev
   ```

## Local testing

```
npm run dev
```
Wrangler runs the Worker locally and gives you a local URL to point
`VITE_SCAN_WORKER_URL` at while developing.

## Cost

- Cloudflare Workers: free for up to 100,000 requests/day, no billing
  setup required.
- Gemini API (Flash, free tier): $0, subject to the rate limits above.
  If you outgrow them, Gemini's paid tier is still inexpensive — see
  https://ai.google.dev/gemini-api/docs/pricing

## Tightening security later

`ALLOWED_ORIGIN` in `src/index.js` is set to `"*"` for easy setup.
Once you have a real deployed app domain, change it to that exact
origin so random sites can't call your Worker and burn through your
daily free quota.
