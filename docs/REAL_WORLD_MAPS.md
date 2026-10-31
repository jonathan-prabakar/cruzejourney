# Cruze FuelSense: map integration and chat handoff

Updated October 31, 2026. Read this first when continuing in a new chat. This records facts and user requirements; it does not authorize unrelated changes, merging into main or deployment.

## Repository and branch

- Repo: `/Users/prabakar/cruzejourney` (the Codex workspace cwd may point somewhere else).
- Branch: `feature/real-world-3d-maps`.
- Remote: https://github.com/jonathan-prabakar/cruzejourney/tree/feature/real-world-3d-maps
- Initial MapLibre implementation: `055b236`.
- Fictional-location cleanup: `e2ee938`, pushed to origin with branch tracking enabled.
- Later map controls, timed playback, real station routing and security upgrade are the subsequent change set. Use `git log -1` and `git status` for its final commit/working-tree state; this document deliberately avoids a self-referential commit hash.
- Main was not merged or changed. The user explicitly authorized pushing the MapLibre code to the 3D integration branch; no separately named remote 3D branch existed, so the existing feature branch was published.
- Preserve the pre-existing generated `next-env.d.ts` change that points at `.next/dev/types/`; do not include it in feature commits. Build may overwrite it; the original copy is at `/Users/prabakar/Documents/Codex/2026-10-04/wh/work/location-next-env.before`.
- Stack: Next.js 16.4.3 as reported by build, React 19, TypeScript, Tailwind, Lucide, Recharts. MapLibre is now **6.16.0** (`^6.16.0`), upgraded from vulnerable 5.24.0. Its worker URL uses the official Next/Turbopack `new URL(..., import.meta.url)` pattern.

## User requirements and completed behavior

Preserve the branded, lightly gamified driving cockpit with no sidebar/navigation tabs, a fixed primary screen, existing instruments and native detail dialogs. Long dialog contents may scroll for accessibility. Keep keyboard access, reduced-motion support for ornamental transitions, diagnostics, fuel/reserve checks and optional server-side Gemma fallback.

The user asked for real station locations, actual road routes/mileage, 3D mapping, prominent stations, a station-list icon, station rerouting, smooth motion and 10/15/20-second run choices. The latest steering also authorized pushing the branch and deleting old mock station-location datasets.

Implemented:

- OpenFreeMap dark vector tiles through MapLibre, 3D building extrusions where available, 2D/3D, follow, overview, compass/zoom and imperial scale. No photorealistic imagery or elevation terrain.
- San Antonio departures to Austin, Dallas, Houston and El Paso, selected through a compact native header control.
- 44px station targets with fuel icons, visible names, keyboard access and highlighted recommendation. A Stations control opens all saved station records for the current route, including stations whose diesel/access information is unknown.
- Station details provide OpenStreetMap source links and **Route to this station**. This calls the trusted server with destination ID, current reading index, station ID and optional active plan ID. The server obtains a real road route from the current reading to the station; the station becomes the replay destination. It does not simulate buying fuel or automatically continue to the original city.
- Choosing a timed run resets and starts the full current route in 10, 15 or 20 wall-clock seconds. 1×/2×/5× remain available. Pause, seek, reset, destination changes and speed changes use one provider clock.
- A continuous read-only animation clock maps progress onto road geometry every frame; it does not move on a straight line between city coordinates. The marker rotates along the road and camera can follow. Accelerated mode uses a wider camera view.
- Station rerouting pauses the current replay, validates current/server-owned state, checks fuel reserve, validates returned geometry/mileage/snap offsets and preserves the old trip on failure. Successful station routes retain prior diagnostic history, use current fuel as their initial fuel and end with speed zero. Other station distances become unknown on the new route instead of reusing wrong corridor values.
- Return-to-original-city action and safe scenario seeking for shortened route datasets.

## Real locations and remaining simulation

Sam's Club and Costco on the map are real OSM records, not invented businesses:

- Sam's Club: https://www.openstreetmap.org/way/817032340 — 29.5538843, -98.3570812.
- Costco Gasoline: https://www.openstreetmap.org/way/244982297 — 29.5776902, -98.3182072.

These records have not been independently checked for current operation, fuel availability or truck access. No live prices are supplied. Missing diesel tags remain unknown. `hgv=no` blocks truck routing/recommendation. The old `isAvailable` field means a listed candidate in the snapshot, not live-open verification.

All vehicle signals, diagnostic events, fuel consumption and replay times remain synthetic. The original `src/data/demo-telemetry.json` is retained as the signal profile; its old GPS readings are not used to position the active map truck. Deleting those vehicle signals would break the requested simulation.

Fictional `src/data/demo-fuel-stations.json`, M1 station/map-position exports and generated synthetic corridor locations were removed. Numerical station inputs with **null GPS** exist only in fuel-engine unit tests. AI synthetic scenarios were moved under `__tests__` and do not ship in the cockpit import graph. The residual `src/lib/mock-data.ts` contains only labeled efficiency comparison numbers, not station locations.

## Cached city data

Retrieved October 31, 2026. JSON files record exact retrieval time, OSM snapshot time, license, original station tags and route sources.

| City | Cached road mileage | Selected station records |
| --- | ---: | ---: |
| Austin | 79.3 mi | 11 |
| Dallas | 273.2 mi | 12 |
| Houston | 195.2 mi | 9 |
| El Paso | 552.3 mi | 4 |

36 records across the route snapshots are not necessarily 36 unique physical stations. This is a selected corridor sample, not a complete station directory. General OSRM driving routes are not truck-restriction-aware, and there is no live traffic. Scenario arrival times are shown in Central Time and are not live ETAs.

Default station access cost conservatively charges a routed leave-and-rejoin loop (roughly 1.5 km before/after the nearest route vertex) before arrival, in addition to corridor distance. It can overestimate travel and is labeled an access allowance, not an exact extra detour. A selected station route instead routes directly to that station and has zero extra detour.

## Implementation files

- `src/components/dashboard.tsx`: destination and keyed driving-session ownership; station dialogs/list, routing requests/abort cleanup, duration choices, original-trip reset and safe scenario controls.
- `src/components/route-map.tsx`: MapLibre lifecycle/worker, road layers, prominent station markers/labels, Stations action, animation-frame road following, camera and resource cleanup.
- `src/hooks/useIntegratedVehicle.ts`: provider/controller ownership, route-plan-aware snapshots and AI requests, read-only interpolated distance progress, seek/reset/request invalidation. Key the session when changing destination/plan.
- `src/lib/telemetry/{types,playback}.ts`: 10/15/20-second duration mode and continuous clock alongside sampled authoritative readings. Each provider owns at most one timeout.
- `src/lib/integration/road-routes.ts`: builds initial real-road replays from synthetic signals and validates mapped stations. Exports `RoadRoute` and `RoutePlan` contracts.
- `src/lib/integration/road-geometry.ts`: geometry distances and clamped piecewise interpolation.
- `src/lib/integration/routes.ts`: typed city IDs and destination metadata only; no fake station generation.
- `src/lib/integration/snapshot.ts`: shared telemetry/fuel/health/AI snapshot. `getDemoSnapshot(index, routeId, formerModeArgument, optionalRoadRouteOverride)` now always uses real mapped stations; the former mode argument is retained for call compatibility.
- `src/lib/integration/rerouting.server.ts`: bounded server plan cache, OSRM request/validation, fuel-conserving derived station trips and prior diagnostic history. Plans expire after one hour; cache limit 32. At most six new route requests per minute per process. This is single-process demo storage, not a distributed production session store.
- `src/app/api/route-to-station/route.ts`: same-origin validated routing endpoint; fixed OSRM destination, no arbitrary URLs/client geometry accepted. Service errors leave the current trip intact.
- `src/app/api/intelligence/route.ts`: reconstructs context from index, city and optional server-owned plan ID. Unknown/expired plan IDs are rejected; no client-supplied fuel conclusions are trusted.
- `src/lib/fuel/{types,stations,reachability}.ts`: unknown prices/fuel and truck-exclusion handling. `src/lib/intelligence/context.ts` conveys mapped-data limitations to AI.
- `src/components/efficiency.tsx`: selected trip's own initial fuel and capacity; previous diagnostic history is excluded from its consumption chart.
- `src/data/road-routes/*.json`: actual retrieved city routes/station snapshots. `scripts/refresh-road-data.mjs`: explicit sequential maintenance fetcher with configurable OSRM/Overpass endpoints.
- `docs/MAP_ISSUES.md`: prioritized confirmed fixes, remaining architecture/data risks and verification gaps.

## Run and refresh

```sh
cd /Users/prabakar/cruzejourney
npm install
npm run dev
# Production:
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
# Explicit city snapshot refresh; not used during playback/build:
npm run maps:refresh
npm run maps:refresh -- el-paso
```

No map/routing key or new account is needed. Tiles require internet at runtime. Initial route and station records are bundled. Live rerouting uses the OSRM public service, with a 15-second timeout and visible failures. For larger use, use supported/self-hosted services. Refresh supports `OSRM_BASE_URL` and `OVERPASS_URL`. OSM-derived data is subject to ODbL; required OpenFreeMap/OpenMapTiles/OpenStreetMap attribution remains enabled.

The latest production preview was started on port 3000 in tool session `63213`; tool sessions may not survive a new chat. Check existing processes before starting/stopping servers.

## Validation and next work

Completed: **340 tests passed**, two optional tests skipped in default runs (Gemma and live OSRM); TypeScript check, ESLint and production build passed. Explicit `RUN_OSRM_LIVE=1 npx vitest run src/lib/integration/__tests__/rerouting.test.ts` passed all five checks, including actual public OSRM routing to the mapped Sam's Club. The build emitted hashed MapLibre 6 worker assets. `npm audit --omit=dev` reports zero vulnerabilities. Full audit still has 16 moderate development-tool findings; do not use `npm audit fix --force` because it proposes incompatible toolchain downgrades.

**Browser/WebGL visual QA is still incomplete.** The user explicitly approved a fresh localhost browser check in chat, but the browser tool then rejected access because a **saved permission setting** blocks `http://localhost:3000`. Do not repeatedly ask for verbal permission or bypass the saved block through another browser, port, screenshot mechanism, raw CDP or indirect access. The saved setting needs changing before retrying. No screenshots, actual GPU rendering, mobile geometry checks or browser-console checks were completed.

Next: (1) authorized visual/runtime QA after that saved setting is changed, (2) shared persistent plan cache/rate limiting before multi-instance production, (3) supported routing/entrance-aware truck data and broader station coverage, (4) compatible development-tool security updates. See the ranked issue report.

The optional Gemma service was not live-tested and no new Gemini key was configured. Missing-key fallback remains functional. Do not claim actual OBD, station stock/prices, live traffic, operational truck guidance or automatic refueling.

No tool in this session can open a new chat window. To move chats, open one manually and say: **Read `/Users/prabakar/cruzejourney/docs/REAL_WORLD_MAPS.md` and `docs/MAP_ISSUES.md`, check the current branch/status, and continue from the handoff.**

## Primary references

- https://maplibre.org/maplibre-gl-js/docs/ (including Next/Turbopack ESM worker setup)
- https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579
- https://openfreemap.org/quick_start/
- https://project-osrm.org/docs/v5.24.0/api/
- https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfuel
- https://www.openstreetmap.org/copyright
