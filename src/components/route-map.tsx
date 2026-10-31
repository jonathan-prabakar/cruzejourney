"use client";
import { useEffect, useRef, useState } from "react";
import { Fuel, Layers, LocateFixed, Map as MapIcon } from "lucide-react";
import type { GeoJSONSource, Map as LibreMap, Marker } from "maplibre-gl";
import {
  bearingAtProgress,
  geometryDistances,
  pointAtProgress,
} from "@/lib/integration/road-geometry";
import type { RoadRoute } from "@/lib/integration/road-routes";
import { roadRoutes } from "@/lib/integration/road-routes";
import type { DemoRouteId } from "@/lib/integration/routes";
import type { FuelStation } from "@/lib/fuel/types";
import type { VehicleTelemetry } from "@/lib/telemetry/types";

export default function RouteMap({
  routeId = "austin",
  onStation,
  telemetry,
  stations,
  recommendedId,
  trip,
  getMotionProgress,
  playing = false,
  fastRun = false,
  onStations,
}: {
  routeId?: DemoRouteId;
  trip?: RoadRoute;
  getMotionProgress?: () => number;
  playing?: boolean;
  fastRun?: boolean;
  onStations?: (trigger: HTMLElement) => void;
  onStation: (station: FuelStation, trigger: HTMLElement | SVGElement) => void;
  telemetry: VehicleTelemetry;
  stations: readonly FuelStation[];
  recommendedId: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const truck = useRef<Marker | null>(null);
  const latest = useRef({ telemetry, onStation });
  useEffect(() => {
    latest.current = { telemetry, onStation };
  }, [telemetry, onStation]);
  const [status, setStatus] = useState("Loading real road map…");
  const [ready, setReady] = useState(false);
  const [is3d, setIs3d] = useState(true);
  const [follow, setFollow] = useState(true);
  const route = trip ?? roadRoutes[routeId];
  const overview = () => {
    const coordinates = [
      ...route.road.geometry.coordinates,
      ...stations.flatMap((station) =>
        station.latitude === null || station.longitude === null
          ? []
          : [[station.longitude, station.latitude]],
      ),
    ];
    const longitudes = coordinates.map((p) => p[0]),
      latitudes = coordinates.map((p) => p[1]);
    map.current?.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: { top: 100, bottom: 145, left: 45, right: 65 },
        duration: 0,
        pitch: 0,
      },
    );
  };
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    const ownedMarkers: Marker[] = [];
    let ownedMap: LibreMap | undefined;
    import("maplibre-gl")
      .then((lib) => {
        if (cancelled || !container.current) return;
        lib.setWorkerUrl(
          new URL(
            "maplibre-gl/dist/maplibre-gl-worker.mjs",
            import.meta.url,
          ).toString(),
        );
        const current = latest.current.telemetry;
        const instance = new lib.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/dark",
          center: [current.longitude!, current.latitude!],
          zoom: 12.7,
          pitch: 55,
          bearing: 0,
          attributionControl: { compact: true },
          maxPitch: 65,
        });
        ownedMap = instance;
        map.current = instance;
        instance.addControl(
          new lib.NavigationControl({ showCompass: true }),
          "bottom-right",
        );
        instance.addControl(
          new lib.ScaleControl({ unit: "imperial" }),
          "bottom-right",
        );
        instance.on("error", () => {
          if (!cancelled)
            setStatus(
              "Some map tiles could not load. Route data and replay remain available.",
            );
        });
        instance.on("load", () => {
          if (cancelled) return;
          instance.addSource("trip-road", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: route.road.geometry.coordinates,
              },
            },
          });
          instance.addLayer({
            id: "trip-road-halo",
            type: "line",
            source: "trip-road",
            paint: { "line-color": "#082d41", "line-width": 10 },
          });
          instance.addLayer({
            id: "trip-road-line",
            type: "line",
            source: "trip-road",
            paint: { "line-color": "#3b82f6", "line-width": 5 },
          });
          instance.addSource("trip-position", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          const source = instance.getStyle().sources;
          const vectorSource = Object.keys(source).find(
            (key) => source[key].type === "vector",
          );
          if (vectorSource)
            instance.addLayer({
              id: "cruze-buildings",
              type: "fill-extrusion",
              source: vectorSource,
              "source-layer": "building",
              minzoom: 13,
              filter: ["!=", ["get", "hide_3d"], true],
              paint: {
                "fill-extrusion-color": "#33495d",
                "fill-extrusion-height": [
                  "coalesce",
                  ["get", "render_height"],
                  6,
                ],
                "fill-extrusion-base": [
                  "coalesce",
                  ["get", "render_min_height"],
                  0,
                ],
                "fill-extrusion-opacity": 0.8,
              },
            });
          const mappedStops = stations.filter(
            (station) => station.latitude !== null && station.longitude !== null,
          );
          const stationById = new Map(mappedStops.map((station) => [station.id, station]));
          instance.addSource("truck-stops", {
            type: "geojson",
            cluster: true,
            clusterRadius: 48,
            clusterMaxZoom: 9,
            promoteId: "stationId",
            data: {
              type: "FeatureCollection",
              features: mappedStops.map((station) => ({
                type: "Feature" as const,
                properties: {
                  stationId: station.id,
                  displayLabel: station.name.replace("Love's Travel Stop ", ""),
                  priceLabel:
                    station.pricePerGallon === null
                      ? "price unknown"
                      : `$${station.pricePerGallon.toFixed(2)}`,
                },
                geometry: {
                  type: "Point" as const,
                  coordinates: [station.longitude!, station.latitude!],
                },
              })),
            },
          });
          instance.addLayer({
            id: "truck-stop-clusters",
            type: "circle",
            source: "truck-stops",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#ffb547",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                5,
                22,
                10,
                27,
              ],
              "circle-stroke-color": "#152638",
              "circle-stroke-width": 3,
            },
          });
          instance.addLayer({
            id: "truck-stop-cluster-count",
            type: "symbol",
            source: "truck-stops",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 13,
              "text-font": ["Noto Sans Regular"],
            },
            paint: { "text-color": "#122131" },
          });
          instance.addLayer({
            id: "truck-stop-points",
            type: "circle",
            source: "truck-stops",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": [
                "case",
                ["boolean", ["feature-state", "recommended"], false],
                "#00d1a7",
                "#ffb547",
              ],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 10, 10, 13, 15, 16],
              "circle-stroke-color": "#142536",
              "circle-stroke-width": 3,
            },
          });
          instance.addLayer({
            id: "truck-stop-labels",
            type: "symbol",
            source: "truck-stops",
            filter: ["!", ["has", "point_count"]],
            minzoom: 10,
            layout: {
              "text-field": ["concat", ["get", "displayLabel"], " · ", ["get", "priceLabel"]],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-offset": [0, 1.55],
              "text-anchor": "top",
              "text-max-width": 14,
              "text-optional": true,
            },
            paint: {
              "text-color": "#fff5dc",
              "text-halo-color": "#101923",
              "text-halo-width": 1.5,
            },
          });
          instance.addLayer({
            id: "truck-stop-diesel-mark",
            type: "symbol",
            source: "truck-stops",
            filter: ["!", ["has", "point_count"]],
            layout: {
              "text-field": "D",
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#162535" },
          });
          const chooseStop = (event: { features?: { properties?: Record<string, unknown> }[] }) => {
            const id = event.features?.[0]?.properties?.stationId;
            const station = typeof id === "string" ? stationById.get(id) : undefined;
            if (station) latest.current.onStation(station, instance.getCanvas());
          };
          instance.on("click", "truck-stop-points", chooseStop);
          instance.on("click", "truck-stop-diesel-mark", chooseStop);
          instance.on("click", "truck-stop-labels", chooseStop);
          instance.on("click", "truck-stop-clusters", async (event) => {
            const feature = event.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            const coordinates = feature?.geometry;
            const source = instance.getSource("truck-stops") as GeoJSONSource | undefined;
            if (
              typeof clusterId !== "number" ||
              !coordinates || coordinates.type !== "Point" ||
              !Array.isArray(coordinates.coordinates) || !source
            ) return;
            try {
              const zoom = await source.getClusterExpansionZoom(clusterId);
              if (!cancelled)
                instance.easeTo({
                  center: coordinates.coordinates as [number, number],
                  zoom,
                  duration: 350,
                });
            } catch {
              // Keep the route usable if a tile worker cannot expand a cluster.
            }
          });
          instance.on("mouseenter", "truck-stop-points", () => {
            instance.getCanvas().style.cursor = "pointer";
          });
          instance.on("mouseleave", "truck-stop-points", () => {
            instance.getCanvas().style.cursor = "";
          });
          const vehicle = document.createElement("div");
          vehicle.className = "real-truck-marker";
          vehicle.setAttribute("role", "img");
          vehicle.setAttribute(
            "aria-label",
            "Simulated vehicle on real road route",
          );
          vehicle.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 8 19-8-4-8 4Z"/></svg>';
          const reading = latest.current.telemetry;
          truck.current = new lib.Marker({
            element: vehicle,
            rotationAlignment: "map",
          })
            .setLngLat([reading.longitude!, reading.latitude!])
            .addTo(instance);
          ownedMarkers.push(truck.current);
          setReady(true);
          setStatus("");
        });
        observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
      })
      .catch(() => {
        if (!cancelled)
          setStatus(
            "Interactive map unavailable. Replay and station list still work.",
          );
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      ownedMarkers.forEach((marker) => marker.remove());
      ownedMap?.remove();
      map.current = null;
      truck.current = null;
    };
  }, [route, stations]);
  useEffect(() => {
    if (!ready) return;
    const cumulative = geometryDistances(route.road.geometry.coordinates);
    let frame = 0;
    const draw = () => {
      const progress = getMotionProgress?.();
      const point: [number, number] =
        progress === undefined
          ? [telemetry.longitude!, telemetry.latitude!]
          : pointAtProgress(
              route.road.geometry.coordinates,
              cumulative,
              progress,
            );
      truck.current?.setLngLat(point);
      if (progress !== undefined) {
        truck.current?.setRotation(
          bearingAtProgress(route.road.geometry.coordinates, cumulative, progress),
        );
      }
      if (follow)
        map.current?.jumpTo({
          center: point,
          zoom: fastRun ? 11 : 13.8,
          pitch: is3d ? 55 : 0,
        });
      if (playing && getMotionProgress) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [
    ready,
    route,
    getMotionProgress,
    playing,
    follow,
    is3d,
    fastRun,
    telemetry.latitude,
    telemetry.longitude,
  ]);
  useEffect(() => {
    if (!ready || !map.current?.getSource("truck-stops")) return;
    stations.forEach((station) => {
      map.current?.setFeatureState(
        { source: "truck-stops", id: station.id },
        { recommended: station.id === recommendedId },
      );
    });
  }, [recommendedId, ready, stations]);
  return (
    <section
      className="route-map real-route-map"
      aria-label={`Road map with verified truck stops from San Antonio to ${route.destination}`}
    >
      <div ref={container} className="real-map-container" />
      {status && (
        <p className="map-load-status" role="status">
          {status}
        </p>
      )}
      <div className="real-map-controls">
        <button
          type="button"
          aria-label={`Show all ${stations.length} verified truck stops`}
          onClick={(event) => onStations?.(event.currentTarget)}
        >
          <Fuel size={17} /> <span>Truck stops ({stations.length})</span>
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={is3d}
          onClick={() => {
            setIs3d(!is3d);
            map.current?.easeTo({
              pitch: is3d ? 0 : 55,
              duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? 0
                : 400,
            });
          }}
        >
          <Layers size={15} />
          {is3d ? "3D" : "2D"}
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-pressed={follow}
          onClick={() => setFollow(!follow)}
        >
          <LocateFixed size={15} />
          Follow
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            setFollow(false);
            setIs3d(false);
            overview();
          }}
        >
          <MapIcon size={15} />
          Route
        </button>
      </div>
    </section>
  );
}
