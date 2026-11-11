import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../assets/current-roster.js';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import { raceControlChangeOnly } from '../../netlify/functions/admin-publish.mjs';

const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
const current = globalThis.UARLCurrentRoster;
const roster = globalThis.UARLResultDrivers;
const identity = value => String(value || '').replace(/^@/, '').toLowerCase();
const aetherwing = data => data.drivers.teams.find(team => team.id === 'aetherwing');
const will = data => Object.keys(data.drivers.profiles).find(user => identity(roster.canonicalUser(data, user)) === identity(roster.canonicalUser(data, 'Raceartstudios')));

function previous() {
  const data = structuredClone(original);
  delete data.drivers.aetherwingReturnVersion;
  data.drivers.teams = data.drivers.teams.filter(team => team.id !== 'aetherwing' && team.name.toLowerCase() !== 'aetherwing emotorsports');
  for (const user of Object.keys(data.drivers.profiles)) {
    if (identity(user) === 'raceartstudios') delete data.drivers.profiles[user];
  }
  data.race.drivers = data.race.drivers.filter(driver => identity(driver.id) !== 'raceartstudios');
  return data;
}

function normalize(data, helpers = roster) {
  const context = { window: { UARLResultDrivers: helpers }, console, URLSearchParams };
  vm.runInNewContext(fs.readFileSync(new URL('../../assets/runtime-data.js', import.meta.url), 'utf8'), context);
  return context.window.UARLData.normalize(data);
}

test('Aetherwing returns once as Chevrolet with Will in 33 and two genuine open seats', () => {
  const data = previous();
  const before = structuredClone(data), archived = data.drivers.previousRoster.teams.find(team => team.id === 'aetherwing');
  current.apply(data);
  const team = aetherwing(data), user = will(data);
  assert.equal(data.drivers.aetherwingReturnVersion, 1);
  assert.equal(team.name, 'Aetherwing eMotorsports');
  assert.equal(team.make, 'Chevrolet');
  assert.equal(team.logo, archived.logo);
  assert.equal(team.founded, archived.founded);
  assert.equal(team.brandColor, archived.brandColor);
  assert.equal(team.brandColor2, archived.brandColor2);
  assert.deepEqual(team.entries.map(entry => entry.number), ['33', '42', '43']);
  assert.equal(team.entries[0].user, user);
  assert.equal(identity(roster.canonicalUser(data, user)), identity(user));
  assert.equal(data.drivers.profiles[user].alias, 'Will');
  assert.equal(data.drivers.profiles[user].number, '33');
  assert.ok(data.drivers.profiles[user].csvDivisions.includes('d1'));
  for (const entry of team.entries.slice(1)) {
    assert.ok(!entry.user);
    assert.match(entry.status, /^Open/);
  }
  assert.notEqual(team.charterCount, 6);
  assert.equal((team.pendingDrivers || []).length, 0);
  assert.deepEqual(data.drivers.teams.filter(entry => entry.id !== 'aetherwing'), before.drivers.teams);
  assert.deepEqual(data.drivers.previousRoster, before.drivers.previousRoster);
  assert.deepEqual(data.drivers.openEntries, before.drivers.openEntries);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.standings, before.standings);
  for (const key of ['rosterVersion', 'assignmentVersion', 'displayNameVersion']) assert.equal(data.drivers[key], before.drivers[key]);
  const pool = roster.pool(data, { division: 'd1' });
  assert.equal(pool.filter(driver => identity(driver.user) === identity(user)).length, 1);
  assert.ok(!pool.some(driver => /^(OPEN|TBD)$/i.test(driver.name)));
});

test('the return preserves unrelated profiles, artwork, points corrections and historical numbers', () => {
  const data = previous();
  data.drivers.teams[0].owner = 'Saved owner';
  data.drivers.teams[0].entries[0].numberImage = '/saved-dale-number.png';
  data.drivers.profiles.Aokikoto.signatureImage = '/saved-hailey-signature.png';
  data.drivers.profiles.Aokikoto.wins = 19;
  data.records = [{ id: 'saved-history', division: 'd1', finishes: [{ username: 'Aokikoto', name: 'Hailey', number: '028', position: 1, points: 50 }] }];
  data.standings = [{ id: 'd1:aokikoto', division: 'd1', username: 'Aokikoto', name: 'Preferred Hailey', number: '028', nameManual: true, numberManual: true, pointsAdjustment: 123, previousPosition: 5, order: 1, orderManual: true }];
  const before = structuredClone(data);
  current.apply(data);
  for (const key of Object.keys(before.drivers.profiles)) assert.deepEqual(data.drivers.profiles[key], before.drivers.profiles[key]);
  assert.deepEqual(data.drivers.teams.filter(team => team.id !== 'aetherwing'), before.drivers.teams);
  assert.deepEqual(data.drivers.openEntries, before.drivers.openEntries);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.standings, before.standings);
  assert.deepEqual(data.drivers.previousRoster, before.drivers.previousRoster);
});

test('a verified existing Will profile is reused without merging another driver with the same name or number', () => {
  const data = previous();
  data.drivers.profiles.OriginalWill = { alias: 'Will', currentUsername: 'Raceartstudios', usernameAliases: ['EarlierWill'], number: '33', csvAliases: ['W.'], csvDivisions: ['open'], wins: 7, championships: 2, rank: 9, signatureImage: '/will-signature.png', numberImage: '/will-33.png' };
  data.drivers.profiles.UnrelatedWill = { alias: 'Will', number: '33', wins: 4, csvDivisions: ['d1'], signatureImage: '/other-will.png' };
  data.drivers.teams[0].entries.push({ user: 'UnrelatedWill', name: 'Will', number: '33', status: 'Full-Time' });
  data.records = [{ id: 'verified-history', division: 'd1', finishes: [{ username: 'OriginalWill', name: 'Will', number: '09', position: 2, points: 45 }, { username: 'UnrelatedWill', name: 'Will', number: '33', position: 1, points: 50 }] }];
  data.standings = [{ id: 'd1:originalwill', division: 'd1', username: 'OriginalWill', name: 'Will', number: '09', numberManual: true, pointsAdjustment: 12, previousPosition: null, order: 1 }];
  const before = structuredClone(data);
  current.apply(data);
  const profile = data.drivers.profiles.OriginalWill;
  assert.equal(aetherwing(data).entries.find(entry => entry.number === '33').user, 'OriginalWill');
  assert.equal(data.drivers.profiles.Raceartstudios, undefined);
  for (const key of ['alias', 'currentUsername', 'usernameAliases', 'wins', 'championships', 'rank', 'signatureImage', 'numberImage']) assert.deepEqual(profile[key], before.drivers.profiles.OriginalWill[key]);
  assert.ok(profile.csvAliases.includes('W.'));
  assert.ok(profile.csvDivisions.includes('open'));
  assert.ok(profile.csvDivisions.includes('d1'));
  assert.deepEqual(data.drivers.profiles.UnrelatedWill, before.drivers.profiles.UnrelatedWill);
  assert.deepEqual(data.drivers.teams[0], before.drivers.teams[0]);
  assert.deepEqual(data.records, before.records);
  assert.deepEqual(data.standings, before.standings);
});

test('a team already added through Admin is not duplicated and occupied 42 or 43 seats survive', () => {
  const data = previous();
  const entries = [{ user: 'Raceartstudios', number: '33', status: 'Full-Time', numberImage: '/existing-33.png' }, { user: 'VerifiedFortyTwo', number: '42', status: 'Full-Time', signatureImage: '/existing-42.png' }, { user: 'VerifiedFortyThree', number: '43', status: 'Full-Time' }];
  data.drivers.teams.push({ id: 'aetherwing', name: 'Aetherwing eMotorsports', make: 'Chevrolet', owner: 'Saved owner', note: 'Saved return description', logo: '/saved-return-logo.png', entries: structuredClone(entries), pendingDrivers: [] });
  current.apply(data);
  assert.equal(data.drivers.teams.filter(team => team.id === 'aetherwing').length, 1);
  assert.deepEqual(aetherwing(data).entries, entries);
  assert.equal(aetherwing(data).owner, 'Saved owner');
  assert.equal(aetherwing(data).note, 'Saved return description');
  assert.equal(aetherwing(data).logo, '/saved-return-logo.png');
});

test('an existing verified driver moves without changing historical points, source charter metadata or Open artwork', () => {
  const data = previous();
  data.drivers.profiles.OldWill = { alias: 'Will', currentUsername: 'EarlierWill', usernameAliases: ['Raceartstudios'], number: '09', numberImage: '/will-09.png', signatureImage: '/will-signature.png', wins: 4, csvDivisions: ['open'] };
  data.drivers.teams[0].entries.push({ user: 'OldWill', number: '09', status: 'Part-Time', seatType: 'Part-Time', charterType: 'PT', numberImage: '/entry-09.png', signatureImage: '/entry-signature.png', customCharterFlag: true });
  data.drivers.openEntries.push({ user: 'OldWill', number: '09', make: 'Ford' });
  data.drivers.freeAgents.push({ user: 'OldWill', name: 'Will' });
  data.records = [{ id: 'old-will-race', division: 'd1', finishes: [{ username: 'OldWill', number: '09', points: 50 }] }];
  const records = structuredClone(data.records);
  current.apply(data);
  const joined = aetherwing(data).entries.find(entry => entry.number === '33');
  assert.equal(joined.user, 'OldWill'); assert.equal(joined.signatureImage, '/entry-signature.png'); assert.equal(joined.numberImage, undefined);
  const vacant = data.drivers.teams[0].entries.find(entry => entry.number === '09');
  assert.equal(vacant.user, undefined); assert.equal(vacant.status, 'Open PT'); assert.equal(vacant.charterType, 'PT'); assert.equal(vacant.customCharterFlag, true);
  assert.equal(data.drivers.profiles.OldWill.wins, 4); assert.equal(data.drivers.profiles.OldWill.currentUsername, 'Raceartstudios');
  assert.ok(data.drivers.profiles.OldWill.usernameAliases.includes('EarlierWill'));
  assert.equal(data.drivers.aetherwingReturnBackup.profile.numberImage, '/will-09.png');
  assert.equal(data.drivers.openEntries.find(entry => entry.user === 'OldWill').numberImage, '/will-09.png');
  assert.deepEqual(data.records, records);
  assert.ok(!data.drivers.freeAgents.some(entry => entry.user === 'OldWill'));
});

test('later team, lineup and name edits remain intact after the return marker is recorded', () => {
  const data = previous();
  current.apply(data);
  const team = aetherwing(data);
  team.name = 'Aetherwing custom name';
  team.make = 'Ford';
  team.entries[0].number = '099';
  team.entries = team.entries.filter(entry => entry.number !== '42');
  data.drivers.profiles[will(data)].alias = 'Will Updated';
  const before = structuredClone(data);
  current.apply(data);
  assert.deepEqual(data, before);
});

test('source vacancy types and existing destination charter settings survive a verified transfer', () => {
  for (const [status, expected] of [['Part-Time', 'Open PT'], ['Development', 'Open Development'], ['Shared', 'Open Shared']]) {
    const data = previous();
    data.drivers.profiles.Raceartstudios = { alias: 'Will', number: '09', csvDivisions: ['d1'] };
    data.drivers.teams[0].entries.push({ user: 'Raceartstudios', number: '09', status, sourceCharterFlag: true });
    data.drivers.teams.push({ id: 'aetherwing', name: 'Aetherwing eMotorsports', make: 'Chevrolet', entries: [{ number: '33', name: 'OPEN', status: 'Open FT', seatType: 'Full-Time', charterType: 'FT', destinationCharterFlag: true }] });
    current.apply(data);
    const source = data.drivers.teams[0].entries.find(entry => entry.number === '09');
    assert.equal(source.status, expected); assert.equal(source.sourceCharterFlag, true);
    const destination = aetherwing(data).entries.find(entry => entry.number === '33');
    assert.equal(destination.user, 'Raceartstudios'); assert.equal(destination.seatType, 'Full-Time'); assert.equal(destination.charterType, 'FT');
    assert.equal(destination.destinationCharterFlag, true); assert.equal(destination.sourceCharterFlag, undefined);
  }
});

test('Race Control can publish the additive return and standings corrections while roster edits remain forbidden', () => {
  const old = normalize(previous(), null), next = normalize(structuredClone(old));
  next.records.push({ id: 'return-race', division: 'd1', finishes: [] });
  assert.equal(raceControlChangeOnly(next, old), true);
  const changedTeam = structuredClone(next);
  aetherwing(changedTeam).owner = 'Unauthorized owner';
  assert.equal(raceControlChangeOnly(changedTeam, old), false);
  const changedProfile = structuredClone(next);
  changedProfile.drivers.profiles[will(changedProfile)].alias = 'Unauthorized name';
  assert.equal(raceControlChangeOnly(changedProfile, old), false);
  const forgedVersion = structuredClone(next);
  delete forgedVersion.drivers.aetherwingReturnVersion;
  forgedVersion.drivers.teams[0].note = 'Unauthorized note';
  assert.equal(raceControlChangeOnly(forgedVersion, old), false);
});
