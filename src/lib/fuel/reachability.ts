import { isNonnegativeFinite } from './range';
import { validateFuelStations } from './stations';
import type { FuelRangeResult, FuelStation, ReachabilityOptions, RouteContext, StationReachability } from './types';

export interface ReachabilityInput {
  station: FuelStation;
  route: RouteContext;
  fuel: FuelRangeResult;
  requiredFuelType: string;
  tankCapacityGallons?: number;
  options?: ReachabilityOptions;
}
export function assessStationReachability(input: ReachabilityInput): StationReachability {
  const { station, route, fuel } = input;
  const result: StationReachability = {
    station, status: 'UNKNOWN', reason: 'MISSING_DISTANCE', explanation: '',
    isBacktracking: false, routeDistanceMiles: null, requiredDistanceMiles: null, usableRangeAfterArrivalMiles: null,
    estimatedArrivalGallons: null, estimatedArrivalFuelPercent: null,
  };
  const answer = (status: StationReachability['status'], reason: StationReachability['reason'], explanation: string): StationReachability =>
    ({ ...result, status, reason, explanation });
  if (!validateFuelStations([station]).valid) return answer('UNKNOWN', 'INVALID_STATION', 'Station measurements or identity are invalid.');
  const minimumArrival = input.options?.minimumArrivalUsableRangeMiles === undefined ? 0 : input.options.minimumArrivalUsableRangeMiles;
  if (!isNonnegativeFinite(minimumArrival) || typeof input.requiredFuelType !== 'string' || !input.requiredFuelType.trim() ||
      (input.options?.allowBacktracking !== undefined && typeof input.options.allowBacktracking !== 'boolean')) {
    return answer('UNKNOWN', 'INVALID_INPUT', 'Fuel type or safety constraints are invalid.');
  }
  if (station.truckAccess === 'no') return answer('EXCLUDED', 'UNAVAILABLE', 'OpenStreetMap explicitly marks this station as unsuitable for heavy goods vehicles.');
  if (station.fuelTypes.includes('unknown')) return answer('UNKNOWN', 'INCOMPATIBLE_FUEL', 'Required fuel availability is not recorded; it is not assumed to be diesel.');
  if (!station.isAvailable) return answer('EXCLUDED', 'UNAVAILABLE', 'Station is marked unavailable.');
  if (!station.fuelTypes.some(type => type.trim().toLowerCase() === input.requiredFuelType.trim().toLowerCase())) {
    return answer('EXCLUDED', 'INCOMPATIBLE_FUEL', 'Station does not list required fuel type ' + input.requiredFuelType + '.');
  }
  if (route.distanceSource === 'unknown' || !['simulated', 'verified'].includes(route.distanceSource) ||
      !isNonnegativeFinite(route.currentDistanceAlongRouteMiles) || !isNonnegativeFinite(route.remainingRouteMiles) ||
      !isNonnegativeFinite(station.distanceAlongRouteMiles)) {
    return answer('UNKNOWN', 'MISSING_DISTANCE', 'Current route progress, remaining route distance, or station route position is unavailable.');
  }
  const delta = station.distanceAlongRouteMiles - route.currentDistanceAlongRouteMiles;
  result.isBacktracking = delta < 0;
  if (delta < 0 && !input.options?.allowBacktracking) return answer('EXCLUDED', 'BEHIND_VEHICLE', 'Station is behind the vehicle; backtracking is disabled.');
  if (delta > route.remainingRouteMiles) return answer('EXCLUDED', 'BEYOND_DESTINATION', 'Station is beyond the requested destination.');
  if (!isNonnegativeFinite(station.detourMiles)) return answer('UNKNOWN', 'MISSING_DISTANCE', 'Station detour is unknown; it is not assumed to be zero.');
  const routeDistance = Math.abs(delta);
  const required = routeDistance + station.detourMiles;
  if (!Number.isFinite(required)) return answer('UNKNOWN', 'INVALID_INPUT', 'Required distance overflowed.');
  result.routeDistanceMiles = routeDistance;
  result.requiredDistanceMiles = required;
  if (!fuel.valid || !isNonnegativeFinite(fuel.usableRangeMiles)) return answer('UNKNOWN', 'MISSING_RANGE', 'Usable planning range is unavailable.');
  const remaining = fuel.usableRangeMiles - required;
  result.usableRangeAfterArrivalMiles = remaining;
  if (isNonnegativeFinite(fuel.planningMpg) && isNonnegativeFinite(fuel.uncertaintyMargin) && fuel.uncertaintyMargin <= 1 &&
      isNonnegativeFinite(fuel.remainingGallons)) {
    const effectiveMpg = fuel.planningMpg * (1 - fuel.uncertaintyMargin);
    if (effectiveMpg > 0 || required === 0) {
      const gallons = fuel.remainingGallons - (required === 0 ? 0 : required / effectiveMpg);
      // A negative arrival quantity is not a physically achievable arrival estimate.
      if (isNonnegativeFinite(gallons)) {
        result.estimatedArrivalGallons = gallons;
        if (isNonnegativeFinite(input.tankCapacityGallons) && input.tankCapacityGallons > 0) {
          const percent = gallons / input.tankCapacityGallons * 100;
          if (Number.isFinite(percent) && percent <= 100) result.estimatedArrivalFuelPercent = percent;
        }
      }
    }
  }
  const explanation = 'Modeled travel ' + required.toFixed(1) + ' mi (' + routeDistance.toFixed(1) +
    ' route + ' + station.detourMiles.toFixed(1) + ' full detour), versus ' + fuel.usableRangeMiles.toFixed(1) +
    ' mi usable range and ' + minimumArrival.toFixed(1) + ' mi required arrival margin.';
  return remaining >= minimumArrival
    ? answer('REACHABLE', 'WITHIN_RANGE', explanation)
    : answer('UNREACHABLE', 'INSUFFICIENT_RANGE', explanation);
}
