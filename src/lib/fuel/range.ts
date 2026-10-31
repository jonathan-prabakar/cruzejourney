import type { FuelRangeInput, FuelRangeResult } from './types';

export const DEFAULT_RESERVE_PERCENT = 10;
export const isNonnegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** No missing readings are invented; invalid inputs return null calculations, never NaN/Infinity. */
export function calculateFuelRange(input: FuelRangeInput): FuelRangeResult {
  const reserve = input.reservePercent === undefined ? DEFAULT_RESERVE_PERCENT : input.reservePercent;
  const uncertainty = input.uncertaintyMargin === undefined ? 0 : input.uncertaintyMargin;
  const errors: string[] = [];
  if (!isNonnegativeFinite(input.tankCapacityGallons) || input.tankCapacityGallons <= 0) errors.push('Tank capacity must be finite and greater than zero');
  if (!isNonnegativeFinite(input.fuelPercent) || input.fuelPercent > 100) errors.push('Fuel percentage must be finite and between 0 and 100');
  if (!isNonnegativeFinite(input.mpg)) errors.push('Planning MPG must be finite and nonnegative');
  if (!isNonnegativeFinite(reserve) || reserve > 100) errors.push('Reserve percentage must be between 0 and 100');
  if (!isNonnegativeFinite(uncertainty) || uncertainty > 1) errors.push('Uncertainty margin must be a fraction between 0 and 1');
  const invalid = (): FuelRangeResult => ({
    valid: false, remainingGallons: null, estimatedRangeMiles: null, reserveGallons: null,
    usableRangeMiles: null, usableRangeBeforeUncertaintyMiles: null,
    planningMpg: null, reservePercent: null, uncertaintyMargin: null, errors,
  });
  if (errors.length) return invalid();
  const tank = input.tankCapacityGallons!;
  const mpg = input.mpg!;
  // Divide percentages before multiplication to avoid avoidable intermediate overflow.
  const remainingGallons = tank * (input.fuelPercent! / 100);
  const reserveGallons = tank * (reserve / 100);
  const estimatedRangeMiles = remainingGallons * mpg;
  const usableRangeBeforeUncertaintyMiles = Math.max(0, remainingGallons - reserveGallons) * mpg;
  const usableRangeMiles = usableRangeBeforeUncertaintyMiles * (1 - uncertainty);
  if (![remainingGallons, reserveGallons, estimatedRangeMiles, usableRangeBeforeUncertaintyMiles, usableRangeMiles].every(Number.isFinite)) {
    errors.push('Range calculation overflow; measurements are too large');
    return invalid();
  }
  return {
    valid: true, remainingGallons, reserveGallons, estimatedRangeMiles, usableRangeMiles,
    usableRangeBeforeUncertaintyMiles, planningMpg: mpg, reservePercent: reserve,
    uncertaintyMargin: uncertainty, errors,
  };
}
