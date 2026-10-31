import { afterEach, describe, expect, it, vi } from 'vitest';
import demo from '../../../data/demo-telemetry.json';
import { TelemetryPlayback } from '../playback';
import { parseTelemetryJson } from '../parser';
import { validateDataset } from '../validator';
import { createDemoTelemetryProvider } from '../provider';
import type { PlaybackScheduler, PlaybackSpeed } from '../types';

const fixture = () => ({
  metadata: structuredClone(demo.metadata),
  records: [0, 1000, 3000].map(ms => ({
    timestamp: new Date(Date.parse('2026-10-01T00:00:00Z') + ms).toISOString(),
    speed_mph: 60, rpm: 1800, fuel_percent: 20, mpg: 8,
  })),
});
const providers: TelemetryPlayback[] = [];
function setup(data: unknown = fixture()) {
  vi.useFakeTimers();
  const clock: PlaybackScheduler = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const engine = new TelemetryPlayback(clock);
  providers.push(engine);
  engine.loadDataset(data);
  return engine;
}
afterEach(() => { providers.forEach(p => p.dispose()); providers.length = 0; vi.useRealTimers(); });

describe('dataset validation', () => {
  it('loads local JSON and sorts records without changing input', () => {
    const data = fixture();
    data.records.reverse();
    const result = parseTelemetryJson(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.records.map(row => row.timestamp)).toEqual(fixture().records.map(row => row.timestamp));
    expect(data.records[0].timestamp).toBe(fixture().records[2].timestamp);
  });
  it('normalizes absent optional values to null', () => {
    const row = validateDataset(fixture()).records[0];
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    expect(row.coolant_temp_f).toBeNull();
    expect(row.diagnostic_code).toBeNull();
  });
  it.each([null, [], {}, { records: 'wrong' }, { records: [] }])('reports bad envelopes: %j', value => {
    expect(validateDataset(value).valid).toBe(false);
  });
  it('reports JSON syntax errors without throwing', () => {
    expect(parseTelemetryJson('{')).toMatchObject({ valid: false, errors: [{ field: 'json' }] });
  });
  it.each([
    ['speed_mph', -1], ['rpm', Infinity], ['fuel_percent', 101], ['mpg', '8'],
    ['latitude', 91], ['longitude', -181], ['coolant_temp_f', 500],
    ['diagnostic_code', 'bad'], ['timestamp', '2026-02-30T00:00:00Z'],
    ['timestamp', '2026-10-01'], ['timestamp', '2026-10-01T25:00:00Z'],
    ['speed_mph', undefined], ['rpm', NaN],
  ])('rejects invalid %s=%s with the source row index', (field, value) => {
    const data = fixture();
    Object.assign(data.records[1], { [field]: value });
    const result = validateDataset(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ index: 1, field }));
    expect(result.records).toHaveLength(2);
  });
  it('rejects duplicate instants including timezone-equivalent timestamps', () => {
    const data = fixture();
    data.records[1].timestamp = '2026-09-30T19:00:00-05:00';
    expect(validateDataset(data).errors).toContainEqual(expect.objectContaining({ index: 1, message: 'Duplicate timestamp instant' }));
  });
  it('accepts leap days, offsets and explicit null measurements', () => {
    const data = fixture();
    Object.assign(data.records[0], {
      timestamp: '2024-02-29T12:00:00+05:30', latitude: null, longitude: null, coolant_temp_f: null, diagnostic_code: null,
    });
    expect(validateDataset(data).valid).toBe(true);
  });
  it('reports malformed rows and metadata safely', () => {
    expect(validateDataset({ metadata: {}, records: [null, 4, {}] }).errors.length).toBeGreaterThan(3);
  });
});

describe('playback', () => {
  it('respects irregular timestamps and stops at the end', () => {
    const p = setup();
    const listener = vi.fn();
    p.subscribe(listener);
    p.play();
    vi.advanceTimersByTime(999);
    expect(p.getPlaybackState().index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(p.getPlaybackState().index).toBe(1);
    vi.advanceTimersByTime(1999);
    expect(p.getPlaybackState().index).toBe(1);
    vi.advanceTimersByTime(1);
    expect(p.getPlaybackState()).toMatchObject({ index: 2, status: 'ended', progress: 1 });
    expect(vi.getTimerCount()).toBe(0);
    p.play();
    expect(vi.getTimerCount()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(3);
  });
  it('pauses mid-interval and resumes with remaining time', () => {
    const p = setup();
    p.play();
    vi.advanceTimersByTime(400);
    p.pause();
    expect(p.getPlaybackState()).toMatchObject({ status: 'paused', elapsed_ms: 400 });
    vi.advanceTimersByTime(10000);
    expect(p.getPlaybackState().index).toBe(0);
    p.play();
    vi.advanceTimersByTime(599);
    expect(p.getPlaybackState().index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(p.getPlaybackState().index).toBe(1);
  });
  it('reset cancels timers and returns the first reading', () => {
    const p = setup();
    p.play();
    vi.advanceTimersByTime(1500);
    p.reset();
    expect(p.getPlaybackState()).toMatchObject({ status: 'ready', index: 0, elapsed_ms: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('changes speed mid-interval while preserving elapsed dataset time', () => {
    const p = setup();
    p.play();
    vi.advanceTimersByTime(200);
    p.setPlaybackSpeed(2);
    vi.advanceTimersByTime(399);
    expect(p.getPlaybackState().index).toBe(0);
    vi.advanceTimersByTime(1);
    expect(p.getPlaybackState().index).toBe(1);
    p.setPlaybackSpeed(5);
    vi.advanceTimersByTime(400);
    expect(p.getPlaybackState().status).toBe('ended');
  });
  it('supports seek while paused, playing and ended', () => {
    const p = setup();
    p.seekTo(1);
    expect(p.getPlaybackState()).toMatchObject({ index: 1, status: 'paused', progress: 1 / 3 });
    p.play();
    p.seekTo(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(p.getPlaybackState().index).toBe(1);
    p.seekTo(2);
    expect(p.getPlaybackState().status).toBe('ended');
    expect(vi.getTimerCount()).toBe(0);
    p.seekTo(0);
    p.play();
    expect(p.getPlaybackState().status).toBe('playing');
  });
  it('avoids duplicate playback loops', () => {
    const p = setup();
    p.play(); p.play(); p.play();
    expect(vi.getTimerCount()).toBe(1);
  });
  it('cleans subscriptions and timers and supports explicit unsubscribe', () => {
    const p = setup();
    const a = vi.fn(), b = vi.fn();
    const remove = p.subscribe(a);
    p.subscribe(b);
    p.play();
    remove(); p.unsubscribe(b);
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    p.dispose(); p.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => p.play()).toThrow('disposed');
    expect(() => p.subscribe(a)).toThrow('disposed');
  });
  it('keeps stable immutable snapshots between changes', () => {
    const p = setup();
    expect(p.getSnapshot()).toBe(p.getSnapshot());
    expect(Object.isFrozen(p.getCurrentTelemetry())).toBe(true);
    expect(Object.isFrozen(p.getPlaybackState())).toBe(true);
    const snapshot = p.getSnapshot();
    p.play();
    expect(p.getSnapshot()).not.toBe(snapshot);
  });
  it('rejects malformed replacement datasets without interrupting playback', () => {
    const p = setup();
    p.play();
    expect(p.loadDataset('{').valid).toBe(false);
    expect(p.getPlaybackState().status).toBe('playing');
    expect(vi.getTimerCount()).toBe(1);
    expect(p.loadDataset(JSON.stringify(fixture())).valid).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(p.getPlaybackState().status).toBe('ready');
  });
  it('handles empty and singleton datasets', () => {
    const p = setup({ ...fixture(), records: [] });
    p.play(); p.pause(); p.reset(); p.setPlaybackSpeed(5);
    expect(p.getCurrentTelemetry()).toBeNull();
    expect(p.getPlaybackState()).toMatchObject({ status: 'empty', index: -1, progress: 0 });
    expect(() => p.seekTo(0)).toThrow(RangeError);
    const data = fixture();
    data.records = data.records.slice(0, 1);
    p.loadDataset(data);
    p.play();
    expect(p.getPlaybackState()).toMatchObject({ status: 'ended', index: 0, progress: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([-1, 3, 0.5, NaN, Infinity])('rejects invalid seeks: %s', index => {
    expect(() => setup().seekTo(index)).toThrow(RangeError);
  });
  it.each([0, 3, -1, NaN, Infinity])('rejects invalid speeds: %s', speed => {
    expect(() => setup().setPlaybackSpeed(speed as PlaybackSpeed)).toThrow(RangeError);
  });
  it('catches up after a delayed scheduler callback', () => {
    let now = 0;
    let callback = () => {};
    const p = new TelemetryPlayback({
      now: () => now,
      setTimeout: fn => { callback = fn; return 1; },
      clearTimeout: () => {},
    });
    providers.push(p);
    p.loadDataset(fixture()); p.play();
    now = 4000;
    callback();
    expect(p.getPlaybackState()).toMatchObject({ index: 2, status: 'ended' });
  });
  it('isolates a failing subscriber from other subscribers', () => {
    const onError = vi.fn();
    const p = new TelemetryPlayback(undefined, onError);
    providers.push(p);
    p.loadDataset(fixture());
    p.subscribe(() => { throw new Error('subscriber'); });
    const other = vi.fn();
    p.subscribe(other); p.play();
    expect(other).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('synthetic dataset', () => {
  it('contains a valid complete trip, low fuel and a code-only event', () => {
    const p = createDemoTelemetryProvider();
    providers.push(p);
    expect(validateDataset(demo).valid).toBe(true);
    expect(demo.records.length).toBeGreaterThanOrEqual(180);
    expect(demo.metadata.synthetic).toBe(true);
    expect(demo.records[0].fuel_percent).toBe(17);
    expect(demo.records.at(-1)!.fuel_percent).toBeLessThan(10);
    expect(demo.records.some(r => r.diagnostic_code === 'P0301')).toBe(true);
    expect(demo.records.at(-1)!.latitude).toBeCloseTo(30.2672, 4);
  });
  it('uses consistent timestamps and physically consistent fuel consumption', () => {
    for (let i = 1; i < demo.records.length; i++) {
      const a = demo.records[i - 1], b = demo.records[i];
      const seconds = (Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 1000;
      expect(seconds).toBeGreaterThan(15);
      expect(seconds).toBeLessThan(30);
      const gallons = (a.fuel_percent - b.fuel_percent) * 120 / 100;
      const expected = (a.speed_mph + b.speed_mph) / 2 * seconds / 3600 / b.mpg;
      expect(gallons).toBeCloseTo(expected, 5);
      expect(b.fuel_percent).toBeLessThan(a.fuel_percent);
      const latMiles = (b.latitude - a.latitude) * 69;
      const lonMiles = (b.longitude - a.longitude) * 69 * Math.cos(a.latitude * Math.PI / 180);
      const distance = Math.hypot(latMiles, lonMiles);
      expect(distance).toBeLessThanOrEqual((a.speed_mph + b.speed_mph) / 2 * seconds / 3600 * 1.02);
    }
  });
});
