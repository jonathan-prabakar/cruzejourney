import process from 'node:process';
import { expect, it } from 'vitest';
import { analyzeVehicleIntelligence } from '../orchestrator.server';
import { createIntelligenceScenarios } from '../scenarios';

const enabled = process.env.RUN_GEMMA_LIVE === '1';
if (enabled) {
  try { process.loadEnvFile('.env'); } catch { /* An exported environment key is equally valid. */ }
}
const configured = Boolean(process.env.GEMINI_API_KEY?.trim());
it.skipIf(!enabled || !configured)('LIVE: one real Gemma assessment, never a mocked model response', async () => {
  const result = await analyzeVehicleIntelligence(createIntelligenceScenarios().combined);
  // No retries or extra requests; report sanitized cause if transport/output validation fails.
  expect(result.error, result.error?.message).toBeNull();
  expect(result.source).toBe('gemma4');
  expect(result.model).toBe(process.env.GEMMA_MODEL ?? 'gemma-4-26b-a4b-it');
  expect(result.insights.length).toBeGreaterThan(0);
}, 25000);
