# Cruze FuelSense M1–M4 + Gemma integration

## Source history and isolation

Integration branch: `integration/m1-m4-gemma4`, isolated worktree under `work/cruze-integration`.
Backup reference: `backup/main-before-integration-20261031` at `98b6b112d818f98f52e8c6db312d08f09b3dcb33`.

| Source | Commit | Treatment |
| --- | --- | --- |
| M1 cockpit/branding on origin/main | `98b6b112d818f98f52e8c6db312d08f09b3dcb33` | Preserved; contains earlier M1 `497c724` and branding `ecf9448` |
| M2 telemetry | `f670f9bc7440f885a7ee6f6e99c1aad68de06e6f` | Ancestor of M3/Gemma; not replayed separately |
| M3 fuel intelligence | `0e7abf084b85462cfb6c4b36ec31204ff049affa` | Ancestor of Gemma; not replayed separately |
| Gemma core | `e53d75035bd47543343a49e1e399fb4c6ac5b5c8` | Merged once with original M2/M3 history |
| M4 diagnostic engine | No published branch/commit available | Implemented and tested in this integration sprint; not claimed as a branch merge |

The original main worktree was clean. No user changes were stashed, reset or overwritten. A normal merge of the stacked Gemma branch into the integration branch preserves its original commits. Main is updated only after the checks below pass. The integration commit can be identified from `git log --merges --oneline`; exact final hashes/push confirmation are reported in the delivery message.

## Conflicts and configuration

Add/add conflicts: `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`. Retained the Next.js app's scripts, aliases, React/Tailwind/Recharts/Lucide configuration and App Router. Added Google GenAI SDK, Vitest and React test tooling. Regenerated the npm lockfile from the reconciled manifest. Retained Next's ESLint configuration and removed the incoming standalone `eslint.config.js` duplicate. Kept an explicit engine-only `tsconfig.build.json` for reference, while the application build remains `next build`. `.env.local` remains ignored; `.env.example` is explicitly tracked.

## Shared state and actual connections

- One stable M2 provider per mounted cockpit, one `useVehicleTelemetry` subscription, timestamp-based play/pause/reset/seek and 1×/2×/5× controls. Cleanup pauses the provider and invalidates/aborts intelligence work; hook subscriptions unsubscribe. This is reusable under React Strict Mode rather than reusing disposed instances.
- `getDemoSnapshot(index)` derives current telemetry, prefix history, M3 route context, fuel intelligence and diagnostic health from the same index. The original 241-record dataset remains byte-for-byte unchanged. No sorting/filtering is applied to its playback index.
- The six instruments show M2 fuel, speed, RPM, MPG and coolant, plus M3 usable range. Raw range, total-tank reserve, planning MPG, destination safety, arrival fuel and station explanations are available in fuel/station inspections. No mock reading or forced fuel override remains on the active cockpit.
- M3 chooses compatible available reachable stops. A null recommendation renders the actual fallback warning, never the old static station. Distances/detours are modeled road context; no GPS straight-line range substitution is used.
- Diagnostic episodes are prefix-derived. Indices 160–175 form one 16-reading P0301 episode. Backward seek/reset remove future observations. Missing readings and unsupported codes remain unknown. See `VEHICLE_DIAGNOSTICS_INTEGRATION.md`.
- The original cockpit, supplied branding, map scene and fixed-screen composition remain. Synthetic GPS updates the vehicle marker; station markers use the existing fictional M3 coordinates. Map projection is display-only and is not an eligibility/distance calculation.
- Gemma receives current telemetry, route, authoritative fuel results and diagnostic findings. The model can prioritize concerns, choose actions and select only currently M3-feasible stations. The chosen feasible station can drive the displayed checkpoint. Mandatory deterministic warnings remain authoritative. Invented, stale or unreachable choices cannot win.
- Client requests send only an index. The server reconstructs all trusted context and recalculates M3; forged browser conclusions are rejected. POST requires same-origin intent, validates JSON/size/index and returns no-store responses.
- The client checks configuration once. Without a key it performs no model POST requests and builds current deterministic fallback insights locally. With configuration, the existing event controller paces requests, cancels superseded work and avoids calls on ordinary same-event ticks. A response for another timestamp is never displayed as current.
- M1's illustrative efficiency comparison remains explicitly labeled as a fixed preview, separate from current telemetry consumption/average displays. No M5 engine is implemented or supplied to Gemma.

## Verification performed

- Original branch stack: 250 tests passed; one credential-gated live test skipped.
- Final integrated suite: **318 tests passed, 1 skipped**, across 18 files (17 passing, one live-only skipped).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed; Next.js cockpit route plus dynamic `/api/intelligence` route.
- Client-import-graph test excludes server modules, key access and Google SDK from the cockpit graph. Production static-chunk scan found no `GEMINI_API_KEY`, Google SDK class or model-service endpoint markers.
- Original M2 dataset checksum/content comparison: unchanged.
- Chrome production workflows: startup at 17% fuel, real 5× play/pause updates, speed selection, P0301 seek and explanation, keyboard slider to ending, no-reachable-stop warning, backward seek clearing future episodes, reset to initial state, fallback indicator and M1 comparison preview.
- No application console errors observed. Main document equals viewport at 1440×900 and 390×844; no page overflow. Screenshots delivered separately.
- Live Gemma response was **not tested** and is **not claimed**: no key was configured. Mock-model tests cover event pacing, stale-response rejection, validated choices and mandatory warnings.

## Running and configuring AI

```sh
npm ci
npm run dev
# http://localhost:3000
npm test
npm run typecheck
npm run lint
npm run build
```

For optional live reasoning, copy `.env.example` to `.env.local`, set a private `GEMINI_API_KEY`, retain `GEMMA_MODEL=gemma-4-26b-a4b-it` (or `gemma-4-31b-it`), and restart Next.js. Never use a `NEXT_PUBLIC_` prefix or commit `.env.local`. Model IDs and thinking-level support were checked against [Google's Gemma API documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api). The SDK is server-side only. A configured key is not proof of a successful model response; source labels reflect actual results. Optional live smoke test: `npm run intelligence:live` with credentials loaded in the command environment.

## Limitations and readiness for M5

Synthetic telemetry, unverified schematic geometry, fictional stations/prices, modeled detours and provisional ranking weights remain demo assumptions. No live OBD-II, navigation, traffic integration or guarantee of safe travel. Diagnostic definitions are generic educational content; vehicle-specific evaluation is required. M4 was authored during this sprint because its reported branch was absent. Live AI awaits credentials and a real smoke test. The API is intended for a same-origin demo; production authentication/abuse controls are not supplied.

The verified integrated baseline is ready for M5 development. M5 has not begun. Its future implementation should consume the existing shared snapshot and replace the explicitly labeled M1 comparison preview, without creating another playback engine.
