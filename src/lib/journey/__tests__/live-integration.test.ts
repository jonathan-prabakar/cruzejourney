import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCuratedRoute } from '../routes';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../planner';
import { generateSimulationFrames } from '../simulation';
import { makeJourneyIntelligenceContext, validateJourneyDecision } from '../intelligence';
import { journeyRequest } from '../request';
import { resolveJourneyContext } from '../context.server';
import { bridgeExistingGemmaCore } from '../gemma-core-bridge';
import { analyzeVehicleIntelligence } from '../../intelligence/orchestrator.server';
import { prepareIntelligenceContext } from '../../intelligence/context';
import { buildIntelligencePrompt } from '../../intelligence/prompts';
import { validateModelDecision } from '../../intelligence/validation';
import { isSameOrigin } from '../../intelligence/origin.server';
import { gemmaConfiguration } from '../../intelligence/configuration';
import { combinedDecision, fuelDecision } from '../../intelligence/__tests__/fixtures';
import { POST } from '../../../app/api/intelligence/journey/route';

function setup(active = false) {
  const planning = calculateJourneyPlan({ route: buildCuratedRoute('san-antonio', 'austin'), preferences: DEFAULT_PREFERENCES });
  const frames = generateSimulationFrames(planning.requested, 'combined');
  const frame = active ? frames.find(f => f.telemetry.diagnostic_code === 'P0301')! : frames[0];
  const request = journeyRequest(makeJourneyIntelligenceContext(planning, frame));
  return { request, ...resolveJourneyContext(request) };
}
function proposal(active = false) {
  const input = setup(active);
  const choice = active ? combinedDecision(input.core) : fuelDecision(input.core);
  const top = choice.insights[0];
  if (!active) {
    top.stationId = input.journey.plan.fuelStops[0].station.id;
    top.evidenceIds = ['fuel.percent', 'route.remaining', 'station.' + top.stationId];
  } else {
    // Evaluation/assistance does not recommend driving to a station.
    top.stationId = null; top.actions = ['evaluate_diagnostic', 'seek_assistance'];
    top.evidenceIds = ['fuel.percent', 'fuel.usable_range', 'diagnostic.P0301'];
  }
  choice.journeyChoice = { selectedPlanId: input.journey.plan.id, stationId: top.stationId, amenityId: null };
  return { ...input, choice };
}
afterEach(() => vi.unstubAllEnvs());
describe('merged journey and existing Gemma integration', () => {
  it('rebuilds selected simulation and M4 findings without trusting browser measurements', () => {
    const { request, core } = setup(true);
    expect(core.telemetry.diagnostic_code).toBe('P0301');
    expect(core.diagnostics.available).toBe(true);
    expect(core.diagnostics.findings[0].description).toContain('Cylinder 1 misfire');
    expect(core.efficiency).toBeNull();
    expect(core.history.every(r => r.timestamp <= core.telemetry.timestamp)).toBe(true);
    expect(() => resolveJourneyContext({ ...request, fuelRange: 99999 })).toThrow();
    expect(() => resolveJourneyContext({ ...request, elapsedSeconds: -1 })).toThrow();
    expect(() => resolveJourneyContext({ ...request, elapsedSeconds: 123.456 })).toThrow();
    expect(() => resolveJourneyContext({ ...request, waypoints: [{ id: 'invented', kind: 'fuel' }] })).toThrow();
  });
  it('passes preferences, meal options, scenario and progress into the existing prompt', () => {
    const { core } = setup(true);
    const prepared = prepareIntelligenceContext(core);
    const prompt = buildIntelligencePrompt(prepared);
    expect(prompt).toContain('"scenario":"combined"');
    expect(prompt).toContain('fictionalAmenities');
    expect(prompt).toContain('journeyChoice');
    expect(prompt).toContain('diagnostic.P0301');
    expect(prepared.capabilities.efficiency).toBe('unavailable');
    expect(prompt).not.toContain('"coordinates"');
  });
  it('accepts a real-shaped combined decision through both validators and the existing bridge (mocked inference)', async () => {
    const { core, journey, choice } = proposal(true);
    const result = await analyzeVehicleIntelligence(core, {
      model: { modelId: 'gemma-4-26b-a4b-it', generate: async () => JSON.stringify(choice) },
    });
    expect(result.error).toBeNull();
    expect(validateJourneyDecision(result.journeyDecision!, journey)).toBe(true);
    const insight = await bridgeExistingGemmaCore(async () => result).analyze(journey, new AbortController().signal);
    expect(insight.source).toBe('gemma4');
    expect(insight.diagnosticCodes).toEqual(['P0301']);
    expect(insight.evidence).toContainEqual(expect.stringContaining('P0301'));
    expect(insight.telemetryTimestamp).toBe(journey.frame.telemetry.timestamp);
  });
  it('accepts a feasible same-station meal choice and rejects invented plans/amenities', async () => {
    const { core, journey, choice } = proposal();
    const meal = journey.amenities.find(a => a.category === 'restaurant' && a.stationId === choice.journeyChoice!.stationId)!;
    choice.journeyChoice!.amenityId = meal.id;
    expect(validateModelDecision(JSON.stringify(choice), prepareIntelligenceContext(core)).valid).toBe(true);
    const result = await analyzeVehicleIntelligence(core, { model: { modelId: 'gemma-4-26b-a4b-it', generate: async () => JSON.stringify(choice) } });
    expect(validateJourneyDecision(result.journeyDecision!, journey)).toBe(true);
    choice.journeyChoice!.amenityId = 'invented';
    expect(validateModelDecision(JSON.stringify(choice), prepareIntelligenceContext(core)).valid).toBe(false);
    choice.journeyChoice!.selectedPlanId = 'invented';
    expect(validateModelDecision(JSON.stringify(choice), prepareIntelligenceContext(core)).valid).toBe(false);
  });
  it('rejects itinerary switching after progress, even to another feasible plan', () => {
    const { core, journey, choice } = proposal(true);
    choice.journeyChoice!.selectedPlanId = journey.alternatives.find(p => p.feasible)!.id;
    expect(validateModelDecision(JSON.stringify(choice), prepareIntelligenceContext(core)).valid).toBe(false);
  });
  it('requires same-origin POST and returns safe fallback without configured credentials', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { request } = setup();
    const make = (origin: string) => new Request('http://localhost/api/intelligence/journey', {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(request),
    });
    expect((await POST(make('https://other.example'))).status).toBe(401);
    const response = await POST(make('http://localhost'));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.source).toBe('fallback');
    expect(result.error.code).toBe('MISSING_API_KEY');
  });
  it('accepts the actual browser Host when Next uses a wildcard bind address and rejects other origins', () => {
    const request = (origin: string, host = 'localhost:3003') => new Request('http://0.0.0.0:3003/api/intelligence', { headers: { origin, host } });
    expect(isSameOrigin(request('http://localhost:3003'))).toBe(true);
    expect(isSameOrigin(request('http://other.example'))).toBe(false);
    expect(isSameOrigin(request('https://localhost:3003'))).toBe(false);
    expect(isSameOrigin(request('http://localhost:3003', 'localhost:3003/path'))).toBe(false);
  });
  it('distinguishes missing/placeholder, configured-unverified and unsupported configuration without returning secrets', () => {
    expect(gemmaConfiguration({ GEMINI_API_KEY: 'your-server-key' }).status).toBe('API_KEY_MISSING');
    const config = gemmaConfiguration({ GEMINI_API_KEY: 'test-only-config-value' });
    expect(config.status).toBe('CONFIGURED_NOT_TESTED');
    expect(JSON.stringify(config)).not.toContain('test-only-config-value');
    expect(gemmaConfiguration({ GEMINI_API_KEY: 'test', GEMMA_MODEL: 'other-model' }).status).toBe('MODEL_UNAVAILABLE');
  });
});
