import { createHash } from 'node:crypto';
import type { ConnectedRoadPlan, JourneySelector, RoadRouteResolver } from './connected';
import type { JourneyRoute } from '../journey/types';

if (typeof window !== 'undefined') throw new Error('Road plan storage is server-only.');
interface Stored { plan: ConnectedRoadPlan; history: string; expires: number }
const scope = globalThis as typeof globalThis & { cruzeConnectedRoadPlans?: Map<string, Stored> };
const plans = scope.cruzeConnectedRoadPlans ??= new Map<string, Stored>();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function matchesRoadHistory(id: string, stationId: string, history: readonly JourneySelector[]) {
  return /^r1-[a-f0-9]{24}-[a-f0-9]{32}$/.test(id) && id.startsWith('r1-' + hash([stationId, history]).slice(0, 24) + '-');
}
export function storeConnectedRoadPlan(route: JourneyRoute, stationId: string, history: readonly JourneySelector[]): ConnectedRoadPlan {
  for (const [id, entry] of plans) if (entry.expires < Date.now()) plans.delete(id);
  while (plans.size >= 32) plans.delete(plans.keys().next().value!);
  // Content IDs permit another serverless function to re-fetch and verify the exact
  // canonical route. They are integrity checks, not vehicle/account authorization.
  const id = 'r1-' + hash([stationId, history]).slice(0, 24) + '-' +
    hash([route.coordinates, route.distanceMiles, route.durationSeconds, route.routingStationDistanceMiles]).slice(0, 32);
  const plan = { id, stationId, route };
  plans.set(plan.id, { plan, history: JSON.stringify(history), expires: Date.now() + 3600000 });
  return plan;
}
export const resolveConnectedRoadRoute: RoadRouteResolver = (id, history, stationId) => {
  const entry = plans.get(id);
  if (!entry || entry.expires < Date.now() || entry.plan.stationId !== stationId || entry.history !== JSON.stringify(history))
    throw new Error('Road route session expired or does not match this drive. Plan the drive again.');
  return entry.plan.route;
};
