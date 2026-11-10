import { test, expect } from '@playwright/test';
import { baseline, brokenStandings } from './fixtures/standings-roster.js';

const row = (page, user) => page.locator('[data-rc-standings-body] tr[data-driver-id="' + user + '"]');
const desktopCutoff = (page, user) => row(page, user).locator('.rc-cutoff-value');

async function boot(page, fixture = brokenStandings()) {
  let data = fixture;
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
  await page.goto('/race-center/');
  await expect(row(page, 'lancejuly').locator('.rc-driver-cell strong')).toHaveText('Lance');
  return async replacement => {
    data = replacement;
    await page.reload();
    await expect(row(page, 'lancejuly').locator('.rc-driver-cell strong')).toHaveText('Lance');
  };
}

test('Cup cutoff margins compare the top ten with P11 and the remaining drivers with P10', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await expect(page.locator('.rc-cutoff-heading')).toBeVisible();
  for (const [user, margin] of [['lancejuly', '+213'], ['58bbwapache', '+8'], ['Frogboy4783', '-8'], ['AnyGameAnyTime09', '-71']]) {
    await expect(desktopCutoff(page, user)).toBeVisible();
    await expect(desktopCutoff(page, user)).toHaveText(margin);
  }
  await expect(desktopCutoff(page, '58bbwapache')).toHaveAttribute('aria-label', '8 points ahead of P11 at the Chase cutoff');
  await expect(desktopCutoff(page, 'Frogboy4783')).toHaveAttribute('aria-label', '8 points behind P10 at the Chase cutoff');
  await expect(desktopCutoff(page, '58bbwapache')).toHaveCSS('color', 'rgb(74, 222, 128)');
  await expect(desktopCutoff(page, 'Frogboy4783')).toHaveCSS('color', 'rgb(248, 113, 113)');
  await expect(row(page, '58bbwapache').locator('.rc-gap')).toHaveText('-205');
  await expect(row(page, 'Frogboy4783').locator('.rc-gap')).toHaveText('-213');
  await expect(row(page, 'pa05').locator('.rc-number')).toHaveText('05');
  await expect(row(page, '58bbwapache').locator('.rc-points-value')).toHaveText('76');
  await expect(row(page, 'Frogboy4783').locator('.rc-points-value')).toHaveText('68');
});

test('search keeps the full cutoff references and corrected totals select the new P10 and P11', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const reload = await boot(page);
  await page.locator('.rc-search').fill('Frog');
  await expect(page.locator('[data-rc-standings-body] tr[data-driver-id]')).toHaveCount(1);
  await expect(desktopCutoff(page, 'Frogboy4783')).toHaveText('-8');
  await page.locator('.rc-search').fill('Dale');
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('+8');

  const corrected = brokenStandings();
  corrected.standings.find(entry => entry.username === 'Frogboy4783').pointsAdjustment = 100;
  await reload(corrected);
  await expect(row(page, 'Aokikoto').locator('.rc-position-value')).toHaveText('10');
  await expect(row(page, '58bbwapache').locator('.rc-position-value')).toHaveText('11');
  await expect(desktopCutoff(page, 'Aokikoto')).toHaveText('+7');
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('-7');
  expect(await page.locator('.rc-chase-cutoff').evaluate(separator => ({
    above: separator.previousElementSibling.dataset.driverId,
    below: separator.nextElementSibling.dataset.driverId
  }))).toEqual({ above: 'Aokikoto', below: '58bbwapache' });
});

test('cutoff ties show zero while pending audits and unstarted standings show unavailable margins', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tied = brokenStandings();
  tied.standings.find(entry => entry.username === 'Frogboy4783').pointsAdjustment = 76;
  const reload = await boot(page, tied);
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('+0');
  await expect(desktopCutoff(page, 'Frogboy4783')).toHaveText('0');

  const pending = brokenStandings();
  pending.records = [{
    id: 'cutoff-pending', division: 'd1', event: 'Pending audit', round: 1, date: '2026-11-10',
    finishes: [{ username: 'lancejuly', name: 'Lance', number: '88', position: 1, points: 0, pointsPending: true }]
  }];
  await reload(pending);
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('—');
  await expect(desktopCutoff(page, 'Frogboy4783')).toHaveText('—');

  const preseason = brokenStandings();
  delete preseason.standings;
  await reload(preseason);
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('—');
});

test('a board without P11 leaves cutoff margins unavailable and other series omit them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const reload = await boot(page);
  for (const division of ['open', 'd2']) {
    await page.locator('[data-rc-division="' + division + '"]').click();
    await expect(page.locator('.rc-cutoff-heading')).toBeHidden();
    await expect(page.locator('.rc-standings-table .rc-cutoff-value')).toHaveCount(0);
    await expect(page.locator('.rc-standings-table .rc-mobile-cutoff')).toHaveCount(0);
  }

  const small = brokenStandings();
  small.standings = small.standings.slice(0, 10);
  small.drivers.teams = [{ id: 'cutoff-small-grid', name: 'Small Grid', make: 'Toyota', entries: baseline.slice(0, 10).map(([user, name, number]) => ({ user, name, number, status: 'Full-Time' })) }];
  small.drivers.profiles = {};
  small.drivers.freeAgents = [];
  small.drivers.openEntries = [];
  delete small.drivers.previousRoster;
  await reload(small);
  await expect(page.locator('[data-rc-standings-body] tr[data-driver-id]')).toHaveCount(10);
  await expect(desktopCutoff(page, '58bbwapache')).toHaveText('—');
});

for (const width of [320, 390]) {
  test(`mobile standings retain the leader gap and signed cutoff margin at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await boot(page);
    for (const [user, margin, leaderGap] of [['58bbwapache', '+8', '-205'], ['Frogboy4783', '-8', '-213']]) {
      const entry = row(page, user);
      await expect(entry.locator('.rc-mobile-cutoff')).toBeVisible();
      await expect(entry.locator('.rc-mobile-cutoff')).toHaveText(margin);
      await expect(entry.locator('.rc-mobile-gap')).toBeVisible();
      await expect(entry.locator('.rc-mobile-gap')).toHaveText(leaderGap);
      await expect(entry.locator('td.rc-cutoff')).toBeHidden();
    }
    await expect(row(page, '58bbwapache').locator('.rc-mobile-cutoff')).toHaveCSS('color', 'rgb(74, 222, 128)');
    await expect(row(page, 'Frogboy4783').locator('.rc-mobile-cutoff')).toHaveCSS('color', 'rgb(248, 113, 113)');
    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.rc-table-shell');
      return { page: document.documentElement.scrollWidth, viewport: innerWidth, table: shell.scrollWidth, available: shell.clientWidth };
    });
    expect(layout.page).toBeLessThanOrEqual(layout.viewport);
    expect(layout.table).toBeLessThanOrEqual(layout.available + 1);
    if (width === 390) {
      for (const image of await page.locator('.rc-standings-table .manufacturer-badge img').all()) {
        await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await image.evaluate(img => img.decode());
      }
      await page.locator('.rc-chase-cutoff').evaluate(separator => window.scrollTo({
        top: separator.getBoundingClientRect().top + scrollY - 430, behavior: 'instant'
      }));
      await page.screenshot({ path: 'test-results/standings-cutoff-mobile.png' });
    }
  });
}
