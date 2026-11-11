import { test, expect } from '@playwright/test';
import { baseline, brokenStandings } from './fixtures/standings-roster.js';

const oldUser = 'JJElliott2004', newUser = 'JamesRacer22';
const publicRows = page => page.locator('[data-rc-standings-body] tr[data-driver-id]');
const jjRow = page => page.locator('[data-rc-standings-body] tr[data-driver-id="' + oldUser + '"]');

function legacy(mode = 'team') {
  const data = brokenStandings();
  delete data.drivers.jjUsernameVersion;
  data.drivers.displayNameVersion = 1;
  data.drivers.profiles[oldUser].alias = 'JJ';
  data.drivers.profiles[oldUser].currentUsername = oldUser;
  data.drivers.profiles[oldUser].signatureImage = '/assets/aetherwing/logo.webp';
  for (const correction of data.standings) {
    correction.name = correction.username === oldUser ? 'JJ' : baseline.find(([user]) => user === correction.username)[1];
  }
  data.drivers.previousRoster.standings = structuredClone(data.standings);
  if (mode === 'team') {
    data.drivers.teams.find(team => team.id === 'whitlock').entries.find(entry => entry.user === oldUser).user = newUser;
  } else if (mode === 'profile') {
    data.drivers.profiles[newUser] = data.drivers.profiles[oldUser];
    delete data.drivers.profiles[oldUser];
  }
  return data;
}

async function boot(page, initial, path = '/race-center/', role = 'owner') {
  let live = initial;
  const published = [];
  await page.context().route('**/.netlify/functions/admin-publish**', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      expect(payload.data).toBeTruthy();
      published.push(payload.data); live = payload.data;
      return route.fulfill({ json: { ok: true, revision: 'username-identity', message: 'Published live' } });
    }
    return route.fulfill({ json: request.url().includes('status=1')
      ? { ready: true, user: { id: 'identity-staff', role, displayName: 'Identity staff' } }
      : { data: live } });
  });
  await page.goto(path);
  return published;
}

async function draft(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('uarl-admin-draft-v1')));
}

async function openJJProfile(page) {
  await page.locator('.admin-sidebar [data-section="profiles"]').click();
  await page.locator('.item-row').filter({ has: page.locator('strong', { hasText: /^JJ$/ }) }).click();
  await page.locator('.editor-steps [data-step="0"]').click();
}

for (const mode of ['team', 'profile']) {
  test(`repairing JJ's ${mode} username edit keeps one standings entry, his points, and each series manufacturer`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const data = legacy(mode), originalJames = structuredClone(data.drivers.profiles.JamesEklund);
    await boot(page, data);
    await expect(jjRow(page)).toHaveCount(1);
    await expect(jjRow(page).locator('.rc-driver-cell strong')).toHaveText('JJ');
    await expect(jjRow(page).locator('.standings-username')).toHaveText('@' + newUser);
    await expect(jjRow(page).locator('.rc-number')).toHaveText('84');
    await expect(jjRow(page).locator('.rc-points-value')).toHaveText('234');
    await expect(jjRow(page).getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
    await expect(page.locator('[data-driver-id="' + newUser + '"]')).toHaveCount(0);
    await expect(page.locator('[data-driver-id="JamesEklund"] .rc-driver-cell strong')).toHaveText('James Eklund');
    await page.locator('.rc-search').fill('@' + newUser);
    await expect(publicRows(page)).toHaveCount(1);
    await expect(jjRow(page).locator('.rc-position-value')).toHaveText('2');
    await page.locator('.rc-search').clear();
    await page.locator('[data-rc-division="open"]').click();
    await expect(jjRow(page)).toHaveCount(1);
    await expect(jjRow(page).locator('.rc-number')).toHaveText('48');
    await expect(jjRow(page).getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toBeVisible();
    const repaired = await page.evaluate(async () => await window.UARLData.load());
    expect(repaired.drivers.profiles.JamesEklund).toEqual(originalJames);
    expect(repaired.drivers.profiles[oldUser].signatureImage).toBe('/assets/aetherwing/logo.webp');
  });
}

test('a recovered broken draft repairs JJ and Race Control can publish a points change without creating another person', async ({ page }) => {
  const live = legacy('team'), saved = structuredClone(live);
  saved.standings.find(row => row.username === oldUser).pointsAdjustment += 6;
  await page.addInitScript(data => localStorage.setItem('uarl-admin-draft-v1', JSON.stringify(data)), saved);
  const published = await boot(page, live, '/admin/', 'race_control');
  await expect(page.locator('[data-save-status]')).toHaveText('Recovered unpublished browser draft');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  const jj = page.locator('[data-standings-driver="' + oldUser + '"]');
  await expect(jj).toHaveCount(1);
  await expect(jj.locator('.standings-username')).toHaveText('@' + newUser);
  await expect(jj.getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
  await expect(jj.locator('[data-standings-points]')).toHaveValue('240');
  await jj.locator('[data-standings-points]').fill('241');
  await jj.locator('[data-save-points]').click();
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.profiles[oldUser].currentUsername).toBe(newUser);
  expect(published[0].drivers.profiles[newUser]).toBeUndefined();
  expect(published[0].standings.find(row => row.username === oldUser).pointsAdjustment).toBe(241);
  await page.goto('/race-center/');
  await expect(jjRow(page).locator('.rc-points-value')).toHaveText('241');
  await expect(jjRow(page).getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
});

test('editing current username and display name keeps the same identity, points and team while rejecting another verified account', async ({ page }) => {
  const data = legacy('unchanged');
  data.standings.find(row => row.username === oldUser).nameManual = false;
  const published = await boot(page, data, '/admin/');
  await openJJProfile(page);
  await expect(page.locator('[data-field="username"]')).toHaveValue(oldUser);
  await expect(page.locator('[data-field="username"]')).not.toBeEditable();
  const current = page.locator('[data-field="currentUsername"]');
  await expect(current).toHaveValue(newUser);
  await current.fill('JJNextAccount');
  await current.press('Tab');
  await expect.poll(async () => (await draft(page)).drivers.profiles[oldUser].currentUsername).toBe('JJNextAccount');
  let changed = await draft(page);
  expect(changed.drivers.profiles[oldUser].usernameAliases.map(value => value.toLowerCase())).toContain(newUser.toLowerCase());
  expect(changed.drivers.profiles.JJNextAccount).toBeUndefined();
  await page.locator('[data-field="alias"]').fill('JJ Updated');
  await page.locator('[data-field="alias"]').press('Tab');
  const james = structuredClone((await draft(page)).drivers.profiles.JamesEklund);
  await current.fill('JamesEklund');
  await current.press('Tab');
  changed = await draft(page);
  expect(changed.drivers.profiles[oldUser].currentUsername).toBe('JJNextAccount');
  expect(changed.drivers.profiles.JamesEklund).toEqual(james);
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  await page.goto('/race-center/');
  await expect(jjRow(page).locator('.rc-driver-cell strong')).toHaveText('JJ Updated');
  await expect(jjRow(page).locator('.standings-username')).toHaveText('@JJNextAccount');
  await expect(jjRow(page).locator('.rc-points-value')).toHaveText('234');
  await expect(jjRow(page).getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
  await expect(page.locator('[data-driver-id="JJNextAccount"]')).toHaveCount(0);
});

for (const width of [1280, 390]) test(`an assigned roster account opens the same profile for safe identity edits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await boot(page, legacy('team'), '/admin/');
  if (width < 760) {
    await page.locator('[data-admin-more]').click();
    await page.locator('[data-admin-menu-items] [data-section="teams"]').click();
    await page.locator('.item-picker > summary').click();
  }
  else await page.locator('.admin-sidebar [data-section="teams"]').click();
  await page.locator('.item-row').filter({ has: page.locator('strong', { hasText: /^Goat Whitlock Motorsports$/ }) }).click();
  await page.locator('.editor-steps [data-step="2"]').click();
  const card = page.locator('.entry-card').filter({ has: page.locator('input[data-sfield="entries"][data-skey="number"][value="84"]') });
  await card.locator('summary').first().click();
  await expect(card.locator('input[data-sfield="entries"][data-skey="user"]')).not.toBeEditable();
  const shortcut = card.getByRole('button', { name: 'Edit name or username', exact: true });
  expect(await shortcut.evaluate(node => node.getBoundingClientRect().right <= node.parentElement.getBoundingClientRect().right + 1)).toBe(true);
  await shortcut.click();
  await expect(page.locator('[data-field="username"]')).toHaveValue(oldUser);
  await expect(page.locator('[data-field="username"]')).not.toBeEditable();
  await expect(page.locator('[data-field="currentUsername"]')).toHaveValue(newUser);
});

test('clearing a new account field while typing does not delete or shift any existing profile', async ({ page }) => {
  await boot(page, legacy('unchanged'), '/admin/');
  await page.locator('.admin-sidebar [data-section="profiles"]').click();
  await page.locator('.list-tools [data-action="add"]').click();
  const initial = await draft(page), keys = Object.keys(initial.drivers.profiles);
  const placeholder = keys.find(key => /^new_driver_\d+$/.test(key));
  expect(placeholder).toBeTruthy();
  const username = page.locator('[data-field="username"]');
  await expect(username).toBeEditable();
  await username.fill('');
  let value = await draft(page);
  expect(Object.keys(value.drivers.profiles)).toEqual(keys);
  expect(value.drivers.profiles[oldUser].alias).toBe('JJ');
  await username.fill('FreshDriver22');
  await username.press('Tab');
  await expect.poll(async () => Boolean((await draft(page)).drivers.profiles.FreshDriver22)).toBe(true);
  value = await draft(page);
  expect(Object.keys(value.drivers.profiles)).toHaveLength(keys.length);
  expect(value.drivers.profiles[placeholder]).toBeUndefined();
  expect(value.drivers.profiles[oldUser].alias).toBe('JJ');
  expect(value.drivers.profiles.JamesEklund.alias).toBe('James Eklund');
});
