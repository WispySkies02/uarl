import { test, expect } from '@playwright/test';
import { brokenStandings, baseline } from './fixtures/standings-roster.js';

const names = baseline.map(([user, name]) => user === 'JJElliott2004' ? 'JJ' : name);
async function boot(page, data, path = '/race-center/') {
  const published = [];
  await page.context().route('**/.netlify/functions/admin-publish**', route => {
    if (route.request().method() === 'POST') {
      published.push(route.request().postDataJSON().data);
      return route.fulfill({ json: { ok: true, revision: 'repaired', publishedAt: '2026-11-10T08:00:00Z', message: 'Published live' } });
    }
    return route.fulfill({ json: route.request().url().includes('status=1') ? { ready: true, user: { id: 'repair-race-control', role: 'race_control', displayName: 'Repair staff' } } : { data } });
  });
  await page.goto(path);
  return published;
}

test('all seventeen imported standings names recover in the reported positions with their original totals', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, brokenStandings());
  const rows = page.locator('[data-rc-standings-body] tr');
  await expect(rows.first().locator('.rc-driver-cell strong')).toHaveText('Lance');
  for (const [i, [user, , number, points]] of baseline.entries()) {
    const row = rows.nth(i);
    await expect(row).toHaveAttribute('data-driver-id', user);
    await expect(row.locator('.rc-driver-cell strong')).toHaveText(names[i]);
    await expect(row.locator('.rc-rank')).toHaveText(String(i + 1));
    await expect(row.locator('.rc-number')).toHaveText(number);
    await expect(row.locator('.rc-pts')).toHaveText(String(points));
  }
  await expect(page.locator('[data-rc-standings-body]')).not.toContainText('undefined');
  await expect(rows.nth(1).getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
  await page.locator('.rc-search').fill('JJ');
  await expect(rows).toHaveCount(1); await expect(rows.first().locator('.rc-pts')).toHaveText('234');
  await page.locator('.rc-search').clear();
  await page.locator('.rc-table-shell').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/repaired-standings-mobile.png' });
  expect(errors).toEqual([]);
});

test('a recovered browser draft keeps its points, shows every name, and publishes the repaired standings as Race Control', async ({ page }) => {
  const live = brokenStandings(), saved = structuredClone(live); saved.standings[0].pointsAdjustment += 7;
  await page.addInitScript(saved => { localStorage.setItem('uarl-admin-draft-v1', JSON.stringify(saved)); }, saved);
  const published = await boot(page, live, '/admin/');
  await expect(page.locator('[data-save-status]')).toHaveText('Recovered unpublished browser draft');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  const rows = page.locator('[data-standings-driver]');
  await expect(rows.locator('.driver-with-manufacturer strong')).toContainText(names);
  const lance = page.locator('[data-standings-driver="lancejuly"]');
  await expect(lance.locator('[data-standings-points]')).toHaveValue('288');
  await lance.locator('[data-standings-points]').fill('289'); await lance.locator('[data-save-points]').click();
  await page.locator('[data-action="publish"]').first().click(); await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  for (const [i, [user, , , total]] of baseline.entries()) {
    const savedRow = published[0].standings.find(row => row.username === user);
    expect(savedRow.name).toBe(names[i]); expect(savedRow.pointsAdjustment).toBe(total + (i === 0 ? 8 : 0));
  }
  expect(published[0].drivers.profiles.JJElliott2004.alias).toBe('JJ');
  expect(published[0].drivers.profiles.JamesEklund.alias).toBe('James Eklund');
});
