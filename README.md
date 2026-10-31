# Cruze FuelSense

Drive Smarter. Further.

Milestone 1: responsive frontend demonstration of a vehicle intelligence dashboard.

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
