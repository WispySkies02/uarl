import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../../assets/result-drivers.js';
import '../../assets/standings.js';
import '../../assets/manufacturer-badges.js';

const original = JSON.parse(fs.readFileSync(new URL('../../data/uarl.json', import.meta.url)));
const badges = globalThis.UARLManufacturerBadges;

test('finishing rows resolve manufacturers by driver identity and series, including renamed accounts and manual car numbers', () => {
  const before = JSON.stringify(original);
  assert.equal(badges.forDriver(original, 'd1', { username: 'Muffin', name: 'Muffin', number: '16', numberManual: true }), 'Ford');
  assert.equal(badges.forDriver(original, 'd1', { username: 'kingofgamez_YT' }), 'Ford');
  assert.equal(badges.forDriver(original, 'd1', { name: 'Hailey Waggonner' }), 'Toyota');
  assert.equal(badges.forDriver(original, 'd1', { username: 'JJElliott2004' }), 'Toyota');
  assert.equal(badges.forDriver(original, 'open', { username: 'JJElliott2004' }), 'Chevrolet');
  assert.equal(badges.forDriver(original, 'd2', { username: 'AnyGameAnyTime09' }), 'Toyota');
  assert.equal(JSON.stringify(original), before);
});

test('historical event manufacturers take priority over a current roster assignment', () => {
  assert.equal(badges.forDriver(original, 'd1', { username: 'Aokikoto', make: 'Ford' }), 'Ford');
  assert.equal(badges.forDriver(original, 'd1', { username: 'Aokikoto' }, { entries: [{ user: 'Aokikoto', make: 'Chevy' }] }), 'Chevrolet');
  assert.equal(badges.forDriver(original, 'd1', { username: 'UnknownEntrant' }, { entries: [{ user: 'UnknownEntrant', make: 'Toyota' }] }), 'Toyota');
  assert.equal(badges.forDriver(original, 'd1', { username: 'Aokikoto', make: 'Generic' }), '');
});

test('unknown identities and ambiguous names never borrow another driver’s manufacturer', () => {
  assert.equal(badges.forDriver(original, 'd1', { username: 'UnknownVerifiedUser', name: 'Hailey', number: '28' }), '');
  assert.equal(badges.forDriver(original, 'open', { username: 'Kingofgamez' }), '');
  const data = structuredClone(original);
  data.race.drivers.push({ id: 'AnotherHailey', name: 'Hailey', division: 'd1', number: '28', make: 'Ford' });
  data.drivers.profiles.AnotherHailey = { alias: 'Hailey', csvDivisions: ['d1'] };
  assert.equal(badges.forDriver(data, 'd1', { name: 'Hailey' }), '');
});

test('badges use local supported logos and an accessible placeholder for unassigned manufacturers', () => {
  for (const [value, brand] of [[' ford ', 'Ford'], ['TOYOTA', 'Toyota'], ['Chevy', 'Chevrolet']]) {
    const html = badges.badge(value);
    assert.ok(html.includes('aria-label="' + brand + ' manufacturer"'));
    assert.ok(html.includes('/assets/manufacturers/' + brand.toLowerCase() + '.png'));
  }
  assert.ok(badges.badge('Unlisted').includes('aria-label="Manufacturer not assigned"'));
  assert.ok(!badges.badge('<img src=x onerror=alert(1)>').includes('<img'));
});
