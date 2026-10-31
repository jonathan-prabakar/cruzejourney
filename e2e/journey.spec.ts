import { expect, test, type Page } from '@playwright/test';
import { ConnectedVehicleSession } from '../src/lib/vehicle/connected';
test.beforeEach(async ({page})=>{
  await page.route('**/api/intelligence',route=>route.fulfill({json:{available:false,model:'gemma-4-26b-a4b-it'}}));
  await page.route('**/api/intelligence/journey',route=>route.abort());
  await page.goto('/');
});
async function city(page:Page,field:'Point A'|'Point B',name:string){
  await page.getByRole('combobox',{name:field,exact:true}).fill(name);
  await page.getByRole('option').filter({hasText:name}).click();
}
async function seek(page:Page,index:number){
  const range=page.getByRole('slider',{name:'Seek drive simulation'});await range.press('Home');
  for(let i=0;i<index;i++)await range.press('ArrowRight');
}
test('opens one map-first dashboard with read-only readings, prices and no planner tab',async({page})=>{
  await expect(page.getByRole('button',{name:'Start Drive',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:/journey planner/i})).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(1);
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.getByRole('button',{name:/Diesel at.*\$/})).not.toHaveCount(0);
  await expect(page.getByTestId('recommended-station')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Developer diagnostics'})).toHaveCount(0);
  await expect(page.getByText('No simulated diagnostic code',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'artifacts/driving-dashboard-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Start Drive',exact:true})).toBeInViewport();
  await page.screenshot({path:'artifacts/driving-dashboard-mobile.png',fullPage:true});
});
test('starts selected road playback and synchronizes motion, fuel and range',async({page})=>{
  const marker=await page.getByTestId('vehicle-marker').getAttribute('transform');
  await page.getByRole('button',{name:'Start Drive',exact:true}).click();
  await expect(page.getByTestId('vehicle-fuel')).not.toHaveText('17.0%');
  await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
  expect(await page.getByTestId('vehicle-marker').getAttribute('transform')).not.toBe(marker);
  expect(parseFloat(await page.getByTestId('vehicle-distance').innerText())).toBeGreaterThan(0);
  expect(parseFloat(await page.getByTestId('vehicle-range').innerText())).toBeLessThan(63);
  await expect(page.getByTestId('vehicle-event')).toContainText('Paused');
});
test('clicks a station price marker, opens comparison, previews and declines a detour without changing the active route',async({page})=>{
  await page.getByTestId('recommended-station').locator('rect').click();
  const panel=page.getByRole('complementary',{name:'Station comparison'});
  await expect(panel).toContainText('estimated purchase');
  await expect(panel).toContainText('gal needed');
  const before=await page.getByTestId('active-route').getAttribute('points');
  await page.getByRole('button',{name:'Review detour',exact:true}).click();
  await expect(page.getByTestId('proposed-route')).toBeVisible();
  await page.screenshot({path:'artifacts/driving-detour-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Decline',exact:true}).click();
  await expect(page.getByTestId('proposed-route')).toHaveCount(0);
  expect(await page.getByTestId('active-route').getAttribute('points')).toBe(before);
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
});
test('accepts a detour at current position without refilling or clearing diagnostics',async({page})=>{
  const demo=new ConnectedVehicleSession();
  const onset=demo.frames.findIndex(f=>f.telemetry.diagnostic_code==='P0301');demo.dispose();
  await seek(page,onset);
  await expect(page.getByTestId('navigation-alert')).toContainText('Engine warning');
  const fuel=await page.getByTestId('vehicle-fuel').innerText();
  const distance=await page.getByTestId('vehicle-distance').innerText();
  await page.getByRole('button',{name:'Inspect recommended stop'}).click();
  await page.locator('.drive-alternatives > button').first().click();
  await page.getByRole('button',{name:'Review detour',exact:true}).click();
  await page.getByRole('button',{name:'Accept detour',exact:true}).click();
  await expect(page.getByTestId('proposed-route')).toHaveCount(0);
  await expect(page.getByTestId('vehicle-fuel')).toHaveText(fuel);
  await expect(page.getByTestId('vehicle-distance')).toHaveText(distance);
  await expect(page.getByTestId('navigation-alert')).toContainText('Engine warning');
  await page.getByRole('button',{name:'Reset simulation',exact:true}).click();
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
  await expect(page.getByTestId('navigation-alert')).not.toContainText('Engine warning');
});
test('preserves sensor readings on destination change and avoids unnecessary purchases on a short route',async({page})=>{
  await city(page,'Point A','San Marcos');await city(page,'Point B','Austin');
  await page.getByRole('button',{name:'Start Drive',exact:true}).click();
  await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
  await expect(page.getByTestId('navigation-alert')).toContainText('No fuel stop needed');
  await expect(page.getByTestId('fuel-recommendation')).toHaveCount(0);
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
});
test('shows an explicit refueling event, updates purchases and restores a consistent demo',async({page})=>{
  const demo=new ConnectedVehicleSession();
  const pump=demo.frames.findIndex(f=>f.phase==='fuel-stop'&&f.fuelAddedGallons>0);demo.dispose();
  await expect(page.getByRole('slider',{name:'Seek drive simulation'})).toHaveAttribute('max',String(demo.frames.length-1));
  await seek(page,pump);
  await expect(page.getByTestId('vehicle-event')).toContainText('Refueling · engine off · +');
  await expect(page.getByTestId('vehicle-speed')).toHaveText('0');
  await page.getByRole('button',{name:'Developer diagnostics',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Developer diagnostics'})).toContainText('Session purchases');
  await page.getByRole('button',{name:'Close diagnostics'}).click();
  await page.getByRole('button',{name:'Reset simulation',exact:true}).click();
  await expect(page.getByTestId('vehicle-fuel')).toHaveText('17.0%');
});
test('redirects the retired planner URL to the dashboard and rejects unsupported locations',async({page})=>{
  await page.goto('/journey');await expect(page).toHaveURL('/');
  await page.getByRole('combobox',{name:'Point B',exact:true}).fill('Unverified address');
  await page.getByRole('button',{name:'Start Drive',exact:true}).click();
  await expect(page.getByText('Choose two different supported cities.',{exact:true})).toBeVisible();
});
