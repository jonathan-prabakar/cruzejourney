# Gemma 4 live vehicle intelligence

## Existing systems reused

This activation branch starts from merged main a52c9ea. It preserves M1 cockpit UI, M2 TelemetryPlayback, M3 fuel/range/station calculations, merged M4 diagnostic descriptions and M5A route planning/simulation. M5B efficiency analytics is not merged; its capability stays unavailable. No efficiency trend is inferred from an instantaneous MPG value.

The existing server orchestrator, official SDK adapter, evidence catalog, validators, renderer, mandatory warnings, deterministic fallback and event controllers remain authoritative. There is one model SDK integration, not a competing AI pipeline.

## Model and API configuration

Official @google/genai **2.32.0**, default **gemma-4-26b-a4b-it**, optional gemma-4-31b-it. Only server GEMINI_API_KEY and GEMMA_MODEL are used. The actual local configuration is .env.local, ignored by Git; .env.example contains no key. The configuration utility rejects missing/obvious placeholder values and reports readiness without credentials. Mapping/places keys are unused.

The supplied API reference is primary; the [official hosted Gemma guide](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) and installed SDK types confirm generateContent, systemInstruction and ThinkingLevel configuration.

System instructions define a simulated vehicle copilot, supported measurements only, safety priority, no invented stations/routes/prices/restaurants/diagnoses, no guaranteed arrival and no autonomous controls. Significant event assessments use **ThinkingLevel.HIGH**, temperature 0.2, maximum 8192 output tokens. Connectivity and one optional output-format repair use **MINIMAL** with 2200 tokens.

Each SDK request has one HTTP attempt; no transport, authentication or quota retries occur. An assessment has a shared 30-second deadline and at most two generations: the initial decision, then one minimal-thinking repair if structured validation fails. Cancellation/deadline applies to both. A failed repair returns deterministic fallback. The journey UI deadline is 33 seconds.

Live testing found Gemma can wrap JSON in Markdown. The SDK adapter removes only one complete outer JSON code fence. It never extracts arbitrary fragments or removes surrounding prose. Strict JSON, schema, evidence, severity, station and route validation still follows.

## Endpoints and trusted inputs

- GET /api/intelligence: key/model configuration readiness, not a successful-inference claim.
- POST /api/intelligence: existing cockpit dataset-index resolver and orchestrator.
- POST /api/intelligence/journey: same existing HTTP handler and orchestrator, with journey selectors.

POST routes require same-origin JSON and bounded streamed bodies. The journey wire contains origin/destination IDs, preferences, itinerary waypoint IDs and elapsed simulation time. The server validates these selectors, rebuilds cached road routing, planner alternatives, canonical telemetry frame, bounded past history, M3 fuel/eligibility and M4 findings. Browser-provided measurements, station catalogs, severity, costs and eligibility are rejected.

No request contains an API key. API errors use static sanitized codes/messages. The demo needs deployment authentication and server-side quotas before public multi-tenant use; origin checks and browser throttling are not substitutes.

## Reasoning and validation

The prompt includes current telemetry evidence, fuel/reserve/planning range, remaining route, confirmed reachable stations, diagnostic observations and M4 descriptions, capability status, scenario, progress, stop preferences, known plans and modeled costs/duration, and fictional amenity choices. Road geometry is omitted.

Gemma chooses cross-system priority, supported action order, feasible station, reviewed plan and optional amenity. Journey responses add journeyChoice to the existing bounded decision language. The application validates known/feasible plan IDs, selected-station membership and M3 reachability, amenity category/host, diagnostic links and severity floors. No new plan is selected during playback. Model station candidates are limited to M3-reachable stations in reviewed feasible plans, and to the current itinerary once underway; M3's full calculations are not changed. The existing journey validator then recalculates any suggested amenity insertion before accepting advice.

Mandatory current fuel/diagnostic warnings remain visible independently of model advice. Rendering uses supplied evidence and approved actions, without arbitrary model-authored measurements or mechanical diagnoses.

Function calling remains disabled: all existing deterministic calculations are already run server-side before inference. Additional tool round trips would duplicate supplied facts and increase latency without adding a needed capability. Unexpected native function calls are rejected. Google Search grounding is disabled; no live prices, availability, hours or detours are claimed.

## Proactive UI and lifecycle

The journey page now connects its existing-core bridge to the real endpoint and merged M4 adapter. Events include trip start/resume, plan/preferences/scenario changes, fuel status, reachable/recommended station changes, diagnostic events, stop transitions, explicit reassessment, seek/reset epochs. It does not call on every animation frame.

Five-second throttling, in-flight deduplication, 30-second/eight-entry successful-result cache, request cancellation, deadlines and revision checks remain. Seek/reset clears the displayed model result and cache immediately; old completions cannot repopulate the panel. Advice carries its simulated snapshot timestamp, model ID and evidence.

States include configuration missing/not yet tested, analyzing, validated Gemma 4 active, model unavailable, authentication/rate-limit/timeout/invalid-output error with retry, and deterministic fallback. A configured key alone never activates a Gemma badge.

## Verification

Connectivity: successful real, nonempty Gemma response with the configured local server key on 2026-10-31.

A real combined-journey assessment starting at 17% fuel and selecting the first simulated P0301 event succeeded through the existing SDK and both decision validators. Initial responses sometimes omitted a required station evidence reference; a bounded minimal-thinking repair produced an accepted response.

The live browser check exposed the wildcard-bind origin issue, now fixed with tests for the actual HTTP Host, scheme and other-origin rejection. Subsequent live browser attempts encountered invalid structured output, one API transport failure and finally HTTP 429 rate limiting. Therefore **a successful live browser-panel display is not claimed**; repeatable browser tests verify that integration with mocked inference. No quota/authentication/transport retries are automatic. Further live verification requires quota recovery and explicit reassessment.

Automated checks: 378 unit tests and 10 repeatable browser tests passed; two live unit checks and one live browser check are opt-in and skipped during ordinary suites. TypeScript, ESLint and production Next.js build passed. Security checks verified ignored owner-only .env.local, blank tracked template, no actual credential in the Git diff or browser assets. See the current execution report for any later changes to these results. Ordinary tests use mocked inference; explicit live checks never substitute mocked model responses. The live test diagnoses only bounded response-format/constraint metadata and static errors, never raw SDK errors, credentials or model text.

See ENVIRONMENT_SETUP.md for run commands, key setup and deployment troubleshooting.
