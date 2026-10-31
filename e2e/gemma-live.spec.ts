import { ConnectedVehicleSession } from '../src/lib/vehicle/connected';
import { expect, test } from '@playwright/test';

test('LIVE: actual server Gemma advice reaches the combined-condition journey panel', async ({ page }) => {
  test.skip(process.env.RUN_GEMMA_BROWSER_LIVE !== '1', 'Explicit opt-in only; ordinary browser tests make no live API requests.');
  test.setTimeout(60000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/intelligence', async route => {
    // Delay configuration readiness until the simulated diagnostic event is selected,
    // then use the real server endpoint. No model response is mocked.
    await gate;
    try { await route.continue(); } catch { /* Strict Mode may abort its first GET. */ }
  });
  await page.goto('/journey');
  await expect(page.locator('[data-playback-ready=true]')).toBeVisible();
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
  await expect(page.getByTestId('vehicle-distance')).not.toHaveText(/^0.0/);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const seek = page.getByRole('slider', { name: 'Seek journey simulation' });
  await seek.press('Home');
  const demo = new ConnectedVehicleSession();
  const onset = demo.frames.findIndex(f => f.telemetry.diagnostic_code === 'P0301'); demo.dispose();
  for (let i = 0; i < onset; i++) await seek.press('ArrowRight');
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  const response = page.waitForResponse(r => r.url().endsWith('/api/intelligence/journey') && r.request().method() === 'POST');
  release();
  const received = await response;
  expect(received.status()).toBe(200);
  const result = await received.json();
  expect(result.error, result.error?.message).toBeNull();
  expect(result.source).toBe('gemma4');
  expect(result.model).toBe('gemma-4-26b-a4b-it');
  await expect(page.getByText('GEMMA 4 ACTIVE', { exact: true })).toBeVisible({ timeout: 35000 });
  await expect(page.locator('.jp-ai-card')).toContainText('Observed codes: P0301');
  await page.screenshot({ path: 'artifacts/gemma4-live-combined-journey.png', fullPage: true });
});
