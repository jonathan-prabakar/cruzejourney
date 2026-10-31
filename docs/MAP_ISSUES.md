# Map integration: ranked findings

> Current status is in [FINAL_INTEGRATION_REPORT.md](../FINAL_INTEGRATION_REPORT.md). Default Turbopack now builds successfully; the unified driver view uses real road routing and 13 sourced truck stops. The browser permission and truck-profile limitations remain. Earlier ranked findings below document the previous map pass.

Reviewed October 31, 2026. Priorities separate fixed behavior from product and verification gaps.

## Fixed in this branch

| Priority | Finding | Resolution and evidence |
| --- | --- | --- |
| P0 | MapLibre 5.24.0 had a critical attribution XSS advisory. | Upgraded to 6.16.0 and configured its ESM worker for Next/Turbopack. Production dependency audit was previously clean. |
| P1 | Vehicle icon did not have a tested, stable road heading. | It now derives clockwise-from-north heading from the outgoing road segment on each animation frame, including turns and endpoints. Unit cases cover north/east/south/west and a turn. |
| P1 | Station pins/labels collided or were hard to interpret when zoomed out; normal fuel stations were mixed in. | Replaced DOM pins with exact-coordinate GeoJSON for official Love's truck stops only. Counts cluster at overview zoom; diesel symbols and price labels appear when expanded. Overview bounds include both route and stops. Route-map tests cover clustering and station-click selection. |
| P1 | Prices and truck suitability were unknown. | Active stops are limited to Love's pages that list diesel, truck parking and DEF lanes. The UI links each official page and displays its dated Auto Diesel price snapshot and parking/DEF details. Snapshots were checked 2026-10-31; they are not live prices. |
| P1 | Low range did not automatically start a station route. | Once route safety becomes `INSUFFICIENT_RANGE`, the app makes one automatic route attempt to the current recommended confirmed truck stop. The server checks OSRM geometry and fuel reserve. User clicks on a stop still open its details and provide a manual **Route to this station** action. |
| P1 | Main's newer journey planner depended on the retired fictional station loader. | The merge connects `/journey` to the verified Love's source, retains actual coordinates in map bounds, shows dated prices/source links and leaves unsourced amenities empty. Synthetic multi-stop and amenity fixtures are isolated in tests. |
| P1 | Healthy vehicles displayed a “No active code observed” summary. | The healthy-state health card is removed; actual warnings and incomplete data remain visible. |
| P1 | Route ending could look unexplained. | The selected city is the normal destination. A successful fuel-stop reroute ends at that stop, shows a reroute notice and does not simulate refueling or continue to the city. |
| P1 | MapLibre 5.24.0 was affected by GHSA-jrc7-96c5-q579. | Upgraded to 6.16.0. See the [MapLibre advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579). |

## Remaining work, in order

1. **P1 — visual browser/WebGL verification.** A saved Chrome permission setting blocks `http://localhost:3000`, even though the user previously approved a visual check in chat. No screenshot, GPU rendering, responsive layout or browser-console review was possible. Do not retry through another browser, port, raw CDP or indirect screenshot path. Visual QA can resume after the saved setting changes.
2. **P1 — truck-safe routing.** Stops are confirmed commercial-truck facilities, but the public OSRM route uses a general driving profile. It does not enforce truck height, weight, length, hazmat, turn or access restrictions. Replace with truck-aware routing before treating routes as operational guidance.
3. **P1 — live price/availability feed.** Prices are official Love's Auto Diesel page snapshots checked 2026-10-31. They can change and are not refreshed at runtime. Pump stock, opening status and access availability are not live. Review the linked pages before a later demo or add a supported licensed feed.
4. **P2 — route and stop coverage.** The app includes 12 unique Love's locations across four selected routes, not all Texas truck stops or chains. Price maintenance is currently manual. Store truck-parking/DEF details are operator-listed, not a guarantee of current capacity.
5. **P2 — automatic reroute retry behavior.** The app attempts automatic rerouting once per selected city trip when fuel range is insufficient. If no stop is confirmed reachable, playback pauses with a visible reason. If the route service rejects the recommended stop, the user can select another listed stop manually. A coordinated multi-stop fallback could improve reliability.
6. **P2 — public routing and server sessions.** Live routes use the public OSRM demo endpoint with a 15-second timeout. Route plans and six-per-minute rate limits are process-local (32 cached plans, one-hour TTL), so they are not multi-instance storage.
7. **P2 — development dependencies.** Prior full audit results showed 16 moderate development-tool findings while `npm audit --omit=dev` was clean. Do not use `npm audit fix --force`; it proposed incompatible toolchain downgrades.
8. **P3 — estimated access allowance.** Candidate reachability uses a conservative cross-track-based leave/rejoin allowance. The final selected-stop route uses OSRM, but that initial estimate is not a surveyed entrance route.

## Verification evidence

- Merged `npm test`: **394 passed, 2 skipped** (Gemma and live OSRM are opt-in).
- `npm run typecheck` and `npm run lint` passed.
- `npm run build -- --webpack` passed for both `/` and `/journey`. The earlier default Turbopack build hit a sandbox `Operation not permitted` when its CSS processing tried to bind a local port; that build mode was not repeated during the merge.
- Map tests verify cluster source/layers and that clicking a station feature opens the selected station details.
- Road-geometry unit cases verify cardinal headings, turn direction, endpoint direction and nearest-road projection.
- A live OSRM request to the new Love's coordinates was not run in this turn; the existing mocked reroute tests pass.
- Browser visual QA is blocked by the saved browser setting described above.
- Current fuel prices and truck facility facts come from individual official pages linked in `src/data/verified-truck-stops.ts`. No live price API, fuel-stock feed, live Gemma call, vehicle connection or automatic refueling is claimed.
