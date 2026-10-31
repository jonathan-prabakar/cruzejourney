# Cruze FuelSense driving cockpit

The direct UI brief replaces the scrolling dashboard with one fixed driving scene. The supplied wordmark, F symbol and exact palette remain authoritative. No sidebar, navigation tabs or chart tabs remain.

## Surface contract

Operate mode. Show the current simulated journey as one continuous map field with a compact checkpoint briefing and vehicle communications. Journey progress is the actual 24/80-mile fixture (30%); there are no invented rewards, competitive scores or incentives to drive faster. Game character comes from the route/checkpoint framing, instrument hierarchy and a self-hosted Barlow Condensed measurement face.

The primary screen uses four fixed grid rows: brand/journey header, flexible map field, six-instrument deck, and preview replay bar. At 1440×900, 1280×720 and 390×844, document dimensions equal the viewport. On mobile the six instruments reorganize into a compact deck and the checkpoint sits within the map scene. Labels and alignment derive from these groups rather than independent dashboard cards.

## Interaction

The fuel gauge cycles normal/low/critical previews, preserving the existing 32/12/4% fixtures and 307.2/115.2/38.4-mile calculations. Station pins and checkpoint controls inspect fictional fuel stops. Health, efficiency, alternatives and run settings open native dialog inspections. Escape dismisses, native modal focus containment applies, and explicit opener restoration returns keyboard focus after dismissal. The chart comparison uses one action button, not tabs.

The primary page does not scroll at tested viewports. Longer detail-dialog contents may scroll on small or zoomed viewports so safety copy stays reachable. This is an accessibility exception to the fixed main-screen composition, not a hidden content crop.

## Materials and assets

Use the supplied CSS token file, exact teal/blue/purple/amber/red semantics and existing SVG logos. A dark continuous route ground replaces individual panel backgrounds. Teal fuel, blue route, amber caution and purple efficiency cues retain their meaning. Measurements and headings use locally hosted Barlow Condensed SemiBold; body text retains the existing sans stack. Font origin: Google Fonts repository, `ofl/barlowcondensed`; OFL license ships alongside the TTF under `public/fonts/`.

The route is explicitly schematic and not to scale. Stations/prices are fictional; telemetry, diagnostic signals and comparisons remain simulated. No M4 engine or other backend milestone was added by this UI redesign.
