import { describe, expect, it, vi } from "vitest";
import { roadRoutes } from "../road-routes";
import { routeIds } from "../routes";
import { geometryDistances, pointAtProgress } from "../road-geometry";
import { getDemoSnapshot } from "../snapshot";
import { validateDataset } from "../../telemetry/validator";
import { validateFuelStations } from "../../fuel/stations";
import { POST } from "../../../app/api/intelligence/route";

describe("road-based simulation", () => {
  it.each(routeIds)(
    "keeps %s geometry, measurements and source records aligned",
    (id) => {
      const r = roadRoutes[id];
      expect(validateDataset(r.dataset).valid).toBe(true);
      expect(validateFuelStations(r.stations).valid).toBe(true);
      expect(r.road.geometry.coordinates.length).toBeGreaterThan(100);
      expect(r.miles).toBeCloseTo(r.road.distanceMeters / 1609.344);
      expect(r.stations.length).toBeGreaterThan(0);
      const cumulative = geometryDistances(r.road.geometry.coordinates);
      expect(
        Math.abs(cumulative.at(-1)! / 1609.344 - r.miles) / r.miles,
      ).toBeLessThan(0.02);
      for (const index of [0, 60, 160, 240]) {
        const s = getDemoSnapshot(index, id, true);
        const [longitude, latitude] = pointAtProgress(
          r.road.geometry.coordinates,
          cumulative,
          s.progress,
        );
        expect(s.currentTelemetry.latitude).toBeCloseTo(latitude, 7);
        expect(s.currentTelemetry.longitude).toBeCloseTo(longitude, 7);
        expect(
          s.route.currentDistanceAlongRouteMiles! +
            s.route.remainingRouteMiles!,
        ).toBeCloseTo(r.miles);
        expect(s.context.stations).toEqual(r.stations);
      }
      expect(getDemoSnapshot(240, id, true).progress).toBeCloseTo(1);
      expect(r.dataset.records.at(-1)!.fuel_percent).toBeGreaterThan(0);
      for (const station of r.stations) {
        expect(station.id).toMatch(/^(loves-\d+|ta-0232)$/);
        expect(station.isSynthetic).toBe(false);
        expect(station.pricePerGallon).toBeGreaterThan(0);
        expect(station.priceSource).toBe("verified");
        expect(station.truckAccess).toBe("yes");
        expect(station.sourceUrl).toMatch(/^https:\/\/www\.(loves\.com|ta-petro\.com)\//);
        expect(station.truckParkingSpaces).toBeGreaterThan(0);
        expect(station.detourMiles).toBeGreaterThan(0);
      }
      const snapshot = getDemoSnapshot(0, id, true);
      for (const assessment of snapshot.fuel.recommendation.assessments) {
        if (assessment.station.fuelTypes.includes("unknown"))
          expect(assessment.status).toBe("UNKNOWN");
        if (assessment.station.truckAccess === "no")
          expect(assessment.status).toBe("EXCLUDED");
      }
    },
  );
  it("uses piecewise geometry with clamped endpoints", () => {
    const coordinates = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const cumulative = geometryDistances(coordinates);
    expect(pointAtProgress(coordinates, cumulative, -1)).toEqual([0, 0]);
    expect(pointAtProgress(coordinates, cumulative, 2)).toEqual([1, 1]);
    expect(pointAtProgress(coordinates, cumulative, 0.25)[1]).toBe(0);
    expect(pointAtProgress(coordinates, cumulative, 0.75)[0]).toBe(1);
  });
  it("server reconstructs road context rather than accepting client geometry", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const request = (body: unknown) =>
      new Request("http://localhost/api/intelligence", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    try {
      const response = await POST(
        request({ index: 160, routeId: "houston", mode: "road" }),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).telemetryTimestamp).toBe(
        roadRoutes.houston.dataset.records[160].timestamp,
      );
      expect(
        (await POST(request({ index: 0, routeId: "dallas", mode: "forged" })))
          .status,
      ).toBe(400);
      expect(
        (
          await POST(
            request({
              index: 0,
              routeId: "dallas",
              mode: "road",
              geometry: [],
            }),
          )
        ).status,
      ).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
