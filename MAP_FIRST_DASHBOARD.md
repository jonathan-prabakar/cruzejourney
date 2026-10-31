# Cruze Journey — unified driving dashboard

> Current final integration (2026-10-31): see [FINAL_INTEGRATION_REPORT.md](FINAL_INTEGRATION_REPORT.md). The application uses the unified map-first home, MapLibre 3D roads, operator-sourced truck stops and the shared vehicle session. Historical feature-branch examples and recorded live results below do not establish current deployment verification.

## Product entry and removed UI

The application opens directly at **/**. Point A, Point B and **Start Drive** are the primary controls. Start Drive reads the current vehicle snapshot, loads the supported cached road route and starts the existing M2 playback clock.

The separate /journey page, Journey Planner navigation, old three-panel planner UI, large intelligence sidebar, repeated metric cards and old map component are removed. Bookmarks to /journey redirect to /; the production page list contains no planner page. The underlying journey domain, M2–M4 and Gemma modules remain reusable. M5B is not integrated.

The main map shows the active road route, moving truck, destination, ETA, remaining distance, visible diesel prices, reachable alternatives and highlighted recommended stop. Clicking a price marker opens a compact price/gallons/distance/detour/purchase-cost comparison. Normal diagnostic states are hidden. Actionable warnings are shown as short map alerts.

API state, errors, raw coordinates, telemetry times, full assessment/evidence, calibration assumptions and capability status are available only in **Developer diagnostics**. The normal view has a small Demo Mode label and a fictional-stations/prices/access notice.

## One vehicle stream and one timeline

The shared layout-owned ConnectedVehicleSession still supplies fuel, speed, RPM, MPG, GPS, diagnostics and progress. No sensor controls were added. The initial 17% comes from the original synthetic telemetry fixture, not a driver setting.

Driving consumes fuel using the same interval distance/MPG that supplies movement. Fuel rises only in explicit pump frames, with gallons and estimated purchases recorded. Compact Demo Playback keeps Play, Pause, Reset, Seek and speed on the same M2 timeline. Refueling is visibly labeled as an engine-off event.

New destinations preserve current fuel and diagnostic observations. An accepted stop continuation also preserves GPS, timestamp, fuel, code, cumulative trip miles and previous purchases. It uses only the remaining cached road geometry and explicit fictional access loops. It does not restart from the original city. Display coordinates and semantic plan IDs are quantized to avoid insignificant Node/Chromium floating-point differences causing hydration warnings or mismatched proposal IDs; authoritative fuel calculations are not rounded away.

Reset after accepted detours returns to the current drive's original departure reading/route and removes that drive's later purchases and diagnostic history. Completed prior drives are retained. Preview and Decline do not alter active state. Accept revalidates the stop at the current frame and pauses the demo at the accepted continuation; resume when safe.

## Synthetic station catalog

Four additional fictional diesel stops are defined in src/data/journey/truck-stations.json, augmenting the original M3 station fixture. The route adapter supplies deterministic coordinates on the selected cached road axis, diesel prices, amenities, availability, truck-access assumptions and modeled leave/return distances.

Truck accessibility is an **assumption**, not verified clearance. No real business, price, availability or detour is claimed. Reverse routes use the existing directed cached geometry; no unrelated SA–Austin GPS recording is replayed on another route. There are no new external APIs, tiles, paid services or key requirements.

## Automatic fuel optimization

fuel-options.ts calls M3 reachability with current fuel, reserve and conservative MPG. Moving MPG can lower the estimate; zero stopped MPG cannot erase usable range. Ahead-only, available, compatible, reachable stations are evaluated through the existing itinerary engine.

Options compare diesel price, required gallons, full modeled detour mileage, purchase cost and reserve-preserving arrival fuel. Sorting uses total estimated purchase cost, then detour distance—not cheapest price per gallon. Detour fuel is included in the required purchase; no driver wage/time cost is invented. Unknown prices remain unavailable, never free.

Initial drive planning uses the fewest feasible fuel stops, then purchase cost. Refills target remaining road/access travel, a 10% tank reserve and a 1-gallon buffer; they do not automatically fill the tank. No stop is recommended when the remaining road is already within usable range.

## Structured Gemma navigation

The existing server SDK/orchestrator, evidence catalog, schemas, strict validations, timeout, throttle, deduplication, fallback and stale-response protection remain. The driver view does not render model paragraphs. A small navigation-decision adapter turns validated strategies and known station IDs into highlights and short continue/fuel/warning/safe-stop alerts.

Current safety conditions override any continue suggestion. A model-selected station must still be in the current set of feasible options. Invalid/unavailable/rate-limited inference uses deterministic navigation without exposing the API error to the driver. Source/model/error/evidence remain honestly visible in developer diagnostics.

Grounded, feasible continuation plans are explicitly marked as **proposals** in the existing compact Gemma context. The model can recommend one during playback, but cannot apply it. Unmarked alternate itineraries remain forbidden mid-drive. The client and server validators check plan IDs, station membership, M3 reachability, fuel feasibility and observed diagnostic codes.

POST /api/intelligence/journey retains its existing internal API name. Its bounded selector history now supports accepted station IDs and explicit same-route continuations. The server rebuilds each route/frame/fuel purchase from the original fixture and rejects invented, passed, unreachable or inconsistent stop selections. It does not trust browser sensor measurements. The key remains in ignored server .env.local.

## Files

- Dashboard: components/dashboard.tsx, components/driving-dashboard.tsx, components/navigation/driving-map.tsx and driving-dashboard.css.
- Entry/config: app/page.tsx, app/layout.tsx, next.config.ts; retired app/journey page/styles removed.
- Provider and proposals: lib/vehicle/connected.ts, fuel-options.ts and navigation-decision.ts.
- Data/domain: data/journey/truck-stations.json; journey/places.ts, planner.ts and types.ts.
- Intelligence: journey/intelligence.ts and gemma-core-bridge.ts; intelligence/context.ts, prompts.ts and validation.ts.
- Tests: vehicle/__tests__/navigation.test.ts, updated SSR/boundary tests and main-dashboard Playwright scenarios.

## Verification

Commands: npm test; npm run typecheck; npm run lint; npm run build; npm run test:e2e.

Recorded local checks: **397 unit tests**, **11 repeatable browser tests**, TypeScript, ESLint and production build pass. Ordinary tests mock model inference and never spend the configured live key. Two live unit checks and one live browser check remain explicit opt-ins.

Coverage includes all twenty directed city pairs, station coordinates, total-cost ranking versus cheapest diesel, reserve floors, MPG decline/stopped readings, current-position acceptance, stale/unknown stop rejection, canonical server replay, preserved diagnostics/purchases/trip miles, consistent reset, short-drive zero purchases, price-marker interaction, proposal preview/decline, read-only sensor UI, desktop/mobile hydration and retired-route redirect.

The explicit live browser command was attempted once on this branch and returned HTTP 429 RATE_LIMIT from the real Gemma API. A new successful live response is not claimed for this change. The driver retained deterministic navigation, and the error was confined to developer diagnostics. The previous connected-vehicle branch had verified real Gemma successfully; this branch needs quota recovery for a fresh live pass. No mocked response counts as live inference.

## Limitations

This is a synthetic truck-driving demonstration: no physical OBD/ELD connection, M5B efficiency engine, live business/price/availability data, verified truck clearance, arbitrary-address routing, traffic or alternative highway routing. Proposed reroutes are station-access changes on the existing supported cached corridor, not invented highway alternatives. All detours and station accessibility are fictional assumptions. A source-origin change away from reported GPS is a future simulated departure, not a modeled connector road.

A full reload starts a new demo connection. Demo history is bounded to 16 segments. Deployment still needs authenticated vehicle ownership and server quotas beyond the existing same-origin demo checks.
