import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement, useEffect } from "react";
import { getDemoSnapshot } from "../../lib/integration/snapshot";
import {
  buildFallback,
  prepareIntelligenceContext,
} from "../../lib/intelligence";
import { useIntegratedVehicle } from "../useIntegratedVehicle";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let latest: ReturnType<typeof useIntegratedVehicle>;
function Probe() {
  const current = useIntegratedVehicle();
  useEffect(() => {
    latest = current;
  }, [current]);
  return null;
}
let root: ReactTestRenderer;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ available: false, model: "gemma-4-26b-a4b-it" }),
    ),
  );
});
afterEach(async () => {
  if (root) await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    root = create(createElement(Probe));
  });
}
describe("single integrated playback lifecycle", () => {
  it("initializes one current reading and fallback intelligence", async () => {
    await mount();
    expect(latest.playback.index).toBe(0);
    expect(latest.snapshot.currentTelemetry.fuel_percent).toBe(17);
    expect(latest.intelligence.result.source).toBe("fallback");
  });
  it("plays, pauses, selects speed, seeks and resets every derived feature", async () => {
    await mount();
    await act(() => {
      latest.setPlaybackSpeed(5);
      latest.play();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(latest.playback.index).toBeGreaterThan(0);
    expect(latest.playback.speed).toBe(5);
    await act(() => latest.pause());
    const paused = latest.playback.index;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(latest.playback.index).toBe(paused);
    await act(() => latest.seekTo(160));
    expect(latest.snapshot.health.activeCodes).toEqual(["P0301"]);
    expect(latest.intelligence.result.telemetryTimestamp).toBe(
      latest.snapshot.currentTelemetry.timestamp,
    );
    await act(() => latest.seekTo(10));
    expect(latest.snapshot.health.recentEvents).toEqual([]);
    await act(() => latest.reset());
    expect(latest.playback.index).toBe(0);
    expect(latest.snapshot.stations.every(s => s.id.startsWith("osm-"))).toBe(true);
  });
  it("makes no AI POST calls when the key is unavailable, including playback ticks", async () => {
    await mount();
    await act(() => {
      latest.setPlaybackSpeed(5);
      latest.play();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(latest.playback.index).toBeGreaterThan(1);
    expect(
      vi.mocked(fetch).mock.calls.every((call) => call[1]?.method !== "POST"),
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not request AI on ordinary ticks or display an older Gemma timestamp as current", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        if (options?.method === "POST") {
          const { index } = JSON.parse(String(options.body)) as {
            index: number;
          };
          const s = getDemoSnapshot(index);
          return Response.json({
            ...buildFallback(prepareIntelligenceContext(s.context), 0),
            source: "gemma4",
            model: "gemma-4-26b-a4b-it",
          });
        }
        return Response.json({ available: true, model: "gemma-4-26b-a4b-it" });
      }),
    );
    await mount();
    expect(latest.intelligence.result.source).toBe("gemma4");
    await act(() => {
      latest.setPlaybackSpeed(5);
      latest.play();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(latest.playback.index).toBeGreaterThan(0);
    expect(
      vi.mocked(fetch).mock.calls.filter((c) => c[1]?.method === "POST"),
    ).toHaveLength(1);
    expect(latest.intelligence.result.source).toBe("fallback");
    expect(latest.intelligence.result.telemetryTimestamp).toBe(
      latest.snapshot.currentTelemetry.timestamp,
    );
  });
  it("cancels playback timers when the owning component unmounts", async () => {
    await mount();
    await act(() => latest.play());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("changing keyed road sessions resets readings and cancels the previous replay", async () => {
  function RoadProbe({ routeId }: { routeId: "dallas" | "houston" }) {
    const current = useIntegratedVehicle(routeId, true);
    useEffect(() => { latest = current; }, [current]);
    return null;
  }
  await act(async () => { root = create(createElement(RoadProbe, { key: "dallas", routeId: "dallas" })); });
  await act(() => { latest.seekTo(160); latest.play(); });
  expect(latest.snapshot.health.activeCodes).toContain("P0301");
  const previous = latest.snapshot.currentTelemetry.timestamp;
  await act(async () => { root.update(createElement(RoadProbe, { key: "houston", routeId: "houston" })); });
  expect(latest.playback.index).toBe(0);
  expect(latest.playback.status).toBe("ready");
  expect(latest.snapshot.definition.destination).toBe("Houston");
  expect(latest.snapshot.health.activeCodes).toEqual([]);
  expect(latest.snapshot.currentTelemetry.timestamp).not.toBe(previous);
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(latest.playback.index).toBe(0);
});
