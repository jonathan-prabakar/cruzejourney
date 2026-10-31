import { describe, expect, it } from 'vitest';
import { rankReachableStations } from '../ranking';
import { assessStationReachability } from '../reachability';
import { assessment, station, route, fuel } from './fixtures';

const rank = (items: ReturnType<typeof assessment>[], options?: Parameters<typeof rankReachableStations>[3]) =>
  rankReachableStations(items, fuel().usableRangeMiles, route.remainingRouteMiles, options);
describe('deterministic station ranking', () => {
  it('prefers lower prices when other factors are equal', () => {
    const items = [assessment({ id: 'expensive', pricePerGallon: 4 }), assessment({ id: 'cheap', pricePerGallon: 3 })];
    expect(rank(items)[0].station.id).toBe('cheap');
  });
  it('prefers shorter detours when other factors are equal', () => {
    const items = [assessment({ id: 'long', detourMiles: 3 }), assessment({ id: 'short', detourMiles: 0.5 })];
    expect(rank(items)[0].station.id).toBe('short');
  });
  it('safety filters exclude an unreachable cheaper stop', () => {
    const items = [assessment({ id: 'cheap', pricePerGallon: 1, distanceAlongRouteMiles: 70 }), assessment({ id: 'safe', pricePerGallon: 5 })];
    expect(rank(items).map(r => r.station.id)).toEqual(['safe']);
  });
  it('excludes incompatible and unavailable candidates before scoring', () => {
    expect(rank([assessment({ id: 'wrong', fuelTypes: ['regular'] }), assessment({ id: 'closed', isAvailable: false })])).toEqual([]);
  });
  it('uses lexicographic station ID for ties, independent of input order', () => {
    const a = assessment({ id: 'a' }), b = assessment({ id: 'b' });
    expect(rank([b, a]).map(r => r.station.id)).toEqual(['a', 'b']);
    expect(rank([b, a])).toEqual(rank([a, b]));
  });
  it('unknown price receives an explicit zero price score, not a free-fuel assumption', () => {
    const result = rank([assessment({ id: 'unknown', pricePerGallon: null }), assessment({ id: 'known', pricePerGallon: 3 })]);
    expect(result[0].station.id).toBe('known');
    expect(result[1].score).toMatchObject({ price: 0, missingPrice: true });
    expect(result[1].explanation).toContain('Price unknown');
  });
  it('does not rank unknown detours', () => {
    expect(rank([assessment({ detourMiles: null })])).toEqual([]);
  });
  it('has a reproducible weighted breakdown from fixed scales', () => {
    const r = rank([assessment({ pricePerGallon: 4, detourMiles: 1 })])[0];
    expect(r.score.price).toBeCloseTo(0.5);
    expect(r.score.detour).toBeCloseTo(0.9);
    expect(r.score.safety).toBeCloseTo(46.2 / 67.2);
    expect(r.score.progress).toBeCloseTo(20 / 75);
    expect(r.score.total).toBeCloseTo(0.4 * 0.5 + 0.3 * 0.9 + 0.2 * (46.2 / 67.2) + 0.1 * (20 / 75));
    expect(r.explanation).toContain('21.0 mi');
    expect(r.explanation).toContain('$4.00/gal');
    const unrelated = assessment({ id: 'unrelated', pricePerGallon: 5.5, distanceAlongRouteMiles: 50 });
    expect(rank([r.reachability, unrelated]).find(s => s.station.id === r.station.id)!.score).toEqual(r.score);
  });
  it('normalizes configurable weights and can prioritize safety within eligible stops', () => {
    const result = rank([assessment({ id: 'later', distanceAlongRouteMiles: 50, pricePerGallon: 2 }),
      assessment({ id: 'earlier', distanceAlongRouteMiles: 5, pricePerGallon: 5 })],
    { weights: { price: 0, detour: 0, safety: 100, progress: 0 } });
    expect(result[0].station.id).toBe('earlier');
    expect(result[0].score.weights.safety).toBe(1);
  });
  it('does not reward backtracking as forward progress', () => {
    const context = { ...route, currentDistanceAlongRouteMiles: 30, remainingRouteMiles: 45 };
    const items = [10, 40].map((position, i) => assessStationReachability({
      station: station({ id: String(i), distanceAlongRouteMiles: position }), route: context, fuel: fuel(),
      requiredFuelType: 'diesel', options: { allowBacktracking: true },
    }));
    const result = rankReachableStations(items, fuel().usableRangeMiles, 45, { weights: { price: 0, detour: 0, safety: 0, progress: 1 } });
    expect(result[0].station.id).toBe('1');
    expect(result[1].score.progress).toBe(0);
  });
  it.each([
    { weights: { price: -1 } }, { weights: { price: NaN } },
    { weights: { price: 0, detour: 0, safety: 0, progress: 0 } },
    { detourScaleMiles: 0 }, { priceFloorPerGallon: 6, priceCeilingPerGallon: 2 },
  ])('rejects invalid scoring configuration: %j', config => {
    expect(rank([assessment()], config)).toEqual([]);
  });
  it('does not mutate inputs', () => {
    const items = [assessment({ id: 'b' }), assessment({ id: 'a' })];
    const before = structuredClone(items);
    rank(items);
    expect(items).toEqual(before);
  });
});
