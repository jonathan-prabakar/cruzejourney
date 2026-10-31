# Cruze FuelSense — Milestone 3 integration

M3 is a pure TypeScript fuel intelligence engine layered on the M2 telemetry contract. It adds no dependencies or UI changes. Import from `src/lib/fuel`. The M2 playback engine, React hook, dataset, and existing tests remain unchanged.

## Architecture and API

- `types.ts`: station, range, warning, reachability, scoring, and integration contracts.
- `range.ts`: `calculateFuelRange` and reserve/uncertainty validation.
- `warnings.ts`: `evaluateFuelWarning`; independent percentage status and route safety.
- `stations.ts`: station JSON parsing/validation and fictional demo-data factory.
- `reachability.ts`: `assessStationReachability` for one candidate.
- `ranking.ts`: `rankReachableStations`, scoring configuration/validation.
- `intelligence.ts`: `calculateFuelIntelligence`, the dashboard integration boundary.
- `demo.ts`: `getDemoRouteContext(recordIndex)`, specifically for the bundled M2 trip.
- `src/data/demo-fuel-stations.json`: ten fictional demonstration stations and provenance metadata.

All calculation functions are deterministic, synchronous, and leave inputs unchanged. No timers, network calls, React dependencies, routing engine, diagnostic interpretation, or global mutable session state are introduced.

### Main input/output

`calculateFuelIntelligence({ telemetry, vehicle, route, stations, requiredFuelType, config? })` accepts M2 `VehicleTelemetry | null` and `VehicleProfile`.

`route` is:

```ts
{
  currentDistanceAlongRouteMiles: number | null;
  remainingRouteMiles: number | null;
  distanceSource: 'simulated' | 'verified' | 'unknown';
}
```

All route-relative positions must use the same origin, direction and route. Pass null/unknown when measurements are unavailable. No GPS distance is substituted for road distance.

The result includes:

- `fuel`: valid flag, remainingGallons, estimatedRangeMiles, reserveGallons, usableRangeBeforeUncertaintyMiles, usableRangeMiles, planningMpg, reservePercent, uncertaintyMargin, errors.
- `status`: combined level, independent fuelStatus and routeSafety, severity, title, explanation, recommendedAction, measurements.
- `recommendation`: station or null, full recommended result or null, ranked alternatives, all assessments, calculated explanation and structured fallback warnings.
- `errors`: invalid configuration/measurements/station dataset details.
- `assumptions`: MPG source, distance source, estimate flag, conservative detour policy.

Invalid range inputs produce null calculated measurements and errors; never NaN/Infinity or invented fuel values. Invalid station datasets/configuration block all recommendations. Missing route distances produce UNKNOWN assessments, rather than fabricated distances. No stations produces a null recommendation.

## Range formulas and assumptions

Units: US gallons, miles, miles per US gallon, percent of total tank capacity; prices are USD per US gallon.

```text
remainingGallons = tankCapacityGallons × (fuelPercent / 100)
estimatedRangeMiles = remainingGallons × planningMpg
reserveGallons = tankCapacityGallons × (reservePercent / 100)
usableRangeBeforeUncertaintyMiles = max(0, remainingGallons − reserveGallons) × planningMpg
usableRangeMiles = usableRangeBeforeUncertaintyMiles × (1 − uncertaintyMargin)
```

Default reserve is **10% of total tank capacity**, not 10% of remaining fuel. The reserve is subtracted once. Default uncertainty margin is zero; an optional fraction in [0,1] explicitly reduces only the post-reserve usable range. It is a conservative efficiency allowance, not a calibrated probability or confidence interval.

The default planning MPG is `vehicle.typical_mpg`, which is 8 for the fictional truck. The current instantaneous `telemetry.mpg` is not automatically treated as a prediction. Pass `config.planningMpg` for a deliberately chosen estimate, such as a separately computed conservative average. An explicit null or invalid MPG is rejected rather than silently replaced. Zero MPG is valid and yields zero range.

Example: 120-gallon tank, 17% fuel, 8 MPG, 10% reserve:

| Measurement | Derived value |
| --- | --- |
| Remaining fuel | 20.4 gal |
| Raw range | 163.2 mi |
| Reserve | 12 gal |
| Usable range | 67.2 mi |
| Usable range with optional 0.1 uncertainty | 60.48 mi |

Capacity must be positive and finite; MPG nonnegative and finite; fuel/reserve in [0,100]; uncertainty in [0,1]. Overflow is rejected. Computation preserves precision; round only for display.

Range predictions are **estimates, not guarantees**. Vehicle load, grade, traffic, weather, sensor quality, and future economy are not modeled. The tool does not replace vehicle manufacturer warnings or driver judgment.

## Warning states

Defaults: NORMAL >20%, LOW >10% and ≤20%, CRITICAL ≤10%. Configure via `config.thresholds: { lowPercent, criticalPercent }`, with 0 ≤ critical < low ≤100.

`fuelStatus` tracks NORMAL/LOW/CRITICAL/UNKNOWN separately from `routeSafety` (SUFFICIENT/INSUFFICIENT_RANGE/UNKNOWN/NOT_REQUESTED). Insufficiency means usable range is strictly less than requested distance; equality is sufficient under the model.

The combined `level` is INSUFFICIENT_RANGE when the requested route cannot be completed; otherwise UNKNOWN if required data/configuration is invalid or unavailable; otherwise the percentage-based status. Known critical fuel retains critical severity even with unknown route data. A normal percentage never hides an insufficient-range condition. Show both independent fields when useful.

The integrated engine evaluates the remaining destination distance. To assess a requested stop separately, call `evaluateFuelWarning` with that stop's modeled required distance. For this standalone function only, undefined required distance means no route requested; null means a requested distance is unknown.

There are no notifications or UI alerts in this milestone.

## Station data, source, and validation

All ten bundled station names/identities are **fictional**, all coordinates/route positions/detours are **synthetic**, and all listed prices are **fictional sample values**, with no relationship to live businesses or current fuel prices. The M2 vehicle telemetry remains synthetic.

Stations span the approximate San Antonio → New Braunfels → San Marcos → Kyle → Austin corridor. Positions are illustrations, not verified station locations or actual road-network measurements. Static availability flags are demonstration scenarios, not live status. One station is unavailable, one lacks diesel, one has unknown price, and one has unknown detour to demonstrate safe filtering.

```ts
interface FuelStation {
  id: string;                         // unique nonempty ID
  name: string;
  latitude: number | null;            // decimal degrees
  longitude: number | null;
  fuelTypes: string[];                // e.g. ['diesel']; comparison ignores case/outer spaces
  pricePerGallon: number | null;      // positive USD/US gal, null explicitly unknown
  priceSource: 'sample' | 'verified';
  distanceAlongRouteMiles: number | null;
  detourMiles: number | null;         // full extra leave-and-rejoin distance
  isAvailable: boolean;
  isSynthetic: boolean;
}
```

`getDemoFuelStations()` returns independent validated copies. `validateFuelStations(unknown)` or `parseFuelStationsJson(text)` accepts an **array**, not the metadata envelope; for the bundled file pass its `stations` property. Returns valid, stations, errors with original row index/field/message. Valid rows are available for inspection, but the integrated engine rejects a station set containing any invalid rows or duplicate IDs. Null optional measurements are permitted; omitted fields and nonfinite/negative distances/prices are invalid. Empty arrays are valid.

## Reachability and arrival estimates

1. Validate candidate and safety inputs.
2. Exclude unavailable stations and incompatible fuels.
3. Require known current progress, remaining route distance, and station route position from a simulated or verified source.
4. Exclude behind-vehicle stations by default. `config.reachability.allowBacktracking: true` permits them and uses absolute backward route distance. Backtracking earns no forward-progress score.
5. Exclude stations beyond the requested destination.
6. Require a known detour; null is UNKNOWN, never zero.
7. Required travel = absolute route offset + full supplied detour.
8. Confirm reachability only if `usableRangeMiles − requiredTravel >= minimumArrivalUsableRangeMiles` (default margin 0).

`minimumArrivalUsableRangeMiles` is an optional extra post-reserve arrival buffer, not a second subtraction of the tank reserve. It must be nonnegative/finite.

Statuses are REACHABLE, UNREACHABLE, EXCLUDED or UNKNOWN, with structured reason, explanation, route distance, required distance, leftover usable range, and arrival fuel where derivable. Missing/invalid range cannot confirm reachability. Zero usable range allows only a zero-travel colocated stop with zero arrival margin.

**Conservative detour policy:** detourMiles denotes total extra leave-and-rejoin mileage. The engine charges the full detour before arrival because the dataset has no separate one-way access geometry. This may underestimate arrival fuel. Convert a replacement dataset's detour definitions explicitly; do not insert a one-way value while calling it full detour.

Arrival estimate uses `effectiveMpg = planningMpg × (1 − uncertaintyMargin)`, then `arrivalGallons = remainingGallons − requiredTravel / effectiveMpg`. This matches the efficiency allowance used for usable range and leaves the reserve intact at a confirmed reachable stop. Negative/uncomputable arrivals return null. At zero travel, no travel fuel is consumed. Arrival fuel percent is derived only when tank capacity is available. An unreachable stop may have a positive raw arrival estimate below reserve; that never makes it eligible.

## Deterministic ranking

Hard filters first: compatible fuel, availability, known distances, confirmed reachability including arrival margin. Unreachable/unknown/excluded candidates cannot win at any price.

Default scoring weights are provisional **demonstration parameters**, not scientifically validated optimization:

| Component | Weight | Normalized score (higher is better) |
| --- | --- | --- |
| Price | 0.40 | clamp((6 − price) / (6 − 2), 0, 1); null price explicitly scores 0 |
| Detour | 0.30 | clamp(1 − detourMiles / 10, 0, 1) |
| Safety | 0.20 | clamp(usableRangeAfterArrival / usableRange, 0, 1); zero range scores 0 |
| Progress | 0.10 | clamp(forwardRouteDistance / remainingRouteMiles, 0, 1); zero remaining distance or backtracking scores 0 |

`score = sum(normalizedComponent × normalizedWeight)`. Weights must be finite, nonnegative and have a positive finite sum; they are normalized by their sum. Fixed price/detour scales keep pairwise results independent of adding unrelated candidates. Equal scores use ascending station ID (code-point comparison), independent of input ordering.

Unknown price is explicitly identified by `score.missingPrice` and explanation; it is not free fuel. Null detours cannot be ranked. Known prices outside the price scale are clamped. Unknown price can still win via other explicit factors, but always receives the worst price score.

Configure `config.ranking` with partial weights, priceFloorPerGallon, priceCeilingPerGallon, detourScaleMiles. Floor must be nonnegative, ceiling > floor, detour scale positive. Fuel safety is a hard eligibility constraint before cost; within safely eligible candidates, the provisional weights balance price, detour, remaining buffer and progress. Increase the safety weight or minimum arrival margin to prefer stronger buffers.

The recommended result and each alternative include reachability, score breakdown, estimated arrival fuel, and an explanation generated from those measurements. The top-level status supplies relevant fuel/destination warnings even when a station is recommended.

## Demonstrated scenarios

At route mile 0, 75 modeled miles remaining, 120-gallon truck, 8 MPG, 10% reserve, default weights and fictional demo stations:

| Fuel | Percentage status | Usable range | Destination safety | Recommendation |
| --- | --- | --- | --- | --- |
| 30% | NORMAL | 192 mi | SUFFICIENT | demo-09, South Austin Demo Energy |
| 17% | LOW | 67.2 mi | INSUFFICIENT_RANGE | demo-03, Guadalupe Demo Truck Stop |
| 9% | CRITICAL | 0 mi | INSUFFICIENT_RANGE | None confirmed reachable |

At 17%, demo-03 requires 25 route miles + 0.6 modeled full detour = **25.6 miles**. Fictional sample price is **$3.55/gal**, leftover usable range is **41.6 miles**, and estimated arrival fuel is **17.2 gallons (14.33%)**. Its score is approximately **0.6841** under the default model. These are derived from inputs and tested, not hardcoded choices. The actual M2 initial reading is 17%; the 30% and 9% at origin scenarios are explicit isolated input variations for testing, not modifications to the trip dataset.

If no station is confirmed reachable, recommendation.station/recommended are null and alternatives is empty. Structured warnings explain insufficient range, unknown data, unavailable/incompatible stations, route exclusions or invalid inputs as applicable. No station is fabricated. Do not suggest continuing beyond modeled usable range; stop safely and seek assistance when needed. The engine does not plan successive refueling stops or simulate fuel purchases.

## Dashboard integration (Milestone 1)

Use the existing hook and compute derived intelligence, without changing the provider:

```tsx
import { useMemo } from 'react';
import { useVehicleTelemetry } from './src/hooks/useVehicleTelemetry';
import {
  calculateFuelIntelligence, getDemoFuelStations, getDemoRouteContext,
} from './src/lib/fuel';
import demo from './src/data/demo-telemetry.json';

// In the client composition root, alongside the existing stable telemetry provider:
const stations = getDemoFuelStations();
const config = { reservePercent: 10, uncertaintyMargin: 0 };

function DashboardData() {
  const { telemetry, playback } = useVehicleTelemetry(provider); // provider owned by your app
  const result = useMemo(() => calculateFuelIntelligence({
    telemetry,
    vehicle: demo.metadata.vehicle,
    route: getDemoRouteContext(playback.index),
    stations,
    requiredFuelType: 'diesel',
    config,
  }), [telemetry, playback.index]);

  // Bind existing components to these values:
  // result.fuel.remainingGallons / estimatedRangeMiles / usableRangeMiles
  // result.status.title / explanation / recommendedAction / fuelStatus / routeSafety
  // result.recommendation.station / recommended?.score / alternatives
  // Null = unavailable, not zero. Show reserve, MPG assumption and sample-data labels.
  return null;
}
```

Adapt imports/provider to the dashboard's composition root. The provider's index must correspond exactly to the unchanged bundled M2 dataset when using getDemoRouteContext. For replacement datasets, sorting/filtering, or a different route, supply separately validated current route progress/remaining miles instead. The helper returns unknown for invalid indices and never estimates road progress from GPS.

Integration checklist:

1. Bring over only src/lib/fuel, src/data/demo-fuel-stations.json and this guide on top of M2.
2. Reuse your stable M2 provider, hook and vehicle profile; this milestone adds no dependencies or config changes.
3. Pass the truck's required fuel type explicitly. M2 VehicleProfile is unchanged and does not encode fuel type.
4. Compute intelligence when telemetry/route/config change; memoize if useful.
5. Bind current UI displays to returned measurements. Show null as unavailable and retain separate fuel/route warning conditions.
6. Show reserve and MPG assumptions, sample price/synthetic source labels, and modeled detour wording.
7. Show the null-recommendation warning and reasons; never fall back to an unsafe station.
8. Verify normal, low, critical and missing-data cases; run checks below.

## Replacing demo stations and distances

Use a licensed, verified station source; preserve source attribution and freshness in the owning application. Populate the FuelStation contract with truthful isSynthetic/priceSource flags. Verified price is an assertion made by the caller, not something this library verifies or refreshes; use null when a price is unavailable or stale. Availability is also caller-supplied. Do not label sample values verified.

Obtain route-relative progress and station distances from a consistent route-aware source. Convert detour units/definition to full extra mileage. Supply null for unknown measurements. Call validateFuelStations, handle all errors, and pass only a deliberately accepted dataset. The library adds no live APIs, paid map calls, road routing or price verification.

## Verification and known limitations

Run the existing repository tooling (Node 22.19+ recommended):

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

The test suite includes the unchanged 49 M2 tests plus range/boundary/invalid-value checks, warning independence, station validation and reachability, conservative arrival fuel, ranking/tie/unknown-price tests, three fuel scenarios, and confirmation/reserve invariants across all 241 M2 readings. Build emits the existing bundler-oriented TypeScript library into dist; no web dashboard is built.

Limitations: all demo telemetry/stations/prices/detours are simulated; route geometry is unverified. This is a single-stop heuristic with provisional weights, fixed MPG and static availability, not a validated fleet optimizer. No weather/load/traffic forecast, fuel-type price differentiation per station, station capacity/vehicle-access checks, data freshness verification, successive-stop planning, or manufacturer-specific reserve policy is modeled. Range and arrival estimates do not guarantee actual travel. Unknown data is surfaced explicitly. Existing M2 development-tool audit findings are unchanged; this milestone adds no packages.

Branch verification: 174 automated tests pass (125 M3 tests plus all 49 unchanged M2 tests). TypeScript validation, ESLint, the library build, and Git whitespace checks pass.
