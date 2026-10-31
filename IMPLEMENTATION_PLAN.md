# Cruze FuelSense implementation

## Milestones

| Milestone                |   Time | Scope                                                          |
| ------------------------ | -----: | -------------------------------------------------------------- |
| M1 — Complete UI/UX      | 45 min | Dashboard sections, branding, typed mock data, UI interactions |
| M2 — Dataset Integration | 35 min | Timestamped telemetry loading and functional playback          |
| M3 — Fuel Intelligence   | 55 min | Range estimation, alerts, station reachability and ranking     |
| M4 — Vehicle Diagnostics | 35 min | Events, code interpretation and warning states                 |
| M5 — Efficiency Insights | 30 min | Consumption trends and simulated driving comparisons           |
| M6 — Testing & Demo      | 40 min | Integration, QA and presentation                               |

Only M1 is implemented. Time allocations are the brief's estimates, not measured implementation time.

## Setup

Node.js 20.9+ required. Run `npm install`, then `npm run dev` and open http://localhost:3000. Run `npm run build`, `npm run typecheck`, and `npm run lint` for checks. `npm start` serves a production build.

## Architecture

Next.js App Router serves `src/app/page.tsx`. `src/components/dashboard.tsx` owns navigation, fuel state previews, diagnostic expansion and station drawer. `route-map.tsx` is a responsive SVG schematic; no tile requests, keys or invented geographic coordinates. `efficiency.tsx` renders Recharts and comparison switching. Global CSS includes Tailwind and exact brand tokens. No external image or font downloads at runtime.

`src/lib/mock-data.ts` is the replacement boundary: vehicle, telemetry, route, stations, recommendation, diagnostic events, efficiency history, and driving scenarios. `FuelState`, `Station`, and `DiagnosticEvent` explicitly type variable records; the other exports have inferred TypeScript types. UI-only state does not mutate stored records.

## Consistency

120 gallons × 32% = 38.4 gallons; at 8 MPG, range is 307.2 mi. Low preview: 12%, 14.4 gal, 115.2 mi. Critical: 4%, 4.8 gal, 38.4 mi. Range excludes reserve and real-world conditions. Journey is 80 mi, 24 mi elapsed and 56 mi remaining. Simulated trip use is 3 gal for 24 mi = 8 MPG. The efficiency trend is +12.7% from the first 7.1 MPG sample to 8.0. Modeled 80 mi comparison: 12.5 gal at 6.4 MPG vs 10 gal at 8 MPG, a 2.5 gal / 20% illustrative difference. No real-world savings claimed.

## Design tokens

Primary teal `#00D1A7`; secondary blue `#3B82F6`; accent purple `#8B5CF6`; warning amber `#F59E0B`; critical red `#EF4444`; background `#0A0F1C`; surface `#1A2233`; secondary text `#94A3B8`; primary text `#F8FAFC`; border `#2B3648`.
Gradients: teal→blue, blue→purple, background→surface, all at 135 degrees. Stored as CSS custom properties. Gradients used selectively; brighter tints on dark surfaces improve small-label contrast.

## Future integration

M2 replaces telemetry/history exports with timestamp-selected records. Playback is disabled; speed selection only previews the preference and changes no clock. M3 supplies computed station recommendations and real route geometry through typed props. M4 supplies engine-specific diagnostic interpretation; current P0301 content is illustrative. M5 replaces mock chart series and comparison inputs. No backend, prediction algorithm, AI, authentication, OBD-II, or dataset engine is present.

## UI behavior

Section navigation is real and mobile navigation collapses. Fuel previews update gauge, gallons and range consistently. Station markers and rows open a dismissible detail drawer. Diagnostics expand inline. Efficiency tabs switch charts. Trip history and settings show explicit visual placeholders.

## Verification status — 2026-10-31

- `npm ci` completed successfully after disk space became available. `package-lock.json` records resolved dependencies.
- `npm run build` passed (Next.js 16.4.3 production build, static route generation and integrated TypeScript check).
- `npm run typecheck` passed separately.
- `npm run lint` passed with no warnings after naming the PostCSS config export.
- Prettier parsed/formatted TypeScript, TSX, CSS and configuration files. `git diff --check` passed.
- Chrome checked at 1440px desktop and 390px mobile CSS widths. No horizontal document overflow at either width. All sections rendered.
- Verified mobile navigation, normal/low/critical previews (307.2/115.2/38.4 mi), station drawer opening/closing, Tab access to the return button, diagnostic details, and efficiency chart switching.
- No application console errors observed. Unrelated browser-extension warnings were present.
- Desktop screenshot covers the full dashboard; mobile screenshot covers the top viewport. Mobile below-fold interactions were checked in the DOM but were not all visually reviewed.
- Independent final review: pass for desktop screenshot, mobile top viewport and source fixes. No claim of exhaustive device, browser or assistive-technology testing.
- Mechanical design scan found a width transition (removed) and a system-font warning (accepted for an offline-safe dashboard; custom typography is a future refinement).
- Initial dependency attempts failed on npm cache permission and low disk space. Session-created temporary caches were removed; existing user files preserved.

## Known limitations

Schematic map rather than a geographic tile map. Stations, prices, telemetry, diagnostics and analytics are fictional or simulated. Playback remains disabled, preferences/history are explicit placeholders. No future-milestone engine, dataset integration, AI, backend or inference implemented. Exact contrast ratios and assistive-technology behavior were not independently measured.
