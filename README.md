# Cruze Journey

**Drive Smarter. Further.**

Video Demo Link: https://youtu.be/ojO7sdBFloQ

Fuel-aware truck journeys on real roads, with simulated vehicle telemetry, verified truck-stop locations, explicit refueling events, and optional Gemma 4 advice.

## Open the live demo

### [Launch Cruze Journey → https://cruzejourney.vercel.app/](https://cruzejourney.vercel.app/)

Judges can start with the hosted demo. No local installation or personal API key is needed for the deterministic simulation. Map tiles and road routing require an internet connection.

## Judge walkthrough: San Antonio → Austin

1. **Open the live demo.** The map, vehicle instruments, destination controls, and Demo Playback bar are on the main screen.
2. **Choose your journey.** Keep **Point A: San Antonio** and **Point B: Austin**. If you edit either field, choose a city from its suggestions; arbitrary typed addresses are not geocoded.
3. **Click Start Drive.** Wait for **Routing…** to finish. When fuel planning requires a stop, the app validates a road route through that stop before starting playback.
4. **Watch the drive.** The vehicle arrow follows the road and faces its direction. Speed, fuel, usable range, RPM, MPG, trip distance, and the map alert follow the same simulated vehicle session.
5. **Try a fast tour.** In the **Playback speed** selector at the bottom, choose **15-second run**. This resets the current drive and starts an accelerated replay. **10-second run**, **20-second run**, and **1× / 2× / 5×** are also available.
6. **Observe the events.** Fuel decreases during driving. An observed diagnostic event can produce an engine warning. At the selected fuel stop, the event label shows **Refueling · engine off** and added gallons; the simulation then continues to the original destination and ends at **Arrived**.
7. **Pause or inspect history.** Use the pause/play icons and the seek slider to examine different readings. **Reset simulation** restores the current drive's original departure state and removes its later simulated purchases. Reload the page for a completely fresh demo connection.

The initial fuel reading comes from the synthetic dataset. There are no driver controls for changing fuel, GPS, RPM, or diagnostic values.

### Inspect a station and preview a reroute

1. Pause early in the drive, or reset it before inspecting stops.
2. Click a station marker, or open **Truck stops** using the map's fuel-pump button. Select **TA New Braunfels #0232** for the San Antonio–Austin example.
3. Inspect the diesel price, estimated purchase, route distance, detour allowance, and **Official station details and current prices** link. The displayed prices are dated snapshots.
4. Click **Review detour**. Playback pauses while the server obtains an actual road preview for the current vehicle reading.
5. Choose **Decline** to keep the current route, or **Accept detour** to apply the still-current preview. Selecting a station alone does not change the route.
6. Click the play icon (**Play simulation**) to continue. A failed or stale request keeps the current fuel and trip state and displays a notice.

Use **3D / 2D**, **Follow**, and **Route** on the map to change the view. Buildings appear where the map source supplies them. Zoomed-out station groups display a count; zoom in to separate their locations.

### Check Gemma and deterministic fallback

1. Open the gear button, **Developer diagnostics**.
2. Read the **Intelligence**, **Model**, and **API** fields. **Gemma 4 active** appears only after a successful, validated model response.
3. Use **Request reassessment** if you want another assessment. A live response can take several seconds.
4. If the key is missing, the service is unavailable, or a response fails validation, the app keeps deterministic fuel and diagnostic advice. Core simulation controls remain available.

Configuration readiness alone is not proof of live inference. Judges do not need to supply a key; the deployment owner configures it on the server.

## Supported journeys

| Locations | Supported directions |
| --- | --- |
| San Antonio, New Braunfels, San Marcos, Kyle, Austin | Any two different cities within this group, in either direction. |
| Dallas, Houston, El Paso | Departures from San Antonio to each of these destinations. |

These are **23 supported directed road connections**. Other combinations show an unavailable-route notice instead of generating a connector. Changing destinations preserves the current vehicle readings; if the chosen origin differs from the reported GPS, the preview identifies a future simulated departure.

## Run locally

### 1. Install prerequisites

Use **Node.js 24.x**, npm, and Git.

### 2. Clone main and install dependencies

```sh
git clone --branch main https://github.com/jonathan-prabakar/cruzejourney.git
cd cruzejourney
npm ci
```

### 3. Start the development server

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the same judge walkthrough above. The app can run in deterministic fallback without an AI key. No Google Maps or paid map API key is required.

### 4. Optional: enable live Gemma locally

Create `.env.local` at the repository root using `.env.example` as a template. Preserve any existing local configuration. Set:

```env
GEMINI_API_KEY=replace_with_your_server_key
GEMMA_MODEL=gemma-4-26b-a4b-it
```

Replace the placeholder, then restart the development server. `GEMMA_MODEL` is optional and defaults to the value shown. Keep the key server-only: never use a `NEXT_PUBLIC_` prefix or commit `.env.local`.

### 5. Run a production build locally

Stop the development server first, then run:

```sh
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Configure the Vercel deployment

For the project serving [cruzejourney.vercel.app](https://cruzejourney.vercel.app/):

1. Open the Vercel project and its **Environment Variables** settings.
2. Add **`GEMINI_API_KEY`** with the server key and select the **Production** environment. Add Preview separately if you want AI in preview deployments.
3. Optionally add **`GEMMA_MODEL=gemma-4-26b-a4b-it`**.
4. Save the variables and redeploy the project. Changes apply to new deployments; see [Vercel's environment-variable guide](https://vercel.com/docs/environment-variables/managing-environment-variables).
5. Open the deployed app, start the San Antonio → Austin demo, and inspect **Developer diagnostics** for a validated **Gemma 4 active** response. If it falls back, check the displayed API status and the server logs.

Do not put the actual key in this README, source code, browser settings, or Git commits.

## Automated checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The final integration recorded **440 passing tests**, lint, TypeScript, the default production build, a production-server launch, and a separate live OSRM route/refueling check. Browser visual checks and fresh live Gemma inference were not performed in that integration environment; see the [final integration report](FINAL_INTEGRATION_REPORT.md).

Optional browser checks require Chromium and internet access. Stop an existing development server first; the test configuration starts its server on port 3003.

```sh
npx playwright install chromium
npm run test:e2e
```

Ordinary browser tests use mocked routing and model responses. Explicit live Gemma checks require a configured server key and use API quota:

```sh
npm run intelligence:live
npm run intelligence:live:browser
```

A skipped live check does not establish a successful API connection.

## What is real, and what is simulated?

- **Real map and locations:** MapLibre/OpenFreeMap, cached OSRM road geometry, live OSRM fuel-route requests, and 13 operator-sourced truck stops: 12 Love's locations plus TA New Braunfels #0232. Every station links its official source.
- **Dated prices:** Published diesel prices were checked on **October 31, 2026**. They are not a live price feed; current pump stock and operating status are unverified.
- **Simulated vehicle:** GPS playback, speed, fuel consumption, RPM, diagnostics, refueling, and purchases. No physical OBD/ELD vehicle is connected.
- **Routing limits:** OSRM uses a general driving profile; truck height, weight, and legal restrictions are not enforced. Range, arrival, and purchase estimates are demonstration calculations.
- **Unavailable capabilities:** Arbitrary-address routing, live traffic, a live amenity directory, and the M5B driving-efficiency engine. Instant MPG is shown without inventing an efficiency score.

## Technical references

- [Final integration report](FINAL_INTEGRATION_REPORT.md): branch audit, architecture, verification, and remaining limits.
- [Product context](PRODUCT.md) and [design context](DESIGN.md): current application scope and interface.
- [Gemma integration](GEMMA4_LIVE_INTEGRATION.md): structured decisions, server configuration, and validation.
- [Real-map handoff](docs/REAL_WORLD_MAPS.md): map provenance and earlier implementation notes.
- [Brand assets](public/brand/README.md): the supplied Cruze Journey visual assets.
