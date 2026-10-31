import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../planner';
import { buildCuratedRoute } from '../routes';
import { generateSimulationFrames } from '../simulation';
import { createJourneyGemmaAdapter, deterministicJourneyInsight, JourneyIntelligenceCoordinator, makeJourneyIntelligenceContext, validateJourneyDecision, type JourneyDecision } from '../intelligence';
import { bridgeExistingGemmaCore, compactJourneyFacts } from '../gemma-core-bridge';
import type { JourneyInsight } from '../types';

vi.mock('../places', async importOriginal => ({
  ...await importOriginal<typeof import('../places')>(),
  stationsForRoute: (await import('./station-fixtures')).testStationsForRoute,
  amenitiesForRoute: (await import('./station-fixtures')).testAmenitiesForRoute,
}));

function context() {
  const planning = calculateJourneyPlan({ route: buildCuratedRoute('san-antonio', 'austin'), preferences: DEFAULT_PREFERENCES });
  return makeJourneyIntelligenceContext(planning, generateSimulationFrames(planning.requested, 'combined')[0]);
}
function decision(): JourneyDecision {
  const c = context();
  return { source: 'gemma4', model: 'gemma-4-26b-a4b-it', priority: 'critical', strategy: 'refuel',
    selectedPlanId: c.plan.id, stationId: c.plan.fuelStops[0].station.id, amenityId: null, diagnosticCodes: [] };
}
afterEach(() => vi.useRealTimers());
describe('journey intelligence integration adapter and safe fallback', () => {
  it('produces functional, accurately labeled fallback without any API requests', () => {
    const publish = vi.fn(), fetch = vi.spyOn(globalThis, 'fetch');
    const coordinator = new JourneyIntelligenceCoordinator(null, publish);
    const c = context();
    coordinator.update(c, 0); coordinator.update(c, 0);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0][0].source).toBe('fallback');
    expect(publish.mock.calls[0][0].explanation).toContain('explicit refill');
    expect(fetch).not.toHaveBeenCalled();
    coordinator.dispose(); fetch.mockRestore();
  });
  it('uses the supplied existing-core transport and validates feasible IDs before displaying Gemma status', async () => {
    const delegate = vi.fn(async () => decision());
    const adapter = createJourneyGemmaAdapter(delegate);
    const result = await adapter.analyze(context(), new AbortController().signal);
    expect(result.source).toBe('gemma4');
    expect(delegate).toHaveBeenCalledOnce();
    expect(result.explanation).toContain('Modeled travel');
  });
  it.each([
    { stationId: 'not-real' }, { amenityId: 'not-real' }, { selectedPlanId: 'not-real' },
    { model: 'other-client' }, { priority: 'low' }, { strategy: 'monitor' },
  ])('rejects ungrounded or unsafe proposal %j', overrides => {
    expect(validateJourneyDecision({ ...decision(), ...overrides } as JourneyDecision, context())).toBe(false);
  });
  it('bridges the existing core without introducing another client or forwarding full geometry', async () => {
    const c = context(), original = decision();
    const core = vi.fn(async () => ({
      source: 'gemma4' as const, model: original.model,
      insights: [{ source: 'gemma4' as const, priority: 'critical' as const, actions: ['refuel'], relatedStationId: original.stationId! }],
    }));
    const adapter = bridgeExistingGemmaCore(core);
    const result = await adapter.analyze(c, new AbortController().signal);
    expect(result.source).toBe('gemma4');
    expect(core).toHaveBeenCalledOnce();
    expect(compactJourneyFacts(c).preferences).toEqual(c.plan.preferences);
    expect(JSON.stringify(compactJourneyFacts(c))).not.toContain('coordinates');
  });
  it('does not label an existing-core fallback as Gemma-generated', async () => {
    const adapter = bridgeExistingGemmaCore(async () => ({ source: 'fallback', model: null, insights: [] }));
    await expect(adapter.analyze(context(), new AbortController().signal)).rejects.toThrow('model API is unavailable');
  });
  it('validates combined meal/fuel proposals by recalculating the amenity waypoint', () => {
    const c = context(), amenity = c.amenities.find(a => a.stationId === c.plan.fuelStops[0].station.id)!;
    expect(validateJourneyDecision({ ...decision(), strategy: 'combine-break', amenityId: amenity.id }, c)).toBe(true);
    const elsewhere = c.amenities.find(a => a.stationId !== c.plan.fuelStops[0].station.id)!;
    expect(validateJourneyDecision({ ...decision(), strategy: 'combine-break', amenityId: elsewhere.id }, c)).toBe(false);
  });
  it('does not suppress an active diagnostic concern or permit invented codes', () => {
    const c = context();
    const planning = calculateJourneyPlan({ route: c.plan.baseRoute, preferences: DEFAULT_PREFERENCES });
    const frames = generateSimulationFrames(c.plan, 'combined');
    const active = makeJourneyIntelligenceContext(planning, frames.find(f => f.telemetry.diagnostic_code !== null)!);
    expect(deterministicJourneyInsight(active).explanation).toContain('cause is not confirmed');
    expect(validateJourneyDecision({ ...decision(), strategy: 'evaluate-first', diagnosticCodes: ['P9999'] }, active)).toBe(false);
    expect(validateJourneyDecision({ ...decision(), strategy: 'evaluate-first', stationId: null, diagnosticCodes: ['P0301'] }, active)).toBe(true);
  });
  it('rejects arbitrary model-authored measurements or action commands', () => {
    expect(validateJourneyDecision({ ...decision(), explanation: 'Fuel magically increased' } as JourneyDecision, context())).toBe(false);
  });
  it('suppresses duplicate and in-flight explicit requests', async () => {
    const resolve: { current?: (value: JourneyInsight) => void } = {};
    const adapter = { analyze: vi.fn(() => new Promise<JourneyInsight>(r => { resolve.current = r; })) };
    const publish = vi.fn(), coordinator = new JourneyIntelligenceCoordinator(adapter, publish);
    const c = context();
    coordinator.update(c, 0); coordinator.update(c, 0); coordinator.update(c, 0, true);
    expect(adapter.analyze).toHaveBeenCalledOnce();
    resolve.current!({ ...deterministicJourneyInsight(c), source: 'gemma4' });
    await Promise.resolve();
    coordinator.dispose();
  });
  it('discards old model responses after seek/reset epochs and caches only current results', async () => {
    const resolvers: ((value: JourneyInsight) => void)[] = [];
    const adapter = { analyze: vi.fn(() => new Promise<JourneyInsight>(resolve => resolvers.push(resolve))) };
    const publish = vi.fn();
    const coordinator = new JourneyIntelligenceCoordinator(adapter, publish, Date.now, 0);
    const c = context();
    coordinator.update(c, 1); coordinator.update(c, 2);
    resolvers[0]({ ...deterministicJourneyInsight(c), source: 'gemma4', title: 'STALE' });
    await Promise.resolve();
    expect(publish.mock.calls.some(([i]) => i.title === 'STALE')).toBe(false);
    resolvers[1]({ ...deterministicJourneyInsight(c), source: 'gemma4', title: 'CURRENT' });
    await Promise.resolve();
    expect(coordinator.getSnapshot()!.title).toBe('CURRENT');
    coordinator.update(c, 2, true);
    expect(adapter.analyze).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });
  it('throttles requests and falls back after timeout/failure', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const adapter = { analyze: vi.fn(() => new Promise<JourneyInsight>(() => {})) };
    const publish = vi.fn(), coordinator = new JourneyIntelligenceCoordinator(adapter, publish);
    const c = context();
    coordinator.update(c, 1); coordinator.update(c, 2);
    expect(adapter.analyze).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.analyze).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(45000);
    expect(coordinator.getSnapshot()!.source).toBe('fallback');
    coordinator.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
