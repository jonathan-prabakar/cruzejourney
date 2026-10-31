import { expect, test, type Page } from '@playwright/test';
import { installMockRoadRouting } from './road-fixture';

test.beforeEach(async ({ page }) => {
  await installMockRoadRouting(page);
  await page.route('**/api/intelligence', r => r.fulfill({ json: { available: false } }));
  await page.route('**/api/intelligence/journey', r => r.abort());
  await page.goto('/');
});
async function city(page: Page, field: 'Point A' | 'Point B', name: string) {
  await page.getByRole('combobox', { name: field, exact: true }).fill(name);
  await page.getByRole('option').filter({ hasText: name }).click();
}
async function pause(page: Page) {
  await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
}
test('opens the unified real-map view with read-only readings and sourced truck stops', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start Drive', exact: true })).toBeVisible();
  await expect(page.getByRole('slider')).toHaveCount(1);
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.getByRole('button', { name: /Show all.*verified truck stops/ }).click();
  await expect(page.getByRole('heading', { name: 'Verified truck stops' })).toBeVisible();
  await page.getByRole('button', { name: 'Diesel at TA New Braunfels #0232', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TA New Braunfels #0232', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Official station details and current prices' })).toHaveAttribute('href', /ta-petro/);
  await expect(page.getByText('VERIFIED TRUCK STOP', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close station comparison' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.getByRole('button', { name: 'Start Drive', exact: true })).toBeInViewport();
});
test('previews, declines and accepts a road detour without resetting vehicle readings', async ({ page }) => {
  await page.getByRole('button', { name: /^Inspect recommended stop TA/ }).click();
  const original = await page.getByTestId('driving-map').getAttribute('data-route-id');
  const fuel = await page.getByTestId('vehicle-fuel').textContent();
  await page.getByRole('button', { name: 'Review detour', exact: true }).click();
  await expect(page.getByTestId('driving-map')).toHaveAttribute('data-has-proposal', 'true');
  await expect(page.getByTestId('driving-map')).toHaveAttribute('data-route-id', original!);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.getByTestId('driving-map')).toHaveAttribute('data-has-proposal', 'false');
  await page.getByRole('button', { name: 'Review detour', exact: true }).click();
  await page.getByRole('button', { name: 'Accept detour', exact: true }).click();
  await expect(page.getByTestId('driving-map')).toHaveAttribute('data-provider', 'osrm');
  await expect(page.getByTestId('vehicle-fuel')).toHaveText(fuel!);
  await expect(page.getByTestId('navigation-alert')).toBeVisible();
});
test('runs, pauses, completes refueling and resets on one timeline', async ({ page }) => {
  await page.getByRole('button', { name: 'Start Drive', exact: true }).click();
  await expect.poll(async () => parseFloat((await page.getByTestId('vehicle-distance').textContent())!)).toBeGreaterThan(0);
  await pause(page);
  const held = await page.getByTestId('vehicle-distance').textContent();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('vehicle-distance')).toHaveText(held!);
  await page.getByRole('slider', { name: 'Seek drive simulation' }).press('End');
  await expect(page.getByTestId('vehicle-event')).toHaveText('Arrived');
  await page.getByRole('button', { name: 'Developer diagnostics', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Developer diagnostics' })).toContainText('P0301');
  await page.getByRole('button', { name: 'Close diagnostics' }).click();
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.getByTestId('vehicle-distance')).toHaveText('0.0 mi');
});
test('supports timed playback and preserves the San Antonio destination choices', async ({ page }) => {
  for (const destination of ['Dallas', 'Houston', 'El Paso']) {
    await city(page, 'Point B', destination);
    await page.getByRole('button', { name: 'Start Drive', exact: true }).click();
    await pause(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(destination);
  }
  await expect(page.getByRole('combobox', { name: 'Playback speed' }).locator('option')).toHaveText(['1×', '2×', '5×', '10-second run', '15-second run', '20-second run']);
});
test('keeps short journeys within range without introducing purchases', async ({ page }) => {
  await city(page, 'Point A', 'San Marcos');
  await page.getByRole('button', { name: 'Start Drive', exact: true }).click();
  await pause(page);
  await expect(page.getByTestId('navigation-alert')).toContainText('No fuel stop needed');
  await page.getByRole('button', { name: 'Developer diagnostics', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Developer diagnostics' })).toContainText('0.00 gal');
});
test('redirects the old journey URL to the unified driving experience', async ({ page }) => {
  await page.goto('/journey');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Start Drive', exact: true })).toBeVisible();
});
