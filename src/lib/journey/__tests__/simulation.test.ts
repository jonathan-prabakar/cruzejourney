import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryPlayback } from '../../telemetry/playback';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../planner';
import { buildCuratedRoute } from '../routes';
import { generateSimulationFrames, diagnosticDistanceFor, JourneySimulation } from '../simulation';
import { positionAt } from '../geometry';

const route = buildCuratedRoute('san-antonio', 'austin');
const plan = () => calculateJourneyPlan({ route, preferences: DEFAULT_PREFERENCES }).requested;
afterEach(() => vi.useRealTimers());
describe('M2-backed route-aware simulation', () => {
  it('generates chronological readings on the selected itinerary rather than original M2 GPS', () => {
    const p = plan(), frames = generateSimulationFrames(p, 'normal');
    expect(frames[0].telemetry.latitude).toBeCloseTo(route.coordinates[0][1], 5);
    for (const [i, frame] of frames.entries()) {
      const point = positionAt(p.route, frame.distanceMiles);
      expect(frame.telemetry.longitude).toBeCloseTo(point[0], 6);
      expect(frame.telemetry.latitude).toBeCloseTo(point[1], 6);
      if (i) expect(Date.parse(frame.telemetry.timestamp)).toBeGreaterThan(Date.parse(frames[i - 1].telemetry.timestamp));
    }
    expect(frames.at(-1)!.phase).toBe('arrived');
    expect(frames.at(-1)!.remainingDistanceMiles).toBe(0);
  });
  it('accounts for consumption, full refills and purchases without magical tank resets', () => {
    const frames = generateSimulationFrames(plan(), 'normal');
    let bought = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      const delta = b.distanceMiles - a.distanceMiles;
      if (delta > 1e-8) expect((a.telemetry.fuel_percent - b.telemetry.fuel_percent) / 100 * 120).toBeCloseTo(delta / b.telemetry.mpg, 7);
      const addition = b.fuelAddedGallons - a.fuelAddedGallons;
      if (addition > 0) {
        expect(b.phase).toBe('fuel-stop'); expect(b.telemetry.speed_mph).toBe(0);
        expect((b.telemetry.fuel_percent - a.telemetry.fuel_percent) / 100 * 120).toBeCloseTo(addition, 7);
        bought += addition;
      }
      expect(b.telemetry.fuel_percent).toBeGreaterThanOrEqual(10 - 1e-8);
    }
    expect(bought).toBeGreaterThan(0);
    expect(frames.at(-1)!.purchaseCost).toBeGreaterThan(0);
    expect(frames.some(f => f.telemetry.fuel_percent === 100)).toBe(true);
  });
  it.each(['engine-warning', 'combined'] as const)('triggers reproducible diagnostics at the scenario boundary for %s', scenario => {
    const p = plan(), frames = generateSimulationFrames(p, scenario);
    const event = frames.findIndex(f => f.telemetry.diagnostic_code === 'P0301');
    expect(event).toBeGreaterThan(0);
    expect(frames[event].distanceMiles).toBeGreaterThanOrEqual(diagnosticDistanceFor(p, scenario));
    expect(frames[event - 1].distanceMiles).toBeLessThan(diagnosticDistanceFor(p, scenario));
    if (scenario === 'combined') {
      expect(frames[event].telemetry.fuel_percent).toBeLessThanOrEqual(20);
      expect(frames[event].fuelAddedGallons).toBe(0);
    }
    expect(generateSimulationFrames(p, scenario)).toEqual(frames);
  });
  it('normal and low-fuel modes do not introduce an engine code', () => {
    expect(generateSimulationFrames(plan(), 'normal').every(f => f.telemetry.diagnostic_code === null)).toBe(true);
    expect(generateSimulationFrames(plan(), 'low-fuel').every(f => f.telemetry.diagnostic_code === null)).toBe(true);
  });
  it('uses changed fuel and route inputs in the actual simulation', () => {
    const reverse = calculateJourneyPlan({ route: buildCuratedRoute('kyle', 'san-marcos'), preferences: { ...DEFAULT_PREFERENCES, startingFuelPercent: 60 } }).requested;
    const frames = generateSimulationFrames(reverse, 'normal');
    expect(frames[0].telemetry.fuel_percent).toBe(60);
    expect(frames[0].telemetry.latitude).toBeCloseTo(30.006, 2);
    expect(frames.at(-1)!.telemetry.latitude).toBeCloseTo(29.883, 2);
  });
  it('reuses M2 play/pause/seek/reset and supported playback speeds with deterministic timers', () => {
    vi.useFakeTimers();
    const provider = new TelemetryPlayback({
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const simulation = new JourneySimulation(plan(), 'combined', provider);
    const listener = vi.fn(), remove = simulation.subscribe(listener);
    simulation.play();
    vi.advanceTimersByTime(21000);
    expect(simulation.getSnapshot().playback.index).toBeGreaterThan(0);
    simulation.pause();
    const before = simulation.getSnapshot();
    vi.advanceTimersByTime(100000);
    expect(simulation.getSnapshot()).toBe(before);
    const fuelStopIndex = simulation.frames.findIndex(f => f.phase === 'fuel-stop');
    simulation.seekTo(fuelStopIndex);
    expect(simulation.getSnapshot().frame.phase).toBe('fuel-stop');
    simulation.setPlaybackSpeed(5);
    expect(simulation.getSnapshot().playback.speed).toBe(5);
    simulation.seekTo(simulation.frames.length - 1);
    expect(simulation.getSnapshot().playback.status).toBe('ended');
    simulation.reset();
    expect(simulation.getSnapshot().frame.fuelAddedGallons).toBe(0);
    expect(simulation.getSnapshot().playback.index).toBe(0);
    remove(); simulation.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(listener).toHaveBeenCalled();
  });
  it('announces a stationary amenity stop before its modeled dwell elapses', () => {
    const planning = calculateJourneyPlan({ route, preferences: DEFAULT_PREFERENCES });
    const amenity = planning.amenities.find(a => a.stationId === planning.requested.fuelStops[0].station.id)!;
    const edited = calculateJourneyPlan({ route, preferences: DEFAULT_PREFERENCES,
      waypoints: [...planning.requested.waypoints, { id: amenity.id, kind: 'amenity' }] }).requested;
    const frames = generateSimulationFrames(edited, 'normal');
    const index = frames.findIndex(f => f.phase === 'amenity-stop');
    expect(index).toBeGreaterThan(0);
    expect(frames[index].telemetry.speed_mph).toBe(0);
    expect(frames[index + 1].phase).toBe('amenity-stop');
    expect(frames[index + 1].elapsedSeconds - frames[index].elapsedSeconds).toBe(1200);
  });
  it('will not start an infeasible itinerary', () => {
    const p = calculateJourneyPlan({ route, preferences: { ...DEFAULT_PREFERENCES, startingFuelPercent: 5 } }).requested;
    expect(() => generateSimulationFrames(p, 'normal')).toThrow('not confirmed feasible');
  });
});
