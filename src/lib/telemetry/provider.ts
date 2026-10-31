import demo from '../../data/demo-telemetry.json';
import { TelemetryPlayback } from './playback';
import type { PlaybackScheduler } from './types';
/** Explicit factory: no singleton, background timer, or side effects on import. */
export function createDemoTelemetryProvider(clock?: PlaybackScheduler): TelemetryPlayback {
  const provider = new TelemetryPlayback(clock);
  const result = provider.loadDataset(demo);
  if (!result.valid) throw new Error('Bundled synthetic dataset failed validation');
  return provider;
}
