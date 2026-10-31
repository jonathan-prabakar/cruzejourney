import type { IntelligenceErrorCode, SanitizedIntelligenceError } from './types';
const messages: Record<IntelligenceErrorCode, string> = {
  MISSING_API_KEY: 'Gemini API key is not configured on the server.',
  UNKNOWN_MODEL: 'The configured model is unavailable or unsupported.',
  TIMEOUT: 'The intelligence request exceeded its deadline.',
  RATE_LIMIT: 'The model API rate limit was reached.',
  API_UNAVAILABLE: 'The model API is unavailable.',
  INVALID_OUTPUT: 'The model response failed decision validation.',
  INVALID_CONTEXT: 'Vehicle context is missing, invalid, or exceeds input limits.',
  CANCELLED: 'The analysis was cancelled.',
};
export class IntelligenceError extends Error {
  constructor(readonly code: IntelligenceErrorCode) { super(messages[code]); }
}
export function sanitizeError(error: unknown): SanitizedIntelligenceError {
  let code: IntelligenceErrorCode = error instanceof IntelligenceError ? error.code : 'API_UNAVAILABLE';
  if (!(error instanceof IntelligenceError) && typeof error === 'object' && error !== null) {
    const status = 'status' in error ? error.status : undefined;
    if (status === 429) code = 'RATE_LIMIT';
    if (status === 404) code = 'UNKNOWN_MODEL';
    if ('name' in error && error.name === 'AbortError') code = 'CANCELLED';
  }
  return { code, message: messages[code] };
}
