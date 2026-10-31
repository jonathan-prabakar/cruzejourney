# Vehicle diagnostics integration

No `origin/feature/m4-vehicle-diagnostics` branch was present during integration. Main's commit named `milestone 4` contained the cockpit presentation, not a diagnostic engine. The required deterministic diagnostic implementation was added in this sprint; no unavailable branch is claimed as merged.

`src/lib/diagnostics/index.ts` exports the typed knowledge base, `explainDiagnostic`, `detectDiagnosticEvents`, configurable `assessCoolant`, and `assessVehicleHealth`. No runtime dependencies, model calls or provider changes are introduced by diagnostics.

The code dictionary covers P0300, P0301, P0171, P0420, P0128, P0442, P0455, P0117, P0101 and P0133. Each entry contains a description, system, severity, possible causes, symptoms, suggested next steps, conditional safety guidance and a vehicle-specific-information flag. Descriptions follow the supplied M4 brief. P0300/P0301 wording was cross-checked against [Ford's diesel OBD summary](https://www.fordservicecontent.com/Ford_Content/catalog/motorcraft/obd-summary-diesel-2023.pdf). Full manufacturer-specific verification of all causes/applicability was not performed; this is educational generic reference content.

Severity is INFO for a complete current sample with no active code or elevated temperature, WARNING for known non-misfire code indications or elevated coolant, HIGH for a misfire indication or critical coolant, UNKNOWN for missing required measurements or unsupported codes. INFO never means safe to drive. P0301 is an indication, not a confirmed cause. Its guidance calls for prompt professional evaluation and stopping safely if rough running, power loss or a flashing indicator occurs. A DTC alone is not an unconditional stop command.

Default demonstration coolant thresholds are elevated at 225°F and critical at 240°F. Pass `{ elevatedF, criticalF }` to override them; invalid bands throw. Missing/nonfinite temperature is unknown. These defaults are not manufacturer-specific limits.

Episodes are derived from chronologically sorted copied observations, grouped across consecutive equal codes, and separated by missing/different codes. They retain first/last observed timestamps and reading count. A disappearing code is previously observed, never described as repaired. `assessVehicleHealth` discards future history relative to the current timestamp. The app additionally supplies the exact M2 dataset prefix, so reset and backward seek cannot retain future events.

```ts
const snapshot = getDemoSnapshot(playback.index);
const health = snapshot.health;
// health.activeCodes, overallStatus, coolantStatus, recentEvents,
// explanations, recommendedActions, limitations
```

`getDemoSnapshot` adapts findings to the existing Gemma context. HIGH DTC severity maps to a warning finding for the orchestrator, retaining conditional stopping guidance rather than asserting a DTC alone mandates stopping. Deterministic coolant warnings remain authoritative. No fault is inferred from RPM or speed fluctuations.

Tests cover dictionary lookup, unknown/missing codes, configurable coolant bands, episode grouping/recurrence/disappearance, sorting, current-only input, incomplete data, backward seeking and the exact M2 P0301 episode at indices 160–175. Run `npm test` or `npx vitest run src/lib/diagnostics/__tests__`.

The dataset is synthetic; P0301 is simulated; explanations are rule-based; no physical OBD-II adapter is connected. For real inputs, replace the telemetry provider boundary with validated timestamps/measurements, preserve unknown values and units, use vehicle-specific service information and configure appropriate temperature thresholds. No definitive mechanical diagnosis or real-world safety guarantee is provided.
