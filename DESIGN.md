# Cruze FuelSense design

The user brief pins a dark automotive instrument environment. The dominant route schematic establishes location and the next decision; fuel intelligence stays beside it on wide screens. Six compact telemetry instruments sit above it. Diagnostics and efficiency occupy the second row, followed by disabled playback and explicit future-section placeholders.

Operate mode: drivers and evaluators scan a simulated journey. Dense labels group around large tabular measurements. Teal signals fuel and positive states, blue carries route guidance, amber cautions, red critical fuel, and purple illustrative insights. The supplied horizontal wordmark and road-shaped F symbol are used in navigation, the header and footer. These vector assets are editable interpretations of the supplied raster board, as documented by the asset bundle. App icons and favicon also use the supplied assets.

The palette is imported from the supplied `src/styles/brand-tokens.css`; existing semantic aliases point to those tokens. The sidebar uses the supplied surface gradient.

Panels have 12px corners and 1px borders, with no broad glow. Inline details avoid unnecessary interruptions; station selection uses a focused side drawer. Responsive breakpoints at 1250, 1000 and 720px reduce metrics, stack the map and fuel, and collapse the fixed navigation. Reduced motion disables smooth scrolling and transitions.

The map is explicitly schematic, northeast-oriented, labeled not to scale, with fictional fuel stops. No real station location is asserted.
