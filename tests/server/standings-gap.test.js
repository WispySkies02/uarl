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

test('leader gaps are unavailable without a board or a row belonging to that board', () => {
  const leader = { id: 'leader', points: 100 };
  assert.equal(standings.gapToLeader([], leader), null);
  assert.equal(standings.gapToLeader(null, leader), null);
  assert.equal(standings.gapToLeader([leader], null), null);
  assert.equal(standings.gapToLeader([leader], { id: 'absent', points: 50 }), null);
});

test('leader gaps handle tied totals and negative corrections without changing the board', () => {
  const rows = [{ id: 'leader', points: -5 }, { id: 'tied', points: -5 }, { id: 'behind', points: -20 }];
  const before = JSON.stringify(rows);
  assert.deepEqual(rows.map(row => standings.gapToLeader(rows, row)), [0, 0, 15]);
  assert.equal(JSON.stringify(rows), before);
});

test('an unresolved points audit anywhere on the board keeps every leader gap unavailable', () => {
  for (const pendingIndex of [0, 1, 2]) {
    const rows = [{ id: 'leader', points: 100 }, { id: 'second', points: 75 }, { id: 'third', points: 50 }];
    rows[pendingIndex].pointsPending = true;
    const before = JSON.stringify(rows);
    assert.deepEqual(rows.map(row => standings.gapToLeader(rows, row)), [null, null, null]);
    assert.equal(JSON.stringify(rows), before);
    rows[pendingIndex].pointsPending = false;
    assert.equal(standings.gapToLeader(rows, rows[2]), 50);
  }
});

test('repaired imported standings use their saved totals for leader gaps and preserve all source data', () => {
  const data = normalizedLeague();
  const rows = standings.calculate(data, 'd1');
  const dataBefore = JSON.stringify(data), rowsBefore = JSON.stringify(rows);
  for (const [user, , , total] of baseline) {
    const row = rows.find(entry => entry.id === user);
    assert.equal(row.points, total);
    assert.equal(standings.gapToLeader(rows, row), 281 - total);
  }
  // A filtered view must still pass the complete board, rather than promoting its first match.
  const matched = rows.filter(row => row.id === 'JJElliott2004');
  assert.equal(standings.gapToLeader(rows, matched[0]), 47);
  assert.equal(JSON.stringify(data), dataBefore);
  assert.equal(JSON.stringify(rows), rowsBefore);
});

test('leader gaps follow manual points corrections and later race points automatically', () => {
  const data = normalizedLeague();
  let rows = standings.calculate(data, 'd1');
  const jj = rows.find(row => row.id === 'JJElliott2004');
  data.standings = standings.merge(data, [standings.correction(jj, 300)]);
  rows = standings.calculate(data, 'd1');
  assert.equal(rows[0].id, 'JJElliott2004');
  assert.equal(standings.gapToLeader(rows, rows.find(row => row.id === 'lancejuly')), 19);

  data.records.push({
    id: 'gap-followup', division: 'd1', date: '2026-11-10',
    finishes: [{ username: 'lancejuly', name: 'Lance', number: '88', position: 1, points: 10, stagePoints: 2 }]
  });
  rows = standings.calculate(data, 'd1');
  const lance = rows.find(row => row.id === 'lancejuly');
  assert.equal(lance.points, 293);
  assert.equal(standings.gapToLeader(rows, lance), 7);
});
