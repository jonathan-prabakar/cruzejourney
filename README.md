# Cruze FuelSense

Drive Smarter. Further.

A fixed, responsive driving cockpit with integrated synthetic telemetry playback, fuel intelligence, diagnostic interpretation and optional server-side Gemma reasoning.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use Node.js 24 (the test tooling also supports Node 22.19+).

```sh
npm run build
npm run typecheck
npm run lint
```

See IMPLEMENTATION_PLAN.md for architecture, design tokens, sample calculations and the remaining milestones. Telemetry is synthetic; stations, prices and route geometry are demonstration data. Playback is functional. Gemma uses deterministic fallback without a server key.

## Project references

- [Hackathon plan](docs/Cruze_FuelSense_Hackathon_Plan.md): supplied planning reference; proposed future features are not a statement of implemented functionality.
- [Brand assets](docs/BRAND_ASSETS.md) and [original brand board](docs/original-brand-board.png): supplied visual source. Production assets are under `public/brand`; imported palette tokens are in `src/styles/brand-tokens.css`.

The asset integration changes presentation and document metadata only. Telemetry fixtures, calculations, navigation handlers, diagnostics, chart switching, and playback behavior are preserved.

## Cockpit UI

The primary scene fits the viewport without page scrolling at the tested desktop (1440×900), laptop (1280×720), and phone (390×844) sizes. There is no sidebar or tab row. Use the fuel instrument to inspect calculated range and safety reserve; select a fuel stop, health briefing, driving rhythm or run settings for on-demand details. Detailed inspections may scroll on smaller or zoomed screens. Playback supports play/pause/reset/seeking and 1×/2×/5× speeds. Barlow Condensed is self-hosted with its OFL license in `public/fonts/`.

## Integrated application

See [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md) for exact source commits, reconciled configuration, test results and limitations. One shared M2 provider drives all current measurements, M3 fuel recommendations and prefix-derived diagnostic episodes. The active UI no longer uses the M1 telemetry/station mocks. M1 comparison scenarios remain explicitly illustrative; no M5 engine is implemented.

For optional Gemma reasoning: copy `.env.example` to `.env.local`, set the server-only `GEMINI_API_KEY` and `GEMMA_MODEL`, then restart Next.js. Without a key, every deterministic feature and playback still works. A live Gemma response has not been verified in this integration.
