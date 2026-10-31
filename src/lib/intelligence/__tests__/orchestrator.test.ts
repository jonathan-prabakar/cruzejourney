import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeVehicleIntelligence } from '../orchestrator.server';
import { createIntelligenceScenarios } from './scenarios';
import { prepareIntelligenceContext } from '../context';
import { context, model, fuelDecision, combinedDecision, now } from './fixtures';
import type { IntelligenceModel, ModelDecision } from '../types';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('Gemma orchestration with mocked model responses', () => {
  it('makes a real model-port call, permits an alternative station choice, and keeps mandatory warnings', async () => {
    const c = context(), client = model(fuelDecision(c));
    const generate = vi.spyOn(client, 'generate');
    const r = await analyzeVehicleIntelligence(c, { model: client, now: () => now });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toContain('eligibleStations');
    expect(r.source).toBe('gemma4');
    expect(r.insights[0].relatedStationId).toBe(fuelDecision(c).insights[0].stationId);
    expect(r.insights[0].relatedStationId).not.toBe(c.fuelIntelligence!.recommendation.station!.id);
    expect(r.insights.find(i => i.id === 'safety-fuel')!.mandatory).toBe(true);
    expect(r.insights.find(i => i.id === 'safety-fuel')!.relatedStationId).toBe(r.insights[0].relatedStationId);
    expect(r.insights[0].confidence).toBe('limited');
    expect(r.telemetryTimestamp).toBe(c.telemetry!.timestamp);
  });
  it('uses Gemma-selected combined reasoning and action ordering rather than a fuel paraphrase', async () => {
    const c = createIntelligenceScenarios().combined;
    const r = await analyzeVehicleIntelligence(c, { model: model(combinedDecision(c)), now: () => now });
    expect(r.source).toBe('gemma4');
    expect(r.topPriority).toBe('ai-combined');
    expect(r.insights[0].category).toBe('combined');
    expect(r.insights[0].actions[0]).toBe('evaluate_diagnostic');
    expect(r.insights[0].explanation).toContain('does not establish a causal connection');
    expect(r.insights.map(i => i.id)).toEqual(expect.arrayContaining(['safety-fuel', 'safety-diagnostic']));
  });
  it('critical fuel never gains a fabricated refueling choice', async () => {
    const c = createIntelligenceScenarios().criticalFuel;
    const r = await analyzeVehicleIntelligence(c, { model: model(fuelDecision(c)), now: () => now });
    expect(r.source).toBe('gemma4');
    expect(r.insights.every(i => !i.relatedStationId)).toBe(true);
    expect(r.insights[0].priority).toBe('critical');
  });
  it('accepts a code-only concern without claiming a mechanical fault', async () => {
    const c = createIntelligenceScenarios().diagnostic;
    const decision: ModelDecision = {
      topPriority: 'ai-code', insights: [{
        id: 'ai-code', category: 'diagnostic', priority: 'high', relationship: 'observed_diagnostic',
        evidenceIds: ['diagnostic.P0301', 'telemetry.rpm', 'telemetry.speed', 'coolant.temperature'],
        actions: ['evaluate_diagnostic'], stationId: null, diagnosticCodes: ['P0301'], confidence: 'limited',
      }],
    };
    const r = await analyzeVehicleIntelligence(c, { model: model(decision), now: () => now });
    expect(r.source).toBe('gemma4');
    expect(r.insights[0].explanation).toContain('does not confirm a mechanical cause');
  });
  it('falls back without an API key, with sanitized diagnostics only', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const report = vi.fn();
    const r = await analyzeVehicleIntelligence(context(), { now: () => now, onError: report });
    expect(r.source).toBe('fallback');
    expect(r.error?.code).toBe('MISSING_API_KEY');
    expect(report).toHaveBeenCalledWith(r.error);
  });
  it('unknown configured models fail safely without changing model silently', async () => {
    vi.stubEnv('GEMMA_MODEL', 'not-a-model');
    const r = await analyzeVehicleIntelligence(context(), { now: () => now });
    expect(r.error?.code).toBe('UNKNOWN_MODEL');
    expect(r.source).toBe('fallback');
  });
  it.each([[401, 'AUTHENTICATION_FAILED'], [403, 'AUTHENTICATION_FAILED'], [429, 'RATE_LIMIT'], [404, 'UNKNOWN_MODEL'], [500, 'API_UNAVAILABLE']] as const)(
    'handles API %s with no raw error leakage', async (status, code) => {
      const client: IntelligenceModel = { modelId: 'gemma-4-26b-a4b-it', generate: async () => { throw { status, message: 'secret-token and private telemetry' }; } };
      const r = await analyzeVehicleIntelligence(context(), { model: client, now: () => now });
      expect(r.source).toBe('fallback'); expect(r.error?.code).toBe(code);
      expect(JSON.stringify(r)).not.toContain('secret-token');
    },
  );
  it('has a hard deadline even when a model ignores cancellation', async () => {
    vi.useFakeTimers();
    const generate = vi.fn((prompt: string, signal: AbortSignal) => { void prompt; void signal; return new Promise<string>(() => {}); });
    const promise = analyzeVehicleIntelligence(context(), { model: { modelId: 'mock', generate }, timeoutMs: 50, now: () => now });
    await vi.advanceTimersByTimeAsync(50);
    const r = await promise;
    expect(r.error?.code).toBe('TIMEOUT');
    expect(generate.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('honors cancellation and rejects stale late model completions', async () => {
    const abort = new AbortController();
    let complete!: (text: string) => void;
    const promise = analyzeVehicleIntelligence(context(), {
      model: { modelId: 'mock', generate: () => new Promise(resolve => { complete = resolve; }) },
      signal: abort.signal, now: () => now,
    });
    abort.abort();
    const result = await promise;
    expect(result.error?.code).toBe('CANCELLED');
    complete(JSON.stringify(fuelDecision()));
    expect(result.source).toBe('fallback');
  });
  it.each(['invalid json', JSON.stringify({ insights: [] })])('rejects invalid model output', async text => {
    const r = await analyzeVehicleIntelligence(context(), { model: { modelId: 'mock', generate: async () => text }, now: () => now });
    expect(r.error?.code).toBe('INVALID_OUTPUT'); expect(r.source).toBe('fallback');
    expect(r.insights.some(i => i.mandatory)).toBe(true);
  });
  it('allows one validated output repair without weakening grounding', async () => {
    const generate = vi.fn().mockResolvedValueOnce('invalid JSON').mockResolvedValueOnce(JSON.stringify(fuelDecision()));
    const result = await analyzeVehicleIntelligence(context(), { model: { modelId: 'gemma-4-26b-a4b-it', generate } });
    expect(result.source).toBe('gemma4');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain('previous decision was REJECTED');
  });
  it('requires the selected station citation even during repair and supplies its exact trusted ID', async () => {
    const valid = fuelDecision();
    const incomplete = structuredClone(valid);
    const evidence = 'station.' + incomplete.insights[0].stationId;
    incomplete.insights[0].evidenceIds = incomplete.insights[0].evidenceIds.filter(id => id !== evidence);
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify(incomplete)).mockImplementationOnce(async (prompt: string) => {
      expect(prompt).toContain(evidence);
      expect(prompt).toContain('exact station.ID evidence reference');
      return JSON.stringify(valid);
    });
    expect((await analyzeVehicleIntelligence(context(), { model: { modelId: 'gemma-4-26b-a4b-it', generate } })).source).toBe('gemma4');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('bounds output repair to two total generations and keeps fallback when both fail', async () => {
    const generate = vi.fn(async () => 'not JSON');
    const result = await analyzeVehicleIntelligence(context(), { model: { modelId: 'gemma-4-26b-a4b-it', generate } });
    expect(result.error?.code).toBe('INVALID_OUTPUT');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('does not call a model with invalid context or an already-cancelled request', async () => {
    const client = model(), generate = vi.spyOn(client, 'generate');
    const invalid = context(); invalid.history = Array.from({ length: 121 }, () => invalid.telemetry!);
    expect((await analyzeVehicleIntelligence(invalid, { model: client, now: () => now })).error?.code).toBe('INVALID_CONTEXT');
    const abort = new AbortController(); abort.abort();
    expect((await analyzeVehicleIntelligence(context(), { model: client, signal: abort.signal, now: () => now })).error?.code).toBe('CANCELLED');
    expect(generate).not.toHaveBeenCalled();
  });
  it('does not call Gemma when no current measurement exists', async () => {
    const c = context(); c.telemetry = null;
    const client = model(), generate = vi.spyOn(client, 'generate');
    const result = await analyzeVehicleIntelligence(c, { model: client, now: () => now });
    expect(result.source).toBe('fallback');
    expect(result.insights[0].id).toBe('safety-unknown');
    expect(generate).not.toHaveBeenCalled();
  });
  it('keeps fallback functional if an application error logger throws', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const result = await analyzeVehicleIntelligence(context(), {
      onError: () => { throw new Error('logger'); }, now: () => now,
    });
    expect(result.error?.code).toBe('MISSING_API_KEY');
  });
  it('preserves critical warnings when Gemma focuses on a different issue', async () => {
    const c = createIntelligenceScenarios().combined;
    c.telemetry = { ...c.telemetry!, coolant_temp_f: 245 };
    const d = combinedDecision(c);
    d.insights[0].actions = ['evaluate_diagnostic', 'seek_assistance'];
    d.insights[0].stationId = null;
    const r = await analyzeVehicleIntelligence(c, { model: model(d), now: () => now });
    expect(r.source).toBe('gemma4');
    expect(r.topPriority).toBe('safety-coolant');
    expect(r.insights[0].priority).toBe('critical');
    expect(r.insights[0].actions[0]).toBe('stop_safely');
  });
  it('supports a future efficiency adapter without inventing savings', async () => {
    const c = context();
    c.efficiency = { status: 'concern', metrics: [{ id: 'average', label: 'Recent MPG', value: 6.5, unit: 'mpg' }] };
    const d = fuelDecision(c);
    d.insights.unshift({
      id: 'ai-efficiency', category: 'combined', priority: 'medium', relationship: 'efficiency_route',
      evidenceIds: ['efficiency.average', 'route.remaining'], actions: ['smooth_driving'],
      stationId: null, diagnosticCodes: [], confidence: 'limited',
    });
    const r = await analyzeVehicleIntelligence(c, { model: model(d), now: () => now });
    expect(r.source).toBe('gemma4');
    expect(r.insights.some(i => i.id === 'ai-efficiency')).toBe(true);
    expect(r.insights.find(i => i.id === 'ai-efficiency')!.explanation).toContain('no savings or causal effect');
    expect(prepareIntelligenceContext(c).capabilities.efficiency).toBe('available');
  });
});
