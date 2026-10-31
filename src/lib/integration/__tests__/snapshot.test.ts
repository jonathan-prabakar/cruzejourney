import { roadRoutes } from "../road-routes";
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Dashboard from "../../../components/dashboard";
import {
  demoDataset,
  getDemoSnapshot,
  projectDemoLocation,
  selectFeasibleRecommendation,
} from "../snapshot";
import { buildFallback, prepareIntelligenceContext } from "../../intelligence";
import { analyzeVehicleIntelligence } from "../../intelligence/orchestrator.server";
import { GET, POST } from "../../../app/api/intelligence/route";
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/intelligence", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("application integration snapshot", () => {
  it("server-renders the cockpit with the real initial M2 reading", () => {
    const html = renderToStaticMarkup(React.createElement(Dashboard));
    expect(html).toContain("Driving cockpit");
    expect(html).toContain("28");
    expect(html).toContain("163.2");
    expect(html).toContain("OSM STATIONS");
    expect(html).not.toContain("FICTIONAL STATIONS");
    expect(html).toContain("Destination");
    expect(html).not.toContain("Bluebonnet Travel Stop");
  });
  it("calculates the initial fuel and reserve from current telemetry", () => {
    const s = getDemoSnapshot(0);
    expect(s.currentTelemetry.fuel_percent).toBe(17);
    expect(s.fuel.fuel.remainingGallons).toBeCloseTo(20.4);
    expect(s.fuel.fuel.estimatedRangeMiles).toBeCloseTo(163.2);
    expect(s.fuel.fuel.usableRangeMiles).toBeCloseTo(67.2);
    expect(s.fuel.fuel.reserveGallons).toBe(12);
  });
  it("displays an engine-selected station, not the M1 fixture", () =>
    expect(getDemoSnapshot(0).stations.every(s => s.id.startsWith("osm-"))).toBe(true));
  it("returns a real no-reachable-station fallback at the critical ending", () => {
    const s = getDemoSnapshot(240);
    expect(s.fuel.status.fuelStatus).toBe("CRITICAL");
    expect(s.fuel.recommendation.station).toBeNull();
    expect(s.fuel.recommendation.warnings.length).toBeGreaterThan(0);
  });
  it("reveals P0301 at its first observation", () => {
    expect(getDemoSnapshot(159).health.recentEvents).toEqual([]);
    expect(getDemoSnapshot(160).health.activeCodes).toEqual(["P0301"]);
    expect(getDemoSnapshot(175).health.recentEvents[0].readings).toBe(16);
  });
  it("seeking backward removes all future diagnostics", () => {
    getDemoSnapshot(175);
    const earlier = getDemoSnapshot(10);
    expect(earlier.health.activeCodes).toEqual([]);
    expect(earlier.health.recentEvents).toEqual([]);
    expect(prepareIntelligenceContext(earlier.context).observedCodes).toEqual(
      [],
    );
  });
  it("reset snapshot has initial fuel, progress and health", () => {
    getDemoSnapshot(240);
    const reset = getDemoSnapshot(0);
    expect(reset.progress).toBe(0);
    expect(reset.currentTelemetry.fuel_percent).toBe(17);
    expect(reset.health.recentEvents).toEqual([]);
  });
  it("keeps all 241 snapshots internally aligned", () => {
    for (let i = 0; i < 241; i++) {
      const s = getDemoSnapshot(i);
      expect(s.history.at(-1)?.timestamp).toBe(s.currentTelemetry.timestamp);
      expect(s.context.telemetry?.timestamp).toBe(s.currentTelemetry.timestamp);
      expect(s.history.length).toBe(i + 1);
      expect(s.context.history.length).toBeLessThanOrEqual(120);
      expect(
        s.route.remainingRouteMiles! + s.route.currentDistanceAlongRouteMiles!,
      ).toBeCloseTo(s.totalMiles);
      expect(
        buildFallback(prepareIntelligenceContext(s.context), 0)
          .telemetryTimestamp,
      ).toBe(s.currentTelemetry.timestamp);
    }
  });
  it.each([-1, 241, 1.5, NaN])("rejects unsupported index %s", (i) =>
    expect(() => getDemoSnapshot(i)).toThrow(),
  );
  it("projects only display coordinates and handles missing GPS", () => {
    expect(projectDemoLocation(null, -98)).toBeNull();
    expect(projectDemoLocation(29.4241, -98.4936)).toEqual({ x: 235, y: 416 });
  });
  it("leaves the original dataset unchanged", () => {
    expect(demoDataset.records).toHaveLength(241);
    expect(demoDataset.records[0].fuel_percent).toBe(17);
    expect(demoDataset.records[160].diagnostic_code).toBe("P0301");
  });
});
describe("trusted server and missing-key integration", () => {
  it("reports AI unavailable without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await GET().json()).available).toBe(false);
  });
  it("starts and provides fallback without a configured key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await analyzeVehicleIntelligence(
      getDemoSnapshot(160).context,
    );
    expect(result.source).toBe("fallback");
    expect(result.error?.code).toBe("MISSING_API_KEY");
    expect(
      result.insights.some((i) => i.relatedDiagnosticCodes?.includes("P0301")),
    ).toBe(true);
  });
  it("reconstructs context from index and returns fallback", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const response = await POST(request({ index: 160 }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.source).toBe("fallback");
    expect(result.telemetryTimestamp).toBe(roadRoutes.austin.dataset.records[160].timestamp);
  });
  it("rejects forged deterministic conclusions", async () => {
    expect((await POST(request({ index: 0, fuelRange: 99999 }))).status).toBe(
      400,
    );
  });
  it("rejects out-of-range indices", async () =>
    expect((await POST(request({ index: 999 }))).status).toBe(400));
  it("rejects cross-origin model requests", async () =>
    expect(
      (await POST(request({ index: 0 }, "https://external.invalid"))).status,
    ).toBe(401));
});

describe("Gemma selects only current feasible engine candidates", () => {
  it("allows a validated model selection among M3 alternatives", () => {
    const s = getDemoSnapshot(0, "dallas");
    const advice = buildFallback(prepareIntelligenceContext(s.context), 0);
    advice.source = "gemma4";
    advice.insights[0].relatedStationId =
      s.fuel.recommendation.alternatives[0].station.id;
    expect(
      selectFeasibleRecommendation(s.fuel, advice, s.currentTelemetry.timestamp)
        ?.station.id,
    ).toBe(advice.insights[0].relatedStationId);
  });
  it("rejects invented station selections and stale advice", () => {
    const s = getDemoSnapshot(0, "dallas");
    const advice = buildFallback(prepareIntelligenceContext(s.context), 0);
    advice.source = "gemma4";
    advice.insights[0].relatedStationId = "invented";
    expect(
      selectFeasibleRecommendation(s.fuel, advice, s.currentTelemetry.timestamp)
        ?.station.id,
    ).toBe(s.fuel.recommendation.station?.id);
    advice.insights[0].relatedStationId =
      s.fuel.recommendation.alternatives[0].station.id;
    expect(
      selectFeasibleRecommendation(s.fuel, advice, "different timestamp")
        ?.station.id,
    ).toBe(s.fuel.recommendation.station?.id);
  });
  it("handles a model decision with no selected station at critical fuel", () => {
    const s = getDemoSnapshot(240);
    const advice = buildFallback(prepareIntelligenceContext(s.context), 0);
    advice.source = "gemma4";
    expect(
      selectFeasibleRecommendation(
        s.fuel,
        advice,
        s.currentTelemetry.timestamp,
      ),
    ).toBeNull();
  });
  it("does not invent a stop when no M3 candidate is reachable", () => {
    const s = getDemoSnapshot(240);
    const advice = buildFallback(prepareIntelligenceContext(s.context), 0);
    advice.source = "gemma4";
    advice.insights[0].relatedStationId = "demo-03";
    expect(
      selectFeasibleRecommendation(
        s.fuel,
        advice,
        s.currentTelemetry.timestamp,
      ),
    ).toBeNull();
  });
});
