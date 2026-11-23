import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/race-csv.js';
import '../../assets/driver-csv.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
const header = 'DriverName,Username,Driver#,Team';
const csv = rows => header + '\n' + rows.join('\n');
const team = (drivers, id) => drivers.teams.find(row => row.id === id);

function league() {
  const data = structuredClone(original);
  data.drivers.teams = [
    { id: 'source', name: 'Source Racing', make: 'Toyota', entries: [
      { user: 'ExistingUser', name: 'Existing Display', number: '19', status: 'Full-Time', seatType: 'Full-Time', charterType: 'FT', numberImage: '/19.png', signatureImage: '/entry-signature.png' },
      { user: 'OtherUser', name: 'Another Driver', number: '20', status: 'Full-Time' }
    ], pendingDrivers: [] },
    { id: 'csv', name: 'CSV Racing', make: 'Ford', logo: '/csv-logo.png', entries: [
      { name: 'OPEN', number: '05', status: 'Open FT', seatType: 'Full-Time', charterType: 'FT', customCharterFlag: true },
      { name: 'OPEN', number: '5', status: 'Open PT', seatType: 'Part-Time', charterType: 'PT' }
    ], pendingDrivers: [] }
  ];
  data.drivers.profiles = {
    ExistingUser: { alias: 'Existing Display', currentUsername: 'CurrentUser22', usernameAliases: ['FormerUser22'], csvAliases: ['Older Display'], csvDivisions: ['d1', 'open'], number: '19', wins: 7, championships: 2, rank: 4, numberImage: '/profile-19.png', signatureImage: '/profile-signature.png' },
    OtherUser: { alias: 'Another Driver', csvDivisions: ['d1'], number: '20', wins: 1 }
  };
  data.drivers.openEntries = [{ user: 'ExistingUser', number: '99', make: 'Chevrolet', signatureImage: '/open-signature.png' }];
  data.drivers.freeAgents = [{ user: 'ExistingUser', name: 'Old Existing Display', former: 'Previous Racing' }];
  data.drivers.recentMoves = [];
  data.records = [{ id: 'past-race', division: 'd1', finishes: [{ username: 'ExistingUser', name: 'Race Display', number: '019', position: 1, points: 42, make: 'Chevrolet' }] }];
  data.standings = [{ id: 'd1:existinguser', division: 'd1', username: 'ExistingUser', name: 'Saved Display', number: '19', nameManual: true, pointsAdjustment: 100, previousPosition: 3 }];
  data.race.drivers = [
    { id: 'ExistingUser', name: 'Existing Display', number: '19', division: 'd1', make: 'Toyota', status: 'Full-Time' },
    { id: 'ExistingUser', name: 'Archived Display', number: '37', division: 'd2', make: 'Ford', status: 'FT' }
  ];
  return data;
}

function preview(source, data) {
  const before = JSON.stringify(data);
  const result = globalThis.UARLDriverCSV.preview(source, data);
  assert.equal(JSON.stringify(data), before, 'preview must not mutate the source dataset');
  return result;
}

function accepted(source, data) {
  const result = preview(source, data);
  assert.deepEqual(result.errors, []);
  assert.ok(result.drivers, 'a valid preview must supply an applicable driver draft');
  return result;
}

function rejected(source, data) {
  const result = preview(source, data);
  assert.ok(result.errors.length > 0);
  assert.ok(!result.drivers, 'invalid batches must not supply partially applied driver data');
  return result;
}

test('driver CSV accepts BOM and quoted names while preserving distinct 05 and 5 seats', () => {
  const data = league();
  const result = accepted('\uFEFF' + header + '\r\n"Driver, One",FirstCsv22,05,cSv RaCiNg\r\nDriver Two,SecondCsv22,5,CSV', data);
  assert.deepEqual(result.rows.map(row => row.number), ['05', '5']);
  assert.deepEqual(team(result.drivers, 'csv').entries.map(row => [row.user, row.number]), [['FirstCsv22', '05'], ['SecondCsv22', '5']]);
  assert.equal(result.drivers.profiles.FirstCsv22.alias, 'Driver, One');
  assert.equal(team(result.drivers, 'csv').entries[0].customCharterFlag, true);
  assert.equal(team(result.drivers, 'csv').entries[0].charterType, 'FT');
  assert.equal(team(result.drivers, 'csv').entries[1].charterType, 'PT');
  assert.deepEqual(globalThis.UARLRaceCSV.headers.results, ['FinishingPosition', 'Driver', 'Qualifying', 'Stage1', 'Stage2', 'FastestLap', 'MostLapsLed']);
  assert.deepEqual(globalThis.UARLRaceCSV.headers.standings, ['Position', '+/-', 'Driver#', 'DriverName', 'Points']);
});

test('an unassigned CSV driver becomes a permanent D1 profile without inventing a team or race record', () => {
  const data = league();
  const result = accepted(csv(['Standalone Driver,@NewDriver22,005,']), data);
  const profile = result.drivers.profiles.NewDriver22;
  assert.equal(profile.alias, 'Standalone Driver');
  assert.equal(profile.number, '005');
  assert.ok(profile.csvDivisions.includes('d1'));
  assert.deepEqual(result.drivers.teams, data.drivers.teams);
  assert.deepEqual(result.drivers.openEntries, data.drivers.openEntries);
  assert.deepEqual(data.records[0].finishes[0], { username: 'ExistingUser', name: 'Race Display', number: '019', position: 1, points: 42, make: 'Chevrolet' });
});

test('legacy placeholder numbers remain pending when a blank-number CSV assigns a team', () => {
  const data = league();
  data.drivers.profiles.LegacyPending22 = { alias: 'Legacy Pending', number: 'TBD', csvDivisions: ['d1'], wins: 2 };
  const result = accepted(csv(['Pending Updated,LegacyPending22,,csv']), data);
  assert.equal(result.rows[0].number, '');
  assert.equal(result.drivers.profiles.LegacyPending22.number, '');
  assert.equal(result.drivers.profiles.LegacyPending22.wins, 2);
  const pending = team(result.drivers, 'csv').pendingDrivers[0];
  assert.equal(pending.user, 'LegacyPending22');
  assert.equal(pending.number, '');
  assert.equal(pending.numberPending, true);
});

test('filling a vacancy retains charter metadata and uses only the incoming driver’s personal artwork', () => {
  const data = league(), seat = team(data.drivers, 'csv').entries[0];
  Object.assign(seat, { numberImage: '/previous-number.png', signatureImage: '/previous-signature.png', signedAt: '2026-01-01', recent: true });
  const fresh = accepted(csv(['Fresh Driver,FreshArt22,05,csv']), data);
  const filled = team(fresh.drivers, 'csv').entries[0];
  for (const field of ['numberImage', 'signatureImage', 'signedAt', 'recent']) assert.equal(filled[field], undefined);
  assert.equal(filled.customCharterFlag, true);
  data.drivers.profiles.RegisteredArt22 = { alias: 'Registered Driver', number: '05', numberImage: '/own-number.png', signatureImage: '/own-signature.png', csvDivisions: ['d1'] };
  const assigned = accepted(csv(['Registered Driver,RegisteredArt22,05,csv']), data);
  const own = team(assigned.drivers, 'csv').entries[0];
  assert.equal(own.numberImage, '/own-number.png');
  assert.equal(own.signatureImage, '/own-signature.png');
  assert.equal(own.signedAt, undefined);
  assert.equal(own.recent, undefined);
});

test('JJ current-username imports keep his original identity, career, artwork, points and independent Open entry', () => {
  const data = structuredClone(original);
  Object.assign(data.drivers.profiles.JJElliott2004, { alias: 'JJ Before Import', numberImage: '/jj84.png', signatureImage: '/jj-signature.png' });
  const otherJames = structuredClone(data.drivers.profiles.JamesEklund);
  const previousPoints = globalThis.UARLStandings.calculate(data, 'd1').find(row => row.id === 'JJElliott2004').points;
  const result = accepted(csv(['JJ Updated,@jamesracer22,84,Goat Whitlock Motorsports']), data);
  const profile = result.drivers.profiles.JJElliott2004;
  assert.equal(profile.alias, 'JJ Updated');
  assert.equal(profile.currentUsername, 'JamesRacer22');
  assert.equal(result.drivers.profiles.JamesRacer22, undefined);
  assert.equal(profile.wins, data.drivers.profiles.JJElliott2004.wins);
  assert.equal(profile.championships, data.drivers.profiles.JJElliott2004.championships);
  assert.equal(profile.numberImage, '/jj84.png');
  assert.equal(profile.signatureImage, '/jj-signature.png');
  assert.ok(profile.csvAliases.includes('JJ Before Import'));
  for (const alias of data.drivers.profiles.JJElliott2004.usernameAliases) {
    assert.ok(profile.usernameAliases.some(saved => saved.toLowerCase() === alias.toLowerCase()));
  }
  assert.deepEqual(result.drivers.profiles.JamesEklund, otherJames);
  assert.deepEqual(result.drivers.openEntries, data.drivers.openEntries);
  const jj = team(result.drivers, 'whitlock').entries.filter(row => row.user === 'JJElliott2004');
  assert.equal(jj.length, 1);
  assert.equal(jj[0].number, '84');
  const next = { ...data, drivers: result.drivers };
  assert.equal(globalThis.UARLStandings.calculate(next, 'd1').find(row => row.id === 'JJElliott2004').points, previousPoints);
});

test('blank team and number fields update an existing profile without moving or renumbering its assignment', () => {
  const data = league();
  const result = accepted(csv(['Renamed Display,formeruser22,,']), data);
  const entry = team(result.drivers, 'source').entries[0];
  assert.equal(entry.user, 'ExistingUser');
  assert.equal(entry.number, '19');
  assert.equal(entry.name, 'Renamed Display');
  assert.equal(result.drivers.profiles.ExistingUser.currentUsername, 'CurrentUser22');
  assert.ok(result.drivers.profiles.ExistingUser.csvAliases.includes('Existing Display'));
  assert.deepEqual(team(result.drivers, 'csv'), team(data.drivers, 'csv'));
});

test('transferring a known account fills an open charter and preserves the driver and unrelated series', () => {
  const data = league();
  const result = accepted(csv(['Moved Display,CurrentUser22,05,csv']), data);
  const source = team(result.drivers, 'source').entries[0], target = team(result.drivers, 'csv').entries[0];
  assert.equal(source.user, undefined);
  assert.equal(source.number, '19');
  assert.equal(source.name, 'OPEN');
  assert.match(source.status, /^Open/);
  assert.equal(source.charterType, 'FT');
  assert.equal(target.user, 'ExistingUser');
  assert.equal(target.number, '05');
  assert.equal(target.name, 'Moved Display');
  assert.equal(target.customCharterFlag, true);
  assert.equal(target.charterType, 'FT');
  assert.equal(target.numberImage, '/19.png');
  assert.equal(target.signatureImage, '/entry-signature.png');
  assert.equal(result.drivers.profiles.ExistingUser.wins, 7);
  assert.equal(result.drivers.profiles.ExistingUser.championships, 2);
  assert.equal(result.drivers.profiles.ExistingUser.numberImage, '/profile-19.png');
  assert.deepEqual(result.drivers.openEntries, data.drivers.openEntries);
  assert.deepEqual(result.drivers.recentMoves, data.drivers.recentMoves);
  assert.equal(result.drivers.freeAgents.some(row => row.user === 'ExistingUser'), false);
  assert.ok((result.warnings || []).some(warning => /art/i.test(warning)));
  assert.equal(raceControlChangeOnly(data, data), true);
  assert.equal(raceControlChangeOnly({ ...data, drivers: result.drivers }, data), false);
});

test('invalid rows, unknown teams, occupied seats and malformed headers reject the entire CSV atomically', () => {
  const cases = [
    csv(['New Driver,NewDriver22,11,Unknown Racing']),
    csv(['New Driver,invalid username,11,']),
    csv(['New Driver,xy,11,']),
    csv(['New Driver,NewDriver22,0005,']),
    csv(['New Driver,NewDriver22,20,Source Racing']),
    csv([',NewDriver22,11,']),
    'DriverName,Username,DriverNumber,Team\nNew Driver,NewDriver22,11,',
    csv(['New Driver,NewDriver22,11,', 'Bad Driver,OtherNew22,12,Unknown Racing'])
  ];
  for (const source of cases) rejected(source, league());
});

test('duplicate accounts, alias collisions and duplicate team numbers cannot combine drivers or overwrite a row', () => {
  rejected(csv(['Same Driver,ExistingUser,19,source', 'Same Driver,CurrentUser22,19,source']), league());
  rejected(csv(['First,FirstCsv22,05,csv', 'Second,SecondCsv22,05,csv']), league());
  const ambiguous = league();
  ambiguous.drivers.profiles.OtherUser.usernameAliases = ['CurrentUser22'];
  rejected(csv(['Who Is This,CurrentUser22,,']), ambiguous);
  const duplicateTeam = league();
  duplicateTeam.drivers.teams.push({ id: 'other-csv', name: 'CSV Racing', make: 'Toyota', entries: [] });
  rejected(csv(['New Driver,NewDriver22,11,CSV Racing']), duplicateTeam);
});

test('matching display names and car numbers never merge distinct verified accounts', () => {
  const data = league();
  const result = accepted(csv(['Existing Display,SeparateUser22,19,']), data);
  assert.equal(result.drivers.profiles.SeparateUser22.alias, 'Existing Display');
  assert.equal(result.drivers.profiles.SeparateUser22.number, '19');
  assert.equal(result.drivers.profiles.ExistingUser.currentUsername, 'CurrentUser22');
  assert.equal(result.drivers.profiles.ExistingUser.wins, 7);
  assert.equal(team(result.drivers, 'source').entries[0].user, 'ExistingUser');
});

test('an assigned team with no available number creates a pending driver rather than an undefined car', () => {
  const data = league();
  const result = accepted(csv(['Pending Driver,PendingCsv22,,CSV Racing']), data);
  const destination = team(result.drivers, 'csv');
  assert.equal(destination.entries.some(row => row.user === 'PendingCsv22'), false);
  const pending = destination.pendingDrivers.filter(row => row.user === 'PendingCsv22');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].numberPending, true);
  assert.ok(pending[0].number == null || pending[0].number === '');
  assert.equal(result.rows[0].number, '');
});

test('valid usernames that match object-prototype names become own profiles without prototype pollution', () => {
  const result = accepted(csv(['Prototype Driver,__proto__,13,', 'Constructor Driver,constructor,14,']), league());
  assert.equal(Object.hasOwn(result.drivers.profiles, '__proto__'), true);
  assert.equal(Object.hasOwn(result.drivers.profiles, 'constructor'), true);
  assert.equal(result.drivers.profiles.__proto__.alias, 'Prototype Driver');
  assert.equal(result.drivers.profiles.constructor.alias, 'Constructor Driver');
  assert.equal(Object.getPrototypeOf(result.drivers.profiles), Object.prototype);
  assert.equal({}.alias, undefined);
});
