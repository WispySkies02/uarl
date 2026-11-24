import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/race-csv.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const standings = globalThis.UARLStandings;
const csv = globalThis.UARLRaceCSV;
const header = 'Position,+/-,Driver#,DriverName,Points';

function league() {
  const entries = [
    { user: 'ListedUser', name: 'Listed Driver', number: '05', status: 'Full-Time' },
    { user: 'OldHighUser', name: 'Old High Driver', number: '5', status: 'Full-Time' },
    { user: 'RosterZeroUser', name: 'Roster Only Driver', number: '15', status: 'Full-Time' }
  ];
  return {
    events: [], paints: [], guide: [], history: { league: { winners: [] } },
    drivers: {
      rosterVersion: 2, assignmentVersion: 1, displayNameVersion: 1, jjUsernameVersion: 1, standingsIdentityVersion: 1,
      teams: [{ id: 'team', name: 'Current Team', make: 'Ford', entries }],
      profiles: {
        ListedUser: { alias: 'Listed Driver', number: '05', csvDivisions: ['d1'], wins: 3, numberImage: '/05.png', signatureImage: '/listed.png' },
        OldHighUser: { alias: 'Old High Driver', number: '5', csvDivisions: ['d1'], wins: 2 },
        RosterZeroUser: { alias: 'Roster Only Driver', number: '15', csvDivisions: ['d1'] }
      },
      openEntries: [{ user: 'OpenUser', name: 'Open Driver', number: '05', make: 'Toyota' }],
      freeAgents: [], recentMoves: []
    },
    race: { drivers: entries.map(row => ({ id: row.user, name: row.name, number: row.number, division: 'd1', make: 'Ford' })).concat({ id: 'OpenUser', name: 'Open Driver', number: '05', division: 'open', make: 'Toyota' }) },
    records: [{ id: 'baseline-race', division: 'd1', date: '2026-11-01', pointsEvent: true, finishes: [
      { username: 'ListedUser', name: 'Listed Driver', number: '05', position: 3, points: 20, stagePoints: 5 },
      { username: 'OldHighUser', name: 'Old High Driver', number: '5', position: 1, points: 300 },
      { username: 'FormerUser', name: 'Former Driver', number: '7', position: 2, points: 100 }
    ] }]
  };
}

function preview(data, source = header + '\n1,+2,005,ListedUser,60\n2,-1,,CSVOnlyUser,10', division = 'd1') {
  const before = structuredClone(data);
  const result = csv.standings(source, data, division);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(data, before, 'preview must not alter the existing table, roster, profiles or results');
  return result;
}

function apply(data, result) {
  data.standings = result.standings;
  data.standingsTables = result.standingsTables;
}

test('a complete CSV replaces only its series and excludes old totals, historical drivers and roster-only rows after reload', () => {
  const data = league();
  const all = standings.calculate(data, 'd1');
  data.standings = [
    standings.correction(all.find(row => row.id === 'OldHighUser'), 1200),
    standings.correction(standings.calculate(data, 'open')[0], 77)
  ];
  data.standingsTables = { open: standings.snapshot(data, 'open', ['OpenUser']) };
  const original = structuredClone(data);
  const imported = preview(data);
  assert.deepEqual(imported.rows.map(row => [row.id, row.position, row.number, row.points]), [
    ['ListedUser', 1, '005', 60], ['CSVOnlyUser', 2, '', 10]
  ]);
  assert.equal(imported.entries[0].pointsAdjustment, 35, 'the posted total includes the existing 25 race points once');
  assert.deepEqual(imported.standings.filter(row => row.division === 'd1').map(row => row.username), ['ListedUser', 'CSVOnlyUser']);
  assert.deepEqual(imported.standings.filter(row => row.division === 'open'), original.standings.filter(row => row.division === 'open'));
  assert.deepEqual(imported.standingsTables.open, original.standingsTables.open);
  apply(data, imported);
  const recovered = JSON.parse(JSON.stringify(data));
  assert.deepEqual(standings.calculate(recovered, 'd1').map(row => [row.id, row.points]), [['ListedUser', 60], ['CSVOnlyUser', 10]]);
  assert.equal(standings.calculate(recovered, 'open')[0].points, 77);
  assert.deepEqual(recovered.drivers, original.drivers);
  assert.deepEqual(recovered.records, original.records);
  assert.equal(recovered.drivers.profiles.CSVOnlyUser, undefined);
  assert.ok(standings.calculate(recovered, 'd1', { allDrivers: true }).some(row => row.id === 'OldHighUser'), 'excluded people remain available for identity matching');
  assert.deepEqual(standings.validate(recovered), []);
});

test('manual corrections and later real results keep automatic scoring without adding unraced roster entries', () => {
  const data = league();
  apply(data, preview(data));
  const snapshot = structuredClone(data.standingsTables);
  const listed = standings.calculate(data, 'd1').find(row => row.id === 'ListedUser');
  data.standings = standings.merge(data, [standings.correction(listed, 65)]);
  assert.deepEqual(data.standingsTables, snapshot);
  data.drivers.teams[0].entries.push({ user: 'NewRosterUser', name: 'New Roster Driver', number: '88', status: 'Full-Time' });
  data.drivers.profiles.NewRosterUser = { alias: 'New Roster Driver', csvDivisions: ['d1'], number: '88' };
  assert.deepEqual(standings.calculate(data, 'd1').map(row => row.id), ['ListedUser', 'CSVOnlyUser']);
  data.records.push({ id: 'later-race', division: 'd1', date: '2026-11-08', finishes: [
    { username: 'ListedUser', name: 'Listed Driver', number: '05', position: 1, points: 8, stagePoints: 2 },
    { username: 'NewFinishUser', name: 'New Finisher', number: '88', position: 2, points: 7 }
  ] });
  const rows = standings.calculate(data, 'd1');
  assert.equal(rows.find(row => row.id === 'ListedUser').points, 75);
  assert.equal(rows.find(row => row.id === 'CSVOnlyUser').points, 10);
  assert.equal(rows.find(row => row.id === 'NewFinishUser').points, 7);
  assert.equal(rows.find(row => row.id === 'NewFinishUser').movement, null, 'a new finisher did not have a previous position on the posted board');
  for (const user of ['NewRosterUser', 'RosterZeroUser', 'OldHighUser', 'FormerUser']) assert.ok(!rows.some(row => row.id === user), user);
  data.records[0].finishes[0].points = 15;
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'ListedUser').points, 70, 'correcting an old race still adjusts the posted total');
  data.records.pop();
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'ListedUser').points, 60);
  assert.ok(!standings.calculate(data, 'd1').some(row => row.id === 'NewFinishUser'), 'deleting the later result removes its new entrant without deleting a profile');
});

test('a genuinely new participant in an existing race can join while changes to old omitted totals do not repopulate the table', () => {
  const data = league();
  apply(data, preview(data));
  data.records[0].finishes.find(row => row.username === 'OldHighUser').points = 500;
  assert.ok(!standings.calculate(data, 'd1').some(row => row.id === 'OldHighUser'));
  data.records[0].finishes.push({ username: 'LateAddedUser', name: 'Late Added Driver', number: '88', position: 4, points: 9 });
  const rows = standings.calculate(data, 'd1');
  assert.equal(rows.find(row => row.id === 'LateAddedUser').points, 9);
  assert.ok(!rows.some(row => row.id === 'OldHighUser'));
  assert.ok(!rows.some(row => row.id === 'RosterZeroUser'));
  const imported = preview(data, header + '\n1,-,5,OldHighUser,600\n2,-,05,ListedUser,60');
  assert.equal(imported.entries[0].username, 'OldHighUser');
  assert.equal(imported.entries[0].pointsAdjustment, 100, 'reincluding a previously omitted account still uses its real existing race points');
  assert.deepEqual(imported.rows.map(row => [row.id, row.points]), [['OldHighUser', 600], ['ListedUser', 60]]);
  apply(data, imported);
  assert.deepEqual(standings.calculate(data, 'd1').map(row => row.id), ['OldHighUser', 'ListedUser']);
});

test('complete CSV tie order and leading-zero numbers are the posted table order, not the larger roster order', () => {
  const data = league();
  const imported = preview(data, header + '\n2,-,5,ListedUser,10\n1,-,05,CSVOnlyUser,10');
  assert.deepEqual(imported.rows.map(row => [row.id, row.position, row.number, row.points]), [
    ['CSVOnlyUser', 1, '05', 10], ['ListedUser', 2, '5', 10]
  ]);
  apply(data, imported);
  assert.deepEqual(standings.calculate(JSON.parse(JSON.stringify(data)), 'd1').map(row => row.id), ['CSVOnlyUser', 'ListedUser']);
});

test('a header-only standings CSV posts a complete empty table without erasing roster or historical data', () => {
  const data = league();
  const open = standings.calculate(data, 'open')[0];
  data.standings = [standings.correction(open, 77), standings.correction(standings.calculate(data, 'd1')[0], 1200)];
  data.standingsTables = { open: standings.snapshot(data, 'open', ['OpenUser']) };
  const before = structuredClone(data);
  const imported = preview(data, header);
  assert.deepEqual(imported.entries, []);
  assert.deepEqual(imported.rows, []);
  assert.deepEqual(imported.standingsTables.d1.members, []);
  assert.deepEqual(imported.standingsTables.open, before.standingsTables.open);
  apply(data, imported);
  assert.deepEqual(standings.calculate(JSON.parse(JSON.stringify(data)), 'd1'), []);
  assert.equal(standings.calculate(data, 'open')[0].points, 77);
  assert.deepEqual(data.drivers, before.drivers);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(standings.validate(data), []);
  assert.ok(csv.parse(csv.headers.results.join(','), 'results').errors.length);
  assert.ok(csv.parse(csv.headers.drivers.join(','), 'drivers').errors.length);
});

test('D2 complete imports can include any supplied entrant while retaining known archived manufacturers and legacy FT behavior', () => {
  const data = league();
  data.race.drivers.push(
    { id: 'ArchiveFT', name: 'Archived Full Time', number: '05', division: 'd2', status: 'FT', make: 'Ford' },
    { id: 'ArchivePT', name: 'Archived Part Time', number: '5', division: 'd2', status: 'PT', make: 'Chevrolet' }
  );
  data.records.push({ id: 'archive-race', division: 'd2', finishes: [
    { username: 'ArchiveFT', name: 'Archived Full Time', number: '05', position: 1, points: 50 },
    { username: 'ArchivePT', name: 'Archived Part Time', number: '5', position: 2, points: 40 }
  ] });
  assert.deepEqual(standings.calculate(data, 'd2').map(row => row.id), ['ArchiveFT']);
  const before = structuredClone(data);
  const imported = preview(data, header + '\n1,-,5,ArchivePT,80\n2,-,05,ArchiveFT,70\n3,-,,Former Archive Driver,10', 'd2');
  assert.deepEqual(imported.rows.slice(0, 2).map(row => [row.id, row.rawPoints, row.points, row.make]), [
    ['ArchivePT', 40, 80, 'Chevrolet'], ['ArchiveFT', 50, 70, 'Ford']
  ]);
  assert.equal(imported.rows[2].name, 'Former Archive Driver');
  assert.equal(imported.rows.length, 3);
  apply(data, imported);
  assert.deepEqual(standings.calculate(JSON.parse(JSON.stringify(data)), 'd2').map(row => row.name), ['Archived Part Time', 'Archived Full Time', 'Former Archive Driver']);
  assert.deepEqual(data.drivers, before.drivers);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.race, before.race);
});

test('snapshot membership validates its persisted shape and legacy events without IDs still distinguish later participation', () => {
  const data = league();
  delete data.records[0].id;
  const imported = preview(data);
  apply(data, imported);
  assert.deepEqual(standings.validate(data), []);
  assert.equal(data.standingsTables.d1.baseline[0].event, 'index:0');
  data.records.push({ division: 'd1', finishes: [{ username: 'LegacyNewUser', name: 'Legacy New Driver', position: 1, points: 9 }] });
  assert.equal(standings.calculate(data, 'd1').find(row => row.id === 'LegacyNewUser').points, 9);
  const invalid = [
    [],
    { d1: null },
    { d1: { members: 'ListedUser', baseline: [] } },
    { d1: { members: ['ListedUser', 'listeduser'], baseline: [] } },
    { d1: { members: [23], baseline: [] } },
    { d1: { members: ['ListedUser'], baseline: [{ event: '', drivers: [] }] } },
    { d1: { members: ['ListedUser'], baseline: [{ event: 'id:race', drivers: 'ListedUser' }] } }
  ];
  for (const tables of invalid) assert.ok(standings.validate({ ...data, standingsTables: tables }).length, JSON.stringify(tables));
});

test('Race Control may publish complete standings membership without gaining permission to alter driver records', () => {
  const data = league();
  const imported = preview(data);
  const next = { ...structuredClone(data), standings: imported.standings, standingsTables: imported.standingsTables };
  assert.equal(raceControlChangeOnly(next, data), true);
  next.drivers.profiles.ListedUser.wins = 99;
  assert.equal(raceControlChangeOnly(next, data), false);
});

test('leader and Chase cutoff gaps calculate directly from a complete five-column CSV without gap input', () => {
  const data = league();
  const source = header + '\n' + Array.from({ length: 12 }, (_, index) => `${index + 1},-,,Racer${String(index + 1).padStart(2, '0')},${120 - index * 10}`).join('\n');
  const imported = preview(data, source);
  apply(data, imported);
  const rows = standings.calculate(data, 'd1');
  assert.equal(rows.length, 12);
  assert.equal(rows[0].id, 'Racer01');
  assert.equal(standings.gapToLeader(rows, rows[0]), 0);
  assert.equal(standings.gapToLeader(rows, rows[11]), 110);
  assert.equal(standings.gapToCutoff(rows, rows[9]), 10);
  assert.equal(standings.gapToCutoff(rows, rows[10]), -10);
  assert.equal(standings.gapToCutoff(rows, rows[11]), -20);
  assert.ok(!rows.some(row => row.id === 'OldHighUser'), 'omitted historical points cannot distort the imported table gaps');
  assert.deepEqual(csv.headers.standings, ['Position', '+/-', 'Driver#', 'DriverName', 'Points']);
});
