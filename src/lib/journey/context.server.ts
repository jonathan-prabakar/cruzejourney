import { replayConnectedJourneys, type JourneySelector } from '../vehicle/connected';
import { buildCuratedRoute } from './routes';
import { calculateJourneyPlan } from './planner';
import { generateSimulationFrames, initialJourneyFrame } from './simulation';
import { makeJourneyIntelligenceContext } from './intelligence';
import { journeyCoreInput } from './gemma-core-bridge';
import { vehicleDiagnosticsAdapter } from './diagnostics-adapter';
import type { JourneyPreferences, JourneyWaypoint } from './types';

if (typeof window !== 'undefined') throw new Error('Journey context is server-only');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
/** Reject posted measurements/conclusions, reconstruct from bounded synthetic selectors. */
export function resolveJourneyContext(body: unknown) {
  if (object(body) && exact(body, ['journeys']) && Array.isArray(body.journeys)) {
    const result = replayConnectedJourneys(body.journeys as JourneySelector[]);
    const journey = { ...makeJourneyIntelligenceContext(result.planning, result.frame, vehicleDiagnosticsAdapter), connectedJourneys: body.journeys as JourneySelector[] };
    const index = result.frames.indexOf(result.frame);
    return { journey, core: { ...journeyCoreInput(journey), history: result.frames.slice(Math.max(0, index - 119), index + 1).map(f => f.telemetry) } };
  }
  if (!object(body) || !exact(body, ['originId', 'destinationId', 'preferences', 'waypoints', 'elapsedSeconds']) ||
      typeof body.originId !== 'string' || typeof body.destinationId !== 'string' ||
      body.originId === body.destinationId || typeof body.elapsedSeconds !== 'number' ||
      !Number.isFinite(body.elapsedSeconds) || body.elapsedSeconds < 0 ||
      !object(body.preferences) || !Array.isArray(body.waypoints) || body.waypoints.length > 8)
    throw new Error('Invalid journey selectors');
  const p = body.preferences;
  if (!exact(p, ['startingFuelPercent', 'fuelStops', 'optimization', 'amenities', 'scenario']) ||
      typeof p.startingFuelPercent !== 'number' || !Number.isFinite(p.startingFuelPercent) ||
      p.startingFuelPercent < 5 || p.startingFuelPercent > 100 ||
      !['automatic', 'none', 'one', 'two', 'three'].includes(String(p.fuelStops)) ||
      !['balanced', 'fastest', 'fuel-cost', 'fewer-stops'].includes(String(p.optimization)) ||
      !['normal', 'low-fuel', 'engine-warning', 'combined'].includes(String(p.scenario)) ||
      !Array.isArray(p.amenities) || p.amenities.length > 4 || new Set(p.amenities).size !== p.amenities.length ||
      p.amenities.some(a => !['restaurant', 'restroom', 'coffee', 'convenience'].includes(a)) ||
      body.waypoints.some(w => !object(w) || !exact(w, ['id', 'kind']) || typeof w.id !== 'string' ||
        w.id.length > 100 || !['fuel', 'amenity'].includes(String(w.kind))))
    throw new Error('Invalid journey preferences');
  const route = buildCuratedRoute(body.originId, body.destinationId);
  const planning = calculateJourneyPlan({
    route, preferences: p as unknown as JourneyPreferences, waypoints: body.waypoints as JourneyWaypoint[],
  });
  if (body.waypoints.some(w => !planning.stations.some(s => s.id === w.id && w.kind === 'fuel') &&
      !planning.amenities.some(a => a.id === w.id && w.kind === 'amenity'))) throw new Error('Unknown waypoint');
  const frames = planning.requested.feasible
    ? generateSimulationFrames(planning.requested, planning.requested.preferences.scenario)
    : [initialJourneyFrame(planning.requested)];
  const elapsedSeconds = body.elapsedSeconds;
  const index = frames.findIndex(f => Math.abs(f.elapsedSeconds - elapsedSeconds) < 1e-6);
  if (index < 0) throw new Error('Unknown synthetic frame');
  const journey = makeJourneyIntelligenceContext(planning, frames[index], vehicleDiagnosticsAdapter);
  return { journey, core: { ...journeyCoreInput(journey), history: frames.slice(Math.max(0, index - 119), index + 1).map(f => f.telemetry) } };
}
