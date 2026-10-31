import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { createElement, StrictMode } from 'react';
import { useVehicleTelemetry } from '../useVehicleTelemetry';
import { createDemoTelemetryProvider } from '../../lib/telemetry/provider';

it('updates React consumers, preserves controls and unsubscribes on unmount', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const provider = createDemoTelemetryProvider();
  const unsubscribe = vi.fn();
  const original = provider.subscribe;
  vi.spyOn(provider, 'subscribe').mockImplementation(listener => {
    const remove = original(listener);
    return () => { unsubscribe(); remove(); };
  });
  let value: ReturnType<typeof useVehicleTelemetry> | undefined;
  function Consumer() { value = useVehicleTelemetry(provider); return null; }
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(createElement(StrictMode, null, createElement(Consumer))); });
  const play = value!.play;
  expect(value!.telemetry!.fuel_percent).toBe(17);
  await act(async () => { value!.seekTo(2); });
  expect(value!.playback.index).toBe(2);
  expect(value!.play).toBe(play);
  const beforeUnmount = unsubscribe.mock.calls.length;
  await act(async () => { root.unmount(); });
  expect(unsubscribe).toHaveBeenCalledTimes(beforeUnmount + 1);
  provider.dispose();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
});
