import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/race-csv.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
const roster = globalThis.UARLResultDrivers, current = globalThis.UARLCurrentRoster;
function previous() {
  const data = structuredClone(original), saved = data.drivers.previousRoster;
  Object.assign(data.drivers, { teams: structuredClone(saved.teams), profiles: structuredClone(saved.profiles), freeAgents: structuredClone(saved.freeAgents), recentMoves: structuredClone(saved.recentMoves) });
  data.standings = structuredClone(saved.standings); delete data.drivers.previousRoster; delete data.drivers.assignmentVersion; delete data.drivers.displayNameVersion;
  data.records = [];
  return data;
}
function normalize(data, helpers = roster) {
  const context = { window: { UARLResultDrivers: helpers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(data);
}

test('the seven teams and twenty drivers match the supplied current roster and manufacturers', () => {
  const data = previous(); current.apply(data);
  assert.deepEqual(data.drivers.teams.map(team => [team.name, team.make]), [
    ['Dakota Sullivan Racing', 'Chevrolet'], ['Avery Motorsports', 'Ford'], ['Goat Whitlock Motorsports', 'Toyota'], ['Goforth Motorsports', 'Ford'], ['Team Penske', 'Ford'], ['Sham Motorsports', 'Ford'], ['Winston-Hermonstyne Motorsports', 'Toyota']
  ]);
  const entries = data.drivers.teams.flatMap(team => team.entries.filter(entry => entry.user).map(entry => ({ ...entry, team: team.name })));
  assert.equal(entries.length, 20); assert.equal(new Set(entries.map(entry => entry.user.toLowerCase())).size, 20);
  for (const [user, number, team] of [['Frogboy4783', '5', 'Avery Motorsports'], ['pa05', '05', 'Avery Motorsports'], ['GuillermoChase', '81', 'Goforth Motorsports'], ['IIKyle5Larson', '22', 'Team Penske'], ['AnyGameAnyTime09', '2', 'Sham Motorsports'], ['Aokikoto', '28', 'Goat Whitlock Motorsports'], ['JamesEklund', '25', 'Goat Whitlock Motorsports'], ['JJElliott2004', '84', 'Goat Whitlock Motorsports'], ['OPTBlitzCC4589', '91', 'Dakota Sullivan Racing'], ['NoodlesLuv2011', '11', 'Winston-Hermonstyne Motorsports']]) assert.equal(entries.find(entry => entry.user === user)?.team + ':' + entries.find(entry => entry.user === user)?.number, team + ':' + number);
  assert.equal(data.drivers.teams.flatMap(team => team.entries).filter(entry => entry.status === 'Pending').length, 3);
  assert.ok(roster.pool(data, { division: 'd1' }).every(driver => !/^(TBD|OPEN|PART TIME)$/i.test(driver.name)));
});

test('moves retain career profiles, signatures, branding and history, and do not reuse artwork for the old number', () => {
  const data = previous();
  const avery = data.drivers.teams.find(team => team.id === 'avery'); avery.owner = 'Saved Owner'; avery.note = 'Saved description'; avery.logo = '/saved-brand.svg';
  data.drivers.profiles.Aokikoto.alias = 'Hailey'; data.drivers.profiles.Aokikoto.signatureImage = '/hailey-signature.png';
  data.drivers.profiles.IIKyle5Larson.numberImage = '/number-92.png'; data.drivers.profiles.IIKyle5Larson.signatureImage = '/regan-signature.png';
  const open = JSON.stringify(data.drivers.openEntries); current.apply(data);
  assert.equal(data.drivers.teams.find(team => team.id === 'avery').owner, 'Saved Owner');
  assert.equal(data.drivers.teams.find(team => team.id === 'avery').note, 'Saved description');
  assert.equal(data.drivers.teams.find(team => team.id === 'avery').logo, '/saved-brand.svg');
  assert.equal(data.drivers.profiles.Aokikoto.alias, 'Hailey'); assert.equal(data.drivers.profiles.Aokikoto.signatureImage, '/hailey-signature.png');
  assert.equal(data.drivers.teams.find(team => team.id === 'whitlock').entries.find(entry => entry.user === 'Aokikoto').numberImage, '/assets/aetherwing/numbers/28.png');
  assert.equal(data.drivers.profiles.IIKyle5Larson.signatureImage, '/regan-signature.png'); assert.equal(data.drivers.profiles.IIKyle5Larson.numberImage, undefined);
  assert.equal(data.drivers.previousRoster.profiles.IIKyle5Larson.numberImage, '/number-92.png');
  assert.ok(data.drivers.previousRoster.teams.some(team => team.id === 'aetherwing'));
  assert.equal(JSON.stringify(data.drivers.openEntries), open);
});

test('both current usernames and older IDs resolve to one driver, with James Eklund distinct from JJ Whitlock', () => {
  const data = previous(); current.apply(data); const people = roster.pool(data, { division: 'd1' });
  assert.equal(roster.resolve(people, 'Muffin').user, 'AnyGameAnyTime09');
  assert.equal(roster.resolve(people, '', 'Muffin').user, 'AnyGameAnyTime09');
  assert.equal(roster.resolve(people, '', 'kingofgamez_YT').user, 'Kingofgamez');
  assert.equal(roster.resolve(people, 'Max Stidham').user, 'FueledByMayonnaise');
  assert.equal(roster.resolve(people, '', 'JamesEklund').number, '25');
  assert.equal(roster.resolve(people, '', 'JJElliott2004').number, '84');
  assert.equal(roster.resolve(people, 'King', 'UnknownVerifiedUser'), undefined);
  for (const driver of data.drivers.teams.flatMap(team => team.entries).filter(entry => entry.user)) assert.ok(!data.drivers.freeAgents.some(entry => entry.user === driver.user));
});

test('merging an existing current username keeps past points and archived race numbers attached to the same person', () => {
  const data = previous();
  data.drivers.profiles.AnyGameAnyTime09.wins = 4;
  data.drivers.profiles.Muffin = { alias: 'Muffin', wins: 0, signatureImage: '/new-signature.png' };
  data.records = [{ id: 'old', division: 'd1', finishes: [{ position: 1, username: 'AnyGameAnyTime09', name: 'Muffin', number: '84', numberManual: true, points: 50 }] }, { id: 'new', division: 'd1', finishes: [{ position: 2, username: 'Muffin', name: 'Muffin', number: '2', points: 45 }] }];
  data.standings = [{ id: 'd1:anygameanytime09', division: 'd1', username: 'AnyGameAnyTime09', name: 'Muffin', number: '84', pointsAdjustment: 10, previousPosition: null, order: 1 }, { id: 'd1:muffin', division: 'd1', username: 'Muffin', name: 'Muffin', number: '2', pointsAdjustment: 5, previousPosition: null, order: 1 }];
  normalize(data);
  assert.equal(data.drivers.profiles.Muffin.wins, 4); assert.equal(data.drivers.profiles.Muffin.signatureImage, '/new-signature.png');
  assert.equal(data.drivers.profiles.AnyGameAnyTime09, undefined);
  assert.equal(data.records[0].finishes[0].username, 'Muffin'); assert.equal(data.records[0].finishes[0].number, '84');
  assert.equal(data.standings.length, 1); assert.equal(data.standings[0].pointsAdjustment, 5);
  const rows = globalThis.UARLStandings.calculate(data, 'd1');
  assert.equal(rows.filter(row => row.id === 'Muffin').length, 1); assert.equal(rows.find(row => row.id === 'Muffin').points, 100);
});

test('the update applies once and subsequent manual roster and manufacturer changes survive', () => {
  const data = previous(); roster.register(data); const once = JSON.stringify(data); roster.register(data); assert.equal(JSON.stringify(data), once);
  const team = data.drivers.teams.find(team => team.id === 'sham'); team.make = 'Toyota'; team.entries[0].number = '7';
  roster.register(data); assert.equal(team.make, 'Toyota'); assert.equal(team.entries[0].number, '7');
  data.drivers.profiles.Aokikoto.alias = 'Updated Display';
  assert.equal(roster.pool(data, { division: 'd1' }).find(driver => driver.user === 'Aokikoto').name, 'Updated Display');
});

test('Race Control can publish the automatic update and scores but cannot inject roster changes through an old version marker', () => {
  const old = normalize(previous(), null), next = normalize(structuredClone(old));
  next.records.push({ id: 'race', division: 'd1', finishes: [] });
  assert.equal(raceControlChangeOnly(next, old), true);
  const changed = structuredClone(next); changed.drivers.teams[0].owner = 'Injected owner'; changed.drivers.assignmentVersion = 0;
  assert.equal(raceControlChangeOnly(changed, old), false);
  const legacy = structuredClone(old); legacy.standings = [{ id: 'd1:un88475544', division: 'd1', username: 'UN88475544', name: 'Haydon', number: '20', pointsAdjustment: 5, previousPosition: null, order: 1 }];
  assert.equal(raceControlChangeOnly(legacy, old), true);
});
