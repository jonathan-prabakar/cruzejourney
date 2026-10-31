import { afterEach, expect, it, vi } from 'vitest';
import { ConnectedVehicleSession, replayConnectedJourneys } from '../connected';
afterEach(() => vi.useRealTimers());

it.each([10, 15, 20] as const)('runs the shared journey clock in %s real seconds, preserves pause and resets historical purchases', seconds => {
  vi.useFakeTimers();
  const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
  try {
    source.setRunDuration(seconds);
    source.play();
    expect(vi.getTimerCount()).toBe(1);
    replayConnectedJourneys(source.getJourneySelectors());
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(seconds * 500);
    const motion = source.getMotionProgress();
    expect(motion).toBeGreaterThan(0);
    expect(motion).toBeLessThan(1);
    source.pause();
    const paused = source.getMotionProgress();
    vi.advanceTimersByTime(50000);
    expect(source.getMotionProgress()).toBe(paused);
    source.play();
    vi.advanceTimersByTime(seconds * 500 + 50);
    expect(source.getSnapshot().playback.status).toBe('ended');
    expect(source.getSnapshot().frame.phase).toBe('arrived');
    source.reset();
    expect(source.getSnapshot().totalAdded).toBe(0);
    expect(source.getSnapshot().tripDistanceMiles).toBe(0);
  } finally { close(); source.dispose(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('changes speed without pausing or resetting the continuous vehicle position', () => {
  vi.useFakeTimers();
  const source = new ConnectedVehicleSession(), close = source.subscribe(() => {});
  try {
    source.setRunDuration(20); source.play(); vi.advanceTimersByTime(500);
    const before = source.getMotionProgress();
    source.setPlaybackSpeed(2);
    expect(source.getSnapshot().playback.status).toBe('playing');
    expect(source.getSnapshot().playback.run_duration_seconds).toBeNull();
    expect(source.getMotionProgress()).toBeCloseTo(before, 6);
    vi.advanceTimersByTime(200);
    expect(source.getMotionProgress()).toBeGreaterThan(before);
  } finally { close(); source.dispose(); }
});
