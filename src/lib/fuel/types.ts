import type { VehicleProfile, VehicleTelemetry } from '../telemetry/types';

export interface FuelStation {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  fuelTypes: string[];
  pricePerGallon: number | null;
  priceSource: 'sample' | 'verified' | 'unknown';
  /** Mapped access is not a live operating-status guarantee. */
  truckAccess?: 'yes' | 'no' | 'unknown';
  distanceAlongRouteMiles: number | null;
  /** Full additional leave-and-rejoin distance; conservatively charged before arrival. */
  detourMiles: number | null;
  isAvailable: boolean;
  isSynthetic: boolean;
}
export interface StationValidationIssue { index: number | null; field: string; message: string }
export interface StationValidationResult {
  valid: boolean;
  stations: FuelStation[];
  errors: StationValidationIssue[];
}
export interface FuelRangeInput {
  tankCapacityGallons: number | null;
  fuelPercent: number | null;
  mpg: number | null;
  reservePercent?: number;
  /** Fractional reduction of usable range AFTER reserve, in [0, 1]. */
  uncertaintyMargin?: number;
}
export interface FuelRangeResult {
  valid: boolean;
  remainingGallons: number | null;
  estimatedRangeMiles: number | null;
  reserveGallons: number | null;
  usableRangeMiles: number | null;
  usableRangeBeforeUncertaintyMiles: number | null;
  planningMpg: number | null;
  reservePercent: number | null;
  uncertaintyMargin: number | null;
  errors: string[];
}
export type FuelLevel = 'NORMAL' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
export type WarningLevel = FuelLevel | 'INSUFFICIENT_RANGE';
export type Severity = 'info' | 'warning' | 'critical' | 'unknown';
export interface WarningThresholds { lowPercent: number; criticalPercent: number }
export type RouteSafety = 'SUFFICIENT' | 'INSUFFICIENT_RANGE' | 'UNKNOWN' | 'NOT_REQUESTED';
export interface FuelWarning {
  /** Combined display level; route insufficiency never disappears behind NORMAL fuel. */
  level: WarningLevel;
  fuelStatus: FuelLevel;
  routeSafety: RouteSafety;
  severity: Severity;
  title: string;
  explanation: string;
  recommendedAction: string;
  measurements: {
    fuelPercent: number | null;
    usableRangeMiles: number | null;
    requiredDistanceMiles: number | null;
    reservePercent: number | null;
  };
}
export interface RouteContext {
  currentDistanceAlongRouteMiles: number | null;
  remainingRouteMiles: number | null;
  distanceSource: 'simulated' | 'verified' | 'unknown';
}
export interface ReachabilityOptions {
  allowBacktracking?: boolean;
  /** Extra usable-range margin that must remain upon arrival, beyond tank reserve. */
  minimumArrivalUsableRangeMiles?: number;
}
export type ReachabilityStatus = 'REACHABLE' | 'UNREACHABLE' | 'EXCLUDED' | 'UNKNOWN';
export type ReachabilityReason =
  | 'WITHIN_RANGE' | 'INSUFFICIENT_RANGE' | 'BEHIND_VEHICLE' | 'BEYOND_DESTINATION'
  | 'INCOMPATIBLE_FUEL' | 'UNAVAILABLE' | 'MISSING_DISTANCE' | 'MISSING_RANGE'
  | 'INVALID_INPUT' | 'INVALID_STATION';
export interface StationReachability {
  station: FuelStation;
  status: ReachabilityStatus;
  reason: ReachabilityReason;
  explanation: string;
  isBacktracking: boolean;
  routeDistanceMiles: number | null;
  requiredDistanceMiles: number | null;
  usableRangeAfterArrivalMiles: number | null;
  estimatedArrivalGallons: number | null;
  estimatedArrivalFuelPercent: number | null;
}
export interface RankingWeights { price: number; detour: number; safety: number; progress: number }
export interface RankingConfig {
  weights: RankingWeights;
  /** Fixed scales prevent candidate-set-dependent score changes. All scores are clamped to [0,1]. */
  priceFloorPerGallon: number;
  priceCeilingPerGallon: number;
  detourScaleMiles: number;
}
export interface ScoreBreakdown {
  price: number;
  detour: number;
  safety: number;
  progress: number;
  weights: RankingWeights;
  total: number;
  missingPrice: boolean;
}
export interface RankedStation {
  station: FuelStation;
  reachability: StationReachability;
  score: ScoreBreakdown;
  explanation: string;
}
export interface RecommendationWarning {
  code: 'NO_CONFIRMED_STATION' | 'UNKNOWN_DATA' | 'INSUFFICIENT_RANGE' | 'UNAVAILABLE'
    | 'INCOMPATIBLE_FUEL' | 'EXCLUDED' | 'INVALID_INPUT';
  count: number;
  explanation: string;
}
export interface StationRecommendation {
  station: FuelStation | null;
  recommended: RankedStation | null;
  alternatives: RankedStation[];
  assessments: StationReachability[];
  explanation: string;
  warnings: RecommendationWarning[];
}
export interface FuelIntelligenceConfig {
  reservePercent?: number;
  uncertaintyMargin?: number;
  /** Defaults to the vehicle's typical MPG; telemetry MPG is never selected implicitly. */
  planningMpg?: number | null;
  thresholds?: Partial<WarningThresholds>;
  reachability?: ReachabilityOptions;
  ranking?: Partial<Omit<RankingConfig, 'weights'>> & { weights?: Partial<RankingWeights> };
}
export interface FuelIntelligenceInput {
  telemetry: VehicleTelemetry | null;
  vehicle: VehicleProfile;
  route: RouteContext;
  stations: readonly FuelStation[];
  requiredFuelType: string;
  config?: FuelIntelligenceConfig;
}
export interface FuelIntelligenceResult {
  fuel: FuelRangeResult;
  status: FuelWarning;
  recommendation: StationRecommendation;
  errors: string[];
  assumptions: {
    mpgSource: 'vehicle-profile' | 'configured';
    rangeIsEstimate: true;
    distanceSource: RouteContext['distanceSource'];
    detourPolicy: string;
  };
}
