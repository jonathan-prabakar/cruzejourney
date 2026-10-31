"use client";
import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, Map as MapIcon } from "lucide-react";
import type { Map as LibreMap, Marker, GeoJSONSource } from "maplibre-gl";
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
}: {
  routeId?: DemoRouteId;
  onStation: (station: FuelStation, trigger: HTMLElement | SVGElement) => void;
  telemetry: VehicleTelemetry;
  stations: readonly FuelStation[];
  recommendedId: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const truck = useRef<Marker | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ telemetry, onStation });
  useEffect(() => {
    latest.current = { telemetry, onStation };
  }, [telemetry, onStation]);
  const [status, setStatus] = useState("Loading real road map…");
  const [ready, setReady] = useState(false);
  const [is3d, setIs3d] = useState(true);
  const [follow, setFollow] = useState(true);
  const route = roadRoutes[routeId];
  const overview = () => {
    const coordinates = route.road.geometry.coordinates;
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
    const stationElements = markers.current;
    let ownedMap: LibreMap | undefined;
    import("maplibre-gl")
      .then((lib) => {
        if (cancelled || !container.current) return;
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
          stations.forEach((station) => {
            if (station.latitude === null || station.longitude === null) return;
            const button = document.createElement("button");
            button.className = "real-station-marker";
            button.setAttribute(
              "aria-label",
              `View mapped fuel station ${station.name}`,
            );
            button.title = station.name;
            button.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M1 22h14M4 6h8v6H4m9 2h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9l-4-4m2 2v4h2"/></svg>';
            button.addEventListener("click", () =>
              latest.current.onStation(station, button),
            );
            stationElements.set(station.id, button);
            ownedMarkers.push(
              new lib.Marker({ element: button })
                .setLngLat([station.longitude, station.latitude])
                .addTo(instance),
            );
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
          truck.current = new lib.Marker({ element: vehicle })
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
      stationElements.clear();
    };
  }, [route, stations]);
  useEffect(() => {
    if (!ready || telemetry.latitude === null || telemetry.longitude === null)
      return;
    const point: [number, number] = [telemetry.longitude, telemetry.latitude];
    truck.current?.setLngLat(point);
    (
      map.current?.getSource("trip-position") as GeoJSONSource | undefined
    )?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: point },
    });
    if (follow)
      map.current?.jumpTo({ center: point, zoom: 13.8, pitch: is3d ? 55 : 0 });
    markers.current.forEach((button, id) =>
      button.classList.toggle("recommended", id === recommendedId),
    );
  }, [telemetry, ready, follow, is3d, recommendedId]);
  return (
    <section
      className="route-map real-route-map"
      aria-label={`Real road map from San Antonio to ${route.destination}`}
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
