'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalize } = require('../functions/profile-update-core');

const data = { 'Beach Tennis': [
  { day: 4, status: 'available', start: '18:00', end: '22:00' },
  { day: 5, status: 'available', start: '18:00', end: '21:00' },
  { day: 5, status: 'unavailable', start: '17:00', end: '19:00' },
] };
assert.deepEqual(normalize({ availabilityBySport: data }).availabilityBySport, data);
for (const bad of [
  { 'Beach Tennis': [{ day: 7, status: 'available', start: '18:00', end: '22:00' }] },
  { 'Beach Tennis': [{ day: 4, status: 'available', start: '22:00', end: '18:00' }] },
  { 'Beach Tennis': [{ day: 4, status: 'available', start: '25:00', end: '26:00' }] },
  { 'Esporte inventado': [] },
]) assert.throws(() => normalize({ availabilityBySport: bad }));
assert.deepEqual(normalize({ availabilityBySport: {} }).availabilityBySport, {});

const auth = fs.readFileSync('js/views/auth.js', 'utf8');
const poll = fs.readFileSync('js/views/schedule-poll.js', 'utf8');
const store = fs.readFileSync('js/store.js', 'utf8');
assert.match(auth, /payload\.availabilityBySport = availabilityPatch/);
assert.match(auth, /window\._renderProfileAvailability\(\)/);
assert.match(store, /this\.currentUser\.availabilityBySport = profile\.availabilityBySport/);
assert.match(poll, /_schSeedOwnProfile\(t, m\)/);
assert.match(poll, /profileOptions: desired/);
const availabilityHelper = auth.match(/window\._profileAvailabilityPatch = function\(cu, dirty, availability\) \{[\s\S]*?\n\};/);
assert.ok(availabilityHelper);
const profileWindow = {};
vm.runInNewContext(availabilityHelper[0], { window: profileWindow, JSON, Error });
assert.equal(profileWindow._profileAvailabilityPatch({ _profileLoaded: false }, false, {}), null);
assert.throws(() => profileWindow._profileAvailabilityPatch({ _profileLoaded: false }, true, {}), /profile-loading/);
assert.equal(JSON.stringify(profileWindow._profileAvailabilityPatch({ _profileLoaded: true }, true, data)), JSON.stringify(data));
const w = { _spCor: x => x };
vm.runInNewContext(poll, { window: w, document: {}, console, Date, Math, Number, String, Array });
const proposed = w._schProfileOptions({ uid: 'user-1', availabilityBySport: data }, 'Beach Tennis', 80);
assert.equal(proposed.length, 1);
assert.equal(proposed[0].id, 'sp_av_user-1_4_1800');
assert.equal(proposed[0].byUid, 'user-1');
assert.equal(proposed[0].kind, 'weekly');
assert.equal(w._schProfileOptions({ uid: 'user-1', availabilityBySport: data }, 'Tênis', 80).length, 0);
assert.equal(w._schProfileOptions({ uid: 'user-1', availabilityBySport: data }, 'Beach Tennis', 0).length, 0);
console.log('✓ disponibilidade por modalidade valida; não posso bloqueia proposta automática; perfil vira proposta própria');
