# Cruze FuelSense

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User specified Next.js App Router, React, TypeScript, Tailwind CSS, Lucide and Recharts.

## Product Purpose

A hackathon vehicle-intelligence extension for Cruze Maps: fuel monitoring, station recommendations, diagnostics, and efficiency insights.

## Users

Hackathon evaluators and drivers exploring a simulated freight-truck journey. Driver audience is inferred from the brief; no production driving use is claimed.

## Capabilities and Constraints

The integrated application uses M2 synthetic telemetry playback, deterministic M3 fuel recommendations and educational diagnostics, plus optional server-side Gemma decision support. No live vehicle, real OBD-II, authentication or database. Four San Antonio road journeys use selected real Love's truck stops with official Auto Diesel price snapshots checked 2026-10-31. Vehicle readings, traffic, station availability and truck-specific navigation remain simulated or unavailable. M5A is available at `/journey` with a bounded I-35 corridor planner, modeled refills and deterministic intelligence; it uses the same verified station source and leaves unsourced amenity coverage empty.

## Brand Commitments

Cruze FuelSense. Drive Smarter. Further. Premium dark automotive dashboard. Flowing-road F logo, authored SVG when no supplied asset exists. Exact palette in the user brief.

## Evidence on Hand

User-provided milestone brief. Repository initially contained only README.md; no logo or reference image.

## Accessibility & Inclusion

Keyboard controls, visible focus, responsive layouts, reduced motion, readable contrast.

## Added reference material

`docs/Cruze_FuelSense_Hackathon_Plan.md` is supplied planning documentation, not authorization to implement future features in the UI-only asset task. Supplied logo, icon, token and brand-board assets now inform presentation; their origin is recorded in `docs/BRAND_ASSETS.md`. Existing functional scope is unchanged.

## Current interface commitment

The user explicitly requested a fixed, lightly gamified driving interface with no sidebar or tabs. Preserve existing functionality and brand assets while presenting the primary experience as one cockpit. Long explanations remain accessible through detail inspections. The attached M4 diagnostic-engine prompt is separate context; this UI task does not implement or merge that engine.

## Real-road simulation

The real-map branch adds four San Antonio departures: Austin, Dallas, Houston and El Paso. MapLibre/OpenFreeMap render real roads and available 3D buildings. Cached OSRM road routes and a curated list of 12 official Love's truck stops support the simulation. Stops list truck parking, DEF lanes and diesel; per-gallon prices are dated operator-page snapshots rather than live data. Vehicle readings, fuel consumption, diagnostics and driving progress remain simulated. This is not live traffic, live station availability or truck-specific routing.
