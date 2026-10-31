import austin from "../../data/road-routes/austin.json";
import dallas from "../../data/road-routes/dallas.json";
import houston from "../../data/road-routes/houston.json";
import elPaso from "../../data/road-routes/el-paso.json";
import original from "../../data/demo-telemetry.json";
import { DEMO_ROUTE_LENGTH_MILES } from "../fuel";
import { validateFuelStations } from "../fuel/stations";
import type { VehicleTelemetry, TelemetryDataset } from "../telemetry/types";
import { destinationDefinitions, routeIds, type DemoRouteId } from "./routes";
import { geometryDistances, pointAtProgress } from "./road-geometry";
const snapshots = { austin, dallas, houston, "el-paso": elPaso };
export function createRoadRoute(id: DemoRouteId) {
  const road = snapshots[id];
  const definition = destinationDefinitions[id];
  const miles = road.distanceMeters / 1609.344;
  const scale = miles / DEMO_ROUTE_LENGTH_MILES;
  const start = Date.parse(original.records[0].timestamp);
  const cumulative = geometryDistances(road.geometry.coordinates);
  let traveled = 0;
  let consumed = 0;
  const progress: number[] = [];
  const records = original.records.map((reading, index) => {
    if (index) {
      const previous = original.records[index - 1];
      const leg =
        ((((reading.speed_mph + previous.speed_mph) / 2) *
          (Date.parse(reading.timestamp) - Date.parse(previous.timestamp))) /
          3600000) *
        scale;
      traveled += leg;
      consumed += leg / reading.mpg;
    }
    progress.push(traveled);
    const [longitude, latitude] = pointAtProgress(
      road.geometry.coordinates,
      cumulative,
      traveled / miles,
    );
    return {
      ...reading,
      latitude,
      longitude,
      timestamp: new Date(
        start +
          (7 + routeIds.indexOf(id)) * 86400000 +
          Math.round((Date.parse(reading.timestamp) - start) * scale),
      ).toISOString(),
      fuel_percent:
        definition.fuel -
        (consumed / original.metadata.vehicle.tank_capacity_gallons) * 100,
    };
  });
  const dataset: TelemetryDataset = {
    metadata: {
      ...original.metadata,
      name: `${definition.destination} road replay`,
      source:
        "Synthetic M2 vehicle signals replayed on cached OSRM/OpenStreetMap roads",
      route: `San Antonio to ${definition.destination}`,
      limitations: road.limitations,
    },
    records,
  };
  const stationResult = validateFuelStations(
    road.stations.map((station) => ({
      ...station,
      priceSource: "unknown",
      truckAccess:
        (station.tags as Record<string, string | undefined>).hgv === "no"
          ? "no"
          : ["yes", "designated"].includes(
                (station.tags as Record<string, string | undefined>).hgv ?? "",
              )
            ? "yes"
            : "unknown",
    })),
  );
  if (!stationResult.valid) throw new Error(`Invalid road stations: ${id}`);
  const stations = stationResult.stations;
  return { ...definition, miles, dataset, stations, progress, road };
}
export const roadRoutes = Object.fromEntries(
  routeIds.map((id) => [id, createRoadRoute(id)]),
) as Record<DemoRouteId, ReturnType<typeof createRoadRoute>>;

export type RoadRoute = ReturnType<typeof createRoadRoute> & {
  priorHistory?: VehicleTelemetry[];
};
export interface RoutePlan {
  id: string;
  trip: RoadRoute;
}
