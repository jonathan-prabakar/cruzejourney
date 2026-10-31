import { TelemetryPlayback } from '../telemetry/playback';
import type { PlaybackScheduler, TelemetryProvider } from '../telemetry/types';
import { positionAt } from './geometry';
import type { DiagnosticsAdapter, JourneyPlan, JourneySimulationPort, SimulationFrame, SimulationScenario, SimulationState } from './types';

export const SIMULATION_TIME_FACTOR = 60;
export const rawDiagnosticAdapter: DiagnosticsAdapter = {
  evaluate: telemetry => telemetry.diagnostic_code ? [{
    code: telemetry.diagnostic_code, severity: 'warning',
    description: 'Observed simulated diagnostic code. A code alone does not confirm a mechanical cause; arrange qualified evaluation.',
  }] : [],
};
export function initialJourneyFrame(plan: JourneyPlan): SimulationFrame {
  return {
    telemetry: { timestamp: '2026-10-31T14:00:00.000Z', latitude: plan.route.coordinates[0][1], longitude: plan.route.coordinates[0][0],
      speed_mph: 0, rpm: 0, fuel_percent: plan.preferences.startingFuelPercent, mpg: 8, coolant_temp_f: 195, diagnostic_code: null },
    distanceMiles: 0, baseRouteMiles: 0, remainingDistanceMiles: plan.totalDistanceMiles, phase: 'blocked',
    stopId: null, fuelAddedGallons: 0, purchaseCost: 0, elapsedSeconds: 0,
  };
}
const start = Date.parse('2026-10-31T14:00:00Z');
export function diagnosticDistanceFor(plan: JourneyPlan, scenario: SimulationScenario): number {
  const midpoint = plan.totalDistanceMiles * 0.35;
  return scenario === 'combined' && plan.fuelStops.length
    ? Math.min(midpoint, plan.fuelStops[0].leg.cumulativeTravelMiles * 0.65) : midpoint;
}
/** Route-specific measurements. Original M2 GPS is never reused on another journey. */
export function generateSimulationFrames(plan: JourneyPlan, scenario: SimulationScenario): SimulationFrame[] {
  if (!plan.feasible) throw new Error('Cannot simulate an itinerary that is not confirmed feasible.');
  if (!['normal', 'low-fuel', 'engine-warning', 'combined'].includes(scenario)) throw new Error('Unknown simulation scenario.');
  const frames: SimulationFrame[] = [];
  let distance = 0, base = 0, elapsed = 0, gallons = 120 * plan.preferences.startingFuelPercent / 100;
  let purchased = 0, cost: number | null = 0;
  const hasDiagnostic = scenario === 'engine-warning' || scenario === 'combined';
  const push = (phase: SimulationFrame['phase'], speed: number, mpg: number, stopId: string | null = null) => {
    const coordinate = positionAt(plan.route, distance);
    const code = hasDiagnostic && distance >= diagnosticDistanceFor(plan, scenario) ? 'P0301' : null;
    frames.push({
      telemetry: {
        timestamp: new Date(start + Math.round(elapsed * 1000)).toISOString(),
        longitude: coordinate[0], latitude: coordinate[1], speed_mph: speed,
        rpm: speed > 0 ? Math.round(800 + speed * 18 + 30 * Math.sin(frames.length / 6)) : 0,
        fuel_percent: Math.max(0, Math.min(100, gallons / 120 * 100)),
        mpg, coolant_temp_f: 195 + 2 * Math.sin(elapsed / 240), diagnostic_code: code,
      },
      distanceMiles: distance, baseRouteMiles: base, remainingDistanceMiles: Math.max(0, plan.totalDistanceMiles - distance),
      phase, stopId, fuelAddedGallons: purchased, purchaseCost: cost, elapsedSeconds: elapsed,
    });
  };
  push('ready', 0, 8);
  const baseMiles = plan.totalDistanceMiles - plan.legs.reduce((sum, l) => sum + l.accessMiles, 0);
  const baseSeconds = plan.durationSeconds - plan.legs.reduce((sum, l) => sum + l.dwellSeconds + l.accessMiles / 20 * 3600, 0);
  for (const leg of plan.legs) {
    const startDistance = distance, startBase = base;
    const roadMiles = leg.baseRouteMiles - base;
    const driveSeconds = roadMiles / baseMiles * baseSeconds + leg.accessMiles / 20 * 3600;
    const steps = Math.max(1, Math.ceil(driveSeconds / 20)), seconds = driveSeconds / steps;
    const weights = Array.from({ length: steps }, (_, i) => 0.9 + 0.1 * Math.sin((i + 0.5) / steps * Math.PI));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < steps; i++) {
      const travel = leg.travelMiles * weights[i] / totalWeight;
      const mpg = 8 + 0.2 * Math.sin(frames.length / 11);
      // Interval-average MPH: the same distance drives position, time and fuel accounting.
      gallons -= travel / mpg; elapsed += seconds; distance += travel;
      base = startBase + Math.min(roadMiles, Math.max(0, distance - startDistance));
      if (gallons < 12 - 1e-7) { push('blocked', 0, mpg); return frames; }
      if (i === steps - 1) { distance = leg.cumulativeTravelMiles; base = leg.baseRouteMiles; }
      push('driving', travel / seconds * 3600, mpg);
    }
    if (leg.kind === 'fuel' || leg.kind === 'amenity') {
      elapsed += 1;
      push(leg.kind === 'fuel' ? 'fuel-stop' : 'amenity-stop', 0, 0, leg.waypointId);
    }
    if (leg.kind === 'fuel') {
      const station = plan.fuelStops.find(s => s.station.id === leg.waypointId)!.station;
      const toAdd = 120 - gallons;
      const dwellSeconds = 120 + toAdd / 12 * 60, steps = Math.max(1, Math.ceil(dwellSeconds / 20));
      for (let i = 0; i < steps; i++) {
        const amount = i === steps - 1 ? 120 - gallons : toAdd / steps;
        gallons += amount; purchased += amount; elapsed += dwellSeconds / steps;
        cost = cost === null || station.pricePerGallon === null ? null : cost + amount * station.pricePerGallon;
        push('fuel-stop', 0, 0, leg.waypointId);
      }
    } else if (leg.kind === 'amenity') {
      elapsed += leg.dwellSeconds;
      push('amenity-stop', 0, 0, leg.waypointId);
    }
  }
  // Add a distinct final timestamp so M2 can expose a stationary arrival and end deterministically.
  elapsed += 1; distance = plan.totalDistanceMiles; base = baseMiles;
  push('arrived', 0, 0);
  return frames;
}
export function createDemoClock(): PlaybackScheduler {
  return {
    now: () => performance.now() * SIMULATION_TIME_FACTOR,
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay / SIMULATION_TIME_FACTOR),
    clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}
/** Adapts the completed M2 provider rather than implementing a second playback engine. */
export class JourneySimulation implements JourneySimulationPort {
  readonly frames: readonly SimulationFrame[];
  private snapshot: SimulationState;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  constructor(plan: JourneyPlan, scenario: SimulationScenario,
    private readonly provider: TelemetryProvider = new TelemetryPlayback(createDemoClock())) {
    this.frames = generateSimulationFrames(plan, scenario);
    const result = provider.loadDataset({
      metadata: {
        name: 'Synthetic route-aware journey simulation', source: 'FuelSense journey simulation; cached OSRM base geometry',
        synthetic: true, route: plan.route.origin.name + ' to ' + plan.route.destination.name,
        limitations: ['Synthetic telemetry; fictional stations, access loops, prices and diagnostic events.', '60 simulated seconds per real second at playback 1×. Interval-average speed readings.'],
        vehicle: { name: 'Demo Freight Truck', tank_capacity_gallons: 120, typical_mpg: 8 },
      },
      records: this.frames.map(f => f.telemetry),
    });
    if (!result.valid) throw new Error('Generated simulation failed telemetry validation: ' + result.errors.map(e => e.field).join(', '));
    this.snapshot = { frame: this.frames[0], playback: provider.getPlaybackState() };
    this.unsubscribe = provider.subscribe(() => {
      this.snapshot = { frame: this.frames[Math.max(0, provider.getPlaybackState().index)], playback: provider.getPlaybackState() };
      this.listeners.forEach(listener => listener());
    });
  }
  getSnapshot = (): SimulationState => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  play = () => this.provider.play();
  pause = () => this.provider.pause();
  reset = () => this.provider.reset();
  seekTo = (index: number) => this.provider.seekTo(index);
  setPlaybackSpeed = (speed: 1 | 2 | 5) => this.provider.setPlaybackSpeed(speed);
  dispose = () => { this.unsubscribe(); this.provider.dispose(); this.listeners.clear(); };
}
