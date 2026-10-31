import { expect, test, type Page } from '@playwright/test';
import { ConnectedVehicleSession } from '../src/lib/vehicle/connected';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/intelligence', route => route.fulfill({ json: { available: false, model: 'gemma-4-26b-a4b-it' } }));
  await page.route('**/api/intelligence/journey', route => route.abort());
  await page.goto('/journey');
  await expect(page.locator('[data-playback-ready=true]')).toBeVisible();
});
async function select(page: Page, field: 'Origin' | 'Destination', query: string) {
  await page.getByRole('combobox', { name: 'Point ' + (field === 'Origin' ? 'A' : 'B') + ' · ' + field }).fill(query);
  await page.getByRole('option').filter({ hasText: query }).click();
}
async function seekIndex(page: Page, index: number) {
  const seek = page.getByRole('slider', { name: 'Seek journey simulation' });
  await seek.press('Home');
  for (let i = 0; i < index; i++) await seek.press('ArrowRight');
}
test('offers only A/B planning, read-only vehicle data and isolated demo controls on desktop/mobile', async ({ page }) => {
  await expect(page.getByRole('slider')).toHaveCount(1);
  await expect(page.getByRole('slider', { name: /fuel/i })).toHaveCount(0);
  await expect(page.getByText('Starting fuel', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Simulation scenario')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Demo Playback', exact: true })).toBeVisible();
  await expect(page.getByTestId('connected-fuel')).toHaveText('17.0%');
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.getByText('DEMO VEHICLE FEED · NO PHYSICAL OBD DEVICE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan Journey', exact: true })).toBeInViewport();
  const playbackBounds = await page.getByRole('region', { name: 'Demo Playback', exact: true }).boundingBox();
  const footerBounds = await page.getByRole('contentinfo').boundingBox();
  expect(playbackBounds!.y + playbackBounds!.height).toBeLessThanOrEqual(footerBounds!.y + 1);
  await page.screenshot({ path: 'artifacts/connected-vehicle-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/connected-vehicle-mobile.png', fullPage: true });
});
test('uses current fuel for a short future journey and buys no unnecessary fuel', async ({ page }) => {
  await select(page, 'Origin', 'San Marcos');
  await select(page, 'Destination', 'Austin');
  await page.getByRole('button', { name: 'Plan Journey', exact: true }).click();
  await expect(page.getByTestId('automatic-fuel-plan')).toContainText('No fuel purchase is needed');
  await expect(page.getByTestId('connected-fuel')).toHaveText('17.0%');
  await expect(page.getByTestId('departure-fuel')).toHaveText('17.0%');
  await expect(page.getByText(/Future journey: San Marcos/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Route from San Marcos to Austin' })).toBeVisible();
});
test('rejects unresolved input and supports explicit endpoint swapping', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Point B · Destination' }).fill('Unverified place');
  await page.getByRole('button', { name: 'Plan Journey', exact: true }).click();
  await expect(page.locator('.jp-error[role=alert]')).toContainText('Select');
  await select(page, 'Destination', 'Austin');
  await page.getByRole('button', { name: 'Swap origin and destination' }).click();
  await page.getByRole('button', { name: 'Plan Journey', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Route from Austin to San Antonio' })).toBeVisible();
  await expect(page.getByTestId('connected-fuel')).toHaveText('17.0%');
});
test('moves the vehicle along the selected road and consumes fuel; pausing retains the last reading', async ({ page }) => {
  const before = await page.getByTestId('vehicle-marker').getAttribute('transform');
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
  await expect(page.getByTestId('vehicle-distance')).not.toHaveText(/^0.0/);
  await expect(page.getByTestId('vehicle-fuel')).not.toHaveText(/^17.0/);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  expect(await page.getByTestId('vehicle-marker').getAttribute('transform')).not.toBe(before);
  const fuel = await page.getByTestId('vehicle-fuel').innerText();
  expect(parseFloat(fuel)).toBeLessThan(17);
  await expect(page.getByTestId('connected-fuel')).toHaveText(parseFloat(fuel).toFixed(1) + '%');
  await expect(page.getByTestId('vehicle-event')).toContainText('Demo paused');
  const distance = await page.getByTestId('vehicle-distance').innerText();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('vehicle-distance')).toHaveText(distance);
});
test('preserves current telemetry and diagnostics across route changes and navigation', async ({ page }) => {
  const session = new ConnectedVehicleSession();
  const index = session.frames.findIndex(f => f.telemetry.diagnostic_code === 'P0301');
  session.dispose();
  await seekIndex(page, index);
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  const before = await page.getByTestId('connected-fuel').innerText();
  await select(page, 'Origin', 'Kyle');
  await select(page, 'Destination', 'San Marcos');
  await page.getByRole('button', { name: 'Plan Journey', exact: true }).click();
  await expect(page.getByTestId('connected-fuel')).toHaveText(before);
  await expect(page.getByTestId('departure-fuel')).toHaveText(before);
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Route from Kyle to San Marcos' })).toBeVisible();
  await page.getByRole('link', { name: 'Vehicle', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('connected-fuel')).toHaveText(before);
  await expect(page.getByRole('img', { name: 'Route from Kyle to San Marcos' })).toBeVisible();
});
test('makes modeled refueling and stationary engine state explicit and resets historical purchases', async ({ page }) => {
  const session = new ConnectedVehicleSession();
  const index = session.frames.findIndex(f => f.phase === 'fuel-stop' && f.fuelAddedGallons > 0);
  const expected = session.frames[index].telemetry.fuel_percent.toFixed(1);
  session.dispose();
  await seekIndex(page, index);
  await expect(page.getByTestId('vehicle-event')).toContainText('Modeled refueling · engine off');
  await expect(page.getByTestId('vehicle-event')).toContainText('Fuel rises only');
  await expect(page.getByTestId('vehicle-fuel')).toContainText(expected);
  await expect(page.getByTestId('vehicle-speed')).toContainText('0');
  await page.getByRole('slider', { name: 'Seek journey simulation' }).press('End');
  await expect(page.getByTestId('vehicle-event')).toContainText('Arrived');
  await page.screenshot({ path: 'artifacts/connected-vehicle-arrival.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByTestId('vehicle-fuel')).toContainText('17.0');
  await expect(page.getByText('No simulated diagnostic code', { exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('0.0 modeled gal added');
});
