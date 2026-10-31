import { explainDiagnostic } from '../diagnostics';
import type { DiagnosticsAdapter } from './types';

/** Reuses merged M4 descriptions; observed codes do not establish a mechanical cause. */
export const vehicleDiagnosticsAdapter: DiagnosticsAdapter = {
  evaluate(telemetry) {
    const finding = explainDiagnostic(telemetry.diagnostic_code);
    return finding ? [{
      code: finding.code, severity: 'warning',
      description: finding.description + '. Observed in synthetic telemetry; cause is unconfirmed. Arrange qualified evaluation.',
    }] : [];
  },
};
