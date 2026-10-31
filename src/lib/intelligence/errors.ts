import type { IntelligenceErrorCode, SanitizedIntelligenceError } from './types';
const messages: Record<IntelligenceErrorCode, string> = {
  AUTHENTICATION_FAILED: 'The model API rejected authentication or permission. Check the server key and API access.',
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
    if (status === 401 || status === 403 || status === 400 && 'message' in error && typeof error.message === 'string' && /API.key.not.valid|API_KEY_INVALID/i.test(error.message)) code = 'AUTHENTICATION_FAILED';
    if (status === 408 || status === 504 || 'name' in error && error.name === 'TimeoutError') code = 'TIMEOUT';
    if (status === 429) code = 'RATE_LIMIT';
    if (status === 404) code = 'UNKNOWN_MODEL';
    if ('name' in error && error.name === 'AbortError') code = 'CANCELLED';
  }
  return { code, message: messages[code] };
}
