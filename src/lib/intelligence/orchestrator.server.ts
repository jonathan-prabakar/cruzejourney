import { prepareIntelligenceContext } from './context';
import { IntelligenceError, sanitizeError } from './errors';
import { buildFallback, invalidContextFallback, mandatoryInsights, PRIORITY_ORDER, resultEnvelope } from './fallback';
import { createGemmaModel } from './gemma.server';
import { buildIntelligencePrompt } from './prompts';
import { renderInsight } from './render';
import { validateModelDecision } from './validation';
import type { AnalysisOptions, PreparedContext, VehicleIntelligenceContext, VehicleIntelligenceResult } from './types';

if (typeof window !== 'undefined') throw new Error('Intelligence orchestration is server-only');

/** One bounded Gemma decision pass. Proactive pacing/lifecycle live in IntelligenceController. */
export async function analyzeVehicleIntelligence(
  context: VehicleIntelligenceContext, options: AnalysisOptions = {},
): Promise<VehicleIntelligenceResult> {
  const now = options.now ?? Date.now;
  const report = (error: ReturnType<typeof sanitizeError>) => {
    try { options.onError?.(error); } catch { /* Diagnostics must not break fallback behavior. */ }
  };
  let prepared: PreparedContext;
  try { prepared = prepareIntelligenceContext(context); }
  catch {
    const error = sanitizeError(new IntelligenceError('INVALID_CONTEXT'));
    report(error);
    return invalidContextFallback(now(), error);
  }
  if (!prepared.telemetry) return buildFallback(prepared, now());
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeoutMs = options.timeoutMs ?? 18000;
  try {
    if (controller.signal.aborted) throw new IntelligenceError('CANCELLED');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new IntelligenceError('INVALID_CONTEXT');
    const model = options.model ?? createGemmaModel();
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new IntelligenceError('CANCELLED')), { once: true });
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Reject deadline first, then cancel the SDK; the result always reports TIMEOUT.
        reject(new IntelligenceError('TIMEOUT'));
        controller.abort();
      }, timeoutMs);
    });
    const text = await Promise.race([model.generate(buildIntelligencePrompt(prepared), controller.signal), aborted, timeout]);
    if (controller.signal.aborted) throw new IntelligenceError('CANCELLED');
    const validated = validateModelDecision(text, prepared);
    if (!validated.valid || !validated.decision) throw new IntelligenceError('INVALID_OUTPUT');
    const decision = validated.decision;
    const ordered = [...decision.insights].sort((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.id === decision.topPriority ? -1 : b.id === decision.topPriority ? 1 : 0));
    const mandatory = mandatoryInsights(prepared, ordered.find(p => p.stationId !== null)?.stationId ?? undefined);
    const ai = ordered.slice(0, 6 - mandatory.length).map(p => renderInsight(p, prepared, 'gemma4'));
    const insights = [...ai, ...mandatory].sort((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.id === 'safety-coolant' ? -1 : b.id === 'safety-coolant' ? 1 : 0));
    return resultEnvelope(prepared, insights, 'gemma4', model.modelId, now());
  } catch (cause) {
    const error = sanitizeError(cause);
    report(error);
    return buildFallback(prepared, now(), error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
