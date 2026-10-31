import { verifiedTruckStops } from '@/data/verified-truck-stops';
import { geometryDistances, nearestRoutePosition } from '../integration/road-geometry';
import type { Amenity, JourneyRoute, JourneyStation, PlacesProvider } from './types';

export function stationsForRoute(route: JourneyRoute): JourneyStation[] {
  const coordinates = route.coordinates.map(([longitude, latitude]) => [longitude, latitude]);
  const cumulative = geometryDistances(coordinates);
  const measured = cumulative.at(-1)!;
  return verifiedTruckStops.filter(s => s.routeIds.includes('austin')).flatMap(s => {
    const coordinate = [s.longitude!, s.latitude!] as const;
    const position = nearestRoutePosition(coordinates, cumulative, coordinate);
    const offsetMiles = position.distanceFromRouteMeters / 1609.344;
    // Bounded corridor coverage; access is an estimate, not a routed entrance.
    if (offsetMiles > 20) return [];
    return [{ ...s, coordinate, distanceAlongRouteMiles: position.distanceAlongMeters / measured * route.distanceMiles,
      detourMiles: Math.max(2, 1.5 + 2.6 * offsetMiles), amenities: [] }];
  }).sort((a, b) => a.distanceAlongRouteMiles! - b.distanceAlongRouteMiles!);
}
// Nearby businesses and their access routes have not been sourced yet.
export const verifiedPlacesProvider: PlacesProvider = {
  nearby: () => [],
};
export function amenitiesForRoute(stations: readonly JourneyStation[], provider: PlacesProvider = verifiedPlacesProvider): Amenity[] {
  return stations.flatMap(s => provider.nearby(s, ['restaurant', 'restroom', 'coffee', 'convenience']));
}
