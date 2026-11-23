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

function preview(source, data, division) {
  const before = JSON.stringify(data);
  const result = globalThis.UARLDriverCSV.preview(source, data, division);
  assert.equal(JSON.stringify(data), before, 'preview must not mutate the source dataset');
  return result;
}

function accepted(source, data, division) {
  const result = preview(source, data, division);
  assert.deepEqual(result.errors, []);
  assert.ok(result.drivers, 'a valid preview must supply an applicable driver draft');
  return result;
}

function rejected(source, data, division) {
  const result = preview(source, data, division);
  assert.ok(result.errors.length > 0);
  assert.ok(!result.drivers, 'invalid batches must not supply partially applied driver data');
  return result;
}

function openOnlyLeague() {
  const data = league();
  data.drivers = accepted(csv(['Open Solo,OpenSolo22,05,Independent Squad']), data, 'open').drivers;
  return data;
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

test('new and unassigned D1 drivers require a team and reject the entire batch without changing saved free agents', () => {
  const data = league();
  data.drivers.profiles.Unassigned22 = { alias: 'Saved Free Agent', number: '005', csvDivisions: ['d1'], wins: 3, numberImage: '/free-agent-005.png' };
  data.drivers.freeAgents.push({ user: 'Unassigned22', name: 'Saved Free Agent', former: 'Previous Team' });
  const before = structuredClone(data);
  for (const rows of [
    ['Standalone Driver,@NewDriver22,005,'],
    ['Standalone Driver,@NewDriver22,005,   '],
    ['Updated Free Agent,Unassigned22,,'],
    ['Valid Driver,ValidDriver22,05,csv', 'Standalone Driver,@NewDriver22,005,']
  ]) {
    const result = rejected(csv(rows), data, 'd1');
    assert.ok(result.errors.some(error => /Team is required for D1/.test(error)));
  }
  assert.deepEqual(data, before);
  assert.equal(data.drivers.profiles.NewDriver22, undefined);
  assert.equal(data.drivers.profiles.ValidDriver22, undefined);
});

test('Open drivers can register with a blank Team without adding D1 assignments or inventing a team', () => {
  const data = league(), before = structuredClone(data);
  const result = accepted(csv(['Standalone Driver,@NewDriver22,005,']), data, 'open');
  const profile = result.drivers.profiles.NewDriver22;
  const entry = result.drivers.openEntries.find(row => row.user === 'NewDriver22');
  assert.equal(profile.alias, 'Standalone Driver');
  assert.equal(profile.number, '005');
  assert.deepEqual(profile.csvDivisions, ['open']);
  assert.equal(entry.number, '005');
  assert.equal(entry.team, undefined);
  assert.equal(entry.make, 'Generic');
  assert.deepEqual(result.drivers.teams, before.drivers.teams);
  assert.deepEqual(result.drivers.freeAgents, before.drivers.freeAgents);
  assert.deepEqual(result.drivers.openEntries.filter(row => row.user !== 'NewDriver22'), before.drivers.openEntries);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.standings, before.standings);
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
    csv(['New Driver,invalid username,11,csv']),
    csv(['New Driver,xy,11,csv']),
    csv(['New Driver,NewDriver22,0005,csv']),
    csv(['New Driver,NewDriver22,20,Source Racing']),
    csv([',NewDriver22,11,csv']),
    'DriverName,Username,DriverNumber,Team\nNew Driver,NewDriver22,11,csv',
    csv(['New Driver,NewDriver22,11,csv', 'Bad Driver,OtherNew22,12,Unknown Racing'])
  ];
  for (const source of cases) rejected(source, league());
});

test('duplicate accounts, alias collisions and duplicate team numbers cannot combine drivers or overwrite a row', () => {
  rejected(csv(['Same Driver,ExistingUser,19,source', 'Same Driver,CurrentUser22,19,source']), league());
  rejected(csv(['First,FirstCsv22,05,csv', 'Second,SecondCsv22,05,csv']), league());
  const ambiguous = league();
  ambiguous.drivers.profiles.OtherUser.usernameAliases = ['CurrentUser22'];
  rejected(csv(['Who Is This,CurrentUser22,,csv']), ambiguous);
  const duplicateTeam = league();
  duplicateTeam.drivers.teams.push({ id: 'other-csv', name: 'CSV Racing', make: 'Toyota', entries: [] });
  rejected(csv(['New Driver,NewDriver22,11,CSV Racing']), duplicateTeam);
});

test('matching display names and car numbers never merge distinct verified accounts', () => {
  const data = league();
  const result = accepted(csv(['Existing Display,SeparateUser22,19,csv']), data);
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
  const result = accepted(csv(['Prototype Driver,__proto__,13,csv', 'Constructor Driver,constructor,14,csv']), league());
  assert.equal(Object.hasOwn(result.drivers.profiles, '__proto__'), true);
  assert.equal(Object.hasOwn(result.drivers.profiles, 'constructor'), true);
  assert.equal(result.drivers.profiles.__proto__.alias, 'Prototype Driver');
  assert.equal(result.drivers.profiles.constructor.alias, 'Constructor Driver');
  assert.equal(Object.getPrototypeOf(result.drivers.profiles), Object.prototype);
  assert.equal({}.alias, undefined);
});

test('Open imports update the same person and independent entry while preserving D1 assignments, number artwork and career data', () => {
  const data = league();
  Object.assign(data.drivers.openEntries[0], {
    name: 'Original Open Display', team: 'Independent Original', status: 'Part-Time',
    numberImage: '/open-99.png', sponsorNote: 'Keep this Open metadata'
  });
  const before = structuredClone(data);
  const result = accepted(csv(['Open Display,CurrentUser22,99,Independent New Squad']), data, 'open');
  assert.equal(result.division, 'open');
  assert.equal(result.rows[0].user, 'ExistingUser');
  assert.equal(result.drivers.openEntries.length, 1);
  assert.deepEqual(result.drivers.openEntries[0], {
    ...before.drivers.openEntries[0], user: 'ExistingUser', name: 'Open Display', team: 'Independent New Squad'
  });
  assert.equal(result.drivers.profiles.CurrentUser22, undefined);
  assert.equal(result.drivers.profiles.ExistingUser.alias, 'Open Display');
  for (const field of ['number', 'numberImage', 'signatureImage', 'wins', 'championships', 'rank']) {
    assert.equal(result.drivers.profiles.ExistingUser[field], before.drivers.profiles.ExistingUser[field], field);
  }
  assert.ok(result.drivers.profiles.ExistingUser.csvAliases.includes('Existing Display'));
  assert.deepEqual(result.drivers.teams, before.drivers.teams);
  assert.deepEqual(result.drivers.freeAgents, before.drivers.freeAgents);
  assert.deepEqual(result.drivers.recentMoves, before.drivers.recentMoves);
  assert.deepEqual(result.drivers.previousRoster, before.drivers.previousRoster);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.standings, before.standings);
  assert.equal(raceControlChangeOnly({ ...data, drivers: result.drivers }, data), false);
});

test('adding a D1 driver to Open with no number does not borrow their D1 number, artwork or manufacturer', () => {
  const data = league();
  Object.assign(data.drivers.profiles.OtherUser, { numberImage: '/d1-20.png', signatureImage: '/other-person-signature.png' });
  const existingOpen = structuredClone(data.drivers.openEntries);
  const result = accepted(csv(['Another Driver,OtherUser,,Freeform Open Team']), data, 'open');
  const entry = result.drivers.openEntries.find(row => row.user === 'OtherUser');
  assert.ok(entry);
  assert.equal(entry.number || '', '');
  assert.equal(entry.numberPending, true);
  assert.equal(entry.team, 'Freeform Open Team');
  assert.equal(entry.make, 'Generic');
  assert.equal(entry.numberImage, undefined);
  assert.equal(result.drivers.profiles.OtherUser.number, '20');
  assert.equal(result.drivers.profiles.OtherUser.numberImage, '/d1-20.png');
  assert.equal(result.drivers.profiles.OtherUser.signatureImage, '/other-person-signature.png');
  assert.deepEqual(result.drivers.profiles.OtherUser.csvDivisions, ['d1', 'open']);
  assert.deepEqual(result.drivers.teams, data.drivers.teams);
  assert.deepEqual(result.drivers.openEntries.filter(row => row.user !== 'OtherUser'), existingOpen);
});

test('new Open-only accounts keep leading-zero numbers separate and never create D1 teams or eligibility', () => {
  const data = league();
  const result = accepted(csv([
    'Open First,OpenFirst22,05,Independent Racing',
    'Open Second,OpenSecond22,5,Another Open Team'
  ]), data, 'open');
  const entries = result.drivers.openEntries.filter(row => /Open(?:First|Second)22/.test(row.user));
  assert.deepEqual(entries.map(row => [row.user, row.number, row.make]), [['OpenFirst22', '05', 'Generic'], ['OpenSecond22', '5', 'Generic']]);
  assert.deepEqual(result.drivers.profiles.OpenFirst22.csvDivisions, ['open']);
  assert.deepEqual(result.drivers.profiles.OpenSecond22.csvDivisions, ['open']);
  assert.equal(result.drivers.profiles.OpenFirst22.number, '05');
  assert.deepEqual(result.drivers.teams, data.drivers.teams);
  assert.deepEqual(result.drivers.freeAgents, data.drivers.freeAgents);
  assert.deepEqual(globalThis.UARLRaceCSV.headers.drivers, ['DriverName', 'Username', 'Driver#', 'Team']);
});

test('blank Open fields retain the Open number, independent team and manufacturer instead of D1 values', () => {
  const data = league();
  data.drivers.openEntries[0].team = 'Independent Saved Team';
  const result = accepted(csv(['Existing Display,FormerUser22,,']), data, 'open');
  const entry = result.drivers.openEntries[0];
  assert.equal(entry.user, 'ExistingUser');
  assert.equal(entry.number, '99');
  assert.equal(entry.team, 'Independent Saved Team');
  assert.equal(entry.make, 'Chevrolet');
  assert.equal(result.drivers.profiles.ExistingUser.number, '19');
  assert.equal(result.rows[0].number, '99');
});

test('Open number conflicts, duplicate accounts and duplicate saved entries reject the batch atomically', () => {
  const data = league();
  rejected(csv(['Unknown Driver,OtherOpen22,99,Freeform Team']), data, 'open');
  rejected(csv(['First,OpenFirst22,05,Team One', 'Second,OpenSecond22,05,Team Two']), data, 'open');
  rejected(csv(['First,ExistingUser,99,', 'Second,CurrentUser22,99,']), data, 'open');
  const duplicate = league();
  duplicate.drivers.openEntries.push({ user: 'FormerUser22', number: '88', make: 'Ford' });
  rejected(csv(['Existing Display,CurrentUser22,99,']), duplicate, 'open');
  const ambiguous = league();
  ambiguous.drivers.profiles.OtherUser.usernameAliases = ['CurrentUser22'];
  rejected(csv(['Unknown Driver,CurrentUser22,99,']), ambiguous, 'open');
});

test('filling an Open vacancy keeps the incoming account’s manufacturer and art without leaving a duplicate entry', () => {
  const data = league();
  data.drivers.openEntries[0].numberImage = '/own-open-99.png';
  data.drivers.openEntries.push({
    name: 'OPEN', number: '05', make: 'Ford', status: 'Open FT',
    numberImage: '/previous-open-05.png', signatureImage: '/previous-open-signature.png'
  });
  const moved = accepted(csv(['Open Moved,CurrentUser22,05,Independent Destination']), data, 'open');
  assert.equal(moved.drivers.openEntries.length, 1);
  const entry = moved.drivers.openEntries[0];
  assert.equal(entry.user, 'ExistingUser');
  assert.equal(entry.number, '05');
  assert.equal(entry.make, 'Chevrolet');
  assert.equal(entry.numberImage, '/own-open-99.png');
  assert.equal(entry.signatureImage, '/open-signature.png');
  assert.ok(moved.warnings.some(warning => /art/i.test(warning)));
  assert.deepEqual(moved.drivers.teams, data.drivers.teams);

  const fresh = accepted(csv(['Open New,FreshOpen22,05,Independent Destination']), data, 'open');
  const newcomer = fresh.drivers.openEntries.find(row => row.user === 'FreshOpen22');
  assert.equal(newcomer.make, 'Generic');
  assert.equal(newcomer.numberImage, undefined);
  assert.equal(newcomer.signatureImage, undefined);
  assert.equal(fresh.drivers.openEntries.filter(row => row.user === 'ExistingUser').length, 1);
});

test('unsupported import series reject without applying drivers and the original two-argument call stays D1', () => {
  const data = league(), source = csv(['New Driver,NewDriver22,11,csv']);
  for (const division of ['d2', 'unknown', '']) rejected(source, data, division);
  const result = accepted(source, data);
  assert.equal(result.division, 'd1');
  assert.ok(result.drivers.profiles.NewDriver22.csvDivisions.includes('d1'));
  assert.deepEqual(result.drivers.openEntries, data.drivers.openEntries);
});

test('JJ Open imports use his current handle without replacing his D1 team, primary number or Toyota badge source', () => {
  const data = structuredClone(original);
  Object.assign(data.drivers.profiles.JJElliott2004, { number: '84', numberImage: '/jj-84.png', signatureImage: '/jj-signature.png' });
  const originalProfile = structuredClone(data.drivers.profiles.JJElliott2004);
  const originalTeams = structuredClone(data.drivers.teams);
  const result = accepted(csv(['JJ,JamesRacer22,48,Independent Chevrolet Squad']), data, 'open');
  const entry = result.drivers.openEntries.filter(row => row.user === 'JJElliott2004');
  assert.equal(entry.length, 1);
  assert.equal(entry[0].number, '48');
  assert.equal(entry[0].make, 'Chevrolet');
  assert.equal(entry[0].team, 'Independent Chevrolet Squad');
  assert.equal(entry[0].numberImage, undefined);
  assert.equal(result.drivers.profiles.JamesRacer22, undefined);
  assert.deepEqual(result.drivers.teams, originalTeams);
  for (const field of ['number', 'numberImage', 'signatureImage', 'wins', 'championships', 'rank']) {
    assert.equal(result.drivers.profiles.JJElliott2004[field], originalProfile[field], field);
  }
});

test('adding an Open-only account to D1 with a blank number leaves D1 pending instead of borrowing its Open number', () => {
  const data = openOnlyLeague(), originalOpen = structuredClone(data.drivers.openEntries);
  const result = accepted(csv(['Open Solo,OpenSolo22,,csv']), data, 'd1');
  const pending = team(result.drivers, 'csv').pendingDrivers.find(entry => entry.user === 'OpenSolo22');
  assert.ok(pending);
  assert.equal(pending.number, '');
  assert.equal(pending.numberPending, true);
  assert.equal(result.rows[0].number, '');
  assert.equal(result.drivers.profiles.OpenSolo22.number, '');
  assert.deepEqual(result.drivers.openEntries, originalOpen);
  assert.deepEqual(result.drivers.profiles.OpenSolo22.csvDivisions, ['open', 'd1']);

  const legacy = league();
  legacy.drivers.profiles.LegacyNumber22 = { alias: 'Legacy Number', number: '06' };
  const compatible = accepted(csv(['Legacy Number,LegacyNumber22,,csv']), legacy, 'd1');
  assert.equal(team(compatible.drivers, 'csv').entries.find(entry => entry.user === 'LegacyNumber22').number, '06');
});

test('a different D1 number preserves Open-only profile artwork on its original Open entry', () => {
  const data = openOnlyLeague(), saved = data.drivers.profiles.OpenSolo22;
  Object.assign(saved, { numberImage: '/open-profile-05.png', signatureImage: '/solo-signature.png', wins: 9, championships: 2, rank: 3 });
  const beforeOpen = structuredClone(data.drivers.openEntries.find(entry => entry.user === 'OpenSolo22'));
  const result = accepted(csv(['Open Solo,OpenSolo22,77,csv']), data, 'd1');
  const d1 = team(result.drivers, 'csv').entries.find(entry => entry.user === 'OpenSolo22');
  assert.equal(d1.number, '77');
  assert.equal(d1.numberImage, undefined);
  assert.equal(d1.signatureImage, '/solo-signature.png');
  const open = result.drivers.openEntries.find(entry => entry.user === 'OpenSolo22');
  assert.deepEqual(open, { ...beforeOpen, numberImage: '/open-profile-05.png' });
  const profile = result.drivers.profiles.OpenSolo22;
  assert.equal(profile.number, '77');
  assert.equal(profile.numberImage, undefined);
  for (const field of ['signatureImage', 'wins', 'championships', 'rank']) assert.equal(profile[field], saved[field]);

  const sharedNumber = accepted(csv(['Open Solo,OpenSolo22,05,csv']), data, 'd1');
  assert.equal(sharedNumber.drivers.profiles.OpenSolo22.numberImage, '/open-profile-05.png');
  assert.deepEqual(sharedNumber.drivers.openEntries, data.drivers.openEntries);
});

test('separate existing Open artwork stays selected and displaced profile art remains recoverable without duplicate history', () => {
  for (const historyExists of [false, true]) {
    const data = openOnlyLeague(), saved = data.drivers.profiles.OpenSolo22;
    saved.numberImage = '/open-profile-05.png';
    const history = { number: '05', url: '/open-profile-05.png' };
    if (historyExists) saved.numberImageHistory = [structuredClone(history)];
    const open = data.drivers.openEntries.find(entry => entry.user === 'OpenSolo22');
    open.numberImage = '/explicit-open-05.png';
    const beforeOpen = structuredClone(data.drivers.openEntries);
    const result = accepted(csv(['Open Solo,OpenSolo22,77,csv']), data, 'd1');
    assert.deepEqual(result.drivers.openEntries, beforeOpen);
    assert.deepEqual(result.drivers.profiles.OpenSolo22.numberImageHistory, [history]);
    assert.equal(result.drivers.profiles.OpenSolo22.numberImage, undefined);
    assert.equal(team(result.drivers, 'csv').entries.find(entry => entry.user === 'OpenSolo22').numberImage, undefined);
  }
});

test('D1 number changes reject atomically when Open-only artwork has no unique matching Open entry', () => {
  for (const duplicate of [false, true]) {
    const data = openOnlyLeague();
    data.drivers.profiles.OpenSolo22.numberImage = '/open-profile-05.png';
    const open = data.drivers.openEntries.find(entry => entry.user === 'OpenSolo22');
    data.drivers.openEntries = data.drivers.openEntries.filter(entry => entry.user !== 'OpenSolo22');
    if (duplicate) data.drivers.openEntries.push(structuredClone(open), structuredClone(open));
    const result = rejected(csv(['Open Solo,OpenSolo22,77,csv']), data, 'd1');
    assert.ok(result.errors.some(error => /Open Series entry/.test(error)));
  }
});
