import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectedVehicleSession, INITIAL_VEHICLE_TELEMETRY, planFromTelemetry, replayConnectedJourneys } from '../connected';
import { resolveJourneyContext } from '../../journey/context.server';
import { makeJourneyIntelligenceContext } from '../../journey/intelligence';
import { journeyRequest } from '../../journey/request';
import { milesBetween } from '../../journey/geometry';

afterEach(() => vi.useRealTimers());
function connected() {
  const session = new ConnectedVehicleSession();
  const disconnect = session.subscribe(() => {});
  return { session, close: () => { disconnect(); session.dispose(); } };
}
describe('read-only vehicle navigation session', () => {
  it('derives departure from the dataset provider and plans only necessary fuel purchases', () => {
    const { session, close } = connected();
    expect(session.getCurrentTelemetry()).toEqual(INITIAL_VEHICLE_TELEMETRY);
    const plan = session.getSnapshot().planning.requested;
    expect(plan.preferences.startingFuelPercent).toBe(INITIAL_VEHICLE_TELEMETRY.fuel_percent);
    expect(plan.fuelAddedGallons).toBeGreaterThan(0);
    expect(plan.fuelAddedGallons).toBeLessThan(15);
    expect(plan.fuelStops[0].refillTargetPercent).toBeLessThan(30);
    expect(plan.arrivalFuelPercent).toBeGreaterThanOrEqual(10);
    close();
  });
  it('plans no stop or purchase when current fuel covers a short destination', () => {
    const result = planFromTelemetry('san-marcos', 'austin', { ...INITIAL_VEHICLE_TELEMETRY });
    expect(result.requested.feasible).toBe(true);
    expect(result.requested.fuelStops).toHaveLength(0);
    expect(result.requested.purchaseCost).toBe(0);
  });
  it('preserves current readings, active diagnostics and session purchases when changing route', () => {
    const { session, close } = connected();
    const index = session.frames.findIndex(f => f.telemetry.diagnostic_code === 'P0301');
    session.seekTo(index);
    const before = { ...session.getCurrentTelemetry() };
    session.planJourney('kyle', 'san-marcos');
    expect(session.getCurrentTelemetry()).toEqual(before);
    expect(session.getSnapshot().departure.fuel_percent).toBe(before.fuel_percent);
    expect(session.getSnapshot().planning.requested.baseRoute.origin.id).toBe('kyle');
    expect(session.frames[1].telemetry.diagnostic_code).toBe('P0301');
    expect(milesBetween([session.frames[1].telemetry.longitude!, session.frames[1].telemetry.latitude!], session.getSnapshot().planning.requested.route.coordinates[0])).toBeLessThan(1);
    close();
  });
  it('reconstructs fuel and diagnostics server-side from prior route/frame selectors only', () => {
    const { session, close } = connected();
    session.seekTo(session.frames.findIndex(f => f.phase === 'fuel-stop' && f.fuelAddedGallons > 0));
    const before = session.getSnapshot();
    session.planJourney('san-marcos', 'austin');
    const selectors = session.getJourneySelectors();
    const reconstructed = replayConnectedJourneys(selectors);
    expect(reconstructed.frame.telemetry).toEqual(session.getCurrentTelemetry());
    expect(reconstructed.totalAdded).toBeCloseTo(before.totalAdded, 8);
    expect(session.getSnapshot().totalAdded).toBeCloseTo(before.totalAdded, 8);
    const snapshot = session.getSnapshot();
    const context = { ...makeJourneyIntelligenceContext(snapshot.planning, snapshot.frame), connectedJourneys: selectors };
    const request = journeyRequest(context);
    expect(Object.keys(request)).toEqual(['journeys']);
    expect(resolveJourneyContext(request).core.telemetry).toEqual(session.getCurrentTelemetry());
    expect(() => resolveJourneyContext({ ...request, fuel_percent: 100 })).toThrow();
    close();
  });
  it('changes fuel only through consumption or explicitly recorded refueling', () => {
    const { session, close } = connected();
    for (let i = 1; i < session.frames.length; i++) {
      const a = session.frames[i - 1], b = session.frames[i];
      const delta = (b.telemetry.fuel_percent - a.telemetry.fuel_percent) / 100 * 120;
      if (delta > 1e-7) {
        expect(b.phase).toBe('fuel-stop');
        expect(delta).toBeCloseTo(b.fuelAddedGallons - a.fuelAddedGallons, 7);
        expect(b.telemetry.speed_mph).toBe(0);
        expect(b.telemetry.rpm).toBe(0);
      }
      if (b.distanceMiles > a.distanceMiles) {
        expect(delta).toBeLessThan(0);
        expect(-delta).toBeCloseTo((b.distanceMiles - a.distanceMiles) / b.telemetry.mpg, 7);
      }
    }
    close();
  });
  it('restores historical diagnostic/fuel/purchase state on reset and seek', () => {
    const { session, close } = connected();
    session.seekTo(session.frames.length - 1);
    expect(session.getCurrentTelemetry()!.diagnostic_code).toBe('P0301');
    expect(session.getSnapshot().totalAdded).toBeGreaterThan(0);
    session.reset();
    expect(session.getCurrentTelemetry()).toEqual(INITIAL_VEHICLE_TELEMETRY);
    expect(session.getSnapshot().totalAdded).toBe(0);
    expect(session.getSnapshot().revision).toBeGreaterThan(0);
    close();
  });
  it('retains valid route and vehicle state when route validation fails', () => {
    const { session, close } = connected();
    const before = session.getSnapshot();
    expect(() => session.planJourney('unverified-address', 'austin')).toThrow();
    expect(session.getSnapshot()).toBe(before);
    expect(() => session.planJourney('austin', 'austin')).toThrow();
    close();
  });
  it('owns only one active M2 timer and clears playback when no consumers remain', () => {
    vi.useFakeTimers();
    const session = new ConnectedVehicleSession();
    const disconnect = session.subscribe(() => {});
    session.play();
    expect(vi.getTimerCount()).toBe(1);
    session.planJourney('san-marcos', 'austin');
    expect(vi.getTimerCount()).toBe(0);
    session.play();
    expect(vi.getTimerCount()).toBe(1);
    disconnect();
    expect(vi.getTimerCount()).toBe(0);
    session.dispose();
  });
  it('exposes unavailable efficiency honestly and supports a trusted future adapter', () => {
    const session = new ConnectedVehicleSession();
    expect(session.getEfficiency()).toBeNull();
    const evaluate = vi.fn(() => ({ status: 'normal' as const, metrics: [{ id: 'average', label: 'MPG', value: 8, unit: 'mpg' as const }] }));
    const future = new ConnectedVehicleSession({ evaluate });
    expect(future.getEfficiency()?.status).toBe('normal');
    expect(evaluate).toHaveBeenCalledWith(INITIAL_VEHICLE_TELEMETRY, expect.any(Array));
    future.dispose(); session.dispose();
  });
  it('rejects fabricated sensor overrides, unknown history positions and excessive history', () => {
    expect(() => replayConnectedJourneys([{ originId: 'san-antonio', destinationId: 'austin', elapsedSeconds: 123.456 }])).toThrow();
    expect(() => replayConnectedJourneys(Array(17).fill({ originId: 'san-antonio', destinationId: 'austin', elapsedSeconds: 0 }))).toThrow();
    expect(() => replayConnectedJourneys([{ originId: 'san-antonio', destinationId: 'austin', elapsedSeconds: 0, fuel_percent: 100 } as never])).toThrow();
  });
});
