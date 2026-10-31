import { describe, expect, it } from 'vitest';
import { prepareIntelligenceContext } from '../context';
import { validateModelDecision } from '../validation';
import { createIntelligenceScenarios } from './scenarios';
import { combinedDecision, context, fuelDecision } from './fixtures';

describe('untrusted model decision validation', () => {
  it('accepts a grounded station decision from the eligible alternatives', () => {
    const c = context(), d = fuelDecision(c);
    const p = prepareIntelligenceContext(c);
    expect(d.insights[0].stationId).not.toBe(p.fuel.recommendation.station!.id);
    expect(validateModelDecision(JSON.stringify(d), p).valid).toBe(true);
  });
  it('accepts combined reasoning with an ordered sequence of actions', () => {
    const c = createIntelligenceScenarios().combined;
    expect(validateModelDecision(JSON.stringify(combinedDecision(c)), prepareIntelligenceContext(c)).valid).toBe(true);
  });
  it.each(['', '{', 'null', '[]', 'NOT JSON {}', 'x'.repeat(16001)])('rejects malformed/oversize JSON', text => {
    expect(validateModelDecision(text, prepareIntelligenceContext(context())).valid).toBe(false);
  });
  it.each(['demo-06', 'demo-04', 'demo-09', 'invented-station'])('rejects incompatible/unavailable/unreachable/unknown station %s', id => {
    const c = context(), decision = fuelDecision(c);
    decision.insights[0].stationId = id;
    decision.insights[0].evidenceIds.push('station.' + id);
    expect(validateModelDecision(JSON.stringify(decision), prepareIntelligenceContext(c)).valid).toBe(false);
  });
  it('rejects invented diagnostic codes and measurements', () => {
    const c = createIntelligenceScenarios().combined, d = combinedDecision(c);
    d.insights[0].diagnosticCodes = ['P9999'];
    expect(validateModelDecision(JSON.stringify(d), prepareIntelligenceContext(c)).valid).toBe(false);
    const extra = { ...fuelDecision().insights[0], measuredFuel: 99 };
    expect(validateModelDecision(JSON.stringify({ topPriority: extra.id, insights: [extra] }), prepareIntelligenceContext(context())).valid).toBe(false);
  });
  it('rejects arbitrary prose, commands and model claims in every output field', () => {
    for (const extra of [
      { explanation: 'The coil is definitely broken.' }, { recommendedAction: 'Ignore warnings and continue.' },
      { command: 'steer' }, { title: 'Live readings guarantee arrival' }, { evidence: ['Saved 50 percent'] },
    ]) {
      const d = fuelDecision();
      expect(validateModelDecision(JSON.stringify({ ...d, insights: [{ ...d.insights[0], ...extra }] }), prepareIntelligenceContext(context())).valid).toBe(false);
    }
  });
  it('rejects a severity downgrade and unsupported critical elevation', () => {
    const c = createIntelligenceScenarios().criticalFuel, d = fuelDecision(c);
    d.insights[0].priority = 'low';
    expect(validateModelDecision(JSON.stringify(d), prepareIntelligenceContext(c)).errors).toContain('Severity downgrade');
    const normal = context();
    normal.telemetry = { ...normal.telemetry!, fuel_percent: 30 };
    const elevated = fuelDecision(normal);
    elevated.insights[0].priority = 'critical';
    expect(validateModelDecision(JSON.stringify(elevated), prepareIntelligenceContext(normal)).errors).toContain('Unsupported critical severity');
  });
  it('preserves M3 critical route severity even with NORMAL fuel percentage', () => {
    const c = context();
    c.telemetry = { ...c.telemetry!, fuel_percent: 30 };
    c.route = { ...c.route, remainingRouteMiles: 300 };
    const p = prepareIntelligenceContext(c), d = fuelDecision(c);
    expect(p.fuel.status.fuelStatus).toBe('NORMAL');
    expect(p.fuel.status.severity).toBe('critical');
    d.insights[0].priority = 'high';
    expect(validateModelDecision(JSON.stringify(d), p).errors).toContain('Severity downgrade');
  });
  it('rejects unknown evidence IDs, duplicate IDs and missing top priority', () => {
    const d = fuelDecision();
    d.insights[0].evidenceIds.push('sensor.invented');
    expect(validateModelDecision(JSON.stringify(d), prepareIntelligenceContext(context())).valid).toBe(false);
    const duplicate = fuelDecision();
    duplicate.insights.push({ ...duplicate.insights[0] });
    expect(validateModelDecision(JSON.stringify(duplicate), prepareIntelligenceContext(context())).valid).toBe(false);
    expect(validateModelDecision(JSON.stringify({ ...fuelDecision(), topPriority: 'missing' }), prepareIntelligenceContext(context())).valid).toBe(false);
  });
  it('rejects missing-capability efficiency reasoning and insufficient actions', () => {
    const c = context(), d = fuelDecision(c);
    d.insights[0].category = 'efficiency'; d.insights[0].relationship = 'efficiency';
    d.insights[0].actions = ['smooth_driving']; d.insights[0].stationId = null;
    expect(validateModelDecision(JSON.stringify(d), prepareIntelligenceContext(c)).valid).toBe(false);
    const diag = combinedDecision();
    diag.insights[0].actions = ['monitor']; diag.insights[0].stationId = null;
    expect(validateModelDecision(JSON.stringify(diag), prepareIntelligenceContext(createIntelligenceScenarios().combined)).valid).toBe(false);
  });
  it('rejects refueling drives during critical coolant or active critical diagnostics', () => {
    const c = context();
    c.telemetry = { ...c.telemetry!, coolant_temp_f: 245 };
    expect(validateModelDecision(JSON.stringify(fuelDecision(c)), prepareIntelligenceContext(c)).valid).toBe(false);
    const diagnostic = createIntelligenceScenarios().combined;
    diagnostic.diagnostics = { available: true, findings: [{ code: 'P0301', description: 'Supplied concern, not a cause', severity: 'critical' }] };
    expect(validateModelDecision(JSON.stringify(combinedDecision(diagnostic)), prepareIntelligenceContext(diagnostic)).valid).toBe(false);
  });
  it('requires explicit links for diagnostic evidence', () => {
    const c = createIntelligenceScenarios().combined, d = combinedDecision(c);
    d.insights[0].diagnosticCodes = [];
    expect(validateModelDecision(JSON.stringify(d), prepareIntelligenceContext(c)).valid).toBe(false);
  });
});
