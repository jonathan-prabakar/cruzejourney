import { describe, expect, it } from 'vitest';
import { evaluateFuelWarning } from '../warnings';

describe('fuel warning states', () => {
  it.each([[21, 'NORMAL'], [20, 'LOW'], [10.01, 'LOW'], [10, 'CRITICAL'], [0, 'CRITICAL']] as const)(
    'classifies %s%% as %s', (fuelPercent, level) => {
      const r = evaluateFuelWarning({ fuelPercent, usableRangeMiles: 100 });
      expect(r.level).toBe(level);
      expect(r.fuelStatus).toBe(level);
      expect(r.routeSafety).toBe('NOT_REQUESTED');
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.recommendedAction.length).toBeGreaterThan(0);
    },
  );
  it('preserves percentage status while independently flagging insufficient range', () => {
    const r = evaluateFuelWarning({ fuelPercent: 80, usableRangeMiles: 40, requiredDistanceMiles: 50, reservePercent: 10 });
    expect(r).toMatchObject({ level: 'INSUFFICIENT_RANGE', fuelStatus: 'NORMAL', routeSafety: 'INSUFFICIENT_RANGE', severity: 'critical' });
    expect(r.explanation).toContain('40.0 mi');
    expect(r.explanation).toContain('50.0 mi');
    expect(r.measurements.reservePercent).toBe(10);
  });
  it('accepts exact range equality', () => {
    expect(evaluateFuelWarning({ fuelPercent: 30, usableRangeMiles: 50, requiredDistanceMiles: 50 }).routeSafety).toBe('SUFFICIENT');
  });
  it.each([
    { fuelPercent: null, usableRangeMiles: 100 },
    { fuelPercent: 101, usableRangeMiles: 100 },
    { fuelPercent: 30, usableRangeMiles: null },
    { fuelPercent: 30, usableRangeMiles: NaN },
    { fuelPercent: 30, usableRangeMiles: 100, requiredDistanceMiles: null },
    { fuelPercent: 30, usableRangeMiles: 100, requiredDistanceMiles: -1 },
  ])('returns UNKNOWN for unavailable/invalid inputs: %j', input => {
    expect(evaluateFuelWarning(input).level).toBe('UNKNOWN');
  });
  it('preserves critical severity even when route data is unknown', () => {
    const r = evaluateFuelWarning({ fuelPercent: 5, usableRangeMiles: 0, requiredDistanceMiles: null });
    expect(r).toMatchObject({ level: 'UNKNOWN', fuelStatus: 'CRITICAL', severity: 'critical', routeSafety: 'UNKNOWN' });
  });
  it('uses configurable percentage boundaries', () => {
    expect(evaluateFuelWarning({ fuelPercent: 25, usableRangeMiles: 100, thresholds: { lowPercent: 30, criticalPercent: 15 } }).level).toBe('LOW');
    expect(evaluateFuelWarning({ fuelPercent: 15, usableRangeMiles: 100, thresholds: { criticalPercent: 15 } }).level).toBe('CRITICAL');
  });
  it.each([{ lowPercent: 10, criticalPercent: 20 }, { lowPercent: 101 }, { criticalPercent: -1 }])(
    'reports invalid thresholds as unknown: %j', thresholds => {
      expect(evaluateFuelWarning({ fuelPercent: 30, usableRangeMiles: 100, thresholds }).level).toBe('UNKNOWN');
    },
  );
});
