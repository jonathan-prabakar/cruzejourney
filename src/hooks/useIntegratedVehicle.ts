"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useVehicleTelemetry } from "./useVehicleTelemetry";
import { createDemoTelemetryProvider } from "../lib/telemetry/provider";
import {
  demoDataset,
  getDemoSnapshot,
  selectFeasibleRecommendation,
} from "../lib/integration/snapshot";
import {
  IntelligenceController,
  prepareIntelligenceContext,
  buildFallback,
} from "../lib/intelligence";
import type { VehicleIntelligenceResult } from "../lib/intelligence/types";

const recordIndices = new Map(
  demoDataset.records.map((r, i) => [r.timestamp, i]),
);
export function useIntegratedVehicle() {
  const [provider] = useState(() => createDemoTelemetryProvider());
  const playback = useVehicleTelemetry(provider);
  const snapshot = useMemo(
    () => getDemoSnapshot(playback.playback.index),
    [playback.playback.index],
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
          body: JSON.stringify({ index }),
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
      error: intelligenceState.result?.error ?? null,
      statusLabel: intelligenceState.status === 'analyzing' || intelligenceState.status === 'pending'
        ? 'Analyzing' : result.source === 'gemma4' ? 'Gemma 4 active'
        : intelligenceState.result?.error?.code === 'UNKNOWN_MODEL' ? 'Model unavailable'
        : intelligenceState.result?.error ? 'Error · retry' : 'Deterministic fallback',
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
