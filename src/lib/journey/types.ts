import type { VehicleTelemetry, TelemetryProvider, VehicleProfile } from '../telemetry/types';
import type { FuelStation, FuelIntelligenceResult } from '../fuel/types';

export type Coordinate = readonly [longitude: number, latitude: number];
export interface JourneyLocation { id: string; name: string; subtitle: string; coordinate: Coordinate }
export type AmenityCategory = 'restaurant' | 'restroom' | 'coffee' | 'convenience';
export type SimulationScenario = 'normal' | 'low-fuel' | 'engine-warning' | 'combined';
export type OptimizationPriority = 'balanced' | 'fastest' | 'fuel-cost' | 'fewer-stops';
export interface JourneyPreferences {
  startingFuelPercent: number;
  fuelStops: 'automatic' | 'none' | 'one' | 'two' | 'three';
  optimization: OptimizationPriority;
  amenities: AmenityCategory[];
  scenario: SimulationScenario;
}
export interface JourneyRoute {
  id: string;
  origin: JourneyLocation;
  destination: JourneyLocation;
  coordinates: Coordinate[];
  /** Provider road miles, or explicit modeled road+access miles for an itinerary. */
  distanceMiles: number;
  durationSeconds: number;
  cumulativeMiles: number[];
  provider: 'cached-osrm';
  provenance: 'cached-road' | 'cached-road-with-modeled-access';
  attribution: string;
}
export interface RouteProvider {
  search(query: string): JourneyLocation[];
  route(originId: string, destinationId: string, signal?: AbortSignal): Promise<JourneyRoute>;
}
export interface JourneyStation extends FuelStation {
  coordinate: Coordinate;
  amenities: AmenityCategory[];
}
export interface Amenity {
  id: string;
  stationId: string;
  name: string;
  category: AmenityCategory;
  coordinate: Coordinate;
  distanceAlongRouteMiles: number;
  /** Synthetic extra leave/return loop, not a road-network or walking measurement. */
  extraDistanceMiles: number;
  isSynthetic: true;
  hours: null;
  rating: null;
  walkingMinutes: null;
}
export interface PlacesProvider {
  nearby(station: JourneyStation, categories: readonly AmenityCategory[]): Amenity[];
}
export interface JourneyWaypoint {
  id: string;
  kind: 'fuel' | 'amenity';
}
export interface JourneyLeg {
  waypointId: string;
  kind: 'fuel' | 'amenity' | 'destination';
  name: string;
  baseRouteMiles: number;
  travelMiles: number;
  cumulativeTravelMiles: number;
  arrivalFuelGallons: number;
  departureFuelGallons: number;
  fuelAddedGallons: number;
  purchaseCost: number | null;
  accessMiles: number;
  dwellSeconds: number;
}
export interface FuelStop {
  station: JourneyStation;
  leg: JourneyLeg;
  refillTargetPercent: 100;
}
export interface JourneyPlan {
  baseRoute: JourneyRoute;
  id: string;
  route: JourneyRoute;
  preferences: JourneyPreferences;
  waypoints: JourneyWaypoint[];
  legs: JourneyLeg[];
  fuelStops: FuelStop[];
  amenityStops: Amenity[];
  feasible: boolean;
  warnings: string[];
  totalDistanceMiles: number;
  durationSeconds: number;
  estimatedConsumptionGallons: number | null;
  arrivalFuelPercent: number | null;
  purchaseCost: number | null;
  /** Never includes the unknown cost of fuel already in the tank. */
  fuelAddedGallons: number;
}
export interface JourneyPlanningResult {
  requested: JourneyPlan;
  recommended: JourneyPlan | null;
  alternatives: JourneyPlan[];
  stations: JourneyStation[];
  amenities: Amenity[];
  preferenceExplanation: string;
}
export interface SimulationFrame {
  telemetry: VehicleTelemetry;
  distanceMiles: number;
  baseRouteMiles: number;
  remainingDistanceMiles: number;
  phase: 'ready' | 'driving' | 'fuel-stop' | 'amenity-stop' | 'arrived' | 'blocked';
  stopId: string | null;
  fuelAddedGallons: number;
  purchaseCost: number | null;
  elapsedSeconds: number;
}
export interface SimulationState {
  frame: SimulationFrame;
  playback: ReturnType<TelemetryProvider['getPlaybackState']>;
}
export interface JourneySimulationPort {
  readonly frames: readonly SimulationFrame[];
  getSnapshot(): SimulationState;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  reset(): void;
  seekTo(index: number): void;
  setPlaybackSpeed(speed: 1 | 2 | 5): void;
  dispose(): void;
}
export interface JourneyDiagnostic {
  code: string;
  description: string;
  severity: 'warning' | 'critical';
}
export interface DiagnosticsAdapter { evaluate(telemetry: VehicleTelemetry): JourneyDiagnostic[] }
export interface JourneyIntelligenceContext {
  plan: JourneyPlan;
  alternatives: JourneyPlan[];
  frame: SimulationFrame;
  fuel: FuelIntelligenceResult;
  diagnostics: JourneyDiagnostic[];
  amenities: Amenity[];
}
export interface JourneyInsight {
  model?: string;
  analyzedAt?: string;
  telemetryTimestamp?: string;
  evidence?: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: 'gemma4' | 'fallback';
  title: string;
  explanation: string;
  action: string;
  selectedPlanId: string | null;
  stationId: string | null;
  amenityId: string | null;
  diagnosticCodes: string[];
}
/** Host supplies a server transport to the EXISTING Gemma orchestrator; no SDK or key belongs here. */
export interface JourneyIntelligenceAdapter {
  analyze(context: JourneyIntelligenceContext, signal: AbortSignal): Promise<JourneyInsight>;
}
export interface JourneyVehicle extends VehicleProfile { fuelType: 'diesel'; reservePercent: number }
