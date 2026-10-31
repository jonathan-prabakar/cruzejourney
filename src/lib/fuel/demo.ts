import telemetry from '../../data/demo-telemetry.json';
import type { RouteContext } from './types';

/** M2 demo ONLY: integrate its documented speed/time model, never infer road distances from GPS. */
const progress = [0];
for (let i = 1; i < telemetry.records.length; i++) {
  const a = telemetry.records[i - 1], b = telemetry.records[i];
  const hours = (Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 3600000;
  progress.push(progress[i - 1] + (a.speed_mph + b.speed_mph) / 2 * hours);
}
export const DEMO_ROUTE_LENGTH_MILES = progress[progress.length - 1];
export function getDemoRouteContext(recordIndex: number): RouteContext {
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= progress.length) {
    return { currentDistanceAlongRouteMiles: null, remainingRouteMiles: null, distanceSource: 'unknown' };
  }
  return {
    currentDistanceAlongRouteMiles: progress[recordIndex],
    remainingRouteMiles: Math.max(0, DEMO_ROUTE_LENGTH_MILES - progress[recordIndex]),
    distanceSource: 'simulated',
  };
}
