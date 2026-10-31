import { test, expect } from '@playwright/test';
test('has no browser runtime or hydration errors',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/intelligence',r=>r.fulfill({json:{available:false}}));
 for(const viewport of [{width:1512,height:982},{width:390,height:844}]){
 await page.setViewportSize(viewport);
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Start Drive',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Start Drive',exact:true}).click();
 await page.getByRole('button',{name:'Pause simulation',exact:true}).click();
 }
 expect(errors).toEqual([]);
});
