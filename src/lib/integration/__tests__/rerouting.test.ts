import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../../app/api/route-to-station/route";
import { POST as intelligence } from "../../../app/api/intelligence/route";
import { roadRoutes } from "../road-routes";
import { geometryDistances } from "../road-geometry";
import { createStationRoute, getStoredRoutePlan } from "../rerouting.server";
import { validateDataset } from "../../telemetry/validator";
const station = roadRoutes.austin.stations.find((s) => s.id === "loves-960")!;
const request = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/route-to-station", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const body = { routeId: "austin", index: 0, stationId: station.id };
const globalState = globalThis as typeof globalThis & {
  cruzeRouteRequests?: { start: number; count: number };
};
beforeEach(() => {
  globalState.cruzeRouteRequests = { start: Date.now(), count: 0 };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function stubRoute() {
  const first = roadRoutes.austin.road.geometry.coordinates[0];
  const points = [
    first,
    [first[0], station.latitude!],
    [station.longitude!, station.latitude!],
  ];
  const meters = geometryDistances(points).at(-1)!;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        code: "Ok",
        routes: [
          {
            distance: meters,
            duration: 600,
            geometry: { type: "LineString", coordinates: points },
          },
        ],
        waypoints: [{ distance: 0 }, { distance: 0 }],
      }),
    ),
  );
}
describe("trusted station rerouting", () => {
  it("routes to a real station, conserves fuel and creates server-owned AI context", async () => {
    stubRoute();
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    const plan = await response.json();
    expect(plan.trip.destination).toBe(station.name);
    expect(plan.trip.dataset.records[0].fuel_percent).toBe(17);
    expect(
      plan.trip.dataset.records.at(-1).fuel_percent,
    ).toBeGreaterThanOrEqual(10);
    expect(plan.trip.dataset.records.at(-1).speed_mph).toBe(0);
    expect(validateDataset(plan.trip.dataset).valid).toBe(true);
    expect(
      plan.trip.stations.find((s: { id: string }) => s.id === station.id)
        .detourMiles,
    ).toBe(0);
    expect(
      plan.trip.stations
        .filter((s: { id: string }) => s.id !== station.id)
        .every(
          (s: { distanceAlongRouteMiles: number | null }) =>
            s.distanceAlongRouteMiles === null,
        ),
    ).toBe(true);
    expect(getStoredRoutePlan(plan.id, "austin").trip.destination).toBe(
      station.name,
    );
    vi.stubEnv("GEMINI_API_KEY", "");
    const advice = await intelligence(
      request({ routeId: "austin", mode: "road", index: 1, planId: plan.id }),
    );
    expect(advice.status).toBe(200);
    expect((await advice.json()).telemetryTimestamp).toBe(
      plan.trip.dataset.records[1].timestamp,
    );
  });
  it("rejects forged stations, cross-origin requests and unknown route sessions", async () => {
    stubRoute();
    expect(
      (await POST(request({ ...body, stationId: "invented" }))).status,
    ).toBe(400);
    expect((await POST(request(body, "https://external.invalid"))).status).toBe(
      401,
    );
    expect(
      (await POST(request({ ...body, planId: "unknown-session" }))).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the old trip on service failures, bad geometry and excessive fuel requirements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("offline", { status: 503 })),
    );
    expect((await POST(request(body))).status).toBe(503);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          code: "Ok",
          routes: [
            {
              distance: 1000,
              duration: 10,
              geometry: { coordinates: [[NaN, 0]] },
            },
          ],
          waypoints: [],
        }),
      ),
    );
    expect((await POST(request(body))).status).toBe(422);
    stubRoute();
    expect((await POST(request({ ...body, index: 239 }))).status).toBe(422);
  });
  it("rate limits road-service calls and refuses unlisted stations", async () => {
    stubRoute();
    globalState.cruzeRouteRequests = { start: Date.now(), count: 6 };
    expect((await POST(request(body))).status).toBe(429);
    globalState.cruzeRouteRequests = { start: Date.now(), count: 0 };
    expect(
      (await POST(request({ ...body, stationId: "unverified-station" }))).status,
    ).toBe(400);
    expect(roadRoutes.austin.stations.every((s) => s.truckAccess === "yes")).toBe(true);
  });
});
it.skipIf(process.env.RUN_OSRM_LIVE !== "1")(
  "routes to a verified Love's truck stop with the actual public OSRM service",
  async () => {
    const plan = await createStationRoute("austin", 0, station.id);
    expect(plan.trip.road.geometry.coordinates.length).toBeGreaterThan(20);
    expect(validateDataset(plan.trip.dataset).valid).toBe(true);
    expect(
      plan.trip.dataset.records.at(-1)!.fuel_percent,
    ).toBeGreaterThanOrEqual(10);
  },
  20000,
);
