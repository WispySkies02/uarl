import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/result-drivers.js';
import '../../assets/standings-artwork.js';

const artwork = globalThis.UARLStandingsArtwork;
function league() {
  return {
    drivers: {
      profiles: {
        StableUser: { alias: 'Alex', currentUsername: 'NewUser', usernameAliases: ['OldUser'], number: '05', numberImage: '/profile-number.png' },
        OtherUser: { alias: 'Alex', number: '5', numberImage: '/other-number.png' }
      },
      teams: [{ id: 'team', entries: [
        { user: 'StableUser', number: '05', numberImage: '/entry-number.png' },
        { user: 'OtherUser', number: '5' }
      ] }],
      openEntries: [{ user: 'StableUser', number: '48', numberImage: '/open-number.png' }]
    },
    race: { drivers: [{ id: 'StableUser', division: 'd2', number: '84', numberImage: '/archived-number.png' }] }
  };
}

test('standings number artwork resolves verified usernames and aliases, with entry artwork before profile artwork', () => {
  const data = league();
  for (const identity of [{ id: 'StableUser' }, { user: 'stableuser' }, { username: 'newuser' }, { id: 'OLDUSER' }]) {
    const resolved = artwork.resolve(data, 'd1', { ...identity, number: '05' });
    assert.equal(resolved.src, '/entry-number.png');
    assert.equal(resolved.target.section, 'teams');
  }
  // A standings correction ID must not hide its explicit driver username.
  assert.equal(artwork.resolve(data, 'd1', { id: 'd1:stableuser', username: 'NewUser', number: '05' }).src, '/entry-number.png');
  delete data.drivers.teams[0].entries[0].numberImage;
  const profile = artwork.resolve(data, 'd1', { id: 'StableUser', number: '05' });
  assert.equal(profile.src, '/profile-number.png');
  assert.equal(profile.target.section, 'profiles');
});

test('number artwork never identifies a driver from a shared name or car number', () => {
  const data = league();
  for (const row of [
    { id: 'UnrelatedUser', name: 'Alex', number: '05' },
    { name: 'Alex', number: '05' },
    { number: '05' }
  ]) {
    const result = artwork.resolve(data, 'd1', row);
    assert.equal(result.src, '');
    assert.equal(result.target, null);
  }
  assert.equal(artwork.resolve(data, 'd1', { id: 'OtherUser', number: '5' }).src, '/other-number.png');
});

test('manual numbers and leading zeros require an exact artwork-number match', () => {
  const data = league();
  for (const number of ['5', '19', '005', '']) {
    assert.equal(artwork.resolve(data, 'd1', { id: 'StableUser', number }).src, '');
  }
  assert.equal(artwork.resolve(data, 'd1', { id: 'StableUser', number: '05' }).src, '/entry-number.png');
  delete data.drivers.teams[0].entries[0].numberImage;
  data.drivers.profiles.StableUser.number = '5';
  assert.equal(artwork.resolve(data, 'd1', { id: 'StableUser', number: '05' }).src, '');
});

test('Open Series uses its own entry or matching profile artwork without borrowing the D1 number', () => {
  const data = league(), row = { id: 'NewUser', number: '48' };
  const entry = artwork.resolve(data, 'open', row);
  assert.equal(entry.src, '/open-number.png');
  assert.equal(entry.target.section, 'open');
  delete data.drivers.openEntries[0].numberImage;
  assert.equal(artwork.resolve(data, 'open', row).src, '');
  data.drivers.profiles.StableUser.number = '48';
  assert.equal(artwork.resolve(data, 'open', row).src, '/profile-number.png');
  assert.equal(artwork.resolve(data, 'd1', { id: 'StableUser', number: '05' }).src, '/entry-number.png');
});

test('archived D2 numbers use only matching archived artwork and have no current-editor target', () => {
  const data = league(), row = { id: 'OldUser', number: '84' };
  const archived = artwork.resolve(data, 'd2', row);
  assert.equal(archived.src, '/archived-number.png');
  assert.equal(archived.target, null);
  assert.equal(artwork.resolve(data, 'd2', { id: 'StableUser', number: '05' }).src, '');
  delete data.race.drivers[0].numberImage;
  data.drivers.profiles.StableUser.number = '84';
  assert.equal(artwork.resolve(data, 'd2', row).src, '');
});

test('rendered artwork preserves the real number text and all standings and roster data', () => {
  const data = league();
  const row = { id: 'StableUser', number: '05', position: 6, points: 124, movement: 2 };
  const before = JSON.stringify({ data, row });
  const html = artwork.html(data, 'd1', row);
  assert.match(html, /standings-number-text/);
  assert.match(html, />05<\/span>/);
  assert.match(html, /standings-number-image/);
  assert.match(html, /\/entry-number\.png/);
  const fallback = artwork.html(data, 'd1', { ...row, number: '19' });
  assert.match(fallback, />19<\/span>/);
  assert.doesNotMatch(fallback, /<img\b/);
  assert.equal(JSON.stringify({ data, row }), before);
});
