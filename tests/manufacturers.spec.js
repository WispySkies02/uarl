import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const expected = [
  ['Dakota Sullivan Racing', 'Chevrolet', 5], ['Avery Motorsports', 'Ford', 4],
  ['Goat Whitlock Motorsports', 'Toyota', 5], ['Goforth Motorsports', 'Ford', 3],
  ['Team Penske', 'Ford', 1], ['Sham Motorsports', 'Ford', 1],
  ['Winston-Hermonstyne Motorsports', 'Toyota', 1], ['Aetherwing eMotorsports', 'Chevrolet', 1]
];
async function boot(page, data = original, path = '/drivers/') {
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
  await page.goto(path);
  await expect(page.locator('[data-team-grid] .pp-team-stage')).toHaveCount(8);
}
const driver = (page, user, scope = '[data-driver-grid]') => page.locator(scope + ' .pp-driver').filter({ has: page.locator('[data-driver="' + user + '"]') });

test('grouped team rosters show one manufacturer in the header while individual driver cards keep their badges', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.pp-stats .pp-stat b')).toHaveText(['8', '21', '4', String(original.drivers.freeAgents.length)]);
  for (const [name, make, count] of expected) {
    const team = page.locator('.pp-team-stage').filter({ has: page.locator('h3', { hasText: name }) });
    await expect(team.locator('.pp-stage-person small')).toHaveCount(count);
    await expect(team.locator('.pp-stage-entry .pp-driver-mfg')).toHaveCount(0);
    await expect(team.getByRole('img', { name: make + ' manufacturer', exact: true })).toHaveCount(1);
  }
  // The directory now marks the three unnumbered vacancies as open seats too.
  await expect(page.locator('.pp-stage-entry.is-open')).toHaveCount(9);
  await expect(page.locator('.pp-stage-entry.is-open .pp-stage-entry-link')).toHaveCount(0);
  await expect(page.locator('.pp-stage-entry.is-open .pp-entry-manufacturer')).toHaveCount(0);
  await expect(page.locator('.pp-number-pending')).toHaveCount(3);
  await page.locator('[data-view="drivers"]').click();
  await expect(page.locator('[data-driver-grid] .pp-driver')).toHaveCount(21);
  await expect(page.locator('[data-driver-grid] .pp-driver-mfg')).toHaveCount(21);
  for (const user of ['IIKyle5Larson', 'AnyGameAnyTime09', 'Kingofgamez']) await expect(driver(page, user).getByRole('img', { name: 'Ford manufacturer' })).toHaveCount(1);
  await expect(driver(page, 'JamesEklund').locator('.pp-driver-number')).toHaveText('#25');
  await expect(driver(page, 'JJElliott2004').locator('.pp-driver-number')).toHaveText('#84');
  await expect(driver(page, 'JJElliott2004').locator('h3')).toHaveText('JJ');
  await expect(driver(page, 'JamesEklund').locator('h3')).toHaveText('James Eklund');
  await expect(driver(page, 'pa05').locator('.pp-driver-number')).toHaveText('#05');
  await expect(driver(page, 'Frogboy4783').locator('.pp-driver-number')).toHaveText('#5');
  const cards = page.locator('[data-driver-grid]');
  await cards.scrollIntoViewIfNeeded();
  for (const image of await cards.locator('.pp-driver-mfg img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const sizes = await image.evaluate(img => ({ w: img.width, h: img.height, nw: img.naturalWidth, nh: img.naturalHeight }));
    expect(sizes.w).toBeLessThanOrEqual(58); expect(sizes.h).toBeLessThanOrEqual(26);
    expect(Math.abs(sizes.w / sizes.h - sizes.nw / sizes.nh)).toBeLessThan(0.15);
  }
});

test('current usernames and full names find the same profiles, while Open Series keeps its own manufacturer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('[data-view="drivers"]').click();
  await page.getByRole('searchbox').fill('kingofgamez_YT');
  const king = driver(page, 'Kingofgamez');
  await expect(king).toBeVisible(); await expect(king.locator('.user')).toHaveText('@kingofgamez_YT');
  await king.locator('[data-driver]').click();
  await expect(page.locator('.pp-profile-user')).toHaveText('@kingofgamez_YT');
  await expect(page.locator('.pp-profile-affiliation').getByRole('img', { name: 'Ford manufacturer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox').fill('Hailey Waggonner');
  await expect(driver(page, 'Aokikoto')).toBeVisible();
  await page.getByRole('searchbox').fill('Muffin');
  await expect(driver(page, 'AnyGameAnyTime09').locator('.user')).toHaveText('@Muffin');
  await page.getByRole('searchbox').clear();
  await page.locator('[data-view="open"]').click();
  const openJJ = driver(page, 'JJElliott2004', '[data-open-grid]');
  await expect(openJJ.getByRole('img', { name: 'Chevrolet manufacturer' })).toBeVisible();
  await openJJ.locator('[data-driver]').click();
  await expect(page.locator('.pp-profile-affiliation').getByRole('img', { name: 'Chevrolet manufacturer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(driver(page, 'FueledByMayonnaise', '[data-open-grid]').locator('.pp-mfg-generic')).toHaveText('Generic');
  await page.goto('/drivers/?team=sham');
  await expect(page.locator('#pp-dialog-title')).toHaveText('Sham Motorsports');
  await expect(page.locator('.pp-dialog-entry .pp-driver-mfg')).toHaveCount(0);
  await expect(page.locator('.pp-team-meta').getByRole('img', { name: 'Ford manufacturer', exact: true })).toHaveCount(1);
  await expect(page.locator('.pp-dialog-entry').first()).toContainText('@Muffin');
  await expect(page.locator('.pp-dialog-entry').last().locator('.num')).toHaveText('—');
});

test('the roster upgrades saved data once, keeps signatures, and its badges fit phone and desktop layouts', async ({ page }) => {
  const data = structuredClone(original), saved = data.drivers.previousRoster;
  Object.assign(data.drivers, { teams: saved.teams, profiles: saved.profiles, freeAgents: saved.freeAgents, recentMoves: saved.recentMoves });
  delete data.drivers.assignmentVersion; delete data.drivers.previousRoster;
  delete data.drivers.displayNameVersion;
  delete data.drivers.aetherwingReturnVersion;
  data.drivers.profiles.Aokikoto.signatureImage = '/assets/aetherwing/logo.webp';
  await boot(page, data);
  const hailey = page.locator('.pp-team-stage').filter({ has: page.locator('h3', { hasText: 'Goat Whitlock Motorsports' }) }).locator('.pp-stage-entry').filter({ hasText: 'Aokikoto' });
  await expect(hailey.locator('.pp-driver-signature')).toHaveCount(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await hailey.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const inside = await hailey.evaluate(row => { const frame = row.getBoundingClientRect(), art = row.querySelector('.pp-upload-number').getBoundingClientRect(); return art.left >= frame.left && art.right <= frame.right; });
    expect(inside).toBe(true);
    if (width === 390) await page.screenshot({ path: 'test-results/manufacturer-roster-mobile.png' });
    await page.locator('[data-view="drivers"]').click();
    await driver(page, 'Aokikoto').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: 'test-results/manufacturer-cards-' + width + '.png' });
    await page.locator('[data-view="teams"]').click();
  }
});
