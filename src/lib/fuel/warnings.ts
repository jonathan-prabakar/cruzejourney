import { isNonnegativeFinite } from './range';
import type { FuelLevel, FuelWarning, WarningThresholds } from './types';

export const DEFAULT_WARNING_THRESHOLDS: Readonly<WarningThresholds> = Object.freeze({ lowPercent: 20, criticalPercent: 10 });
export function validThresholds(thresholds: WarningThresholds): boolean {
  return isNonnegativeFinite(thresholds.criticalPercent) && isNonnegativeFinite(thresholds.lowPercent) &&
    thresholds.criticalPercent < thresholds.lowPercent && thresholds.lowPercent <= 100;
}
export interface FuelWarningInput {
  fuelPercent: number | null;
  usableRangeMiles: number | null;
  /** undefined: no route requested; null: requested distance is unavailable. */
  requiredDistanceMiles?: number | null;
  reservePercent?: number | null;
  thresholds?: Partial<WarningThresholds>;
}
export function evaluateFuelWarning(input: FuelWarningInput): FuelWarning {
  const thresholds = { ...DEFAULT_WARNING_THRESHOLDS, ...input.thresholds };
  const fuelKnown = isNonnegativeFinite(input.fuelPercent) && input.fuelPercent <= 100;
  const rangeKnown = isNonnegativeFinite(input.usableRangeMiles);
  const distanceKnown = isNonnegativeFinite(input.requiredDistanceMiles);
  const fuelStatus: FuelLevel = !fuelKnown || !validThresholds(thresholds) ? 'UNKNOWN'
    : input.fuelPercent! <= thresholds.criticalPercent ? 'CRITICAL'
    : input.fuelPercent! <= thresholds.lowPercent ? 'LOW' : 'NORMAL';
  const routeSafety = input.requiredDistanceMiles === undefined ? 'NOT_REQUESTED'
    : !rangeKnown || !distanceKnown ? 'UNKNOWN'
    : input.usableRangeMiles! < input.requiredDistanceMiles! ? 'INSUFFICIENT_RANGE' : 'SUFFICIENT';
  const level = routeSafety === 'INSUFFICIENT_RANGE' ? 'INSUFFICIENT_RANGE'
    : fuelStatus === 'UNKNOWN' || !rangeKnown || routeSafety === 'UNKNOWN' ? 'UNKNOWN' : fuelStatus;
  const descriptions = {
    NORMAL: ['Fuel above low threshold', 'Fuel is above the configured low-fuel threshold.', 'Monitor fuel and reassess as conditions change.'],
    LOW: ['Low fuel', 'Fuel is at or below ' + thresholds.lowPercent + '% and above ' + thresholds.criticalPercent + '%.', 'Plan a confirmed reachable compatible refueling stop.'],
    CRITICAL: ['Critical fuel', 'Fuel is at or below the configured ' + thresholds.criticalPercent + '% critical threshold.', 'Prioritize a safe refueling plan; do not exceed the modeled usable range.'],
    INSUFFICIENT_RANGE: ['Insufficient planning range', 'Usable range ' + (rangeKnown ? input.usableRangeMiles!.toFixed(1) : 'unknown') + ' mi is less than the requested ' + (distanceKnown ? input.requiredDistanceMiles!.toFixed(1) : 'unknown') + ' mi.', 'Refuel at a confirmed reachable stop before continuing the requested route; if none is confirmed, stop safely and seek assistance.'],
    UNKNOWN: ['Fuel safety unknown', 'Required measurements, route distance, or warning configuration are missing or invalid.', 'Verify the missing data before relying on a fuel plan.'],
  } as const;
  const [title, explanation, recommendedAction] = descriptions[level];
  return {
    level, fuelStatus, routeSafety,
    severity: fuelStatus === 'CRITICAL' || level === 'INSUFFICIENT_RANGE' ? 'critical' : level === 'LOW' ? 'warning' : level === 'UNKNOWN' ? 'unknown' : 'info',
    title, explanation, recommendedAction,
    measurements: {
      fuelPercent: fuelKnown ? input.fuelPercent : null,
      usableRangeMiles: rangeKnown ? input.usableRangeMiles : null,
      requiredDistanceMiles: distanceKnown ? input.requiredDistanceMiles! : null,
      reservePercent: isNonnegativeFinite(input.reservePercent) && input.reservePercent <= 100 ? input.reservePercent : null,
    },
  };
}
