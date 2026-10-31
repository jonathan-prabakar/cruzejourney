import { describe, expect, it } from 'vitest';
import demo from '../../../data/demo-telemetry.json';
import { calculateFuelIntelligence } from '../intelligence';
import { getDemoFuelStations } from './station-fixtures';
import { DEMO_ROUTE_LENGTH_MILES, getDemoRouteContext } from '../demo';
import { fuel, route, station, telemetry, vehicle } from './fixtures';
import type { FuelIntelligenceInput, FuelIntelligenceConfig } from '../types';

function input(overrides: Partial<FuelIntelligenceInput> = {}): FuelIntelligenceInput {
  return { telemetry, vehicle, route, stations: getDemoFuelStations(), requiredFuelType: 'diesel', ...overrides };
}
describe('M2/M3 integration', () => {
  it('uses the existing record/profile and an explicit stable MPG assumption', () => {
    const result = calculateFuelIntelligence(input());
    expect(result.fuel).toEqual(fuel());
    expect(telemetry.mpg).not.toBe(vehicle.typical_mpg);
    expect(result.assumptions.mpgSource).toBe('vehicle-profile');
    expect(result.fuel.planningMpg).toBe(8);
    expect(result.errors).toEqual([]);
    expect(result.recommendation.station?.id).toBe('demo-03');
    expect(result.recommendation.recommended!.reachability.requiredDistanceMiles).toBeCloseTo(25.6);
    expect(result.recommendation.recommended!.reachability.estimatedArrivalGallons).toBeCloseTo(17.2);
    expect(result.recommendation.recommended!.score.total).toBeCloseTo(0.684142857);
    expect(result.recommendation.recommended!.reachability.status).toBe('REACHABLE');
  });
  it('allows an explicit configurable MPG estimate without silently falling back', () => {
    expect(calculateFuelIntelligence(input({ config: { planningMpg: 6 } })).fuel.usableRangeMiles).toBeCloseTo(50.4);
    const missing = calculateFuelIntelligence(input({ config: { planningMpg: null } }));
    expect(missing.fuel.valid).toBe(false);
    expect(missing.recommendation.station).toBeNull();
    expect(missing.assumptions.mpgSource).toBe('configured');
  });
  it('verifies normal, low and critical scenarios with changing recommendations', () => {
    const scenarios = [30, 17, 9].map(fuelPercent => calculateFuelIntelligence(input({
      telemetry: { ...telemetry, fuel_percent: fuelPercent },
    })));
    expect(scenarios.map(r => r.status.fuelStatus)).toEqual(['NORMAL', 'LOW', 'CRITICAL']);
    expect(scenarios.map(r => r.recommendation.station?.id ?? null)).toEqual(['demo-09', 'demo-03', null]);
    expect(scenarios.map(r => r.status.routeSafety)).toEqual(['SUFFICIENT', 'INSUFFICIENT_RANGE', 'INSUFFICIENT_RANGE']);
    expect(scenarios[2].recommendation.warnings.map(w => w.code)).toContain('INSUFFICIENT_RANGE');
  });
  it('provides a safe fallback when no station is reachable', () => {
    const r = calculateFuelIntelligence(input({ telemetry: { ...telemetry, fuel_percent: 10 } }));
    expect(r.recommendation.station).toBeNull();
    expect(r.recommendation.alternatives).toEqual([]);
    expect(r.recommendation.explanation).toContain('No station is confirmed reachable');
    expect(r.recommendation.explanation).toContain('stop safely');
  });
  it.each([
    { telemetry: null },
    { route: { ...route, currentDistanceAlongRouteMiles: null } },
    { route: { ...route, remainingRouteMiles: null } },
    { route: { ...route, distanceSource: 'unknown' as const } },
  ])('does not fabricate results from missing data: %j', overrides => {
    const r = calculateFuelIntelligence(input(overrides));
    expect(r.recommendation.station).toBeNull();
    expect(r.recommendation.warnings.map(w => w.code)).toContain('UNKNOWN_DATA');
  });
  it('explains unavailability, fuel incompatibility, route exclusions and unknown distances', () => {
    const stations = [
      station({ id: 'closed', isAvailable: false }),
      station({ id: 'wrong', fuelTypes: ['regular'] }),
      station({ id: 'unknown', detourMiles: null }),
      station({ id: 'past-end', distanceAlongRouteMiles: 100 }),
    ];
    const r = calculateFuelIntelligence(input({ stations }));
    expect(r.recommendation.warnings.map(w => w.code)).toEqual(expect.arrayContaining([
      'NO_CONFIRMED_STATION', 'UNAVAILABLE', 'INCOMPATIBLE_FUEL', 'UNKNOWN_DATA', 'EXCLUDED',
    ]));
  });
  it('handles an empty station set without inventing a fallback', () => {
    const r = calculateFuelIntelligence(input({ stations: [] }));
    expect(r.recommendation.station).toBeNull();
    expect(r.recommendation.warnings[0].code).toBe('NO_CONFIRMED_STATION');
  });
  it.each([
    { reservePercent: -1 }, { uncertaintyMargin: 2 }, { planningMpg: NaN },
    { thresholds: { lowPercent: 5, criticalPercent: 10 } },
    { ranking: { weights: { price: -1 } } },
    { reachability: { minimumArrivalUsableRangeMiles: -1 } },
  ] satisfies FuelIntelligenceConfig[])('blocks recommendations with invalid configuration: %j', config => {
    const r = calculateFuelIntelligence(input({ config }));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.recommendation.station).toBeNull();
    expect(r.recommendation.warnings.map(w => w.code)).toContain('INVALID_INPUT');
  });
  it('does not mislabel safe candidates when ranking configuration is invalid', () => {
    const r = calculateFuelIntelligence(input({
      stations: [station()], config: { ranking: { weights: { price: -1 } } },
    }));
    expect(r.recommendation.assessments[0].status).toBe('REACHABLE');
    expect(r.recommendation.warnings.map(w => w.code)).toEqual(['NO_CONFIRMED_STATION', 'INVALID_INPUT']);
  });
  it('blocks malformed/duplicate station datasets and unspecified required fuel', () => {
    for (const overrides of [{ stations: [station(), station()] }, { requiredFuelType: '' }]) {
      const r = calculateFuelIntelligence(input(overrides));
      expect(r.recommendation.station).toBeNull();
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it('uses real M2 playback indices for simulated progress without guessing from GPS', () => {
    expect(DEMO_ROUTE_LENGTH_MILES).toBeGreaterThan(70);
    expect(DEMO_ROUTE_LENGTH_MILES).toBeLessThan(80);
    expect(getDemoRouteContext(0).currentDistanceAlongRouteMiles).toBe(0);
    expect(getDemoRouteContext(240).remainingRouteMiles).toBe(0);
    expect(getDemoRouteContext(-1).distanceSource).toBe('unknown');
    expect(getDemoRouteContext(0.5).distanceSource).toBe('unknown');
    expect(getDemoRouteContext(241).distanceSource).toBe('unknown');
    const results = [0, 120, 240].map(index => calculateFuelIntelligence(input({
      telemetry: demo.records[index], route: getDemoRouteContext(index),
    })));
    expect(results.every(r => r.errors.length === 0)).toBe(true);
    expect(results[2].recommendation.station).toBeNull();
    expect(results[2].status.fuelStatus).toBe('CRITICAL');
    expect(results[2].status.routeSafety).toBe('SUFFICIENT');
  });
  it('returns deterministic results and leaves all inputs unchanged', () => {
    const data = input();
    const before = structuredClone(data);
    const a = calculateFuelIntelligence(data), b = calculateFuelIntelligence(data);
    expect(a).toEqual(b);
    expect(data).toEqual(before);
    const reversed = calculateFuelIntelligence({ ...data, stations: [...data.stations].reverse() });
    expect(a.recommendation.recommended).toEqual(reversed.recommendation.recommended);
    expect(a.recommendation.alternatives).toEqual(reversed.recommendation.alternatives);
  });
  it('never recommends any station without positive confirmation across the whole M2 trip', () => {
    for (let i = 0; i < demo.records.length; i++) {
      const r = calculateFuelIntelligence(input({ telemetry: demo.records[i], route: getDemoRouteContext(i) }));
      for (const candidate of [r.recommendation.recommended, ...r.recommendation.alternatives]) {
        if (candidate) {
          expect(candidate.reachability.status).toBe('REACHABLE');
          expect(candidate.reachability.requiredDistanceMiles).toBeLessThanOrEqual(r.fuel.usableRangeMiles!);
          expect(candidate.reachability.estimatedArrivalFuelPercent!).toBeGreaterThanOrEqual(10 - 1e-8);
          expect(candidate.station.isAvailable).toBe(true);
          expect(candidate.station.fuelTypes).toContain('diesel');
        }
      }
    }
  });
});
