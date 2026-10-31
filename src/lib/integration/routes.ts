import original from "../../data/demo-telemetry.json";
import { getDemoFuelStations, DEMO_ROUTE_LENGTH_MILES } from "../fuel";
import type { TelemetryDataset } from "../telemetry/types";
export const routeIds = ["austin", "dallas", "houston", "el-paso"] as const;
export type DemoRouteId = (typeof routeIds)[number];
export function isDemoRouteId(value: unknown): value is DemoRouteId {
  return routeIds.some((id) => id === value);
}
const definitions = {
  austin: {
    destination: "Austin",
    corridor: "I-35 North",
    miles: DEMO_ROUTE_LENGTH_MILES,
    fuel: 17,
    end: [30.2672, -97.7431],
  },
  dallas: {
    destination: "Dallas",
    corridor: "I-35 North",
    miles: 275,
    fuel: 39,
    end: [32.7767, -96.797],
  },
  houston: {
    destination: "Houston",
    corridor: "I-10 East",
    miles: 200,
    fuel: 31,
    end: [29.7604, -95.3698],
  },
  "el-paso": {
    destination: "El Paso",
    corridor: "I-10 West",
    miles: 550,
    fuel: 70,
    end: [31.7619, -106.485],
  },
};
// Authored simulation assumptions, not surveyed road geometry or verified trip distances.
function createRoute(id: DemoRouteId) {
  const definition = definitions[id];
  const scale = definition.miles / DEMO_ROUTE_LENGTH_MILES;
  const start = Date.parse(original.records[0].timestamp);
  const day = routeIds.indexOf(id) * 86400000;
  let miles = 0;
  let gallons = 0;
  const progress: number[] = [];
  const records = original.records.map((record, index) => {
    const previous = original.records[index - 1];
    if (previous) {
      const distance =
        ((((record.speed_mph + previous.speed_mph) / 2) *
          (Date.parse(record.timestamp) - Date.parse(previous.timestamp))) /
          3600000) *
        scale;
      miles += distance;
      gallons += distance / record.mpg;
    }
    progress.push(miles);
    const fraction = miles / definition.miles;
    return {
      ...record,
      timestamp: new Date(
        start +
          day +
          Math.round((Date.parse(record.timestamp) - start) * scale),
      ).toISOString(),
      latitude: 29.4241 + (definition.end[0] - 29.4241) * fraction,
      longitude: -98.4936 + (definition.end[1] + 98.4936) * fraction,
      fuel_percent:
        definition.fuel -
        (gallons / original.metadata.vehicle.tank_capacity_gallons) * 100,
    };
  });
  const dataset: TelemetryDataset =
    id === "austin"
      ? original
      : {
          metadata: {
            ...original.metadata,
            name: `${definition.destination} synthetic replay`,
            route: `San Antonio to ${definition.destination}`,
            limitations: [
              ...original.metadata.limitations,
              "Authored corridor and distance; not real routing. All fuel stations are fictional.",
            ],
          },
          records,
        };
  const stations = getDemoFuelStations().map((station, index) => {
    if (id === "austin") return station;
    const fraction = (index + 1) / 11;
    return {
      ...station,
      id: `${id}-demo-${index + 1}`,
      name: `${definition.destination} Demo Fuel Stop ${index + 1}`,
      latitude: 29.4241 + (definition.end[0] - 29.4241) * fraction,
      longitude: -98.4936 + (definition.end[1] + 98.4936) * fraction,
      distanceAlongRouteMiles: definition.miles * fraction,
      isSynthetic: true,
      priceSource: "sample" as const,
    };
  });
  return { id, ...definition, dataset, stations, progress };
}
export const demoRoutes = Object.fromEntries(
  routeIds.map((id) => [id, createRoute(id)]),
) as Record<DemoRouteId, ReturnType<typeof createRoute>>;
