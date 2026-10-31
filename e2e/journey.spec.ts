import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/journey');
  await expect(page.locator('[data-playback-ready=true]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled();
});
test('renders the planner, cached route, fallback and responsive layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByTestId('route-polyline')).toBeVisible();
  await expect(page.getByText('DETERMINISTIC FALLBACK', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/journey-planner-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Your journey.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/journey-planner-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('searches, selects, swaps and rejects unresolved endpoints', async ({ page }) => {
  const origin = page.getByRole('combobox', { name: 'Point A · Starting location' });
  await origin.fill('New Braun');
  await page.getByRole('option').filter({ hasText: 'New Braunfels' }).click();
  await page.getByRole('button', { name: 'Swap origin and destination' }).click();
  await expect(origin).toHaveValue('Austin');
  await page.getByRole('button', { name: 'Plan journey', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Austin → New Braunfels' })).toBeVisible();
  await origin.fill('123 unknown street');
  await page.getByRole('button', { name: 'Plan journey', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Typed addresses are not geocoded' })).toBeVisible();
});
test('honors no-stop preference safely, flags stop removal and offers a feasible alternative', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Fuel-stop preference' }).selectOption('none');
  await page.getByRole('button', { name: 'Plan journey', exact: true }).click();
  await expect(page.getByText('Not feasible', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Use recommended feasible plan' }).click();
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Remove Love's Travel Stop/ }).click();
  await expect(page.getByText('Not feasible', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeDisabled();
});
test('shows verified stop provenance and does not invent amenity coverage', async ({ page }) => {
  await expect(page.getByText('No verified amenity data is available at this stop.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Official truck-stop details and current prices' })).toHaveAttribute('href', /^https:\/\/www\.loves\.com\/locations\//);
  await page.getByRole('combobox', { name: 'Fuel-stop preference' }).selectOption('three');
  await page.getByRole('button', { name: 'Plan journey', exact: true }).click();
  await expect(page.getByText(/3-stop preference cannot be met/)).toBeVisible();
  await expect(page.getByText('Modeled feasible', { exact: true })).toBeVisible();
});
test('moves the vehicle, updates telemetry, pauses, seeks diagnostics and resets purchases', async ({ page }) => {
  const before = await page.getByTestId('vehicle-marker').getAttribute('transform');
  await page.getByRole('button', { name: 'Start simulation', exact: true }).click();
  await expect.poll(async () => parseFloat((await page.getByTestId('vehicle-distance').textContent())!)).toBeGreaterThan(0);
  expect(await page.getByTestId('vehicle-marker').getAttribute('transform')).not.toBe(before);
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const paused = await page.getByTestId('vehicle-distance').textContent();
  // A deliberate wall-time observation verifies that pause does not advance replay.
  await page.waitForTimeout(500);
  await expect(page.getByTestId('vehicle-distance')).toHaveText(paused!);
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause simulation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  const seek = page.getByRole('slider', { name: 'Seek journey simulation' });
  await seek.press('Home');
  await seek.press('End');
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/journey-simulation-combined.png', fullPage: true });
  await seek.press('End');
  await expect(page.getByText('P0301 observed in simulation', { exact: true })).toBeVisible();
  await expect(page.getByTestId('vehicle-fuel')).not.toHaveText('17.0%');
  await page.screenshot({ path: 'artifacts/journey-simulation-diagnostic.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.getByText('No simulated diagnostic code', { exact: true })).toBeVisible();
  await expect(page.getByTestId('vehicle-distance')).toContainText('0.0');
});
test('inspects a map stop, adds a feasible refill and replaces a selected stop', async ({ page }) => {
  const replacement = page.getByRole('combobox', { name: 'Replace fuel stop 1', exact: true });
  const selectedId = await replacement.inputValue();
  const other = await replacement.locator('option').evaluateAll((options, current) =>
    options.map(option => ({ id: (option as HTMLOptionElement).value, name: option.textContent! })).find(option => option.id !== current)!, selectedId);
  await page.getByRole('button', { name: 'Inspect truck stop ' + other.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: other.name, exact: true })).toBeVisible();
  await replacement.selectOption(other.id);
  await expect(page.getByRole('button', { name: other.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect truck stop Love\'s Travel Stop #' + selectedId.replace('loves-', ''), exact: true }).click();
  await page.getByRole('button', { name: 'Add feasible fuel stop', exact: true }).click();
  await expect(page.getByText('2 refill stop(s)', { exact: false })).toBeVisible();
  await expect(page.getByText('Recommended feasible alternative', { exact: true })).toBeVisible();
  await expect(page.getByText('Modeled feasible', { exact: true })).toBeVisible();
});
test('normal scenario changes starting fuel and removes unnecessary fuel stops', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Simulation scenario' }).selectOption('normal');
  await expect(page.getByRole('slider', { name: 'Starting fuel percentage' })).toHaveValue('60');
  await page.getByRole('button', { name: 'Plan journey', exact: true }).click();
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('60.0%');
  await expect(page.getByText('0 refill stop(s) · 0.0 gal added', { exact: true })).toBeVisible();
});

test('preserves main cockpit playback and navigates into the merged journey planner', async ({ page }) => {
  await page.goto('/');
  const seek = page.getByRole('slider', { name: 'Seek telemetry reading', exact: true });
  await expect(seek).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play telemetry', exact: true })).toBeEnabled();
  await seek.press('End');
  await page.getByRole('button', { name: 'Fuel intelligence details', exact: true }).click();
  const fuel = page.getByRole('dialog', { name: 'Fuel intelligence', exact: true });
  await expect(fuel).toBeVisible();
  await expect(fuel).toContainText('CRITICAL');
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: 'Reset telemetry', exact: true }).click();
  await expect(seek).toHaveValue('0');
  await page.getByRole('link', { name: 'Plan journey', exact: true }).click();
  await expect(page).toHaveURL('/journey');
  await expect(page.locator('[data-playback-ready=true]')).toBeVisible();
  await expect(page.getByTestId('route-polyline')).toBeVisible();
  await page.screenshot({ path: 'artifacts/merged-main-journey-planner.png', fullPage: true });
});
