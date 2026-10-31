import type { ActionKind, PreparedContext, ProposedInsight, Relationship, VehicleInsight } from './types';

export const RELATIONSHIPS: Record<Relationship, { title: string; explanation: string }> = {
  fuel_route: { title: 'Plan fuel before the destination', explanation: 'The fuel reserve and remaining route need to be considered together.' },
  station_tradeoff: { title: 'Choose a reachable refueling stop', explanation: 'Compare the selected station with the supplied eligible choices using price, detour and arrival buffer.' },
  observed_diagnostic: { title: 'Evaluate the observed diagnostic concern', explanation: 'The observed code warrants evaluation; a code alone does not confirm a mechanical cause or a repair.' },
  fuel_diagnostic: { title: 'Coordinate refueling and vehicle evaluation', explanation: 'Fuel constraints and the observed diagnostic concern need a coordinated sequence of actions. Their coexistence does not establish a causal connection.' },
  coolant_diagnostic: { title: 'Prioritize temperature and diagnostic warnings', explanation: 'Elevated coolant and an observed code deserve attention together, without assuming one caused the other.' },
  coolant: { title: 'Check the coolant warning', explanation: 'The measured temperature crossed a demonstration threshold; follow the vehicle warning system and obtain evaluation.' },
  efficiency_route: { title: 'Reassess the fuel plan with efficiency context', explanation: 'Supplied efficiency findings add uncertainty to planning the remaining route; no savings or causal effect is assumed.' },
  efficiency: { title: 'Review the supplied driving-efficiency findings', explanation: 'Use the supplied metrics to consider smoother driving when safe, without claiming a measured saving.' },
  monitor: { title: 'Monitor the fuel and vehicle state', explanation: 'These are the selected measured and calculated observations; estimates can change.' },
  missing_data: { title: 'Verify missing vehicle data', explanation: 'A reliable fuel plan cannot be confirmed from the available measurements.' },
};
const actionText: Record<ActionKind, string> = {
  refuel: 'Use the selected confirmed reachable compatible station only while the vehicle remains suitable to continue; verify conditions and sample-data assumptions.',
  evaluate_diagnostic: 'Arrange qualified evaluation of the observed code; a specific mechanical cause or repair is not confirmed.',
  stop_safely: 'Pull over when safe and follow the vehicle warnings; do not continue solely to reach cheaper fuel.',
  seek_assistance: 'Seek appropriate assistance and do not travel beyond the modeled usable range.',
  monitor: 'Monitor the measurements and reassess when conditions change.',
  verify_data: 'Verify missing or invalid measurements before relying on the plan.',
  smooth_driving: 'When safe, use smooth speed changes and review the supplied efficiency metrics; no savings are guaranteed.',
};
export function renderInsight(proposal: ProposedInsight, context: PreparedContext, source: VehicleInsight['source'], mandatory = false): VehicleInsight {
  const evidence = proposal.evidenceIds.map(id => context.facts.find(f => f.id === id)!.text);
  const selected = context.eligibleStations.find(s => s.station.id === proposal.stationId);
  return {
    id: proposal.id, category: proposal.category, priority: proposal.priority,
    title: RELATIONSHIPS[proposal.relationship].title,
    explanation: RELATIONSHIPS[proposal.relationship].explanation + ' ' + evidence.join(' '),
    evidence, evidenceIds: [...proposal.evidenceIds],
    recommendedAction: proposal.actions.map((action, i) => (i + 1) + '. ' + actionText[action] +
      (action === 'refuel' && selected ? ' Selected: ' + selected.station.name + ' (' + selected.station.id + ').' : '')).join(' '),
    actions: [...proposal.actions], ...(proposal.stationId ? { relatedStationId: proposal.stationId } : {}),
    ...(proposal.diagnosticCodes.length ? { relatedDiagnosticCodes: [...proposal.diagnosticCodes] } : {}),
    confidence: context.demoMode ? 'limited' : proposal.confidence, source, mandatory,
  };
}
