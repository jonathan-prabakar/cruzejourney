import process from 'node:process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expect, it } from 'vitest';
import { analyzeVehicleIntelligence } from '../orchestrator.server';
import { createGemmaModel } from '../gemma.server';
import { hasGeminiApiKey } from '../configuration';
import { prepareIntelligenceContext } from '../context';
import { validateModelDecision } from '../validation';
import { sanitizeError } from '../errors';
import { buildCuratedRoute } from '../../journey/routes';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../../journey/planner';
import { generateSimulationFrames } from '../../journey/simulation';
import { makeJourneyIntelligenceContext } from '../../journey/intelligence';
import { resolveJourneyContext } from '../../journey/context.server';
import { journeyRequest } from '../../journey/request';

const enabled = process.env.RUN_GEMMA_LIVE === '1';
if (enabled) {
  // Exported variables win; then .env.local, then .env. Never load the example template.
  for (const file of ['.env.local', '.env']) {
    try {
      for (const [name, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
        if (process.env[name] === undefined) process.env[name] = value;
      }
    } catch { /* A local file is optional when variables are exported. */ }
  }
}
const configured = hasGeminiApiKey(process.env.GEMINI_API_KEY);
if (enabled && !configured) console.info('Live Gemma 4 test blocked: API key not configured.');

it.skipIf(!enabled || !configured)('LIVE: minimal real Gemma connectivity, nonempty response', async () => {
  try {
    const model = createGemmaModel({ thinkingLevel: 'minimal' });
    const response = await model.generate('Connectivity check only: reply OK.', new AbortController().signal);
    expect(response.trim().length).toBeGreaterThan(0);
    console.info('Live Gemma connectivity: successful nonempty response from ' + model.modelId);
  } catch (cause) {
    const safe = sanitizeError(cause);
    const status = cause && typeof cause === 'object' && 'status' in cause && typeof cause.status === 'number' ? cause.status : 'unavailable';
    throw new Error('Live connectivity failed: ' + safe.code + ' (HTTP ' + status + '). ' + safe.message);
  }
}, 35000);

it.skipIf(!enabled || !configured)('LIVE: real combined journey assessment passes both decision validators', async () => {
  const planning = calculateJourneyPlan({ route: buildCuratedRoute('san-antonio', 'austin'), preferences: DEFAULT_PREFERENCES });
  const frame = generateSimulationFrames(planning.requested, 'combined').find(f => f.telemetry.diagnostic_code === 'P0301')!;
  const context = makeJourneyIntelligenceContext(planning, frame);
  const trusted = resolveJourneyContext(journeyRequest(context));
  const liveModel = createGemmaModel();
  const result = await analyzeVehicleIntelligence(trusted.core, {
    model: {
      modelId: liveModel.modelId,
      async generate(prompt, signal, thinkingLevel) {
        const text = await liveModel.generate(prompt, signal, thinkingLevel);
        const validation = validateModelDecision(text, prepareIntelligenceContext(trusted.core));
        if (!validation.valid) console.info('Live decision validation requested bounded repair: ' + validation.errors.join('; '));
        return text;
      },
    },
  });
  expect(result.error, result.error?.message).toBeNull();
  expect(result.source).toBe('gemma4');
  expect(result.journeyDecision).toBeDefined();
  const { validateJourneyDecision } = await import('../../journey/intelligence');
  expect(validateJourneyDecision(result.journeyDecision!, trusted.journey)).toBe(true);
  console.info('Live vehicle assessment: validated combined 17% starting-fuel journey with P0301; model ' + result.model);
}, 35000);
