# Cruze FuelSense connected vehicle experience

> Current final integration (2026-10-31): see [FINAL_INTEGRATION_REPORT.md](FINAL_INTEGRATION_REPORT.md). The application uses the unified map-first home, MapLibre 3D roads, operator-sourced truck stops and the shared vehicle session. Historical feature-branch examples and recorded live results below do not establish current deployment verification.

> Current product entry is the single dashboard at /. The separate planner page is retired; see [MAP_FIRST_DASHBOARD.md](MAP_FIRST_DASHBOARD.md) for the latest interface and verification. Earlier milestone history is retained below.

## Product and current implementation

Production vision: connect an authenticated vehicle, choose a destination, and let telemetry, deterministic engines and Gemma monitor the journey. This implementation is a **synthetic OBD-II/ELD stand-in**. No Bluetooth, serial, CAN, OBD device, ELD service or physical vehicle is connected or controlled.

Both / and /journey use the same navigation experience and the same layout-owned vehicle session. The existing M1 brand/layout styles, M2 TelemetryPlayback, M3 calculations and station data, M4 diagnostic interpretation, cached OSRM road routes and Gemma orchestrator are reused. The earlier dataset-cockpit component is retained in source but no longer mounted by the home page, so it does not create a competing replay clock.

The driver workflow is **A → B → Plan Journey → Drive**. Fuel sliders, sensor inputs, scenario selection, stop-count/optimization preferences and manual itinerary/amenity editing are absent from this view. Only Demo Playback can move through synthetic sensor history.

## Provider and future hardware boundary

src/lib/vehicle/connected.ts defines VehicleTelemetryProvider as a read-only subset of the existing M2 provider: getCurrentTelemetry and subscribe. ConnectedVehicleSession implements it. The initial reading and profile come from the existing telemetry dataset; fuel is not initialized from a driver-editable default.

VehicleNavigationProvider adds a navigation projection, trusted efficiency adapter, provider source, planning operation and optional demo controls. ConnectedVehicleProvider accepts that interface and retains it across client navigation. A future authenticated OBD/ELD host adapts validated timestamped readings to the same interface, supplies its actual vehicle profile and trusted server intelligence transport, and sets demoControls to null. This is a documented boundary, not an implemented hardware protocol.

A real adapter must handle permission, identity, units, stale/missing readings, out-of-order samples and manufacturer-specific PID availability. Missing fuel is not zero and unsupported PIDs must remain unavailable. Real intelligence must resolve account-owned readings/profile/server routing, not accept browser-posted sensor values. There is no fake connection button or hardware transport.

The demo profile is read from dataset metadata. M3 uses the lower of the profile MPG and 7.5 MPG as an explicitly conservative planning estimate, with a 10% tank reserve. Instant MPG is a read-only observation; a stopped/engine-off MPG value cannot replace planning economy.

## One clock and route-aware playback

The session owns one active JourneySimulation, which wraps M2 TelemetryPlayback and its existing accelerated clock. Frame generation is pure; neither route previews nor server reconstruction create a second playback clock.

The eight cached directed road legs support the existing twenty directed pairs between San Antonio, New Braunfels, San Marcos, Kyle and Austin. Arbitrary addresses and invented connector roads are unsupported. Selected-route geometry supplies driving GPS; SA–Austin dataset GPS is not replayed on other routes.

Each segment is seeded with the provider's current fuel, timestamp, location, RPM, MPG and active diagnostic code. Changing endpoints pauses/replaces the demo itinerary but preserves that seed. Active P0301 cannot disappear because a new destination was selected. Subsequent driving and refueling frames advance one timeline, with distance, interval-average speed, consumption and route progress derived consistently.

When A differs by more than 0.5 miles from the reported location at planning time, the UI labels the route a **future journey**. The current marker remains at its reported location in the preview; map bounds include it. Starting Demo Playback then simulates departure on the selected road route. Travel/relocation to that origin is explicitly not modeled or represented as a verified connecting road. This is future-trip demonstration, not current-position turn-by-turn rerouting.

## Fuel and purchases

Departure fuel is a captured provider reading. Current fuel remains a separate live readout and can differ after consumption/refueling. Planning, route changes and UI navigation do not reset it.

Automatic planning uses M3 range and reachability. A destination within usable range has no stop and a zero purchase estimate. Required refills use the route-needed policy: enough to cover remaining modeled travel, the 10% tank reserve and a 1-gallon buffer, capped at capacity. Legacy full-refill planning remains available to the old domain API/tests, but is not the driver-facing policy.

At a fuel stop the simulator pumps only the needed amount up to its planned departure target, accounting for actual simulated fuel on arrival. Added gallons and sample-price purchases accumulate during that explicit event. Zero speed/RPM/MPG is explained by a visible **Modeled refueling · engine off** message; the itinerary shows Refueling now and then Completed. No instant silent tank reset occurs.

Estimates use conservative MPG; actual synthetic purchases and arrival fuel may differ. Missing prices remain unavailable. Session purchase totals preserve earlier route segments, while trip distance and departure readings are clearly scoped to the current plan. Reset/seek intentionally restore the current segment's historical purchases and fuel, preserving completed prior segments.

## Canonical server reconstruction and Gemma

The connected UI sends only a bounded ordered list of origin ID, destination ID and elapsed-time selectors to POST /api/intelligence/journey. The server replays the same canonical route history from the dataset's initial reading, rebuilding every departure fuel value, plan, refill, diagnostic state and current frame. Sensor overrides and unknown positions are rejected. Up to 16 segments are supported per demo connection; reload explicitly starts a new connection.

The existing Gemma transport, orchestrator, evidence catalog, strict decision validation, safe rendering, mandatory warnings and fallback remain in use. Current route, destination, remaining distance, fuel/range, feasible stops, diagnostics, progress and available efficiency findings reach the same core. Requests are event-driven and paced; animation ticks do not become independent model calls. Seek/reset and route changes invalidate pending advice and protect against stale completions.

The key remains server-only in the existing ignored .env.local. A successful inference is required before Gemma 4 active appears. Missing key, invalid output, quota, timeout and API errors retain deterministic advice. Automated browser tests mock inference; they do not consume the local live key. Prior activation verified connectivity and a vehicle assessment. On 2026-10-31 the explicit live browser check also passed against this connected experience: a real server Gemma response for the low-fuel/P0301 scenario passed validation, reached the panel and activated its Gemma 4 badge. No model response was mocked in that check.

## Diagnostics and efficiency

M4 reads the same current frame automatically. Synthetic P0301 occurs from the behavior pattern, with no driver diagnostic control. Its generic interpretation remains an observed indication, not a confirmed mechanical cause. It persists across replanning and is removed only when historical demo playback returns to a point where it was absent.

M5B is not merged. VehicleEfficiencyAdapter provides a typed current-reading/history boundary; the default returns null and the UI says analytics unavailable. No MPG trend, acceleration score, range penalty or fuel savings is invented. A future trusted server-side adapter can supply actual validated M5B findings to the existing Gemma contract.

## Files and verification

- Provider/session: src/lib/vehicle/connected.ts, components/connected-vehicle-provider.tsx.
- Driver view: components/journey/journey-dashboard.tsx, journey-map.tsx, app/page.tsx, app/layout.tsx, app/journey/journey.css.
- Domain reuse/adaptation: journey/planner.ts, simulation.ts, types.ts.
- Server/AI integration: journey/context.server.ts, request.ts, gemma-core-bridge.ts, intelligence.ts and hooks/useJourneyGemma.ts.
- Tests: vehicle/__tests__/connected.test.ts and updated journey/Gemma browser flows.

Verification commands: npm test, npm run typecheck, npm run lint, npm run build, npm run test:e2e.

Recorded checks: **388 unit tests passed**; **8 repeatable browser tests passed**. Two live unit checks and one live browser check remain explicit opt-ins. The separate npm run intelligence:live:browser command passed its real end-to-end scenario (14.6 seconds). TypeScript, ESLint and production build pass. Browser coverage includes desktop/mobile layout, absence of sensor controls, short-route zero purchases, invalid inputs, swapping, movement/consumption/pause, preservation across route/navigation, refueling explanations, historical reset and mocked Gemma response/retry/staleness. Screenshots are in ignored artifacts/connected-vehicle-*.png.

## Limitations

No physical OBD/ELD, M5B analytics, live prices/availability, live amenities, traffic, truck-clearance verification, arbitrary-address geocoding or current-GPS connector routing is provided. The demo is session-local; a full reload creates a fresh connection. DTC timing and driving behavior are synthetic. Road/access distances and arrival remain estimates. The same-origin demo endpoints still need deployment authentication and server quotas for public use.
