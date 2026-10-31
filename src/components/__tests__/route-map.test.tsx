import { afterEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import RouteMap from "../route-map";
import { roadRoutes } from "../../lib/integration/road-routes";

const calls = vi.hoisted(() => ({
  layers: [] as unknown[],
  sources: [] as unknown[],
  removed: 0,
  markersRemoved: 0,
  fit: 0,
}));
vi.mock("maplibre-gl", () => ({
  Map: class {
    constructor() {
      calls.layers = [];
      calls.sources = [];
    }
    addControl() {}
    on(event: string, callback: () => void) {
      if (event === "load") callback();
    }
    addSource(id: string, data: unknown) {
      calls.sources.push({ id, data });
    }
    addLayer(layer: unknown) {
      calls.layers.push(layer);
    }
    getStyle() {
      return { sources: { openmaptiles: { type: "vector" } } };
    }
    getSource() {
      return { setData() {} };
    }
    resize() {}
    jumpTo() {}
    easeTo() {}
    fitBounds() {
      calls.fit++;
    }
    remove() {
      calls.removed++;
    }
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      calls.markersRemoved++;
    }
  },
  NavigationControl: class {},
  ScaleControl: class {},
}));
let root: ReactTestRenderer;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("creates real geometry and 3D layers, exposes overview, and releases owned map resources", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("document", {
    createElement: () => ({
      className: "",
      setAttribute() {},
      addEventListener() {},
      classList: { toggle() {} },
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const route = roadRoutes.dallas;
  const removedBefore = calls.removed,
    markersBefore = calls.markersRemoved;
  await act(async () => {
    root = create(
      createElement(RouteMap, {
        routeId: "dallas",
        telemetry: route.dataset.records[0],
        stations: route.stations,
        recommendedId: null,
        onStation() {},
      }),
      { createNodeMock: () => ({}) },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(calls.sources).toContainEqual(
    expect.objectContaining({
      id: "trip-road",
      data: expect.objectContaining({
        data: expect.objectContaining({
          geometry: expect.objectContaining({
            coordinates: route.road.geometry.coordinates,
          }),
        }),
      }),
    }),
  );
  expect(calls.layers).toContainEqual(
    expect.objectContaining({ id: "cruze-buildings", type: "fill-extrusion" }),
  );
  const overview = root.root
    .findAllByType("button")
    .find((button) => button.props.children.includes("Route"))!;
  expect(overview.props.disabled).toBe(false);
  await act(() => overview.props.onClick());
  expect(calls.fit).toBeGreaterThan(0);
  await act(() => root.unmount());
  expect(calls.removed).toBe(removedBefore + 1);
  expect(calls.markersRemoved).toBe(markersBefore + route.stations.length + 1);
});
