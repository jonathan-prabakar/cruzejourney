import { describe, it, expect, vi } from "vitest";
import { routeIds } from "../routes";
import { roadRoutes as demoRoutes } from "../road-routes";
import { getDemoSnapshot } from "../snapshot";
import { TelemetryPlayback } from "../../telemetry/playback";
import { POST } from "../../../app/api/intelligence/route";

describe("selectable synthetic destinations", () => {
  it.each(routeIds)(
    "loads %s with coherent route, fuel and diagnostics",
    (id) => {
      const route = demoRoutes[id];
      const provider = new TelemetryPlayback();
      expect(provider.loadDataset(route.dataset).valid).toBe(true);
      const first = getDemoSnapshot(0, id);
      const last = getDemoSnapshot(240, id);
      expect(first.progress).toBe(0);
      expect(last.progress).toBeCloseTo(1);
      expect(last.route.remainingRouteMiles).toBeCloseTo(0);
      expect(first.health.activeCodes).toEqual([]);
      expect(getDemoSnapshot(160, id).health.activeCodes).toContain("P0301");
      expect(
        first.stations.every(
          (s) => !s.isSynthetic && s.priceSource === "unknown",
        ),
      ).toBe(true);
      expect(first.context.stations).toEqual(first.stations);
      expect(last.currentTelemetry.fuel_percent).toBeGreaterThan(0);
      if (id !== "austin") {
        let distance = 0;
        let gallons = 0;
        route.dataset.records.forEach((reading, index, records) => {
          if (!index) return;
          const previous = records[index - 1];
          const leg =
            (((reading.speed_mph + previous.speed_mph) / 2) *
              (Date.parse(reading.timestamp) -
                Date.parse(previous.timestamp))) /
            3600000;
          distance += leg;
          gallons += leg / reading.mpg;
        });
        expect(distance).toBeCloseTo(route.miles, 3);
        expect(
          ((first.currentTelemetry.fuel_percent -
            last.currentTelemetry.fuel_percent) /
            100) *
            first.vehicle.tank_capacity_gallons,
        ).toBeCloseTo(gallons, 3);
      }
    },
  );
  it("never shares scenario timestamps and uses only OSM station IDs", () => {
    const timestamps = routeIds.flatMap((id) =>
      demoRoutes[id].dataset.records.map((r) => r.timestamp),
    );
    expect(new Set(timestamps).size).toBe(timestamps.length);
    const stations = routeIds.flatMap((id) =>
      demoRoutes[id].stations.map((s) => s.id),
    );
    expect(stations.every(id => id.startsWith("osm-"))).toBe(true);
  });
  it("reconstructs the selected route on the server and rejects unknown destinations", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const request = (routeId: string) =>
      new Request("http://localhost/api/intelligence", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ index: 0, routeId }),
      });
    try {
      const response = await POST(request("el-paso"));
      expect(response.status).toBe(200);
      expect((await response.json()).telemetryTimestamp).toBe(
        demoRoutes["el-paso"].dataset.records[0].timestamp,
      );
      expect((await POST(request("unknown"))).status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
