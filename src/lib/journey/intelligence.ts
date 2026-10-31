import { IntelligenceError, sanitizeError } from '../intelligence/errors';
import type { SanitizedIntelligenceError } from '../intelligence/types';
import { fuelOptions } from '../vehicle/fuel-options';
import { calculateFuelIntelligence } from '../fuel/intelligence';
import { evaluateItinerary, JOURNEY_VEHICLE, PLANNING_MPG } from './planner';
import { rawDiagnosticAdapter } from './simulation';
import type { JourneyIntelligenceAdapter, JourneyIntelligenceContext, JourneyInsight, JourneyPlanningResult, SimulationFrame, DiagnosticsAdapter } from './types';

export function makeJourneyIntelligenceContext(planning: JourneyPlanningResult, frame: SimulationFrame, diagnosticsAdapter: DiagnosticsAdapter = rawDiagnosticAdapter): JourneyIntelligenceContext {
  const plan = planning.requested;
  const liveMpg = frame.phase === 'driving' && frame.telemetry.mpg > 0 ? Math.min(PLANNING_MPG, frame.telemetry.mpg) : plan.planningMpg ?? PLANNING_MPG;
  const fuel = calculateFuelIntelligence({
    telemetry: frame.telemetry, vehicle: JOURNEY_VEHICLE,
    route: { currentDistanceAlongRouteMiles: frame.baseRouteMiles, remainingRouteMiles: frame.remainingDistanceMiles, distanceSource: 'simulated' },
    stations: planning.stations.map(s => ({ ...s, detourMiles: frame.stopId === s.id && frame.phase === 'fuel-stop' ? 0 : s.detourMiles })),
    requiredFuelType: 'diesel', config: { planningMpg: liveMpg, reservePercent: 10 },
  });
  const compared = fuelOptions(planning, frame);
  return { plan, alternatives: [planning.recommended, ...planning.alternatives].filter((p): p is NonNullable<typeof p> => p !== null && p.id !== plan.id),
    proposals: compared.needed ? compared.options.slice(0, 4).map(o => o.plan) : [],
    frame, fuel, diagnostics: diagnosticsAdapter.evaluate(frame.telemetry), amenities: planning.amenities };
}
export function deterministicJourneyInsight(context: JourneyIntelligenceContext): JourneyInsight {
  const { plan, fuel, diagnostics, frame } = context;
  const meal = plan.amenityStops.some(a => a.category === 'restaurant');
  const station = plan.fuelStops.find(s => s.leg.cumulativeTravelMiles >= frame.distanceMiles - 1e-6);
  return {
    source: 'fallback', priority: !plan.feasible || fuel.status.severity === 'critical' ? 'critical' : diagnostics.length ? 'high' : 'medium',
    title: !plan.feasible ? 'Revise this itinerary before driving' : diagnostics.length ? 'Coordinate vehicle evaluation and refueling' : station ? 'A fuel stop keeps the reserve intact' : 'Your reviewed journey is ready',
    explanation: !plan.feasible ? plan.warnings.join(' ') : diagnostics.length
      ? 'P0301 is present in simulated telemetry. Its cause is not confirmed. Reassess continuing before optimizing travel time. ' + fuel.status.explanation
      : station ? 'The reviewed plan includes ' + station.station.name + ' at ' + station.leg.cumulativeTravelMiles.toFixed(1) + ' modeled miles, with an explicit refill. ' +
        (meal ? 'A selected fictional restaurant break can be combined with the itinerary. ' : '') + 'Planning uses 7.5 MPG and a 10% tank reserve.'
      : 'The itinerary is feasible under the planning assumptions. Arrival fuel is estimated, not guaranteed.',
    action: !plan.feasible ? 'Arrange refueling or assistance; do not continue beyond modeled usable range.'
      : diagnostics.length ? 'Arrange qualified evaluation; use the fuel plan only if continuing is appropriate. Stop safely and seek assistance if vehicle warnings or symptoms require it.'
      : station ? 'Inspect the planned stop and available amenities. Do not travel beyond modeled usable range.'
      : 'Monitor vehicle measurements and follow the route preview.',
    selectedPlanId: plan.feasible ? plan.id : null, stationId: station?.station.id ?? null,
    amenityId: plan.amenityStops.find(a => a.category === 'restaurant')?.id ?? null, diagnosticCodes: diagnostics.map(d => d.code),
  };
}
export function validateJourneyDecision(value: JourneyDecision, context: JourneyIntelligenceContext): boolean {
  if (!value || Object.keys(value).sort().join(',') !== ['source','model','priority','strategy','selectedPlanId','stationId','amenityId','diagnosticCodes'].sort().join(',') ||
      !['critical','high','medium','low'].includes(value.priority)) return false;
  if (value.source !== 'gemma4' || !['gemma-4-26b-a4b-it', 'gemma-4-31b-it'].includes(value.model)) return false;
  const eligiblePlans = [context.plan, ...context.alternatives, ...(context.proposals ?? [])].filter(p => p.feasible);
  const selected = eligiblePlans.find(p => p.id === value.selectedPlanId);
  if (!selected || (context.frame.distanceMiles > 0 && selected.id !== context.plan.id && !context.proposals?.some(p => p.id === selected.id))) return false;
  if (!['refuel', 'evaluate-first', 'combine-break', 'monitor', 'seek-assistance'].includes(value.strategy)) return false;
  if (value.stationId !== null && (!selected.fuelStops.some(s => s.station.id === value.stationId) ||
      !context.fuel.recommendation.assessments.some(a => a.station.id === value.stationId && a.status === 'REACHABLE'))) return false;
  if (value.amenityId !== null && !context.amenities.some(a => a.id === value.amenityId)) return false;
  if (!Array.isArray(value.diagnosticCodes) || value.diagnosticCodes.length > 4 || new Set(value.diagnosticCodes).size !== value.diagnosticCodes.length || value.diagnosticCodes.some(code => !context.diagnostics.some(d => d.code === code))) return false;
  if (value.strategy === 'evaluate-first' && !context.diagnostics.length) return false;
  if (value.strategy === 'combine-break' && (value.stationId === null || value.amenityId === null ||
      context.amenities.find(a => a.id === value.amenityId)?.stationId !== value.stationId)) return false;
  if (value.strategy === 'refuel' && !value.stationId) return false;
  if (context.diagnostics.length && (!value.diagnosticCodes.length || !['critical', 'high'].includes(value.priority))) return false;
  if (value.amenityId !== null) {
    const amenity = context.amenities.find(a => a.id === value.amenityId)!;
    if (!selected.waypoints.some(w => w.id === amenity.id)) {
      const points = [...selected.waypoints, { id: amenity.id, kind: 'amenity' as const }];
      const position = (id: string) => context.amenities.find(a => a.id === id)?.distanceAlongRouteMiles ??
        context.fuel.recommendation.assessments.find(a => a.station.id === id)?.station.distanceAlongRouteMiles ?? Infinity;
      points.sort((a, b) => position(a.id) - position(b.id));
      if (!evaluateItinerary({ route: selected.baseRoute, preferences: selected.preferences }, points).feasible) return false;
    }
  }
  if (context.fuel.status.severity === 'critical' && value.strategy === 'monitor') return false;
  if (context.fuel.status.severity === 'critical' && value.priority !== 'critical') return false;
  return true;
}
export interface JourneyDecision {
  source: 'gemma4';
  model: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  strategy: 'refuel' | 'evaluate-first' | 'combine-break' | 'monitor' | 'seek-assistance';
  selectedPlanId: string;
  stationId: string | null;
  amenityId: string | null;
  diagnosticCodes: string[];
}
/** Converts an existing-core server transport into a bounded journey adapter; never initializes another SDK. */
export function createJourneyGemmaAdapter(delegate: (context: JourneyIntelligenceContext, signal: AbortSignal) => Promise<JourneyDecision>): JourneyIntelligenceAdapter {
  return {
    async analyze(context, signal) {
      const decision = await delegate(context, signal);
      if (signal.aborted || !validateJourneyDecision(decision, context)) throw new Error('Journey decision rejected.');
      const station = context.fuel.recommendation.assessments.find(a => a.station.id === decision.stationId);
      const amenity = context.amenities.find(a => a.id === decision.amenityId);
      const plan = [context.plan, ...context.alternatives, ...(context.proposals ?? [])].find(p => p.id === decision.selectedPlanId)!;
      return {
        source: 'gemma4', strategy: decision.strategy, priority: decision.priority,
        title: decision.strategy === 'combine-break' ? 'Combine a feasible refill and break' : decision.strategy === 'evaluate-first' ? 'Evaluate the diagnostic concern first' : 'Gemma journey strategy',
        explanation: 'Gemma selected ' + decision.strategy + ' for ' + plan.route.origin.name + ' → ' + plan.route.destination.name + '. ' +
          (station ? station.explanation + ' ' : '') +
          (amenity ? amenity.name + ' is a fictional ' + amenity.category + ' option; its added waypoint must be recalculated before use. ' : '') +
          (decision.diagnosticCodes.length ? 'Observed codes: ' + decision.diagnosticCodes.join(', ') + '; no confirmed mechanical cause is asserted.' : ''),
        action: decision.strategy === 'evaluate-first' ? 'Arrange qualified evaluation before pursuing route convenience.'
          : decision.strategy === 'seek-assistance' ? 'Stop safely when needed and seek assistance; do not exceed modeled usable range.'
          : 'Review the selected feasible plan before changing the itinerary. No vehicle action is executed.',
        selectedPlanId: decision.selectedPlanId, stationId: decision.stationId, amenityId: decision.amenityId, diagnosticCodes: [...decision.diagnosticCodes],
      };
    },
  };
}
/** Event-aware adapter coordinator; fallback never makes a network request. */
export class JourneyIntelligenceCoordinator {
  private state: { status: 'idle' | 'pending' | 'analyzing' | 'ready' | 'fallback' | 'error'; error: SanitizedIntelligenceError | null } = { status: 'idle', error: null };
  getState = () => this.state;
  private setState(status: typeof this.state.status, error: SanitizedIntelligenceError | null = null) {
    this.state = { status, error }; this.listeners.forEach(l => l());
  }
  private version = 0;
  private fingerprint = '';
  private active: AbortController | null = null;
  private activeKey: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private lastCall = -Infinity;
  private cache = new Map<string, { at: number; insight: JourneyInsight }>();
  private disposed = false;
  private insight: JourneyInsight | null = null;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.insight;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(insight: JourneyInsight): void { this.insight = insight; this.publish(insight); this.listeners.forEach(l => l()); }
  constructor(private readonly adapter: JourneyIntelligenceAdapter | null, private readonly publish: (insight: JourneyInsight) => void = () => {},
    private readonly now: () => number = Date.now, private readonly throttleMs = 5000) {}
  update(context: JourneyIntelligenceContext, epoch: number, force = false): void {
    if (this.disposed) return;
    const fingerprint = JSON.stringify([context.plan.id, epoch, context.fuel.status.fuelStatus, context.fuel.status.routeSafety,
      context.frame.phase, context.frame.stopId,
      context.fuel.recommendation.recommended?.station.id, context.proposals?.[0]?.fuelStops[0]?.station.id,
      context.fuel.recommendation.assessments.filter(a => a.status === 'REACHABLE').map(a => a.station.id),
      context.diagnostics.map(d => [d.code, d.severity]), context.efficiency?.status,
      Math.floor((context.fuel.fuel.planningMpg ?? PLANNING_MPG) * 2) / 2]);
    const key = JSON.stringify([context.plan.id, context.frame.telemetry, context.fuel.status, context.frame.stopId]);
    if (fingerprint === this.fingerprint && (!force || (this.active && !this.active.signal.aborted && this.activeKey === key))) return;
    this.fingerprint = fingerprint;
    this.version++; const version = this.version;
    this.active?.abort(); this.active = null;
    if (this.timer) clearTimeout(this.timer);
    if (this.timeout) clearTimeout(this.timeout);
    this.emit(deterministicJourneyInsight(context));
    this.setState(this.adapter ? 'pending' : 'fallback');
    if (!this.adapter) return;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < 30000) { this.emit(cached.insight); this.setState('ready'); return; }
    const run = () => {
      if (version !== this.version || this.disposed) return;
      const abort = new AbortController(); this.active = abort; this.activeKey = key; this.lastCall = this.now(); this.setState('analyzing');
      this.timeout = setTimeout(() => { if (version === this.version) { abort.abort(); this.active = null; this.activeKey = null; this.version++; this.emit(deterministicJourneyInsight(context)); this.setState('error', sanitizeError(new IntelligenceError('TIMEOUT'))); } }, 45000);
      this.adapter!.analyze(context, abort.signal).then(insight => {
        if (version !== this.version || this.disposed || abort.signal.aborted) return;
        if (this.timeout) clearTimeout(this.timeout);
        this.active = null; this.activeKey = null;
        if (insight.source === 'gemma4') this.cache.set(key, { at: this.now(), insight });
        while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
        this.emit(insight); this.setState(insight.source === 'gemma4' ? 'ready' : 'fallback');
      }).catch(error => {
        if (version !== this.version || this.disposed) return;
        if (this.timeout) clearTimeout(this.timeout);
        this.active = null; this.activeKey = null;
        this.emit(deterministicJourneyInsight(context)); this.setState('error', sanitizeError(error));
      });
    };
    const delay = Math.max(0, this.lastCall + this.throttleMs - this.now());
    if (delay) this.timer = setTimeout(run, delay); else run();
  }
  invalidate(): void { this.version++; this.insight = null; this.cache.clear(); this.setState('idle'); this.fingerprint = ''; this.active?.abort(); if (this.timer) clearTimeout(this.timer); if (this.timeout) clearTimeout(this.timeout); }
  dispose(): void { this.invalidate(); this.disposed = true; this.cache.clear(); this.listeners.clear(); }
}
