import { isNonnegativeFinite } from './range';
import type { FuelIntelligenceConfig, RankedStation, RankingConfig, StationReachability } from './types';

export const DEFAULT_RANKING_CONFIG: Readonly<RankingConfig> = Object.freeze({
  weights: Object.freeze({ price: 0.4, detour: 0.3, safety: 0.2, progress: 0.1 }),
  priceFloorPerGallon: 2, priceCeilingPerGallon: 6, detourScaleMiles: 10,
});
export function resolveRankingConfig(config?: FuelIntelligenceConfig['ranking']): RankingConfig {
  return { ...DEFAULT_RANKING_CONFIG, ...config, weights: { ...DEFAULT_RANKING_CONFIG.weights, ...config?.weights } };
}
export function validRankingConfig(config: RankingConfig): boolean {
  const weights = Object.values(config.weights);
  return weights.every(isNonnegativeFinite) && Number.isFinite(weights.reduce((a, b) => a + b, 0)) &&
    weights.some(w => w > 0) && isNonnegativeFinite(config.priceFloorPerGallon) &&
    isNonnegativeFinite(config.priceCeilingPerGallon) && config.priceCeilingPerGallon > config.priceFloorPerGallon &&
    isNonnegativeFinite(config.detourScaleMiles) && config.detourScaleMiles > 0;
}
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
/** Hard safety/compatibility/availability filters precede any price scoring. */
export function rankReachableStations(
  assessments: readonly StationReachability[],
  usableRangeMiles: number | null,
  remainingRouteMiles: number | null,
  options?: FuelIntelligenceConfig['ranking'],
): RankedStation[] {
  const config = resolveRankingConfig(options);
  if (!validRankingConfig(config) || !isNonnegativeFinite(usableRangeMiles) || !isNonnegativeFinite(remainingRouteMiles)) return [];
  const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
  const weights = {
    price: config.weights.price / sum, detour: config.weights.detour / sum,
    safety: config.weights.safety / sum, progress: config.weights.progress / sum,
  };
  return assessments.filter(a => a.status === 'REACHABLE' && a.station.isAvailable &&
    isNonnegativeFinite(a.requiredDistanceMiles) && a.requiredDistanceMiles <= usableRangeMiles &&
    isNonnegativeFinite(a.station.detourMiles) && isNonnegativeFinite(a.usableRangeAfterArrivalMiles) &&
    isNonnegativeFinite(a.routeDistanceMiles))
    .map((a): RankedStation => {
      const missingPrice = !isNonnegativeFinite(a.station.pricePerGallon) || a.station.pricePerGallon === 0;
      const price = missingPrice ? 0 : clamp((config.priceCeilingPerGallon - a.station.pricePerGallon!) /
        (config.priceCeilingPerGallon - config.priceFloorPerGallon));
      const detour = clamp(1 - a.station.detourMiles! / config.detourScaleMiles);
      const safety = usableRangeMiles > 0 ? clamp(a.usableRangeAfterArrivalMiles! / usableRangeMiles) : 0;
      // Prefer forward progress; backtracking earns no progress score.
      const progress = remainingRouteMiles > 0 && !a.isBacktracking
        ? clamp(a.routeDistanceMiles! / remainingRouteMiles) : 0;
      const total = price * weights.price + detour * weights.detour + safety * weights.safety + progress * weights.progress;
      return {
        station: a.station, reachability: a,
        score: { price, detour, safety, progress, weights: { ...weights }, total, missingPrice },
        explanation: a.explanation + ' ' + (missingPrice ? 'Price unknown (price score 0).' :
          (a.station.priceSource === 'sample' ? 'Fictional sample price $' : 'Supplied verified price $') +
          a.station.pricePerGallon!.toFixed(2) + '/gal.') +
          ' Score ' + total.toFixed(3) + '; usable range after arrival ' + a.usableRangeAfterArrivalMiles!.toFixed(1) + ' mi.' +
          (a.estimatedArrivalFuelPercent === null ? ' Arrival fuel unavailable.' : ' Estimated arrival fuel ' + a.estimatedArrivalFuelPercent.toFixed(1) + '%.'),
      };
    })
    .sort((a, b) => b.score.total - a.score.total || (a.station.id < b.station.id ? -1 : a.station.id > b.station.id ? 1 : 0));
}
