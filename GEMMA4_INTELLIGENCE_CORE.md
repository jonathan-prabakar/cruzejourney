# Cruze FuelSense — Gemma 4 intelligence core

> Current application activation, configuration and live verification are documented in [GEMMA4_LIVE_INTEGRATION.md](GEMMA4_LIVE_INTEGRATION.md). The original branch history and settings below are superseded where that document specifies current behavior.

This branch adds a server-side, event-driven vehicle decision-support system on top of M2/M3. No dashboard, M4 diagnostic engine, M5 efficiency algorithm, vehicle control, second web application or deployment is added.

## What Gemma decides

Gemma receives available telemetry, recent history, calculated fuel facts, every confirmed reachable station's score/arrival/detour/price, observed codes, optional diagnostic/efficiency adapter findings, capability availability, and recent insight IDs. It chooses:

- Which observations deserve attention and which supported signals belong together.
- Priority and ordering of those observations, subject to deterministic safety floors.
- A sequence of approved driver actions.
- A refueling station from all eligible alternatives, including a choice different from M3's highest-scoring default.
- Evidence references and the supported relationship used to explain the decision.

This is an actual SDK inference path, not a hardcoded AI response. Automated tests mock responses; production contains only input scenarios and an explicitly labeled deterministic fallback.

The application calculates fuel/range/route feasibility, owns measurement values, validates the decisions, preserves mandatory warnings, and renders the selected evidence and actions. Gemma cannot replace those calculations, invent a station/code, suppress mandatory warnings, execute a command or control the vehicle.

## Model availability and API capabilities

Default model: **gemma-4-26b-a4b-it**. Optional supported alternative: gemma-4-31b-it. Unknown IDs are rejected rather than silently switching providers/models.

Google's [Gemma on the Gemini API guide](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api) lists these hosted models and documents text generation, system instructions, function calling and minimal/high thinking. The installed official SDK is **@google/genai 2.32.0**, locked in package-lock.json. Its [GenerateContentConfig](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) supports cancellation; request timeout/retry behavior is also checked against installed SDK types.

The current [Gemini structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) does not explicitly confirm schema-constrained output for this hosted Gemma ID. The implementation therefore uses application-managed constrained JSON through generateContent, without responseSchema/responseMimeType or native tool execution. This is a conservative capability choice, not a claim that native function calling is unavailable. Any unexpected function call is rejected.

Configuration: temperature 0.2, minimal thinking, 2200 maximum output tokens, one SDK HTTP attempt, 18-second SDK timeout, and an independent 18-second application deadline. An injected application timeout may be 1–30000 ms. No automatic API retries or paid map calls occur.

## Setup and server-only boundary

Set environment variables in the server runtime:

```env
GEMINI_API_KEY=your-server-key
GEMMA_MODEL=gemma-4-26b-a4b-it
```

Copy .env.example to an ignored .env file for the explicit live check, or export variables in your process environment. The service itself reads the host process environment; Next.js can load its normal server environment files. Do not use NEXT_PUBLIC_, VITE_, browser storage, client-side SDK initialization, request bodies or committed files for the key.

- `src/lib/intelligence/server.ts` exports analyzeVehicleIntelligence, createGemmaModel and createIntelligenceRequestHandler.
- `gemma.server.ts`, `orchestrator.server.ts`, `http.server.ts` enforce a browser runtime guard.
- `src/lib/intelligence/index.ts` is the browser-safe entry: contracts, context helpers, fallback and event controller. It never imports the SDK or reads environment variables.
- In Next.js, additionally use the framework's `import 'server-only'` at the server composition boundary for build-time enforcement.
- .env and .env.* are ignored; .env.example contains no secret.
- Error reporting uses static enum/message pairs only. SDK exception messages, keys, prompts, coordinates and model response text are not logged.

The host must authorize and rate-limit the HTTP endpoint, resolve authoritative data server-side, and protect it with its existing session/CSRF/origin policies. These concerns are supplied as callbacks rather than introducing authentication infrastructure. Browser-provided fuel conclusions, station eligibility or diagnostic severity must never be trusted.

## Architecture

| File | Responsibility |
| --- | --- |
| types.ts | Context, model decision, insight, output and adapter contracts |
| context.ts | Input bounds, M2 validation, future-history filtering, M3 recalculation, evidence catalog, capability status |
| prompts.ts | Compact context and constrained decision-language instructions |
| gemma.server.ts | Official Google SDK, server environment, verified model allowlist |
| validation.ts | Strict JSON schema-by-code, evidence/station/code/action/priority checks |
| render.ts | Grounded explanation and ordered action rendering |
| fallback.ts | Mandatory warnings and labeled deterministic results |
| orchestrator.server.ts | Model call, deadline, cancellation, validation, warning merge, result |
| triggers.ts | Event controller, throttle, deduplication, cache and stale-response protection |
| http.server.ts | Bounded authenticated Web Request/Response adapter |
| scenarios.ts | Four reproducible input scenarios based on M2 data |
| __tests__/ | Mocked orchestration, validation, SDK, HTTP, fallback and lifecycle tests; opt-in live check |

## Context and adapters

```ts
import type { VehicleIntelligenceContext } from './src/lib/intelligence';

const context: VehicleIntelligenceContext = {
  telemetry,                    // M2 VehicleTelemetry | null
  history,                      // at most 120 timestamped readings
  vehicle,                      // M2 VehicleProfile
  route,                        // M3 route-relative context
  stations,                     // at most 30 M3 FuelStation records
  requiredFuelType: 'diesel',
  fuelConfig: { reservePercent: 10 },
  fuelIntelligence,              // optional: accepted for integration, but recalculated server-side
  diagnostics: { available: false, findings: [] },
  efficiency: null,
  recentInsights: [],           // optional; at most 6; IDs only are used as hints
  demoMode: true,
};
```

Total context and HTTP request body limit: 100000 UTF-8 bytes. Current/history readings pass the existing M2 validator. Timestamps are sorted; history after the current timestamp is excluded. No model request is made if current telemetry is unavailable. Route measurements must be explicit finite nonnegative numbers or null. Invalid context produces a bounded unavailable-data fallback.

M3 is always recalculated from telemetry/profile/route/stations/fuelConfig. A caller's precomputed fuelIntelligence cannot forge eligibility or range. Profile/configured MPG remains the planning estimate; instantaneous MPG is not silently substituted.

M4 is absent on this base. The optional trusted adapter accepts `{ available: true, findings: [{ code, description, severity }] }`; severity is info/warning/critical. Only codes actually observed in current/bounded recent telemetry are accepted. Raw P0301 observations work without interpretation, and no specific cause or repair is asserted. Active codes and historical codes are distinguished. Adapter critical findings can increase urgency; absence of an adapter cannot erase raw-code warnings.

M5 is absent. Optional efficiency input is `{ status, metrics }`, where status is normal/concern/critical/unknown and metrics contain bounded IDs/labels and finite values with mpg/mph/mph/s/gallons/percent units. Unavailable/unknown/empty metrics remain unavailable; no efficiency analysis, sensor readings or savings percentage is fabricated. The owning application must supply trusted, current adapter outputs and clear them on seek/dataset replacement.

Coolant demonstration status: elevated at 225°F, critical at 240°F, otherwise normal; null is unknown. These are illustrative thresholds, not manufacturer-specific limits or a diagnosis. Critical temperature requires safe-stop priority and prevents a refueling-drive recommendation.

## Model decision language and validation

The model returns exactly:

```json
{
  "topPriority": "ai-combined",
  "insights": [{
    "id": "ai-combined",
    "category": "combined",
    "priority": "critical",
    "relationship": "fuel_diagnostic",
    "evidenceIds": ["fuel.percent", "fuel.usable_range", "diagnostic.P0301"],
    "actions": ["evaluate_diagnostic", "seek_assistance"],
    "stationId": null,
    "diagnosticCodes": ["P0301"],
    "confidence": "limited"
  }]
}
```

This is an illustrative decision schema, not a claimed live response.

At most four model decisions are accepted. IDs are bounded; unknown fields, prose/commands, malformed JSON, markdown fences, unsupported categories/actions/relationships, unknown evidence, fabricated codes, invalid top-priority links, duplicate IDs and output above 16000 characters are rejected.

The decision language intentionally excludes free-form model-authored measurement/action/diagnosis strings. Display explanations are rendered from model-selected relationships and trusted evidence. This enforces grounding by construction instead of claiming that keyword filters can prove arbitrary prose truthful. It limits linguistic flexibility; Gemma's role is selecting and combining evidence, prioritizing competing concerns, choosing a feasible station and sequencing approved actions.

Supported relationships: fuel_route, station_tradeoff, observed_diagnostic, fuel_diagnostic, coolant_diagnostic, coolant, efficiency_route, efficiency, monitor, missing_data. Each requires appropriate evidence and capability availability. Cross-system relationships require evidence from the relevant domains; coexistence is never rendered as confirmed causation.

Further checks:

- stationId must identify an M3-confirmed reachable compatible available station and have corresponding station evidence plus a refuel action.
- Codes must have corresponding observed diagnostic evidence and explicit code links in both directions.
- Refueling drives are blocked by critical coolant or active critical diagnostic adapter findings.
- Critical coolant decisions require stop_safely first.
- Fuel concern needs a feasible refuel/stop/assistance action; diagnostic concern needs evaluation/stop/assistance.
- M3 critical severity (including insufficient destination range), critical coolant and active critical diagnostic severity cannot be downgraded. Low fuel without a critical route condition and observed-code concern have a high-priority floor. Unsupported critical escalation and unsupported urgent actions are rejected.
- smooth_driving requires efficiency evidence; verify_data requires an actual missing-data fact.
- Unknown measurements never become facts or zero measurements.

A validation failure rejects the model decision set and returns the deterministic fallback. Error details are sanitized; raw untrusted responses are not displayed.

Mandatory fuel/route, raw-code, coolant and missing-data warnings are merged even when the model highlights something else. Critical coolant is ordered first; remaining insights respect severity and the model's ordering. If Gemma selects another approved station, the mandatory fuel warning uses that same approved station rather than giving a conflicting second station choice. Maximum output is six cards. Synthetic/demo outputs always have limited confidence.

## Output contract

`analyzeVehicleIntelligence(context, options?)` returns:

```ts
{
  overallAssessment: string;
  topPriority: string | null;          // ID in insights
  insights: VehicleInsight[];         // at most 6, with category/priority/title/explanation/evidence/actions
  source: 'gemma4' | 'fallback';
  model: string | null;
  analyzedAt: string;
  telemetryTimestamp: string | null;  // measurement snapshot, not a claim of live state
  limitations: string[];
  error: { code: string; message: string } | null;
  capabilities: {
    diagnostics: 'adapter' | 'observations-only';
    efficiency: 'available' | 'unavailable';
  };
  demoMode: boolean;
}
```

Each card exposes id, category, priority, title, explanation, evidence/evidenceIds, ordered actions, recommendedAction, optional relatedStationId/relatedDiagnosticCodes, confidence, source and mandatory. Even a Gemma result may include cards with source deterministic; those mandatory safety cards must remain visible.

Options allow model injection for testing, AbortSignal, bounded timeout, clock, and a sanitized onError callback. Logging failures cannot break fallback behavior.

Errors: MISSING_API_KEY, UNKNOWN_MODEL, TIMEOUT, RATE_LIMIT, API_UNAVAILABLE, INVALID_OUTPUT, INVALID_CONTEXT, CANCELLED. Missing key, API 429/404/failure, timeout or invalid response returns functional fallback insights. Fallback source is never labeled Gemma-generated and contains no simulated successful inference.

## Proactive triggering and lifecycle

Create **one IntelligenceController per vehicle/playback session**, with a server transport (in a browser) or the server analyzer (in a trusted process).

Call update(context) on telemetry updates; it detects changes in fuel status, destination reachability, default station, eligible station set/prices/detours, diagnostic episode/active codes/severity, coolant status, efficiency status, planning assumptions/capability availability and data validity. Normal same-event ticks do not cause another API request.

- Default minimum request interval: 5000 ms.
- Duplicate same-event ticks and exact in-flight explicit requests are suppressed.
- State changes during throttling coalesce into the latest pending context.
- Exact snapshot results cache for 30000 ms, bounded to eight entries. No cross-session/global cache is used.
- Only successful Gemma results are cached; fallback is immediate and duplicate-suppressed until a new event or explicit request.
- requestAssessment(context) explicitly requests analysis, still respecting throttle/cache/in-flight deduplication.
- New semantic events cancel the previous request and use a revision guard even if the transport ignores cancellation.
- Backward timestamp movement automatically cancels old work and clears the previous current result.
- On **any explicit seek or dataset replacement**, call invalidate(), then update the new context; alternatively update with discontinuity: true. This covers forward seeks with unchanged categorical status.
- Future history is filtered before analysis. Diagnostic onset outside bounded history is marked continuing, not given a fabricated timestamp.
- Same-event forward ticks retain the most recent assessment as a **timestamped snapshot**. Display telemetryTimestamp/analyzedAt; do not call an older AI snapshot the current sensor reading.
- getState() is stable until a state change. subscribe() returns cleanup; dispose() cancels timers/requests and clears listeners/cache.

States: idle, pending, analyzing, ready, fallback, disposed. Pending/analyzing states expose current deterministic warnings immediately, so critical conditions do not wait on the network. Unavailable telemetry does not contact the server.

## Framework-independent server / Next.js integration

This feature branch contains no Next.js app, so no second app or route tree is created. The existing main branch dashboard can add `POST /api/intelligence/analyze` using the supplied handler.

Example server composition (adapt imports and provide your existing authorization/rate-limit function):

```ts
import 'server-only';
import demo from '@/data/demo-telemetry.json';
import { getDemoFuelStations, getDemoRouteContext } from '@/lib/fuel';
import { createIntelligenceRequestHandler } from '@/lib/intelligence/server';
import { authorizeAndRateLimit } from '@/lib/your-existing-server-policy';

export const runtime = 'nodejs';
export const POST = createIntelligenceRequestHandler({
  authorize: authorizeAndRateLimit,
  resolveContext(body) {
    if (typeof body !== 'object' || body === null || !('recordIndex' in body) ||
        typeof body.recordIndex !== 'number' || !Number.isInteger(body.recordIndex) ||
        body.recordIndex < 0 || body.recordIndex >= demo.records.length) {
      throw new Error('Invalid record index');
    }
    const i = body.recordIndex;
    return {
      telemetry: demo.records[i],
      history: demo.records.slice(Math.max(0, i - 120), i),
      vehicle: demo.metadata.vehicle,
      route: getDemoRouteContext(i),
      stations: getDemoFuelStations(),
      requiredFuelType: 'diesel',
      demoMode: true,
      diagnostics: { available: false, findings: [] },
      efficiency: null,
    };
  },
});
```

The resolver uses the client's record selector to reconstruct trusted server facts. It does not accept posted fuel conclusions, station IDs, severity, or model settings as authoritative. Replace with your own trusted data source when integrating real vehicles.

The handler requires POST, authorization, application/json, a bounded streamed JSON body and a trusted context resolver. Responses have Cache-Control: no-store. It passes request cancellation into analysis. Error bodies are sanitized (400 malformed request, 401 unauthorized, 405 method, 413 size, 415 content type, 503 unavailable authorization). Model failures return a 200 typed fallback result with source/error fields.

Client composition example:

```ts
import { IntelligenceController } from '@/lib/intelligence';

const intelligence = new IntelligenceController(async (context, options) => {
  const recordIndex = lookupDemoRecordIndex(context.telemetry?.timestamp); // app-owned exact M2 lookup
  const response = await fetch('/api/intelligence/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordIndex }),
    signal: options?.signal,
  });
  if (!response.ok) throw new Error('Intelligence service unavailable');
  return response.json(); // your own authenticated, validating endpoint's typed response
});

// Connect to your M2 provider subscription/composition root:
intelligence.update(currentContext);
// On seek or replacement:
intelligence.invalidate();
intelligence.update(newContext);
// User request:
intelligence.requestAssessment(currentContext);
// Teardown:
intelligence.dispose();
```

Use getState/subscribe with React's useSyncExternalStore or your existing state system. Individual components unsubscribe on unmount; the owner disposes the shared session controller.

Dashboard mapping:

| Existing/future display | Result/state field |
| --- | --- |
| AI Vehicle Assessment | result.overallAssessment, labeled by source |
| Top Priority Insight | insights.find(i => i.id === topPriority) |
| Recommended Next Action | top insight's recommendedAction / ordered actions |
| Fuel Intelligence | fuel/combined category cards, relatedStationId |
| Vehicle Health | diagnostic/combined cards, relatedDiagnosticCodes |
| Efficiency | efficiency cards or capabilities.efficiency unavailable |
| AI analysis status | controller status and result.error |
| Dataset Demo Mode | result.demoMode, limitations, sample station/price labels |
| Analysis freshness | telemetryTimestamp and analyzedAt |

Keep mandatory cards visible and visually distinguish Gemma-selected cards from deterministic fallback/safety cards. There is no UI modification in this branch.

## Demonstrations and verification

`createIntelligenceScenarios()` provides four reproducible input contexts with real M2 records, M3 route progress and station calculations:

1. lowFuel: initial unmodified M2 reading at 17%, beyond usable destination range, with confirmed reachable choices.
2. criticalFuel: isolated variation of the initial reading at 9%; zero usable range and no invented reachable station.
3. diagnostic: actual M2 P0301 onset at index 160; isolated 30% fuel variation removes the low-fuel concern.
4. combined: unmodified M2 index 160 with low fuel and P0301 together.

Only the isolated input variations are synthetic scenario overrides; they do not edit the M2 dataset.

Mocked combined-decision example: Gemma selects fuel_diagnostic, cites fuel percent/usable range/P0301/RPM, and chooses evaluation before a validated refueling stop (or assistance if none is feasible). The rendered explanation says the two conditions need a coordinated sequence and that coexistence does not establish causation. These tests demonstrate decision enforcement, not live model quality or a completed live inference.

Run:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run intelligence:live
```

The ordinary suite always mocks model calls. The last command explicitly enables a single real combined-scenario call, loads an optional ignored .env, and skips if no GEMINI_API_KEY exists. It makes no retry or extra model-list request. Success requires both actual API generation and accepted output validation. API/model/validation failures fail the test with a sanitized cause; a fallback is never counted as live success.

Verification in this session: **250 tests passed**, including all **174 existing M2/M3 tests**. One live test skipped because no API key was configured. TypeScript, lint and production library build passed. The explicit live command also skipped; **no successful live Gemma call is claimed**. Production dependency audit reports zero vulnerabilities; the existing development lint-chain findings remain unchanged.

## Known limitations

- No live API success has been verified in this environment; account access/quota and empirical Gemma decision quality still need the opt-in check.
- Plain constrained JSON may be rejected/truncated by a model response; invalid output safely falls back. Schema-enforced hosting support is not assumed.
- The approved decision language intentionally constrains explanation prose and actions; it is not a general chatbot or open-ended tool executor.
- No completed M4/M5 module exists on the chosen base. Adapter data must be supplied by trusted, current server-side integrations.
- Demonstration coolant thresholds, fixed MPG, synthetic route/stations/prices and provisional M3 station scoring are not validated automotive safety models.
- No road routing, guaranteed range/arrival, manufacturer-specific diagnostic confirmation, savings claim, physical vehicle control or autonomous action is provided.
- Controller throttle/cache is in-process and session-scoped. The host must enforce endpoint authorization, rate limits and lifecycle/session isolation.
- Same-event forward progress retains timestamped prior analysis rather than calling the model every tick. Use explicit discontinuity on seek/reload and display assessment freshness.
- Build remains the M2/M3 bundler-oriented TypeScript library. The main-branch dashboard's package/lockfile must be reconciled during later integration; no dashboard branch was modified or merged here.
