import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
function league({ empty = false } = {}) {
  const data = structuredClone(original);
  const record = (id, division, finishes, extra = {}) => ({ id, division, event: 'Manufacturer test ' + division, track: 'Test Oval', round: 1, date: '2026-11-08', start: '2026-11-09T00:30:00Z', status: 'complete', pointsEvent: true, exhibition: false, qualifying: [], stages: [], bonuses: [], entries: [], finishes, ...extra });
  data.records = empty ? [] : [
    record('manufacturer-cup', 'd1', [
      { position: 1, name: 'Hailey', username: 'Aokikoto', number: '28', points: 50 },
      { position: 2, name: 'Muffin', username: 'Muffin', number: '16', numberManual: true, points: 45 },
      { position: 3, name: 'Dale', username: '58bbwapache', number: '16', points: 41 }
    ]),
    record('manufacturer-open', 'open', [{ position: 1, name: 'James', username: 'JJElliott2004', number: '48', points: 50 }]),
    record('manufacturer-archive', 'd2', [{ position: 1, name: 'Muffin', username: 'AnyGameAnyTime09', number: '84', points: 50 }]),
    record('manufacturer-special', 'd1', [{ position: 1, name: 'Hailey', username: 'Aokikoto', number: '28', make: 'Ford', points: 0 }], { event: 'Manufacturer exhibition', pointsEvent: false, exhibition: true, round: null })
  ];
  delete data.standings;
  return data;
}
async function boot(page, data, path = '/race-center/') {
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: route.request().url().includes('status=1') ? { ready: true, user: { id: 'badge-owner', role: 'owner', displayName: 'Badge staff' } } : { data } }));
  await page.goto(path);
}
const standingsRow = (page, user) => page.locator('[data-rc-standings-body] [data-driver-id="' + user + '"]');
const badge = (node, make) => node.getByRole('img', { name: make + ' manufacturer', exact: true });

test('public standings show badges before the first race and throughout every series', async ({ page }) => {
  await boot(page, league({ empty: true }));
  for (const [user, make] of [['Aokikoto', 'Toyota'], ['AnyGameAnyTime09', 'Ford'], ['58bbwapache', 'Chevrolet']]) {
    await expect(badge(standingsRow(page, user), make)).toBeVisible();
    await expect(standingsRow(page, user).locator('.rc-points-value')).toHaveText('0');
  }
  await expect(page.locator('[data-rc-panel="standings"] th')).toHaveText(['Position', 'Change', 'Driver#', 'DriverName', 'Points', 'Behind', 'Cutoff']);
  await expect(standingsRow(page, 'Callsign_Hestia').getByRole('img', { name: 'Manufacturer not assigned' })).toBeVisible();
  await page.locator('[data-rc-division="open"]').click();
  await expect(badge(standingsRow(page, 'JJElliott2004'), 'Chevrolet')).toBeVisible();
  await page.locator('[data-rc-division="d2"]').click();
  await expect(badge(standingsRow(page, 'AnyGameAnyTime09'), 'Toyota')).toBeVisible();
});

test('official finish tables show the correct badges without altering numbers, points or archived manufacturers', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, league(), '/race-center/?event=manufacturer-cup');
  const finish = page.locator('#event-manufacturer-cup .rc-finish-table tbody tr');
  await expect(finish).toHaveCount(3);
  for (const [i, make] of [[0, 'Toyota'], [1, 'Ford'], [2, 'Chevrolet']]) await expect(badge(finish.nth(i), make)).toBeVisible();
  await expect(finish.nth(1).locator('.rc-finish-number')).toHaveText('#16');
  await expect(finish.nth(1).locator('.rc-finish-total')).toHaveText('45');
  await page.locator('#event-manufacturer-special .rc-result-details > summary').click();
  await expect(badge(page.locator('#event-manufacturer-special .rc-finish-table'), 'Ford')).toBeVisible();
  await expect(page.locator('#event-manufacturer-special .no-points')).toHaveText('NO POINTS');
  for (const [division, id, make] of [['open', 'manufacturer-open', 'Chevrolet'], ['d2', 'manufacturer-archive', 'Toyota']]) {
    await page.goto('/race-center/?event=' + id);
    await expect(page.locator('#uarl-race-center')).toHaveAttribute('data-division', division);
    await expect(badge(page.locator('#event-' + id + ' .rc-finish-table'), make)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('CSV standings preview, manual points editing and the public points preview retain manufacturer badges', async ({ page }) => {
  await boot(page, league({ empty: true }), '/admin/');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  const row = page.locator('[data-standings-driver="AnyGameAnyTime09"]');
  await expect(badge(row, 'Ford')).toBeVisible();
  const widget = page.locator('[data-csv-kind="standings"]');
  await widget.locator('[data-csv-input]').fill('Position,+/-,Driver#,DriverName,Points\n1,0,2,Muffin,100\n2,0,28,Hailey,90\n3,0,16,Dale,80');
  await widget.locator('[data-csv-preview-button]').click();
  await expect(widget.locator('.csv-errors')).toHaveCount(0);
  const preview = widget.locator('[data-csv-preview] tbody tr');
  await expect(badge(preview.first(), 'Ford')).toBeVisible();
  await expect(badge(preview.nth(1), 'Toyota')).toBeVisible();
  await widget.locator('[data-csv-apply]').click();
  await expect(row.locator('[data-standings-points]')).toHaveValue('100');
  await row.locator('[data-standings-points]').fill('125'); await row.locator('[data-save-points]').click();
  await expect(badge(row, 'Ford')).toBeVisible();
  const popup = page.waitForEvent('popup'); await page.locator('[data-action="preview"]').first().click();
  const previewPage = await popup;
  await expect(badge(standingsRow(previewPage, 'AnyGameAnyTime09'), 'Ford')).toBeVisible();
  await expect(standingsRow(previewPage, 'AnyGameAnyTime09').locator('.rc-points-value')).toHaveText('125');
});

test('badges stay readable and proportional in phone and desktop standings and finish tables', async ({ page }) => {
  await boot(page, league());
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await standingsRow(page, 'Aokikoto').scrollIntoViewIfNeeded();
    const image = badge(standingsRow(page, 'Aokikoto'), 'Toyota').locator('img');
    const badgeSize = await badge(standingsRow(page, 'Aokikoto'), 'Toyota').boundingBox();
    expect(badgeSize.width).toBe(badgeSize.height);
    await expect(badge(standingsRow(page, 'Aokikoto'), 'Toyota')).toHaveCSS('border-radius', '0px');
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const sizes = await image.evaluate(img => ({ w: img.width, h: img.height, nw: img.naturalWidth, nh: img.naturalHeight }));
    expect(sizes.w).toBeLessThanOrEqual(44); expect(sizes.h).toBeLessThanOrEqual(22);
    expect(Math.abs(sizes.w / sizes.h - sizes.nw / sizes.nh)).toBeLessThan(0.15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: 'test-results/manufacturers-standings-' + width + '.png' });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/race-center/?event=manufacturer-cup');
  await page.locator('#event-manufacturer-cup .rc-finish-shell').scrollIntoViewIfNeeded();
  await expect(badge(page.locator('#event-manufacturer-cup .rc-finish-table tbody tr').first(), 'Toyota')).toBeVisible();
  const finishBadgeSize = await badge(page.locator('#event-manufacturer-cup .rc-finish-table tbody tr').first(), 'Toyota').boundingBox();
  expect(finishBadgeSize.width).toBe(finishBadgeSize.height);
  for (const img of await page.locator('#event-manufacturer-cup .manufacturer-badge img').all()) await expect.poll(() => img.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  await expect(badge(page.locator('#event-manufacturer-cup .rc-finish-table tbody tr').first(), 'Toyota')).toHaveCSS('background-color', 'rgb(235, 10, 30)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/manufacturers-finishes-mobile.png' });
});
