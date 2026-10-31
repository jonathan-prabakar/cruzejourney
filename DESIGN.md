# Cruze Journey — map-first driver experience

## Visual authority

Preserve the latest supplied Cruze - Journey wordmark, icons and brand variants under `public/brand`. Retain the existing dark automotive palette and locally hosted Barlow measurement face. Current source is `components/driving-dashboard.tsx`, `components/navigation/driving-dashboard.css`, the passive MapLibre renderer and global tokens. Historical cockpit/planner layouts are not the current visual contract.

## Composition

Operate mode: one viewport containing brand header, destination form, flexible real-map field, instrument strip and compact Demo Playback controls. Keep the primary surface fixed, with no sidebar or navigation tabs. Floating stop inspections and native directory/developer dialogs may scroll so information remains reachable on constrained viewports.

The map is the continuous working field. Destination, ETA, remaining mileage and short actionable alerts form its hierarchy. MPH, fuel, usable range, RPM, MPG and trip distance share the bottom instrument strip. Normal diagnostic summaries are hidden; actionable warnings retain visibility. Full evidence, coordinates, model configuration and raw diagnostic details stay in Developer diagnostics.

## Real map and stops

MapLibre/OpenFreeMap show cached/live OSRM road geometry and available building extrusions. The vehicle arrow follows the shared playback clock on animation frames and rotates with the road heading. Camera follow, overview and 3D controls remain available. Stations use actual operator coordinates, overview clustering and expanded price labels. Preserve visible map attribution.

The Truck stops button opens a native directory as the keyboard-accessible equivalent of map features. Selecting a stop opens its compact comparison, official source and dated price. Do not position a station on the highway merely to make it look aligned. Do not restore fictional stops, assumed truck access or generated amenity businesses.

## Interaction and state

Start Drive reads the provider snapshot, validates required fuel routing and then starts the existing clock. Review pauses playback while obtaining a road preview. Accept applies only a still-current verified preview; Decline leaves the route unchanged. A changed history or failed request retains current fuel and readings and provides a recovery notice. The preview must match the selected station.

Refueling is visibly engine-off and records added gallons and purchases. The drive then continues to its original destination. Seek/reset intentionally restore historical state. Speed and 10/15/20-second runs affect the same playback clock; they are not sensor controls. No model response automatically applies a detour.

## Verification boundary

Functional, source-data, timing, canonical replay, serverless-cache and road-route tests are recorded in FINAL_INTEGRATION_REPORT.md. Browser/WebGL/mobile visual verification remains blocked by the saved localhost permission. Preserve focus visibility, native dialog containment, source attribution and access to long inspection contents; do not infer visual QA from a successful build.
