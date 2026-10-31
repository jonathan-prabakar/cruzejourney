import { parseTelemetryJson } from "./parser";
import { validateDataset } from "./validator";
import type {
  RunDuration,
  DatasetValidationResult,
  PlaybackScheduler,
  PlaybackSpeed,
  PlaybackState,
  PlaybackStatus,
  TelemetryListener,
  TelemetryProvider,
  TelemetrySnapshot,
  VehicleTelemetry,
} from "./types";

const scheduler: PlaybackScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Timestamp-driven, backend-free provider. Each instance owns at most one timeout. */
export class TelemetryPlayback implements TelemetryProvider {
  private records: VehicleTelemetry[] = [];
  private times: number[] = [];
  private listeners = new Set<TelemetryListener>();
  private timer: unknown;
  private timerActive = false;
  private generation = 0;
  private disposed = false;
  private status: PlaybackStatus = "empty";
  private speed: PlaybackSpeed = 1;
  private runDuration: RunDuration | null = null;
  private get effectiveSpeed(): number {
    return this.runDuration && this.duration > 0
      ? this.duration / (this.runDuration * 1000)
      : this.speed;
  }
  private index = -1;
  private elapsed = 0;
  private anchor = 0;
  private snapshot: TelemetrySnapshot;

  constructor(
    private readonly clock: PlaybackScheduler = scheduler,
    private readonly onListenerError: (error: unknown) => void = () => {},
  ) {
    this.snapshot = this.makeSnapshot();
  }

  private get duration(): number {
    return this.times.length ? this.times[this.times.length - 1] : 0;
  }
  private assertActive(): void {
    if (this.disposed) throw new Error("Telemetry provider has been disposed");
  }
  private makeSnapshot(): TelemetrySnapshot {
    return Object.freeze({
      telemetry: this.records[this.index] ?? null,
      playback: Object.freeze({
        status: this.status,
        speed: this.speed,
        run_duration_seconds: this.runDuration,
        index: this.index,
        total: this.records.length,
        progress:
          this.records.length === 0
            ? 0
            : this.duration === 0
              ? 1
              : this.elapsed / this.duration,
        elapsed_ms: this.elapsed,
        duration_ms: this.duration,
      }),
    });
  }
  private publish(): void {
    this.snapshot = this.makeSnapshot();
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }
  private cancel(): void {
    this.generation++;
    if (this.timerActive) this.clock.clearTimeout(this.timer);
    this.timerActive = false;
  }
  private sync(): void {
    if (this.status !== "playing") return;
    const now = this.clock.now();
    this.elapsed = Math.min(
      this.duration,
      this.elapsed + Math.max(0, now - this.anchor) * this.effectiveSpeed,
    );
    this.anchor = now;
    while (
      this.index + 1 < this.records.length &&
      this.times[this.index + 1] <= this.elapsed
    )
      this.index++;
    if (this.elapsed >= this.duration) this.status = "ended";
  }
  private schedule(): void {
    this.cancel();
    if (this.status !== "playing") return;
    const generation = this.generation;
    // Long dataset gaps must not overflow the host timer's signed 32-bit delay.
    const delay = Math.min(
      2147483647,
      Math.max(
        0,
        (this.times[this.index + 1] - this.elapsed) / this.effectiveSpeed,
      ),
    );
    this.timerActive = true;
    this.timer = this.clock.setTimeout(() => {
      if (generation !== this.generation || this.disposed) return;
      this.timerActive = false;
      this.sync();
      this.schedule();
      this.publish();
    }, delay);
  }
  /** Accept a parsed JSON envelope or JSON text. Invalid loads preserve the current dataset. */
  loadDataset(input: unknown): DatasetValidationResult {
    this.assertActive();
    const result =
      typeof input === "string"
        ? parseTelemetryJson(input)
        : validateDataset(input);
    if (!result.valid) return result;
    this.cancel();
    this.records = result.records.map((record) => Object.freeze({ ...record }));
    const start = this.records.length
      ? Date.parse(this.records[0].timestamp)
      : 0;
    this.times = this.records.map(
      (record) => Date.parse(record.timestamp) - start,
    );
    this.index = this.records.length ? 0 : -1;
    this.elapsed = 0;
    this.status = this.records.length ? "ready" : "empty";
    this.publish();
    return result;
  }
  play(): void {
    this.assertActive();
    if (
      this.status === "playing" ||
      this.status === "empty" ||
      this.status === "ended"
    )
      return;
    this.status = this.index === this.records.length - 1 ? "ended" : "playing";
    this.anchor = this.clock.now();
    this.schedule();
    this.publish();
  }
  pause(): void {
    this.assertActive();
    if (this.status !== "playing") return;
    this.sync();
    if (this.status === "playing") this.status = "paused";
    this.cancel();
    this.publish();
  }
  reset(): void {
    this.assertActive();
    this.cancel();
    this.index = this.records.length ? 0 : -1;
    this.elapsed = 0;
    this.status = this.records.length ? "ready" : "empty";
    this.publish();
  }
  setPlaybackSpeed(speed: PlaybackSpeed): void {
    this.assertActive();
    if (speed !== 1 && speed !== 2 && speed !== 5)
      throw new RangeError("Playback speed must be 1, 2, or 5");
    if (speed === this.speed && this.runDuration === null) return;
    this.sync();
    this.speed = speed;
    this.runDuration = null;
    this.schedule();
    this.publish();
  }
  setRunDuration(seconds: RunDuration | null): void {
    this.assertActive();
    if (seconds !== null && seconds !== 10 && seconds !== 15 && seconds !== 20)
      throw new RangeError("Run duration must be 10, 15, 20 seconds or null");
    this.sync();
    this.runDuration = seconds;
    this.schedule();
    this.publish();
  }
  /** Read-only interpolation clock; does not publish or reveal future telemetry readings. */
  getElapsedMs(): number {
    return this.status === "playing"
      ? Math.min(
          this.duration,
          this.elapsed +
            Math.max(0, this.clock.now() - this.anchor) * this.effectiveSpeed,
        )
      : this.elapsed;
  }
  seekTo(index: number): void {
    this.assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.records.length)
      throw new RangeError("Seek requires a valid record index");
    const playing = this.status === "playing";
    this.index = index;
    this.elapsed = this.times[index];
    this.anchor = this.clock.now();
    this.status =
      index === this.records.length - 1
        ? "ended"
        : playing
          ? "playing"
          : "paused";
    this.schedule();
    this.publish();
  }
  getCurrentTelemetry(): VehicleTelemetry | null {
    return this.snapshot.telemetry;
  }
  /** Stable sampled state: updates on controls and timestamp boundaries, not every animation frame. */
  getPlaybackState(): PlaybackState {
    return this.snapshot.playback;
  }
  getSnapshot = (): TelemetrySnapshot => this.snapshot;
  subscribe = (listener: TelemetryListener): (() => void) => {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.unsubscribe(listener);
  };
  unsubscribe = (listener: TelemetryListener): void => {
    this.listeners.delete(listener);
  };
  /** Terminal and idempotent. Owners should dispose shared providers when no longer needed. */
  dispose(): void {
    if (this.disposed) return;
    this.sync();
    if (this.status === "playing") this.status = "paused";
    this.cancel();
    this.snapshot = this.makeSnapshot();
    this.listeners.clear();
    this.disposed = true;
  }
}
