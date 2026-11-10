import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import { raceControlChangeOnly, validateStandings } from '../../netlify/functions/admin-publish.mjs';
import { brokenStandings, baseline, reportedPositions } from '../fixtures/standings-roster.js';

const roster = globalThis.UARLResultDrivers, standings = globalThis.UARLStandings;
function normalize(data, helpers = roster) {
  const context = { window: { UARLResultDrivers: helpers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(data);
}
function points(data) { return standings.calculate(data, 'd1').filter(row => row.points > 0); }
function withoutNames(rows) { return rows.map(({ name, ...row }) => row); }

test('the reported twelve missing standings names recover while every imported points total, number and position stays intact', () => {
  const data = JSON.parse(JSON.stringify(brokenStandings()));
  assert.deepEqual(data.standings.flatMap((row, i) => row.name ? [] : i + 1), reportedPositions);
  const before = structuredClone(data), teams = JSON.stringify(data.drivers.teams);
  normalize(data);
  const rows = points(data);
  assert.equal(rows.length, 17);
  for (const [i, [user, name, number, total]] of baseline.entries()) {
    assert.equal(rows[i].name, user === 'JJElliott2004' ? 'JJ' : name);
    assert.equal(rows[i].id, user); assert.equal(rows[i].number, number);
    assert.equal(rows[i].points, total); assert.equal(rows[i].position, i + 1);
  }
  assert.deepEqual(withoutNames(data.standings), withoutNames(before.standings));
  assert.deepEqual(data.drivers.previousRoster.standings, before.drivers.previousRoster.standings);
  assert.equal(JSON.stringify(data.drivers.teams), teams);
  assert.deepEqual(validateStandings(data), []);
});

test('a fresh roster migration keeps manual CSV names when a driver has no per-team name override', () => {
  const data = brokenStandings(), old = data.drivers.previousRoster;
  data.standings = structuredClone(old.standings); data.standings[0].name = 'Lance July';
  Object.assign(data.drivers, { teams: structuredClone(old.teams), profiles: structuredClone(old.profiles), freeAgents: structuredClone(old.freeAgents), recentMoves: structuredClone(old.recentMoves) });
  delete data.drivers.assignmentVersion; delete data.drivers.previousRoster;
  normalize(data);
  assert.equal(points(data)[0].name, 'Lance July'); assert.equal(points(data)[1].name, 'JJ');
  assert.ok(data.standings.every(row => typeof row.name === 'string' && row.name.trim()));
  assert.deepEqual(points(data).map(row => row.points), baseline.map(row => row[3]));
  assert.deepEqual(validateStandings(data), []);
});

test('missing names recover from verified profiles or archive identities without resetting a later team transfer', () => {
  const data = brokenStandings(); data.drivers.previousRoster.standings = [];
  const team = data.drivers.teams.find(team => team.id === 'sham'); team.make = 'Toyota'; team.entries[0].number = '7';
  for (const [i, value] of [[0, null], [2, 'undefined'], [5, '   ']]) data.standings[i].name = value;
  data.standings.push({ id: 'd1:formerverifieddriver', division: 'd1', username: 'FormerVerifiedDriver', number: '99', nameManual: true, numberManual: true, pointsAdjustment: 1, previousPosition: null, order: 18 });
  normalize(data);
  assert.equal(data.standings[0].name, 'Lance'); assert.equal(data.standings[2].name, 'Gman');
  assert.equal(data.standings.at(-1).name, 'FormerVerifiedDriver');
  assert.equal(team.make, 'Toyota'); assert.equal(team.entries[0].number, '7');
  const once = JSON.stringify(data); normalize(data); assert.equal(JSON.stringify(data), once);
  assert.deepEqual(validateStandings(data), []);
});

test('JJ is renamed once without changing James Eklund, career data, artwork or accepted CSV names', () => {
  const data = brokenStandings();
  const jj = data.drivers.profiles.JJElliott2004;
  jj.signatureImage = '/saved-signature.png'; jj.numberImage = '/saved-number.png';
  const wins = jj.wins;
  data.drivers.teams.find(team => team.id === 'whitlock').entries.find(entry => entry.user === 'JJElliott2004').name = 'James';
  normalize(data);
  assert.equal(jj.alias, 'JJ'); assert.equal(jj.wins, wins);
  assert.equal(jj.signatureImage, '/saved-signature.png'); assert.equal(jj.numberImage, '/saved-number.png');
  const pool = roster.pool(data, { division: 'd1' });
  for (const name of ['James', 'JJ Whitlock', 'JJ']) assert.equal(roster.resolve(pool, name).user, 'JJElliott2004');
  assert.equal(roster.resolve(pool, 'James Eklund').user, 'JamesEklund');
  assert.equal(data.drivers.profiles.JamesEklund.alias, 'James Eklund');
  jj.alias = 'JJ Updated'; normalize(data); assert.equal(jj.alias, 'JJ Updated');
});

test('standings calculations reject a missing manual name as an override and safely sort an unrostered correction', () => {
  const data = brokenStandings();
  data.standings.push({ id: 'd1:formerverifieddriver', division: 'd1', username: 'FormerVerifiedDriver', pointsAdjustment: 2, nameManual: true });
  const before = JSON.stringify(data), rows = standings.calculate(data, 'd1');
  assert.ok(rows.every(row => typeof row.name === 'string' && row.name.trim() && !/^(undefined|null)$/i.test(row.name)));
  assert.equal(rows.find(row => row.id === 'FormerVerifiedDriver').name, 'FormerVerifiedDriver');
  assert.equal(JSON.stringify(data), before);
});

test('Race Control can publish the repaired standings but cannot change roster or profile data', () => {
  const current = normalize(brokenStandings(), null), next = normalize(structuredClone(current));
  next.standings[0].pointsAdjustment += 5;
  assert.equal(raceControlChangeOnly(next, current), true);
  const changed = structuredClone(next); changed.drivers.profiles.JJElliott2004.alias = 'Unauthorized';
  assert.equal(raceControlChangeOnly(changed, current), false);
  changed.drivers.teams[0].owner = 'Unauthorized'; assert.equal(raceControlChangeOnly(changed, current), false);
});
