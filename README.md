# Cruze FuelSense

Drive Smarter. Further.

A fixed, responsive driving cockpit for the Milestone 1 vehicle-intelligence demonstration.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Requires Node.js 20.9 or later.

```sh
npm run build
npm run typecheck
npm run lint
```

See IMPLEMENTATION_PLAN.md for architecture, design tokens, sample calculations and the remaining milestones. All telemetry, stations and analytics are simulated. Playback controls are a disabled preview.

## Project references

- [Hackathon plan](docs/Cruze_FuelSense_Hackathon_Plan.md): supplied planning reference; proposed future features are not a statement of implemented functionality.
- [Brand assets](docs/BRAND_ASSETS.md) and [original brand board](docs/original-brand-board.png): supplied visual source. Production assets are under `public/brand`; imported palette tokens are in `src/styles/brand-tokens.css`.

The asset integration changes presentation and document metadata only. Telemetry fixtures, calculations, navigation handlers, diagnostics, chart switching, and playback behavior are preserved.

## Cockpit UI

The primary scene fits the viewport without page scrolling at the tested desktop (1440×900), laptop (1280×720), and phone (390×844) sizes. There is no sidebar or tab row. Use the fuel instrument to cycle preview states; select a fuel stop, health briefing, driving rhythm or run settings for on-demand details. Detailed inspections may scroll on smaller or zoomed screens. Replay remains disabled. Barlow Condensed is self-hosted with its OFL license in `public/fonts/`.
