import { validateDataset } from './validator';
import type { DatasetValidationResult } from './types';
/** Parse local JSON text without propagating syntax errors into the app. */
export function parseTelemetryJson(text: string): DatasetValidationResult {
  let input: unknown;
  try { input = JSON.parse(text); }
  catch { return { valid: false, metadata: null, records: [], errors: [{ index: null, field: 'json', message: 'Invalid JSON syntax' }] }; }
  return validateDataset(input);
}
