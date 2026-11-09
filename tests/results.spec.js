import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const original = JSON.parse(fs.readFileSync(new URL('../data/uarl.json', import.meta.url)));
const draftKey = 'uarl-admin-draft-v1';
const owner = { id: 'results-test', role: 'owner', displayName: 'Results Test' };
async function goStep(page, index) {
  const button = page.locator('.editor-steps [data-step="' + index + '"]');
  if (!(await button.isVisible())) await page.locator('[data-result-details] > summary').click();
  await button.click();
}
const field = (page, collection, key, row = 0) => page.locator('[data-sfield="' + collection + '"][data-skey="' + key + '"][data-srow="' + row + '"]');

function result(overrides = {}) {
  return { id: 'current-race', event: 'Current Test Race', division: 'd1', date: '2026-11-01', start: '2026-11-02T00:30:00Z', status: 'pending', pointsEvent: true, exhibition: false, entries: [], qualifying: [], stages: [], finishes: [], bonuses: [], ...overrides };
}
function league() {
  const data = structuredClone(original);
  data.events = [{ id: 'new-race', name: 'Next Test Race', division: 'd1', date: '2026-11-08', start: '2026-11-09T00:30:00Z', track: 'Test Track', laps: 50, round: 2, pointsEvent: true }];
  data.drivers.teams = [{ id: 'current', name: 'Current Team', make: 'Toyota', entries: [
    { number: '19', name: 'Max', user: 'MaxUser', status: 'Full-Time' },
    { number: '20', name: 'Hayden', user: 'HaydenUser', status: 'Full-Time' },
    { number: '23', name: 'Jordan', user: 'JordanA', status: 'Full-Time' },
    { number: '24', name: 'Jordan', user: 'JordanB', status: 'Full-Time' },
    { number: '27', name: 'Spare Driver', user: 'SpareUser', status: 'Full-Time' },
    { number: '30', name: 'OPEN', status: 'Open FT' },
    { number: '31', name: 'Inactive Driver', user: 'InactiveUser', status: 'Inactive' }
  ] }];
  data.drivers.profiles = { MaxUser: { alias: 'Old Max' }, HaydenUser: { alias: 'Hayden' }, JordanA: { alias: 'Jordan' }, JordanB: { alias: 'Jordan' } };
  data.drivers.openEntries = [{ number: '5', name: 'Open Driver', user: 'OpenUser', make: 'Toyota' }];
  data.records = [result({ id: 'history-one', event: 'Historical One', qualifying: [{ position: 1, name: 'Max', number: '19' }, { position: 2, name: 'Hayden' }], finishes: [{ position: 1, name: 'Former Driver', username: 'FormerUser', number: '99' }] }), result({ id: 'history-two', event: 'Historical Two', finishes: [{ position: 1, name: 'Max', username: 'LegacyMax', number: '19' }, { position: 2, name: '#20 Hayden', number: '20' }] })];
  return data;
}
async function boot(page, data, published = []) {
  await page.route('**/.netlify/functions/admin-publish**', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      if (payload.data) published.push(payload.data);
      return route.fulfill({ json: { ok: true, message: 'Published test data' } });
    }
    return route.fulfill({ json: request.url().includes('status=1') ? { ready: true, user: owner } : { data } });
  });
  await page.goto('/admin/');
  await expect(page.locator('[data-save-status]')).toHaveText('Published data loaded');
  await page.locator('.admin-sidebar [data-section="results"]').click();
}
async function newRace(page) { await page.locator('.view-head [data-action="add"]').click(); }
async function chooseDriver(select, username) {
  const value = await select.locator('option').evaluateAll((options, user) => options.find(option => option.dataset.user?.toLowerCase() === user.toLowerCase())?.value, username);
  expect(value, 'Driver ' + username + ' must have exactly one selectable option').toBeTruthy();
  await select.selectOption(value);
}
async function optionUsers(select) { return select.locator('option').evaluateAll(options => options.filter(option => option.value && !option.disabled).map(option => option.dataset.user)); }
async function currentDraft(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey); }
async function openCardFor(control) {
  const details = control.locator('xpath=ancestor::details[1]');
  if (await details.count() && !(await details.evaluate(node => node.open))) await details.locator('summary').first().click();
}

test('new race choices come from the current roster without duplicate Max/Hayden or historical ghosts', async ({ page }) => {
  await boot(page, league()); await newRace(page); await goStep(page, 4);
  await page.locator('[data-sadd="finishes"]').click();
  const select = field(page, 'finishes', 'name');
  const choices = await select.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => ({ value: option.value, user: option.dataset.user, name: option.dataset.name, number: option.dataset.number, label: option.textContent })));
  expect(choices.filter(option => option.name === 'Max')).toHaveLength(1);
  expect(choices.find(option => option.name === 'Max')).toMatchObject({ user: 'MaxUser', number: '19' });
  expect(choices.filter(option => option.name === 'Hayden')).toHaveLength(1);
  expect(choices.find(option => option.name === 'Hayden')).toMatchObject({ user: 'HaydenUser', number: '20' });
  expect(choices.map(option => option.user).sort()).toEqual(['HaydenUser', 'JordanA', 'JordanB', 'MaxUser', 'SpareUser'].sort());
  expect(choices.filter(option => option.name === 'Jordan')).toHaveLength(2);
  expect(new Set(choices.filter(option => option.name === 'Jordan').map(option => option.value)).size).toBe(2);
  expect(choices.some(option => /Former Driver|#20 Hayden|Old Max|Inactive Driver|OPEN/.test(option.label))).toBe(false);
});

test('manual car-number corrections survive recalculation, step changes, recovery and publish', async ({ page }) => {
  const published = []; await boot(page, league(), published); await newRace(page);
  await goStep(page, 2); await page.locator('[data-sadd="qualifying"]').click();
  let qualifying = field(page, 'qualifying', 'name'), qualifyingNumber = field(page, 'qualifying', 'number');
  await chooseDriver(qualifying, 'HaydenUser'); await expect(qualifyingNumber).toBeEditable(); await expect(qualifyingNumber).toHaveValue('20');
  await qualifyingNumber.fill('021'); await chooseDriver(qualifying, 'HaydenUser'); await expect(qualifyingNumber).toHaveValue('021');
  await chooseDriver(qualifying, 'MaxUser'); await expect(qualifyingNumber).toHaveValue('19');
  await chooseDriver(qualifying, 'HaydenUser'); await qualifyingNumber.fill('021');
  await goStep(page, 3); await page.locator('[data-sadd="stages"]').click(); await page.locator('[data-snadd="stages"]').click();
  const stageDriver = field(page, 'stages', 'name').locator('xpath=self::*[@data-sparent="0"]');
  const stageNumber = field(page, 'stages', 'number').locator('xpath=self::*[@data-sparent="0"]');
  await chooseDriver(stageDriver, 'HaydenUser'); await expect(stageNumber).toBeEditable(); await stageNumber.fill('021');
  await goStep(page, 4); await page.locator('[data-sadd="finishes"]').click();
  await chooseDriver(field(page, 'finishes', 'name'), 'HaydenUser'); await expect(field(page, 'finishes', 'number')).toBeEditable(); await field(page, 'finishes', 'number').fill('021');
  await field(page, 'finishes', 'position').fill('2'); await expect(page.locator('[data-auto-points="0"]')).toHaveValue('50');
  await goStep(page, 0); await goStep(page, 4);
  let draft = await currentDraft(page), record = draft.records.at(-1);
  expect(record.finishes[0]).toMatchObject({ name: 'Hayden', username: 'HaydenUser', number: '021', numberManual: true });
  expect(record.qualifying[0]).toMatchObject({ username: 'HaydenUser', number: '021', numberManual: true });
  expect(record.stages[0].results[0]).toMatchObject({ username: 'HaydenUser', number: '021', numberManual: true });
  await page.reload(); await expect(page.locator('[data-save-status]')).toContainText('Recovered');
  await page.locator('.admin-sidebar [data-section="results"]').click(); await page.locator('[data-select]').filter({ hasText: 'Next Test Race' }).click(); await goStep(page, 4);
  await openCardFor(field(page, 'finishes', 'number')); await expect(field(page, 'finishes', 'number')).toHaveValue('021');
  await page.locator('[data-action="publish"]').first().click(); await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => published.length).toBe(1);
  expect(published[0].records.at(-1).finishes[0]).toMatchObject({ username: 'HaydenUser', number: '021', numberManual: true });
});

test('bonuses use only finishers, keep their race numbers, and require correcting a removed recipient', async ({ page }) => {
  const data = league(), published = [];
  data.records.push(result({ entries: [{ name: 'Guest Driver', user: 'GuestUser', number: '021' }], finishes: [
    { position: 1, name: 'Max', username: 'MaxUser', number: '019', numberManual: true },
    { position: 2, name: 'Jordan', username: 'JordanA', number: '23' },
    { position: 3, name: 'Jordan', username: 'JordanB', number: '24' },
    { position: 4, name: 'Guest Driver', username: 'GuestUser', number: '021' }
  ] }));
  await boot(page, data, published); await page.locator('[data-select]').filter({ hasText: 'Current Test Race' }).click(); await goStep(page, 5); await page.locator('[data-sadd="bonuses"]').click();
  const bonus = field(page, 'bonuses', 'driver');
  expect((await optionUsers(bonus)).sort()).toEqual(['GuestUser', 'JordanA', 'JordanB', 'MaxUser'].sort());
  await expect(page.locator('[data-sfield="bonuses"][data-skey="lapsLed"], [data-sfield="bonuses"][data-skey="totalLaps"]')).toHaveCount(0);
  await chooseDriver(bonus, 'MaxUser');
  const bonusNumber = bonus.locator('xpath=ancestor::div[contains(@class,"builder-row")][1]').locator('[data-auto-number]');
  await expect(bonusNumber).toHaveValue('019'); await expect(bonusNumber).not.toBeEditable();
  await chooseDriver(bonus, 'GuestUser'); await expect(bonusNumber).toHaveValue('021');
  await expect(page.locator('.race-review')).toContainText('Ready to review');
  await page.locator('[data-sadd="bonuses"]').click(); await chooseDriver(field(page, 'bonuses', 'driver', 1), 'JordanB'); await field(page, 'bonuses', 'name', 1).selectOption('Fastest lap');
  let draft = await currentDraft(page); expect(draft.records.at(-1).bonuses[1]).toMatchObject({ driver: 'Jordan', driverUsername: 'JordanB', number: '24' });
  expect(draft.records.at(-1).bonuses.some(bonus => 'lapsLed' in bonus || 'totalLaps' in bonus)).toBe(false);
  expect(draft.records.at(-1).finishes.some(finish => 'lapsLed' in finish || 'raceLaps' in finish)).toBe(false);
  await goStep(page, 4); const remove = page.locator('[data-sremove="finishes"][data-srow="3"]'); await openCardFor(remove); page.once('dialog', dialog => dialog.accept()); await remove.click();
  await goStep(page, 5);
  const saved = field(page, 'bonuses', 'driver').locator('option:checked');
  await expect(saved).toHaveAttribute('disabled', ''); await expect(saved).toContainText('not in race finish');
  await page.locator('[data-action="publish"]').first().click(); await expect(page.locator('[data-toast]')).toContainText(/finish/i); expect(published).toHaveLength(0); await expect(page.locator('[data-publish-dialog]')).not.toBeVisible();
  await openCardFor(field(page, 'bonuses', 'driver')); await chooseDriver(field(page, 'bonuses', 'driver'), 'MaxUser');
  await expect(page.locator('.race-review')).toContainText('Ready to review');
  await page.locator('[data-action="publish"]').first().click(); await page.locator('[data-confirm-publish]').click(); await expect.poll(() => published.length).toBe(1);
  expect(published[0].records.at(-1).bonuses.map(bonus => bonus.driverUsername)).toEqual(['MaxUser', 'JordanB']);
});

test('a selected historical driver is retained only in that row and cannot pollute new choices', async ({ page }) => {
  const data = league(); data.records.push(result({ qualifying: [{ position: 1, name: 'Original Name', username: 'RetiredUser', number: '88' }] }));
  await boot(page, data); await page.locator('[data-select]').filter({ hasText: 'Current Test Race' }).click(); await goStep(page, 2);
  const first = field(page, 'qualifying', 'name');
  await expect(first.locator('option:checked')).toHaveAttribute('data-user', 'RetiredUser');
  await expect(first.locator('option:checked')).toContainText('Original Name');
  await page.locator('[data-sadd="qualifying"]').click(); const next = field(page, 'qualifying', 'name', 1);
  expect(await optionUsers(next)).not.toContain('RetiredUser');
  await expect(field(page, 'qualifying', 'number')).toHaveValue('88');
});

test('quick race entry adds participants together, reorders finishes, and keeps the winner and points in sync', async ({page})=>{
 await boot(page,league());await page.locator('.admin-sidebar [data-section="dashboard"]').click();
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-start-race]').click();
 await expect(page.locator('[data-schedule-race]')).toHaveValue('new-race');
 await page.locator('.editor-steps [data-step="4"]').click();
 await page.locator('[data-finisher-picker]>summary').click();
 for(const user of ['MaxUser','HaydenUser']){
  const key=await page.locator('[data-finisher-choice]').evaluateAll((boxes,user)=>boxes.find(box=>box.value.toLowerCase()==='user:'+user.toLowerCase()).value,user);
  await page.locator('[data-finisher-choice][value="'+key+'"]').check();
 }
 await page.locator('[data-add-finishers]').click();
 let record=(await currentDraft(page)).records.at(-1);
 expect(record.finishes.map(row=>[row.name,row.position,row.totalPoints])).toEqual([['Max',1,50],['Hayden',2,45]]);
 expect(record.winner).toBe('Max');
 await page.locator('[data-move-finish="1"][data-direction="-1"]').click();
 record=(await currentDraft(page)).records.at(-1);
 expect(record.finishes.map(row=>[row.name,row.position,row.totalPoints])).toEqual([['Hayden',1,50],['Max',2,45]]);expect(record.winner).toBe('Hayden');
 await openCardFor(field(page,'finishes','number'));
 await field(page,'finishes','number').fill('021');
 const selected=field(page,'finishes','name').locator('option:checked');
 await expect(selected).toContainText('#021');
 await expect(selected).toHaveAttribute('data-number','20');
 const widths=await field(page,'finishes','name').evaluate(select=>({select:select.getBoundingClientRect().width,grid:select.closest('.classification-grid').getBoundingClientRect().width}));
 expect(widths.select/widths.grid).toBeGreaterThan(0.9);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.step-actions [data-step="5"]').click();
 await expect(page.locator('.race-review')).toContainText('2 finishers');
 await expect(page.locator('.race-review')).toContainText('Winner: Hayden');
});


test('public standings keep distinct known and non-roster identities with the same name separate, without laps-led tracking', async ({page})=>{
 const data=league();
 data.records=[result({status:'complete',finishes:[
  {position:1,name:'Jordan',username:'JordanA',number:'23',points:50,stagePoints:0},
  {position:2,name:'Jordan',username:'JordanB',number:'24',points:45,stagePoints:0},
  {position:3,name:'Jordan',username:'JordanOutside',number:'23',points:42,stagePoints:0}
 ]})];
 await page.route('**/.netlify/functions/admin-publish**',route=>route.fulfill({json:{data}}));
 await page.goto('/race-center/');
 const rows=page.locator('[data-rc-standings-body] tr');
 for(const [user,points] of [['JordanA','50'],['JordanB','45'],['JordanOutside','42']]){
  const row=rows.and(page.locator('[data-driver-id="'+user+'"]'));
  await expect(row).toHaveCount(1);await expect(row.locator('.rc-pts')).toHaveText(points);
 }
 await expect(rows.locator('.rc-driver-cell>strong').filter({hasText:/^Jordan$/})).toHaveCount(3);
 await expect(page.locator('[data-rc-stat="lapsLed"]')).toHaveCount(0);
 const headings=await page.locator('[data-rc-panel="standings"] th').allTextContents();
 expect(headings.some(text=>/^LL$|laps led/i.test(text.trim()))).toBe(false);
 await expect(page.locator('[data-rc-compare-rows]')).not.toContainText('Laps led');
});

test('name-only drivers can earn a bonus and an intentionally blank manual number stays blank after recovery', async ({page})=>{
 const data=league();data.drivers.teams=[{name:'Team',entries:[{name:'Max',number:'19',status:'Signed'}]}];data.drivers.profiles={};data.records=[];
 await boot(page,data);await newRace(page);await goStep(page,4);await page.locator('[data-sadd="finishes"]').click();
 const choice=field(page,'finishes','name');await choice.selectOption(await choice.locator('option[data-name="Max"]').getAttribute('value'));
 await field(page,'finishes','number').fill('');
 await goStep(page,5);await page.locator('[data-sadd="bonuses"]').click();
 const award=field(page,'bonuses','driver');await award.selectOption(await award.locator('option[data-name="Max"]').getAttribute('value'));
 let record=(await currentDraft(page)).records.at(-1);expect(record.finishes[0]).toMatchObject({number:'',numberManual:true,mostLapsLed:true,totalPoints:53});
 await page.reload();await expect(page.locator('[data-save-status]')).toContainText('Recovered');
 await page.locator('.admin-sidebar [data-section="results"]').click();await goStep(page,4);await openCardFor(field(page,'finishes','number'));
 await expect(field(page,'finishes','number')).toHaveValue('');
});

test('runtime preserves race guest presentation and never assigns another verified username by display name',async({page})=>{
 await boot(page,league());
 const output=await page.evaluate(()=>{
  const data={drivers:{teams:[{name:'Team',entries:[{user:'roster',name:'Jordan',number:'20'}]}],profiles:{}},events:[],records:[{id:'one',division:'d1',finishes:[{name:'Jordan',username:'retired',number:'88',numberManual:true}]},{id:'two',division:'d1',entries:[{user:'roster',name:'Race Guest Name',number:'021'}],finishes:[{name:'Race Guest Name',username:'roster',number:'021',numberManual:true}]}]};
  return window.UARLData.normalize(data).records.map(record=>record.finishes[0]);
 });
 expect(output[0]).toMatchObject({name:'Jordan',username:'retired',number:'88'});
 expect(output[1]).toMatchObject({name:'Race Guest Name',username:'roster',number:'021'});
});
