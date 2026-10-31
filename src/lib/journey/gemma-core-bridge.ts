import { IntelligenceError } from '../intelligence/errors';
import type { SanitizedIntelligenceError } from '../intelligence/types';
import { createJourneyGemmaAdapter, type JourneyDecision } from './intelligence';
import { JOURNEY_VEHICLE, PLANNING_MPG } from './planner';
import type { FuelStation } from '../fuel/types';
import type { VehicleTelemetry, VehicleProfile } from '../telemetry/types';
import type { JourneyIntelligenceContext } from './types';

/** Structural contract for the existing Gemma core, not another model client. */
export interface ExistingGemmaCoreInput {
  telemetry: VehicleTelemetry;
  history: VehicleTelemetry[];
  vehicle: VehicleProfile;
  route: { currentDistanceAlongRouteMiles: number; remainingRouteMiles: number; distanceSource: 'simulated' };
  stations: FuelStation[];
  requiredFuelType: string;
  fuelConfig: { planningMpg: number; reservePercent: number };
  diagnostics: { available: true; findings: JourneyIntelligenceContext['diagnostics'] };
  efficiency: import('../intelligence/types').EfficiencyFinding | null;
  demoMode: true;
  /** Optional extension point: add these grounded facts to the existing core's evidence catalog/prompt. */
  journey: ReturnType<typeof compactJourneyFacts>;
}
export interface ExistingGemmaCoreResult {
  source: 'gemma4' | 'fallback';
  model: string | null;
  error?: SanitizedIntelligenceError | null;
  analyzedAt?: string;
  insights: {
    evidence?: string[];
    source: 'gemma4' | 'deterministic';
    priority: 'critical' | 'high' | 'medium' | 'low';
    actions: string[];
    relatedStationId?: string;
    relatedDiagnosticCodes?: string[];
  }[];
  /** A journey-aware extension may return this already-structured proposal; it is validated again. */
  journeyDecision?: JourneyDecision;
}
export function compactJourneyFacts(context: JourneyIntelligenceContext) {
  const summarize = (p: JourneyIntelligenceContext['plan']) => ({
    id: p.id, feasible: p.feasible, distanceMiles: p.totalDistanceMiles, durationSeconds: p.durationSeconds,
    arrivalFuelPercent: p.arrivalFuelPercent, purchaseCost: p.purchaseCost,
    stationIds: p.fuelStops.map(s => s.station.id), amenityIds: p.amenityStops.map(a => a.id),
  });
  return {
    connectedJourneys: context.connectedJourneys,
    originId: context.plan.baseRoute.origin.id, destinationId: context.plan.baseRoute.destination.id,
    waypoints: context.plan.waypoints,
    origin: context.plan.baseRoute.origin.name, destination: context.plan.baseRoute.destination.name,
    preferences: context.plan.preferences, progressMiles: context.frame.distanceMiles,
    phase: context.frame.phase, elapsedSeconds: context.frame.elapsedSeconds,
    current: summarize(context.plan), alternatives: context.alternatives.slice(0, 4).map(summarize),
    fictionalAmenities: context.amenities.map(a => ({
      id: a.id, stationId: a.stationId, name: a.name, category: a.category, modeledAccessMiles: a.extraDistanceMiles,
    })),
    sourceNotice: 'Synthetic telemetry, fictional stops/prices/amenities, cached road route plus modeled access. No live driving or guaranteed arrival.',
  };
}
export function journeyCoreInput(context: JourneyIntelligenceContext): ExistingGemmaCoreInput {
  return {
    telemetry: context.frame.telemetry, history: [], vehicle: JOURNEY_VEHICLE,
    route: { currentDistanceAlongRouteMiles: context.frame.baseRouteMiles,
      remainingRouteMiles: context.frame.remainingDistanceMiles, distanceSource: 'simulated' },
    stations: context.fuel.recommendation.assessments.map(a => a.station), requiredFuelType: 'diesel',
    fuelConfig: { planningMpg: PLANNING_MPG, reservePercent: 10 },
    diagnostics: { available: true, findings: context.diagnostics }, efficiency: context.efficiency ?? null, demoMode: true,
    journey: compactJourneyFacts(context),
  };
}

/**
 * Wire analyzeVehicleIntelligence from @/lib/intelligence/server after the integration merge.
 * The original core can supply grounded fuel/diagnostic decisions. Full preference/meal reasoning
 * additionally needs its prompt/context extension to consume input.journey.
 */
export function bridgeExistingGemmaCore(analyzeVehicleIntelligence: (
  context: ExistingGemmaCoreInput, options: { signal: AbortSignal },
) => Promise<ExistingGemmaCoreResult>) {
  return {
    async analyze(context: JourneyIntelligenceContext, signal: AbortSignal) {
      const result = await analyzeVehicleIntelligence(journeyCoreInput(context), { signal });
      if (result.source !== 'gemma4' || !result.model) throw new IntelligenceError(result.error?.code ?? 'API_UNAVAILABLE');
      const insight = result.insights.find(i => i.source === 'gemma4');
      if (!insight) throw new IntelligenceError('INVALID_OUTPUT');
      const stationId = insight.relatedStationId ?? null;
      const selected = [context.plan, ...context.alternatives].find(p =>
        p.feasible && (stationId === null || p.fuelStops.some(s => s.station.id === stationId)));
      if (!selected) throw new IntelligenceError('INVALID_OUTPUT');
      const decision: JourneyDecision = result.journeyDecision ?? {
        source: 'gemma4', model: result.model, priority: insight.priority,
        strategy: insight.actions[0] === 'evaluate_diagnostic' ? 'evaluate-first'
          : insight.actions.some(a => a === 'stop_safely' || a === 'seek_assistance') ? 'seek-assistance'
          : insight.actions.includes('refuel') ? 'refuel' : 'monitor',
        selectedPlanId: selected.id, stationId, amenityId: null,
        diagnosticCodes: insight.relatedDiagnosticCodes ?? [],
      };
      const grounded = await createJourneyGemmaAdapter(async () => decision).analyze(context, signal);
      return {
        ...grounded, model: result.model, analyzedAt: result.analyzedAt,
        telemetryTimestamp: context.frame.telemetry.timestamp,
        evidence: result.insights.filter(i => i.source === 'gemma4').flatMap(i => i.evidence ?? []).slice(0, 8),
      };
    },
  };
}
