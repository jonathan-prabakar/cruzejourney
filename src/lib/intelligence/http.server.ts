import { MAX_CONTEXT_BYTES } from './context';
import { analyzeVehicleIntelligence } from './orchestrator.server';
import type { AnalysisOptions, VehicleIntelligenceContext } from './types';

if (typeof window !== 'undefined') throw new Error('Intelligence HTTP adapter is server-only');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
/** Framework-independent Next-compatible POST handler. Authorization/context resolver are required. */
export function createIntelligenceRequestHandler(options: {
  authorize: (request: Request) => Promise<boolean> | boolean;
  /** Reconstruct trusted telemetry/profile/stations/adapters server-side. Never accept browser fuel conclusions. */
  resolveContext: (body: unknown, request: Request) => Promise<VehicleIntelligenceContext> | VehicleIntelligenceContext;
  analysis?: AnalysisOptions;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      if (!(await options.authorize(request))) return json({ error: 'UNAUTHORIZED' }, 401);
    } catch { return json({ error: 'AUTHORIZATION_UNAVAILABLE' }, 503); }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON_REQUIRED' }, 415);
    // Bounded streamed read; Content-Length alone is not authoritative.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'INVALID_BODY' }, 400);
    const decoder = new TextDecoder();
    let text = '', size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_CONTEXT_BYTES) { await reader.cancel(); return json({ error: 'BODY_TOO_LARGE' }, 413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      const body: unknown = JSON.parse(text);
      const context = await options.resolveContext(body, request);
      const result = await analyzeVehicleIntelligence(context, { ...options.analysis, signal: request.signal });
      return json(result);
    } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
    finally { reader.releaseLock(); }
  };
}
