import type { FuelStation } from "@/lib/fuel/types";

/**
 * Stations shown on the map are limited to Love's locations whose official
 * location pages list diesel, commercial-truck parking and DEF lanes. Prices
 * are snapshots checked 2026-10-31, not a live price feed.
 *
 * Coordinates are copied from the Google Maps links on each official location
 * page. Route membership is intentionally limited to stops near that route.
 */
export type VerifiedTruckStop = Omit<
  FuelStation,
  "distanceAlongRouteMiles" | "detourMiles"
> & {
  address: string;
  sourceUrl: string;
  priceVerifiedAt: string;
  truckParkingSpaces: number;
  defLanes: number;
  routeIds: readonly ("austin" | "dallas" | "houston" | "el-paso")[];
};

const stop = (
  store: string,
  citySlug: string,
  city: string,
  address: string,
  latitude: number,
  longitude: number,
  pricePerGallon: number,
  truckParkingSpaces: number,
  defLanes: number,
  routeIds: VerifiedTruckStop["routeIds"],
): VerifiedTruckStop => ({
  id: `loves-${store}`,
  name: `Love's Travel Stop #${store}`,
  address: `${address}, ${city}, TX`,
  latitude,
  longitude,
  fuelTypes: ["diesel"],
  pricePerGallon,
  priceSource: "verified",
  priceVerifiedAt: "2026-10-31",
  sourceUrl: `https://www.loves.com/locations/tx/${citySlug}/loves-travel-stop-${citySlug}-${store}`,
  truckAccess: "yes",
  truckParkingSpaces,
  defLanes,
  isAvailable: true,
  isSynthetic: false,
  routeIds,
});

export const verifiedTruckStops: readonly VerifiedTruckStop[] = [
  stop("960", "san-antonio", "San Antonio", "9530 Southton Rd", 29.324303, -98.432278, 5.68, 70, 8, ["austin", "dallas", "houston", "el-paso"]),
  stop("242", "san-antonio", "San Antonio", "11361 S I-35", 29.31101, -98.617826, 6.14, 91, 6, ["austin"]),
  stop("719", "troy", "Troy", "1610 Cotton Gin Rd", 31.191227, -97.312105, 5.82, 184, 9, ["dallas"]),
  stop("231", "hillsboro", "Hillsboro", "1501 Corsicana Hwy", 32.00952, -97.093528, 6.04, 53, 7, ["dallas"]),
  stop("294", "dallas", "Dallas", "8800 S Polk Street", 32.640809, -96.839275, 5.98, 27, 7, ["dallas"]),
  stop("234", "katy", "Katy", "612 Pederson Rd", 29.779813, -95.881907, 6.14, 77, 8, ["houston"]),
  stop("419", "houston", "Houston", "210 Patton St", 29.797437, -95.369817, 5.84, 250, 8, ["houston"]),
  stop("315", "houston", "Houston", "3940 N McCarty St", 29.798591, -95.269023, 5.94, 100, 8, ["houston"]),
  stop("464", "comfort", "Comfort", "43 US Highway 87", 29.98203, -98.903241, 6.14, 60, 7, ["el-paso"]),
  stop("700", "sonora", "Sonora", "3880 Loop 467", 30.571142, -100.585636, 6.69, 71, 8, ["el-paso"]),
  stop("256", "van-horn", "Van Horn", "810 E Broadway", 31.040102, -104.819253, 6.09, 34, 5, ["el-paso"]),
  stop("214", "el-paso", "El Paso", "1300 Horizon Blvd", 31.65976, -106.237409, 6.08, 98, 9, ["el-paso"]),
];
