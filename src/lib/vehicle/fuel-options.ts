import { calculateFuelIntelligence } from '../fuel/intelligence';
import { evaluateItinerary, JOURNEY_VEHICLE, PLANNING_MPG } from '../journey/planner';
import { positionAt } from '../journey/geometry';
import type { JourneyPlan, JourneyPlanningResult, JourneyRoute, JourneyStation, SimulationFrame } from '../journey/types';

export function remainingRoad(route: JourneyRoute, distance: number): JourneyRoute {
  const offset = Math.max(0, Math.min(distance, route.distanceMiles));
  if (offset <= 1e-8) return route;
  const start = positionAt(route, offset);
  const indices = route.cumulativeMiles.flatMap((m, i) => m > offset ? [i] : []);
  return { ...route, id: route.id + ':from:' + offset.toFixed(6),
    origin: { ...route.origin, name: 'Current position', coordinate: start },
    coordinates: [start, ...indices.map(i => route.coordinates[i])],
    cumulativeMiles: [0, ...indices.map(i => route.cumulativeMiles[i] - offset)],
    distanceMiles: route.distanceMiles - offset, durationSeconds: route.durationSeconds * (1 - offset / route.distanceMiles),
    fullDistanceMiles: route.fullDistanceMiles ?? route.distanceMiles, offsetMiles: (route.offsetMiles ?? 0) + offset };
}
export interface FuelOption {
  station: JourneyStation; plan: JourneyPlan; distanceMiles: number; detourMiles: number;
  gallons: number; purchaseCost: number | null; arrivalFuelPercent: number | null;
}
export function fuelOptions(planning: JourneyPlanningResult, frame: SimulationFrame) {
  const mpg = frame.phase === 'driving' && frame.telemetry.mpg > 0 ? Math.min(PLANNING_MPG, frame.telemetry.mpg) : planning.requested.planningMpg ?? PLANNING_MPG;
  const roadRemaining = Math.max(0, planning.requested.baseRoute.distanceMiles - frame.baseRouteMiles);
  const fuel = calculateFuelIntelligence({
    telemetry: frame.telemetry, vehicle: JOURNEY_VEHICLE,
    route: { currentDistanceAlongRouteMiles: frame.baseRouteMiles, remainingRouteMiles: roadRemaining, distanceSource: 'simulated' },
    stations: planning.stations, requiredFuelType: 'diesel', config: { planningMpg: mpg, reservePercent: 10 },
  });
  const needed = fuel.fuel.usableRangeMiles !== null && fuel.fuel.usableRangeMiles + 1e-7 < roadRemaining;
  const route = remainingRoad(planning.requested.baseRoute, frame.baseRouteMiles);
  const options: FuelOption[] = [];
  if (route.distanceMiles > 0.001) for (const assessment of fuel.recommendation.assessments) {
    if (assessment.status !== 'REACHABLE' || !assessment.routeDistanceMiles || assessment.routeDistanceMiles <= 1e-6) continue;
    const station = planning.stations.find(s => s.id === assessment.station.id)!;
    const plan = evaluateItinerary({
      route, planningMpg: mpg, refillPolicy: 'route-needed',
      preferences: { ...planning.requested.preferences, startingFuelPercent: frame.telemetry.fuel_percent },
    }, [{ id: station.id, kind: 'fuel' }]);
    if (plan.feasible) options.push({ station, plan, distanceMiles: assessment.routeDistanceMiles,
      detourMiles: station.detourMiles!, gallons: plan.fuelAddedGallons, purchaseCost: plan.purchaseCost, arrivalFuelPercent: plan.arrivalFuelPercent });
  }
  options.sort((a,b) => (a.purchaseCost ?? Infinity) - (b.purchaseCost ?? Infinity) || a.detourMiles - b.detourMiles || a.station.id.localeCompare(b.station.id));
  return { fuel, needed, options, recommended: needed ? options.find(o => o.purchaseCost !== null) ?? options[0] ?? null : null, planningMpg: mpg };
}
