import { createIntelligenceScenarios } from './scenarios';
import { prepareIntelligenceContext } from '../context';
import { buildFallback } from '../fallback';
import type { IntelligenceModel, ModelDecision, ProposedInsight, VehicleIntelligenceContext, VehicleIntelligenceResult } from '../types';

export const now = Date.parse('2026-10-31T12:00:00Z');
export function context(): VehicleIntelligenceContext { return createIntelligenceScenarios().lowFuel; }
export function fuelDecision(c: VehicleIntelligenceContext = context()): ModelDecision {
  const prepared = prepareIntelligenceContext(c);
  // Mock deliberately selects an alternative, proving Gemma is not limited to paraphrasing M3.
  const selected = prepared.eligibleStations.at(-1);
  return {
    topPriority: 'ai-fuel',
    insights: [{
      id: 'ai-fuel', category: 'fuel',
      priority: prepared.fuel.status.severity === 'critical' ? 'critical' : 'high',
      relationship: selected ? 'station_tradeoff' : 'fuel_route',
      evidenceIds: ['fuel.percent', 'fuel.usable_range', 'route.remaining', ...(selected ? ['station.' + selected.station.id] : [])],
      actions: selected ? ['refuel'] : ['seek_assistance'],
      stationId: selected?.station.id ?? null, diagnosticCodes: [], confidence: 'limited',
    }],
  };
}
export function combinedDecision(c = createIntelligenceScenarios().combined): ModelDecision {
  const prepared = prepareIntelligenceContext(c);
  const selected = prepared.eligibleStations[0];
  const p: ProposedInsight = {
    id: 'ai-combined', category: 'combined', priority: prepared.fuel.status.severity === 'critical' ? 'critical' : 'high', relationship: 'fuel_diagnostic',
    evidenceIds: ['fuel.percent', 'fuel.usable_range', 'diagnostic.P0301', 'telemetry.rpm',
      ...(selected ? ['station.' + selected.station.id] : [])],
    actions: selected ? ['evaluate_diagnostic', 'refuel'] : ['evaluate_diagnostic', 'seek_assistance'],
    stationId: selected?.station.id ?? null, diagnosticCodes: ['P0301'], confidence: 'limited',
  };
  return { topPriority: p.id, insights: [p] };
}
export function model(decision: ModelDecision = fuelDecision()): IntelligenceModel {
  return { modelId: 'gemma-4-26b-a4b-it', generate: async () => JSON.stringify(decision) };
}
export function transportResult(c: VehicleIntelligenceContext): VehicleIntelligenceResult {
  return { ...buildFallback(prepareIntelligenceContext(c), now), source: 'gemma4', model: 'gemma-4-26b-a4b-it' };
}
