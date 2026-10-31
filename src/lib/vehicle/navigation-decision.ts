import type { JourneyIntelligenceContext, JourneyInsight } from '../journey/types';
import type { FuelOption } from './fuel-options';

export function navigationDecision(context: JourneyIntelligenceContext, options: { needed: boolean; options: FuelOption[]; recommended: FuelOption | null }, insight: JourneyInsight) {
  const selected = insight.source === 'gemma4' && insight.stationId
    ? options.options.find(o => o.station.id === insight.stationId) ?? options.recommended : options.recommended;
  if ((context.frame.telemetry.coolant_temp_f ?? 0) >= 240 || context.diagnostics.some(d => d.severity === 'critical') ||
      insight.source === 'gemma4' && insight.strategy === 'seek-assistance') {
    return { kind: 'stop-safely', title: 'Stop safely. Seek assistance.', detail: 'Follow vehicle warnings before continuing.', stationId: selected?.station.id ?? null };
  }
  if (context.diagnostics.length) return { kind: 'vehicle-warning', title: 'Engine warning. Arrange a vehicle check.',
    detail: selected ? 'Review the fuel stop only if it is appropriate to continue.' : 'Stop safely if the vehicle runs roughly or loses power.', stationId: selected?.station.id ?? null };
  if (options.needed && !selected) return { kind: 'stop-safely', title: 'No fuel stop confirmed within range.', detail: 'Stop safely and arrange assistance.', stationId: null };
  if (options.needed && selected) return { kind: 'fuel-stop', title: 'A fuel stop keeps your reserve.',
    detail: selected.station.name, stationId: selected.station.id };
  return { kind: 'continue', title: 'Continue to ' + context.plan.baseRoute.destination.name,
    detail: 'No fuel stop needed for the remaining drive.', stationId: null };
}
