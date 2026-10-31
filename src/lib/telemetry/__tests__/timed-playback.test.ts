import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoTelemetryProvider } from "../provider";
import type { RunDuration } from "../types";
afterEach(() => vi.useRealTimers());
describe("timed full-run playback", () => {
  it.each([10, 15, 20] as RunDuration[])(
    "finishes the trip in %s seconds with one timer",
    async (seconds) => {
      vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "performance"],
      });
      const p = createDemoTelemetryProvider();
      p.setRunDuration(seconds);
      p.play();
      await vi.advanceTimersByTimeAsync(seconds * 1000 - 5);
      expect(p.getPlaybackState().status).toBe("playing");
      expect(
        p.getElapsedMs() / p.getPlaybackState().duration_ms,
      ).toBeGreaterThan(0.99);
      await vi.advanceTimersByTimeAsync(10);
      expect(p.getPlaybackState().status).toBe("ended");
      expect(vi.getTimerCount()).toBe(0);
      p.dispose();
    },
  );
  it("interpolates between readings, freezes on pause and seeks without a drifting clock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const p = createDemoTelemetryProvider();
    p.setRunDuration(10);
    p.play();
    await vi.advanceTimersByTimeAsync(12);
    expect(p.getElapsedMs()).toBeGreaterThan(p.getPlaybackState().elapsed_ms);
    p.pause();
    const elapsed = p.getElapsedMs();
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.getElapsedMs()).toBe(elapsed);
    p.seekTo(100);
    expect(p.getElapsedMs()).toBe(p.getPlaybackState().elapsed_ms);
    p.setRunDuration(20);
    p.play();
    await vi.advanceTimersByTimeAsync(200);
    p.setPlaybackSpeed(1);
    expect(p.getPlaybackState().run_duration_seconds).toBeNull();
    p.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
