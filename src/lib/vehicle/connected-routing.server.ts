import { replayConnectedJourneys, type JourneySelector } from './connected';
import { resolveConnectedRoadRoute, storeConnectedRoadPlan, matchesRoadHistory } from './road-plan-store.server';
import { fuelOptions } from './fuel-options';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../journey/planner';
import { cumulativeDistances, milesBetween } from '../journey/geometry';
import { geometryDistances, pointAtProgress } from '../integration/road-geometry';
import { RoutingError } from '../integration/rerouting.server';
import type { JourneyRoute } from '../journey/types';

const scope = globalThis as typeof globalThis & { cruzeConnectedRoutingRate?: { start: number; count: number }; cruzeRoadHydrationRate?: { start: number; count: number } };
/** Only canonical server readings and operator-sourced stops may enter the router. */
export async function createConnectedStationRoute(journeys: readonly JourneySelector[], stationId: string, options: { rehydrating?: boolean; signal?: AbortSignal } = {}) {
  if (journeys.length >= 16) throw new RoutingError('Demo history limit reached. Start a new connection.');
  const current = replayConnectedJourneys(journeys, resolveConnectedRoadRoute);
  const station = current.planning.stations.find(s => s.id === stationId && !s.isSynthetic && s.truckAccess === 'yes');
  if (!station || current.frame.phase === 'fuel-stop') throw new RoutingError('Choose a verified truck stop outside an active refueling event.');
  const comparison = fuelOptions(current.planning, current.frame);
  const base = current.planning.requested.baseRoute;
  const start = current.frame.phase === 'ready' ? base.coordinates[0]
    : [current.frame.telemetry.longitude!, current.frame.telemetry.latitude!] as const;
  const end = base.coordinates.at(-1)!;
  if (!options.rehydrating) {
    const rate = scope.cruzeConnectedRoutingRate;
    if (!rate || Date.now() - rate.start > 60000) scope.cruzeConnectedRoutingRate = { start: Date.now(), count: 0 };
    if (scope.cruzeConnectedRoutingRate!.count++ >= 6) throw new RoutingError('Routing limit reached. Wait a minute and try again.', 429);
  }
  let response: Response;
  try {
    response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${station.longitude},${station.latitude};${end[0]},${end[1]}?overview=full&geometries=geojson&steps=false&radiuses=100;100;100`, {
      cache: 'no-store', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { 'User-Agent': 'CruzeJourney-Hackathon/1.0' },
    });
  } catch { throw new RoutingError('Road routing timed out. The current drive is preserved.', 503); }
  if (!response.ok) throw new RoutingError('Road routing is unavailable. The current drive is preserved.', 503);
  const text = await response.text();
  if (text.length > 3000000) throw new RoutingError('Road response exceeded its size limit.', 502);
  let payload;
  try { payload = JSON.parse(text); } catch { throw new RoutingError('Invalid road response.', 502); }
  const road = payload.routes?.[0], points = road?.geometry?.coordinates;
  if (payload.code !== 'Ok' || !Array.isArray(points) || points.length < 2 || points.length > 50000 ||
    points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) ||
    !Number.isFinite(road.distance) || road.distance <= 1 || road.distance > 2000000 || !Number.isFinite(road.duration) || road.duration <= 0 ||
    !Array.isArray(road.legs) || road.legs.length !== 2 || road.legs.some((l: { distance: number }) => !Number.isFinite(l.distance) || l.distance < 0) ||
    !Array.isArray(payload.waypoints) || payload.waypoints.length !== 3 || payload.waypoints.some((w: { distance: number }) => !Number.isFinite(w.distance) || w.distance > 100))
    throw new RoutingError('A road entrance for this stop could not be confirmed.', 422);
  const measuredDistances = geometryDistances(points), measured = measuredDistances.at(-1)!;
  if (Math.abs(measured - road.distance) / road.distance > .05 || milesBetween(start, points[0]) > .063 || milesBetween(end, points.at(-1)!) > .063)
    throw new RoutingError('Road geometry and mileage do not agree.', 502);
  if (Math.abs(road.legs[0].distance + road.legs[1].distance - road.distance) > 10 ||
    milesBetween([station.longitude!, station.latitude!], pointAtProgress(points, measuredDistances, road.legs[0].distance / road.distance)) > .063)
    throw new RoutingError('The road route does not reach the selected station entrance.', 422);
  const stationMiles = road.legs[0].distance / 1609.344;
  if (stationMiles > (comparison.fuel.fuel.usableRangeMiles ?? 0)) throw new RoutingError('This road route exceeds usable fuel range. Choose a closer stop.', 422);
  const route: JourneyRoute = { ...base, id: base.id + ':road:' + stationId, origin: { ...base.origin, name: 'Current position', coordinate: start },
    coordinates: points, cumulativeMiles: cumulativeDistances(points, road.distance / 1609.344), distanceMiles: road.distance / 1609.344,
    durationSeconds: road.duration, provider: 'osrm', provenance: 'routed-road', sourceRoute: undefined, offsetMiles: undefined, fullDistanceMiles: undefined,
    routingStationId: stationId, routingStationDistanceMiles: stationMiles };
  const planning = calculateJourneyPlan({ route, planningMpg: comparison.planningMpg, refillPolicy: 'route-needed',
    preferences: { ...DEFAULT_PREFERENCES, startingFuelPercent: current.frame.telemetry.fuel_percent, amenities: [] }, waypoints: [{ kind: 'fuel', id: stationId }] });
  if (!planning.requested.feasible) throw new RoutingError('The road itinerary cannot preserve the fuel reserve.', 422);
  return storeConnectedRoadPlan(route, stationId, journeys);
}

/** Rebuild missing content-addressed routes after Vercel function isolation/cold starts.
 * If OSRM geometry changes, reject the historical token instead of inventing a new past. */
export async function hydrateConnectedRoadPlans(journeys: readonly JourneySelector[], signal?: AbortSignal) {
  if (!Array.isArray(journeys) || !journeys.length || journeys.length > 16) throw new RoutingError('Invalid drive history.');
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  let charged = false;
  for (let index = 0; index < journeys.length; index++) {
    const selector = journeys[index];
    if (!selector || typeof selector !== 'object') throw new RoutingError('Invalid drive selector.');
    if (!selector.roadRouteId) continue;
    const prior = journeys.slice(0, index);
    if (!selector.stationId || typeof selector.roadRouteId !== 'string' || !matchesRoadHistory(selector.roadRouteId, selector.stationId, prior))
      throw new RoutingError('Road route does not match this drive.');
    try { resolveConnectedRoadRoute(selector.roadRouteId, prior, selector.stationId); continue; } catch { /* Cold cache: verify by reconstruction. */ }
    if (!charged) {
      const rate = scope.cruzeRoadHydrationRate;
      if (!rate || Date.now() - rate.start > 60000) scope.cruzeRoadHydrationRate = { start: Date.now(), count: 0 };
      if (scope.cruzeRoadHydrationRate!.count++ >= 6) throw new RoutingError('Road verification limit reached.', 429);
      charged = true;
    }
    deadline.throwIfAborted();
    const restored = await createConnectedStationRoute(prior, selector.stationId, { rehydrating: true, signal: deadline });
    if (restored.id !== selector.roadRouteId) throw new RoutingError('Road data changed. Plan this drive again.', 409);
  }
}
