import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const header = 'DriverName,Username,Driver#,Team';
const draftKey = 'uarl-admin-draft-v1';
const widget = page => page.locator('[data-csv-kind="drivers"]');
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);

function league() {
  const data = structuredClone(original);
  data.drivers.teams.push({
    id: 'csv-racing', name: 'CSV Racing', owner: 'CSV Owner', make: 'Ford',
    entries: [
      { number: '005', name: 'OPEN', status: 'Open FT', charterType: 'FT' },
      { number: '95', name: 'OPEN', status: 'Open PT', charterType: 'PT' }
    ]
  });
  Object.assign(data.drivers.profiles.JJElliott2004, {
    wins: 13, championships: 2, rank: 5, signatureImage: '/assets/aetherwing/logo.webp'
  });
  data.records = [];
  data.standings = [{
    id: 'd1:jjelliott2004', division: 'd1', username: 'JJElliott2004', name: 'JJ', number: '84',
    nameManual: false, numberManual: false, pointsAdjustment: 234, previousPosition: 2, order: 2
  }];
  return data;
}

async function boot(page, { role = 'owner', data = league() } = {}) {
  let live = data;
  const published = [];
  await page.context().route('**/.netlify/functions/admin-publish**', route => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      if (payload.data) { live = payload.data; published.push(payload.data); }
      return route.fulfill({ json: { ok: true, message: 'CSV roster published', revision: 'driver-csv-test' } });
    }
    return route.fulfill({ json: route.request().url().includes('status=1')
      ? { ready: true, user: { id: 'roster-csv-staff', displayName: 'CSV Staff', role } }
      : { data: live } });
  });
  await page.goto('/admin/');
  await expect(page.locator('[data-save-status]')).toHaveText('Published data loaded');
  return { published, data };
}

async function openRoster(page, mobile = false) {
  if (mobile) {
    await page.locator('[data-admin-more]').click();
    await page.locator('[data-admin-menu] [data-section="profiles"]').click();
  } else await page.locator('.admin-sidebar [data-section="profiles"]').click();
  await expect(widget(page)).toBeVisible();
  if (!(await widget(page).getAttribute('open') !== null)) await widget(page).locator('> summary').click();
  return widget(page);
}

async function preview(page, source) {
  const node = widget(page);
  await node.locator('[data-csv-input]').fill(source);
  await node.locator('[data-csv-preview-button]').click();
  return node;
}

test('D1 CSV skips existing and repeated accounts, applies new drivers once, and preserves manual data through recovery and publishing', async ({ page }) => {
  const { published } = await boot(page);
  const data = await page.evaluate(async () => await window.UARLData.load());
  await page.locator('[data-workspace-task="driver-csv"]').click();
  await expect(widget(page)).toBeVisible();
  const source = header + '\nCSV First,CsvFirst22,005,CSV Racing\nStale duplicate,csvfirst22,006,Missing Team\nCSV Second,CsvSecond22,95,csv-racing\nJJ CSV,JamesRacer22,7,Missing Team\nIgnored JJ alias,JJElliott2004,invalid,Missing Team';
  const before = await stored(page), node = await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(5);
  await expect(node.locator('[data-csv-preview]')).toContainText('CSV First');
  await expect(node.locator('[data-csv-preview]')).toContainText('JamesRacer22');
  await expect(node.locator('[data-csv-preview]')).toContainText(/Skip .*driver/);
  await expect(node.locator('[data-csv-preview]')).toContainText('3 skipped');
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  let draft = await stored(page);
  const csvTeam = draft.drivers.teams.find(team => team.id === 'csv-racing');
  expect(csvTeam.entries.map(entry => [entry.user, entry.number])).toEqual([['CsvFirst22', '005'], ['CsvSecond22', '95']]);
  expect(draft.drivers.profiles.CsvFirst22.alias).toBe('CSV First');
  expect(draft.drivers.profiles.CsvSecond22.alias).toBe('CSV Second');
  expect(draft.drivers.profiles.JJElliott2004).toEqual(data.drivers.profiles.JJElliott2004);
  expect(draft.drivers.teams.find(team => team.id === 'whitlock')).toEqual(data.drivers.teams.find(team => team.id === 'whitlock'));
  expect(draft.drivers.profiles.JamesRacer22).toBeUndefined();
  expect(draft.drivers.profiles.JamesEklund).toEqual(data.drivers.profiles.JamesEklund);
  expect(draft.standings[0].pointsAdjustment).toBe(234);
  expect(draft.drivers.openEntries).toEqual(data.drivers.openEntries);
  await page.locator('[data-workspace-undo]').first().click();
  draft = await stored(page);
  expect(draft.drivers.profiles.CsvFirst22).toBeUndefined();
  expect(draft.drivers.profiles.CsvSecond22).toBeUndefined();
  expect(draft.drivers.profiles.JJElliott2004.alias).toBe('JJ');
  expect(draft.drivers.teams.find(team => team.id === 'csv-racing').entries.every(entry => !entry.user)).toBe(true);
  await page.locator('[data-workspace-redo]').first().click();
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  expect((await stored(page)).drivers.profiles.JJElliott2004.alias).toBe('JJ');
  const beforeReimport = await stored(page);
  await openRoster(page);
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('5 skipped');
  await expect(node.locator('[data-csv-status]')).toContainText('No new drivers to add');
  await expect(node.locator('[data-csv-apply]')).toBeDisabled();
  await node.locator('[data-csv-apply]').dispatchEvent('click');
  expect(await stored(page)).toEqual(beforeReimport);
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.profiles.JamesRacer22).toBeUndefined();
  await page.goto('/drivers/');
  const team = page.locator('.pp-team-stage').filter({ has: page.locator('h3', { hasText: /^CSV Racing$/ }) });
  await expect(team.locator('.pp-stage-person strong')).toHaveText(['CSV First', 'CSV Second']);
  await expect(team.getByRole('img', { name: 'Ford manufacturer', exact: true })).toHaveCount(1);
  await page.goto('/race-center/');
  const jj = page.locator('[data-rc-standings-body] tr[data-driver-id="JJElliott2004"]');
  await expect(jj).toHaveCount(1);
  await expect(jj.locator('.rc-points-value')).toHaveText('234');
  await expect(jj.locator('.standings-username')).toHaveText('@JamesRacer22');
  await expect(jj.getByRole('img', { name: 'Toyota manufacturer', exact: true })).toBeVisible();
});

test('invalid rows and stale previews never apply roster edits or overwrite another occupied driver', async ({ page }) => {
  await boot(page, { role: 'admin' });
  await openRoster(page);
  const before = await stored(page);
  let node = await preview(page, header + '\nNew Driver,FreshCsv22,005,Missing Racing');
  await expect(node.locator('.csv-errors')).toBeVisible();
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  node = await preview(page, header + '\nNew Driver,FreshCsv22,84,csv-racing');
  await expect(node.locator('.csv-errors')).toBeVisible();
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  node = await preview(page, header + '\nNew Driver,FreshCsv22,,csv-racing');
  await expect(node.locator('[data-csv-apply]')).toBeEnabled();
  await page.locator('[data-field="alias"]').fill('Edited existing display');
  await page.locator('.step-heading').click();
  const manuallyEdited = await stored(page);
  await expect(node.locator('[data-csv-apply]')).toBeDisabled();
  await expect(node.locator('[data-csv-status]')).toContainText(/draft changed/i);
  expect(manuallyEdited.drivers.profiles.FreshCsv22).toBeUndefined();
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('[data-csv-apply]')).toBeEnabled();
  await node.locator('[data-csv-input]').fill(header + '\nDuplicate,JamesRacer22,84,whitlock\nDuplicate,JJElliott2004,84,whitlock');
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('2 skipped');
  await expect(node.locator('[data-csv-apply]')).toBeDisabled();
  expect(await stored(page)).toEqual(manuallyEdited);
});

test('mobile admins can load a D1 CSV file, preview its team assignment, and recover the applied permanent driver', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await boot(page, { role: 'admin' });
  const node = await openRoster(page, true);
  const source = '\uFEFF' + header + '\r\n"Mobile, Driver",CsvMobile22,005,CSV Racing\r\n';
  await node.locator('[data-csv-file]').setInputFiles({ name: 'drivers.csv', mimeType: 'text/csv', buffer: Buffer.from(source) });
  await expect(node.locator('[data-csv-input]')).toHaveValue(/DriverName,Username,Driver#,Team[\r\n]+"Mobile, Driver",CsvMobile22,005,CSV Racing/);
  await expect(node.locator('[data-csv-preview]')).toHaveCount(0);
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('Mobile, Driver');
  await expect(node.locator('[data-csv-preview]')).toContainText('005');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/driver-csv-mobile.png' });
  await node.locator('[data-csv-apply]').click();
  let draft = await stored(page);
  expect(draft.drivers.profiles.CsvMobile22).toMatchObject({ alias: 'Mobile, Driver', number: '005' });
  expect(draft.drivers.profiles.CsvMobile22.csvDivisions).toContain('d1');
  expect(draft.drivers.teams.find(team => team.id === 'csv-racing').entries.find(entry => entry.user === 'CsvMobile22')).toMatchObject({ number: '005' });
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  draft = await stored(page);
  expect(draft.drivers.profiles.CsvMobile22.alias).toBe('Mobile, Driver');
});

test('a blank Team blocks D1 imports atomically but imports an independent Open driver through recovery and publishing', async ({ page }) => {
  const { published } = await boot(page, { role: 'admin' });
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  const source = header + '\nIndependent Driver,IndependentCsv22,005,';
  const before = await stored(page);
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toContainText(/D1.*team|team.*D1/i);
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  await preview(page, header + '\nAssigned Driver,AssignedCsv22,005,csv-racing\nIndependent Driver,IndependentCsv22,095,');
  await expect(node.locator('.csv-errors')).toContainText('Line 3');
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  await preview(page, source);
  await node.locator('[data-driver-csv-division]').selectOption('open');
  await expect(node.locator('[data-csv-input]')).toHaveValue(source);
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('.csv-header-hint code')).toHaveText(header);
  await expect(node.locator('[data-csv-preview]')).toContainText('Independent entry');
  await node.locator('[data-csv-apply]').click();
  await expect(page.locator('[data-field="team"]')).toHaveValue('');
  let draft = await stored(page);
  const entry = draft.drivers.openEntries.find(row => row.user === 'IndependentCsv22');
  expect(entry).toMatchObject({ number: '005', make: 'Generic' });
  expect(entry.team || '').toBe('');
  expect(draft.drivers.profiles.IndependentCsv22.csvDivisions).toEqual(['open']);
  expect(draft.drivers.profiles.AssignedCsv22).toBeUndefined();
  expect(draft.drivers.teams).toEqual(baseline.drivers.teams);
  expect(draft.drivers.freeAgents).toEqual(baseline.drivers.freeAgents);
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  draft = await stored(page);
  expect(draft.drivers.openEntries.find(row => row.user === 'IndependentCsv22').team || '').toBe('');
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.teams).toEqual(baseline.drivers.teams);
  await page.goto('/drivers/');
  await page.locator('[data-view="open"]').click();
  const card = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="IndependentCsv22"]') });
  await expect(card.locator('.pp-driver-number')).toHaveText('#005');
  await expect(card.locator('.meta')).toContainText('Independent Open Series');
  await expect(card.locator('.pp-mfg-generic')).toBeVisible();
});

test('Race Control cannot access driver CSV import while its results and standings workflows remain available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await boot(page, { role: 'race_control' });
  await expect(widget(page)).toHaveCount(0);
  await expect(page.locator('[data-driver-csv-division]')).toHaveCount(0);
  await expect(page.locator('[data-workspace-task="driver-csv"]')).toHaveCount(0);
  await page.locator('[data-admin-more]').click();
  await expect(page.locator('[data-admin-menu] [data-section="profiles"]')).toHaveCount(0);
  await page.locator('[data-admin-menu] [data-section="standings"]').click();
  await expect(page.locator('[data-csv-kind="standings"]')).toBeVisible();
  await expect(widget(page)).toHaveCount(0);
  await page.locator('.admin-bottom-nav [data-section="results"]').click();
  await page.locator('.view-head [data-action="add"]').click();
  await expect(page.locator('[data-csv-kind="results"]')).toBeVisible();
  await expect(widget(page)).toHaveCount(0);
});

test('Open CSV allows shared numbers while skipping saved and repeated drivers without changing independent manufacturers, artwork or points', async ({ page }) => {
  const data = league();
  Object.assign(data.drivers.profiles.JJElliott2004, { number: '84', numberImage: '/assets/aetherwing/numbers/28.png' });
  const initialOpenJJ = data.drivers.openEntries.find(entry => entry.user === 'JJElliott2004');
  Object.assign(initialOpenJJ, { number: '48', make: 'Chevrolet', team: 'Original Open Racing' });
  delete initialOpenJJ.numberImage;
  data.standings.push({ id: 'open:jjelliott2004', division: 'open', username: 'JJElliott2004', name: 'JJ', number: '48', nameManual: false, numberManual: false, pointsAdjustment: 87, order: 1, previousPosition: null });
  const { published } = await boot(page, { data });
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  await node.locator('[data-driver-csv-division]').selectOption('open');
  const source = header + '\nJJ Open,JamesRacer22,,Independent Open Racing\nOpen Rookie,OpenRookie22,48,New Open Racing\nOpen Twin,OpenTwin22,48,\nIgnored rookie,openrookie22,9,Ignored Racing\nFrog Open,frogboy4783,,Another Open Team';
  const before = await stored(page);
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(5);
  await expect(node.locator('[data-csv-preview]')).toContainText('Original Open Racing');
  await expect(node.locator('[data-csv-preview]')).toContainText('2 skipped');
  await expect(node.locator('.csv-header-hint code')).toHaveText(header);
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  await expect(page.locator('[data-field="number"]')).toHaveValue('48');
  await expect(page.locator('[data-field="team"]')).toHaveValue('New Open Racing');
  await expect(page.locator('[data-field="make"]')).toHaveValue('Generic');
  let draft = await stored(page);
  expect(draft.drivers.teams).toEqual(baseline.drivers.teams);
  expect(draft.drivers.freeAgents).toEqual(baseline.drivers.freeAgents);
  expect(draft.drivers.recentMoves).toEqual(baseline.drivers.recentMoves);
  expect(draft.drivers.profiles.JJElliott2004).toEqual(baseline.drivers.profiles.JJElliott2004);
  expect(draft.drivers.profiles.JamesRacer22).toBeUndefined();
  expect(draft.drivers.profiles.OpenRookie22.csvDivisions).toEqual(['open']);
  expect(draft.drivers.profiles.Frogboy4783.number).toBe(baseline.drivers.profiles.Frogboy4783.number);
  const openJJ = draft.drivers.openEntries.filter(entry => entry.user === 'JJElliott2004');
  expect(openJJ).toHaveLength(1);
  expect(openJJ[0]).toEqual(baseline.drivers.openEntries.find(entry => entry.user === 'JJElliott2004'));
  expect(draft.drivers.openEntries.find(entry => entry.user === 'OpenRookie22')).toMatchObject({ name: 'Open Rookie', number: '48', make: 'Generic', team: 'New Open Racing' });
  expect(draft.drivers.openEntries.find(entry => entry.user === 'OpenTwin22')).toMatchObject({ number: '48', make: 'Generic' });
  expect(draft.drivers.openEntries.filter(entry => entry.number === '48')).toHaveLength(3);
  const openFrog = draft.drivers.openEntries.find(entry => entry.user === 'Frogboy4783');
  expect(openFrog.number || '').toBe('');
  expect(openFrog.numberPending).toBe(true);
  expect(draft.standings).toEqual(baseline.standings);
  await page.locator('[data-workspace-undo]').first().click();
  draft = await stored(page);
  expect(draft.drivers.openEntries).toEqual(baseline.drivers.openEntries);
  expect(draft.drivers.profiles.OpenRookie22).toBeUndefined();
  await page.locator('[data-workspace-redo]').first().click();
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  expect((await stored(page)).drivers.openEntries.find(entry => entry.user === 'JJElliott2004').team).toBe('Original Open Racing');
  await page.locator('.admin-sidebar [data-section="open"]').click();
  await page.locator('.item-row').filter({ has: page.locator('strong', { hasText: /Open Rookie/ }) }).click();
  await page.locator('[data-field="make"]').selectOption('Ford');
  const beforeReimport = await stored(page);
  await openRoster(page);
  await node.locator('[data-driver-csv-division]').selectOption('open');
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('5 skipped');
  await expect(node.locator('[data-csv-status]')).toContainText('No new drivers to add');
  await expect(node.locator('[data-csv-apply]')).toBeDisabled();
  expect(await stored(page)).toEqual(beforeReimport);
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.teams).toEqual(baseline.drivers.teams);
  await page.goto('/drivers/');
  await page.locator('[data-view="open"]').click();
  const openCard = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="JJElliott2004"]') });
  await expect(openCard.locator('.pp-driver-number')).toHaveText('#48');
  await expect(openCard.locator('.pp-upload-number-driver')).toHaveCount(0);
  await expect(openCard.locator('.meta')).toContainText('Original Open Racing');
  await expect(openCard.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  const newCard = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="OpenRookie22"]') });
  await expect(newCard.locator('.pp-driver-number')).toHaveText('#48');
  await expect(newCard.getByRole('img', { name: 'Ford manufacturer', exact: true })).toBeVisible();
  const twinCard = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="OpenTwin22"]') });
  await expect(twinCard.locator('.pp-driver-number')).toHaveText('#48');
  await expect(twinCard.locator('.pp-mfg-generic')).toBeVisible();
  await page.locator('[data-view="drivers"]').click();
  const d1Card = page.locator('[data-driver-grid] .pp-driver').filter({ has: page.locator('[data-driver="JJElliott2004"]') });
  await expect(d1Card.locator('[data-driver]')).toHaveAttribute('data-number', '84');
  await expect(d1Card.locator('.pp-upload-number-driver img')).toHaveAttribute('alt', '#84 number art');
  await expect(d1Card.getByRole('img', { name: 'Toyota manufacturer', exact: true })).toHaveCount(1);
  await page.goto('/race-center/');
  const jjRow = page.locator('[data-rc-standings-body] tr[data-driver-id="JJElliott2004"]');
  await expect(jjRow.locator('.rc-points-value')).toHaveText('234');
  await expect(page.locator('[data-rc-standings-body] tr[data-driver-id="OpenRookie22"]')).toHaveCount(0);
  await page.locator('[data-rc-division="open"]').click();
  await expect(jjRow.locator('.rc-points-value')).toHaveText('87');
  await expect(jjRow.locator('.rc-number')).toHaveText('48');
  await expect(jjRow.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  const newcomer = page.locator('[data-rc-standings-body] tr[data-driver-id="OpenRookie22"]');
  await expect(newcomer).toHaveCount(1);
  await expect(newcomer.locator('.rc-number')).toHaveText('48');
  await expect(newcomer.locator('.rc-points-value')).toHaveText('0');
  await expect(newcomer.getByRole('img', { name: 'Ford manufacturer', exact: true })).toHaveCount(1);
  const twinRow = page.locator('[data-rc-standings-body] tr[data-driver-id="OpenTwin22"]');
  await expect(twinRow).toHaveCount(1);
  await expect(twinRow.locator('.rc-number')).toHaveText('48');
  await expect(twinRow.locator('.rc-points-value')).toHaveText('0');
  await expect(twinRow.getByRole('img', { name: 'Manufacturer not assigned', exact: true })).toHaveCount(1);
});

test('switching the driver CSV series invalidates its preview while keeping the same four-column source', async ({ page }) => {
  await boot(page);
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  const select = node.locator('[data-driver-csv-division]');
  await expect(select).toHaveValue('d1');
  expect(await select.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['d1', 'open']);
  const source = header + '\nSeries Driver,SeriesSwitch22,95,csv-racing';
  await preview(page, source);
  await expect(node.locator('[data-csv-apply]')).toBeEnabled();
  await select.selectOption('open');
  await expect(node.locator('[data-csv-input]')).toHaveValue(source);
  await expect(node.locator('[data-csv-preview]')).toHaveCount(0);
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  await expect(node.locator('.csv-header-hint code')).toHaveText(header);
  expect(await stored(page)).toBeNull();
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await node.locator('[data-csv-apply]').click();
  const draft = await stored(page);
  expect(draft.drivers.teams).toEqual(baseline.drivers.teams);
  expect(draft.drivers.openEntries.find(entry => entry.user === 'SeriesSwitch22')).toMatchObject({ number: '95', make: 'Generic', team: 'csv-racing' });
  expect(draft.drivers.profiles.SeriesSwitch22.csvDivisions).toEqual(['open']);
});

test('mobile Open CSV file uploads create only Open eligibility and retain leading-zero numbers after recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await boot(page, { role: 'admin' });
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page, true);
  await node.locator('[data-driver-csv-division]').selectOption('open');
  const source = '\uFEFF' + header + '\r\n"Mobile, Open Driver",MobileOpen22,005,Independent Mobile Racing\r\n';
  await node.locator('[data-csv-file]').setInputFiles({ name: 'open-drivers.csv', mimeType: 'text/csv', buffer: Buffer.from(source) });
  await expect(node.locator('[data-csv-input]')).toHaveValue(/DriverName,Username,Driver#,Team[\r\n]+"Mobile, Open Driver",MobileOpen22,005,Independent Mobile Racing/);
  await expect(node.locator('[data-csv-preview]')).toHaveCount(0);
  await node.locator('[data-csv-preview-button]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('Independent Mobile Racing');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/driver-csv-open-mobile.png' });
  await node.locator('[data-csv-apply]').click();
  let draft = await stored(page);
  expect(draft.drivers.teams).toEqual(baseline.drivers.teams);
  expect(draft.drivers.profiles.MobileOpen22.csvDivisions).toEqual(['open']);
  expect(draft.drivers.openEntries.find(entry => entry.user === 'MobileOpen22')).toMatchObject({ number: '005', make: 'Generic', team: 'Independent Mobile Racing' });
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  draft = await stored(page);
  expect(draft.drivers.profiles.MobileOpen22.csvDivisions).toEqual(['open']);
  expect(draft.drivers.openEntries.find(entry => entry.user === 'MobileOpen22').number).toBe('005');
});

test('a pending Open CSV driver can receive and clear a number in the entry editor before recovery and publishing', async ({ page }) => {
  const user = 'PendingEdit22';
  const { published } = await boot(page, { role: 'admin' });
  const node = await openRoster(page);
  await node.locator('[data-driver-csv-division]').selectOption('open');
  await preview(page, header + '\nPending Manual,' + user + ',,Independent Manual Racing');
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await node.locator('[data-csv-apply]').click();
  const number = page.locator('[data-field="number"]');
  await expect(number).toHaveValue('');
  expect((await stored(page)).drivers.openEntries.find(entry => entry.user === user).numberPending).toBe(true);
  await number.fill('005');
  await number.press('Tab');
  let entry = (await stored(page)).drivers.openEntries.find(entry => entry.user === user);
  expect(entry.number).toBe('005');
  expect(entry.numberPending).not.toBe(true);
  await number.fill('');
  await number.press('Tab');
  entry = (await stored(page)).drivers.openEntries.find(entry => entry.user === user);
  expect(entry.number).toBe('');
  expect(entry.numberPending).toBe(true);
  await number.fill('005');
  await number.press('Tab');
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  entry = (await stored(page)).drivers.openEntries.find(entry => entry.user === user);
  expect(entry.number).toBe('005');
  expect(entry.numberPending).not.toBe(true);
  await page.locator('.admin-sidebar [data-section="open"]').click();
  await page.locator('.item-row').filter({ has: page.locator('strong', { hasText: /Pending Manual/ }) }).click();
  await expect(page.locator('[data-field="number"]')).toHaveValue('005');
  await expect(page.locator('[data-field="team"]')).toHaveValue('Independent Manual Racing');
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.openEntries.find(row => row.user === user).numberPending).not.toBe(true);
  await page.goto('/drivers/');
  await page.locator('[data-view="open"]').click();
  const card = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="' + user + '"]') });
  await expect(card.locator('.pp-driver-number')).toHaveText('#005');
  await expect(card.locator('.pp-driver-number.pending')).toHaveCount(0);
  await card.locator('[data-driver]').click();
  await expect(page.locator('.pp-profile-number')).toHaveText('#005');
});

test('removing a roster preview row imports only the remaining drivers without editing the draft first', async ({ page }) => {
  await boot(page, { role: 'admin' });
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  const source = header + '\nFirst Driver,RemoveFirst22,005,csv-racing\nSecond Driver,RemoveSecond22,95,csv-racing\nThird Driver,RemoveThird22,006,csv-racing';
  const before = await stored(page);
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(3);
  await node.getByRole('button', { name: 'Remove Second Driver from preview', exact: true }).click();
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(2);
  await expect(node.locator('[data-csv-input]')).not.toHaveValue(/RemoveSecond22/);
  await expect(node.locator('[data-csv-preview]')).toContainText('2 to add');
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  const saved = await stored(page);
  expect(saved.drivers.profiles.RemoveFirst22.alias).toBe('First Driver');
  expect(saved.drivers.profiles.RemoveThird22.alias).toBe('Third Driver');
  expect(saved.drivers.profiles.RemoveSecond22).toBeUndefined();
  const added = saved.drivers.teams.find(team => team.id === 'csv-racing').entries.filter(entry => entry.user);
  expect(added.map(entry => [entry.user, entry.number])).toEqual([['RemoveFirst22', '005'], ['RemoveThird22', '006']]);
  expect(saved.drivers.profiles.JJElliott2004).toEqual(baseline.drivers.profiles.JJElliott2004);
  expect(saved.standings).toEqual(baseline.standings);
});

test('removing an existing driver from a roster CSV preview never removes their saved profile or team assignment', async ({ page }) => {
  await boot(page);
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  const before = await stored(page);
  await preview(page, header + '\nJJ,JJElliott2004,84,whitlock\nNew Driver,RemoveNew22,005,csv-racing');
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview]')).toContainText('1 skipped');
  await node.locator('[data-csv-remove-row="0"]').click();
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(1);
  await expect(node.locator('[data-csv-preview]')).toContainText('0 skipped');
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  const saved = await stored(page);
  expect(saved.drivers.profiles.JJElliott2004).toEqual(baseline.drivers.profiles.JJElliott2004);
  expect(saved.drivers.teams.find(team => team.id === 'whitlock')).toEqual(baseline.drivers.teams.find(team => team.id === 'whitlock'));
  expect(saved.standings).toEqual(baseline.standings);
  expect(saved.drivers.profiles.RemoveNew22.alias).toBe('New Driver');
});

test('invalid roster preview rows can be removed and an empty preview never applies an import', async ({ page }) => {
  await boot(page, { role: 'admin' });
  const node = await openRoster(page);
  const before = await stored(page);
  const source = header + '\nValid Driver,RemoveValid22,005,csv-racing\nInvalid Driver,RemoveInvalid22,95,Missing Team';
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toBeVisible();
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  await node.locator('[data-csv-remove-row="1"]').click();
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(1);
  await expect(node.locator('[data-csv-apply]')).toBeEnabled();
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-remove-row="0"]').click();
  await expect(node.locator('[data-csv-preview]')).toHaveCount(0);
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  await expect(node.locator('[data-csv-output]')).toContainText('No rows left in this preview. Nothing has been applied.');
  await expect(node.locator('[data-csv-input]')).toHaveValue(header);
  expect(await stored(page)).toEqual(before);
  await preview(page, source);
  await node.locator('[data-csv-remove-row="1"]').click();
  await node.locator('[data-csv-apply]').click();
  const saved = await stored(page);
  expect(saved.drivers.profiles.RemoveValid22.alias).toBe('Valid Driver');
  expect(saved.drivers.profiles.RemoveInvalid22).toBeUndefined();
});
