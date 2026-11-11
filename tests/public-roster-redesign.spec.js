import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const currentUsername = 'RosterPayson22';
const teams = page => page.locator('[data-team-grid] .pp-team-stage');
const avery = page => teams(page).filter({ has: page.locator('h3', { hasText: /^Avery Motorsports$/ }) });
const driverCards = page => page.locator('[data-driver-grid] .pp-driver');
const driverCard = (page, user) => driverCards(page).filter({ has: page.locator('[data-driver="' + user + '"]') });

async function boot(page, path = '/drivers/', configure) {
  const fixture = structuredClone(original);
  fixture.drivers.profiles.pa05.currentUsername = currentUsername;
  if (configure) configure(fixture);
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data: fixture } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(teams(page)).toHaveCount(fixture.drivers.teams.length);
  return fixture;
}

test('team lineups arrange drivers horizontally without extra team buttons or page overflow', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-team]')).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const firstRow = teams(page).first().locator('.pp-stage-entry').first();
    await expect(firstRow).toBeVisible();
    expect((await firstRow.boundingBox()).y).toBeLessThan(820);
    if (width === 390) {
      const rowBounds = await firstRow.boundingBox();
      const navBounds = await page.locator('.uarl-bottom-nav').boundingBox();
      expect(navBounds).not.toBeNull();
      expect(rowBounds.y + rowBounds.height).toBeLessThanOrEqual(navBounds.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const positions = await teams(page).evaluateAll(nodes => nodes.slice(0, 2).map(node => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, bottom: bounds.bottom };
    }));
    expect(Math.abs(positions[1].x - positions[0].x)).toBeLessThan(2);
    expect(positions[1].y).toBeGreaterThanOrEqual(positions[0].bottom);
    const lineup = teams(page).first().locator('.pp-stage-entry');
    const first = await lineup.nth(0).boundingBox(), second = await lineup.nth(1).boundingBox();
    expect(second.x).toBeGreaterThan(first.x);
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    const number = await lineup.first().locator('.pp-stage-number').boundingBox();
    const person = await lineup.first().locator('.pp-stage-person').boundingBox();
    expect(person.y).toBeGreaterThanOrEqual(number.y + number.height);
    if (width === 390 || width === 1440) await page.screenshot({ path: 'test-results/roster-redesign-' + width + '.png' });
  }
  for (const team of await teams(page).all()) {
    await expect(team.locator('.pp-stage-meta .pp-mfg-logo')).toHaveCount(1);
    await expect(team.locator('.pp-stage-entry .pp-mfg-logo')).toHaveCount(0);
  }
  await expect(page.locator('[data-livewire]')).not.toHaveAttribute('open', '');
});

test('current usernames, manufacturer filters, result counts and resets work together without editing roster data', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(async () => JSON.stringify(await window.UARLData.load()));
  const search = page.locator('.pp-search');
  await search.fill(currentUsername);
  await expect(teams(page)).toHaveCount(1);
  await expect(avery(page)).toBeVisible();
  await expect(page.locator('[data-result-count]')).toContainText(/\b1\b/);
  await page.locator('.pp-filter[data-make="Toyota"]').click();
  await expect(page.locator('.pp-filter[data-make="Toyota"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(teams(page)).toHaveCount(0);
  await expect(page.locator('[data-empty-teams]')).toBeVisible();
  await expect(page.locator('[data-result-count]')).toContainText(/\b0\b/);
  await page.locator('[data-reset-filters]').click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.pp-filter[data-make="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(teams(page)).toHaveCount(original.drivers.teams.length);
  await page.locator('[data-view="drivers"]').click();
  await search.fill(currentUsername);
  await expect(driverCards(page)).toHaveCount(1);
  await expect(driverCard(page, 'pa05').locator('.user')).toHaveText('@' + currentUsername);
  await page.locator('[data-clear-search]').click();
  await expect(search).toHaveValue('');
  await expect(driverCards(page)).toHaveCount(21);
  const after = await page.evaluate(async () => JSON.stringify(await window.UARLData.load()));
  expect(after).toBe(before);
});

test('grouped-driver controls open profiles by keyboard and dialogs contain focus until dismissed', async ({ page }) => {
  await boot(page);
  const profileButton = avery(page).locator('.pp-stage-entry-link[data-driver="pa05"]');
  await expect(profileButton).toHaveAttribute('data-number', '05');
  await expect(avery(page).locator('.pp-stage-entry-link[data-driver="Frogboy4783"]')).toHaveAttribute('data-number', '5');
  await profileButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#pp-dialog-title')).toHaveText('Payson');
  await expect(page.locator('.pp-profile-user')).toHaveText('@' + currentUsername);
  await expect(page.locator('.pp-profile-number')).toHaveText('#05');
  expect(await page.locator('.pp-search').evaluate(node => Boolean(node.closest('[inert]')))).toBe(true);
  const controls = await dialog.locator('button, a[href], input, select, textarea, [tabindex="0"]').count();
  for (let i = 0; i < controls + 1; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(profileButton).toBeFocused();
  expect(await page.locator('.pp-search').evaluate(node => Boolean(node.closest('[inert]')))).toBe(false);
});

test('mobile dialogs stay above site navigation and their visible close control remains clickable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await boot(page);
  const trigger = teams(page).first().locator('.pp-stage-entry-link').first();
  await trigger.click();
  const modal = page.locator('[data-modal]');
  await expect(modal).toBeVisible();
  expect(await modal.evaluate(node => node.matches(':modal'))).toBe(true);
  const close = modal.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeVisible();
  const metrics = await close.evaluate(button => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return {
      withinViewport: bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= innerHeight && bounds.right <= innerWidth,
      receivesPointer: Boolean(hit && (hit === button || button.contains(hit)))
    };
  });
  expect(metrics).toEqual({ withinViewport: true, receivesPointer: true });
  await page.screenshot({ path: 'test-results/roster-dialog-mobile.png' });
  await close.click();
  await expect(modal).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('a pending driver without a number flag opens one usable profile from grouped and individual roster views', async ({ page }) => {
  const user = 'PendingRoster22';
  await boot(page, '/drivers/', fixture => {
    const team = fixture.drivers.teams[0];
    team.pendingDrivers = (team.pendingDrivers || []).concat({ user, name: 'Pending Driver', status: 'Signed' });
  });
  await teams(page).first().locator('.pp-stage-entry-link[data-driver="' + user + '"]').click();
  const dialog = page.getByRole('dialog');
  async function expectPendingProfile() {
    await expect(dialog).toBeVisible();
    await expect(page.locator('#pp-dialog-title')).toHaveText('Pending Driver');
    await expect(page.locator('.pp-profile-user')).toHaveText('@' + user);
    await expect(page.locator('.pp-driver-profile')).toHaveClass(/no-number/);
    await expect(dialog.locator('.pp-profile-number, .pp-upload-number-profile, .pp-aem-num-profile, .pp-number-text-profile')).toHaveCount(0);
    await expect(dialog).not.toContainText('undefined');
  }
  await expectPendingProfile();
  await page.keyboard.press('Escape');
  await page.locator('[data-view="drivers"]').click();
  const card = driverCard(page, user);
  await expect(card).toHaveCount(1);
  await expect(card.locator('.pp-driver-number.pending')).toHaveText('Number pending');
  await card.locator('[data-driver]').click();
  await expectPendingProfile();
});

test('view tabs expose their selected panel and support standard keyboard navigation', async ({ page }) => {
  await boot(page);
  const tabs = page.locator('.pp-tabs [role="tab"]');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-view="drivers"]')).toBeFocused();
  await expect(page.locator('[data-view="drivers"]')).toHaveAttribute('aria-selected', 'true');
  const panelId = await page.locator('[data-view="drivers"]').getAttribute('aria-controls');
  await expect(page.locator('#' + panelId)).toHaveAttribute('role', 'tabpanel');
  await expect(page.locator('#' + panelId)).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('[data-view="open"]')).toBeFocused();
  await expect(page.locator('[data-panel="open"]')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-view="freeagents"]')).toBeFocused();
  await expect(page.locator('[data-panel="freeagents"]')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(page.locator('[data-panel="teams"]')).toBeVisible();
});

test('existing team links still open the right organization and preserve separate leading-zero car numbers', async ({ page }) => {
  await boot(page, '/drivers/?team=avery');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#pp-dialog-title')).toHaveText('Avery Motorsports');
  const entries = page.locator('.pp-dialog-entry');
  await expect(entries.filter({ hasText: '@' + currentUsername }).locator('.num')).toHaveText('#05');
  await expect(entries.filter({ hasText: '@frogboy4783' }).locator('.num')).toHaveText('#5');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(teams(page)).toHaveCount(original.drivers.teams.length);
});
