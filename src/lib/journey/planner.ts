import demo from '../../data/demo-telemetry.json';
import { calculateFuelRange } from '../fuel/range';
import { assessStationReachability } from '../fuel/reachability';
import { amenitiesForRoute, stationsForRoute } from './places';
import { itineraryGeometry } from './geometry';
import type { Amenity, JourneyLeg, JourneyPlan, JourneyPlanningResult, JourneyPreferences, JourneyRoute, JourneyStation, JourneyVehicle, JourneyWaypoint } from './types';

export const JOURNEY_VEHICLE: JourneyVehicle = Object.freeze({
  ...demo.metadata.vehicle, fuelType: 'diesel', reservePercent: 10,
});
/** Conservative planning estimate; simulated driving is 7.8–8.2 MPG. */
export const PLANNING_MPG = Math.min(7.5, JOURNEY_VEHICLE.typical_mpg);
const TANK_GALLONS = JOURNEY_VEHICLE.tank_capacity_gallons;
export const DEFAULT_PREFERENCES: JourneyPreferences = {
  startingFuelPercent: 17, fuelStops: 'automatic', optimization: 'balanced',
  amenities: ['restaurant', 'restroom'], scenario: 'combined',
};
const wantedCount = { automatic: null, none: 0, one: 1, two: 2, three: 3 } as const;
const dwell: Record<Amenity['category'], number> = { restaurant: 1200, restroom: 300, coffee: 420, convenience: 300 };
interface PlannerInput { refillPolicy?: 'full' | 'route-needed'; route: JourneyRoute; preferences: JourneyPreferences; waypoints?: JourneyWaypoint[] }
interface Node { waypoint: JourneyWaypoint; name: string; position: number; access: number | null; station?: JourneyStation; amenity?: Amenity }

export function evaluateItinerary(input: PlannerInput, waypoints: readonly JourneyWaypoint[],
  stations = stationsForRoute(input.route), amenities = amenitiesForRoute(stations)): JourneyPlan {
  const { route, preferences } = input;
  const warnings: string[] = [];
  if (!['automatic', 'none', 'one', 'two', 'three'].includes(preferences.fuelStops) ||
      !['balanced', 'fastest', 'fuel-cost', 'fewer-stops'].includes(preferences.optimization) ||
      !['normal', 'low-fuel', 'engine-warning', 'combined'].includes(preferences.scenario) ||
      !Array.isArray(preferences.amenities) || preferences.amenities.length > 4 ||
      new Set(preferences.amenities).size !== preferences.amenities.length ||
      preferences.amenities.some(a => !['restaurant', 'restroom', 'coffee', 'convenience'].includes(a))) warnings.push('Journey preferences are invalid. Choose the supported options.');
  const nodes: Node[] = [];
  const ids = new Set<string>();
  if (waypoints.length > 8 || waypoints.filter(w => w.kind === 'fuel').length > 3) warnings.push('Demo limit: at most three fuel stops and eight total waypoints.');
  if (!Number.isFinite(preferences.startingFuelPercent) || preferences.startingFuelPercent < 0 || preferences.startingFuelPercent > 100) warnings.push('Starting fuel must be between 0% and 100%.');
  for (const waypoint of waypoints) {
    if (ids.has(waypoint.id)) { warnings.push('A waypoint cannot be visited twice in this bounded corridor planner.'); continue; }
    ids.add(waypoint.id);
    const station = waypoint.kind === 'fuel' ? stations.find(s => s.id === waypoint.id) : undefined;
    const amenity = waypoint.kind === 'amenity' ? amenities.find(a => a.id === waypoint.id) : undefined;
    if (!station && !amenity) { warnings.push('Unknown station or amenity: ' + waypoint.id + '. No location was invented.'); continue; }
    nodes.push({
      waypoint: { ...waypoint }, name: station?.name ?? amenity!.name,
      position: station?.distanceAlongRouteMiles ?? amenity!.distanceAlongRouteMiles,
      access: station ? station.detourMiles : amenity!.extraDistanceMiles, station, amenity,
    });
  }
  if (nodes.some((n, i) => i > 0 && n.position < nodes[i - 1].position)) warnings.push('This order requires backtracking. Reorder stops along the route; backtracking is not modeled.');
  const geometryNodes = [...nodes].sort((a, b) => a.position - b.position);
  const totalDistanceMiles = route.distanceMiles + nodes.reduce((sum, n) => sum + (n.access ?? 0), 0);
  if (nodes.some(n => n.access === null)) warnings.push('A selected stop has an unknown detour; its itinerary cannot be confirmed.');
  const legs: JourneyLeg[] = [];
  let gallons = TANK_GALLONS * preferences.startingFuelPercent / 100, current = 0, distance = 0, purchases = 0, cost: number | null = 0;
  let feasible = warnings.length === 0;
  if (feasible) {
    for (const node of [...nodes, { waypoint: { id: 'destination', kind: 'amenity' as const }, name: route.destination.name,
      position: route.distanceMiles, access: 0 } as Node]) {
      const fuel = calculateFuelRange({ tankCapacityGallons: TANK_GALLONS, fuelPercent: gallons / TANK_GALLONS * 100, mpg: PLANNING_MPG, reservePercent: 10 });
      const travel = node.position - current + node.access!;
      if (node.waypoint.id !== 'destination') {
        const candidate = node.station ?? {
          id: node.waypoint.id, name: node.name, latitude: null, longitude: null,
          distanceAlongRouteMiles: node.position, detourMiles: node.access, fuelTypes: ['diesel'],
          isAvailable: true, isSynthetic: true, pricePerGallon: null, priceSource: 'sample' as const,
        };
        const assessment = assessStationReachability({
          station: candidate, route: { currentDistanceAlongRouteMiles: current, remainingRouteMiles: route.distanceMiles - current, distanceSource: 'simulated' },
          fuel, requiredFuelType: 'diesel', tankCapacityGallons: TANK_GALLONS,
        });
        if (assessment.status !== 'REACHABLE') { warnings.push(node.name + ': ' + assessment.explanation); feasible = false; break; }
      } else if (!fuel.valid || fuel.usableRangeMiles! + 1e-8 < travel) {
        warnings.push('Destination is beyond usable planning range with the 10% tank reserve. Add a confirmed reachable refueling stop.');
        feasible = false; break;
      }
      const arrival = gallons - travel / PLANNING_MPG;
      const target = input.refillPolicy === 'route-needed' ? Math.min(TANK_GALLONS, (totalDistanceMiles - distance - travel) / PLANNING_MPG + TANK_GALLONS * 0.1 + 1) : TANK_GALLONS;
      const added = node.station ? Math.max(0, target - arrival) : 0;
      const purchaseCost = node.station ? node.station.pricePerGallon === null ? null : added * node.station.pricePerGallon : 0;
      gallons = arrival + added; purchases += added; distance += travel; current = node.position;
      cost = cost === null || purchaseCost === null ? null : cost + purchaseCost;
      legs.push({
        waypointId: node.waypoint.id, kind: node.waypoint.id === 'destination' ? 'destination' : node.waypoint.kind,
        name: node.name, baseRouteMiles: current, travelMiles: travel, cumulativeTravelMiles: distance,
        arrivalFuelGallons: arrival, departureFuelGallons: gallons, fuelAddedGallons: added, purchaseCost,
        accessMiles: node.access!, dwellSeconds: node.station ? 120 + added / 12 * 60 : node.amenity ? dwell[node.amenity.category] : 0,
      });
    }
  }
  const augmented = itineraryGeometry(route, geometryNodes.map(n => ({ baseRouteMiles: n.position, accessMiles: n.access ?? 0 })));
  const fuelStops = legs.filter(l => l.kind === 'fuel').map(leg => ({ station: stations.find(s => s.id === leg.waypointId)!, leg, refillTargetPercent: leg.departureFuelGallons / TANK_GALLONS * 100 }));
  let hash = 2166136261;
  for (const char of JSON.stringify([preferences, waypoints, input.refillPolicy ?? 'full'])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return {
    refillPolicy: input.refillPolicy ?? 'full',
    id: route.id + ':' + (hash >>> 0).toString(16),
    baseRoute: route, route: augmented, preferences: structuredClone(preferences), waypoints: waypoints.map(w => ({ ...w })), legs, fuelStops,
    amenityStops: nodes.flatMap(n => n.amenity ? [n.amenity] : []),
    feasible, warnings, totalDistanceMiles,
    durationSeconds: route.durationSeconds + nodes.reduce((s, n) => s + (n.access ?? 0) / 20 * 3600, 0) + legs.reduce((s, l) => s + l.dwellSeconds, 0),
    estimatedConsumptionGallons: feasible ? totalDistanceMiles / PLANNING_MPG : null,
    arrivalFuelPercent: feasible ? gallons / TANK_GALLONS * 100 : null, purchaseCost: feasible ? cost : null, fuelAddedGallons: purchases,
  };
}
export function calculateJourneyPlan(input: PlannerInput): JourneyPlanningResult {
  const stations = stationsForRoute(input.route), amenities = amenitiesForRoute(stations);
  const known = stations.filter(s => s.isAvailable && s.fuelTypes.includes('diesel') && s.detourMiles !== null).slice(0, 12);
  const amenityWaypoints = (input.waypoints ?? []).filter(w => w.kind === 'amenity');
  const candidates: JourneyPlan[] = [];
  const position = (w: JourneyWaypoint) => (w.kind === 'fuel' ? stations.find(s => s.id === w.id)?.distanceAlongRouteMiles : amenities.find(a => a.id === w.id)?.distanceAlongRouteMiles) ?? Infinity;
  function visit(selected: JourneyWaypoint[], next: number) {
    const ordered = [...selected, ...amenityWaypoints].sort((a, b) => position(a) - position(b) || (a.kind === 'fuel' ? -1 : 1));
    const plan = evaluateItinerary(input, ordered, stations, amenities);
    if (plan.feasible) candidates.push(plan);
    if (selected.length === 3) return;
    for (let i = next; i < known.length; i++) visit([...selected, { id: known[i].id, kind: 'fuel' }], i + 1);
  }
  visit([], 0);
  const desired = wantedCount[input.preferences.fuelStops];
  const score = (plan: JourneyPlan): number => {
    if (input.preferences.optimization === 'fuel-cost') return plan.purchaseCost ?? Number.POSITIVE_INFINITY;
    if (input.preferences.optimization === 'fastest') return plan.durationSeconds;
    if (input.preferences.optimization === 'fewer-stops') return plan.fuelStops.length * 1e6 + plan.durationSeconds;
    const amenitiesMatched = plan.fuelStops.reduce((sum, stop) => sum + input.preferences.amenities.filter(c => stop.station.amenities.includes(c)).length, 0);
    return plan.durationSeconds / 3600 + (plan.purchaseCost === null ? 5 : plan.purchaseCost / 1000) - amenitiesMatched * 0.06;
  };
  candidates.sort((a, b) => {
    const countA = a.fuelStops.length, countB = b.fuelStops.length;
    const preference = desired === null || desired === 0 ? countA - countB : Math.abs(countA - desired) - Math.abs(countB - desired);
    return preference || score(a) - score(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const recommended = candidates[0] ?? null;
  const requested = input.waypoints !== undefined ? evaluateItinerary(input, input.waypoints, stations, amenities)
    : input.preferences.fuelStops === 'none' ? evaluateItinerary(input, [], stations, amenities)
    : recommended ?? evaluateItinerary(input, [], stations, amenities);
  const count = recommended?.fuelStops.length ?? 0;
  const preferenceExplanation = !recommended ? 'No itinerary is confirmed feasible. Increase starting fuel or remove optional access stops; do not continue beyond modeled usable range.'
    : input.preferences.fuelStops === 'none' && count > 0 ? 'Your no-stop preference cannot preserve the reserve. The recommended feasible alternative adds ' + count + ' fuel stop(s).'
    : desired !== null && desired > 0 && count !== desired ? 'The requested ' + desired + '-stop preference cannot be met within the supported route. A feasible ' + count + '-stop alternative is available.'
    : desired !== null && desired > 0 ? 'Your explicit ' + desired + '-stop preference is modeled with a full refill at each stop; extra stops may not be needed for range.'
    : 'Automatic planning uses the fewest confirmed feasible fuel stops, then compares your selected priority and amenities.';
  return { requested, recommended, alternatives: candidates.filter(p => p.id !== recommended?.id).slice(0, 4),
    stations, amenities, preferenceExplanation };
}
