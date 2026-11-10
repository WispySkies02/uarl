import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import { baseline, brokenStandings } from '../fixtures/standings-roster.js';

const standings = globalThis.UARLStandings;
function normalizedLeague() {
  const context = { window: { UARLResultDrivers: globalThis.UARLResultDrivers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(brokenStandings());
}

test('cutoff margins require the driver and both actual boundary positions on the full board', () => {
  const leader = { id: 'leader', position: 1, points: 100 };
  const tenth = { id: 'tenth', position: 10, points: 60 };
  const eleventh = { id: 'eleventh', position: 11, points: 50 };
  const rows = [leader, tenth, eleventh];
  assert.equal(standings.gapToCutoff(null, leader), null);
  assert.equal(standings.gapToCutoff([], leader), null);
  assert.equal(standings.gapToCutoff(rows, null), null);
  assert.equal(standings.gapToCutoff(rows, { id: 'absent', position: 12, points: 40 }), null);
  assert.equal(standings.gapToCutoff([leader, tenth], leader), null);
  assert.equal(standings.gapToCutoff([leader, eleventh], leader), null);
});

test('cutoff margins use ranked positions rather than array indexes and preserve the board', () => {
  const rows = [
    { id: 'leader', position: 1, points: 100 },
    { id: 'outside', position: 12, points: 40 },
    { id: 'eleventh', position: 11, points: 50 },
    { id: 'tenth', position: 10, points: 60 }
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(rows.map(row => standings.gapToCutoff(rows, row)), [50, -20, -10, 10]);
  assert.equal(JSON.stringify(rows), before);
});

test('tied cutoff totals have zero margin and negative corrected totals keep the right sign', () => {
  const rows = [
    { id: 'leader', position: 1, points: -5 },
    { id: 'tenth', position: 10, points: -20 },
    { id: 'eleventh', position: 11, points: -20 },
    { id: 'outside', position: 12, points: -35 }
  ];
  assert.deepEqual(rows.map(row => standings.gapToCutoff(rows, row)), [15, 0, 0, -15]);
});

test('a pending points audit anywhere on the board makes every cutoff margin unavailable', () => {
  for (const pendingPosition of [1, 10, 11, 12]) {
    const rows = [
      { id: 'leader', position: 1, points: 100 },
      { id: 'tenth', position: 10, points: 60 },
      { id: 'eleventh', position: 11, points: 50 },
      { id: 'outside', position: 12, points: 40 }
    ];
    rows.find(row => row.position === pendingPosition).pointsPending = true;
    const before = JSON.stringify(rows);
    assert.deepEqual(rows.map(row => standings.gapToCutoff(rows, row)), [null, null, null, null]);
    assert.equal(JSON.stringify(rows), before);
  }
});

test('repaired imported totals measure the top ten against P11 and the rest against P10 before filtering', () => {
  const data = normalizedLeague();
  const rows = standings.calculate(data, 'd1');
  const dataBefore = JSON.stringify(data), rowsBefore = JSON.stringify(rows);
  for (const [index, [user, , , total]] of baseline.entries()) {
    const row = rows.find(entry => entry.id === user);
    assert.equal(standings.gapToCutoff(rows, row), total - (index < 10 ? 68 : 76));
  }
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'lancejuly')), 213);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === '58bbwapache')), 8);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'Frogboy4783')), -8);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'AnyGameAnyTime09')), -71);
  const matched = rows.filter(row => row.id === '58bbwapache');
  assert.equal(standings.gapToCutoff(rows, matched[0]), 8);
  assert.equal(JSON.stringify(data), dataBefore);
  assert.equal(JSON.stringify(rows), rowsBefore);
});

test('manual corrections and later race points replace both cutoff reference drivers automatically', () => {
  const data = normalizedLeague();
  let rows = standings.calculate(data, 'd1');
  data.standings = standings.merge(data, [standings.correction(rows.find(row => row.id === 'Frogboy4783'), 85)]);
  rows = standings.calculate(data, 'd1');
  assert.equal(rows.find(row => row.position === 10).id, 'Aokikoto');
  assert.equal(rows.find(row => row.position === 11).id, '58bbwapache');
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'Aokikoto')), 7);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === '58bbwapache')), -7);

  data.records.push({
    id: 'cutoff-followup', division: 'd1', date: '2026-11-10',
    finishes: [{ username: '58bbwapache', name: 'Dale', number: '16', position: 1, points: 8, stagePoints: 2 }]
  });
  rows = standings.calculate(data, 'd1');
  assert.equal(rows.find(row => row.position === 10).id, 'Frogboy4783');
  assert.equal(rows.find(row => row.position === 11).id, 'Aokikoto');
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === '58bbwapache')), 3);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'Frogboy4783')), 2);
  assert.equal(standings.gapToCutoff(rows, rows.find(row => row.id === 'Aokikoto')), -2);
});
