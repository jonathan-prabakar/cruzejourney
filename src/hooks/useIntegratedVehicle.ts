"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useVehicleTelemetry } from "./useVehicleTelemetry";
import { TelemetryPlayback } from "../lib/telemetry/playback";
import { roadRoutes } from "../lib/integration/road-routes";
import { type DemoRouteId } from "../lib/integration/routes";
import {
  getDemoSnapshot,
  selectFeasibleRecommendation,
} from "../lib/integration/snapshot";
import {
  IntelligenceController,
  prepareIntelligenceContext,
  buildFallback,
} from "../lib/intelligence";
import type { VehicleIntelligenceResult } from "../lib/intelligence/types";

export function useIntegratedVehicle(
  routeId: DemoRouteId = "austin",
  roadMode = true,
) {
  const dataset = roadRoutes[routeId].dataset;
  const recordIndices = new Map(
    dataset.records.map((r, i) => [r.timestamp, i]),
  );
  const [provider] = useState(() => {
    const provider = new TelemetryPlayback();
    if (!provider.loadDataset(dataset).valid)
      throw new Error("Invalid route dataset");
    return provider;
  });
  const playback = useVehicleTelemetry(provider);
  const snapshot = useMemo(
    () => getDemoSnapshot(playback.playback.index, routeId, roadMode),
    [playback.playback.index, routeId, roadMode],
  );
  const [availability, setAvailability] = useState<{
    available: boolean;
    model: string;
  } | null>(null);
  const [controller] = useState(
    () =>
      new IntelligenceController(async (context, options) => {
        const index = recordIndices.get(context.telemetry?.timestamp ?? "");
        if (index === undefined) throw new Error("Unknown dataset reading");
        const response = await fetch("/api/intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index,
            routeId,
            ...(roadMode ? { mode: "road" } : {}),
          }),
          signal: options?.signal,
        });
        if (!response.ok) throw new Error("Intelligence service unavailable");
        return (await response.json()) as VehicleIntelligenceResult;
      }),
  );
  const intelligenceState = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const fallback = useMemo(
    () =>
      buildFallback(
        prepareIntelligenceContext(snapshot.context),
        Date.parse(snapshot.currentTelemetry.timestamp),
      ),
    [snapshot],
  );
  // Advice for a previous timestamp is never displayed as current, including after a seek.
  const result =
    intelligenceState.result?.source === "gemma4" &&
    intelligenceState.result.telemetryTimestamp ===
      snapshot.currentTelemetry.timestamp
      ? intelligenceState.result
      : fallback;
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/intelligence", { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (
          !abort.signal.aborted &&
          data &&
          typeof data === "object" &&
          "available" in data &&
          typeof data.available === "boolean" &&
          "model" in data &&
          typeof data.model === "string"
        )
          setAvailability({ available: data.available, model: data.model });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setAvailability({ available: false, model: "" });
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (availability?.available) controller.update(snapshot.context);
  }, [availability, snapshot, controller]);
  // Pause/invalidate are reusable in Strict Mode; hook subscriptions unsubscribe themselves.
  // This cancels every owned timer/request on unmount without reusing a disposed provider.
  useEffect(
    () => () => {
      provider.pause();
      controller.invalidate();
    },
    [provider, controller],
  );
  return {
    snapshot,
    selectedStop: selectFeasibleRecommendation(
      snapshot.fuel,
      result,
      snapshot.currentTelemetry.timestamp,
    ),
    playback: playback.playback,
    play: playback.play,
    pause: playback.pause,
    reset: () => {
      controller.invalidate();
      playback.reset();
    },
    seekTo: (index: number) => {
      controller.invalidate();
      playback.seekTo(index);
    },
    setPlaybackSpeed: playback.setPlaybackSpeed,
    intelligence: {
      result,
      state: intelligenceState.status,
      available: availability?.available ?? false,
      checking: availability === null,
      refresh: () => {
        if (availability?.available)
          controller.requestAssessment(snapshot.context);
      },
    },
  };
}
