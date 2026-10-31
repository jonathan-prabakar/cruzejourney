import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntelligenceController } from '../triggers';
import { context, now, transportResult } from './fixtures';
import { createIntelligenceScenarios } from './scenarios';
import type { VehicleIntelligenceContext, VehicleIntelligenceResult } from '../types';

const controllers: IntelligenceController[] = [];
function controller(analyze = vi.fn(async (c: VehicleIntelligenceContext) => transportResult(c)),
  options: ConstructorParameters<typeof IntelligenceController>[1] = {}) {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const engine = new IntelligenceController(analyze, options);
  controllers.push(engine);
  return { engine, analyze };
}
afterEach(() => { controllers.splice(0).forEach(c => c.dispose()); vi.useRealTimers(); });
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('event-driven analysis lifecycle', () => {
  it('suppresses duplicate ticks and preserves stable snapshots', async () => {
    const { engine, analyze } = controller(), c = context();
    const before = engine.getState();
    expect(engine.getState()).toBe(before);
    engine.update(c); engine.update(c); engine.requestAssessment(c);
    await flush();
    expect(analyze).toHaveBeenCalledOnce();
    for (let i = 1; i <= 10; i++) {
      engine.update({ ...c, telemetry: { ...c.telemetry!, timestamp: new Date(Date.parse(c.telemetry!.timestamp) + i * 1000).toISOString() } });
    }
    await flush();
    expect(analyze).toHaveBeenCalledOnce();
    expect(engine.getState().status).toBe('ready');
  });
  it('throttles state changes and analyzes the latest pending state', async () => {
    const { engine, analyze } = controller();
    engine.update(context()); await flush();
    const critical = createIntelligenceScenarios().criticalFuel;
    engine.update(critical);
    const newest = { ...critical, telemetry: { ...critical.telemetry!, coolant_temp_f: 245 } };
    engine.update(newest);
    expect(engine.getState().status).toBe('pending');
    expect(engine.getState().result!.source).toBe('fallback');
    await vi.advanceTimersByTimeAsync(4999);
    expect(analyze).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][0].telemetry!.coolant_temp_f).toBe(245);
  });
  it('uses short-lived exact-context caching, with TTL expiry on explicit assessment', async () => {
    const { engine, analyze } = controller(), c = context();
    engine.update(c); await flush();
    engine.requestAssessment(c); await flush();
    expect(analyze).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30001);
    engine.requestAssessment(c); await flush();
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  it('discards old responses after a backwards seek even when fuel status is unchanged', async () => {
    const completions: ((value: VehicleIntelligenceResult) => void)[] = [];
    const analyze = vi.fn((c: VehicleIntelligenceContext) => { void c; return new Promise<VehicleIntelligenceResult>(resolve => completions.push(resolve)); });
    const { engine } = controller(analyze, { minIntervalMs: 0 });
    const c = context(), later = { ...c, telemetry: { ...c.telemetry!, timestamp: new Date(Date.parse(c.telemetry!.timestamp) + 10000).toISOString() } };
    engine.update(later); await flush();
    engine.update(c); await flush();
    expect(analyze).toHaveBeenCalledTimes(2);
    completions[1](transportResult(c)); await flush();
    completions[0](transportResult(later)); await flush();
    expect(engine.getState().result!.telemetryTimestamp).toBe(c.telemetry!.timestamp);
  });
  it('cancels stale responses when a semantic event changes', async () => {
    const completions: ((value: VehicleIntelligenceResult) => void)[] = [];
    const analyze = vi.fn((c: VehicleIntelligenceContext) => { void c; return new Promise<VehicleIntelligenceResult>(resolve => completions.push(resolve)); });
    const { engine } = controller(analyze, { minIntervalMs: 0 });
    const a = context(), b = createIntelligenceScenarios().criticalFuel;
    engine.update(a); await flush();
    engine.update(b); await flush();
    completions[0](transportResult(a)); await flush();
    expect(engine.getState().status).toBe('analyzing');
    completions[1](transportResult(b)); await flush();
    expect(engine.getState().result!.insights[0].priority).toBe('critical');
  });
  it('rejects a transport response for a different reading', async () => {
    const c = context();
    const wrong = { ...transportResult(c), telemetryTimestamp: '2000-01-01T00:00:00Z' };
    const { engine } = controller(vi.fn(async () => wrong));
    engine.update(c); await flush();
    expect(engine.getState().status).toBe('fallback');
    expect(engine.getState().result!.error?.code).toBe('INVALID_OUTPUT');
  });
  it('responds to diagnostic onset, severity, coolant, route and efficiency changes', async () => {
    const { engine, analyze } = controller(undefined, { minIntervalMs: 0 });
    const c = createIntelligenceScenarios().combined;
    engine.update(c); await flush();
    engine.update({ ...c, diagnostics: { available: true, findings: [{ code: 'P0301', description: 'Concern', severity: 'critical' }] } }); await flush();
    engine.update({ ...c, telemetry: { ...c.telemetry!, coolant_temp_f: 230 } }); await flush();
    engine.update({ ...c, route: { ...c.route, remainingRouteMiles: 0 } }); await flush();
    engine.update({ ...c, efficiency: { status: 'concern', metrics: [{ id: 'avg', label: 'MPG', value: 6, unit: 'mpg' }] } }); await flush();
    expect(analyze).toHaveBeenCalledTimes(5);
  });
  it('triggers when the selected station changes without a percentage-status change', async () => {
    const { engine, analyze } = controller(undefined, { minIntervalMs: 0 });
    const c = context();
    engine.update(c); await flush();
    const original = c.fuelIntelligence!.recommendation.station!.id;
    const changed = { ...c, stations: c.stations.map(s => s.id === original ? { ...s, isAvailable: false } : s) };
    engine.update(changed); await flush();
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  it('refreshes when planning assumptions change even with unchanged fuel status', async () => {
    const { engine, analyze } = controller(undefined, { minIntervalMs: 0 });
    const c = context();
    engine.update(c); await flush();
    engine.update({ ...c, fuelConfig: { planningMpg: 8.01 } }); await flush();
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  it('recognizes a new diagnostic episode after a clear reading', async () => {
    const { engine, analyze } = controller(undefined, { minIntervalMs: 0 });
    const c = createIntelligenceScenarios().combined;
    engine.update(c); await flush();
    const cleared = { ...c, telemetry: { ...c.telemetry!, diagnostic_code: null, timestamp: '2026-10-01T16:00:00Z' } };
    engine.update(cleared); await flush();
    const reappeared = { ...c, history: [cleared.telemetry], telemetry: { ...c.telemetry!, timestamp: '2026-10-01T16:01:00Z' } };
    engine.update(reappeared); await flush();
    expect(analyze).toHaveBeenCalledTimes(3);
  });
  it('does not contact the server when current telemetry is unavailable', async () => {
    const { engine, analyze } = controller();
    engine.update({ ...context(), telemetry: null }); await flush();
    expect(analyze).not.toHaveBeenCalled();
    expect(engine.getState().status).toBe('fallback');
  });
  it('supports invalidation, subscription cleanup, disposal, and API failures', async () => {
    const analyze = vi.fn(async (c: VehicleIntelligenceContext): Promise<VehicleIntelligenceResult> => { void c; throw new Error('private error'); });
    const { engine } = controller(analyze);
    const listener = vi.fn(), remove = engine.subscribe(listener);
    engine.update(context()); await flush();
    expect(engine.getState().status).toBe('fallback');
    engine.invalidate();
    expect(engine.getState().result).toBeNull();
    remove();
    const count = listener.mock.calls.length;
    engine.dispose(); engine.dispose();
    expect(listener).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => engine.update(context())).toThrow('disposed');
  });
  it('does not contact the server with malformed context', async () => {
    const { engine, analyze } = controller();
    const c = context(); c.history = Array.from({ length: 121 }, () => c.telemetry!);
    engine.update(c); await flush();
    expect(analyze).not.toHaveBeenCalled();
    expect(engine.getState().result!.error?.code).toBe('INVALID_CONTEXT');
  });
  it.each([-1, NaN, Infinity, 300001])('rejects invalid throttling limits %s', minIntervalMs => {
    expect(() => new IntelligenceController(async c => transportResult(c), { minIntervalMs })).toThrow(RangeError);
  });
});
