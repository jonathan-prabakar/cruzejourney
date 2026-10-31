# Cruze FuelSense driving cockpit

The direct UI brief replaces the scrolling dashboard with one fixed driving scene. The supplied wordmark, F symbol and exact palette remain authoritative. No sidebar, navigation tabs or chart tabs remain.

## Surface contract

Operate mode. Show the current simulated journey as one continuous map field with a compact checkpoint briefing and vehicle communications. Journey progress follows the current reading of the unchanged M2 trip and its modeled road-distance total; there are no invented rewards, competitive scores or incentives to drive faster. Game character comes from the route/checkpoint framing, instrument hierarchy and a self-hosted Barlow Condensed measurement face.

The primary screen uses four fixed grid rows: brand/journey header, flexible map field, six-instrument deck, and functional replay bar. At 1440×900, 1280×720 and 390×844, document dimensions equal the viewport. On mobile the six instruments reorganize into a compact deck and the checkpoint sits within the map scene. Labels and alignment derive from these groups rather than independent dashboard cards.

## Interaction

The fuel gauge opens authoritative fuel/reserve details. Its values and normal/low/critical state now follow the shared M2/M3 snapshot; the previous manual mock-state cycle is removed. Station pins and checkpoint controls inspect fictional fuel stops. Health, efficiency, alternatives and run settings open native dialog inspections. Escape dismisses, native modal focus containment applies, and explicit opener restoration returns keyboard focus after dismissal. The chart comparison uses one action button, not tabs.

The primary page does not scroll at tested viewports. Longer detail-dialog contents may scroll on small or zoomed viewports so safety copy stays reachable. This is an accessibility exception to the fixed main-screen composition, not a hidden content crop.

## Materials and assets

Use the supplied CSS token file, exact teal/blue/purple/amber/red semantics and existing SVG logos. A dark continuous route ground replaces individual panel backgrounds. Teal fuel, blue route, amber caution and purple efficiency cues retain their meaning. Measurements and headings use locally hosted Barlow Condensed SemiBold; body text retains the existing sans stack. Font origin: Google Fonts repository, `ofl/barlowcondensed`; OFL license ships alongside the TTF under `public/fonts/`.

The route is explicitly schematic and not to scale. Stations/prices are fictional; telemetry, diagnostic signals and comparisons remain simulated. The later integration sprint connects telemetry, deterministic fuel/diagnostics and optional server-side Gemma without replacing this visual composition. See INTEGRATION_REPORT.md.

## Real-road map branch

The active route field now uses MapLibre and OpenFreeMap with a close tilted view, mapped building extrusions and a 2D overview. Destination selection remains a compact native header control, with Austin, Dallas, Houston and El Paso. The underlying cockpit grid, instruments, dialogs and replay controls remain. GeoJSON geometry from cached OSRM routes replaces the schematic; mapped OpenStreetMap stations replace fictional stops in the active road mode. Historical demo fixtures remain for engine regression tests. Station prices are unknown, access allowances are conservative routed loops, and truck suitability/operating status are unverified. Map source attribution must stay visible and reachable.

## Prominent stops and timed road replay

Fuel stations use 44px icon targets with persistent name labels. The map's Stations action opens all saved mapped records and exposes route-to-station through the existing detail dialog. Rerouted trips use the station as their endpoint, not an unannounced refueling purchase. Keep unknown fuel/operating data explicit. Replay duration lives in the footer's native select (10/15/20 seconds plus existing multipliers), while the vehicle marker follows road geometry on animation frames. Faster tours use a wider camera. Preserve source attribution and the existing fixed cockpit grid. Actual browser verification remains blocked by a saved localhost permission preference; do not describe these layouts as visually verified.
