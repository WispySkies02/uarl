import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/race-csv.js';

const csv = globalThis.UARLRaceCSV, standings = globalThis.UARLStandings;
const resultHeader = csv.headers.results.join(','), standingsHeader = csv.headers.standings.join(',');
function league() {
  const entries = [{ user: 'MaxUser', name: 'Max', number: '19' }, { user: 'HaydenUser', name: 'Hayden', number: '20' }, { user: 'JordanA', name: 'Jordan', number: '23' }, { user: 'JordanB', name: 'Jordan', number: '24' }, { user: 'CommaUser', name: 'Driver, Jr.', number: '07' }];
  return { drivers: { teams: [{ name: 'Test Team', entries }], profiles: { MaxUser: { alias: 'Old Max' } }, openEntries: [{ user: 'OpenUser', name: 'Open Racer', number: '05' }] }, race: { drivers: entries.map(entry => ({ id: entry.user, name: entry.name, number: entry.number, division: 'd1', team: 'Test Team' })).concat({ id: 'OpenUser', name: 'Open Racer', number: '05', division: 'open' }) }, records: [{ id: 'old', division: 'd1', date: '2026-11-01', pointsEvent: true, finishes: [{ position: 1, name: 'Max', username: 'MaxUser', number: '19', points: 50, stagePoints: 5 }, { position: 2, name: 'Hayden', username: 'HaydenUser', number: '20', points: 45, stagePoints: 0 }] }] };
}
function race(overrides = {}) { return { id: 'new', division: 'd1', event: 'Test Race', pointsEvent: true, entries: [], qualifying: [], stages: [], finishes: [], bonuses: [], ...overrides }; }

test('CSV reads BOM, CRLF, quoted commas, escaped quotes and multiline fields', () => {
  const parsed = csv.parse('\uFEFF' + resultHeader + '\r\n1,"Driver, Jr.",1,1,,Yes,No\r\n2,"A ""quoted""\nname",,,,,Yes\r\n\r\n', 'results');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].cells[1], 'Driver, Jr.');
  assert.equal(parsed.rows[1].cells[1], 'A "quoted"\nname');
});
test('CSV rejects malformed quoting, wrong headers, row lengths and header-only input', () => {
  for (const source of ['Driver,Position\nMax,1', resultHeader, resultHeader + '\n1,Max', resultHeader + '\n1,"Max,1,1,,Yes,No', resultHeader + '\n1,"Max"oops,1,1,,Yes,No', resultHeader + '\n1,Ma"x,1,1,,Yes,No']) assert.ok(csv.parse(source, 'results').errors.length, source);
});
test('results preview resolves identities, sorts classifications and awards only its finishers without mutating data', () => {
  const data = league(), record = race(), before = JSON.stringify({ data, record });
  const result = csv.results(resultHeader + '\n2,Hayden,1,2,,No,Yes\n1,@MaxUser,2,1,,Yes,No\n3,"Driver, Jr.",,,,No,No', data, record);
  assert.deepEqual(result.errors, []);
  assert.equal(JSON.stringify({ data, record }), before);
  assert.deepEqual(result.record.finishes.map(row => [row.position, row.username, row.number]), [[1, 'MaxUser', '19'], [2, 'HaydenUser', '20'], [3, 'CommaUser', '07']]);
  assert.equal(result.record.poleUsername, 'HaydenUser');
  assert.equal(result.record.winnerUsername, 'MaxUser');
  assert.deepEqual(result.record.stages.map(stage => stage.name), ['Stage 1']);
  assert.deepEqual(result.record.stages[0].results.map(row => row.username), ['MaxUser', 'HaydenUser']);
  assert.deepEqual(result.record.bonuses.map(row => [row.name, row.driverUsername]), [['Fastest lap', 'MaxUser'], ['Most laps led', 'HaydenUser']]);
});
test('results keep manual numbers and eligibility, include selected guests, and replace stale classifications', () => {
  const data = league(), record = race({ entries: [{ user: 'GuestUser', name: 'Guest Racer', number: '009', pointsEligible: false }], finishes: [{ position: 1, name: 'Hayden', username: 'HaydenUser', number: '021', numberManual: true, pointsEligible: false }, { position: 2, name: 'Max', username: 'MaxUser', number: '', numberManual: true }], pole: 'Old', poleUsername: 'OldUser', stages: [{ name: 'Stage 3', results: [] }], bonuses: [{ name: 'Fastest lap', driver: 'Jordan', driverUsername: 'JordanA' }, { name: 'Fastest recorded practice', driver: 'Hayden', driverUsername: 'HaydenUser' }] });
  const result = csv.results(resultHeader + '\n1,Hayden,,,,Yes,No\n2,GuestUser,,,,No,Yes\n3,Max,,,,No,No', data, record);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.record.finishes.map(row => [row.number, row.pointsEligible]), [['021', false], ['009', false], ['', true]]);
  assert.equal(result.record.pole, ''); assert.equal(result.record.poleUsername, '');
  assert.deepEqual(result.record.stages, []);
  assert.equal(result.record.bonuses.length, 3);
  assert.ok(!result.record.bonuses.some(row => row.driverUsername === 'JordanA'));
});
test('results reject duplicate drivers or positions, ambiguous names, wrong-division drivers, and invalid Yes/No values', () => {
  const data = league();
  for (const rows of [
    '1,Max,,,,Yes,No\n2,Old Max,,,,No,No', '1,Max,,,,Yes,No\n1,Hayden,,,,No,No',
    '1,Max,1,,,Yes,No\n2,Hayden,1,,,No,No', '1,Max,,1,,Yes,No\n2,Hayden,,1,,No,No',
    '1,Max,,,1,Yes,No\n2,Hayden,,,1,No,No', '1,Jordan,,,,Yes,No', '1,OpenUser,,,,Yes,No',
    '1,Max,,,,True,No', '1,Max,,,,Yes,', '0,Max,,,,Yes,No', '2,Max,,,,Yes,No', '1,,1,1,,Yes,No'
  ]) assert.ok(csv.results(resultHeader + '\n' + rows, data, race()).errors.length, rows);
  assert.deepEqual(csv.results(resultHeader + '\n1,JordanA,,,,yEs,nO', data, race()).errors, []);
});
test('unverified name-only entrants stay separate and keep their manual numbers', () => {
  const data = league(); data.drivers.teams[0].entries = [{ name: 'First', number: '10' }, { name: 'Second', number: '11' }]; data.drivers.profiles = {};
  const result = csv.results(resultHeader + '\n1,First,,,,Yes,No\n2,Second,,,,No,Yes', data, race({ finishes: [{ name: 'First', number: '001', numberManual: true }, { name: 'Second', number: '002', numberManual: true }] }));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.record.finishes.map(row => row.number), ['001', '002']);
  assert.notEqual(result.record.finishes[0].username, result.record.finishes[1].username);
});
test('standings CSV previews exact totals, signed movement and zero-prefixed numbers with no draft mutation', () => {
  const data = league(), before = JSON.stringify(data);
  const result = csv.standings(standingsHeader + '\n1,+2,019,Max,125\n2,-1,020,Hayden,100', data, 'd1');
  assert.deepEqual(result.errors, []);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(result.rows.slice(0, 2).map(row => [row.position, row.movement, row.number, row.name, row.points]), [[1, 2, '019', 'Max', 125], [2, -1, '020', 'Hayden', 100]]);
  assert.deepEqual(result.entries.map(row => row.pointsAdjustment), [70, 55]);
  assert.deepEqual(standings.validate({ standings: result.standings }), []);
});
test('standings CSV disambiguates same-name drivers by number and rejects ambiguous identities, ranks, totals and movement', () => {
  const data = league();
  assert.deepEqual(csv.standings(standingsHeader + '\n1,-,24,Jordan,100', data, 'd1').errors, []);
  for (const rows of ['1,0,99,Jordan,100', '1,0,19,Max,100\n1,0,20,Hayden,90', '1,0,19,Max,100\n2,0,19,Max,90', '1,up,19,Max,100', '1,-2,19,Max,100', '1,0,19,Max,1.5', '1,0,19,Max,', '1,0,#19,Max,100', '2,0,19,Max,100', '1,0,19,Max,10']) assert.ok(csv.standings(standingsHeader + '\n' + rows, data, 'd1').errors.length, rows);
});
test('manual corrections and CSV totals remain offsets when later results are entered or corrected', () => {
  const data = league(), max = standings.calculate(data, 'd1').find(row => row.id === 'MaxUser');
  data.standings = standings.merge(data, [standings.correction(max, 100)]);
  data.records.push({ id: 'later', division: 'd1', date: '2026-11-08', finishes: [{ username: 'MaxUser', name: 'Max', position: 2, points: 45, stagePoints: 4 }, { username: 'HaydenUser', name: 'Hayden', position: 1, points: 50, stagePoints: 5 }] });
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'MaxUser').points, 149);
  data.records[0].finishes[0].points = 40;
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'MaxUser').points, 139);
  data.records.pop();
  const imported = csv.standings(standingsHeader + '\n1,0,19,Max,200', data, 'd1');
  assert.deepEqual(imported.errors, []); data.standings = imported.standings;
  data.records.push({ division: 'd1', date: '2026-11-08', finishes: [{ username: 'MaxUser', name: 'Max', position: 1, points: 50, stagePoints: 0 }] });
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'MaxUser').points, 250);
});
test('standings corrections preserve other divisions, omitted drivers and totals for former entrants', () => {
  const data = league(), open = standings.calculate(data, 'open')[0];
  data.standings = [standings.correction(open, 99)];
  const imported = csv.standings(standingsHeader + '\n1,-,19,Max,100', data, 'd1');
  data.standings = imported.standings;
  assert.equal(standings.calculate(data, 'open')[0].points, 99);
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'HaydenUser').points, 45);
  data.race.drivers = data.race.drivers.filter(row => row.id !== 'MaxUser'); data.records = [];
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'MaxUser').points, 45);
});
test('ranking movement uses the preceding race by default and identity never merges two verified users', () => {
  const data = league();
  data.records.push({ division: 'd1', date: '2026-11-08', finishes: [{ username: 'HaydenUser', name: 'Hayden', number: '20', position: 1, points: 50, stagePoints: 5 }, { username: 'LegacyMax', name: 'Max', number: '19', position: 2, points: 45 }] });
  const rows = standings.calculate(data, 'd1');
  assert.equal(rows.find(row => row.id === 'HaydenUser').movement, 1);
  assert.equal(rows.filter(row => row.name === 'Max').length, 2);
  assert.equal(rows.find(row => row.id === 'MaxUser').points, 55);
  assert.equal(rows.find(row => row.id === 'LegacyMax').points, 45);
  data.records.push({ division: 'd1', exhibition: true, finishes: [{ username: 'MaxUser', position: 1, points: 500 }] });
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'MaxUser').points, 55);
});
test('D2 keeps its FT archive eligibility', () => {
  const data = league();
  data.race.drivers.push({ id: 'FullTime', name: 'Full Time', division: 'd2', status: 'FT' }, { id: 'PartTime', name: 'Part Time', division: 'd2', status: 'PT' });
  data.records.push({ division: 'd2', finishes: [{ username: 'FullTime', position: 1, points: 50 }, { username: 'PartTime', position: 2, points: 45 }, { username: 'Guest', name: 'Guest', position: 3, points: 42 }] });
  assert.deepEqual(standings.calculate(data, 'd2').map(row => row.id), ['FullTime']);
});
test('manual points corrections follow roster name and number updates and retain standard tiebreakers', () => {
  const data = league(), max = standings.calculate(data, 'd1').find(row => row.id === 'MaxUser');
  data.standings = [standings.correction(max, 100)];
  const current = data.race.drivers.find(row => row.id === 'MaxUser'); current.name = 'Max Renamed'; current.number = '08';
  const row = standings.calculate(data, 'd1').find(row => row.id === 'MaxUser');
  assert.equal(row.name, 'Max Renamed'); assert.equal(row.number, '08'); assert.equal(row.points, 100);
  data.records[0].finishes.push({ username: 'JordanA', name: 'Jordan', position: 1, points: 100, stagePoints: 0 });
  const ranked = standings.calculate(data, 'd1');
  assert.equal(ranked[0].id, 'JordanA');
});
test('CSV rejects points or movement that overflow an integer correction', () => {
  for (const row of ['1,0,19,Max,-9007199254740991', '2,+9007199254740991,19,Max,100']) assert.ok(csv.standings(standingsHeader + '\n' + row, league(), 'd1').errors.length);
});

function formerOpenLeague() {
  const data = league();
  data.drivers.profiles.GuillermoChase = { alias: 'Gman', currentUsername: 'GuillermoChase', usernameAliases: ['FormerGman22'], csvAliases: ['Guillermo Chase'], csvDivisions: ['d1'], number: '81', wins: 5, numberImage: '/gman-81.png' };
  data.drivers.teams[0].entries.push({ user: 'GuillermoChase', name: 'Gman', number: '81', status: 'Full-Time' });
  data.race.drivers.push({ id: 'GuillermoChase', name: 'Gman', number: '81', division: 'd1', make: 'Ford' });
  data.records[0].finishes.push({ username: 'GuillermoChase', name: 'Gman', number: '81', position: 3, points: 120 });
  const leaders = Array.from({ length: 8 }, (_, index) => ({ user: 'OpenLeader' + (index + 1), name: 'Open Leader ' + (index + 1), number: String(index + 1), points: 100 - index * 5 }));
  data.drivers.openEntries = leaders.map(({ user, name, number }) => ({ user, name, number, make: 'Toyota' })).concat([
    { user: 'TaylorKenseth17', number: '17', make: 'Generic' },
    { user: 'Pxssis', number: '49', make: 'Ford' },
    { user: 'codydgoforth', number: '60', make: 'Ford' },
    { user: 'FueledByMayonnaise', number: '87', make: 'Generic' }
  ]);
  data.records.push({ id: 'open-baseline', division: 'open', date: '2026-11-01', finishes: leaders.map((driver, index) => ({ username: driver.user, name: driver.name, number: driver.number, position: index + 1, points: driver.points })) });
  data.standings = [standings.correction(standings.calculate(data, 'd1').find(row => row.id === 'GuillermoChase'), 333)];
  return data;
}

function formerOpenCSV() {
  return standingsHeader + '\n' + Array.from({ length: 8 }, (_, index) => [index + 1, '-', index + 1, 'OpenLeader' + (index + 1), 100 - index * 5].join(',')).join('\n') + '\n9,-,,Kanevme,42\n10,-,,GuillermoChase,40\n11,-,17,TaylorKenseth17,0\n12,-,49,Pxssis,0\n13,-,60,codydgoforth,0\n14,-,87,FueledByMayonnaise,0';
}

test('the reported Open standings accept Kanevme and GuillermoChase without creating profiles or roster entries', () => {
  const data = formerOpenLeague(), before = structuredClone(data);
  const result = csv.standings(formerOpenCSV(), data, 'open');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(data, before, 'a preview cannot edit rosters, profiles, classifications or existing corrections');
  assert.equal(data.drivers.profiles.Kanevme, undefined);
  assert.ok(!data.drivers.openEntries.some(row => ['Kanevme', 'GuillermoChase'].includes(row.user)));
  const kane = result.rows.find(row => row.id === 'Kanevme'), gman = result.rows.find(row => row.id === 'GuillermoChase');
  assert.equal(kane.position, 9);
  assert.equal(kane.points, 42);
  assert.equal(kane.number, '');
  assert.equal(gman.position, 10);
  assert.equal(gman.points, 40);
  assert.equal(gman.rawPoints, 0, 'D1 race points must not be copied to Open');
  assert.equal(gman.number, '', 'an omitted Open number must not borrow D1 #81');
  assert.notEqual(gman.make, 'Ford', 'a D1 manufacturer is not an Open assignment');
  assert.deepEqual(result.standings.find(row => row.division === 'd1'), before.standings[0]);
  assert.deepEqual(standings.validate({ standings: result.standings }), []);
  assert.deepEqual(csv.headers.standings, ['Position', '+/-', 'Driver#', 'DriverName', 'Points']);
});

test('standings-only accounts reimport by case-insensitive username and preserve exact numbers while future race points add normally', () => {
  const data = formerOpenLeague();
  const initial = csv.standings(formerOpenCSV(), data, 'open');
  assert.deepEqual(initial.errors, []);
  data.standings = initial.standings;
  const beforeDrivers = structuredClone(data.drivers);
  data.records.push({ id: 'later-open', division: 'open', date: '2026-11-08', finishes: [{ username: 'Kanevme', name: 'Kanevme', number: '012', position: 1, points: 8, stagePoints: 2 }] });
  assert.equal(standings.calculate(data, 'open').find(row => row.id === 'Kanevme').points, 52);
  const updated = csv.standings(standingsHeader + '\n9,0,005,@kAnEvMe,52\n10,-,,FORMERGMAN22,40', data, 'open');
  assert.deepEqual(updated.errors, []);
  assert.equal(updated.standings.filter(row => row.division === 'open' && row.username.toLowerCase() === 'kanevme').length, 1);
  assert.equal(updated.standings.filter(row => row.division === 'open' && row.username === 'GuillermoChase').length, 1);
  const kane = updated.rows.find(row => row.id === 'Kanevme');
  assert.equal(kane.points, 52);
  assert.equal(kane.rawPoints, 10);
  assert.equal(kane.number, '005');
  assert.deepEqual(data.drivers, beforeDrivers);
  data.standings = updated.standings;
  data.records.push({ id: 'third-open', division: 'open', date: '2026-11-15', finishes: [{ username: 'kanevme', name: 'Kanevme', number: '005', position: 1, points: 5 }] });
  assert.equal(standings.calculate(data, 'open').find(row => row.id.toLowerCase() === 'kanevme').points, 57);
});

test('unknown full names become stable standings-only identities without inventing Roblox accounts', () => {
  const data = league(), beforeDrivers = structuredClone(data.drivers);
  const first = csv.standings(standingsHeader + '\n1,-,05,Former Driver Jr.,25', data, 'open');
  assert.deepEqual(first.errors, []);
  const saved = first.entries[0];
  assert.match(saved.username, /^standings:open:/);
  assert.equal(first.rows[0].name, 'Former Driver Jr.');
  assert.equal(standings.username(data, first.rows[0]), '');
  assert.deepEqual(standings.validate({ standings: first.standings }), []);
  data.standings = first.standings;
  const repeated = csv.standings(standingsHeader + '\n1,-,5,former   driver jr.,26', data, 'open');
  assert.deepEqual(repeated.errors, []);
  assert.equal(repeated.entries[0].username, saved.username);
  assert.equal(repeated.standings.filter(row => row.division === 'open').length, 1);
  assert.equal(repeated.rows[0].number, '5');
  assert.equal(repeated.rows[0].points, 26);
  assert.deepEqual(data.drivers, beforeDrivers);
});

test('global username and former-handle matches keep stable identities without adding series eligibility', () => {
  const data = league();
  data.drivers.profiles.OldVerified22 = { alias: 'Former Racer', currentUsername: 'CurrentVerified22', usernameAliases: ['PreviousVerified22'], csvAliases: ['Former Full Name'], number: '19', csvDivisions: ['d1'] };
  const before = structuredClone(data);
  const imported = csv.standings(standingsHeader + '\n1,-,,@previousverified22,90', data, 'open');
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.entries[0].username, 'OldVerified22');
  assert.equal(imported.rows.find(row => row.id === 'OldVerified22').number, '');
  assert.deepEqual(data, before);
  data.standings = imported.standings;
  const byDisplayAlias = csv.standings(standingsHeader + '\n1,-,,Former Full Name,95', data, 'open');
  assert.deepEqual(byDisplayAlias.errors, []);
  assert.equal(byDisplayAlias.entries[0].username, 'OldVerified22');
  assert.equal(byDisplayAlias.standings.filter(row => row.division === 'open').length, 1);
  assert.deepEqual(data.drivers.profiles.OldVerified22.csvDivisions, ['d1']);
});

test('ambiguous global names and handles cannot silently create a third standings identity', () => {
  const data = league();
  data.drivers.profiles.GlobalFirst22 = { alias: 'Shared Former Name', csvAliases: ['SharedFormer'], usernameAliases: ['ConflictedHandle22'] };
  data.drivers.profiles.GlobalSecond22 = { alias: 'Shared Former Name', csvAliases: ['SharedFormer'], usernameAliases: ['ConflictedHandle22'] };
  const before = structuredClone(data);
  for (const value of ['Shared Former Name', 'SharedFormer', 'ConflictedHandle22']) {
    const result = csv.standings(standingsHeader + '\n1,-,05,' + value + ',100', data, 'open');
    assert.ok(result.errors.length, value);
    assert.deepEqual(data, before);
  }
});

test('shared Open numbers do not combine separate verified accounts in standings imports', () => {
  const data = league();
  data.drivers.openEntries = [{ user: 'SharedFirst22', name: 'Same Display', number: '05', make: 'Ford' }, { user: 'SharedSecond22', name: 'Same Display', number: '05', make: 'Chevrolet' }];
  data.race.drivers = data.race.drivers.filter(row => row.division !== 'open');
  const before = structuredClone(data);
  assert.ok(csv.standings(standingsHeader + '\n1,-,05,Same Display,100', data, 'open').errors.length);
  const imported = csv.standings(standingsHeader + '\n1,-,05,SharedFirst22,100\n2,-,05,SharedSecond22,90', data, 'open');
  assert.deepEqual(imported.errors, []);
  assert.deepEqual(imported.rows.slice(0, 2).map(row => [row.id, row.number, row.points]), [['SharedFirst22', '05', 100], ['SharedSecond22', '05', 90]]);
  assert.deepEqual(data, before);
});

test('standings-only rows retain name, number, movement and points validation and reject invalid batches without mutation', () => {
  const data = league(), before = structuredClone(data);
  for (const rows of [
    '1,-,,Kanevme,42\n2,-,,NewFormer22,1.5',
    '1,-,,Kanevme,42\n2,up,,NewFormer22,30',
    '1,-,,Kanevme,42\n2,-,0005,NewFormer22,30',
    '1,-,,Kanevme,42\n2,-,,kanevme,30',
    '1,-,,,42', '1,-,,undefined,42', '1,-,,null,42'
  ]) {
    const result = csv.standings(standingsHeader + '\n' + rows, data, 'open');
    assert.ok(result.errors.length, rows);
    assert.deepEqual(data, before);
  }
});

test('editing a standings preview keeps the selected identity and race points while allowing display-name and number changes', () => {
  const data = league(), before = structuredClone(data);
  const edited = csv.standings(standingsHeader + '\n1,+2,,Preview Renamed Driver,125', data, 'd1', { identities: ['MaxUser'] });
  assert.deepEqual(edited.errors, []);
  const saved = edited.entries[0], row = edited.rows.find(row => row.id === 'MaxUser');
  assert.equal(saved.username, 'MaxUser');
  assert.equal(saved.name, 'Preview Renamed Driver');
  assert.equal(saved.number, '', 'clearing the preview number must not restore the roster number');
  assert.equal(saved.pointsAdjustment, 70, '55 existing race points remain part of the imported total');
  assert.equal(row.rawPoints, 55);
  assert.equal(row.points, 125);
  assert.equal(row.movement, 2);
  assert.deepEqual(data, before);
  const duplicated = csv.standings(standingsHeader + '\n1,-,19,First Display,125\n2,-,20,Second Display,100', data, 'd1', { identities: ['MaxUser', 'MaxUser'] });
  assert.ok(duplicated.errors.length);
  assert.deepEqual(data, before);
});

test('renaming a new standings-only full-name row in preview retains its provisional identity without creating a profile', () => {
  const data = league(), before = structuredClone(data);
  const first = csv.standings(standingsHeader + '\n1,-,05,Former Driver Jr.,25', data, 'open');
  assert.deepEqual(first.errors, []);
  const id = first.entries[0].username;
  const edited = csv.standings(standingsHeader + '\n1,-,005,Historical Display Edited,30', data, 'open', { identities: [id] });
  assert.deepEqual(edited.errors, []);
  assert.equal(edited.entries[0].username, id);
  assert.equal(edited.entries[0].name, 'Historical Display Edited');
  assert.equal(edited.rows[0].points, 30);
  assert.equal(edited.rows[0].number, '005');
  assert.deepEqual(data, before);
});

test('a selected-series display name wins over the same name on a profile in another series', () => {
  const data = league();
  data.drivers.teams[0].entries.push({ user: '58bbwapache', name: 'Dale', number: '16' });
  data.drivers.profiles['58bbwapache'] = { alias: 'Dale', csvDivisions: ['d1'], number: '16' };
  data.drivers.profiles.daleapache88 = { alias: 'Dale', csvDivisions: ['open'], number: '88' };
  data.drivers.openEntries.push({ user: 'daleapache88', name: 'Dale', number: '88', make: 'Generic' });
  data.race.drivers.push({ id: '58bbwapache', name: 'Dale', number: '16', division: 'd1', make: 'Chevrolet' });
  data.records[0].finishes.push({ username: '58bbwapache', name: 'Dale', number: '16', position: 3, points: 20 });
  const before = structuredClone(data);
  for (const number of ['16', '']) {
    const imported = csv.standings(standingsHeader + '\n1,-,' + number + ',Dale,100', data, 'd1');
    assert.deepEqual(imported.errors, []);
    assert.equal(imported.entries[0].username, '58bbwapache');
    assert.equal(imported.entries[0].pointsAdjustment, 80);
    assert.equal(imported.rows.find(row => row.id === '58bbwapache').points, 100);
    assert.ok(!imported.entries.some(row => row.username === 'daleapache88'));
    assert.deepEqual(data, before);
  }
});

test('selected-series name ambiguity still requires its own unique number or username before global aliases are considered', () => {
  const data = league();
  data.drivers.profiles.OtherJordan22 = { alias: 'Jordan', csvDivisions: ['open'], number: '24' };
  const before = structuredClone(data);
  const matched = csv.standings(standingsHeader + '\n1,-,24,Jordan,100', data, 'd1');
  assert.deepEqual(matched.errors, []);
  assert.equal(matched.entries[0].username, 'JordanB');
  for (const number of ['', '99']) assert.ok(csv.standings(standingsHeader + '\n1,-,' + number + ',Jordan,100', data, 'd1').errors.length);
  const byUsername = csv.standings(standingsHeader + '\n1,-,24,JordanB,100', data, 'd1');
  assert.deepEqual(byUsername.errors, []);
  assert.equal(byUsername.entries[0].username, 'JordanB');
  assert.deepEqual(data, before);
});

test('other-series roster usernames and entry display names match without requiring profiles or borrowing series data', () => {
  const data = league();
  data.drivers.teams[0].make = 'Ford';
  data.drivers.teams[0].entries.push(
    { user: 'NoProfileUser', name: 'Entry Nickname', number: '81', status: 'Full-Time' },
    { user: 'EntryOverride22', name: 'Entry Display Override', number: '88', status: 'Full-Time' }
  );
  data.drivers.profiles.EntryOverride22 = { alias: 'Different Profile Alias', number: '88', csvDivisions: ['d1'] };
  data.race.drivers.push({ id: 'NoProfileUser', name: 'Entry Nickname', number: '81', division: 'd1', make: 'Ford' });
  data.records[0].finishes.push({ username: 'NoProfileUser', name: 'Entry Nickname', number: '81', position: 3, points: 37 });
  const before = structuredClone(data);
  for (const [value, user] of [
    ['NoProfileUser', 'NoProfileUser'],
    ['Entry Nickname', 'NoProfileUser'],
    ['EntryOverride22', 'EntryOverride22'],
    ['Entry Display Override', 'EntryOverride22']
  ]) {
    const imported = csv.standings(standingsHeader + '\n1,-,,' + value + ',100', data, 'open');
    assert.deepEqual(imported.errors, [], value);
    assert.equal(imported.entries[0].username, user, value);
    const row = imported.rows.find(row => row.id === user);
    assert.ok(row, value);
    assert.equal(row.number, '', value);
    assert.equal(row.rawPoints, 0, value);
    assert.equal(row.points, 100, value);
    assert.notEqual(row.make, 'Ford', value);
    assert.deepEqual(data, before, value);
    assert.equal(data.drivers.profiles.NoProfileUser, undefined);
    assert.ok(!data.drivers.openEntries.some(entry => entry.user === user));
  }
});
