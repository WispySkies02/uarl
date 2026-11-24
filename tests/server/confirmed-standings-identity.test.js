import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const drivers = globalThis.UARLResultDrivers;
const standings = globalThis.UARLStandings;
const clone = value => structuredClone(value);

function correction(username, pointsAdjustment, extras = {}) {
  return { id: 'open:' + username.toLowerCase(), division: 'open', username, name: username,
    number: '49', nameManual: true, numberManual: true, pointsAdjustment,
    order: 1, orderManual: true, previousPosition: null, ...extras };
}

function league() {
  return {
    events: [], paints: [], guide: [], history: { league: { winners: [] }, divisions: [] },
    drivers: {
      rosterVersion: 2, assignmentVersion: 1, displayNameVersion: 1,
      aetherwingReturnVersion: 1, jjUsernameVersion: 1,
      teams: [], freeAgents: [], recentMoves: [],
      profiles: { pxssis: { alias: 'Pxssis', wins: 2, championships: 0, rank: 30, numberImage: '/pxssis-number.png' } },
      openEntries: [{ user: 'pxssis', number: '49', make: 'Ford', signatureImage: '/pxssis-signature.png' }]
    },
    race: { drivers: [{ id: 'pxssis', name: 'Pxssis', division: 'open', number: '49', make: 'Ford' }] },
    records: [{ id: 'old-open', division: 'open', pointsEvent: true, finishes: [{ username: 'pxssis', name: 'Pxssis', number: '49', position: 1, points: 4, stagePoints: 1 }] }],
    standings: [
      correction('pxssis', 10, { name: 'Pxssis', order: 16, previousPosition: 15 }),
      correction('Pxssls', 40, { order: 12, previousPosition: 14 })
    ]
  };
}

function repaired(data) {
  drivers.repairConfirmedStandingsIdentities(data);
  return data;
}

test('the confirmed standings typo repairs the saved total once instead of adding it twice', () => {
  const data = league(), before = clone(data);
  const archive = correction('Pxssls', 80, { id: 'd2:pxssls', division: 'd2', order: 3 });
  const independent = correction('OtherRacer', 20, { order: 2 });
  data.standings.push(archive, independent);
  repaired(data);
  const fixed = data.standings.find(row => row.id === 'open:pxssis');
  assert.equal(data.standings.filter(row => row.division === 'open' && row.username.toLowerCase() === 'pxssis').length, 1);
  assert.equal(data.standings.some(row => row.division === 'open' && row.username.toLowerCase() === 'pxssls'), false);
  assert.deepEqual({ name: fixed.name, number: fixed.number, pointsAdjustment: fixed.pointsAdjustment, order: fixed.order, previousPosition: fixed.previousPosition },
    { name: 'Pxssis', number: '49', pointsAdjustment: 35, order: 12, previousPosition: 14 });
  assert.equal(fixed.nameManual, true);
  assert.equal(fixed.numberManual, true);
  assert.equal(fixed.orderManual, true);
  assert.ok(fixed.csvAliases.includes('Pxssls'));
  assert.equal(standings.calculate(data, 'open').find(row => row.id === 'pxssis').points, 40);
  assert.deepEqual(data.standings.find(row => row.id === archive.id), archive);
  assert.deepEqual(data.standings.find(row => row.id === independent.id), independent);
  assert.deepEqual(data.drivers.profiles, before.drivers.profiles);
  assert.deepEqual(data.drivers.openEntries, before.drivers.openEntries);
  assert.deepEqual(data.drivers.teams, before.drivers.teams);
  assert.deepEqual(data.records, before.records);
  assert.equal(data.drivers.standingsIdentityVersion, 1);
  assert.equal(data.drivers.standingsIdentityBackups.length, 1);
  assert.deepEqual(data.drivers.standingsIdentityBackups[0].standings, before.standings);
  assert.deepEqual(standings.validate(data), []);
});

test('a later canonical correction wins over the earlier typo and retains intentional presentation', () => {
  const data = league();
  data.standings = [data.standings[1], correction('pxssis', 70, { name: 'Preferred Name', number: '05', order: 4, previousPosition: 6 })];
  repaired(data);
  assert.equal(data.standings.length, 1);
  assert.equal(data.standings[0].pointsAdjustment, 70);
  assert.equal(data.standings[0].name, 'Preferred Name');
  assert.equal(data.standings[0].number, '05');
  assert.equal(data.standings[0].order, 4);
  assert.equal(data.standings[0].previousPosition, 6);
  assert.equal(standings.calculate(data, 'open')[0].points, 75);
});

test('confirmed spelling repair needs no driver profile and leaves unrelated usernames alone', () => {
  const data = league();
  data.drivers.profiles = {};
  data.drivers.openEntries = [];
  data.race.drivers = [];
  data.records = [];
  data.standings = [correction('PXSSLS', 42)];
  repaired(data);
  assert.deepEqual(data.drivers.profiles, {});
  assert.deepEqual(data.drivers.openEntries, []);
  assert.deepEqual(data.records, []);
  assert.equal(data.standings[0].username, 'pxssis');
  assert.equal(data.standings[0].pointsAdjustment, 42);
  assert.equal(drivers.confirmedStandingsUsername(data, '@Pxssls'), 'pxssis');
  assert.equal(drivers.confirmedStandingsUsername(data, 'PXSSLS'), 'pxssis');
  assert.equal(drivers.confirmedStandingsUsername(data, 'Pxss1s'), 'Pxss1s');
  assert.equal(drivers.confirmedStandingsUsername(data, 'OtherRacer'), 'OtherRacer');
});

test('the repair preserves explicit display and number corrections and does not reapply after later edits', () => {
  const data = league();
  Object.assign(data.standings[1], { name: 'Track Name', number: '005', csvAliases: ['Previous CSV Name'] });
  repaired(data);
  assert.equal(data.standings[0].name, 'Track Name');
  assert.equal(data.standings[0].number, '005');
  assert.ok(data.standings[0].csvAliases.includes('Previous CSV Name'));
  const once = clone(data);
  repaired(data);
  assert.deepEqual(data, once);
  Object.assign(data.standings[0], { name: 'Later Admin Name', number: '5', pointsAdjustment: 95 });
  data.records[0].finishes[0].points = 11;
  const later = clone(data);
  repaired(data);
  assert.deepEqual(data, later);
  assert.equal(standings.calculate(data, 'open')[0].points, 107);
});

test('actual saved accounts, roster identities and historical references prevent automatic typo merging', () => {
  const conflicts = [
    data => { data.drivers.profiles.Pxssls = { alias: 'Separate Account' }; },
    data => { data.drivers.profiles.OtherRacer = { currentUsername: 'Pxssls' }; },
    data => { data.drivers.profiles.OtherRacer = { usernameAliases: ['Pxssls'] }; },
    data => { data.drivers.teams.push({ entries: [{ user: 'Pxssls', number: '49' }] }); },
    data => { data.drivers.teams.push({ entries: [], pendingDrivers: [{ user: 'Pxssls', numberPending: true }] }); },
    data => { data.drivers.openEntries.push({ user: 'Pxssls', number: '49' }); },
    data => { data.drivers.freeAgents.push({ user: 'Pxssls', name: 'Separate Account' }); },
    data => { data.race.drivers.push({ id: 'Pxssls', division: 'd2', number: '49', status: 'FT' }); },
    data => { data.drivers.previousRoster = { profiles: { ArchivedRacer: { usernameAliases: ['Pxssls'] } } }; },
    data => { data.drivers.previousRoster = { archivedDrivers: [{ id: 'Pxssls', division: 'd2', number: '49' }] }; },
    data => { data.records[0].finishes.push({ username: 'Pxssls', name: 'Separate Account', points: 0 }); },
    data => { data.records[0].qualifying = [{ username: 'Pxssls', position: 1 }]; },
    data => { data.records[0].stages = [{ results: [{ username: 'Pxssls', position: 1 }] }]; },
    data => { data.records[0].entries = [{ user: 'Pxssls', number: '49' }]; },
    data => { data.records[0].bonuses = [{ driverUsername: 'Pxssls', points: 0 }]; },
    data => { data.records[0].winnerUsername = 'Pxssls'; },
    data => { data.records[0].poleUsername = 'Pxssls'; }
  ];
  for (const conflict of conflicts) {
    const data = league(); conflict(data);
    const before = clone(data.standings), records = clone(data.records), profiles = clone(data.drivers.profiles);
    repaired(data);
    assert.deepEqual(data.standings, before);
    assert.deepEqual(data.records, records);
    assert.deepEqual(data.drivers.profiles, profiles);
    assert.notEqual(drivers.confirmedStandingsUsername(data, 'Pxssls'), 'pxssis');
  }
});

test('the same confirmed typo repairs D1 and Open independently while keeping each series raw points', () => {
  const data = league();
  data.records.push({ id: 'd1', division: 'd1', finishes: [{ username: 'pxssis', name: 'Pxssis', position: 2, points: 7, stagePoints: 2 }] });
  data.standings.push(correction('Pxssls', 100, { id: 'd1:pxssls', division: 'd1', number: '05', order: 2, previousPosition: 3 }));
  repaired(data);
  assert.equal(data.standings.find(row => row.id === 'open:pxssis').pointsAdjustment, 35);
  assert.equal(data.standings.find(row => row.id === 'd1:pxssis').pointsAdjustment, 91);
  assert.equal(standings.calculate(data, 'open')[0].points, 40);
  assert.equal(standings.calculate(data, 'd1')[0].points, 100);
  assert.equal(data.drivers.standingsIdentityBackups.length, 2);
});

test('generated repair backups do not block Race Control standings changes or permit roster changes', () => {
  const current = league(), next = clone(current);
  next.standings[1].pointsAdjustment = 60;
  assert.equal(raceControlChangeOnly(next, current), true);
  repaired(next);
  const edited = clone(next);
  edited.standings[0].pointsAdjustment = 75;
  assert.equal(raceControlChangeOnly(edited, next), true);
  const rosterEdit = clone(edited);
  rosterEdit.drivers.openEntries[0].make = 'Toyota';
  assert.equal(raceControlChangeOnly(rosterEdit, next), false);
  const profileEdit = clone(edited);
  profileEdit.drivers.profiles.pxssis.alias = 'Unauthorized Name';
  assert.equal(raceControlChangeOnly(profileEdit, next), false);
});
