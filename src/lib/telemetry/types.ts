/** ISO timestamps with explicit timezone, decimal degrees, MPH, RPM, US gallons, MPG, °F. */
export interface VehicleTelemetry {
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  speed_mph: number;
  rpm: number;
  fuel_percent: number;
  mpg: number;
  coolant_temp_f: number | null;
  diagnostic_code: string | null;
}
export interface VehicleProfile {
  name: string;
  tank_capacity_gallons: number;
  typical_mpg: number;
}
export interface DatasetMetadata {
  name: string;
  source: string;
  synthetic: boolean;
  route: string;
  limitations: string[];
  vehicle: VehicleProfile;
}
export interface TelemetryDataset { metadata: DatasetMetadata; records: VehicleTelemetry[] }
export interface ValidationIssue {
  /** Original input index; null for dataset-level issues. */
  index: number | null;
  field: string;
  message: string;
}
export interface DatasetValidationResult {
  valid: boolean;
  metadata: DatasetMetadata | null;
  records: VehicleTelemetry[];
  errors: ValidationIssue[];
}
export type PlaybackSpeed = 1 | 2 | 5;
export type PlaybackStatus = 'empty' | 'ready' | 'playing' | 'paused' | 'ended';
export interface PlaybackState {
  status: PlaybackStatus;
  speed: PlaybackSpeed;
  index: number;
  total: number;
  /** Timestamp progress, from 0 to 1; zero for an empty dataset. */
  progress: number;
  elapsed_ms: number;
  duration_ms: number;
}
export interface TelemetrySnapshot { telemetry: VehicleTelemetry | null; playback: PlaybackState }
export type TelemetryListener = () => void;
export interface TelemetryProvider {
  loadDataset(input: unknown): DatasetValidationResult;
  play(): void;
  pause(): void;
  reset(): void;
  setPlaybackSpeed(speed: PlaybackSpeed): void;
  /** Seek to an integer record index. Invalid indices throw RangeError. */
  seekTo(index: number): void;
  getCurrentTelemetry(): VehicleTelemetry | null;
  getPlaybackState(): PlaybackState;
  getSnapshot(): TelemetrySnapshot;
  subscribe(listener: TelemetryListener): () => void;
  unsubscribe(listener: TelemetryListener): void;
  dispose(): void;
}
export interface PlaybackScheduler {
  /** Monotonic milliseconds. */
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
