import { test, expect } from '@playwright/test';
import { baseline, brokenStandings } from './fixtures/standings-roster.js';

const rowSelector = '[data-rc-standings-body] tr[data-driver-id]';
const expectedDrivers = baseline.map(([id, name, number, points], index) => ({
  id, name: id === 'JJElliott2004' ? 'JJ' : name, number,
  position: String(index + 1), points: String(points)
}));

async function columnSizes(page) {
  return page.locator('.rc-standings-table th').evaluateAll(headers => headers.map(header => {
    const rect = header.getBoundingClientRect();
    return { x: rect.x, width: rect.width };
  }));
}

async function expectNoOverflow(page) {
  const sizes = await page.evaluate(() => {
    const shell = document.querySelector('.rc-table-shell');
    return {
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      table: shell.scrollWidth,
      available: shell.clientWidth
    };
  });
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.table).toBeLessThanOrEqual(sizes.available + 1);
}

for (const width of [320, 390, 541, 720, 721, 1440, 1920]) {
  test(`standings retain their data and aligned columns at ${width}px`, async ({ page }) => {
    let data = brokenStandings();
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
    await page.goto('/race-center/');
    const rows = page.locator(rowSelector);
    await expect(rows.first().locator('.rc-driver-cell strong')).toHaveText('Lance');
    await expect(page.locator('.rc-standings-table th')).toHaveText(['Position', 'Change', 'Driver#', 'DriverName', 'Points', 'Behind']);
    const drivers = await rows.evaluateAll(entries => entries.slice(0, 17).map(row => ({
      id: row.dataset.driverId,
      name: row.querySelector('.rc-driver-cell strong').textContent.trim(),
      number: row.querySelector('.rc-number').textContent.trim(),
      position: row.querySelector('.rc-position-value').textContent.trim(),
      points: row.querySelector('.rc-points-value').textContent.trim()
    })));
    expect(drivers).toEqual(expectedDrivers);

    const geometry = await rows.evaluateAll(entries => entries.map(row => {
      const badge = row.querySelector('.manufacturer-badge').getBoundingClientRect();
      return { height: row.getBoundingClientRect().height, badgeCenter: badge.x + badge.width / 2 };
    }));
    expect(Math.min(...geometry.map(row => row.height))).toBeGreaterThanOrEqual(60);
    const centers = geometry.map(row => row.badgeCenter);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    const nameWidth = await rows.first().locator('.rc-driver-cell strong').evaluate(name => name.clientWidth);
    expect(nameWidth).toBeGreaterThanOrEqual(64);
    const toyota = await page.locator('.rc-standings-table .manufacturer-badge--toyota').first().boundingBox();
    expect(toyota.width).toBe(toyota.height);
    await expectNoOverflow(page);
    if (width > 720) {
      const layout = await page.locator('.rc-table-shell').evaluate(shell => {
        const rect = shell.getBoundingClientRect();
        const panel = shell.closest('[data-rc-panel="standings"]').getBoundingClientRect();
        const tools = document.querySelector('.rc-standings-tools').getBoundingClientRect();
        return { width: rect.width, tableCenter: rect.x + rect.width / 2, panelCenter: panel.x + panel.width / 2, toolsLeft: tools.x, tableLeft: rect.x, toolsWidth: tools.width };
      });
      expect(layout.width).toBeLessThanOrEqual(1152);
      if (width >= 1440) expect(layout.width).toBeGreaterThan(1000);
      expect(Math.abs(layout.tableCenter - layout.panelCenter)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.toolsLeft - layout.tableLeft)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.toolsWidth - layout.width)).toBeLessThanOrEqual(1);
    }

    const beforeSearch = await columnSizes(page);
    await page.locator('.rc-search').fill('JJ');
    await expect(rows).toHaveCount(1);
    const afterSearch = await columnSizes(page);
    for (const [index, column] of beforeSearch.entries()) {
      expect(Math.abs(afterSearch[index].x - column.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterSearch[index].width - column.width)).toBeLessThanOrEqual(1);
    }
    await page.locator('.rc-search').clear();
    await expect(rows.first().locator('.rc-driver-cell strong')).toHaveText('Lance');
    if (width === 390 || width === 1440 || width === 1920) {
      for (const image of await page.locator('.rc-standings-table .manufacturer-badge img').all()) {
        await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      await page.locator('.rc-table-shell').evaluate(shell => window.scrollTo({
        top: Math.max(0, shell.getBoundingClientRect().top + scrollY - 220), behavior: 'instant'
      }));
      await expect.poll(() => page.locator('.rc-table-shell').evaluate(shell => Math.abs(shell.getBoundingClientRect().top - 220))).toBeLessThan(5);
      await page.screenshot({ path: `test-results/standings-layout-${width}.png` });
      if (width === 390 || width === 1920) {
        await page.locator('.rc-chase-cutoff').evaluate(divider => window.scrollTo({
          top: divider.getBoundingClientRect().top + scrollY - 450, behavior: 'instant'
        }));
        await page.screenshot({ path: `test-results/standings-chase-cutoff-${width}.png` });
      }
    }

    data = brokenStandings();
    const longName = 'LongUnbrokenDriverName'.repeat(8);
    data.standings[0].name = longName;
    data.standings[0].number = '00000005';
    await page.reload();
    const leader = rows.first();
    await expect(leader.locator('.rc-driver-cell strong')).toHaveText(longName);
    await expect(leader.locator('.rc-number')).toHaveText('00000005');
    const nameSize = await leader.locator('.rc-driver-cell strong').evaluate(name => ({
      height: name.getBoundingClientRect().height,
      fontSize: parseFloat(getComputedStyle(name).fontSize),
      content: name.scrollWidth,
      available: name.clientWidth
    }));
    expect(nameSize.height).toBeGreaterThan(nameSize.fontSize * 1.5);
    expect(nameSize.content).toBeLessThanOrEqual(nameSize.available + 1);
    await expectNoOverflow(page);
  });
}
