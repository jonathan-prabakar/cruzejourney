import type { JourneyIntelligenceContext } from './types';

/** Selectors only: the server rebuilds route, stations, fuel, diagnostics and telemetry. */
export function journeyRequest(context: JourneyIntelligenceContext) {
  return {
    originId: context.plan.baseRoute.origin.id,
    destinationId: context.plan.baseRoute.destination.id,
    preferences: context.plan.preferences,
    waypoints: context.plan.waypoints,
    elapsedSeconds: context.frame.elapsedSeconds,
  };
}
