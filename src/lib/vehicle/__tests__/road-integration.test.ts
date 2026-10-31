import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedVehicleSession, INITIAL_VEHICLE_TELEMETRY, replayConnectedJourneys, type JourneySelector } from '../connected';
import { createConnectedStationRoute } from '../connected-routing.server';
import { resolveJourneyContext, resolveJourneyContextWithRoads } from '../../journey/context.server';
import { generateSimulationFrames } from '../../journey/simulation';
import { geometryDistances } from '../../integration/road-geometry';
import { milesBetween } from '../../journey/geometry';
import { verifiedTruckStops } from '@/data/verified-truck-stops';
import { POST } from '@/app/api/route-to-station/connected/route';

const initial: JourneySelector[] = [{ originId: 'san-antonio', destinationId: 'austin', elapsedSeconds: 0 }];
const station = verifiedTruckStops.find(s => s.id === 'ta-0232')!;
function roadResponse() {
  const points = [[INITIAL_VEHICLE_TELEMETRY.longitude!, INITIAL_VEHICLE_TELEMETRY.latitude!],
    [station.longitude!, station.latitude!], [-97.7431, 30.2672]];
  const distances = geometryDistances(points), total = distances.at(-1)!;
  return { code: 'Ok', waypoints: points.map(location => ({ distance: 0, location })), routes: [{
    geometry: { type: 'LineString', coordinates: points }, distance: total, duration: total / 20,
    legs: [{ distance: distances[1] }, { distance: total - distances[1] }],
  }] };
}
function mockTransport() {
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input).startsWith('/api/')) {
      const body = JSON.parse(String(init?.body));
      return Response.json(await createConnectedStationRoute(body.journeys, body.stationId));
    }
    return Response.json(roadResponse());
  });
  vi.stubGlobal('fetch', transport);
  return transport;
}
beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'cruzeConnectedRoutingRate');
  Reflect.deleteProperty(globalThis, 'cruzeRoadHydrationRate');
  (globalThis as typeof globalThis & { cruzeConnectedRoadPlans?: Map<string, unknown> }).cruzeConnectedRoadPlans?.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('real-source navigation and trusted road-route integration', () => {
  it('previews without replacing the drive, accepts actual route geometry, and reconstructs the same refueling event server-side', async () => {
    mockTransport();
    const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
    try {
      const original = source.getSnapshot();
      const preview = await source.previewRoadStation(station.id);
      expect(source.getSnapshot().planning.requested.id).toBe(original.planning.requested.id);
      expect(source.getCurrentTelemetry()).toEqual(original.frame.telemetry);
      source.acceptRoadPlan(preview.id);
      const plan = source.getSnapshot().planning.requested;
      expect(plan.baseRoute.provenance).toBe('routed-road');
      expect(plan.baseRoute.provider).toBe('osrm');
      expect(plan.baseRoute.coordinates).toEqual(roadResponse().routes[0].geometry.coordinates);
      expect(plan.fuelStops[0].station.isSynthetic).toBe(false);
      expect(plan.fuelStops[0].station.detourMiles).toBe(0);
      const pump = source.frames.find(f => f.phase === 'fuel-stop')!;
      expect(milesBetween([pump.telemetry.longitude!, pump.telemetry.latitude!], [station.longitude!, station.latitude!])).toBeLessThan(.063);
      expect(source.frames.every(f => f.telemetry.fuel_percent >= 10)).toBe(true);
      source.seekTo(source.frames.length - 1);
      const final = source.getSnapshot();
      expect(final.frame.phase).toBe('arrived');
      expect(final.totalAdded).toBeGreaterThan(0);
      expect(final.totalCost).toBeGreaterThan(0);
      expect(resolveJourneyContext({ journeys: source.getJourneySelectors() }).core.telemetry).toEqual(final.frame.telemetry);
      source.reset();
      expect(source.getSnapshot().tripDistanceMiles).toBe(0);
      expect(source.getSnapshot().totalAdded).toBe(0);
      expect(source.getCurrentTelemetry()).toEqual(INITIAL_VEHICLE_TELEMETRY);
    } finally { close(); source.dispose(); }
  });

  it('rejects a stale preview and forged road IDs while preserving current readings', async () => {
    mockTransport();
    const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
    try {
      const preview = await source.previewRoadStation(station.id);
      source.seekTo(2);
      const current = source.getSnapshot();
      expect(() => source.acceptRoadPlan(preview.id)).toThrow('stale');
      expect(source.getSnapshot()).toBe(current);
      expect(() => resolveJourneyContext({ journeys: [...initial, { ...initial[0], stationId: station.id, continuation: true, roadRouteId: 'forged' }] })).toThrow();
      expect(() => replayConnectedJourneys([...initial, { ...initial[0], roadRouteId: preview.id }])).toThrow();
    } finally { close(); source.dispose(); }
  });

  it('keeps the trip and fuel unchanged when road routing fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Routing unavailable.' }, { status: 503 })));
    const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
    try {
      const before = source.getSnapshot();
      await expect(source.acceptRoadStation(station.id)).rejects.toThrow('Routing unavailable');
      expect(source.getSnapshot().planning).toBe(before.planning);
      expect(source.getCurrentTelemetry()).toEqual(before.frame.telemetry);
      expect(source.getSnapshot().totalAdded).toBe(0);
    } finally { close(); source.dispose(); }
  });

  it('reconstructs the same canonical road route after another serverless function starts with an empty cache', async () => {
    const fetch = mockTransport();
    const plan = await createConnectedStationRoute(initial, station.id);
    const journeys = [...initial, { ...initial[0], continuation: true, stationId: station.id, roadRouteId: plan.id }];
    (globalThis as typeof globalThis & { cruzeConnectedRoadPlans?: Map<string, unknown> }).cruzeConnectedRoadPlans!.clear();
    const restored = await resolveJourneyContextWithRoads({ journeys });
    expect(restored.journey.plan.baseRoute.coordinates).toEqual(plan.route.coordinates);
    expect(restored.core.telemetry).toEqual(INITIAL_VEHICLE_TELEMETRY);
    expect(fetch).toHaveBeenCalledTimes(2);
    const changed = [...journeys.slice(0, -1), { ...journeys.at(-1)!, roadRouteId: plan.id.slice(0, -1) + (plan.id.endsWith('0') ? '1' : '0') }];
    await expect(resolveJourneyContextWithRoads({ journeys: changed })).rejects.toThrow('Road data changed');
  });

  it('rejects non-catalog stations and browser-posted measurements before making road requests', async () => {
    const fetch = mockTransport();
    await expect(createConnectedStationRoute(initial, 'fake-station')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const request = (body: unknown, origin = 'http://localhost') => new Request('http://localhost/api/route-to-station/connected', {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    expect((await POST(request({ journeys: initial, stationId: station.id, telemetry: { fuel_percent: 100 } }))).status).toBe(400);
    expect((await POST(request({ journeys: initial, stationId: station.id }, 'https://untrusted.invalid'))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['dallas', 'houston', 'el-paso'])('retains the existing San Antonio → %s road journey on the same vehicle session', destinationId => {
    const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
    try {
      const fuel = source.getCurrentTelemetry().fuel_percent;
      source.planJourney('san-antonio', destinationId);
      const current = source.getSnapshot();
      expect(current.frame.telemetry.fuel_percent).toBe(fuel);
      expect(current.planning.requested.baseRoute.coordinates.length).toBeGreaterThan(1000);
      expect(current.planning.requested.feasible).toBe(true);
      expect(current.planning.stations.every(s => !s.isSynthetic && s.truckAccess === 'yes' && s.sourceUrl)).toBe(true);
      expect(resolveJourneyContext({ journeys: source.getJourneySelectors() }).core.telemetry).toEqual(current.frame.telemetry);
    } finally { close(); source.dispose(); }
  });
});

it.skipIf(process.env.RUN_OSRM_LIVE !== '1')('LIVE: public OSRM returns an actual reserve-preserving road route through the official TA stop', async () => {
  const plan = await createConnectedStationRoute(initial, station.id);
  expect(plan.route.provider).toBe('osrm');
  expect(plan.route.coordinates.length).toBeGreaterThan(1000);
  const canonical = resolveJourneyContext({ journeys: [...initial, { ...initial[0], continuation: true, stationId: station.id, roadRouteId: plan.id }] });
  expect(canonical.journey.plan.feasible).toBe(true);
  expect(canonical.journey.plan.fuelStops[0].station.isSynthetic).toBe(false);
  expect(canonical.journey.plan.arrivalFuelPercent).toBeGreaterThanOrEqual(10);
  const frames = generateSimulationFrames(canonical.journey.plan, 'combined', INITIAL_VEHICLE_TELEMETRY);
  expect(frames.at(-1)!.phase).toBe('arrived');
  expect(frames.every(f => f.telemetry.fuel_percent >= 10)).toBe(true);
  const pump = frames.find(f => f.phase === 'fuel-stop')!;
  expect(milesBetween([pump.telemetry.longitude!, pump.telemetry.latitude!], [station.longitude!, station.latitude!])).toBeLessThan(.063);
}, 20000);
