import { expect, test } from '@playwright/test';
import { resolveJourneyContext } from '../src/lib/journey/context.server';
import { analyzeVehicleIntelligence } from '../src/lib/intelligence/orchestrator.server';
import { prepareIntelligenceContext } from '../src/lib/intelligence/context';
import type { ModelDecision } from '../src/lib/intelligence/types';

async function approvedMock(body: unknown) {
  const { core, journey } = resolveJourneyContext(body);
  const prepared = prepareIntelligenceContext(core);
  const code = core.telemetry.diagnostic_code;
  const fuelConcern = prepared.fuel.status.routeSafety === 'INSUFFICIENT_RANGE' || ['LOW', 'CRITICAL'].includes(prepared.fuel.status.fuelStatus);
  const station = !code && fuelConcern ? journey.plan.fuelStops.find(s => prepared.eligibleStations.some(e => e.station.id === s.station.id))?.station : undefined;
  const decision: ModelDecision = {
    topPriority: 'ai-browser-test',
    insights: [{
      id: 'ai-browser-test', category: code ? fuelConcern ? 'combined' : 'diagnostic' : 'fuel',
      priority: fuelConcern && prepared.fuel.status.severity === 'critical' ? 'critical' : code || fuelConcern ? 'high' : 'low',
      relationship: code ? fuelConcern ? 'fuel_diagnostic' : 'observed_diagnostic' : fuelConcern ? 'fuel_route' : 'monitor',
      evidenceIds: ['fuel.percent', 'route.remaining', ...(code ? ['diagnostic.' + code] : []), ...(station ? ['station.' + station.id] : [])],
      actions: code ? ['evaluate_diagnostic', ...(fuelConcern ? ['seek_assistance' as const] : [])] : fuelConcern ? station ? ['refuel'] : ['seek_assistance'] : ['monitor'],
      stationId: station?.id ?? null, diagnosticCodes: code ? [code] : [], confidence: 'limited',
    }],
    journeyChoice: { selectedPlanId: journey.plan.id, stationId: station?.id ?? null, amenityId: null },
  };
  return analyzeVehicleIntelligence(core, { model: { modelId: 'gemma-4-26b-a4b-it', generate: async () => JSON.stringify(decision) } });
}
test.beforeEach(async ({ page }) => {
  // Mocked inference only. Ordinary browser tests must never spend the configured live key.
  await page.route('**/api/intelligence', route => route.fulfill({ json: { available: true, model: 'gemma-4-26b-a4b-it', status: 'CONFIGURED_NOT_TESTED' } }));
});
test('shows analyzing, validated advice, evidence and clears future-code advice on reset (mocked model)', async ({ page }) => {
  await page.route('**/api/intelligence/journey', async route => {
    const result = await approvedMock(route.request().postDataJSON());
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: result });
  });
  await page.goto('/journey');
  await expect(page.getByText('ANALYZING', { exact: true })).toBeVisible();
  await expect(page.getByText('GEMMA 4 ACTIVE', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Seek journey simulation' }).press('Home');
  for (let i = 0; i < 3; i++) await page.getByRole('slider', { name: 'Seek journey simulation' }).press('PageUp');
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  await expect(page.locator('.jp-ai-card')).toContainText('Observed codes: P0301', { timeout: 10000 });
  await page.getByText('Decision evidence', { exact: true }).click();
  await expect(page.locator('.jp-ai-card')).toContainText('Cylinder 1 misfire');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.locator('.jp-ai-card')).not.toContainText('Observed codes: P0301');
  await expect(page.getByText('No simulated diagnostic code', { exact: true })).toBeVisible();
});
test('shows model unavailable and explicit retry recovers with validated mocked inference', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/intelligence/journey', async route => {
    calls++;
    await route.fulfill({ json: calls === 1 ? { source: 'fallback', model: null, error: { code: 'UNKNOWN_MODEL' }, insights: [] } : await approvedMock(route.request().postDataJSON()) });
  });
  await page.goto('/journey');
  await expect(page.getByText('MODEL UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('unsupported');
  await page.getByRole('button', { name: 'Reassess journey' }).click();
  await expect(page.getByText('GEMMA 4 ACTIVE', { exact: true })).toBeVisible({ timeout: 10000 });
});
