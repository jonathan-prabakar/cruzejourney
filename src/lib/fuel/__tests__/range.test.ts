import { describe, expect, it } from 'vitest';
import { calculateFuelRange } from '../range';

const input = { tankCapacityGallons: 120, fuelPercent: 17, mpg: 8 };
describe('fuel range', () => {
  it('derives the specified truck example', () => {
    const result = calculateFuelRange(input);
    expect(result.valid).toBe(true);
    expect(result.remainingGallons).toBeCloseTo(20.4);
    expect(result.estimatedRangeMiles).toBeCloseTo(163.2);
    expect(result.reserveGallons).toBe(12);
    expect(result.usableRangeMiles).toBeCloseTo(67.2);
    expect(result.reservePercent).toBe(10);
  });
  it('applies uncertainty after reserve exactly once', () => {
    const result = calculateFuelRange({ ...input, uncertaintyMargin: 0.1 });
    expect(result.usableRangeBeforeUncertaintyMiles).toBeCloseTo(67.2);
    expect(result.usableRangeMiles).toBeCloseTo(60.48);
    expect(result.estimatedRangeMiles).toBeCloseTo(163.2);
  });
  it.each([
    [{ mpg: 0 }, 20.4, 0, 0],
    [{ fuelPercent: 0 }, 0, 0, 0],
    [{ fuelPercent: 100 }, 120, 960, 864],
    [{ fuelPercent: 10 }, 12, 96, 0],
    [{ fuelPercent: 5 }, 6, 48, 0],
    [{ reservePercent: 0 }, 20.4, 163.2, 163.2],
    [{ reservePercent: 100 }, 20.4, 163.2, 0],
    [{ uncertaintyMargin: 1 }, 20.4, 163.2, 0],
  ])('handles boundary %j', (overrides, remaining, raw, usable) => {
    const r = calculateFuelRange({ ...input, ...overrides });
    expect(r.valid).toBe(true);
    expect(r.remainingGallons).toBeCloseTo(remaining);
    expect(r.estimatedRangeMiles).toBeCloseTo(raw);
    expect(r.usableRangeMiles).toBeCloseTo(usable);
  });
  it.each([
    ['tankCapacityGallons', -1], ['tankCapacityGallons', 0], ['tankCapacityGallons', null],
    ['fuelPercent', -1], ['fuelPercent', 101], ['fuelPercent', null], ['fuelPercent', NaN],
    ['mpg', -1], ['mpg', Infinity], ['mpg', null],
    ['reservePercent', -1], ['reservePercent', 101], ['reservePercent', NaN],
    ['uncertaintyMargin', -0.1], ['uncertaintyMargin', 1.1], ['uncertaintyMargin', Infinity],
  ])('rejects invalid %s=%s without fabricated calculations', (key, value) => {
    const r = calculateFuelRange({ ...input, [key]: value });
    expect(r.valid).toBe(false);
    expect(r.remainingGallons).toBeNull();
    expect(r.usableRangeMiles).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(r)).not.toContain('NaN');
  });
  it('reports arithmetic overflow', () => {
    const r = calculateFuelRange({ tankCapacityGallons: Number.MAX_VALUE, fuelPercent: 100, mpg: Number.MAX_VALUE });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Range calculation overflow; measurements are too large');
  });
  it('does not mutate its inputs', () => {
    const before = structuredClone(input);
    calculateFuelRange(input);
    expect(input).toEqual(before);
  });
});
