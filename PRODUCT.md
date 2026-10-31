# Cruze Journey

## Platform and stack

Web application using Next.js App Router, React, TypeScript, Tailwind, Lucide, Recharts and MapLibre/OpenFreeMap. Supplied Cruze - Journey assets live under `public/brand`.

## Purpose and users

A hackathon truck-journey simulation for evaluators and drivers exploring fuel planning, route-aware telemetry, diagnostics and optional Gemma advice. No physical vehicle is connected.

## Current experience

One fixed map-first driving view at `/`: select Point A and Point B, then Start Drive. `/journey` redirects to the same view. The former dashboard/sidebar/planner pages are historical; their domain capabilities are integrated into this workflow. Sensor values are read-only. Demo Playback alone changes synthetic playback position, speed, reset and 10/15/20-second duration.

The layout-owned ConnectedVehicleSession owns one active M2 TelemetryPlayback through JourneySimulation. Current fuel, GPS, route progress, diagnostic history and purchases come from that shared timeline. M3 handles reserve/reachability and route-needed refills; M4 interprets observed diagnostics. Gemma uses the existing structured server orchestrator and deterministic fallback; it does not control the vehicle or silently accept a route.

## Locations and data

Five I-35 corridor cities support 20 directed cached road pairs. San Antonio also supports Dallas, Houston and El Paso, giving 23 supported directed connections. Other combinations are explicitly unavailable.

The active catalog contains 13 real truck stops: 12 Love's locations and TA New Braunfels #0232. Official operator pages provide coordinates, truck facilities and price snapshots checked 2026-10-31. Current prices, stock/open status, traffic and truck-clearance routing are unavailable. Unsourced amenities remain empty. Synthetic station and amenity fixtures are confined to tests.

MapLibre renders real roads and available 3D buildings. Required fuel stops are validated against OSRM road geometry before driving. A station can be inspected, previewed and accepted as a road reroute. Refueling is an explicit simulated engine-off event at the stop, followed by travel to the destination. Public OSRM uses a general driving profile.

## Scope and limits

No physical OBD/ELD, authenticated vehicle ownership, live business feed, arbitrary-address geocoder or M5B efficiency engine is implemented. Instant MPG is visible; unavailable analytics do not produce invented scores or savings. Keys stay in server environment variables. The user will configure GEMINI_API_KEY in Vercel; live inference is not verified on this Mac.

## Current verification

See [FINAL_INTEGRATION_REPORT.md](FINAL_INTEGRATION_REPORT.md) for branch ancestry, checks, source links and deployment constraints. Browser visual verification is blocked by a saved localhost permission; do not describe the merged layout as visually verified.
