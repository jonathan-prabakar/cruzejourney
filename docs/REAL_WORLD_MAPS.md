# Real road maps and mapped fuel stations

Branch: `feature/real-world-3d-maps`.

## Latest station-data cleanup — October 31, 2026

The user authorized pushing the MapLibre branch and deleting mock station locations. The fictional `src/data/demo-fuel-stations.json` and unused M1 station/map-position exports were deleted. Synthetic corridor/station generation was removed from `src/lib/integration/routes.ts`; it now contains destination metadata only. Active and default integration snapshots use the real road catalog. Numerical fuel-engine fixtures without GPS coordinates live only under `__tests__`, and AI test scenarios were moved under `__tests__` so application imports cannot load them. Simulated vehicle signals are retained because playback/diagnostics still require simulation; these are not station locations.

The next requested work remains: prominent station pins, a map station-list icon, actual route-to-station actions, smooth on-road marker movement, 10/15/20-second full-run options, and a ranked issue report. These were requested immediately before the push/cleanup steering message and have not been implemented at this checkpoint.

## Chat handoff — updated October 31, 2026

This section is a factual handoff for a new chat, not authorization to merge, push, deploy or implement unrelated milestones. The user requested a working map integration and explicitly said a prompt was not needed. Their latest request was to update this Markdown document so another chat can continue.

### Repository and current state

- Repository: `/Users/prabakar/cruzejourney` (use this directory, not the Codex workspace cwd).
- Active branch: `feature/real-world-3d-maps`.
- Implementation commit: `055b236` — `Add real road simulation with MapLibre 3D maps and mapped fuel stations`.
- The feature is committed locally; it has not been pushed or merged into `main`.
- This handoff update is a subsequent documentation-only working-tree change unless a later commit is shown by Git.
- `next-env.d.ts` already has a generated local change pointing to `.next/dev/types/` instead of `.next/types/`. Preserve it; it was deliberately excluded from the feature commit. Builds may regenerate it.
- Earlier integrated application commit on main: `2bc7709`. The new branch also includes the destination selector work that was uncommitted before the map integration.
- Stack: Next.js App Router (installed build reported 16.4.3), React 19, TypeScript, Tailwind, Lucide, Recharts, optional server-side Google Gemma. MapLibre GL JS dependency is `^5.24.0`.

### User requirements to preserve

Keep the existing branded, lightly gamified driving cockpit: no sidebar, no navigation tabs, and a fixed primary screen without document scrolling at ordinary desktop/mobile sizes. Native detail dialogs may scroll for accessibility. Preserve the existing logos, fonts and palette, fuel/reserve calculations, diagnostics, efficiency inspection, replay controls, keyboard access and optional AI fallback. This task adds real map data while vehicle behavior remains a simulation.

All four trips start in San Antonio. The user wanted Austin plus Dallas, Houston and El Paso, actual mapped gas stations, real road-derived mileage and a 3D map. Do not present station records as live-verified businesses, prices, fuel stock or truck-safe navigation.

### Current route snapshots

Retrieved October 31, 2026; exact retrieval and OSM timestamps are in each JSON file.

| Destination | Cached road mileage (rounded) | Selected mapped stations |
| --- | ---: | ---: |
| Austin | 79.3 mi | 11 |
| Dallas | 273.2 mi | 12 |
| Houston | 195.2 mi | 9 |
| El Paso | 552.3 mi | 4 |

There are 36 station records across the four route snapshots; a physical station can appear on more than one route. This is a selected corridor sample, not every station along the highways. El Paso coverage is sparse. OpenFreeMap serves the background tiles at runtime; OSRM/Overpass are only used by the explicit refresh script. No runtime map/routing key or new account is required.

### Implementation map

- `src/components/dashboard.tsx`: compact native destination selector; keyed `DrivingSession` remounts on destination changes and calls `useIntegratedVehicle(routeId, true)`. The second argument enables real-road mode. Updated map/station copy distinguishes simulation from mapped data.
- `src/components/route-map.tsx`: client-only dynamic MapLibre import, OpenFreeMap dark style, road GeoJSON, station buttons, simulated vehicle marker, 3D building extrusions, 2D/3D, Follow and Route overview controls. Owns map/marker/ResizeObserver cleanup. No terrain elevation or photorealistic imagery is implemented.
- `src/lib/integration/road-routes.ts`: imports the cached road snapshots, validates station inputs, creates derived 241-reading datasets, scales scenario timing/fuel consumption, and positions each reading on the road geometry.
- `src/lib/integration/road-geometry.ts`: cumulative geometry distances and piecewise coordinate interpolation. These coordinates are for following the retrieved route; routed distance comes from OSRM.
- `src/lib/integration/routes.ts`: typed destination IDs and legacy synthetic route definitions. Historical fixtures remain for regression coverage.
- `src/lib/integration/snapshot.ts`: `getDemoSnapshot(index, routeId = "austin", roadMode = false)` joins telemetry, road progress, deterministic fuel/health and AI context. Defaults preserve legacy demo behavior; the active cockpit explicitly passes road mode.
- `src/hooks/useIntegratedVehicle.ts`: one playback provider and AI controller per keyed session; route-aware request identity, stale-result protection, reset/seek invalidation, unmount timer/request cleanup.
- `src/app/api/intelligence/route.ts`: validates destination, index and optional `mode: "road"`; reconstructs trusted context on the server. Does not accept client-supplied geometry, telemetry or fuel conclusions. Legacy index-only requests still use the historical Austin scenario.
- `src/lib/fuel/{types,stations,reachability}.ts`: supports unknown price provenance and mapped truck-access values; missing diesel produces UNKNOWN; explicit truck exclusion blocks recommendations.
- `src/lib/intelligence/context.ts`: supplies mapped-data limitations to the optional AI. API keys and SDK remain server-only.
- `src/components/efficiency.tsx`: takes the selected trip's initial fuel level and tank capacity rather than assuming the original Austin baseline.
- `src/data/road-routes/{austin,dallas,houston,el-paso}.json`: actual retrieved route/station snapshots with provenance and original OSM tags.
- `scripts/refresh-road-data.mjs`: sequential, bounded maintenance fetcher; supports one destination argument and configurable OSRM/Overpass endpoints. An El Paso Overpass 502 was resolved by reducing query sampling density; all four final files were retrieved successfully. No fallback invents station records.
- `src/app/globals.css`: MapLibre stylesheet plus map control/marker styling. Existing cockpit design is retained.
- `README.md`, `PRODUCT.md`, `DESIGN.md`, this document: scope, design and operating notes. Historical milestone documents describe earlier stages and may still mention fictional demo stations; the active road-mode behavior is documented here.

The original `src/data/demo-telemetry.json` and fictional `demo-fuel-stations.json` were not edited. Do not confuse their historical test fixtures with the active mapped station snapshots.

### Validation and preview

Completed after the implementation: **332 tests passed, 1 skipped** (the opt-in live Gemma test), TypeScript check passed, ESLint passed without warnings, production build passed, and `git diff --check` passed. Coverage includes source/coordinate consistency, route progress, station provenance, unknown fuel/prices, truck exclusions, validated server requests, destination-switch cleanup, and mocked MapLibre source/layer/control/resource lifecycle. Mocked MapLibre tests do not verify actual WebGL rendering.

The production server was restarted from this checkout at `http://localhost:3000` / `http://127.0.0.1:3000` after the final build. The old tool session was replaced with session `70500`; session availability may not persist across chats. Check existing processes before starting another server or stopping anything. To run a fresh development preview:

```sh
cd /Users/prabakar/cruzejourney
npm run dev
```

To validate changes:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The optional Gemma integration was not live-tested; no new Gemini key was configured. Deterministic fallback works without a key. Do not claim live model validation.

### Remaining verification and useful next work

1. Browser visual/runtime QA is still outstanding. The browser tool's earlier attempt to access `http://localhost:3000` was explicitly declined. Do not bypass that denial through another browser, port, raw CDP, screenshot tool or indirect page access. Obtain renewed authorization if browser access is needed; do not claim screenshots or visual checks already passed.
2. With authorized browser access, verify actual tile loading/WebGL, available 3D building heights, station-pin click/keyboard behavior, camera follow/overview/2D switching, attribution visibility, console errors and loading/error states. Check all four destinations and 1440×900, 1280×720 and 390×844 layouts for the fixed-screen requirement. Pay particular attention to map controls and overlays on small screens.
3. Road mileage uses a general driving profile, not truck restrictions or live traffic. Station route position uses the nearest road vertex; access cost deliberately charges a whole local road loop and may overestimate travel. Keep these limitations visible. Accurate entrance-aware truck routing and exact additional detours would be separate improvements.
4. If broader station coverage is requested, improve/carefully refresh corridor sampling, particularly El Paso, while respecting public-service limits. Preserve provenance and unknown values. Never fabricate missing diesel, hours, stock, names, prices or truck access.
5. Do not push, merge or deploy the feature branch unless the user requests it. Their older request to push earlier application work to main was fulfilled in the prior integration sprint; it is not a new request to merge this branch.

## What works

- MapLibre GL JS with OpenFreeMap dark vector tiles; no runtime map key.
- Close 3D view with building extrusions where footprints and height data exist. This is a vector map, not photorealistic satellite imagery. Terrain elevation is not included.
- 2D/3D, vehicle follow, route overview, compass, zoom and imperial scale controls.
- San Antonio to Austin, Dallas, Houston and El Paso.
- Cached road geometry and mileage from the OSRM public driving service, based on OpenStreetMap. Vehicle position is interpolated along that geometry using simulated trip progress.
- Selected real mapped station records from OpenStreetMap through Overpass, with source links. This is a geographically sampled snapshot, not an exhaustive station directory.
- Existing fuel reserve, diagnostics, replay, seek and optional Gemma features. Route changes remount the session, pause the old provider and invalidate outstanding AI work.
- Server reconstructs route context from a validated destination, road mode and reading index; client-supplied geometry/fuel conclusions are rejected.

## Data provenance and limits

The JSON files under `src/data/road-routes/` record retrieval time, OSM snapshot time, source, license, geometry, routed distance/duration, station IDs and original tags. They were fetched from the services, not invented. OSM records can still be incomplete or outdated. Only selected corridor stations are included.

All vehicle signals, diagnostic events, fuel levels, consumption and replay timing are synthetic. Replay timestamps are scenario times, not the data retrieval date. The original 241-record Austin fixture is preserved unchanged; the active road mode derives a separate replay.

Fuel prices are null/unknown. `fuel:diesel=yes` is required for a diesel candidate; missing diesel tags produce UNKNOWN, not an assumption that diesel is sold. Explicit `hgv=no` excludes a station. Other truck-access tags are displayed as mapped information, not a guarantee. `isAvailable` in the historical fuel schema means the station is a listed candidate in this snapshot, not verified open right now. Opening hours, current operation, stock and physical truck suitability are unverified.

Access cost uses an OSRM road loop from a route point approximately 1.5 km before the station's nearest route point, via the station, to a point approximately 1.5 km after. The **entire loop** is conservatively charged before arrival in addition to route progress. It is an access allowance, not the exact additional detour, and can overestimate required distance. Station route position uses the nearest sampled road vertex. It is not a straight-line distance to the station. Snapping and road-profile limitations still apply; do not use this app for operational truck navigation.

OSRM's retrieved driving profile does not enforce truck height, weight, access or hazardous-goods restrictions. Mileage is a routing estimate; the replay arrival time is synthetic and does not represent live traffic. The optional AI receives the same limitations and cannot invent prices or override fuel feasibility.

## Refresh

```sh
npm run maps:refresh
# Or one destination:
npm run maps:refresh -- el-paso
```

The explicit maintenance script makes sequential requests, delays routing calls, samples station records, and fails instead of replacing a route with generated data on an incomplete response. Each destination is written only after its retrieval succeeds. No network calls to routing/Overpass occur during build or replay. Existing route files survive failed refreshes. The default public routing server is appropriate for this bounded demo data retrieval, not a production SLA. For larger use, configure your own OSRM and Overpass endpoints through `OSRM_BASE_URL` and `OVERPASS_URL`; respect provider policies. No secret is needed or stored in the browser.

Map tiles and fonts load from OpenFreeMap during map use. The primary map controls remain disabled until load; an error message explains failures, and the existing stop list and replay remain usable. Required OpenFreeMap/OpenMapTiles/OpenStreetMap attribution is retained by the map style. Cached OSM-derived data is subject to ODbL; see https://www.openstreetmap.org/copyright.

## Validation

Regression checks cover original engines, four derived datasets, on-route coordinates, cumulative mileage, unknown prices/fuel, truck exclusions, server request validation and clean destination switches. Browser visual verification requires permission to access the local preview; the earlier local browser request was declined, so no browser screenshot verification was performed for this branch.

## Primary references

- https://maplibre.org/maplibre-gl-js/docs/
- https://openfreemap.org/quick_start/
- https://project-osrm.org/docs/v5.24.0/api/
- https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfuel
- https://wiki.openstreetmap.org/wiki/Overpass_API
