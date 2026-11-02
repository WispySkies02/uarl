import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const owner = { id: 'local-test', displayName: 'Test Owner', role: 'owner' };
async function admin(page, role = 'owner') {
  await page.route('**/.netlify/functions/admin-publish**', route => {
    const status = route.request().url().includes('status=1');
    return route.fulfill({ json: status ? {ready:true,user:{...owner,role}} : {data:null,source:'static'} });
  });
  await page.goto('/admin/');
  await expect(page.locator('[data-save-status]')).toHaveText('Published data loaded');
}
const section = (page, name) => page.locator('.admin-sidebar [data-section="'+name+'"]');
const step = (page, n) => page.locator('.editor-steps [data-step="'+n+'"]');
const draft = page => page.evaluate(() => JSON.parse(localStorage.getItem('uarl-admin-draft-v1')));

test('schedule-linked results choose the next unrecorded race and preserve data through steps', async ({page}) => {
  await admin(page); await section(page,'results').click();
  await page.locator('.view-head [data-action="add"]').click();
  const next=data.events.filter(e=>!data.records.some(r=>r.id===e.id)).sort((a,b)=>new Date(a.start)-new Date(b.start))[0];
  await expect(page.locator('[data-schedule-race]')).toHaveValue(next.id);
  let current=(await draft(page)).records.at(-1);
  expect(current).toMatchObject({id:next.id,event:next.name,track:next.track,division:next.division});
  await expect(page.locator('[data-schedule-race] option[value="'+data.records[0].id+'"]')).toHaveAttribute('disabled','');
  await step(page,4).click();
  await page.locator('[data-sadd="finishes"]').click();
  await expect(page.locator('.entry-card').last()).toHaveAttribute('open','');
  const driver=page.locator('[data-sfield="finishes"][data-skey="name"]');
  await driver.selectOption({index:1});
  await expect(page.locator('[data-auto-number]')).not.toHaveValue('');
  await expect(page.locator('[data-auto-points="0"]')).not.toHaveValue('0');
  const saved=(await draft(page)).records.at(-1).finishes[0];
  await step(page,0).click(); await step(page,4).click();
  expect((await draft(page)).records.at(-1).finishes[0]).toEqual(saved);
  await step(page,0).click();
  page.once('dialog',d=>d.dismiss());
  await page.locator('[data-schedule-race]').selectOption(data.events.find(e=>e.id!==next.id&&!data.records.some(r=>r.id===e.id)).id);
  await expect(page.locator('[data-schedule-race]')).toHaveValue(next.id);
});

test('change count is per edited entry, supports revert and recovery without duplicate derived changes', async ({page}) => {
  await admin(page);await section(page,'teams').click();
  const name=page.locator('[data-field="name"]'), original=await name.inputValue();
  await name.pressSequentially(' several letters');
  await expect(page.locator('[data-save-status]')).toContainText('1 changed entry');
  await name.fill(original);await expect(page.locator('[data-save-status]')).toHaveText('No unpublished changes');
  await name.fill(original+' edited');await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  await section(page,'teams').click();await page.locator('[data-field="owner"]').fill('New owner');
  await expect(page.locator('[data-save-status]')).toContainText('1 changed entry');
  await page.locator('[data-action="publish"]').first().click();
  await expect(page.locator('[data-publish-summary]')).toContainText('1 changed entry');
});

test('every collection exposes every field through short sections without edits on navigation', async ({page}) => {
  await admin(page);
  for(const name of ['schedule','results','teams','profiles','open','freeAgents','moves','paints','history','guide','conduct']) {
    await section(page,name).click();
    const steps=page.locator('.editor-steps button');
    for(let i=0;i<await steps.count();i++) {await step(page,i).click();}
  }
  await section(page,'teams').click();await page.locator('[data-field="name"]').press('End');
  // A no-op input after viewing every panel must remain clean.
  await page.locator('[data-field="name"]').dispatchEvent('input');
  await expect(page.locator('[data-save-status]')).toHaveText('No unpublished changes');
});

test('mobile bottom navigation and compact roster editing respect roles', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await admin(page);
  await expect(page.locator('.admin-bottom-nav')).toBeVisible();
  await page.locator('[data-admin-more]').click();await page.locator('[data-admin-menu] [data-section="teams"]').click();
  await expect(page.locator('[data-admin-menu]')).not.toBeVisible();
  await step(page,2).click();
  await expect(page.locator('.entry-card').first()).not.toHaveAttribute('open','');
  await page.locator('.entry-card>summary').first().click();
  await expect(page.locator('[data-sfield="entries"][data-skey="user"]').first()).toBeVisible();
  for(const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
  await page.unroute('**/.netlify/functions/admin-publish**');await admin(page,'race_control');
  await page.locator('[data-admin-more]').click();
  await expect(page.locator('[data-admin-menu] [data-section="teams"]')).toHaveCount(0);
  await expect(page.locator('[data-admin-menu] [data-section="accounts"]')).toHaveCount(0);
});

test('public mobile navigation opens all pages and stays hidden on desktop', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:{data:null}}));
  for(const path of ['/','/schedule/','/race-center/','/drivers/','/paint-schemes/','/history/','/competition-guide/']) {
    await page.goto(path);await expect(page.locator('.uarl-bottom-nav')).toBeVisible();
    await expect(page.locator('.uarl-native-menu-btn')).not.toBeVisible();
    await expect(page.locator('.uarl-native-nav')).not.toBeVisible();
    await expect(page.locator('.uarl-bottom-nav .is-active')).toHaveCount(1);
    await page.getByRole('button',{name:'More pages'}).click();
    await expect(page.locator('.uarl-native-drawer')).toHaveClass(/is-open/);
    await expect(page.locator('.uarl-native-drawer a[href="/history/"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'More pages'})).toBeFocused();
    await expect(page.getByRole('button',{name:'More pages'})).toHaveAttribute('aria-expanded','false');
  }
  await page.goto('/');await page.screenshot({path:'test-results/public-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('.uarl-bottom-nav')).not.toBeVisible();
  await expect(page.locator('.uarl-native-nav')).toBeVisible();
  await page.setViewportSize({width:900,height:900});
  await expect(page.locator('.uarl-native-menu-btn')).toBeVisible();
  await page.locator('.uarl-native-menu-btn').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.uarl-native-menu-btn')).toBeFocused();
});


test('stage rows open when added and points survive a race switch only after confirmation', async ({page}) => {
  await admin(page);await section(page,'results').click();
  await page.locator('.view-head [data-action="add"]').click();
  await step(page,3).click();await page.locator('[data-sadd="stages"]').click();
  await expect(page.locator('.entry-card').first()).toHaveAttribute('open','');
  await page.locator('[data-snadd="stages"]').click();
  const driver=page.locator('[data-sfield="stages"][data-skey="name"][data-sparent="0"]');
  await expect(driver).toBeVisible();await driver.selectOption({index:1});
  const id=(await draft(page)).records.at(-1).id;
  await step(page,0).click();page.once('dialog',d=>d.accept());
  const next=data.events.find(e=>e.id!==id&&!data.records.some(r=>r.id===e.id));
  await page.locator('[data-schedule-race]').selectOption(next.id);
  const result=(await draft(page)).records.at(-1);
  expect(result.id).toBe(next.id);expect(result.stages).toEqual([]);expect(result.finishes).toEqual([]);
});
