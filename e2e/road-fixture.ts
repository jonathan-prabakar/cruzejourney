import type { Page } from '@playwright/test';
import { replayConnectedJourneys, type JourneySelector } from '../src/lib/vehicle/connected';
import { resolveConnectedRoadRoute, storeConnectedRoadPlan } from '../src/lib/vehicle/road-plan-store.server';
import { cumulativeDistances } from '../src/lib/journey/geometry';
import type { Coordinate } from '../src/lib/journey/types';

/** Explicit mock router for repeatable browser tests. Live browser checks never install this. */
export async function installMockRoadRouting(page: Page) {
  await page.route('**/api/route-to-station/connected', async request => {
    const { journeys, stationId } = request.request().postDataJSON() as { journeys: JourneySelector[]; stationId: string };
    const current = replayConnectedJourneys(journeys, resolveConnectedRoadRoute);
    const station = current.planning.stations.find(s => s.id === stationId)!;
    const base = current.planning.requested.baseRoute;
    const start: Coordinate = current.frame.phase === 'ready' ? base.coordinates[0] : [current.frame.telemetry.longitude!, current.frame.telemetry.latitude!];
    const coordinates: Coordinate[] = [start, station.coordinate, base.coordinates.at(-1)!];
    const cumulativeMiles = cumulativeDistances(coordinates);
    const route = { ...base, id: base.id + ':mock-road:' + stationId, sourceRoute: undefined, offsetMiles: undefined, fullDistanceMiles: undefined,
      origin: { ...base.origin, name: 'Current position', coordinate: start }, coordinates, cumulativeMiles,
      distanceMiles: cumulativeMiles.at(-1)!, durationSeconds: cumulativeMiles.at(-1)! / 45 * 3600,
      provider: 'osrm' as const, provenance: 'routed-road' as const, routingStationId: stationId, routingStationDistanceMiles: cumulativeMiles[1] };
    await request.fulfill({ json: storeConnectedRoadPlan(route, stationId, journeys) });
  });
}
