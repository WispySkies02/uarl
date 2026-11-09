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
test('standings CSV disambiguates same-name drivers by number and rejects invalid identities, ranks, totals and movement', () => {
  const data = league();
  assert.deepEqual(csv.standings(standingsHeader + '\n1,-,24,Jordan,100', data, 'd1').errors, []);
  for (const rows of ['1,0,99,Unknown,100', '1,0,99,Jordan,100', '1,0,19,Max,100\n1,0,20,Hayden,90', '1,0,19,Max,100\n2,0,19,Max,90', '1,up,19,Max,100', '1,-2,19,Max,100', '1,0,19,Max,1.5', '1,0,19,Max,', '1,0,#19,Max,100', '2,0,19,Max,100', '1,0,19,Max,10']) assert.ok(csv.standings(standingsHeader + '\n' + rows, data, 'd1').errors.length, rows);
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
