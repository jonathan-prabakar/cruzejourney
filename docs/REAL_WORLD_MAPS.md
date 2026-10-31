# Real road maps and mapped fuel stations

Branch: `feature/real-world-3d-maps`.

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
