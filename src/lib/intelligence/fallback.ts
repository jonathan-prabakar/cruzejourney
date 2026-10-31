import type { PreparedContext, ProposedInsight, VehicleInsight, VehicleIntelligenceResult, SanitizedIntelligenceError } from './types';
import { renderInsight } from './render';

export const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
export function mandatoryInsights(context: PreparedContext, approvedStationId?: string): VehicleInsight[] {
  const result: VehicleInsight[] = [];
  const ids = new Set(context.facts.map(f => f.id));
  const add = (proposal: ProposedInsight) => result.push(renderInsight({
    ...proposal, evidenceIds: proposal.evidenceIds.filter(id => ids.has(id)),
  }, context, 'deterministic', true));
  const fuel = context.fuel;
  const stopFirst = context.coolantStatus === 'critical' ||
    context.diagnosticFindings.some(f => context.activeCodes.includes(f.code) && f.severity === 'critical');
  if (fuel.status.fuelStatus === 'LOW' || fuel.status.fuelStatus === 'CRITICAL' || fuel.status.routeSafety === 'INSUFFICIENT_RANGE') {
    const selected = stopFirst ? null : approvedStationId === undefined ? (context.eligibleStations.find(s => s.station.id === fuel.recommendation.station?.id)?.station ?? context.eligibleStations[0]?.station ?? null) :
      context.eligibleStations.find(s => s.station.id === approvedStationId)?.station ?? null;
    add({
      id: 'safety-fuel', category: 'fuel',
      priority: fuel.status.severity === 'critical' ? 'critical' : 'high',
      relationship: fuel.status.routeSafety === 'INSUFFICIENT_RANGE' ? 'fuel_route' : 'monitor',
      evidenceIds: ['fuel.percent', 'fuel.usable_range', 'fuel.reserve', 'route.remaining', 'fuel.status',
        ...(selected ? ['station.' + selected.id] : [])],
      actions: stopFirst ? ['stop_safely', 'seek_assistance'] : selected ? ['refuel'] : ['seek_assistance'],
      stationId: selected?.id ?? null, diagnosticCodes: [], confidence: 'limited',
    });
  }
  if (!context.telemetry || !fuel.fuel.valid || fuel.status.level === 'UNKNOWN') {
    add({ id: 'safety-unknown', category: 'fuel', priority: 'high', relationship: 'missing_data',
      evidenceIds: ['data.unknown'], actions: ['verify_data'], stationId: null, diagnosticCodes: [], confidence: 'limited' });
  }
  if (context.activeCodes.length) {
    const critical = context.diagnosticFindings.some(f => context.activeCodes.includes(f.code) && f.severity === 'critical');
    add({ id: 'safety-diagnostic', category: 'diagnostic', priority: critical ? 'critical' : 'high',
      relationship: 'observed_diagnostic',
      evidenceIds: [...context.activeCodes.map(c => 'diagnostic.' + c), 'telemetry.rpm', 'telemetry.speed', 'coolant.temperature'],
      actions: critical ? ['stop_safely', 'evaluate_diagnostic'] : ['evaluate_diagnostic'],
      stationId: null, diagnosticCodes: context.activeCodes, confidence: 'limited' });
  }
  if (context.coolantStatus === 'critical' || context.coolantStatus === 'elevated') {
    add({ id: 'safety-coolant', category: 'diagnostic', priority: context.coolantStatus === 'critical' ? 'critical' : 'high',
      relationship: 'coolant', evidenceIds: ['coolant.temperature', 'coolant.status'],
      actions: context.coolantStatus === 'critical' ? ['stop_safely', 'seek_assistance'] : ['evaluate_diagnostic'],
      stationId: null, diagnosticCodes: [], confidence: 'limited' });
  }
  // Temperature-related critical warnings take precedence over refueling convenience.
  return result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    (a.id === 'safety-coolant' ? -1 : b.id === 'safety-coolant' ? 1 : 0));
}
export function resultEnvelope(context: PreparedContext, insights: VehicleInsight[], source: VehicleIntelligenceResult['source'],
  model: string | null, now: number, error: SanitizedIntelligenceError | null = null): VehicleIntelligenceResult {
  return {
    overallAssessment: (source === 'fallback' ? 'Deterministic assessment: ' : 'Gemma-selected assessment: ') +
      (insights[0]?.title ?? 'No assessment available.') + ' ' + (insights[0]?.explanation ?? ''),
    topPriority: insights[0]?.id ?? null, insights, source, model,
    analyzedAt: new Date(now).toISOString(), telemetryTimestamp: context.telemetry?.timestamp ?? null,
    limitations: [...context.limitations, ...(source === 'fallback' ? ['Gemma reasoning is unavailable for this result; deterministic rules only.'] : [])],
    error, capabilities: { ...context.capabilities }, demoMode: context.demoMode,
  };
}
export function buildFallback(context: PreparedContext, now: number, error: SanitizedIntelligenceError | null = null): VehicleIntelligenceResult {
  const insights = mandatoryInsights(context);
  if (!insights.length) {
    const efficiency = context.efficiency?.status === 'concern' || context.efficiency?.status === 'critical';
    const available = context.facts.filter(f => efficiency ? f.domain === 'efficiency' : f.domain === 'fuel').slice(0, 5).map(f => f.id);
    insights.push(renderInsight({
      id: 'fallback-overview', category: efficiency ? 'efficiency' : 'fuel', priority: efficiency ? 'medium' : 'low',
      relationship: efficiency ? 'efficiency' : 'monitor', evidenceIds: available,
      actions: efficiency ? ['smooth_driving'] : ['monitor'], stationId: null, diagnosticCodes: [], confidence: 'limited',
    }, context, 'deterministic'));
  }
  return resultEnvelope(context, insights, 'fallback', null, now, error);
}
/** Bad context has no trusted measurements; provide a bounded empty-data response without retry loops. */
export function invalidContextFallback(now: number, error: SanitizedIntelligenceError): VehicleIntelligenceResult {
  return {
    overallAssessment: 'Vehicle context is unavailable. Verify input before relying on an assessment.',
    topPriority: 'safety-invalid-context',
    insights: [{
      id: 'safety-invalid-context', category: 'combined', priority: 'high', title: 'Verify vehicle context',
      explanation: 'Valid vehicle measurements are unavailable.', evidence: [], evidenceIds: [],
      recommendedAction: 'Verify the vehicle context before relying on a fuel or diagnostic plan.',
      actions: ['verify_data'], confidence: 'limited', source: 'deterministic', mandatory: true,
    }],
    source: 'fallback', model: null, analyzedAt: new Date(now).toISOString(), telemetryTimestamp: null,
    limitations: ['No trusted vehicle assessment could be calculated.', 'Gemma reasoning was not performed.'],
    error, capabilities: { diagnostics: 'observations-only', efficiency: 'unavailable' }, demoMode: false,
  };
}
