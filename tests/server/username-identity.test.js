import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/manufacturer-badges.js';
import '../../assets/standings-artwork.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';
import { baseline, brokenStandings } from '../fixtures/standings-roster.js';

const originalUser = 'JJElliott2004', currentUser = 'JamesRacer22';
const roster = globalThis.UARLResultDrivers, standings = globalThis.UARLStandings;
const badges = globalThis.UARLManufacturerBadges;
const identity = value => String(value || '').replace(/^@/, '').toLowerCase();
const jjRows = rows => rows.filter(row => [identity(originalUser), identity(currentUser)].includes(identity(row.id)));
const entry = data => data.drivers.teams.find(team => team.id === 'whitlock').entries.find(driver => [identity(originalUser), identity(currentUser)].includes(identity(driver.user)));

function legacy() {
  const data = brokenStandings();
  delete data.drivers.jjUsernameVersion;
  data.drivers.displayNameVersion = 1;
  data.drivers.profiles[originalUser].alias = 'JJ';
  data.drivers.profiles[originalUser].currentUsername = originalUser;
  data.drivers.profiles[originalUser].usernameAliases = [];
  for (const row of data.standings) row.name = row.username === originalUser ? 'JJ' : baseline.find(([user]) => user === row.username)[1];
  data.drivers.previousRoster.standings = structuredClone(data.standings);
  return data;
}

function normalize(data, helpers = roster) {
  const context = { window: { UARLResultDrivers: helpers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(data);
}

test('the confirmed roster username change keeps one JJ with his existing points and team manufacturers', () => {
  const data = legacy();
  entry(data).user = currentUser;
  data.drivers.openEntries.find(driver => driver.user === originalUser).user = currentUser;
  data.drivers.profiles[originalUser].numberImage = '/jj-84.png';
  data.drivers.profiles[originalUser].signatureImage = '/jj-signature.png';
  data.drivers.profiles[originalUser].wins = 8;
  const corrections = structuredClone(data.standings), otherJames = structuredClone(data.drivers.profiles.JamesEklund);
  normalize(data);
  const rows = jjRows(standings.calculate(data, 'd1'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, originalUser);
  assert.equal(rows[0].name, 'JJ');
  assert.equal(rows[0].number, '84');
  assert.equal(rows[0].points, 234);
  assert.equal(rows[0].make, 'Toyota');
  assert.equal(standings.username(data, rows[0]), currentUser);
  assert.equal(data.drivers.jjUsernameVersion, 1);
  assert.equal(roster.canonicalUser(data, currentUser), originalUser);
  assert.equal(data.drivers.profiles[originalUser].wins, 8);
  assert.equal(data.drivers.profiles[originalUser].signatureImage, '/jj-signature.png');
  assert.equal(globalThis.UARLStandingsArtwork.resolve(data, 'd1', rows[0]).src, '/jj-84.png');
  const open = jjRows(standings.calculate(data, 'open'));
  assert.equal(open.length, 1); assert.equal(open[0].id, originalUser); assert.equal(open[0].number, '48'); assert.equal(open[0].make, 'Chevrolet');
  assert.deepEqual(data.drivers.profiles.JamesEklund, otherJames);
  assert.deepEqual(data.standings.map(row => [row.username, row.number, row.pointsAdjustment, row.order]), corrections.map(row => [row.username, row.number, row.pointsAdjustment, row.order]));
});

test('repairing a renamed profile dictionary key restores the original account without losing profile data', () => {
  const data = legacy();
  const moved = { ...data.drivers.profiles[originalUser], wins: 9, championships: 2, signatureImage: '/renamed-signature.png', numberImage: '/renamed-84.png' };
  delete data.drivers.profiles[originalUser];
  data.drivers.profiles[currentUser] = moved;
  data.records = [{ id: 'before-rename', division: 'd1', finishes: [{ username: originalUser, name: 'JJ', number: '084', position: 1, points: 50, make: 'Ford' }] }];
  const records = structuredClone(data.records), corrections = structuredClone(data.standings);
  roster.register(data);
  assert.equal(data.drivers.profiles[currentUser], undefined);
  const profile = data.drivers.profiles[originalUser];
  assert.equal(profile.currentUsername, currentUser); assert.equal(profile.alias, 'JJ');
  assert.equal(profile.wins, 9); assert.equal(profile.championships, 2);
  assert.equal(profile.signatureImage, moved.signatureImage); assert.equal(profile.numberImage, moved.numberImage);
  assert.deepEqual(data.records, records); assert.deepEqual(data.standings, corrections);
  normalize(data);
  const rows = jjRows(standings.calculate(data, 'd1'));
  assert.equal(rows.length, 1); assert.equal(rows[0].id, originalUser); assert.equal(rows[0].points, 284); assert.equal(rows[0].make, 'Toyota');
  assert.equal(data.records[0].finishes[0].number, '084'); assert.equal(data.records[0].finishes[0].make, 'Ford');
});

test('the verified old/new account pair merges safely without combining another driver named JJ or James', () => {
  const data = legacy();
  Object.assign(data.drivers.profiles[originalUser], { wins: 6, championships: 1, numberImage: '/old-number.png', csvAliases: ['Old JJ'] });
  data.drivers.profiles[currentUser] = { alias: 'JJ', currentUsername: currentUser, csvDivisions: ['d1', 'open'], wins: 3, championships: 2, numberImage: '', signatureImage: '/latest-signature.png', csvAliases: ['Racer JJ'], number: '84' };
  data.drivers.profiles.AnotherJJ = { alias: 'JJ', number: '84', csvDivisions: ['d1'], wins: 12 };
  data.drivers.teams[0].entries.push({ user: 'AnotherJJ', name: 'JJ', number: '84', status: 'Full-Time' });
  const other = structuredClone(data.drivers.profiles.AnotherJJ), james = structuredClone(data.drivers.profiles.JamesEklund);
  normalize(data);
  const profile = data.drivers.profiles[originalUser];
  assert.equal(data.drivers.profiles[currentUser], undefined);
  assert.equal(profile.wins, 6); assert.equal(profile.championships, 2);
  assert.equal(profile.numberImage, '/old-number.png'); assert.equal(profile.signatureImage, '/latest-signature.png');
  assert.ok(profile.csvAliases.includes('Old JJ')); assert.ok(profile.csvAliases.includes('Racer JJ'));
  assert.deepEqual(data.drivers.profiles.AnotherJJ, other); assert.deepEqual(data.drivers.profiles.JamesEklund, james);
  const rows = standings.calculate(data, 'd1');
  assert.equal(jjRows(rows).length, 1); assert.equal(rows.filter(row => row.id === 'AnotherJJ').length, 1);
});

test('the confirmed repair does not absorb a third profile through an overlapping alias', () => {
  const data = legacy();
  data.drivers.profiles.UnrelatedAccount = { alias: 'Another person', currentUsername: currentUser, usernameAliases: [originalUser], wins: 15, signatureImage: '/other-person.png' };
  const unrelated = structuredClone(data.drivers.profiles.UnrelatedAccount);
  roster.register(data);
  assert.deepEqual(data.drivers.profiles.UnrelatedAccount, unrelated);
  assert.equal(data.drivers.profiles[originalUser].alias, 'JJ');
  assert.notEqual(data.drivers.profiles[originalUser].signatureImage, unrelated.signatureImage);
});

test('later username and display-name edits keep the same driver and retain all prior handles', () => {
  const data = normalize(legacy());
  const keys = Object.keys(data.drivers.profiles), corrections = structuredClone(data.standings);
  roster.updateUsername(data, originalUser, 'NextJJ2027');
  roster.updateUsername(data, 'NextJJ2027', 'ThirdJJ2027');
  data.drivers.profiles[originalUser].alias = 'JJ Updated';
  data.standings.find(row => row.username === originalUser).nameManual = false;
  entry(data).user = currentUser;
  data.drivers.openEntries.find(driver => driver.user === originalUser).user = 'NextJJ2027';
  normalize(data);
  assert.deepEqual(Object.keys(data.drivers.profiles), keys);
  for (const username of [originalUser, currentUser, 'NextJJ2027', 'ThirdJJ2027']) assert.equal(roster.canonicalUser(data, username), originalUser);
  const rows = jjRows(standings.calculate(data, 'd1'));
  assert.equal(rows.length, 1); assert.equal(rows[0].id, originalUser); assert.equal(rows[0].name, 'JJ Updated');
  assert.equal(rows[0].points, 234); assert.equal(rows[0].make, 'Toyota'); assert.equal(standings.username(data, rows[0]), 'ThirdJJ2027');
  assert.equal(jjRows(standings.calculate(data, 'open'))[0].make, 'Chevrolet');
  assert.deepEqual(data.standings.map(row => [row.username, row.number, row.pointsAdjustment]), corrections.map(row => [row.username, row.number, row.pointsAdjustment]));
});

test('a username collision or invalid handle is rejected without changing either verified account', () => {
  const data = normalize(legacy());
  for (const username of ['JamesEklund', 'Muffin', 'invalid name', 'xx']) {
    const before = JSON.stringify(data);
    assert.throws(() => roster.updateUsername(data, originalUser, username));
    assert.equal(JSON.stringify(data), before);
  }
  const keys = Object.keys(data.drivers.profiles);
  roster.updateUsername(data, originalUser, '');
  assert.deepEqual(Object.keys(data.drivers.profiles), keys);
  assert.equal(data.drivers.profiles[originalUser].currentUsername || '', '');
  assert.equal(roster.canonicalUser(data, currentUser), originalUser);
});

test('raw cached identities and historical event manufacturers resolve through the same verified account', () => {
  const data = normalize(legacy());
  data.race.drivers.filter(driver => driver.id === originalUser).forEach(driver => { driver.id = currentUser; });
  assert.equal(badges.forDriver(data, 'd1', { username: originalUser }), 'Toyota');
  assert.equal(badges.forDriver(data, 'open', { username: originalUser }), 'Chevrolet');
  assert.equal(badges.forDriver(data, 'd1', { username: currentUser, number: '084', make: 'Ford' }), 'Ford');
  assert.equal(badges.forDriver(data, 'd1', { username: originalUser }, { entries: [{ user: currentUser, make: 'Chevy' }] }), 'Chevrolet');
  assert.equal(badges.forDriver(data, 'd1', { username: 'UnrelatedVerified', name: 'JJ', number: '84' }), '');
});

test('alias race points and duplicate zero corrections do not split the existing standings entry', () => {
  const data = normalize(legacy());
  data.standings.unshift({ id: 'd1:jamesracer22', division: 'd1', username: currentUser, name: 'JJ', number: '84', nameManual: true, numberManual: true, pointsAdjustment: 0, previousPosition: null, order: 2, orderManual: true });
  data.records.push({ id: 'alias-race', division: 'd1', finishes: [{ username: currentUser, name: 'JJ', number: '084', position: 1, points: 45, stagePoints: 0 }] });
  const before = JSON.stringify(data), rows = jjRows(standings.calculate(data, 'd1'));
  assert.equal(rows.length, 1); assert.equal(rows[0].id, originalUser); assert.equal(rows[0].points, 279); assert.equal(rows[0].starts, 1); assert.equal(rows[0].make, 'Toyota');
  assert.equal(JSON.stringify(data), before);
});

test('Race Control may publish the verified repair and points while unauthorized identity or roster edits remain forbidden', () => {
  const old = normalize(legacy(), null);
  entry(old).user = currentUser;
  const next = normalize(structuredClone(old));
  next.standings.find(row => row.username === originalUser).pointsAdjustment += 1;
  assert.equal(raceControlChangeOnly(next, old), true);
  const changed = structuredClone(next); changed.drivers.profiles[originalUser].alias = 'Unauthorized';
  assert.equal(raceControlChangeOnly(changed, old), false);
  const changedTeam = structuredClone(next); changedTeam.drivers.teams.find(team => team.id === 'whitlock').make = 'Ford';
  assert.equal(raceControlChangeOnly(changedTeam, old), false);
});
