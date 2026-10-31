import { getDemoFuelStations } from './station-fixtures';
import { describe, expect, it } from 'vitest';
import { calculateFuelRange } from '../range';
import { assessStationReachability } from '../reachability';
import { parseFuelStationsJson, validateFuelStations } from '../stations';
import { station, route, fuel } from './fixtures';
import type { FuelStation } from '../types';

describe('station reachability', () => {
  const evaluate = (overrides: Partial<FuelStation> = {}) => assessStationReachability({
    station: station(overrides), route, fuel: fuel(), requiredFuelType: 'Diesel', tankCapacityGallons: 120,
  });
  it('accounts for full detour and derives conservative arrival fuel', () => {
    const r = evaluate();
    expect(r.status).toBe('REACHABLE');
    expect(r.requiredDistanceMiles).toBe(21);
    expect(r.usableRangeAfterArrivalMiles).toBeCloseTo(46.2);
    expect(r.estimatedArrivalGallons).toBeCloseTo(20.4 - 21 / 8);
    expect(r.estimatedArrivalFuelPercent).toBeCloseTo((20.4 - 21 / 8) / 120 * 100);
  });
  it('excludes a cheap station reachable only with raw reserve fuel', () => {
    const r = evaluate({ distanceAlongRouteMiles: 70, detourMiles: 0, pricePerGallon: 2 });
    expect(r.status).toBe('UNREACHABLE');
    expect(r.reason).toBe('INSUFFICIENT_RANGE');
  });
  it.each<[Partial<FuelStation>, string, string]>([
    [{ distanceAlongRouteMiles: 76 }, 'EXCLUDED', 'BEYOND_DESTINATION'],
    [{ fuelTypes: ['regular'] }, 'EXCLUDED', 'INCOMPATIBLE_FUEL'],
    [{ isAvailable: false }, 'EXCLUDED', 'UNAVAILABLE'],
    [{ detourMiles: null }, 'UNKNOWN', 'MISSING_DISTANCE'],
    [{ distanceAlongRouteMiles: null }, 'UNKNOWN', 'MISSING_DISTANCE'],
    [{ detourMiles: -1 }, 'UNKNOWN', 'INVALID_STATION'],
  ])('handles station %j', (overrides, status, reason) => {
    expect(evaluate(overrides)).toMatchObject({ status, reason });
  });
  it('excludes backtracking unless allowed and charges distance to return', () => {
    const input = { station: station(), route: { ...route, currentDistanceAlongRouteMiles: 30, remainingRouteMiles: 45 }, fuel: fuel(), requiredFuelType: 'diesel' };
    expect(assessStationReachability(input).reason).toBe('BEHIND_VEHICLE');
    expect(assessStationReachability({ ...input, options: { allowBacktracking: true } })).toMatchObject({
      status: 'REACHABLE', requiredDistanceMiles: 11, isBacktracking: true,
    });
  });
  it.each([
    { currentDistanceAlongRouteMiles: null }, { remainingRouteMiles: null },
    { currentDistanceAlongRouteMiles: -1 }, { distanceSource: 'unknown' as const },
  ])('does not infer missing/invalid route distances from GPS: %j', overrides => {
    expect(assessStationReachability({
      station: station(), route: { ...route, ...overrides }, fuel: fuel(), requiredFuelType: 'diesel',
    }).status).toBe('UNKNOWN');
  });
  it('does not infer missing fuel range', () => {
    expect(assessStationReachability({
      station: station(), route, fuel: calculateFuelRange({ tankCapacityGallons: 120, fuelPercent: null, mpg: 8 }),
      requiredFuelType: 'diesel',
    })).toMatchObject({ status: 'UNKNOWN', reason: 'MISSING_RANGE' });
  });
  it('applies configurable arrival margin', () => {
    expect(assessStationReachability({
      station: station(), route, fuel: fuel(), requiredFuelType: 'diesel',
      options: { minimumArrivalUsableRangeMiles: 50 },
    }).status).toBe('UNREACHABLE');
  });
  it('accepts exact reachability equality and zero-distance refueling', () => {
    const f = fuel();
    expect(evaluate({ distanceAlongRouteMiles: f.usableRangeMiles!, detourMiles: 0 }).status).toBe('REACHABLE');
    const empty = calculateFuelRange({ tankCapacityGallons: 120, fuelPercent: 0, mpg: 0 });
    expect(assessStationReachability({
      station: station({ distanceAlongRouteMiles: 0, detourMiles: 0 }), route, fuel: empty,
      requiredFuelType: 'diesel', tankCapacityGallons: 120,
    })).toMatchObject({ status: 'REACHABLE', estimatedArrivalGallons: 0, estimatedArrivalFuelPercent: 0 });
  });
  it('uses uncertainty in arrival estimates consistently with range', () => {
    const f = calculateFuelRange({ tankCapacityGallons: 120, fuelPercent: 17, mpg: 8, uncertaintyMargin: 0.1 });
    expect(assessStationReachability({
      station: station(), route, fuel: f, requiredFuelType: 'diesel',
    }).estimatedArrivalGallons).toBeCloseTo(20.4 - 21 / 7.2);
  });
  it('does not claim a negative arrival fuel quantity', () => {
    expect(evaluate({ distanceAlongRouteMiles: 75, detourMiles: 100 }).estimatedArrivalGallons).toBeNull();
  });
  it.each([-1, NaN, Infinity, null as unknown as number])('rejects invalid safety margin %s', margin => {
    expect(assessStationReachability({
      station: station(), route, fuel: fuel(), requiredFuelType: 'diesel',
      options: { minimumArrivalUsableRangeMiles: margin },
    }).reason).toBe('INVALID_INPUT');
  });
  it('does not mutate inputs', () => {
    const input = { station: station(), route, fuel: fuel(), requiredFuelType: 'diesel' };
    const before = structuredClone(input);
    assessStationReachability(input);
    expect(input).toEqual(before);
  });
});

describe('station dataset validation', () => {
  it('loads independent numeric test inputs without fictional coordinates', () => {
    const stations = getDemoFuelStations();
    expect(stations.length).toBeGreaterThanOrEqual(8);
    expect(stations.every(s => s.isSynthetic && s.priceSource === 'sample')).toBe(true);
    expect(stations.every(s => s.latitude === null && s.longitude === null)).toBe(true);
    stations[0].fuelTypes.push('changed');
    expect(getDemoFuelStations()[0].fuelTypes).not.toContain('changed');
    expect(parseFuelStationsJson(JSON.stringify(stations)).valid).toBe(true);
  });
  it.each([null, {}, 'bad'])('rejects malformed envelopes: %j', data => {
    expect(validateFuelStations(data).valid).toBe(false);
  });
  it('handles JSON syntax errors and duplicate IDs', () => {
    expect(parseFuelStationsJson('{').valid).toBe(false);
    expect(validateFuelStations([station(), station()]).errors).toContainEqual(expect.objectContaining({ field: 'id' }));
  });
  it.each([
    ['pricePerGallon', -1], ['pricePerGallon', NaN], ['pricePerGallon', 0], ['detourMiles', undefined],
    ['distanceAlongRouteMiles', Infinity], ['latitude', 91], ['longitude', -181],
    ['fuelTypes', []], ['isAvailable', 'yes'], ['isSynthetic', null], ['name', ''], ['priceSource', 'live'],
  ])('rejects invalid station %s=%j', (field, value) => {
    expect(validateFuelStations([{ ...station(), [field]: value }]).errors).toContainEqual(expect.objectContaining({ index: 0, field }));
  });
  it('ignores unrelated properties without cloning arbitrary objects', () => {
    const r = validateFuelStations([{ ...station(), unrelated: () => 'ignored' }]);
    expect(r.valid).toBe(true);
    expect(r.stations[0]).toEqual(station());
  });
  it('accepts explicit null unknown measurements and an empty station set', () => {
    expect(validateFuelStations([station({ latitude: null, longitude: null, pricePerGallon: null, detourMiles: null, distanceAlongRouteMiles: null })]).valid).toBe(true);
    expect(validateFuelStations([]).valid).toBe(true);
  });
});
