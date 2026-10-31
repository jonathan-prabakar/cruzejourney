import demo from '../../../data/demo-telemetry.json';
import { calculateFuelRange } from '../range';
import { assessStationReachability } from '../reachability';
import type { FuelStation, RouteContext } from '../types';

export const vehicle = demo.metadata.vehicle;
export const telemetry = demo.records[0];
export const route: RouteContext = { currentDistanceAlongRouteMiles: 0, remainingRouteMiles: 75, distanceSource: 'simulated' };
export const fuel = () => calculateFuelRange({ tankCapacityGallons: 120, fuelPercent: 17, mpg: 8 });
export const station = (overrides: Partial<FuelStation> = {}): FuelStation => ({
  id: 'a', name: 'Fictional Demo A', latitude: 29.7, longitude: -98.1,
  fuelTypes: ['diesel'], pricePerGallon: 3.5, priceSource: 'sample',
  distanceAlongRouteMiles: 20, detourMiles: 1, isAvailable: true, isSynthetic: true, ...overrides,
});
export const assessment = (overrides: Partial<FuelStation> = {}) => assessStationReachability({
  station: station(overrides), route, fuel: fuel(), requiredFuelType: 'diesel', tankCapacityGallons: 120,
});
