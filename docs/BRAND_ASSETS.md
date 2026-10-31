# Supplied Cruze FuelSense brand assets

Source: the user's `Cruze_FuelSense_Assets` bundle. The original folder is preserved. Only selected production assets are copied into this repository.

## Used by the UI

- `public/brand/logo-horizontal-color.svg` — sidebar wordmark.
- `public/brand/symbol-color.svg` — header and footer symbol.
- `public/brand/favicon.ico` and `app-icon-dark.svg` — browser icons.
- `public/brand/app-icon-dark-192.png` and `app-icon-dark-180.png` — app and Apple touch icons.
- `src/styles/brand-tokens.css` — supplied exact palette and gradients, imported by the global stylesheet. Existing semantic color aliases reference these tokens.
- `docs/original-brand-board.png` — unchanged supplied reference, retained as documentation rather than rendered as dashboard UI.

## Provenance

The supplied SVGs are editable vector interpretations of the supplied raster brand board, not pixel-identical original source artwork. Their road geometry and lettering were recreated by the asset bundle's author. No new image generation or raster editing was performed for this integration. The truck photo and UI examples remain within the original reference board; they are not independent production assets.

SVG and icon files are copied unchanged from the supplied bundle. The theme token stylesheet is also copied unchanged. Layout uses intrinsic aspect ratios and decorative symbols have empty alternative text; the main wordmark names the product for assistive technology.

## Scope

The [hackathon plan](Cruze_FuelSense_Hackathon_Plan.md) is supplied reference documentation. Its proposed future logic is not implemented by this UI asset change. Dashboard state, effects, event bindings, mock telemetry, range calculations, map behavior, diagnostics, charts and playback behavior are preserved.
