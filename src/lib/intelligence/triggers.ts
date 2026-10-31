import { prepareIntelligenceContext } from './context';
import { buildFallback, invalidContextFallback } from './fallback';
import { IntelligenceError, sanitizeError } from './errors';
import { buildIntelligencePrompt } from './prompts';
import type {
  AnalyzeFunction, IntelligenceAnalysisState, IntelligenceScheduler, PreparedContext,
  VehicleIntelligenceContext, VehicleIntelligenceResult,
} from './types';

export function getEventFingerprint(context: PreparedContext): string {
  return JSON.stringify({
    vehicle: context.vehicle,
    planning: [context.fuel.fuel.planningMpg, context.fuel.fuel.reservePercent,
      context.fuel.fuel.reserveGallons, context.fuel.fuel.uncertaintyMargin],
    capabilities: context.capabilities,
    fuel: context.fuel.status.fuelStatus,
    route: context.fuel.status.routeSafety,
    recommendation: context.fuel.recommendation.station?.id ?? null,
    stations: context.eligibleStations.map(s => [s.station.id, s.station.pricePerGallon, s.station.detourMiles]).sort(),
    codes: context.activeCodes,
    episode: context.diagnosticEpisode,
    severity: context.diagnosticFindings.map(f => [f.code, f.severity]).sort(),
    coolant: context.coolantStatus,
    efficiency: context.efficiency?.status ?? 'unavailable',
    dataValid: context.fuel.fuel.valid,
    demoMode: context.demoMode,
  });
}
const defaultClock: IntelligenceScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};
interface Pending {
  context: VehicleIntelligenceContext;
  prepared: PreparedContext;
  key: string;
}
export interface ControllerOptions {
  minIntervalMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  scheduler?: IntelligenceScheduler;
}
/** One controller per vehicle/playback session. Inject an authenticated server transport in browsers. */
export class IntelligenceController {
  private readonly clock: IntelligenceScheduler;
  private readonly minInterval: number;
  private readonly cacheTtl: number;
  private readonly maxCacheEntries: number;
  private cache = new Map<string, { result: VehicleIntelligenceResult; at: number }>();
  private listeners = new Set<() => void>();
  private state: IntelligenceAnalysisState = Object.freeze({ status: 'idle', result: null, revision: 0 });
  private lastFingerprint: string | null = null;
  private lastTimestamp: number | null = null;
  private lastStarted = -Infinity;
  private timer: unknown;
  private timerActive = false;
  private pending: Pending | null = null;
  private active: AbortController | null = null;
  private disposed = false;
  private revision = 0;

  constructor(private readonly analyze: AnalyzeFunction, options: ControllerOptions = {}) {
    this.clock = options.scheduler ?? defaultClock;
    this.minInterval = options.minIntervalMs ?? 5000;
    this.cacheTtl = options.cacheTtlMs ?? 30000;
    this.maxCacheEntries = options.maxCacheEntries ?? 8;
    if (![this.minInterval, this.cacheTtl].every(n => Number.isFinite(n) && n >= 0 && n <= 300000) ||
        !Number.isInteger(this.maxCacheEntries) || this.maxCacheEntries < 1 || this.maxCacheEntries > 32) throw new RangeError('Invalid intelligence controller limits');
  }
  getState = (): IntelligenceAnalysisState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) throw new Error('Intelligence controller is disposed');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(status: IntelligenceAnalysisState['status'], result: VehicleIntelligenceResult | null): void {
    this.state = Object.freeze({ status, result, revision: this.revision });
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* A UI subscriber must not break analysis or cleanup. */ }
    }
  }
  private cancel(): void {
    this.active?.abort();
    this.active = null;
    if (this.timerActive) this.clock.clearTimeout(this.timer);
    this.timerActive = false;
    this.pending = null;
  }
  /** Called on telemetry changes. Ordinary same-event ticks never launch extra requests. */
  update(context: VehicleIntelligenceContext, options: { force?: boolean; discontinuity?: boolean } = {}): void {
    if (this.disposed) throw new Error('Intelligence controller is disposed');
    let prepared: PreparedContext;
    try { prepared = prepareIntelligenceContext(context); }
    catch {
      this.revision++; this.cancel(); this.lastFingerprint = null;
      this.publish('fallback', invalidContextFallback(this.clock.now(), sanitizeError(new IntelligenceError('INVALID_CONTEXT'))));
      return;
    }
    if (!prepared.telemetry) {
      this.revision++; this.cancel(); this.lastFingerprint = null; this.lastTimestamp = null;
      this.publish('fallback', buildFallback(prepared, this.clock.now()));
      return;
    }
    const timestamp = prepared.telemetry ? Date.parse(prepared.telemetry.timestamp) : null;
    const backward = timestamp !== null && this.lastTimestamp !== null && timestamp < this.lastTimestamp;
    this.lastTimestamp = timestamp;
    const fingerprint = getEventFingerprint(prepared);
    const key = buildIntelligencePrompt(prepared);
    const discontinuity = backward || options.discontinuity === true;
    const sameEvent = fingerprint === this.lastFingerprint;
    // In-flight explicit requests for the same exact state share the existing request.
    if (!discontinuity && sameEvent && this.active && !options.force) return;
    if (!discontinuity && sameEvent && !options.force) {
      if (this.pending) this.pending = { context: structuredClone(context), prepared, key };
      return;
    }
    if (!discontinuity && sameEvent && this.active && options.force && this.pending?.key === key) return;
    this.lastFingerprint = fingerprint;
    this.revision++;
    this.cancel();
    this.pending = { context: structuredClone(context), prepared, key };
    const cached = this.cache.get(key);
    if (cached && this.clock.now() - cached.at < this.cacheTtl) {
      this.pending = null;
      this.publish(cached.result.source === 'gemma4' ? 'ready' : 'fallback', structuredClone(cached.result));
      return;
    }
    this.publish('pending', buildFallback(prepared, this.clock.now()));
    const delay = Math.max(0, this.lastStarted + this.minInterval - this.clock.now());
    if (delay === 0) this.start();
    else {
      this.timerActive = true;
      this.timer = this.clock.setTimeout(() => { this.timerActive = false; this.start(); }, delay);
    }
  }
  requestAssessment(context: VehicleIntelligenceContext): void { this.update(context, { force: true }); }
  private start(): void {
    const pending = this.pending;
    if (!pending || this.disposed) return;
    // Keep request identity available for in-flight deduplication; each event cancels it.
    const revision = this.revision;
    const abort = new AbortController();
    this.active = abort;
    this.lastStarted = this.clock.now();
    this.publish('analyzing', buildFallback(pending.prepared, this.clock.now()));
    Promise.resolve().then(() => this.analyze(pending.context, { signal: abort.signal })).then(result => {
      if (this.disposed || revision !== this.revision || abort.signal.aborted) return;
      this.active = null; this.pending = null;
      // Transport response must match the requested reading before it can enter the current UI.
      if (result.telemetryTimestamp !== pending.prepared.telemetry?.timestamp && !(result.telemetryTimestamp === null && pending.prepared.telemetry === null)) {
        this.publish('fallback', buildFallback(pending.prepared, this.clock.now(), sanitizeError(new IntelligenceError('INVALID_OUTPUT'))));
        return;
      }
      if (result.source === 'gemma4') {
        this.cache.delete(pending.key);
        this.cache.set(pending.key, { result: structuredClone(result), at: this.clock.now() });
        while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
      }
      this.publish(result.source === 'gemma4' ? 'ready' : 'fallback', result);
    }).catch(() => {
      if (this.disposed || revision !== this.revision || abort.signal.aborted) return;
      this.active = null; this.pending = null;
      this.publish('fallback', buildFallback(pending.prepared, this.clock.now(), sanitizeError(new IntelligenceError('API_UNAVAILABLE'))));
    });
  }
  /** Call on explicit seek/dataset replacement, especially forward seeks with similar status. */
  invalidate(): void {
    if (this.disposed) return;
    this.revision++; this.cancel(); this.lastFingerprint = null; this.lastTimestamp = null;
    this.publish('idle', null);
  }
  dispose(): void {
    if (this.disposed) return;
    this.revision++; this.cancel(); this.cache.clear();
    this.disposed = true;
    this.publish('disposed', null);
    this.listeners.clear();
  }
}
