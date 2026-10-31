import type { FuelIntelligenceConfig, FuelIntelligenceResult, FuelStation, RouteContext } from '../fuel/types';
import type { VehicleProfile, VehicleTelemetry } from '../telemetry/types';

export type InsightCategory = 'fuel' | 'diagnostic' | 'efficiency' | 'combined';
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type CoolantStatus = 'normal' | 'elevated' | 'critical' | 'unknown';
export type ActionKind = 'refuel' | 'evaluate_diagnostic' | 'stop_safely' | 'seek_assistance'
  | 'monitor' | 'verify_data' | 'smooth_driving';
export type Relationship = 'fuel_route' | 'station_tradeoff' | 'observed_diagnostic'
  | 'fuel_diagnostic' | 'coolant_diagnostic' | 'coolant' | 'efficiency_route' | 'efficiency' | 'monitor' | 'missing_data';
/** Adapter contract only: no M4 implementation is assumed. Codes must match observations. */
export interface DiagnosticFinding {
  code: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}
export interface EfficiencyFinding {
  status: 'normal' | 'concern' | 'critical' | 'unknown';
  metrics: { id: string; label: string; value: number; unit: 'mpg' | 'mph' | 'mph/s' | 'gallons' | 'percent' }[];
}
export interface VehicleIntelligenceContext {
  telemetry: VehicleTelemetry | null;
  history: readonly VehicleTelemetry[];
  vehicle: VehicleProfile;
  route: RouteContext;
  stations: readonly FuelStation[];
  requiredFuelType: string;
  fuelConfig?: FuelIntelligenceConfig;
  /** Optional caller result is never authoritative; M3 is recalculated at the server boundary. */
  fuelIntelligence?: FuelIntelligenceResult;
  diagnostics?: { available: boolean; findings: readonly DiagnosticFinding[] };
  efficiency?: EfficiencyFinding | null;
  recentInsights?: readonly VehicleInsight[];
  demoMode: boolean;
}
export interface EvidenceFact {
  id: string;
  domain: 'fuel' | 'route' | 'station' | 'diagnostic' | 'coolant' | 'efficiency' | 'telemetry' | 'capability';
  text: string;
  /** Only finite measurements copied from deterministic application data. */
  value?: number;
  unit?: string;
}
export interface ProposedInsight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  relationship: Relationship;
  evidenceIds: string[];
  actions: ActionKind[];
  stationId: string | null;
  diagnosticCodes: string[];
  confidence: 'limited' | 'moderate';
}
/** Deliberately no arbitrary model-authored prose or measurements in the accepted decision language. */
export interface ModelDecision {
  topPriority: string;
  insights: ProposedInsight[];
}
export interface VehicleInsight {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  explanation: string;
  evidence: string[];
  evidenceIds: string[];
  recommendedAction: string;
  actions: ActionKind[];
  relatedStationId?: string;
  relatedDiagnosticCodes?: string[];
  confidence: 'limited' | 'moderate';
  source: 'gemma4' | 'deterministic';
  mandatory: boolean;
}
export type IntelligenceErrorCode = 'MISSING_API_KEY' | 'UNKNOWN_MODEL' | 'TIMEOUT' | 'RATE_LIMIT'
  | 'API_UNAVAILABLE' | 'INVALID_OUTPUT' | 'INVALID_CONTEXT' | 'CANCELLED';
export interface SanitizedIntelligenceError { code: IntelligenceErrorCode; message: string }
export interface VehicleIntelligenceResult {
  overallAssessment: string;
  topPriority: string | null;
  insights: VehicleInsight[];
  source: 'gemma4' | 'fallback';
  model: string | null;
  analyzedAt: string;
  /** Consumers can verify that a response still describes the requested reading. */
  telemetryTimestamp: string | null;
  limitations: string[];
  error: SanitizedIntelligenceError | null;
  capabilities: { diagnostics: 'adapter' | 'observations-only'; efficiency: 'available' | 'unavailable' };
  demoMode: boolean;
}
export interface PreparedContext {
  vehicle: VehicleProfile;
  telemetry: VehicleTelemetry | null;
  history: VehicleTelemetry[];
  fuel: FuelIntelligenceResult;
  eligibleStations: FuelIntelligenceResult['recommendation']['alternatives'];
  observedCodes: string[];
  activeCodes: string[];
  diagnosticFindings: DiagnosticFinding[];
  diagnosticEpisode: string | null;
  coolantStatus: CoolantStatus;
  efficiency: EfficiencyFinding | null;
  facts: EvidenceFact[];
  capabilities: VehicleIntelligenceResult['capabilities'];
  limitations: string[];
  demoMode: boolean;
  recentInsightIds: string[];
}
export interface IntelligenceModel {
  modelId: string;
  generate(prompt: string, signal: AbortSignal): Promise<string>;
}
export interface AnalysisOptions {
  model?: IntelligenceModel;
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
  /** Receives enum/static text only, never raw SDK errors, prompts, keys or vehicle data. */
  onError?: (error: SanitizedIntelligenceError) => void;
}
export type AnalyzeFunction = (context: VehicleIntelligenceContext, options?: Pick<AnalysisOptions, 'signal'>) => Promise<VehicleIntelligenceResult>;
export interface IntelligenceScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface IntelligenceAnalysisState {
  status: 'idle' | 'pending' | 'analyzing' | 'ready' | 'fallback' | 'disposed';
  result: VehicleIntelligenceResult | null;
  revision: number;
}
