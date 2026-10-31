# Intelligent Journey Planner — Milestone 5A

A functional, offline-capable journey planner and route-aware simulator is available at **/journey**, linked by **Plan journey** from the existing cockpit. The feature preserves the dark automotive design, local brand assets and existing dashboard. Its separate layout contains planning controls, a route/review area, vehicle intelligence, and live simulation instruments.

## Branch and integration boundary

This feature was created in a separate worktree from **origin/main at 98b6b11**, the latest completed dashboard snapshot available when work started. The commit message said milestone 4, but inspection found the dashboard's static diagnostic reference content rather than a reusable M4 engine. No diagnostic engine or completed integration branch was assumed. The feature was initially isolated from main while the other integration was in progress.

The existing M2/M3 modules, datasets, hooks and their tests were reused **unchanged** from origin/feature/m3-fuel-intelligence (0e7abf084b85462cfb6c4b36ec31204ff049affa, including the M2 foundation). They are not rewritten implementations. The journey simulation wraps the original M2 TelemetryProvider. Fuel planning calls the original M3 calculateFuelRange/assessStationReachability/calculateFuelIntelligence.

The planner is now merged with the completed M1–M4/Gemma integration from main (2bc7709). The cockpit retains its telemetry, fuel, diagnostic and server-side Gemma wiring. The planner provides an explicit typed adapter and existing-core bridge; its page continues to use deterministic fallback until the journey-specific server adapter is connected. No additional SDK/client was introduced.

## Supported locations and routes

Select any two distinct cities from:

- San Antonio
- New Braunfels
- San Marcos
- Kyle
- Austin

Search provides curated suggestions; select a suggestion or press Enter on a single result. Swap reverses the selected endpoints. Arbitrary typed addresses are not geocoded or silently resolved. Equal/unselected endpoints produce a visible validation error.

Twenty directed city-pair routes are assembled from eight cached adjacent-city road legs. Reverse road routes were retrieved separately, respecting directional geometry rather than reversing a one-way street path.

The full northbound base corridor is about **84.5 miles** before fictional access loops. This is different from M2's synthetic coordinate corridor. The simulator does not reuse M2's GPS on another route.

### Road-route provider

RouteProvider separates search from asynchronous route acquisition. The default curatedRouteProvider uses cached OSRM driving-profile road routes sourced on 2026-10-31. requestJourneyRoute validates provider geometry, distance, duration and endpoints and respects cancellation. Failed requests keep the existing reviewed plan and show an error.

See [OSRM route service documentation](https://project-osrm.org/docs/v5.24.0/api/#route-service). The cache retains provider road distance, modeled driving duration and step-derived geometry. Runtime planning requires no network, key, tiles or paid service. It is not live traffic or commercial-truck clearance/access validation.

Cached road data is attributed to **© OpenStreetMap contributors**, under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Attribution appears on the map and in src/data/journey/README.md. Refreshing through scripts/refresh-journey-routes.mjs is optional and makes only two public curated-coordinate requests. Failed refreshes preserve the old file.

No arbitrary-address routing, live geocoder or alternative highway optimization is claimed. The four route-priority choices compare modeled stop itineraries on the selected cached route.

## Architecture

| Module | Responsibility |
| --- | --- |
| src/lib/journey/types.ts | Locations, routes, preferences, waypoints, plans, simulation, diagnostic/intelligence ports |
| routes.ts | Curated location search, directed offline road routes, replacement-provider validation |
| geometry.ts | Distance indexing, interpolation, explicit modeled access-loop insertion |
| places.ts | Route-relative fictional station positions and fictional amenity provider |
| planner.ts | Bounded sequential itinerary search and complete requested-plan evaluation |
| simulation.ts | Route-specific telemetry frames, explicit purchases/dwell, original M2 playback adapter |
| intelligence.ts | Current M3 context, fallback, validated journey decisions and paced/stale-safe adapter coordinator |
| gemma-core-bridge.ts | Structural adapter to the existing Gemma server orchestrator; compact journey facts |
| src/hooks/useJourneySimulation.ts | Strict Mode-safe subscription-owned playback lifecycle |
| src/components/journey/ | Planner/review/intelligence interface, endpoint inputs and interactive SVG route map |
| src/app/journey/ | Next.js page and scoped styles |
| e2e/journey.spec.ts | Browser coverage and screenshots |

The old dashboard changes only to add its planner navigation link. Styling is scoped to the journey route. No database, authentication system, physical vehicle connection or deployment is introduced.

## Planning assumptions and multi-leg feasibility

Vehicle: Demo Freight Truck, 120 US gallon tank, 8 MPG typical. Planning uses **7.5 MPG** as a conservative configurable-in-code model and preserves **10% of total tank capacity**.

All fuel calculations use the original M3 formulas. Every node is checked sequentially:

1. Compute range from current gallons and the 10% reserve.
2. Use M3 reachability for the station or amenity access leg.
3. Consume modeled travel fuel at 7.5 MPG.
4. If it is a fuel stop, explicitly purchase enough fuel to reach the **100% refill target**.
5. Update fuel and purchase totals.
6. Check the next node and finally destination reachability.

There is no magical tank reset. For each leg, arrivalGallons = priorDepartureGallons − legMiles / planningMPG. At a fuel stop, addedGallons = 120 − arrivalGallons. The resulting departure fuel is 120 gallons. Optional amenity stops consume fuel for their access distance but do not refill.

The bounded deterministic search considers up to 12 eligible corridor stations and zero through three fuel stops, with up to eight total waypoints. Known compatible available stations with known detours are eligible. Each candidate is fully revalidated; the search is not a globally optimal routing/fleet algorithm.

Automatic planning chooses the fewest feasible refills and then compares the selected priority and amenity preferences. Explicit one/two/three-stop preferences prioritize the nearest feasible count. These numeric choices are explicit requests for additional stop/refill opportunities; they can add stops not needed for range, and the review explains that. A no-stop preference remains visible as an infeasible requested plan if it cannot preserve reserve, alongside a separately labeled feasible recommendation.

Priorities:

- Fastest: compare cached driving plus modeled access/dwell time among the preferred stop-count candidates.
- Lowest modeled purchase cost: compare explicit refill purchases; unknown prices are not free.
- Balanced: compare modeled duration and purchase cost, with a small preference for requested amenities.
- Fewer stops: strongly favor fewer refills.

These are **modeled comparisons**, not claims of global optimization or lowest real-world trip cost.

### Costs and duration

All station prices are fictional samples. Purchase cost is addedGallons × samplePrice, summed across refills; any unknown price makes the total unknown. It excludes the unknown cost of fuel already in the starting tank and does not count fuel left in the tank as consumed.

Full refills can leave a high arrival fuel level and a substantial purchase cost. They are a transparent demo policy, not an economical purchase-volume optimizer.

Duration includes cached modeled road driving time, access distance at a modeled 20 MPH, and simulated dwell. Fuel dwell is two minutes plus purchase volume at a modeled 12 gallons/minute; restaurant/restroom/coffee/convenience dwell is 20/5/7/5 simulated minutes. These are simulation assumptions, not business walking times or observed station service times.

Initial full-corridor example: 17% fuel, automatic stop preference. The default plan includes one fictional Guadalupe Demo Truck Stop refill, about **85.1 total miles**, about **127 modeled minutes**, about **11.3 gallons consumed**, and about **93.7% estimated arrival fuel**. Values are calculated, not hardcoded selections. Future refreshed road data may change them. Range/arrival estimates are not guarantees.

## Stop editing and comparison

The review lists origin, all selected waypoints and destination, including requested stop order.

- Inspect stations from the map or itinerary.
- Compare alternative confirmed-feasible plans.
- Add a station only when the added itinerary is confirmed feasible.
- Replace a fuel stop with another supported station; the resulting whole plan is revalidated.
- Remove any selected fuel/amenity stop and see the effect.
- Move optional stops earlier/later. Monotonic orders are evaluated; unsupported backtracking is explicitly flagged rather than silently sorted into a safe claim.
- Accept a separately recommended feasible plan if a requested edit is unsafe.

After an edit, distance, geometry, duration, fuel consumption, refills, cost and arrival fuel are recomputed. Infeasible plans have unknown arrival/consumption/cost totals and cannot start simulation. Unknown stations/amenities, duplicate waypoints, excess stops, unavailable/incompatible stations and missing detours are rejected.

Pause before editing. Editing an itinerary returns the simulation to review/start; it does not splice a new itinerary into a partially completed fuel history.

## Fictional stations and amenities

PlacesProvider supplies explicitly **fictional** restaurants, restrooms, coffee counters and convenience stores near the demo stations. Preferences influence the stop comparison and which amenity cards appear; they do not silently add a meal break.

Names, station identities, prices, availability and amenity locations are all demo data. Ratings, hours and walking times are null and displayed as unavailable. No real business is fabricated. A selected amenity becomes a waypoint and must pass full fuel feasibility recalculation.

Station route positions are normalized fictional positions along the selected road corridor. They are not verified actual station locations. Full access mileage is modeled separately, using the existing fictional M3 detours.

The route map and simulator add explicit **synthetic out-and-back access loops** for selected fuel/amenity nodes. These small loops are illustrative geometry, not verified service roads. Their entire access distance is conservatively charged before the stop, matching M3 semantics. The map labels the mixture of cached road route and modeled access. Amenity loops are additional to station access; no distance is called a measured walking time.

## Interactive simulation

JourneySimulation implements JourneySimulationPort by generating route-aware records and feeding the **unchanged M2 TelemetryPlayback**. Its provider can be injected for deterministic tests or later composition.

Controls: start, pause, resume, reset, seek, 1×/2×/5×. The simulation is accelerated by a clearly labeled clock: **60 simulated seconds per real second at playback 1×**, 120 at 2×, 300 at 5×. Simulated timestamps are not live vehicle time.

Every sample has interpolated position on the selected itinerary, interval-average speed, RPM, fuel, MPG, coolant and diagnostic code. Distance, elapsed time and fuel consumption use the same generated movement. Driving MPG varies deterministically from 7.8–8.2, above the conservative planning MPG. Stops are stationary; the synthetic engine is off while refueling/amenity dwell is recorded. Purchases/refills update fuel incrementally and are precomputed as part of the timeline.

Seeking selects the complete recorded state, including purchases and stop progress. Reset returns to the initial fuel and zero purchases; replay does not charge purchases twice. A safety guard blocks continued simulation if measured modeled fuel would fall below reserve. Infeasible reviewed plans never start.

### Scenarios

- Normal journey: a 60% fuel preset, no diagnostic event.
- Low fuel: a route-dependent, half-percent-aligned low fuel preset; no diagnostic event.
- Engine warning: 60% preset; P0301 appears at 35% journey distance.
- Combined conditions: low fuel preset; P0301 appears at 35% distance or at 65% of distance to the first planned refill, whichever is earlier. This deliberately demonstrates simultaneous low fuel and an observed diagnostic concern before refueling.

The initial combined plan starts at the M2-inspired 17% reading. Choosing a scenario applies a visible fuel preset; subsequent slider edits take precedence. Short-route low-fuel presets may have no confirmed reachable stop, in which case the planner asks for more starting fuel. No physically inconsistent depletion is used to force an event.

M4 is not assumed present. DiagnosticsAdapter currently returns an observed-code concern and explicitly says that a code alone cannot confirm a mechanical cause. A real M4 adapter can be injected as JourneyDashboard's diagnosticsAdapter prop or the third argument to makeJourneyIntelligenceContext after integration.

## Journey intelligence and Gemma handoff

Without a configured adapter/key, deterministicJourneyInsight supplies a functional journey/refueling/diagnostic recommendation. The interface labels this **DETERMINISTIC FALLBACK** and sends **no AI requests**. Fuel and diagnostic warnings remain independently visible; amenity convenience does not hide them.

JourneyIntelligenceContext contains the current plan and alternatives, driver preferences, progress/telemetry, current M3 result, diagnostics and known amenities. compactJourneyFacts converts this into origin/destination, plan/cost/refill summaries, preferences, amenity IDs and progress without forwarding road geometry to a model.

### Existing-core bridge

bridgeExistingGemmaCore accepts the existing server's analyzeVehicleIntelligence function. It creates **no Google SDK/client**, reads no API key, and invokes only the existing core. It maps an approved core action/station into the journey decision contract and validates again.

The unextended Gemma core supports fuel/diagnostic prioritization. To reason explicitly about stop preferences, comparative full itineraries and meal breaks, its existing context/fact catalog and prompt must additionally consume the compact input.journey field. It may return a structured journeyDecision, which is validated again. This extension is an explicit handoff task; this branch does not pretend the unmerged core already knows the new journey concepts.

Journey decision validation requires:

- successful source gemma4 and a supported Gemma 4 model;
- exactly the approved decision fields, strategies and priority;
- a known fully feasible reviewed plan;
- no switched historical plan during an in-progress simulation;
- a selected station in that plan AND confirmed reachable by current M3;
- existing amenity IDs; combined meal/fuel choices must belong to the same station and pass waypoint feasibility;
- only observed codes, with mandatory diagnostic concern retained;
- no severity downgrade below M3's critical status;
- no arbitrary model-authored measurements, commands or free-form diagnoses.

The display renders grounded measurements and approved strategy rather than arbitrary model text. A rejected decision/fallback from the core remains deterministic fallback. No action executes automatically.

### Proactive lifecycle

JourneyIntelligenceCoordinator triggers on plan changes/start epochs, fuel status/destination safety changes, diagnostic onset, planned-stop arrival, explicit reassessment and seek/reset epochs. The default adapter is null, so these events remain entirely local.

An injected adapter uses five-second throttling, in-flight duplicate suppression, exact-state caching for 30 seconds (eight entries), an 18-second deadline, cancellation and revision guards. A response from an old seek/reset state cannot overwrite the new state. No animation-frame request loop exists. Errors/timeouts retain deterministic recommendations.

### Next.js composition after the merge

Keep the existing Gemma server entry server-only. Use the host's authorization, request limits and trusted context reconstruction. A client must never import the server function or receive a key.

Server-side composition:

```ts
import 'server-only';
import { analyzeVehicleIntelligence } from '@/lib/intelligence/server';
import { bridgeExistingGemmaCore } from '@/lib/journey/gemma-core-bridge';

const journeyAI = bridgeExistingGemmaCore(analyzeVehicleIntelligence);
// In your authorized POST handler:
// 1. Validate selectors/preferences and reconstruct the current route/plan/frame server-side.
// 2. const result = await journeyAI.analyze(trustedJourneyContext, request.signal);
// 3. Return the validated JourneyInsight with no-store headers.
// Reuse the existing core; do not instantiate another SDK.
```

Client composition, after that endpoint exists:

```tsx
'use client';
import JourneyDashboard from '@/components/journey/journey-dashboard';
import type { JourneyIntelligenceAdapter } from '@/lib/journey/types';

const adapter: JourneyIntelligenceAdapter = {
  async analyze(context, signal) {
    // Use application-owned validated selectors, NOT authoritative posted fuel conclusions.
    const response = await fetch('/api/journey/intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originId: context.plan.baseRoute.origin.id,
        destinationId: context.plan.baseRoute.destination.id,
        preferences: context.plan.preferences,
        waypoints: context.plan.waypoints,
        simulatedTimestamp: context.frame.telemetry.timestamp,
      }),
      signal,
    });
    if (!response.ok) throw new Error('Journey assessment unavailable');
    return response.json(); // your own authorized, validating server endpoint's JourneyInsight
  },
};
export default function ConnectedJourney() {
  return <JourneyDashboard intelligenceAdapter={adapter}/>;
}
```

The current page deliberately supplies no adapter until that endpoint/core integration is ready. **Gemma active** appears only after an accepted successful model-backed response, never just because a key was entered. No live Gemma request was made or claimed in this task.

## Verification

Commands:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm run dev -- --port 3003
```

Open **http://localhost:3003/journey**. Use localhost for browser tests: the current Next.js dev server blocks client assets for an unconfigured 127.0.0.1 origin. The Playwright config uses localhost.

- **363 integrated unit tests pass**, including the telemetry, fuel, diagnostics, Gemma, cockpit integration and journey suites. The opt-in live Gemma test is skipped without explicit configuration.
- **8 Playwright browser tests pass** (including main cockpit seek/reset, fuel details and navigation into the planner): desktop/mobile layout, selection/swap/unresolved-address validation, no-stop fallback/removal, amenity insertion/reorder, moving marker/telemetry/pause/seek/reset, map inspection/add/replace and normal scenario.
- TypeScript and ESLint checks pass.
- Production Next.js build passes, generating /, /journey and /api/intelligence.
- Browser screenshots are written to ignored artifacts/: journey-planner-desktop.png, journey-planner-mobile.png, journey-simulation-combined.png and journey-simulation-diagnostic.png.

The Codex in-app browser tool was unavailable in this environment; browser verification used isolated local headless Chromium via Playwright. Browser tests wait for a connected playback session before interacting with server-rendered controls.

## Specific integration handoff

1. Completed: merged the feature with main at 2bc7709, preserving its authoritative engine fixes, SDK, server endpoint and integration tests. The original feature branch remains available.
2. The reused src/lib/telemetry, src/lib/fuel, src/data/demo-telemetry.json, src/data/demo-fuel-stations.json and original telemetry hook/tests are identical to M2/M3. If the integration branch has modified versions, retain its authoritative engine fixes and adapt only the journey ports.
3. Bring src/lib/journey, src/components/journey, src/app/journey, useJourneySimulation, route cache/license notice, tests/config and this guide. The existing cockpit needs only the Plan journey link.
4. Reconcile package manifests/lockfile: this feature adds Vitest, React test-renderer/types and Playwright development tooling. Preserve the integration branch's SDK, app scripts and dependencies. No new runtime package is required by the planner.
5. Wire the trusted M4 DiagnosticsAdapter and existing Gemma server through the bridge. Add compact journey facts to the core's catalog/prompt for preference/meal/full-plan reasoning; validate returned plan/station/amenity IDs.
6. Maintain server-side keys, authorization, route provenance and synthetic source labels. No automatic vehicle/itinerary action should execute.
7. Preserve simulation controls and session cleanup. Editing restarts a reviewed itinerary; seeking/resetting must increment the intelligence epoch/invalidate pending requests.
8. Run the integrated engine suite, these browser tests, typecheck, lint and production build. Verify all four scenarios, required-stop removal, unknown prices/detours and combined low-fuel/P0301 behavior.

## Limitations

This is a bounded corridor demo, not commercial navigation. Arbitrary addresses, live places/prices/traffic, truck restrictions, highway alternatives, drag-and-drop route optimization and global minimum-cost purchase sizing are deferred. Detours/access loops, businesses, amenities, prices, availability and telemetry are modeled/fictional. Ratings/hours/walking time are not invented. Backtracking is explicitly unsupported. All range/duration/arrival values are estimates. Full tank refills are intentional and may be economically excessive.

The cockpit uses the merged diagnostics engine and existing Gemma server. The planner still requires the journey-specific server adapter and trusted diagnostics port to enable those capabilities there; deterministic fallback is its shipped default. The existing development dependency audit findings remain outside this feature's functional scope; no audit success is claimed for the full development toolchain.
