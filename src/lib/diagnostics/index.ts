import type { VehicleTelemetry } from "../telemetry/types";

export type DiagnosticSeverity = "INFO" | "WARNING" | "HIGH" | "UNKNOWN";
export interface DiagnosticDefinition {
  code: string;
  description: string;
  system: string;
  severity: DiagnosticSeverity;
  possibleCauses: string[];
  symptoms: string[];
  nextSteps: string[];
  safetyGuidance: string;
  manufacturerInformationNeeded: true;
}
const misfireSafety =
  "Arrange prompt professional evaluation. A severe or persistent misfire can damage the catalyst. If the engine runs roughly, loses power, or the warning light flashes, stop safely and seek assistance.";
function definition(
  code: string,
  description: string,
  system: string,
  causes: string[],
  severity: DiagnosticSeverity = "WARNING",
): DiagnosticDefinition {
  return {
    code,
    description,
    system,
    severity,
    possibleCauses: causes,
    symptoms:
      system === "Combustion"
        ? ["Rough running or reduced power may occur."]
        : [
            "A warning indicator or altered vehicle operation may occur; symptoms vary.",
          ],
    nextSteps: [
      "Record the code and any symptoms.",
      "Consult vehicle-specific service information and arrange qualified inspection.",
    ],
    safetyGuidance:
      system === "Combustion"
        ? misfireSafety
        : "Follow the vehicle warning system. If severe symptoms occur, stop safely and obtain assistance.",
    manufacturerInformationNeeded: true,
  };
}
/** Generic code descriptions; applicability and causes require vehicle-specific confirmation. */
export const diagnosticCodes: Readonly<Record<string, DiagnosticDefinition>> = {
  P0300: definition(
    "P0300",
    "Random or multiple cylinder misfire detected",
    "Combustion",
    [
      "Fuel delivery or compression issues.",
      "On spark-ignition engines, ignition plug or coil faults.",
    ],
    "HIGH",
  ),
  P0301: definition(
    "P0301",
    "Cylinder 1 misfire detected",
    "Combustion",
    [
      "Injector, wiring, fuel delivery or compression issues.",
      "On spark-ignition engines, cylinder 1 plug or coil faults.",
    ],
    "HIGH",
  ),
  P0171: definition("P0171", "System too lean, Bank 1", "Air and fuel", [
    "Unmetered intake air.",
    "Fuel delivery or air-metering problems.",
  ]),
  P0420: definition(
    "P0420",
    "Catalyst system efficiency below threshold, Bank 1",
    "Emissions",
    ["Catalyst deterioration.", "Exhaust leaks or oxygen-sensor issues."],
  ),
  P0128: definition(
    "P0128",
    "Coolant thermostat below regulating temperature",
    "Cooling",
    ["Thermostat operation or coolant level.", "Temperature sensing issues."],
  ),
  P0442: definition(
    "P0442",
    "Evaporative emission system small leak detected",
    "Evaporative emissions",
    ["Fuel vapor plumbing or sealing leaks.", "Fuel-cap sealing where fitted."],
  ),
  P0455: definition(
    "P0455",
    "Evaporative emission system large leak detected",
    "Evaporative emissions",
    ["Fuel vapor plumbing or sealing leaks.", "Purge or vent control issues."],
  ),
  P0117: definition(
    "P0117",
    "Engine coolant temperature sensor circuit low input",
    "Cooling sensor",
    ["Sensor circuit short or connector fault.", "Temperature sensor fault."],
  ),
  P0101: definition(
    "P0101",
    "Mass or volume air flow circuit range/performance",
    "Air metering",
    ["Intake or metering problems.", "Sensor circuit or connector faults."],
  ),
  P0133: definition(
    "P0133",
    "Oxygen sensor circuit slow response, Bank 1 Sensor 1",
    "Emissions sensor",
    ["Sensor response degradation.", "Exhaust or wiring faults."],
  ),
};
export function explainDiagnostic(
  code: string | null | undefined,
): DiagnosticDefinition | null {
  if (!code?.trim()) return null;
  const normalized = code.trim().toUpperCase();
  return (
    diagnosticCodes[normalized] ?? {
      ...definition(
        normalized,
        "Unsupported diagnostic code observed",
        "Unknown",
        [],
        "UNKNOWN",
      ),
      symptoms: [],
      nextSteps: [
        "Consult vehicle-specific service information or a qualified technician for interpretation.",
      ],
    }
  );
}
export interface DiagnosticEpisode {
  code: string;
  firstObserved: string;
  lastObserved: string;
  readings: number;
  currentlyObserved: boolean;
}
export function detectDiagnosticEvents(
  records: readonly Pick<VehicleTelemetry, "timestamp" | "diagnostic_code">[],
): DiagnosticEpisode[] {
  const episodes: DiagnosticEpisode[] = [];
  let active: DiagnosticEpisode | undefined;
  for (const reading of [...records].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  )) {
    const code = reading.diagnostic_code?.trim().toUpperCase() || null;
    if (!code) {
      if (active) active.currentlyObserved = false;
      active = undefined;
      continue;
    }
    if (active?.code !== code) {
      if (active) active.currentlyObserved = false;
      active = {
        code,
        firstObserved: reading.timestamp,
        lastObserved: reading.timestamp,
        readings: 0,
        currentlyObserved: true,
      };
      episodes.push(active);
    }
    active!.readings++;
    active!.lastObserved = reading.timestamp;
  }
  return episodes;
}
export interface CoolantConfig {
  elevatedF: number;
  criticalF: number;
}
export const DEMO_COOLANT_CONFIG: CoolantConfig = {
  elevatedF: 225,
  criticalF: 240,
};
export function assessCoolant(
  temperature: number | null | undefined,
  config: CoolantConfig = DEMO_COOLANT_CONFIG,
): "normal" | "elevated" | "critical" | "unknown" {
  if (
    !Number.isFinite(config.elevatedF) ||
    !Number.isFinite(config.criticalF) ||
    config.criticalF <= config.elevatedF
  )
    throw new RangeError("Invalid coolant thresholds");
  if (temperature == null || !Number.isFinite(temperature)) return "unknown";
  return temperature >= config.criticalF
    ? "critical"
    : temperature >= config.elevatedF
      ? "elevated"
      : "normal";
}
export function assessVehicleHealth(
  current: Partial<VehicleTelemetry> | null,
  history: readonly VehicleTelemetry[] = [],
  config: CoolantConfig = DEMO_COOLANT_CONFIG,
) {
  const cutoff = current?.timestamp ? Date.parse(current.timestamp) : -Infinity;
  const prefix = history.filter((r) => Date.parse(r.timestamp) <= cutoff);
  const observations: Pick<
    VehicleTelemetry,
    "timestamp" | "diagnostic_code"
  >[] = [...prefix];
  if (
    current?.timestamp &&
    Number.isFinite(cutoff) &&
    !prefix.some((r) => r.timestamp === current.timestamp)
  )
    observations.push({
      timestamp: current.timestamp,
      diagnostic_code: current.diagnostic_code ?? null,
    });
  const recentEvents = detectDiagnosticEvents(observations);
  const active = explainDiagnostic(current?.diagnostic_code);
  const explanations = [
    ...new Set([
      ...recentEvents.map((e) => e.code),
      ...(active ? [active.code] : []),
    ]),
  ].map((code) => explainDiagnostic(code)!);
  const coolantStatus = assessCoolant(current?.coolant_temp_f, config);
  const overallStatus: DiagnosticSeverity =
    coolantStatus === "critical" || active?.severity === "HIGH"
      ? "HIGH"
      : coolantStatus === "elevated" || active?.severity === "WARNING"
        ? "WARNING"
        : !current ||
            coolantStatus === "unknown" ||
            active?.severity === "UNKNOWN"
          ? "UNKNOWN"
          : "INFO";
  return {
    overallStatus,
    activeCodes: active ? [active.code] : [],
    coolantStatus,
    recentEvents,
    explanations,
    explanation: active
      ? `${active.code}: ${active.description}. This is an observed indication, not a confirmed mechanical diagnosis.`
      : "No active diagnostic code observed. Absence of a code does not establish that the vehicle is safe to drive.",
    recommendedActions: active?.nextSteps ?? [
      "Monitor the vehicle warning system and obtain evaluation if symptoms occur.",
    ],
    limitations: [
      "Synthetic telemetry and simulated diagnostic episodes.",
      "Rule-based educational interpretation; no physical OBD-II device.",
      "Code disappearance means no longer observed, not repaired.",
      "Coolant bands are configurable demonstration assumptions.",
    ],
    config,
  };
}
export type VehicleHealth = ReturnType<typeof assessVehicleHealth>;
