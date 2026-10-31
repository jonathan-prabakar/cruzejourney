import { randomUUID } from "node:crypto";
import { roadRoutes, type RoadRoute, type RoutePlan } from "./road-routes";
import { getDemoSnapshot } from "./snapshot";
import type { DemoRouteId } from "./routes";
import { geometryDistances, pointAtProgress } from "./road-geometry";
import { validateDataset } from "../telemetry/validator";

interface Stored {
  plan: RoutePlan;
  routeId: DemoRouteId;
  expires: number;
}
const scope = globalThis as typeof globalThis & {
  cruzeRoutePlans?: Map<string, Stored>;
  cruzeRouteRequests?: { start: number; count: number };
};
const cache = (scope.cruzeRoutePlans ??= new Map<string, Stored>());
export function getStoredRoutePlan(
  id: unknown,
  routeId: DemoRouteId,
): RoutePlan {
  if (typeof id !== "string")
    throw new Error("Invalid route session. Select a destination to restart.");
  const stored = cache.get(id);
  if (!stored || stored.routeId !== routeId || stored.expires < Date.now()) {
    if (stored?.expires && stored.expires < Date.now()) cache.delete(id);
    throw new Error("Route session expired. Select a destination to restart.");
  }
  return stored.plan;
}
export class RoutingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function createStationRoute(
  routeId: DemoRouteId,
  index: number,
  stationId: string,
  planId?: string,
): Promise<RoutePlan> {
  const base: RoadRoute = planId
    ? getStoredRoutePlan(planId, routeId).trip
    : roadRoutes[routeId];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= base.dataset.records.length - 1
  )
    throw new RoutingError(
      "Reset the replay before choosing a new stop at the end of a trip.",
    );
  const station = base.stations.find((s) => s.id === stationId);
  if (
    !station ||
    station.latitude === null ||
    station.longitude === null ||
    station.isSynthetic
  )
    throw new RoutingError("Choose a mapped station from this route.");
  if (station.truckAccess !== "yes")
    throw new RoutingError(
      "Routing is limited to locations with confirmed commercial-truck services.",
      422,
    );
  const current = getDemoSnapshot(index, routeId, true, base);
  const reading = current.currentTelemetry;
  const bucket = scope.cruzeRouteRequests;
  if (!bucket || Date.now() - bucket.start >= 60000)
    scope.cruzeRouteRequests = { start: Date.now(), count: 0 };
  if (scope.cruzeRouteRequests!.count >= 6)
    throw new RoutingError(
      "Routing request limit reached. Wait a minute and try again.",
      429,
    );
  scope.cruzeRouteRequests!.count++;
  const coordinates = `${reading.longitude},${reading.latitude};${station.longitude},${station.latitude}`;
  let response: Response;
  try {
    response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&radiuses=100;75`,
      {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "CruzeFuelSense-Hackathon/1.0" },
        cache: "no-store",
      },
    );
  } catch {
    throw new RoutingError(
      "Road routing timed out. Your existing trip is unchanged; try again.",
      503,
    );
  }
  if (!response.ok)
    throw new RoutingError(
      "Road routing is temporarily unavailable. Your existing trip is unchanged.",
      503,
    );
  const text = await response.text();
  if (text.length > 3000000)
    throw new RoutingError("Routing response was too large.", 502);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new RoutingError("Routing returned an invalid response.", 502);
  }
  const road = payload.routes?.[0];
  const points: number[][] = road?.geometry?.coordinates;
  if (
    payload.code !== "Ok" ||
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 50000 ||
    points.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    ) ||
    !Number.isFinite(road.distance) ||
    road.distance <= 1 ||
    road.distance > 2000000 ||
    !Number.isFinite(road.duration) ||
    road.duration <= 0 ||
    !Array.isArray(payload.waypoints) ||
    payload.waypoints.length !== 2 ||
    payload.waypoints.some(
      (p: { distance: number }) =>
        !Number.isFinite(p.distance) || p.distance > 100,
    )
  ) {
    throw new RoutingError(
      "A road entrance near this station could not be confirmed. Choose another station.",
      422,
    );
  }
  const measured = geometryDistances(points).at(-1)!;
  if (Math.abs(measured - road.distance) / road.distance > 0.05)
    throw new RoutingError(
      "Route geometry and mileage did not agree. Try another station.",
      502,
    );
  const first = points[0],
    last = points.at(-1)!;
  const startOffset = geometryDistances([
    [reading.longitude!, reading.latitude!],
    first,
  ]).at(-1)!;
  const endOffset = geometryDistances([
    [station.longitude, station.latitude],
    last,
  ]).at(-1)!;
  if (startOffset > 100 || endOffset > 100)
    throw new RoutingError(
      "The route does not reach a nearby station entrance.",
      422,
    );
  const miles = road.distance / 1609.344;
  if (miles > (current.fuel.fuel.usableRangeMiles ?? 0))
    throw new RoutingError(
      "This road route exceeds usable fuel range after the safety reserve. Choose a closer stop.",
      422,
    );
  const source = base.dataset.records
    .slice(index)
    .map((r, i, all) =>
      i === all.length - 1 ? { ...r, speed_mph: 0, rpm: 650 } : r,
    );
  const start = Date.parse(source[0].timestamp);
  let baseline = 0;
  const sourceDistances = source.map((r, i) => {
    if (i)
      baseline +=
        (((r.speed_mph + source[i - 1].speed_mph) / 2) *
          (Date.parse(r.timestamp) - Date.parse(source[i - 1].timestamp))) /
        3600000;
    return baseline;
  });
  if (baseline <= 0)
    throw new RoutingError(
      "This replay segment has no movement. Reset the trip and try again.",
    );
  const scale = miles / baseline;
  const cumulative = geometryDistances(points);
  let consumed = 0;
  const progress = sourceDistances.map((d) => d * scale);
  const records = source.map((r, i) => {
    if (i) consumed += (progress[i] - progress[i - 1]) / r.mpg;
    const [longitude, latitude] = pointAtProgress(
      points,
      cumulative,
      progress[i] / miles,
    );
    return {
      ...r,
      latitude,
      longitude,
      timestamp: new Date(
        start + Math.round((Date.parse(r.timestamp) - start) * scale),
      ).toISOString(),
      fuel_percent:
        reading.fuel_percent -
        (consumed / current.vehicle.tank_capacity_gallons) * 100,
    };
  });
  if (records.at(-1)!.fuel_percent < 10)
    throw new RoutingError(
      "Simulated fuel consumption would breach the 10% reserve. Choose a closer stop.",
      422,
    );
  const stations = base.stations.map((s) => ({
    ...s,
    distanceAlongRouteMiles: s.id === stationId ? miles : null,
    detourMiles: s.id === stationId ? 0 : null,
  }));
  const trip: RoadRoute = {
    ...base,
    destination: station.name,
    corridor: "Road route to fuel stop",
    end: [station.latitude, station.longitude],
    miles,
    stations,
    progress,
    dataset: {
      metadata: {
        ...base.dataset.metadata,
        name: `Fuel stop: ${station.name}`,
        route: `Current position to ${station.name}`,
      },
      records,
    },
    priorHistory: current.history.slice(0, -1),
    road: {
      ...base.road,
      fetchedAt: new Date().toISOString(),
      distanceMeters: road.distance,
      durationSeconds: road.duration,
      geometry: { type: "LineString", coordinates: points },
    },
  };
  if (!validateDataset(trip.dataset).valid)
    throw new RoutingError(
      "The route could not produce a valid replay. Your existing trip is unchanged.",
      422,
    );
  const plan = { id: randomUUID(), trip };
  for (const [id, stored] of cache)
    if (stored.expires < Date.now()) cache.delete(id);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(plan.id, { plan, routeId, expires: Date.now() + 3600000 });
  return plan;
}
