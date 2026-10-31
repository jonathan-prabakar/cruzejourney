import { getDemoFuelStations } from '../fuel/stations';
import { positionAt } from './geometry';
import { roadAxisMiles } from './routes';
import type { Amenity, AmenityCategory, JourneyRoute, JourneyStation, PlacesProvider } from './types';

export function stationsForRoute(route: JourneyRoute): JourneyStation[] {
  const axisStart = roadAxisMiles(route.origin.id), axisEnd = roadAxisMiles(route.destination.id);
  const full = roadAxisMiles('austin'), span = Math.abs(axisEnd - axisStart);
  return getDemoFuelStations().flatMap((s, i) => {
    const global = s.distanceAlongRouteMiles! / 75.5 * full;
    if (global <= Math.min(axisStart, axisEnd) || global >= Math.max(axisStart, axisEnd)) return [];
    const distance = Math.abs(global - axisStart) / span * route.distanceMiles;
    const coordinate = positionAt(route, distance);
    const amenities: AmenityCategory[] = i % 3 === 0 ? ['restaurant', 'restroom', 'coffee', 'convenience'] : i % 2 === 0 ? ['restaurant', 'restroom', 'convenience'] : ['restroom', 'coffee'];
    return [{ ...s, distanceAlongRouteMiles: distance, latitude: coordinate[1], longitude: coordinate[0], coordinate, amenities }];
  }).sort((a, b) => a.distanceAlongRouteMiles! - b.distanceAlongRouteMiles!);
}
const labels: Record<AmenityCategory, string> = {
  restaurant: 'Demo Kitchen', restroom: 'Demo Rest Area', coffee: 'Demo Coffee Counter', convenience: 'Demo Provisions',
};
const extra: Record<AmenityCategory, number> = { restaurant: 0.2, restroom: 0.04, coffee: 0.08, convenience: 0.06 };
export const demoPlacesProvider: PlacesProvider = {
  nearby(station, categories): Amenity[] {
    return categories.filter(category => station.amenities.includes(category)).map(category => ({
      id: station.id + '-' + category, stationId: station.id,
      name: labels[category] + ' · ' + station.name.replace(' Demo ', ' '), category,
      coordinate: station.coordinate, distanceAlongRouteMiles: station.distanceAlongRouteMiles!,
      extraDistanceMiles: extra[category], isSynthetic: true, hours: null, rating: null, walkingMinutes: null,
    }));
  },
};
export function amenitiesForRoute(stations: readonly JourneyStation[]): Amenity[] {
  return stations.flatMap(s => demoPlacesProvider.nearby(s, ['restaurant', 'restroom', 'coffee', 'convenience']));
}
