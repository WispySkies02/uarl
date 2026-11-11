import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const user = 'Raceartstudios';
const key = value => String(value || '').replace(/^@/, '').toLowerCase();

function oldPublishedData() {
  const data = structuredClone(original);
  delete data.drivers.aetherwingReturnVersion;
  data.drivers.teams = data.drivers.teams.filter(team => team.id !== 'aetherwing');
  for (const profile of Object.keys(data.drivers.profiles)) {
    if (key(profile) === key(user)) delete data.drivers.profiles[profile];
  }
  data.race.drivers = data.race.drivers.filter(driver => key(driver.id) !== key(user));
  data.records = [];
  data.standings = [{
    id: 'd1:lancejuly', division: 'd1', username: 'lancejuly', name: 'Lance', number: '88',
    nameManual: true, numberManual: true, pointsAdjustment: 281, previousPosition: null,
    order: 1, orderManual: true
  }];
  return data;
}

async function boot(page, initial = oldPublishedData(), path = '/drivers/') {
  let live = initial;
  const published = [];
  await page.context().route('**/.netlify/functions/admin-publish**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      expect(payload.data).toBeTruthy();
      published.push(payload.data); live = payload.data;
      return route.fulfill({ json: { ok: true, revision: 'aetherwing-return', message: 'Published live' } });
    }
    return route.fulfill({ json: request.url().includes('status=1')
      ? { ready: true, user: { id: 'aetherwing-owner', role: 'owner', displayName: 'Owner' } }
      : { data: live } });
  });
  await page.goto(path);
  return { published, replace(data) { live = data; } };
}

const teamStage = page => page.locator('[data-team-grid] .pp-team-stage').filter({
  has: page.locator('h3', { hasText: /^Aetherwing eMotorsports$/ })
});

test('old published data gains the returning Chevrolet team, Will in 33, and two open seats on phone and desktop', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, oldPublishedData(), '/drivers/?team=aetherwing');
  await expect(page.locator('#pp-dialog-title')).toHaveText('Aetherwing eMotorsports');
  await expect(page.locator('.pp-team-meta').getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  await expect(page.locator('.pp-dialog-entry')).toHaveCount(3);
  const will = page.locator('.pp-dialog-entry').filter({ hasText: '@Raceartstudios' });
  await expect(will).toContainText('Will');
  await expect(will).toContainText('#33');
  for (const number of ['42', '43']) {
    const vacant = page.locator('.pp-dialog-entry').filter({ hasText: '#' + number });
    await expect(vacant).toContainText('OPEN');
    await expect(vacant).not.toContainText('@');
  }
  await page.keyboard.press('Escape');
  const team = teamStage(page);
  await expect(team).toHaveCount(1);
  await expect(team.locator('.pp-stage-entry')).toHaveCount(3);
  await expect(team.locator('.pp-stage-entry.is-open')).toHaveCount(2);
  await expect(team.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  await expect(team.locator('.pp-stage-person small')).toHaveText([user]);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await team.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) {
      for (const image of await team.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(image => image.decode());
      }
      await team.screenshot({ path: 'test-results/aetherwing-return-' + width + '.png' });
    }
  }
  await page.locator('[data-view="drivers"]').click();
  const driver = page.locator('[data-driver-grid] .pp-driver').filter({ has: page.locator('[data-driver="Raceartstudios"]') });
  await expect(driver).toHaveCount(1);
  await expect(driver.locator('h3')).toHaveText('Will');
  await expect(driver.locator('.pp-number-text')).toHaveText('#33');
  await expect(driver.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a recovered draft adds Aetherwing without losing saved points, artwork, or unrelated roster edits', async ({ page }) => {
  const live = oldPublishedData(), saved = structuredClone(live);
  saved.standings[0].pointsAdjustment += 7;
  saved.drivers.teams.find(team => team.id === 'sham').note = 'Saved custom team note';
  saved.drivers.profiles.Aokikoto.signatureImage = '/saved-signature.png';
  await page.addInitScript(saved => localStorage.setItem('uarl-admin-draft-v1', JSON.stringify(saved)), saved);
  const { published } = await boot(page, live, '/admin/');
  await expect(page.locator('[data-save-status]')).toHaveText('Recovered unpublished browser draft');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  await expect(page.locator('[data-standings-driver="lancejuly"] [data-standings-points]')).toHaveValue('288');
  await expect(page.locator('[data-standings-driver="Raceartstudios"] [data-standings-points]')).toHaveValue('0');
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  const result = published[0];
  expect(result.drivers.aetherwingReturnVersion).toBe(1);
  expect(result.drivers.assignmentVersion).toBe(saved.drivers.assignmentVersion);
  expect(result.drivers.previousRoster).toEqual(saved.drivers.previousRoster);
  expect(result.drivers.teams.filter(team => team.id !== 'aetherwing')).toEqual(saved.drivers.teams);
  expect(result.drivers.profiles.Aokikoto.signatureImage).toBe('/saved-signature.png');
  expect(result.standings.map(({ username, number, pointsAdjustment, order }) => ({ username, number, pointsAdjustment, order })))
    .toEqual(saved.standings.map(({ username, number, pointsAdjustment, order }) => ({ username, number, pointsAdjustment, order })));
  const returned = result.drivers.teams.filter(team => team.id === 'aetherwing');
  expect(returned).toHaveLength(1);
  expect(returned[0].make).toBe('Chevrolet');
  expect(returned[0].entries.filter(entry => entry.user).map(entry => [entry.user, entry.number])).toEqual([[user, '33']]);
});

test('Will appears once in zero-point standings and matches result CSV names without creating drivers from open seats', async ({ page }) => {
  await boot(page, oldPublishedData(), '/race-center/');
  const will = page.locator('[data-rc-standings-body] tr[data-driver-id="Raceartstudios"]');
  await expect(will).toHaveCount(1);
  await expect(will.locator('.rc-driver-cell strong')).toHaveText('Will');
  await expect(will.locator('.rc-number')).toHaveText('33');
  await expect(will.locator('.rc-points-value')).toHaveText('0');
  await expect(will.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  await page.addScriptTag({ url: '/assets/race-csv.js' });
  const matches = await page.evaluate(async () => {
    const data = await window.UARLData.load();
    const candidates = window.UARLResultDrivers.pool(data, { division: 'd1' });
    const imports = ['Will', 'Raceartstudios'].map(name => window.UARLRaceCSV.results(
      'FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed\n1,' + name + ',,,,No,No',
      data, { division: 'd1', finishes: [], entries: [], bonuses: [] }
    ));
    return {
      team: candidates.filter(entry => entry.team === 'Aetherwing eMotorsports').map(entry => ({ user: entry.user, number: entry.number })),
      open: window.UARLResultDrivers.pool(data, { division: 'open' }).filter(entry => entry.user === 'Raceartstudios').length,
      imports: imports.map(preview => ({ errors: preview.errors, finish: preview.record && preview.record.finishes[0] }))
    };
  });
  expect(matches.team).toEqual([{ user, number: '33' }]);
  expect(matches.open).toBe(0);
  for (const preview of matches.imports) {
    expect(preview.errors).toEqual([]);
    expect(preview.finish).toMatchObject({ username: user, name: 'Will', number: '33' });
  }
});

test('the team embed reads the returned roster and keeps later intentional admin edits', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const api = await boot(page, oldPublishedData(), '/embed/team/?team=aetherwing');
  await expect(page.locator('.meta')).toContainText('Chevrolet');
  await expect(page.locator('.entry')).toHaveCount(3);
  await expect(page.locator('.entry .num')).toHaveText(['#33', '#42', '#43']);
  await expect(page.locator('.entry .name')).toHaveText(['Will', 'OPEN', 'OPEN']);
  await expect(page.locator('.shared')).toHaveCount(0);
  const edited = await page.evaluate(async () => await window.UARLData.load());
  const team = edited.drivers.teams.find(team => team.id === 'aetherwing');
  team.make = 'Ford'; team.entries[0].number = '35';
  edited.drivers.profiles.Raceartstudios.alias = 'William';
  api.replace(edited);
  await page.reload();
  await expect(page.locator('.meta')).toContainText('Ford');
  await expect(page.locator('.entry .num')).toHaveText(['#35', '#42', '#43']);
  await expect(page.locator('.entry .name')).toHaveText(['William', 'OPEN', 'OPEN']);
  expect(errors).toEqual([]);
});
