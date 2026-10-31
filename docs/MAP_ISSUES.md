# Map integration: ranked findings

Reviewed October 31, 2026. These priorities distinguish confirmed defects, verification gaps and product/data limitations.

## Fixed in this branch

| Priority | Finding | Resolution and evidence |
| --- | --- | --- |
| P0 | MapLibre 5.24.0 was affected by critical attribution XSS advisory GHSA-jrc7-96c5-q579. | Upgraded to 6.16.0 and configured its ESM worker using the official Next/Turbopack pattern. Build emits the hashed worker asset. Production dependency audit reports zero vulnerabilities. No exploitation was observed. |
| P1 | Vehicle marker jumped between sparse telemetry coordinates. | Read-only continuous playback clock plus animation-frame positioning along actual road geometry. Pause, seek, reset and speed changes share the provider clock; obsolete frames are cancelled. |
| P1 | No station reroute existed. | Validated same-origin server endpoint requests an OSRM route from the current reading to a selected OSM station. Routes become the actual simulation geometry/distance; fuel is conserved, previous diagnostics are retained, and the stop ends the replay. Old trip remains intact on failure. |
| P1 | Hardcoded scenario indexes could exceed shortened station-route datasets. | Diagnostic seek resolves the signal's actual index; ending seek uses `total - 1`. Unavailable diagnostic scenarios are disabled. |
| P1 | Fictional station locations remained in older runtime imports. | Deleted fictional station JSON, old M1 map/station exports and synthetic corridor-location generation. Application/default snapshots now use real mapped station records. Numeric test fixtures have null GPS coordinates and are test-only. |
| P2 | Station markers were small and hard to find. | 44px targets, larger fuel icons, persistent station names, recommendation contrast, and a map Stations icon opening the complete saved station list. Browser visual QA remains outstanding. |
| P2 | Long replay could not be demonstrated quickly. | Full-run 10/15/20-second choices alongside 1×/2×/5×. Selecting a timed run resets and starts it. Provider tests verify completion, interpolation, pause and disposal. |

MapLibre advisory: https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579

## Remaining work, in order

1. **P1 — browser/WebGL and responsive verification before release.** A saved browser permission setting blocks `localhost:3000`, even after the user explicitly approved a new attempt in chat. No actual screenshots, GPU-render checks, desktop/mobile layout checks or browser-console audit were possible. Change the saved setting before retrying; do not bypass through another browser, port or raw protocol. Check station readability/collisions, controls and attribution, all destinations, station rerouting, and 10/15/20-second motion at 1440×900, 1280×720 and 390×844. This is a verification gap, not a claim that a rendering defect was observed.
2. **P1 for multi-instance production — route sessions need shared persistence.** New station routes are stored in a bounded process-local map (32 plans, one-hour TTL). A restart, eviction or request reaching another server instance can lose the plan. The client falls back for AI errors and routing reports an expired session, but this is a demo architecture. Use shared storage before scaling beyond one process. The six-new-route-requests-per-minute guard is also per process; add a shared limiter for public scale.
3. **P2 — public routing service reliability.** Live station routing requires internet and the public OSRM demo endpoint, with a 15-second timeout. Initial city routes remain bundled; routing failures preserve the paused old trip and show an error. Move to a supported/self-hosted routing provider for production. No API key is currently required.
4. **P2 — truck suitability and station data completeness.** General OSRM driving routes do not enforce truck dimensions/weights. OSM station tags may be stale or missing; operation, opening hours, prices and stock are unverified. Diesel is not inferred when absent, and mapped `hgv=no` blocks routing/recommendation. The route list is all saved corridor records, not every gas station in Texas. El Paso has only four selected records. Improve entrance-aware truck routing and coverage as a separate data integration.
5. **P2 — development dependencies.** Full `npm audit` still reports 16 moderate development-tool findings, propagated through minimatch/ESLint tooling. Production-only audit is clean. The audit suggests incompatible downgrades for parts of the chain; do not run `npm audit fix --force`. Plan compatible toolchain updates and rerun lint/tests/build.
6. **P3 — cached station access allowance.** Default city-route feasibility conservatively charges an entire local access loop, not the exact additional detour. On a selected station route, that station is the destination with zero additional detour; other stations' new-route distances become unknown instead of retaining incorrect old-corridor measurements.

## Verification evidence

- 340 tests passed; two opt-in checks skipped in the default suite (Gemma and live OSRM).
- Explicit `RUN_OSRM_LIVE=1 npx vitest run src/lib/integration/__tests__/rerouting.test.ts`: five checks passed, including an actual public OSRM road route to the mapped Sam's Club.
- TypeScript, ESLint and production build passed. Build emitted the MapLibre 6 worker asset.
- `npm audit --omit=dev`: zero vulnerabilities.
- No live Gemma inference was performed and no actual refueling, live vehicle data, live traffic or verified station availability is claimed.
