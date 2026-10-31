import { useMemo, useSyncExternalStore } from 'react';
import type { PlaybackSpeed, TelemetryProvider } from '../lib/telemetry/types';

/** The caller owns the stable provider; unmount removes only this hook's subscription. */
export function useVehicleTelemetry(provider: TelemetryProvider) {
  const subscribe = useMemo(() => (listener: () => void) => provider.subscribe(listener), [provider]);
  const snapshot = useSyncExternalStore(subscribe, provider.getSnapshot.bind(provider), provider.getSnapshot.bind(provider));
  const controls = useMemo(() => ({
    play: () => provider.play(),
    pause: () => provider.pause(),
    reset: () => provider.reset(),
    setPlaybackSpeed: (speed: PlaybackSpeed) => provider.setPlaybackSpeed(speed),
    seekTo: (index: number) => provider.seekTo(index),
  }), [provider]);
  return { ...snapshot, ...controls };
}
