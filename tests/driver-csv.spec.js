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
      { number: '05', name: 'OPEN', status: 'Open FT', charterType: 'FT' },
      { number: '5', name: 'OPEN', status: 'Open PT', charterType: 'PT' }
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

test('driver CSV previews without editing, applies as one undo action, recovers, and publishes stable identities with team badges', async ({ page }) => {
  const { published, data } = await boot(page);
  await page.locator('[data-workspace-task="driver-csv"]').click();
  await expect(widget(page)).toBeVisible();
  const source = header + '\nCSV First,CsvFirst22,05,CSV Racing\nCSV Second,CsvSecond22,5,csv-racing\nJJ CSV,JamesRacer22,84,whitlock';
  const before = await stored(page), node = await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(3);
  await expect(node.locator('[data-csv-preview]')).toContainText('CSV First');
  await expect(node.locator('[data-csv-preview]')).toContainText('JamesRacer22');
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  let draft = await stored(page);
  const csvTeam = draft.drivers.teams.find(team => team.id === 'csv-racing');
  expect(csvTeam.entries.map(entry => [entry.user, entry.number])).toEqual([['CsvFirst22', '05'], ['CsvSecond22', '5']]);
  expect(draft.drivers.profiles.CsvFirst22.alias).toBe('CSV First');
  expect(draft.drivers.profiles.CsvSecond22.alias).toBe('CSV Second');
  expect(draft.drivers.profiles.JJElliott2004).toMatchObject({ alias: 'JJ CSV', currentUsername: 'JamesRacer22', wins: 13, championships: 2, rank: 5, signatureImage: data.drivers.profiles.JJElliott2004.signatureImage });
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
  expect((await stored(page)).drivers.profiles.JJElliott2004.alias).toBe('JJ CSV');
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
  let node = await preview(page, header + '\nNew Driver,FreshCsv22,05,Missing Racing');
  await expect(node.locator('.csv-errors')).toBeVisible();
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  node = await preview(page, header + '\nNew Driver,FreshCsv22,84,whitlock');
  await expect(node.locator('.csv-errors')).toBeVisible();
  await expect(node.locator('[data-csv-apply]')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  node = await preview(page, header + '\nNew Driver,FreshCsv22,,');
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
  await expect(node.locator('.csv-errors')).toBeVisible();
  expect(await stored(page)).toEqual(manuallyEdited);
});

test('mobile admins can load a CSV file, preview it, and recover the applied permanent driver without a team', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await boot(page, { role: 'admin' });
  const node = await openRoster(page, true);
  const source = '\uFEFF' + header + '\r\n"Mobile, Driver",CsvMobile22,005,\r\n';
  await node.locator('[data-csv-file]').setInputFiles({ name: 'drivers.csv', mimeType: 'text/csv', buffer: Buffer.from(source) });
  await expect(node.locator('[data-csv-input]')).toHaveValue(/DriverName,Username,Driver#,Team[\r\n]+"Mobile, Driver",CsvMobile22,005,/);
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
  expect(draft.drivers.teams.flatMap(team => team.entries).some(entry => entry.user === 'CsvMobile22')).toBe(false);
  await page.reload();
  await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  draft = await stored(page);
  expect(draft.drivers.profiles.CsvMobile22.alias).toBe('Mobile, Driver');
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

test('Open CSV imports preserve the same driver and independent series numbers, artwork, manufacturers and points', async ({ page }) => {
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
  const source = header + '\nJJ Open,JamesRacer22,,Independent Open Racing\nOpen Rookie,OpenRookie22,005,New Open Racing\nFrog Open,frogboy4783,,Another Open Team';
  const before = await stored(page);
  await preview(page, source);
  await expect(node.locator('.csv-errors')).toHaveCount(0);
  await expect(node.locator('[data-csv-preview] tbody tr')).toHaveCount(3);
  await expect(node.locator('[data-csv-preview]')).toContainText('Independent Open Racing');
  await expect(node.locator('.csv-header-hint code')).toHaveText(header);
  expect(await stored(page)).toEqual(before);
  await node.locator('[data-csv-apply]').click();
  await expect(page.locator('[data-field="number"]')).toHaveValue('48');
  await expect(page.locator('[data-field="team"]')).toHaveValue('Independent Open Racing');
  await expect(page.locator('[data-field="make"]')).toHaveValue('Chevrolet');
  let draft = await stored(page);
  expect(draft.drivers.teams).toEqual(baseline.drivers.teams);
  expect(draft.drivers.freeAgents).toEqual(baseline.drivers.freeAgents);
  expect(draft.drivers.recentMoves).toEqual(baseline.drivers.recentMoves);
  expect(draft.drivers.profiles.JJElliott2004).toMatchObject({ alias: 'JJ Open', currentUsername: 'JamesRacer22', number: '84', numberImage: baseline.drivers.profiles.JJElliott2004.numberImage, signatureImage: baseline.drivers.profiles.JJElliott2004.signatureImage, wins: 13, championships: 2, rank: 5 });
  expect(draft.drivers.profiles.JamesRacer22).toBeUndefined();
  expect(draft.drivers.profiles.OpenRookie22.csvDivisions).toEqual(['open']);
  expect(draft.drivers.profiles.Frogboy4783.number).toBe(baseline.drivers.profiles.Frogboy4783.number);
  const openJJ = draft.drivers.openEntries.filter(entry => entry.user === 'JJElliott2004');
  expect(openJJ).toHaveLength(1);
  expect(openJJ[0]).toMatchObject({ number: '48', make: 'Chevrolet', team: 'Independent Open Racing' });
  expect(draft.drivers.openEntries.find(entry => entry.user === 'OpenRookie22')).toMatchObject({ number: '005', make: 'Generic', team: 'New Open Racing' });
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
  expect((await stored(page)).drivers.openEntries.find(entry => entry.user === 'JJElliott2004').team).toBe('Independent Open Racing');
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].drivers.teams).toEqual(baseline.drivers.teams);
  await page.goto('/drivers/');
  await page.locator('[data-view="open"]').click();
  const openCard = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="JJElliott2004"]') });
  await expect(openCard.locator('.pp-driver-number')).toHaveText('#48');
  await expect(openCard.locator('.pp-upload-number-driver')).toHaveCount(0);
  await expect(openCard.locator('.meta')).toContainText('Independent Open Racing');
  await expect(openCard.getByRole('img', { name: 'Chevrolet manufacturer', exact: true })).toHaveCount(1);
  const newCard = page.locator('[data-open-grid] .pp-driver').filter({ has: page.locator('[data-driver="OpenRookie22"]') });
  await expect(newCard.locator('.pp-mfg-generic')).toBeVisible();
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
  await expect(newcomer.getByRole('img', { name: 'Manufacturer not assigned', exact: true })).toHaveCount(1);
});

test('switching the driver CSV series invalidates its preview while keeping the same four-column source', async ({ page }) => {
  await boot(page);
  const baseline = await page.evaluate(async () => await window.UARLData.load());
  const node = await openRoster(page);
  const select = node.locator('[data-driver-csv-division]');
  await expect(select).toHaveValue('d1');
  expect(await select.locator('option').evaluateAll(options => options.map(option => option.value))).toEqual(['d1', 'open']);
  const source = header + '\nJJ Series,JamesRacer22,84,whitlock';
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
  expect(draft.drivers.openEntries.find(entry => entry.user === 'JJElliott2004')).toMatchObject({ number: '84', make: 'Chevrolet', team: 'whitlock' });
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
