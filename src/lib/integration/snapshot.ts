import { roadRoutes } from "./road-routes";
import demo from "../../data/demo-telemetry.json";
import { type DemoRouteId } from "./routes";
import {
  calculateFuelIntelligence,
} from "../fuel";
import { assessVehicleHealth } from "../diagnostics";
import type { VehicleTelemetry } from "../telemetry/types";
import type { VehicleIntelligenceContext } from "../intelligence/types";

export const demoDataset = demo;

export const fuelConfig = { reservePercent: 10, uncertaintyMargin: 0 };
export function getDemoSnapshot(
  index: number,
  routeId: DemoRouteId = "austin",
  _roadMode = true,
) {
  // Retain the former mode argument for callers; fictional map mode was removed.
  void _roadMode;
  const definition = roadRoutes[routeId];
  const demo = definition.dataset;
  const demoStations = definition.stations;
  const totalMiles = definition.miles;
  if (!Number.isInteger(index) || index < 0 || index >= demo.records.length)
    throw new RangeError("Invalid telemetry index");
  const currentTelemetry: VehicleTelemetry = demo.records[index];
  const history: VehicleTelemetry[] = demo.records.slice(0, index + 1);
  const route = {
    currentDistanceAlongRouteMiles: definition.progress[index],
    remainingRouteMiles: Math.max(0, totalMiles - definition.progress[index]),
    distanceSource: "verified" as const,
  };
  const vehicle = demo.metadata.vehicle;
  const fuel = calculateFuelIntelligence({
    telemetry: currentTelemetry,
    vehicle,
    route,
    stations: demoStations,
    requiredFuelType: "diesel",
    config: fuelConfig,
  });
  const health = assessVehicleHealth(currentTelemetry, history);
  const consumed =
    ((demo.records[0].fuel_percent - currentTelemetry.fuel_percent) / 100) *
    vehicle.tank_capacity_gallons;
  const averageMpg =
    consumed > 0
      ? (route.currentDistanceAlongRouteMiles ?? 0) / consumed
      : currentTelemetry.mpg;
  const progress = (route.currentDistanceAlongRouteMiles ?? 0) / totalMiles;
  const remainingMinutes =
    (Date.parse(demo.records.at(-1)!.timestamp) -
      Date.parse(currentTelemetry.timestamp)) /
    60000;
  const context: VehicleIntelligenceContext = {
    telemetry: currentTelemetry,
    history: history.slice(-120),
    vehicle,
    route,
    stations: demoStations,
    requiredFuelType: "diesel",
    fuelConfig,
    diagnostics: {
      available: true,
      findings: health.explanations.map((e) => ({
        code: e.code,
        description: e.description,
        severity: e.severity === "INFO" ? "info" : "warning",
      })),
    },
    efficiency: null,
    demoMode: true,
  };
  return {
    index,
    currentTelemetry,
    history,
    route,
    vehicle,
    fuel,
    health,
    averageMpg,
    progress,
    remainingMinutes,
    context,
    totalMiles,
    definition,
    dataset: demo,
    stations: demoStations,
  };
}
export type DemoSnapshot = ReturnType<typeof getDemoSnapshot>;
/** Display projection only. Never used for road distance, range or station eligibility. */
export function projectDemoLocation(
  latitude: number | null,
  longitude: number | null,
) {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  )
    return null;
  return {
    x: 235 + ((longitude + 98.4936) / 0.7505) * 443,
    y: 416 - ((latitude - 29.4241) / 0.8431) * 328,
  };
}
export function formatDemoTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}
export function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Gemma can choose only a currently M3-confirmed feasible candidate; calculations remain authoritative. */
export function selectFeasibleRecommendation(
  fuel: import("../fuel/types").FuelIntelligenceResult,
  advice: import("../intelligence/types").VehicleIntelligenceResult,
  timestamp: string,
) {
  const baseline = fuel.recommendation.recommended;
  if (advice.source !== "gemma4" || advice.telemetryTimestamp !== timestamp)
    return baseline;
  const selectedId = advice.insights.find(
    (i) => i.relatedStationId,
  )?.relatedStationId;
  return (
    [baseline, ...fuel.recommendation.alternatives].find(
      (candidate) =>
        candidate !== null &&
        candidate.station.id === selectedId &&
        candidate.reachability.status === "REACHABLE",
    ) ?? baseline
  );
}
