import { test, expect } from '@playwright/test';
import { baseline, brokenStandings } from './fixtures/standings-roster.js';

const row = (page, id) => page.locator('[data-rc-standings-body] tr[data-driver-id="' + id + '"]');
const drivers = page => page.locator('[data-rc-standings-body] tr[data-driver-id]');
const desktopGap = (page, id) => row(page, id).locator('td.rc-gap');

async function boot(page, fixture = brokenStandings()) {
  let data = fixture;
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
  await page.goto('/race-center/');
  await expect(row(page, 'lancejuly').locator('.rc-driver-cell strong')).toHaveText('Lance');
  return async replacement => {
    data = replacement;
    await page.reload();
    await expect(drivers(page).first()).toBeVisible();
  };
}

test('gaps use the complete corrected points board while searching and after totals change', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const reload = await boot(page);
  await expect(page.locator('.rc-standings-table th')).toHaveText(['Position', 'Change', 'Driver#', 'DriverName', 'Points', 'Behind', 'Cutoff']);
  for (const [index, [id, , , points]] of baseline.entries()) {
    await expect(desktopGap(page, id)).toHaveText(index === 0 ? 'Leader' : '-' + (281 - points));
  }
  await page.locator('.rc-search').fill('JJ');
  await expect(drivers(page)).toHaveCount(1);
  await expect(desktopGap(page, 'JJElliott2004')).toHaveText('-47');
  const corrected = brokenStandings();
  corrected.standings[1].pointsAdjustment = 300;
  await reload(corrected);
  await expect(desktopGap(page, 'JJElliott2004')).toHaveText('Leader');
  await expect(desktopGap(page, 'lancejuly')).toHaveText('-19');
  await expect(row(page, 'pa05').locator('.rc-number')).toHaveText('05');
});

test('a tied driver has zero gap and pending points do not claim an exact deficit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tied = brokenStandings();
  tied.standings[1].pointsAdjustment = 281;
  const reload = await boot(page, tied);
  await expect(desktopGap(page, 'lancejuly')).toHaveText('Leader');
  await expect(desktopGap(page, 'JJElliott2004')).toHaveText('0');
  const pending = brokenStandings();
  pending.records = [{
    id: 'pending-gap', division: 'd1', event: 'Pending points', track: 'Test Oval', round: 1,
    date: '2026-11-08', start: '2026-11-08T20:00:00Z', pointsEvent: true,
    finishes: [{ username: 'lancejuly', name: 'Lance', number: '88', position: 1, points: 0, pointsPending: true }]
  }];
  await reload(pending);
  await expect(desktopGap(page, 'lancejuly')).toHaveText('—');
  await expect(desktopGap(page, 'JJElliott2004')).toHaveText('—');
});

test('the Chase boundary separates the actual P10 and P11 and is not a filtered-row count', async ({ page }) => {
  const reload = await boot(page);
  const separator = page.locator('.rc-chase-cutoff');
  await expect(separator).toHaveCount(1);
  await expect(separator).toContainText('Chase cutoff');
  await expect(separator.locator('td')).toHaveAttribute('colspan', '7');
  expect(await separator.evaluate(node => ({
    before: node.previousElementSibling.dataset.driverId,
    after: node.nextElementSibling.dataset.driverId
  }))).toEqual({ before: baseline[9][0], after: baseline[10][0] });

  await page.locator('.rc-search').fill('JJ');
  await expect(separator).toHaveCount(0);
  const filtered = brokenStandings();
  filtered.drivers.displayNameVersion = 1;
  filtered.standings.forEach((entry, index) => {
    if (index !== 9 && index !== 10) entry.name = 'Filtered Driver ' + index;
  });
  await reload(filtered);
  await page.locator('.rc-search').fill('Filtered Driver');
  await expect(drivers(page)).toHaveCount(15);
  await expect(separator).toHaveCount(0);
});

test('Open, archived D2, preseason, and a grid without P11 do not get a Chase cutoff', async ({ page }) => {
  const reload = await boot(page);
  for (const division of ['open', 'd2']) {
    await page.locator('[data-rc-division="' + division + '"]').click();
    await expect(page.locator('.rc-chase-cutoff')).toHaveCount(0);
  }
  const preseason = brokenStandings();
  delete preseason.standings;
  await reload(preseason);
  await expect(page.locator('.rc-chase-cutoff')).toHaveCount(0);
  await expect(desktopGap(page, 'lancejuly')).toHaveText('—');
  const exhibitionOnly = structuredClone(preseason);
  exhibitionOnly.records = [{ id: 'gap-exhibition', division: 'd1', event: 'Exhibition', exhibition: true, date: '2026-11-10', finishes: [] }];
  await reload(exhibitionOnly);
  await expect(page.locator('.rc-chase-cutoff')).toHaveCount(0);
  await expect(desktopGap(page, 'lancejuly')).toHaveText('—');

  const small = brokenStandings();
  small.standings = small.standings.slice(0, 10);
  small.drivers.teams = [{ id: 'small-grid', name: 'Small Grid', make: 'Toyota', entries: baseline.slice(0, 10).map(([user, name, number]) => ({ user, name, number, status: 'Full-Time' })) }];
  small.drivers.profiles = {};
  small.drivers.freeAgents = [];
  small.drivers.openEntries = [];
  delete small.drivers.previousRoster;
  await reload(small);
  await expect(drivers(page)).toHaveCount(10);
  await expect(page.locator('.rc-chase-cutoff')).toHaveCount(0);
});

test('the cutoff spans only visible columns when resizing between desktop and mobile', async ({ page }) => {
  await boot(page);
  for (const width of [1440, 390, 721, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.rc-chase-cutoff td')).toHaveAttribute('colspan', width <= 720 ? '4' : '7');
    const nameWidth = await row(page, 'lancejuly').locator('.rc-driver-cell strong').evaluate(name => name.clientWidth);
    expect(nameWidth).toBeGreaterThanOrEqual(64);
  }
});

for (const width of [320, 390]) {
  test(`mobile standings show movement and points gaps together without horizontal scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const data = brokenStandings();
    data.standings[0].previousPosition = 3;
    data.standings[1].previousPosition = 1;
    await boot(page, data);
    await expect(row(page, 'lancejuly').locator('.rc-mobile-movement').getByRole('img', { name: 'Up 2 positions' })).toBeVisible();
    await expect(row(page, 'JJElliott2004').locator('.rc-mobile-movement').getByRole('img', { name: 'Down 1 position' })).toBeVisible();
    await expect(row(page, 'lancejuly').locator('.rc-mobile-gap')).toBeVisible();
    await expect(row(page, 'lancejuly').locator('.rc-mobile-gap')).toHaveText('Leader');
    await expect(row(page, 'JJElliott2004').locator('.rc-mobile-gap')).toBeVisible();
    await expect(row(page, 'JJElliott2004').locator('.rc-mobile-gap')).toHaveText('-47');
    await expect(row(page, 'JJElliott2004').locator('td.rc-gap')).toBeHidden();
    const size = await page.evaluate(() => {
      const shell = document.querySelector('.rc-table-shell');
      return { page: document.documentElement.scrollWidth, viewport: innerWidth, table: shell.scrollWidth, available: shell.clientWidth };
    });
    expect(size.page).toBeLessThanOrEqual(size.viewport);
    expect(size.table).toBeLessThanOrEqual(size.available + 1);
    await expect(page.locator('.rc-chase-cutoff')).toBeVisible();
  });
}
