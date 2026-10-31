import { verifiedTruckStops } from '@/data/verified-truck-stops';
import { geometryDistances, nearestRoutePosition } from '../integration/road-geometry';
import { buildCuratedRoute } from './routes';
import type { Amenity, JourneyRoute, JourneyStation, PlacesProvider } from './types';

export function stationsForRoute(route: JourneyRoute): JourneyStation[] {
  const fullRoute = route.sourceRoute ?? (route.offsetMiles ? buildCuratedRoute(route.origin.id, route.destination.id) : route);
  const coordinates = fullRoute.coordinates.map(([longitude, latitude]) => [longitude, latitude]);
  const cumulative = geometryDistances(coordinates);
  const measured = cumulative.at(-1)!;
  const corridor = ['dallas', 'houston', 'el-paso'].includes(route.destination.id)
    ? route.destination.id as 'dallas' | 'houston' | 'el-paso' : 'austin';
  return verifiedTruckStops.filter(s => s.routeIds.includes(corridor)).flatMap(s => {
    const coordinate = [s.longitude!, s.latitude!] as const;
    const position = nearestRoutePosition(coordinates, cumulative, coordinate);
    const offsetMiles = position.distanceFromRouteMeters / 1609.344;
    // Bounded corridor coverage; access is an estimate, not a routed entrance.
    const distance = route.routingStationId === s.id ? route.routingStationDistanceMiles! - (route.offsetMiles ?? 0)
      : position.distanceAlongMeters / measured * fullRoute.distanceMiles - (route.offsetMiles ?? 0);
    if (offsetMiles > 20 || distance < -1e-6 || distance > route.distanceMiles + 1e-6) return [];
    return [{ ...s, coordinate, distanceAlongRouteMiles: Math.max(0, distance),
      detourMiles: route.routingStationId === s.id ? 0 : Math.max(2, 1.5 + 2.6 * offsetMiles), amenities: [] }];
  }).sort((a, b) => a.distanceAlongRouteMiles! - b.distanceAlongRouteMiles!);
}
// Nearby businesses and their access routes have not been sourced yet.
export const verifiedPlacesProvider: PlacesProvider = {
  nearby: () => [],
};
export function amenitiesForRoute(stations: readonly JourneyStation[], provider: PlacesProvider = verifiedPlacesProvider): Amenity[] {
  return stations.flatMap(s => provider.nearby(s, ['restaurant', 'restroom', 'coffee', 'convenience']));
}
