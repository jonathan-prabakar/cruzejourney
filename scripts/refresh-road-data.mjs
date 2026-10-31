/** Explicit maintenance task; never called during playback/build. No credentials required. */
import { mkdir, writeFile } from "node:fs/promises";
const root = new URL("../src/data/road-routes/", import.meta.url);
await mkdir(root, { recursive: true });
const destinations = {
  austin: [-97.7431, 30.2672],
  dallas: [-96.797, 32.7767],
  houston: [-95.3698, 29.7604],
  "el-paso": [-106.485, 31.7619],
};
const origin = [-98.4936, 29.4241];
const osrm = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const overpass =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1100));
async function json(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": "CruzeFuelSense-Hackathon-DataRefresh/1.0",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok)
    throw new Error(`${response.status} from ${new URL(url).hostname}`);
  return response.json();
}
async function route(points, overview = "full") {
  await pause();
  const result = await json(
    `${osrm}/route/v1/driving/${points.map((p) => p.join(",")).join(";")}?overview=${overview}&geometries=geojson&steps=false${points.length === 3 ? "&radiuses=100;75;100" : ""}`,
  );
  if (result.code !== "Ok" || !result.routes?.[0])
    throw new Error("No road route");
  if (points.length === 3 && result.waypoints[1].distance > 75)
    throw new Error("Station access snapped too far from mapped station");
  return result.routes[0];
}
const rad = (n) => (n * Math.PI) / 180;
function distance(a, b) {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  const y = rad(b[1] - a[1]);
  return Math.hypot(x, y) * 6371000;
}
function nearest(point, coordinates, cumulative) {
  let best = { distance: Infinity, index: 0 };
  coordinates.forEach((coordinate, index) => {
    const d = distance(point, coordinate);
    if (d < best.distance) best = { distance: d, index };
  });
  return { ...best, along: cumulative[best.index] };
}
for (const [id, end] of Object.entries(destinations)) {
  if (process.argv[2] && process.argv[2] !== id) continue;
  console.log(`Fetching ${id} road route`);
  const road = await route([origin, end]);
  const coordinates = road.geometry.coordinates;
  let sum = 0;
  const cumulative = coordinates.map((point, index) => {
    if (index) sum += distance(coordinates[index - 1], point);
    return sum;
  });
  const queries = [];
  for (let meter = 10000; meter < sum - 5000; meter += 30000) {
    const i = cumulative.findIndex((d) => d >= meter);
    const [lon, lat] = coordinates[i];
    queries.push(`nwr["amenity"="fuel"](around:2000,${lat},${lon});`);
  }
  const query = `[out:json][timeout:60];(${queries.join("")});out center tags;`;
  const data = await json(overpass, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
  });
  if (data.remark || !Array.isArray(data.elements))
    throw new Error("Incomplete Overpass response");
  const candidates = data.elements
    .map((element) => {
      const point = [
        element.lon ?? element.center?.lon,
        element.lat ?? element.center?.lat,
      ];
      if (!point.every(Number.isFinite)) return null;
      return { element, point, ...nearest(point, coordinates, cumulative) };
    })
    .filter((p) => p && p.distance < 2500)
    .sort((a, b) => a.along - b.along);
  // Keep a small, geographically distributed snapshot; prefer explicitly mapped diesel.
  const selected = [];
  for (let meter = 10000; meter < sum; meter += sum / 12) {
    const options = candidates.filter(
      (p) =>
        Math.abs(p.along - meter) < sum / 18 &&
        !selected.some((s) => s.element.id === p.element.id),
    );
    options.sort(
      (a, b) =>
        Number(b.element.tags["fuel:diesel"] === "yes") -
          Number(a.element.tags["fuel:diesel"] === "yes") ||
        Math.abs(a.along - meter) - Math.abs(b.along - meter),
    );
    if (options[0]) selected.push(options[0]);
  }
  const stations = [];
  for (const candidate of selected) {
    const { element, point, index, along } = candidate;
    const beforeIndex = Math.max(
      0,
      cumulative.findLastIndex((d) => d <= along - 1500),
    );
    let afterIndex = cumulative.findIndex((d) => d >= along + 1500);
    if (afterIndex < 0) afterIndex = coordinates.length - 1;
    const access = await route(
      [coordinates[beforeIndex], point, coordinates[afterIndex]],
      "false",
    );
    // Require snapping at the station, rather than silently accepting a distant road.
    // Conservative policy charges the entire local leave-and-rejoin road loop, not straight-line offset.
    stations.push({
      id: `osm-${element.type}-${element.id}`,
      name:
        element.tags.name ||
        element.tags.brand ||
        "Unnamed mapped fuel station",
      latitude: point[1],
      longitude: point[0],
      fuelTypes:
        element.tags["fuel:diesel"] === "yes" ? ["diesel"] : ["unknown"],
      pricePerGallon: null,
      priceSource: "unknown",
      distanceAlongRouteMiles:
        ((cumulative[index] / sum) * road.distance) / 1609.344,
      detourMiles: access.distance / 1609.344,
      isAvailable: true,
      isSynthetic: false,
      osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      tags: element.tags,
      accessPolicy:
        "Entire routed local access loop charged before arrival; conservative, not just extra detour.",
    });
  }
  if (!stations.length) throw new Error(`No stations for ${id}`);
  const snapshot = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    osmTimestamp: data.osm3s?.timestamp_osm_base ?? null,
    routeSource: "OSRM driving profile / OpenStreetMap",
    stationSource: "OpenStreetMap via Overpass",
    license: "OpenStreetMap ODbL 1.0 — https://www.openstreetmap.org/copyright",
    limitations: [
      "Driving profile is not truck-restriction-aware.",
      "Mapped station records may be incomplete or outdated. Hours, current operation, fuel stock, prices and truck access are not verified.",
      "Telemetry and fuel consumption are simulated.",
    ],
    distanceMeters: road.distance,
    durationSeconds: road.duration,
    geometry: road.geometry,
    stations,
  };
  await writeFile(new URL(`${id}.json`, root), JSON.stringify(snapshot));
  console.log(
    `${id}: ${(road.distance / 1609.344).toFixed(1)} road miles, ${stations.length} real mapped stations`,
  );
}
