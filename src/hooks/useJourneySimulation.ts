"use client";
import { useMemo, useSyncExternalStore } from 'react';
import { generateSimulationFrames, JourneySimulation } from '../lib/journey/simulation';
import type { JourneyPlan, SimulationState } from '../lib/journey/types';

/** Lazily acquires M2 playback on subscription; Strict Mode cleanup can safely reconnect. */
class JourneySession {
  private engine: JourneySimulation | null = null;
  private listeners = new Set<() => void>();
  private disconnect: (() => void) | null = null;
  readonly frames;
  private readonly initial: SimulationState;
  constructor(private readonly plan: JourneyPlan) {
    this.frames = plan.feasible ? generateSimulationFrames(plan, plan.preferences.scenario) : [];
    this.initial = {
      frame: this.frames[0] ?? {
        telemetry: { timestamp: '2026-10-31T14:00:00.000Z', latitude: plan.route.coordinates[0][1], longitude: plan.route.coordinates[0][0],
          speed_mph: 0, rpm: 0, fuel_percent: plan.preferences.startingFuelPercent, mpg: 8, coolant_temp_f: 195, diagnostic_code: null },
        distanceMiles: 0, baseRouteMiles: 0, remainingDistanceMiles: plan.totalDistanceMiles, phase: 'blocked' as const,
        stopId: null, fuelAddedGallons: 0, purchaseCost: 0, elapsedSeconds: 0,
      },
      playback: { status: plan.feasible ? 'ready' : 'empty', speed: 1, index: 0, total: this.frames.length,
        progress: 0, elapsed_ms: 0, duration_ms: this.frames.at(-1)?.elapsedSeconds ? this.frames.at(-1)!.elapsedSeconds * 1000 : 0 },
    };
  }
  isConnected = () => this.engine !== null;
  getSnapshot = () => this.engine?.getSnapshot() ?? this.initial;
  getServerSnapshot = () => this.initial;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.engine && this.plan.feasible) {
      this.engine = new JourneySimulation(this.plan, this.plan.preferences.scenario);
      this.disconnect = this.engine.subscribe(() => this.listeners.forEach(l => l()));
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.disconnect?.(); this.engine?.dispose(); this.engine = null; this.disconnect = null; }
    };
  };
  play = () => this.engine?.play();
  pause = () => this.engine?.pause();
  reset = () => this.engine?.reset();
  seekTo = (index: number) => this.engine?.seekTo(index);
  setPlaybackSpeed = (speed: 1 | 2 | 5) => this.engine?.setPlaybackSpeed(speed);
}
export function useJourneySimulation(plan: JourneyPlan) {
  const session = useMemo(() => new JourneySession(plan), [plan]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  return { ...snapshot, controls: session, frames: session.frames, connected: session.isConnected() };
}
