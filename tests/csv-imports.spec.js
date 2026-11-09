import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const draftKey = 'uarl-admin-draft-v1';
const resultsHeader = 'FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed';
const standingsHeader = 'Position,+/-,Driver#,DriverName,Points';
const resultCSV = resultsHeader + '\n2,HaydenUser,1,2,1,No,Yes\n1,MaxUser,2,1,2,Yes,No';
function league() {
  const data = structuredClone(original);
  data.drivers.teams = [{ id: 'team', name: 'Current Team', make: 'Toyota', entries: [{ name: 'Max', user: 'MaxUser', number: '19', status: 'Full-Time' }, { name: 'Hayden', user: 'HaydenUser', number: '20', status: 'Full-Time' }, { name: 'Jordan', user: 'JordanA', number: '23', status: 'Full-Time' }, { name: 'Jordan', user: 'JordanB', number: '24', status: 'Full-Time' }] }];
  data.drivers.profiles = {}; data.drivers.openEntries = [{ name: 'Open Racer', user: 'OpenUser', number: '05', make: 'Toyota' }];
  data.records = []; delete data.standings;
  data.events = [{ id: 'race-one', name: 'First CSV Race', division: 'd1', date: '2026-11-15', start: '2026-11-16T00:30:00Z', track: 'Test Speedway', pointsEvent: true, round: 1 }, { id: 'race-two', name: 'Second Manual Race', division: 'd1', date: '2026-11-22', start: '2026-11-23T00:30:00Z', track: 'Test Oval', pointsEvent: true, round: 2 }];
  return data;
}
async function boot(page, { data = league(), role = 'owner', recovered = false } = {}) {
  const published = []; let live = data;
  await page.route('**/.netlify/functions/admin-publish**', route => {
    if (route.request().method() === 'POST') { const payload = route.request().postDataJSON(); if (payload.data) { live = payload.data; published.push(live); } return route.fulfill({ json: { ok: true, message: 'Test publish saved' } }); }
    return route.fulfill({ json: route.request().url().includes('status=1') ? { ready: true, user: { id: 'csv-owner', displayName: 'CSV Staff', role } } : { data: live } });
  });
  await page.goto('/admin/'); await expect(page.locator('[data-save-status]')).toHaveText(recovered ? 'Recovered unpublished browser draft' : 'Published data loaded');
  return published;
}
const section = (page, name) => page.locator('.admin-sidebar [data-section="' + name + '"]');
const widget = (page, kind) => page.locator('[data-csv-kind="' + kind + '"]');
async function openCSV(page, kind) { const node = widget(page, kind); if (!(await node.getAttribute('open') !== null)) await node.locator('> summary').click(); return node; }
async function draft(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey); }
async function createRace(page) { await section(page, 'results').click(); await page.locator('.view-head [data-action="add"]').click(); }
async function previewCSV(page, kind, source) { const node = await openCSV(page, kind); await node.locator('[data-csv-input]').fill(source); await node.locator('[data-csv-preview-button]').click(); return node; }
async function applyCSV(page, kind, source) { const node = await previewCSV(page, kind, source); await expect(node.locator('.csv-errors')).toHaveCount(0); await node.locator('[data-csv-apply]').click(); }
async function chooseDriver(select, user) { const value = await select.locator('option').evaluateAll((options, user) => options.find(option => option.dataset.user === user)?.value, user); expect(value).toBeTruthy(); await select.selectOption(value); }
const pointsRow = (page, user) => page.locator('[data-standings-driver="' + user + '"]');

test('race CSV previews calculated points before applying, supports one-step undo, and recovers applied results', async ({ page }) => {
  await boot(page); await createRace(page);
  const before = await draft(page), node = await previewCSV(page, 'results', resultCSV);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(2);
  await expect(node.locator('[data-csv-preview] tbody tr').first()).toContainText('Max');
  await expect(node.locator('[data-csv-preview] tbody tr').first().locator('td').last()).toHaveText('61');
  await expect(node.locator('[data-csv-preview] tbody tr').last().locator('td').last()).toHaveText('62');
  expect(await draft(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  let record = (await draft(page)).records[0];
  expect(record).toMatchObject({ id: 'race-one', scheduleEventId: 'race-one', winnerUsername: 'MaxUser', poleUsername: 'HaydenUser' });
  expect(record.finishes.map(row => [row.username, row.totalPoints])).toEqual([['MaxUser', 61], ['HaydenUser', 62]]);
  await page.locator('[data-workspace-undo]').first().click(); expect(await draft(page)).toEqual(before);
  await page.locator('[data-workspace-redo]').first().click();
  await page.reload(); await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  await section(page, 'standings').click();
  await expect(pointsRow(page, 'HaydenUser').locator('[data-standings-points]')).toHaveValue('62');
  await expect(pointsRow(page, 'MaxUser').locator('[data-standings-points]')).toHaveValue('61');
});

test('CSV validation blocks ambiguous drivers and invalid flags and invalidates a preview when text changes', async ({ page }) => {
  await boot(page); await createRace(page);
  const before = await draft(page);
  let node = await previewCSV(page, 'results', resultsHeader + '\n1,Jordan,,,,Yes,No\n1,Unknown,,,,True,');
  await expect(node.locator('.csv-errors')).toContainText('unknown or ambiguous');
  await expect(node.locator('.csv-errors')).toContainText('duplicate finishing position');
  await expect(node.locator('.csv-errors')).toContainText('must be Yes or No');
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0); expect(await draft(page)).toEqual(before);
  node = await previewCSV(page, 'results', resultCSV);
  await expect(node.locator('[data-csv-apply]')).toBeEnabled();
  await node.locator('[data-csv-input]').fill(resultCSV.replace('Yes', 'No'));
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0); expect(await draft(page)).toEqual(before);
});

test('a changed race requires a fresh preview and keeps a manually corrected car number', async ({ page }) => {
  await boot(page); await createRace(page); await applyCSV(page, 'results', resultCSV);
  await page.locator('.editor-steps [data-step="4"]').click();
  const node = await previewCSV(page, 'results', resultCSV);
  const number = page.locator('[data-sfield="finishes"][data-srow="0"][data-skey="number"]');
  const card = number.locator('xpath=ancestor::details[1]'); if (!(await number.isVisible())) await card.locator('> summary').click();
  await number.fill('021'); await page.locator('.step-heading').click();
  await expect(node.locator('[data-csv-apply]')).toBeDisabled(); await expect(node.locator('[data-csv-status]')).toContainText('draft changed');
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('[data-csv-preview] tbody tr').first()).toContainText('021');
  await node.locator('[data-csv-apply]').click();
  expect((await draft(page)).records[0].finishes[0]).toMatchObject({ username: 'MaxUser', number: '021', numberManual: true });
});

test('standings CSV previews exact five-column totals, preserves other divisions, and applies as one undo action', async ({ page }) => {
  await boot(page); await section(page, 'standings').click();
  await page.locator('[data-standings-division="open"]').click();
  await pointsRow(page, 'OpenUser').locator('[data-standings-points]').fill('75'); await pointsRow(page, 'OpenUser').locator('[data-save-points]').click();
  await page.locator('[data-standings-division="d1"]').click(); const before = await draft(page);
  const node = await previewCSV(page, 'standings', standingsHeader + '\n1,+2,019,Max,150\n2,-1,020,Hayden,140');
  await expect(node.locator('th')).toHaveText(['Position', 'Change', 'Driver#', 'DriverName', 'Points']);
  await expect(node.locator('tbody tr').first()).toHaveText('1▲ 2019Max150');
  expect(await draft(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  await expect(pointsRow(page, 'MaxUser').locator('[data-standings-points]')).toHaveValue('150');
  await expect(pointsRow(page, 'MaxUser').locator('td').nth(2)).toHaveText('019');
  expect((await draft(page)).standings.find(row => row.division === 'open').pointsAdjustment).toBe(75);
  await page.locator('[data-workspace-undo]').first().click(); expect(await draft(page)).toEqual(before);
  await page.locator('[data-workspace-redo]').first().click();
  await page.reload(); await expect(page.locator('[data-save-status]')).toContainText('Recovered'); await section(page, 'standings').click();
  await expect(pointsRow(page, 'MaxUser').locator('[data-standings-points]')).toHaveValue('150');
});

test('manual points corrections and manual race entry keep automatic totals and publish the five public columns', async ({ page }) => {
  const data = league(); data.drivers.teams[0].entries[3].name = 'LongDriverDisplayNameForMobile';
  const published = await boot(page, { data });
  await section(page, 'standings').click(); const max = pointsRow(page, 'MaxUser');
  await max.locator('[data-standings-points]').fill('100');
  expect(await draft(page)).toBeNull();
  await max.locator('[data-save-points]').click(); expect((await draft(page)).standings[0].pointsAdjustment).toBe(100);
  await createRace(page); await page.locator('.editor-steps [data-step="4"]').click();
  await page.locator('[data-sadd="finishes"]').click(); await chooseDriver(page.locator('[data-sfield="finishes"][data-skey="name"]').first(), 'MaxUser');
  await section(page, 'standings').click(); await expect(max.locator('[data-standings-points]')).toHaveValue('150');
  await max.locator('[data-standings-points]').fill('155'); await max.locator('[data-save-points]').click();
  expect((await draft(page)).standings[0].pointsAdjustment).toBe(105);
  await page.locator('[data-action="publish"]').first().click(); await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1); await expect(page.locator('[data-save-status]')).toHaveText('Published live');
  await page.goto('/race-center/');
  await expect(page.locator('[data-rc-panel="standings"] th')).toHaveText(['Position', 'Change', 'Driver#', 'DriverName', 'Points']);
  await expect(page.locator('[data-rc-standings-body] [data-driver-id="MaxUser"]')).toHaveText('1—19Max155');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('.rc-table-shell').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await page.locator('.rc-search').fill('Hayden'); await expect(page.locator('[data-rc-standings-body] tr')).toHaveCount(1);
  await expect(page.locator('[data-rc-standings-body] tr td').first()).not.toHaveText('1');
});

test('standings rejects invalid points and fresh CSV previews are required after a manual correction', async ({ page }) => {
  await boot(page); await section(page, 'standings').click();
  let node = await previewCSV(page, 'standings', standingsHeader + '\n1,up,19,Max,1.5');
  await expect(node.locator('.csv-errors')).toContainText('Points must be a whole number'); await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  node = await previewCSV(page, 'standings', standingsHeader + '\n1,-,19,Max,100');
  const max = pointsRow(page, 'MaxUser'); await max.locator('[data-standings-points]').fill('25'); await max.locator('[data-save-points]').click();
  node = await openCSV(page, 'standings'); await expect(node.locator('[data-csv-apply]')).toBeDisabled();
  await max.locator('.standings-correction > summary').click(); await max.locator('[data-reset-points]').click(); await expect(max.locator('[data-standings-points]')).toHaveValue('0');
});

test('mobile Race Control can reach Standings from More, preview imports, and use the manual editor without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, { role: 'race_control' });
  await page.locator('[data-admin-more]').click(); await page.locator('[data-admin-menu-items] [data-section="standings"]').click();
  await applyCSV(page, 'standings', standingsHeader + '\n1,0,019,Max,100\n2,0,020,Hayden,90');
  await expect(pointsRow(page, 'MaxUser').locator('[data-standings-points]')).toHaveValue('100');
  await page.screenshot({ path: 'test-results/standings-mobile.png' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.admin-bottom-nav [data-section="results"]').click(); await page.locator('.view-head [data-action="add"]').click();
  await previewCSV(page, 'results', resultCSV);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/results-csv-mobile.png' });
  expect(errors).toEqual([]);
});

test('deleting a race or undoing its creation safely removes its CSV editor and never applies it to another race', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page); await createRace(page); await previewCSV(page, 'results', resultCSV);
  await page.locator('[data-workspace-undo]').first().click();
  await expect(page.locator('[data-csv-kind="results"]')).toHaveCount(0); expect((await draft(page)).records).toEqual([]);
  await page.locator('[data-workspace-redo]').first().click();
  await expect(page.locator('[data-csv-kind="results"]')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-action="delete"]').click();
  await expect(page.locator('[data-csv-kind="results"]')).toHaveCount(0); expect((await draft(page)).records).toEqual([]);
  await page.locator('[data-workspace-undo]').first().click();
  await expect(page.locator('[data-csv-kind="results"]')).toHaveCount(1);
  await page.locator('.view-head [data-action="add"]').click();
  const node = await openCSV(page, 'results'); await expect(node.locator('[data-csv-input]')).toHaveValue('');
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0); expect((await draft(page)).records[1].finishes).toEqual([]);
  expect(errors).toEqual([]);
});

test('published standings imports show their totals and movement even before any race records exist', async ({ page }) => {
  const published = await boot(page); await section(page, 'standings').click();
  await applyCSV(page, 'standings', standingsHeader + '\n1,+2,019,Max,150\n2,-1,020,Hayden,140\n3,0,23,JordanA,130\n4,-,24,JordanB,120');
  await page.locator('[data-action="publish"]').first().click(); await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1); expect(published[0].records).toEqual([]);
  await page.goto('/race-center/');
  await expect(page.locator('[data-rc-leader]')).toHaveText('Max'); await expect(page.locator('[data-rc-points]')).toHaveText('150');
  await expect(page.locator('[data-rc-preseason]')).toHaveText('Official standings · posted totals');
  await expect(page.locator('[data-rc-standings-body] [data-driver-id="MaxUser"]')).toHaveText('1▲ 2019Max150');
  await expect(page.locator('[data-rc-standings-body] [data-driver-id="HaydenUser"]')).toHaveText('2▼ 1020Hayden140');
  const up = page.locator('[data-driver-id="MaxUser"] .standings-movement');
  const down = page.locator('[data-driver-id="HaydenUser"] .standings-movement');
  await expect(up).toHaveAttribute('aria-label', 'Up 2 positions');
  await expect(down).toHaveAttribute('aria-label', 'Down 1 position');
  await expect(up.locator('span')).toHaveCSS('color', 'rgb(74, 222, 128)');
  await expect(down.locator('span')).toHaveCSS('color', 'rgb(248, 113, 113)');
  const unchanged = page.locator('[data-driver-id="JordanA"] .standings-movement');
  await expect(unchanged).toHaveText('—'); await expect(unchanged).toHaveAttribute('aria-label', 'No position change');
  await expect(page.locator('[data-driver-id="JordanB"] .standings-movement')).toHaveText('—');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.rc-table-shell').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/standings-movement-mobile.png' });

});

const fullRaceCSV = `${resultsHeader}
1,Haydon Hildebrand,1,1,1,yes,yes
2,Regan Linney,4,,2,no,no
3,Lance July,2,3,,no,no
4,Guillermo Chase,7,,,no,no
5,Muffin,10,4,3,no,no
6,Payson Avery,5,2,5,no,no
7,John Hunter,3,,,no,no
8,Hailey Bell,6,5,4,no,no
9,Frog,8,,,no,no
10,Dale,9,,,no,no`;
function beforeRosterUpgrade() {
  const data = structuredClone(original);
  delete data.drivers.rosterVersion;
  for (const profile of Object.values(data.drivers.profiles)) { delete profile.csvAliases; delete profile.csvDivisions; }
  data.drivers.profiles.Aokikoto.alias = 'Hailey'; data.drivers.profiles.UN88475544.alias = 'Haydon'; data.drivers.profiles.AnyGameAnyTime09.number = '';
  data.events = league().events; data.records = [];
  return data;
}

test('the reported ten-driver CSV applies and publishes without race guests, preserving Hailey and permanent Muffin', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const published = await boot(page, { data: beforeRosterUpgrade(), role: 'race_control' });
  await createRace(page);
  await expect(page.locator('.editor-steps [data-step="1"]')).toHaveCount(0);
  await expect(page.locator('[data-sadd="entries"]')).toHaveCount(0);
  const node = await previewCSV(page, 'results', fullRaceCSV);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(10);
  await expect(node.locator('[data-csv-preview] tbody tr').nth(4)).toContainText('Muffin');
  await expect(node.locator('[data-csv-preview] tbody tr').nth(4).locator('td').last()).toHaveText('43');
  await expect(node.locator('[data-csv-preview] tbody tr').first().locator('td').last()).toHaveText('70');
  await expect(node.locator('[data-csv-preview] tbody tr').nth(7)).toContainText('Hailey');
  await node.locator('[data-csv-apply]').click();
  await page.locator('.step-actions [data-step="5"]').click();
  await expect(page.locator('.race-review')).toContainText('10 finishers');
  await expect(page.locator('.race-review')).toContainText('Winner: Haydon');
  await page.locator('.step-actions [data-step="0"]').click();
  await page.locator('.step-actions [data-step="5"]').click();
  await expect(page.locator('.race-review')).toContainText('10 finishers');
  await page.locator('.step-actions [data-action="publish"]').click(); await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  const result = published[0].records[0];
  expect((result.entries || []).length).toBe(0);
  expect(result.finishes[4]).toMatchObject({ username: 'AnyGameAnyTime09', number: '2', totalPoints: 43 });
  expect(published[0].drivers.profiles.AnyGameAnyTime09.csvDivisions).toEqual(['d1']);
  expect(published[0].drivers.teams.flatMap(team => team.entries).some(entry => entry.user === 'AnyGameAnyTime09')).toBe(false);
  await page.goto('/race-center/');
  await expect(page.locator('[data-rc-standings-body] [data-driver-id="AnyGameAnyTime09"] .rc-pts')).toHaveText('43');
  await expect(page.locator('[data-rc-standings-body] [data-driver-id="Aokikoto"] .rc-driver-cell')).toHaveText('Hailey');
  expect(errors).toEqual([]);
});

test('old browser drafts receive permanent roster names without losing their saved result', async ({ page }) => {
  const data = beforeRosterUpgrade(), saved = structuredClone(data);
  saved.records = [{ id: 'race-one', scheduleEventId: 'race-one', division: 'd1', event: 'Recovered Race', status: 'pending', date: '2026-11-15', start: '2026-11-16T00:30:00Z', pointsEvent: true, finishes: [{ position: 1, name: 'Muffin', username: 'AnyGameAnyTime09', points: 50 }], qualifying: [], stages: [], bonuses: [] }];
  await page.addInitScript(({ key, saved }) => { if (!sessionStorage.getItem('csv-recovery-seeded')) { localStorage.setItem(key, JSON.stringify(saved)); sessionStorage.setItem('csv-recovery-seeded', '1'); } }, { key: draftKey, saved });
  await boot(page, { data, recovered: true }); await section(page, 'results').click();
  await expect(page.locator('.editor-title')).toContainText('Recovered Race');
  await previewCSV(page, 'results', fullRaceCSV);
  await expect(widget(page, 'results').locator('.csv-errors')).toHaveCount(0);
  const recovered = await page.evaluate(async () => window.UARLData.normalize(JSON.parse(localStorage.getItem('uarl-admin-draft-v1'))));
  expect(recovered.records[0].finishes[0]).toMatchObject({ username: 'AnyGameAnyTime09', points: 50 });
  expect(recovered.drivers.profiles.Aokikoto.alias).toBe('Hailey');
  expect(recovered.drivers.profiles.AnyGameAnyTime09.csvDivisions).toEqual(['d1']);
});

test('new drivers can be permanently registered once with CSV names and used in both imports without a team', async ({ page }) => {
  await boot(page); await section(page, 'profiles').click();
  await page.locator('.view-head [data-action="add"]').click();
  await page.locator('[data-field="username"]').fill('PermanentUser');
  await page.locator('[data-field="alias"]').fill('Permanent Driver');
  await page.locator('[data-field="number"]').fill('011');
  await expect(page.locator('[data-field="csvDivisions"][data-division-value="d1"]')).toBeChecked();
  await page.locator('[data-field="csvDivisions"][data-division-value="open"]').check();
  await page.locator('[data-sadd="csvAliases"]').click();
  await page.locator('[data-sfield="csvAliases"][data-skey="value"]').fill('Permanent Full Name');
  await createRace(page); await applyCSV(page, 'results', resultsHeader + '\n1,Permanent Full Name,1,1,1,Yes,Yes');
  const result = (await draft(page)).records[0];
  expect(result.finishes[0]).toMatchObject({ username: 'PermanentUser', name: 'Permanent Driver', number: '011', totalPoints: 70 });
  await section(page, 'standings').click();
  await applyCSV(page, 'standings', standingsHeader + '\n1,0,011,Permanent Full Name,100');
  await expect(pointsRow(page, 'PermanentUser').locator('[data-standings-points]')).toHaveValue('100');
  expect((await draft(page)).drivers.profiles.PermanentUser.csvAliases).toEqual(['Permanent Full Name']);
});
