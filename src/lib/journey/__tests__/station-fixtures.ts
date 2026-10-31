import { getDemoFuelStations } from '../../fuel/__tests__/station-fixtures';
import { positionAt } from '../geometry';
import { roadAxisMiles } from '../routes';
import truckStations from '../../vehicle/__tests__/truck-stations.json';
import type { Amenity, AmenityCategory, JourneyRoute, JourneyStation } from '../types';

/** Test-only corridor inputs for multi-stop, amenity and unknown-data engine cases. */
export function testStationsForRoute(route: JourneyRoute): JourneyStation[] {
  const axisStart = roadAxisMiles(route.origin.id), axisEnd = roadAxisMiles(route.destination.id);
  const full = roadAxisMiles('austin'), span = Math.abs(axisEnd - axisStart);
  return getDemoFuelStations().flatMap((s, i) => {
    const global = s.distanceAlongRouteMiles! / 75.5 * full;
    if (global <= Math.min(axisStart, axisEnd) || global >= Math.max(axisStart, axisEnd)) return [];
    const distance = Math.abs(global - axisStart) / span * route.distanceMiles;
    const coordinate = positionAt(route, distance);
    const amenities: AmenityCategory[] = i % 3 === 0 ? ['restaurant', 'restroom', 'coffee', 'convenience'] : i % 2 === 0 ? ['restaurant', 'restroom', 'convenience'] : ['restroom', 'coffee'];
    return [{ ...s, distanceAlongRouteMiles: distance, coordinate, amenities }];
  }).sort((a, b) => a.distanceAlongRouteMiles! - b.distanceAlongRouteMiles!);
}

export function testAmenitiesForRoute(stations: readonly JourneyStation[]): Amenity[] {
  const labels = { restaurant: 'Demo Kitchen', restroom: 'Demo Rest Area', coffee: 'Demo Coffee Counter', convenience: 'Demo Provisions' };
  const extras = { restaurant: 0.2, restroom: 0.04, coffee: 0.08, convenience: 0.06 };
  return stations.flatMap(station => station.amenities.map(category => ({
    id: station.id + '-' + category, stationId: station.id,
    name: labels[category] + ' · ' + station.name.replace(' Demo ', ' '), category,
    coordinate: station.coordinate, distanceAlongRouteMiles: station.distanceAlongRouteMiles!,
    extraDistanceMiles: extras[category], isSynthetic: true as const, hours: null, rating: null, walkingMinutes: null,
  })));
}

export function testNavigationStationsForRoute(route: JourneyRoute): JourneyStation[] {
  const start = roadAxisMiles(route.origin.id), end = roadAxisMiles(route.destination.id), full = roadAxisMiles('austin');
  const catalog = [...getDemoFuelStations(), ...truckStations.map(s => ({ id: s.id, name: s.name, latitude: null, longitude: null,
    distanceAlongRouteMiles: s.axisMiles, detourMiles: s.detour, pricePerGallon: s.price, priceSource: 'sample' as const,
    fuelTypes: ['diesel'], isAvailable: true, isSynthetic: true }))];
  return catalog.flatMap(s => {
    const global = s.distanceAlongRouteMiles! / 75.5 * full;
    if (global <= Math.min(start, end) || global >= Math.max(start, end)) return [];
    const distance = Math.abs(global - start) / Math.abs(end - start) * (route.fullDistanceMiles ?? route.distanceMiles) - (route.offsetMiles ?? 0);
    if (distance <= 0 || distance >= route.distanceMiles) return [];
    const coordinate = positionAt(route, distance);
    return [{ ...s, distanceAlongRouteMiles: distance, coordinate, latitude: coordinate[1], longitude: coordinate[0], truckAccess: 'yes' as const,
      amenities: ['restroom', 'restaurant'] as AmenityCategory[] }];
  }).sort((a, b) => a.distanceAlongRouteMiles! - b.distanceAlongRouteMiles!);
}
