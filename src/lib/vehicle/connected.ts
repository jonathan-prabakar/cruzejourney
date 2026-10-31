import demo from '../../data/demo-telemetry.json';
import { calculateJourneyPlan, DEFAULT_PREFERENCES, PLANNING_MPG } from '../journey/planner';
import { buildCuratedRoute } from '../journey/routes';
import { generateSimulationFrames, initialJourneyFrame, JourneySimulation } from '../journey/simulation';
import type { TelemetryProvider, VehicleTelemetry, PlaybackState } from '../telemetry/types';
import type { JourneyPlanningResult, SimulationFrame } from '../journey/types';
import type { EfficiencyFinding } from '../intelligence/types';

/** Read-only boundary shared by synthetic and future authenticated OBD-II/ELD adapters. */
export type VehicleTelemetryProvider = Pick<TelemetryProvider, 'getCurrentTelemetry' | 'subscribe'>;
export interface VehicleEfficiencyAdapter {
  evaluate(current: VehicleTelemetry, history: readonly VehicleTelemetry[]): EfficiencyFinding | null;
}
export const unavailableEfficiency: VehicleEfficiencyAdapter = { evaluate: () => null };
export interface JourneySelector { originId: string; destinationId: string; elapsedSeconds: number }
export const INITIAL_VEHICLE_TELEMETRY: Readonly<VehicleTelemetry> = Object.freeze({ ...demo.records[0] });
export const MAX_DEMO_JOURNEYS = 16;

export function planFromTelemetry(originId: string, destinationId: string, telemetry: VehicleTelemetry) {
  if (originId === destinationId) throw new Error('Choose distinct supported locations.');
  return calculateJourneyPlan({
    route: buildCuratedRoute(originId, destinationId), refillPolicy: 'route-needed',
    preferences: { ...DEFAULT_PREFERENCES, startingFuelPercent: telemetry.fuel_percent,
      fuelStops: 'automatic', optimization: 'balanced', amenities: [], scenario: 'combined' },
  });
}
export function segmentFrames(planning: JourneyPlanningResult, seed: VehicleTelemetry) {
  return planning.requested.feasible ? generateSimulationFrames(planning.requested, 'combined', seed)
    : [{ ...initialJourneyFrame(planning.requested), telemetry: { ...seed } }];
}
/** Pure canonical reconstruction; no browser measurements or fuel overrides are accepted. */
export function replayConnectedJourneys(selectors: readonly JourneySelector[]) {
  if (!selectors.length || selectors.length > MAX_DEMO_JOURNEYS) throw new Error('Demo journey history limit reached.');
  let seed: VehicleTelemetry = { ...INITIAL_VEHICLE_TELEMETRY };
  let totalAdded = 0, totalCost: number | null = 0;
  let result: { planning: JourneyPlanningResult; frames: SimulationFrame[]; frame: SimulationFrame; seed: VehicleTelemetry; totalAdded: number; totalCost: number | null } | undefined;
  for (const selector of selectors) {
    if (!selector || Object.keys(selector).sort().join(',') !== 'destinationId,elapsedSeconds,originId' ||
      typeof selector.originId !== 'string' || typeof selector.destinationId !== 'string' ||
      !Number.isFinite(selector.elapsedSeconds) || selector.elapsedSeconds < 0) throw new Error('Invalid journey selector.');
    const planning = planFromTelemetry(selector.originId, selector.destinationId, seed);
    const frames = segmentFrames(planning, seed);
    const frame = frames.find(f => Math.abs(f.elapsedSeconds - selector.elapsedSeconds) < 1e-6);
    if (!frame) throw new Error('Unknown canonical telemetry frame.');
    totalAdded += frame.fuelAddedGallons;
    totalCost = totalCost === null || frame.purchaseCost === null ? null : totalCost + frame.purchaseCost;
    result = { planning, frames, frame, seed: { ...seed }, totalAdded, totalCost };
    seed = { ...frame.telemetry };
  }
  return result!;
}
export interface ConnectedSnapshot {
  planning: JourneyPlanningResult; frame: SimulationFrame; playback: PlaybackState;
  departure: VehicleTelemetry; totalAdded: number; totalCost: number | null; revision: number;
}
export interface DemoPlaybackController {
  readonly frames: readonly SimulationFrame[];
  play(): void; pause(): void; reset(): void; seekTo(index: number): void; setPlaybackSpeed(speed: 1 | 2 | 5): void;
}
/** A future host adapts authenticated OBD/ELD readings to this same navigation projection.
 * A physical provider has no demo controls and supplies its trusted server intelligence transport.
 */
export interface VehicleNavigationProvider extends VehicleTelemetryProvider {
  readonly profile: import('../telemetry/types').VehicleProfile;
  readonly planningMpg: number;
  readonly reservePercent: number;
  readonly source: 'synthetic-demo' | 'connected-vehicle';
  readonly demoControls: DemoPlaybackController | null;
  readonly intelligenceAdapter?: import('../journey/types').JourneyIntelligenceAdapter;
  getSnapshot(): ConnectedSnapshot;
  getEfficiency(): EfficiencyFinding | null;
  getJourneySelectors(): JourneySelector[] | undefined;
  planJourney(originId: string, destinationId: string): void;
}
/** One session, one active M2 clock. Route changes replace its dataset, not vehicle readings. */
export class ConnectedVehicleSession implements VehicleNavigationProvider {
  readonly profile = demo.metadata.vehicle;
  readonly planningMpg = PLANNING_MPG;
  readonly reservePercent = 10;
  readonly source = 'synthetic-demo' as const;
  get demoControls(): DemoPlaybackController { return this; }
  private completed: JourneySelector[] = [];
  private selector: JourneySelector = { originId: 'san-antonio', destinationId: 'austin', elapsedSeconds: 0 };
  private listeners = new Set<() => void>();
  private engine: JourneySimulation | null = null;
  private disconnect: (() => void) | null = null;
  private baseAdded = 0;
  private baseCost: number | null = 0;
  frames: readonly SimulationFrame[];
  private state: ConnectedSnapshot;
  constructor(readonly efficiencyAdapter: VehicleEfficiencyAdapter = unavailableEfficiency) {
    const result = replayConnectedJourneys([this.selector]);
    this.frames = result.frames;
    this.state = { planning: result.planning, frame: result.frame, departure: result.seed, revision: 0,
      totalAdded: 0, totalCost: 0, playback: this.readyState() };
  }
  private readyState(): PlaybackState {
    return { status: 'ready', speed: 1, index: 0, total: this.frames.length, progress: 0, elapsed_ms: 0,
      duration_ms: this.frames.at(-1)!.elapsedSeconds * 1000 };
  }
  getSnapshot = () => this.state;
  getEfficiency = () => this.efficiencyAdapter.evaluate(this.state.frame.telemetry, this.frames.slice(Math.max(0, this.state.playback.index - 119), this.state.playback.index + 1).map(f => f.telemetry));
  getCurrentTelemetry = () => Object.freeze(this.state.frame.telemetry);
  getJourneySelectors = () => [...this.completed.map(s => ({ ...s })), { ...this.selector, elapsedSeconds: this.state.frame.elapsedSeconds }];
  private emit = () => this.listeners.forEach(l => l());
  private attach() {
    if (this.engine || !this.state.planning.requested.feasible) return;
    this.engine = new JourneySimulation(this.state.planning.requested, 'combined', undefined, this.state.departure);
    this.disconnect = this.engine.subscribe(() => {
      const next = this.engine!.getSnapshot();
      this.state = { ...this.state, ...next,
        totalAdded: this.baseAdded + next.frame.fuelAddedGallons,
        totalCost: this.baseCost === null || next.frame.purchaseCost === null ? null : this.baseCost + next.frame.purchaseCost };
      this.emit();
    });
    if (this.state.playback.index) this.engine.seekTo(this.state.playback.index);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener); this.attach();
    return () => { this.listeners.delete(listener); if (!this.listeners.size) this.engine?.pause(); };
  };
  planJourney(originId: string, destinationId: string) {
    if (this.completed.length + 1 >= MAX_DEMO_JOURNEYS) throw new Error('This demo supports 16 successive route plans per session. Reload to start a new demo connection.');
    const completed = [...this.completed.map(s => ({ ...s })), { ...this.selector, elapsedSeconds: this.state.frame.elapsedSeconds }];
    const selector = { originId, destinationId, elapsedSeconds: 0 };
    // Validate and calculate before changing any owned state.
    const result = replayConnectedJourneys([...completed, selector]);
    this.engine?.pause(); this.disconnect?.(); this.engine?.dispose(); this.engine = null;
    this.baseAdded = this.state.totalAdded; this.baseCost = this.state.totalCost;
    this.completed = completed; this.selector = selector; this.frames = result.frames;
    this.state = { planning: result.planning, frame: result.frame, departure: result.seed,
      totalAdded: result.totalAdded, totalCost: result.totalCost, revision: this.state.revision + 1, playback: this.readyState() };
    this.attach(); this.emit();
  }
  play = () => { this.attach(); this.engine?.play(); };
  pause = () => this.engine?.pause();
  reset = () => { this.state = { ...this.state, revision: this.state.revision + 1 }; this.engine?.reset(); this.emit(); };
  seekTo = (index: number) => { this.state = { ...this.state, revision: this.state.revision + 1 }; this.engine?.seekTo(index); this.emit(); };
  setPlaybackSpeed = (speed: 1 | 2 | 5) => this.engine?.setPlaybackSpeed(speed);
  dispose = () => { this.disconnect?.(); this.engine?.dispose(); this.listeners.clear(); };
}
