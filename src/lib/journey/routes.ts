import cached from '../../data/journey/corridor-road-routes.json';
import dallas from '../../data/road-routes/dallas.json';
import houston from '../../data/road-routes/houston.json';
import elPaso from '../../data/road-routes/el-paso.json';
import { destinationDefinitions } from '../integration/routes';
import { cumulativeDistances } from './geometry';
import type { Coordinate, JourneyLocation, JourneyRoute, RouteProvider } from './types';

export const DEMO_LOCATIONS: readonly JourneyLocation[] = [
  { id: 'san-antonio', name: 'San Antonio', subtitle: 'Texas · downtown demo endpoint', coordinate: [-98.4936, 29.4241] },
  { id: 'new-braunfels', name: 'New Braunfels', subtitle: 'Texas · corridor demo endpoint', coordinate: [-98.126, 29.703] },
  { id: 'san-marcos', name: 'San Marcos', subtitle: 'Texas · corridor demo endpoint', coordinate: [-97.942, 29.883] },
  { id: 'kyle', name: 'Kyle', subtitle: 'Texas · corridor demo endpoint', coordinate: [-97.842, 30.006] },
  { id: 'austin', name: 'Austin', subtitle: 'Texas · downtown demo endpoint', coordinate: [-97.7431, 30.2672] },
];
const cityRoads = { dallas, houston, 'el-paso': elPaso };
export const DRIVING_LOCATIONS: readonly JourneyLocation[] = [...DEMO_LOCATIONS,
  ...Object.keys(cityRoads).map(id => {
    const definition = destinationDefinitions[id as keyof typeof cityRoads];
    return { id, name: definition.destination, subtitle: 'Texas · cached route from San Antonio',
      coordinate: [definition.end[1], definition.end[0]] as const };
  }),
];
export function validateEndpoints(originId: string, destinationId: string): string | null {
  if (!DRIVING_LOCATIONS.some(l => l.id === originId) || !DRIVING_LOCATIONS.some(l => l.id === destinationId)) return 'Select both locations from the supported suggestions. Typed addresses are not geocoded.';
  return originId === destinationId ? 'Choose a destination different from your starting location.' : null;
}
export function swapEndpoints(originId: string, destinationId: string): [string, string] { return [destinationId, originId]; }
export function buildCuratedRoute(originId: string, destinationId: string): JourneyRoute {
  const error = validateEndpoints(originId, destinationId);
  if (error) throw new Error(error);
  if (originId === 'san-antonio' && destinationId in cityRoads) {
    const road = cityRoads[destinationId as keyof typeof cityRoads];
    const coordinates = road.geometry.coordinates as [number, number][];
    const distanceMiles = road.distanceMeters / 1609.344;
    return { id: originId + '--' + destinationId, origin: DEMO_LOCATIONS[0],
      destination: DRIVING_LOCATIONS.find(l => l.id === destinationId)!, coordinates,
      cumulativeMiles: cumulativeDistances(coordinates, distanceMiles), distanceMiles,
      durationSeconds: road.durationSeconds, provider: 'cached-osrm', provenance: 'cached-road',
      attribution: '© OpenStreetMap contributors · OSRM driving profile' };
  }
  const from = DEMO_LOCATIONS.findIndex(l => l.id === originId), to = DEMO_LOCATIONS.findIndex(l => l.id === destinationId);
  if (from < 0 || to < 0) throw new Error('This cached road connection is unavailable. Dallas, Houston and El Paso support departures from San Antonio.');
  const direction = to > from ? 1 : -1;
  const coordinates: Coordinate[] = [], cumulativeMiles: number[] = [];
  let distanceMiles = 0, durationSeconds = 0;
  for (let i = from; i !== to; i += direction) {
    const leg = cached.legs.find(l => l.originId === DEMO_LOCATIONS[i].id && l.destinationId === DEMO_LOCATIONS[i + direction].id);
    if (!leg) throw new Error('The offline road route is unavailable. Choose another supported corridor pair.');
    const points = leg.coordinates as [number, number][];
    const distances = cumulativeDistances(points, leg.distanceMiles);
    points.forEach((p, index) => {
      if (coordinates.length && index === 0 && p[0] === coordinates.at(-1)![0] && p[1] === coordinates.at(-1)![1]) return;
      coordinates.push(p); cumulativeMiles.push(distanceMiles + distances[index]);
    });
    distanceMiles += leg.distanceMiles; durationSeconds += leg.durationSeconds;
  }
  return {
    id: originId + '--' + destinationId, origin: DEMO_LOCATIONS[from], destination: DEMO_LOCATIONS[to],
    coordinates, cumulativeMiles, distanceMiles, durationSeconds, provider: 'cached-osrm',
    provenance: 'cached-road', attribution: cached.metadata.attribution,
  };
}
export const curatedRouteProvider: RouteProvider = {
  search: query => DRIVING_LOCATIONS.filter(l => (l.name + ' Texas').toLowerCase().includes(query.trim().toLowerCase())),
  async route(originId, destinationId, signal) {
    if (signal?.aborted) throw new Error('Route request cancelled.');
    return buildCuratedRoute(originId, destinationId);
  },
};
export function roadAxisMiles(locationId: string): number {
  return locationId === DEMO_LOCATIONS[0].id ? 0 : buildCuratedRoute(DEMO_LOCATIONS[0].id, locationId).distanceMiles;
}

/** Validate a replacement provider's result before a route can enter planning/simulation. */
export async function requestJourneyRoute(provider: RouteProvider, origin: string, destination: string, signal?: AbortSignal): Promise<JourneyRoute> {
  const route = await provider.route(origin, destination, signal);
  if (signal?.aborted) throw new Error('Route request cancelled.');
  if (!route || route.origin.id !== origin || route.destination.id !== destination ||
      route.coordinates.length < 2 || route.coordinates.length > 20000 || !Number.isFinite(route.distanceMiles) || route.distanceMiles <= 0 ||
      !Number.isFinite(route.durationSeconds) || route.durationSeconds <= 0 ||
      route.cumulativeMiles.length !== route.coordinates.length ||
      route.cumulativeMiles[0] !== 0 || Math.abs(route.cumulativeMiles.at(-1)! - route.distanceMiles) > 0.001 ||
      route.coordinates.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) ||
      route.cumulativeMiles.some((n, i) => !Number.isFinite(n) || n < 0 || (i > 0 && n < route.cumulativeMiles[i - 1]))) {
    throw new Error('The routing provider returned invalid geometry or travel measurements.');
  }
  return route;
}
