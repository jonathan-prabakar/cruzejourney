# Cruze FuelSense environment setup

> Current final integration (2026-10-31): see [FINAL_INTEGRATION_REPORT.md](FINAL_INTEGRATION_REPORT.md). The application uses the unified map-first home, MapLibre 3D roads, operator-sourced truck stops and the shared vehicle session. Historical feature-branch examples and recorded live results below do not establish current deployment verification.

The app runs without a key using deterministic telemetry, fuel and diagnostics. Cached road routes and fictional amenities need no maps/places credentials. M5B analytics is not merged; instantaneous MPG does not establish a measured efficiency trend.

## Local configuration

Obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Configure the actual server file at the project root: **.env.local**. The tracked **.env.example** is only a blank template.

Required for live model requests (optional for running the demo):

```env
GEMINI_API_KEY=
GEMMA_MODEL=gemma-4-26b-a4b-it
```

Enter your key only in the local file or server environment. Preserve other existing values. Never prefix the key with NEXT_PUBLIC_. The local file is ignored by Git and should have owner-only permissions. Do not paste a key into chat, logs, browser requests or commits.

GEMMA_MODEL defaults to gemma-4-26b-a4b-it; gemma-4-31b-it is the other supported ID. Unknown models are rejected. No fallback to Gemini-branded models occurs.

No GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY is consumed by this project; none is required or added.

## Run and verify

```sh
npm ci
npm run dev -- --port 3003
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run intelligence:live
```

Open http://localhost:3003/. The retired /journey URL redirects to the main dashboard. Reload the page after configuring the server key. GET /api/intelligence reports configuration readiness only, never proof of successful inference. The live command explicitly loads exported variables first, then .env.local, then .env. Ordinary automated tests mock inference and do not load your local key.

The live command makes a minimal connectivity request and a real combined-journey assessment. Missing/obvious placeholder keys skip live requests with: **Live Gemma 4 test blocked: API key not configured.**

The journey panel shows Analyzing, Gemma 4 active only after validated inference, deterministic fallback, model unavailable, or an error with reassessment. Model advice includes its simulated assessment timestamp, evidence and suggested action. Current deterministic fuel/diagnostic signals remain independently visible.

## Troubleshooting and deployment

- Missing key or placeholder: configure GEMINI_API_KEY in .env.local; reload. The app remains functional in fallback.
- Authentication/permission (401/403 or API_KEY_INVALID): verify the server key and API access in AI Studio. Do not share raw SDK errors or request headers.
- Rate limit (429): wait for quota recovery and use Reassess; do not hammer the endpoint.
- Model unavailable (404): use a supported model ID and verify account access; do not rename a different model as Gemma.
- Timeout: the server deadline is 30 seconds; UI advice falls back. Retry explicitly when appropriate.
- Invalid output: the response failed schema, evidence or feasibility checks; fallback is intentional.
- Production: set GEMINI_API_KEY and optional GEMMA_MODEL as server secrets in your hosting platform. Do not bundle the local file into a container image or put keys in build/client variables. Use HTTPS and deployment authentication/rate limiting appropriate to your environment. The demo endpoints enforce same-origin POST and bounded input; they are not a public multi-tenant API.

See GEMMA4_LIVE_INTEGRATION.md for architecture and verification results.
