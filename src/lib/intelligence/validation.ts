import { PRIORITY_ORDER } from './fallback';
import type { ModelDecision, PreparedContext, ProposedInsight } from './types';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k));
const list = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(s => typeof s === 'string' && s.length <= 100) && new Set(v).size === v.length;

export interface DecisionValidation { valid: boolean; decision: ModelDecision | null; errors: string[] }
export function validateModelDecision(text: string, context: PreparedContext): DecisionValidation {
  const fail = (message: string): DecisionValidation => ({ valid: false, decision: null, errors: [message] });
  if (typeof text !== 'string' || text.length > 16000) return fail('Output exceeds decision limits');
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { return fail('Expected a JSON decision object'); }
  if (!object(value) || !keys(value, context.journey ? ['topPriority', 'insights', 'journeyChoice'] : ['topPriority', 'insights']) || typeof value.topPriority !== 'string' ||
      !Array.isArray(value.insights) || value.insights.length < 1 || value.insights.length > 4) return fail('Invalid decision envelope');
  const ids = new Set<string>(), proposals: ProposedInsight[] = [];
  const factMap = new Map(context.facts.map(f => [f.id, f]));
  const fuelConcern = context.fuel.status.fuelStatus === 'LOW' || context.fuel.status.fuelStatus === 'CRITICAL' ||
    context.fuel.status.routeSafety === 'INSUFFICIENT_RANGE';
  for (const row of value.insights) {
    if (!object(row) || !keys(row, ['id', 'category', 'priority', 'relationship', 'evidenceIds', 'actions', 'stationId', 'diagnosticCodes', 'confidence']) ||
        typeof row.id !== 'string' || !/^ai-[a-z0-9-]{1,35}$/.test(row.id) || ids.has(row.id) ||
        !['fuel', 'diagnostic', 'efficiency', 'combined'].includes(String(row.category)) ||
        !['critical', 'high', 'medium', 'low'].includes(String(row.priority)) ||
        !['limited', 'moderate'].includes(String(row.confidence)) ||
        !list(row.evidenceIds, 8) || row.evidenceIds.length === 0 ||
        !list(row.actions, 4) || row.actions.length === 0 ||
        !row.actions.every(a => ['refuel', 'evaluate_diagnostic', 'stop_safely', 'seek_assistance', 'monitor', 'verify_data', 'smooth_driving'].includes(a)) ||
        !list(row.diagnosticCodes, 4) || (row.stationId !== null && typeof row.stationId !== 'string')) return fail('Invalid insight schema or command');
    const p = row as unknown as ProposedInsight;
    ids.add(p.id);
    if (p.evidenceIds.some(id => !factMap.has(id))) return fail('Unknown evidence reference');
    if (p.diagnosticCodes.some(code => !context.observedCodes.includes(code) || !p.evidenceIds.includes('diagnostic.' + code))) return fail('Unobserved diagnostic code');
    // Diagnostic facts cannot be cited while omitting the code links.
    if (p.evidenceIds.some(id => id.startsWith('diagnostic.') && !p.diagnosticCodes.includes(id.slice(11)))) return fail('Missing diagnostic reference');
    if (p.stationId !== null) {
      if (!context.eligibleStations.some(s => s.station.id === p.stationId)) return fail('Station is not an eligible reviewed choice');
      if (!p.evidenceIds.includes('station.' + p.stationId)) return fail('Selected station must include its exact station.ID evidence reference');
      if (!p.actions.includes('refuel')) return fail('A station choice requires a refuel action; otherwise stationId must be null');
    }
    if (p.actions.includes('refuel') && (!p.stationId || context.coolantStatus === 'critical' ||
        context.diagnosticFindings.some(f => context.activeCodes.includes(f.code) && f.severity === 'critical'))) return fail('Unsafe refueling action');
    const domains = new Set(p.evidenceIds.map(id => factMap.get(id)!.domain));
    const diagnostic = domains.has('diagnostic') && p.diagnosticCodes.length > 0;
    const fuel = domains.has('fuel');
    const route = domains.has('route');
    const coolantConcern = context.coolantStatus === 'critical' || context.coolantStatus === 'elevated';
    const efficiency = domains.has('efficiency') && context.efficiency !== null;
    const validRelationship = (
      p.relationship === 'fuel_route' && p.category === 'fuel' && fuelConcern && fuel && route ||
      p.relationship === 'station_tradeoff' && p.category === 'fuel' && p.stationId !== null ||
      p.relationship === 'observed_diagnostic' && p.category === 'diagnostic' && diagnostic ||
      p.relationship === 'fuel_diagnostic' && p.category === 'combined' && fuelConcern && fuel && diagnostic ||
      p.relationship === 'coolant_diagnostic' && p.category === 'combined' && coolantConcern && domains.has('coolant') && diagnostic ||
      p.relationship === 'coolant' && p.category === 'diagnostic' && coolantConcern && domains.has('coolant') ||
      p.relationship === 'efficiency_route' && p.category === 'combined' && efficiency && route ||
      p.relationship === 'efficiency' && p.category === 'efficiency' && efficiency ||
      p.relationship === 'monitor' && p.category === 'fuel' && fuel ||
      p.relationship === 'missing_data' && p.evidenceIds.includes('data.unknown')
    );
    if (!validRelationship) return fail('Unsupported relationship or unavailable capability');
    if (p.actions.some(a => a === 'stop_safely' || a === 'seek_assistance') &&
        !fuelConcern && !diagnostic && !coolantConcern && !p.evidenceIds.includes('data.unknown')) return fail('Urgent action lacks a supported concern');
    if (p.actions.includes('smooth_driving') && !efficiency) return fail('Efficiency capability unavailable');
    if (p.actions.includes('evaluate_diagnostic') && !diagnostic && !coolantConcern) return fail('Diagnostic evidence unavailable');
    if (p.actions.includes('verify_data') && !p.evidenceIds.includes('data.unknown')) return fail('Missing-data action lacks evidence');
    const relevantCritical = (fuel && context.fuel.status.severity === 'critical') ||
      (domains.has('coolant') && context.coolantStatus === 'critical') ||
      p.diagnosticCodes.some(code => context.activeCodes.includes(code) && context.diagnosticFindings.some(f => f.code === code && f.severity === 'critical'));
    const relevantHigh = (fuel && fuelConcern) || diagnostic || (domains.has('coolant') && coolantConcern);
    const floor = relevantCritical ? 'critical' : relevantHigh ? 'high' : 'low';
    if (PRIORITY_ORDER[p.priority] > PRIORITY_ORDER[floor]) return fail('Severity downgrade');
    if (p.priority === 'critical' && !relevantCritical) return fail('Unsupported critical severity');
    if (domains.has('coolant') && context.coolantStatus === 'critical' && p.actions[0] !== 'stop_safely') return fail('Critical temperature requires safe-stop first');
    if (diagnostic && !p.actions.some(a => a === 'evaluate_diagnostic' || a === 'stop_safely' || a === 'seek_assistance')) return fail('Diagnostic action is insufficient');
    if (fuel && fuelConcern && !p.actions.some(a => a === 'refuel' || a === 'stop_safely' || a === 'seek_assistance')) return fail('Fuel action is insufficient');
    proposals.push(p);
  }
  if (!ids.has(value.topPriority)) return fail('Top priority does not identify an insight');
  let journeyChoice: ModelDecision['journeyChoice'];
  if (context.journey) {
    const choice = value.journeyChoice;
    if (!object(choice) || !keys(choice, ['selectedPlanId', 'stationId', 'amenityId']) ||
        typeof choice.selectedPlanId !== 'string' ||
        !(choice.stationId === null || typeof choice.stationId === 'string') ||
        !(choice.amenityId === null || typeof choice.amenityId === 'string')) return fail('Invalid journey choice');
    const journey = context.journey;
    const plan = [journey.current, ...journey.alternatives].find(p => p.id === choice.selectedPlanId && p.feasible);
    const top = proposals.find(p => p.id === value.topPriority)!;
    if (!plan || (journey.progressMiles > 0 && plan.id !== journey.current.id && !plan.proposal) ||
        choice.stationId !== top.stationId ||
        (choice.stationId !== null && (!plan.stationIds.includes(choice.stationId) ||
          !context.eligibleStations.some(s => s.station.id === choice.stationId))) ||
        (choice.amenityId !== null && !journey.fictionalAmenities.some(a => a.id === choice.amenityId &&
          a.stationId === choice.stationId && journey.preferences.amenities.includes(a.category))))
      return fail('Unapproved journey choice');
    journeyChoice = choice as unknown as ModelDecision['journeyChoice'];
  }
  return { valid: true, decision: { topPriority: value.topPriority, insights: proposals, ...(journeyChoice ? { journeyChoice } : {}) }, errors: [] };
}
