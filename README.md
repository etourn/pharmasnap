# PharmaSnap

A lightweight inventory app for small pharmacies: track stock, get
low-stock and reorder alerts, catch stock that will expire unsold, and
now — scan a medicine box with your phone camera instead of typing.

## Stack

- React + Vite + Tailwind
- Firebase Firestore for data (`medicines`, `sales` collections)
- Cloudflare Worker + Claude API (Haiku 4.5) for the camera scan feature

## Running locally

```
npm install
npm run dev
```

## Camera scan setup

The scan button needs its own tiny backend (so your Anthropic API key
isn't exposed in the browser). One-time setup:

1. Follow `cf-worker/README.md` to deploy the Worker (free, ~5 minutes).
2. Copy `.env.example` to `.env` and paste in your deployed Worker URL.
3. Restart `npm run dev`.

Without this set up, the rest of the app works fine — you just won't
see a working Scan button, and you'll be prompted to type details in
manually as before.

## How the scan flow works

1. Owner taps "Scan medicine box" on the Add Medicine screen → opens
   the phone camera.
2. The photo is sent to a Cloudflare Worker, which forwards it to
   Claude's vision API with a prompt asking for structured JSON
   (name, expiry, confidence per field).
3. The app pre-fills the Add Medicine form with whatever Claude read.
4. Low-confidence fields are flagged so the owner double-checks them.
5. The owner reviews and taps "Confirm and add medicine" — nothing is
   ever added to inventory without that manual confirmation.

Quantity and low-stock threshold are still typed in — they're not
printed on the box, so there's nothing to scan there.
