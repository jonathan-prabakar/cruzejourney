import { calculateFuelRange, isNonnegativeFinite } from './range';
import { assessStationReachability } from './reachability';
import { rankReachableStations, resolveRankingConfig, validRankingConfig } from './ranking';
import { validateFuelStations } from './stations';
import { DEFAULT_WARNING_THRESHOLDS, evaluateFuelWarning, validThresholds } from './warnings';
import type { FuelIntelligenceInput, FuelIntelligenceResult, RecommendationWarning, StationReachability } from './types';

function fallbackWarnings(assessments: readonly StationReachability[]): RecommendationWarning[] {
  const grouped = new Map<RecommendationWarning['code'], number>();
  for (const a of assessments) {
    if (a.status === 'REACHABLE') continue;
    const code = a.status === 'UNKNOWN' ? 'UNKNOWN_DATA'
      : a.reason === 'INSUFFICIENT_RANGE' ? 'INSUFFICIENT_RANGE'
      : a.reason === 'UNAVAILABLE' ? 'UNAVAILABLE'
      : a.reason === 'INCOMPATIBLE_FUEL' ? 'INCOMPATIBLE_FUEL' : 'EXCLUDED';
    grouped.set(code, (grouped.get(code) ?? 0) + 1);
  }
  return [...grouped].map(([code, count]) => ({
    code, count,
    explanation: code === 'UNKNOWN_DATA' ? count + ' station(s) have unknown reachability because required model inputs are missing or invalid.'
      : code === 'INSUFFICIENT_RANGE' ? count + ' station(s) exceed usable range or the required arrival margin.'
      : code === 'UNAVAILABLE' ? count + ' station(s) are unavailable.'
      : code === 'INCOMPATIBLE_FUEL' ? count + ' station(s) do not list the required fuel.'
      : count + ' station(s) are excluded by route-position rules.',
  }));
}

/** Pure integration boundary: accepts M2 records/profile; never changes playback or UI. */
export function calculateFuelIntelligence(input: FuelIntelligenceInput): FuelIntelligenceResult {
  const config = input.config ?? {};
  const configuredMpg = config.planningMpg !== undefined;
  const fuel = calculateFuelRange({
    tankCapacityGallons: input.vehicle.tank_capacity_gallons,
    fuelPercent: input.telemetry?.fuel_percent ?? null,
    mpg: configuredMpg ? config.planningMpg! : input.vehicle.typical_mpg,
    reservePercent: config.reservePercent,
    uncertaintyMargin: config.uncertaintyMargin,
  });
  const errors = [...fuel.errors];
  if (!validThresholds({ ...DEFAULT_WARNING_THRESHOLDS, ...config.thresholds })) errors.push('Warning thresholds require 0 <= critical < low <= 100');
  if (!validRankingConfig(resolveRankingConfig(config.ranking))) errors.push('Ranking weights or normalization scales are invalid');
  if (!isNonnegativeFinite(config.reachability?.minimumArrivalUsableRangeMiles === undefined ? 0 : config.reachability.minimumArrivalUsableRangeMiles)) errors.push('Minimum arrival margin must be finite and nonnegative');
  if (config.reachability?.allowBacktracking !== undefined && typeof config.reachability.allowBacktracking !== 'boolean') errors.push('allowBacktracking must be boolean');
  if (typeof input.requiredFuelType !== 'string' || !input.requiredFuelType.trim()) errors.push('Required fuel type must be specified');
  const stationResult = validateFuelStations(input.stations);
  errors.push(...stationResult.errors.map(e => 'Station ' + (e.index ?? 'dataset') + ' ' + e.field + ': ' + e.message));
  const status = evaluateFuelWarning({
    fuelPercent: input.telemetry?.fuel_percent ?? null,
    usableRangeMiles: fuel.usableRangeMiles,
    requiredDistanceMiles: input.route.distanceSource === 'simulated' || input.route.distanceSource === 'verified'
      ? input.route.remainingRouteMiles : null,
    reservePercent: fuel.reservePercent,
    thresholds: config.thresholds,
  });
  const assessments = stationResult.valid ? stationResult.stations.map(station => assessStationReachability({
    station, route: input.route, fuel, requiredFuelType: input.requiredFuelType,
    tankCapacityGallons: input.vehicle.tank_capacity_gallons, options: config.reachability,
  })) : [];
  // Invalid configuration/datasets block recommendations; they are never silently repaired.
  const ranked = errors.length ? [] : rankReachableStations(assessments, fuel.usableRangeMiles, input.route.remainingRouteMiles, config.ranking);
  const recommended = ranked[0] ?? null;
  const warnings: RecommendationWarning[] = recommended ? [] : [
    { code: 'NO_CONFIRMED_STATION', count: 1, explanation: 'No station is confirmed reachable under the supplied model assumptions. Do not continue beyond modeled usable range; stop safely and seek assistance if needed.' },
    ...(errors.length ? [{ code: 'INVALID_INPUT' as const, count: errors.length, explanation: errors.join('; ') }] : []),
    ...fallbackWarnings(assessments),
  ];
  return {
    fuel, status,
    recommendation: {
      station: recommended?.station ?? null, recommended, alternatives: ranked.slice(1), assessments,
      explanation: recommended
        ? 'Recommend ' + recommended.station.name + ': ' + recommended.explanation + ' Highest configured score among confirmed reachable compatible available stations; not a guaranteed arrival.'
        : warnings.map(w => w.explanation).join(' '),
      warnings,
    },
    errors,
    assumptions: {
      mpgSource: configuredMpg ? 'configured' : 'vehicle-profile', rangeIsEstimate: true,
      distanceSource: input.route.distanceSource,
      detourPolicy: 'Full supplied detour is conservatively charged before arrival; no live road routing.',
    },
  };
}
