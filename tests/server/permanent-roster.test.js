import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/race-csv.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const roster = globalThis.UARLResultDrivers, csv = globalThis.UARLRaceCSV;
const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
const source = `FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed
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
function previousData() {
  const data = structuredClone(original);
  delete data.drivers.rosterVersion;
  Object.values(data.drivers.profiles).forEach(profile => { delete profile.csvAliases; delete profile.csvDivisions; });
  return data;
}
function normalize(data, helpers = roster) {
  const context = { window: { UARLResultDrivers: helpers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(data);
}

test('the exact ten-driver CSV resolves permanent identities, including line 6, with no race entries', () => {
  const data = previousData(); roster.register(data);
  const record = { division: 'd1', qualifying: [], stages: [], finishes: [], bonuses: [] };
  const result = csv.results(source, data, record);
  assert.deepEqual(result.errors, []);
  assert.equal(result.record.finishes.length, 10);
  assert.equal(result.record.finishes[0].username, 'UN88475544');
  assert.equal(result.record.finishes[1].username, 'IIKyle5Larson');
  assert.equal(result.record.finishes[4].username, 'AnyGameAnyTime09');
  assert.equal(result.record.finishes[4].number, '2');
  assert.equal(result.record.finishes[7].username, 'Aokikoto');
  assert.equal(Object.hasOwn(result.record, 'entries'), false);
  for (const value of ['Nurtec', 'UN88475544']) assert.deepEqual(csv.results(source.replace('Haydon Hildebrand', value), data, record).errors, []);
  assert.deepEqual(csv.results(source.replace('Muffin', 'AnyGameAnyTime09'), data, record).errors, []);
});

test('migration preserves current names, aliases, artwork, teams and manually changed car numbers', () => {
  const data = previousData();
  data.drivers.profiles.Aokikoto.alias = 'Hailey';
  data.drivers.profiles.UN88475544.alias = 'Haydon';
  data.drivers.profiles.UN88475544.csvAliases = ['Haydon H.'];
  data.drivers.profiles.AnyGameAnyTime09.signatureImage = '/muffin-signature.webp';
  const team = data.drivers.teams.find(team => team.entries.some(entry => entry.user === 'UN88475544'));
  const seat = team.entries.find(entry => entry.user === 'UN88475544'); seat.number = '021';
  const teams = JSON.stringify(data.drivers.teams);
  roster.register(data); const once = JSON.stringify(data); roster.register(data);
  assert.equal(JSON.stringify(data), once);
  assert.equal(JSON.stringify(data.drivers.teams), teams);
  assert.equal(data.drivers.profiles.Aokikoto.alias, 'Hailey');
  assert.equal(data.drivers.profiles.AnyGameAnyTime09.signatureImage, '/muffin-signature.webp');
  const people = roster.pool(data, { division: 'd1' });
  for (const name of ['Haydon', 'Nurtec', 'Haydon Hildebrand', 'Haydon H.']) assert.equal(roster.resolve(people, name).user, 'UN88475544');
  assert.equal(roster.resolve(people, 'Nurtec').number, '021');
  for (const name of ['Wispy', 'Hailey', 'Hailey Bell']) assert.equal(roster.resolve(people, name).name, 'Hailey');
  assert.equal(people.filter(person => person.user === 'UN88475544').length, 1);
  assert.equal(people.filter(person => person.user === 'AnyGameAnyTime09').length, 1);
});

test('permanent drivers work in results and standings for their series without a team assignment', () => {
  const data = previousData(); data.records = []; roster.register(data);
  assert.ok(roster.pool(data, { division: 'd1' }).some(driver => driver.user === 'AnyGameAnyTime09'));
  assert.ok(!roster.pool(data, { division: 'open' }).some(driver => driver.user === 'AnyGameAnyTime09'));
  const result = csv.standings('Position,+/-,Driver#,DriverName,Points\n1,+1,,Muffin,100', data, 'd1');
  assert.deepEqual(result.errors, []);
  const muffin = result.rows.find(row => row.id === 'AnyGameAnyTime09');
  assert.equal(muffin.points, 100); assert.equal(muffin.number, '2');
  data.drivers.profiles.PendingUser = { alias: 'Number Pending', csvDivisions: ['d1'] };
  const pending = csv.standings('Position,+/-,Driver#,DriverName,Points\n1,0,,Number Pending,100', data, 'd1');
  assert.deepEqual(pending.errors, []); assert.equal(pending.rows[0].number, '');
  data.drivers.profiles.AnyGameAnyTime09.csvDivisions.push('open');
  assert.ok(roster.pool(data, { division: 'open' }).some(driver => driver.user === 'AnyGameAnyTime09'));
  data.drivers.profiles.AnyGameAnyTime09.csvDivisions = [];
  roster.register(data);
  assert.ok(!roster.pool(data, { division: 'd1' }).some(driver => driver.user === 'AnyGameAnyTime09'));
});

test('other known free agents are permanent D1 drivers without reusing their former charter numbers', () => {
  const data = previousData(); roster.register(data);
  const choices = roster.pool(data, { division: 'd1' });
  const jay = roster.resolve(choices, 'Jay Vixen');
  assert.equal(jay.user, 'Comodw'); assert.equal(jay.number, '');
  assert.equal(choices.filter(driver => driver.user === 'Comodw').length, 1);
  assert.equal(data.drivers.freeAgents.find(driver => driver.user === 'Comodw').former, '#9 · Goat Whitlock Motorsports · Toyota');
  assert.deepEqual(csv.results('FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed\n1,Jay Vixen,,,,No,No', data, { division: 'd1' }).errors, []);
});

test('saved published data and browser drafts receive the same registration and keep existing points identities', () => {
  const data = previousData(); data.drivers.profiles.UN88475544.alias = 'Haydon';
  data.records = [{ id: 'saved', division: 'd1', finishes: [{ name: 'Nurtec', username: 'guest:d1:nurtec', position: 1, points: 50 }, { name: 'Muffin', position: 2, points: 45 }] }];
  const normalized = normalize(data), finishes = normalized.records[0].finishes;
  assert.equal(finishes[0].username, 'UN88475544'); assert.equal(finishes[0].name, 'Haydon');
  assert.equal(finishes[1].username, 'AnyGameAnyTime09');
  assert.equal(normalized.race.drivers.filter(driver => driver.id === 'AnyGameAnyTime09' && driver.division === 'd1').length, 1);
  assert.equal(globalThis.UARLStandings.calculate(normalized, 'd1').find(driver => driver.id === 'AnyGameAnyTime09').points, 45);
  assert.equal(JSON.stringify(normalize(structuredClone(normalized))), JSON.stringify(normalized));
});

test('legacy verified race entries migrate once and keep their recorded presentation and numbers', () => {
  const data = previousData();
  data.records = [{ id: 'legacy', division: 'd1', entries: [{ user: 'LegacyUser', name: 'Legacy Driver', number: '007' }, { name: 'Unverified Driver', number: '008' }], finishes: [{ username: 'LegacyUser', name: 'Legacy Driver', number: '007', points: 50 }] }];
  roster.register(data);
  assert.ok(roster.pool(data, { division: 'd1' }).some(driver => driver.user === 'LegacyUser'));
  assert.equal(data.drivers.profiles.LegacyUser.number, undefined);
  assert.deepEqual(data.records[0].entries[0], { user: 'LegacyUser', name: 'Legacy Driver', number: '007' });
  assert.ok(!Object.keys(data.drivers.profiles).some(key => /Unverified/.test(key)));
  assert.equal(roster.resolve(roster.pool(data, data.records[0]), 'Legacy Driver').number, '007');
});

test('alias collisions require a username and never merge verified drivers', () => {
  const data = previousData(); roster.register(data);
  data.drivers.profiles.OtherUser = { alias: 'Other Driver', csvAliases: ['Muffin'], csvDivisions: ['d1'] };
  const result = csv.results('FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed\n1,Muffin,,,,No,No', data, { division: 'd1' });
  assert.ok(result.errors.some(error => /ambiguous/.test(error)));
  const exact = csv.results('FinishingPosition,Driver,Qualifying,Stage1,Stage2,FastestLap,MostLapsLed\n1,AnyGameAnyTime09,,,,No,No', data, { division: 'd1' });
  assert.deepEqual(exact.errors, []); assert.equal(exact.record.finishes[0].username, 'AnyGameAnyTime09');
});

test('Race Control can publish the migrated dataset but cannot change the permanent roster or D2 archive', () => {
  // Published records from the previous version already contain its normalized
  // roster order and derived paint metadata.
  const current = normalize(previousData(), null), next = normalize(structuredClone(current));
  next.records.push({ id: 'new', division: 'd1', finishes: [{ username: 'AnyGameAnyTime09', name: 'Muffin', points: 50 }] });
  assert.equal(raceControlChangeOnly(next, current), true);
  const edited = structuredClone(next); edited.drivers.profiles.AnyGameAnyTime09.alias = 'Changed by Race Control';
  assert.equal(raceControlChangeOnly(edited, current), false);
  const archived = structuredClone(next); archived.race.drivers.find(driver => driver.division === 'd2').name = 'Changed archive';
  assert.equal(raceControlChangeOnly(archived, current), false);
});

test('Muffin gets his confirmed number in version-one data while saved race numbers and later edits survive', () => {
  const data = structuredClone(original); data.drivers.rosterVersion = 1;
  data.drivers.profiles.AnyGameAnyTime09.number = '';
  data.drivers.teams.push({ name: 'Existing Team', entries: [{ user: 'AnyGameAnyTime09', number: '84' }] });
  data.standings = [{ division: 'd1', username: 'AnyGameAnyTime09', number: '' }, { division: 'd2', username: 'AnyGameAnyTime09', number: '84' }];
  data.records = [{ division: 'd1', finishes: [{ name: 'Muffin', username: 'AnyGameAnyTime09', number: '84', numberManual: true }] }];
  const previous = structuredClone(data);
  roster.register(data);
  assert.equal(raceControlChangeOnly(data, previous), true);
  assert.equal(data.drivers.rosterVersion, 2);
  assert.equal(data.drivers.profiles.AnyGameAnyTime09.number, '2');
  assert.equal(data.drivers.teams.at(-1).entries[0].number, '2');
  assert.equal(data.standings[0].number, '2'); assert.equal(data.standings[1].number, '84');
  assert.equal(data.records[0].finishes[0].number, '84');
  data.drivers.profiles.AnyGameAnyTime09.number = '7'; data.drivers.teams.at(-1).entries[0].number = '7';
  roster.register(data);
  assert.equal(roster.resolve(roster.pool(data, { division: 'd1' }), 'Muffin').number, '7');
});
