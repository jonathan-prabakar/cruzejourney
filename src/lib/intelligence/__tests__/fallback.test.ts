import { describe, expect, it } from 'vitest';
import { prepareIntelligenceContext } from '../context';
import { buildFallback } from '../fallback';
import { createIntelligenceScenarios } from '../scenarios';
import { context, now } from './fixtures';

describe('deterministic fallback and bounded context', () => {
  it('is reproducible and explicitly distinct from Gemma output', () => {
    const c = prepareIntelligenceContext(context());
    const a = buildFallback(c, now), b = buildFallback(c, now);
    expect(a).toEqual(b);
    expect(a.source).toBe('fallback');
    expect(a.model).toBeNull();
    expect(a.insights.every(i => i.source === 'deterministic')).toBe(true);
    expect(a.overallAssessment).toContain('Deterministic');
  });
  it('preserves mandatory warnings in all four reproducible scenarios', () => {
    const scenarios = createIntelligenceScenarios();
    for (const name of ['lowFuel', 'criticalFuel', 'diagnostic', 'combined'] as const) {
      const result = buildFallback(prepareIntelligenceContext(scenarios[name]), now);
      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.insights.length).toBeLessThanOrEqual(6);
    }
    expect(buildFallback(prepareIntelligenceContext(scenarios.criticalFuel), now).insights[0].priority).toBe('critical');
    const diag = buildFallback(prepareIntelligenceContext(scenarios.diagnostic), now);
    expect(diag.insights.find(i => i.id === 'safety-diagnostic')!.explanation).toContain('does not confirm');
    expect(diag.capabilities.efficiency).toBe('unavailable');
  });
  it('critical coolant overrides refueling convenience in fallback', () => {
    const c = context(); c.telemetry = { ...c.telemetry!, coolant_temp_f: 245 };
    const r = buildFallback(prepareIntelligenceContext(c), now);
    expect(r.insights[0].id).toBe('safety-coolant');
    expect(r.insights[0].actions[0]).toBe('stop_safely');
    expect(r.insights.some(i => i.relatedStationId)).toBe(false);
  });
  it('never accepts client-supplied fuel conclusions as authoritative', () => {
    const c = createIntelligenceScenarios().criticalFuel;
    c.fuelIntelligence = createIntelligenceScenarios().lowFuel.fuelIntelligence;
    const p = prepareIntelligenceContext(c);
    expect(p.eligibleStations).toEqual([]);
    expect(p.fuel.fuel.usableRangeMiles).toBe(0);
  });
  it('does not invent diagnostic interpretations or efficiency findings', () => {
    const p = prepareIntelligenceContext(createIntelligenceScenarios().combined);
    expect(p.diagnosticFindings).toEqual([]); expect(p.efficiency).toBeNull();
    expect(p.facts.find(f => f.id === 'diagnostic.P0301')!.text).toContain('cause and severity are not confirmed');
  });
  it('removes future events and unobserved findings after seeking', () => {
    const scenarios = createIntelligenceScenarios(), c = scenarios.lowFuel;
    c.history = [scenarios.combined.telemetry!];
    c.diagnostics = { available: true, findings: [{ code: 'P0301', description: 'Should not leak', severity: 'critical' }] };
    const p = prepareIntelligenceContext(c);
    expect(p.observedCodes).toEqual([]); expect(p.history).toEqual([]); expect(p.diagnosticFindings).toEqual([]);
  });
  it('does not mutate input or invent absent measurements', () => {
    const c = context();
    c.telemetry = { ...c.telemetry!, latitude: null, longitude: null, coolant_temp_f: null };
    const original = structuredClone(c), p = prepareIntelligenceContext(c);
    expect(p.facts.some(f => f.id === 'coolant.temperature')).toBe(false);
    expect(p.coolantStatus).toBe('unknown'); expect(c).toEqual(original);
  });
  it.each([
    (c: ReturnType<typeof context>) => { c.history = Array.from({ length: 121 }, () => c.telemetry!); },
    (c: ReturnType<typeof context>) => { c.stations = Array.from({ length: 31 }, () => c.stations[0]); },
    (c: ReturnType<typeof context>) => { c.vehicle.name = 'x'.repeat(100001); },
    (c: ReturnType<typeof context>) => { c.telemetry = { ...c.telemetry!, rpm: NaN }; },
    (c: ReturnType<typeof context>) => { c.efficiency = { status: 'concern', metrics: [{ id: 'bad', label: 'MPG', value: Infinity, unit: 'mpg' }] }; },
  ])('rejects invalid or oversize context', mutate => {
    const c = context(); mutate(c);
    expect(() => prepareIntelligenceContext(c)).toThrow('Vehicle context');
  });
  it('accepts explicitly supplied bounded efficiency metrics', () => {
    const c = context();
    c.efficiency = { status: 'concern', metrics: [{ id: 'mpg-average', label: 'Recent average MPG', value: 6.5, unit: 'mpg' }] };
    const p = prepareIntelligenceContext(c);
    expect(p.capabilities.efficiency).toBe('available');
    expect(p.facts.find(f => f.id === 'efficiency.mpg-average')!.value).toBe(6.5);
  });
});
