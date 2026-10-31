import type { Coordinate, JourneyRoute, JourneyLeg } from './types';
export const milesBetween = (a: Coordinate, b: Coordinate): number => {
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad, dlon = (b[0] - a[0]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};
export function cumulativeDistances(coordinates: readonly Coordinate[], totalMiles?: number): number[] {
  const result = [0];
  for (let i = 1; i < coordinates.length; i++) result.push(result[i - 1] + milesBetween(coordinates[i - 1], coordinates[i]));
  const total = result.at(-1)!;
  return totalMiles === undefined || total === 0 ? result : result.map(n => n / total * totalMiles);
}
export function positionAt(route: Pick<JourneyRoute, 'coordinates' | 'cumulativeMiles' | 'distanceMiles'>, miles: number): Coordinate {
  const target = Math.max(0, Math.min(route.distanceMiles, miles));
  let low = 0, high = route.cumulativeMiles.length - 1;
  while (low < high) { const mid = Math.floor((low + high) / 2); if (route.cumulativeMiles[mid] < target) low = mid + 1; else high = mid; }
  if (low === 0) return route.coordinates[0];
  const a = route.coordinates[low - 1], b = route.coordinates[low];
  const fraction = (target - route.cumulativeMiles[low - 1]) / (route.cumulativeMiles[low] - route.cumulativeMiles[low - 1] || 1);
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}
/** Base road geometry plus explicitly fictional full access loops before each modeled stop. */
export function itineraryGeometry(route: JourneyRoute, legs: readonly Pick<JourneyLeg, 'baseRouteMiles' | 'accessMiles'>[]): JourneyRoute {
  const coordinates: Coordinate[] = [route.coordinates[0]], cumulativeMiles = [0];
  let cursor = 1, extras = 0;
  for (const leg of legs) {
    while (cursor < route.coordinates.length && route.cumulativeMiles[cursor] < leg.baseRouteMiles) {
      coordinates.push(route.coordinates[cursor]); cumulativeMiles.push(route.cumulativeMiles[cursor] + extras); cursor++;
    }
    const anchor = positionAt(route, leg.baseRouteMiles);
    coordinates.push(anchor); cumulativeMiles.push(leg.baseRouteMiles + extras);
    if (leg.accessMiles > 0) {
      // North/south out-and-back illustration; explicitly modeled, NOT an actual service road.
      const offset: Coordinate = [anchor[0] + leg.accessMiles / (2 * 69.17 * Math.cos(anchor[1] * Math.PI / 180)), anchor[1]];
      coordinates.push(offset, anchor);
      cumulativeMiles.push(leg.baseRouteMiles + extras + leg.accessMiles / 2, leg.baseRouteMiles + extras + leg.accessMiles);
      extras += leg.accessMiles;
    }
  }
  while (cursor < route.coordinates.length) {
    coordinates.push(route.coordinates[cursor]); cumulativeMiles.push(route.cumulativeMiles[cursor] + extras); cursor++;
  }
  return { ...route, coordinates, cumulativeMiles, distanceMiles: route.distanceMiles + extras,
    provenance: extras > 0 ? 'cached-road-with-modeled-access' : route.provenance };
}
