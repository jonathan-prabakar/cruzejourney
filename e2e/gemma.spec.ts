import { installMockRoadRouting } from './road-fixture';
import { ConnectedVehicleSession } from '../src/lib/vehicle/connected';
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
  await installMockRoadRouting(page);
  // Mocked inference only. Ordinary browser tests must never spend the configured live key.
  await page.route('**/api/intelligence', route => route.fulfill({ json: { available: true, model: 'gemma-4-26b-a4b-it', status: 'CONFIGURED_NOT_TESTED' } }));
});
test('translates validated model advice into short map alerts and keeps details behind diagnostics (mocked inference)', async ({ page }) => {
  await page.route('**/api/intelligence/journey', async route => {
    await route.fulfill({ json: await approvedMock(route.request().postDataJSON()) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Developer diagnostics', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Developer diagnostics' })).toContainText('Gemma 4 active');
  await page.getByRole('button', { name: 'Close diagnostics' }).click();
  const demo = new ConnectedVehicleSession();
  const onset = demo.frames.findIndex(f => f.telemetry.diagnostic_code === 'P0301'); demo.dispose();
  const seek = page.getByRole('slider', { name: 'Seek drive simulation' }); await seek.press('Home');
  for (let i = 0; i < onset; i++) await seek.press('ArrowRight');
  await expect(page.getByTestId('navigation-alert')).toContainText('Engine warning');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByTestId('navigation-alert')).not.toContainText('Engine warning');
});
test('keeps API errors out of the driver view while exposing honest fallback diagnostics', async ({ page }) => {
  await page.route('**/api/intelligence/journey', route => route.fulfill({ json: { source:'fallback', model:null, error:{code:'RATE_LIMIT'}, insights:[] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Developer diagnostics', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Developer diagnostics' })).toContainText('rate limit');
  await page.getByRole('button', { name: 'Close diagnostics' }).click();
  await expect(page.getByTestId('recommended-station')).toBeVisible();
  await expect(page.getByTestId('navigation-alert')).not.toContainText('rate limit');
});

test('highlights a model-selected feasible proposal without automatically applying its route (mocked inference)', async ({ page }) => {
  let selectedName = '';
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/intelligence/journey', async route => {
    const { core, journey } = resolveJourneyContext(route.request().postDataJSON());
    const current = journey.plan.fuelStops[0].station.id;
    const proposed = journey.proposals!.find(p => p.fuelStops[0].station.id !== current) ?? journey.proposals?.[0] ?? journey.plan;
    const station = proposed.fuelStops[0].station;
    selectedName = station.name;
    const decision: ModelDecision = {
      topPriority: 'ai-alternative',
      insights: [{ id:'ai-alternative',category:'fuel',priority:'critical',relationship:'fuel_route',
        evidenceIds:['fuel.percent','route.remaining','station.'+station.id],actions:['refuel'],stationId:station.id,diagnosticCodes:[],confidence:'limited' }],
      journeyChoice:{selectedPlanId:proposed.id,stationId:station.id,amenityId:null},
    };
    const result = await analyzeVehicleIntelligence(core, { model:{modelId:'gemma-4-26b-a4b-it',generate:async()=>JSON.stringify(decision)} });
    await gate;
    await route.fulfill({json:result});
  });
  await page.goto('/');
  const activePath = await page.getByTestId('driving-map').getAttribute('data-route-id');
  release();
  await expect.poll(()=>selectedName).not.toBe('');
  await expect.poll(async()=>await page.getByTestId('recommended-station').getAttribute('aria-label')).toContain(selectedName);
  await page.getByRole('button',{name:'Developer diagnostics',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Developer diagnostics'})).toContainText('Gemma 4 active');
  await page.getByRole('button',{name:'Close diagnostics'}).click();
  // The suggested station is advisory; the active plan is unchanged until explicit acceptance.
  await page.getByTestId('recommended-station').click();
  await expect(page.getByRole('button',{name:'Review detour',exact:true})).toBeVisible();
  await expect(page.getByTestId('driving-map')).toHaveAttribute('data-has-proposal', 'false');
  expect(await page.getByTestId('driving-map').getAttribute('data-route-id')).toBe(activePath);
});
