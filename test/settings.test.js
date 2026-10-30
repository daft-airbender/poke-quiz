import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, parseSettingsUpdate, withDefaults } from '../src/routes/settings.js';

test('withDefaults fills in missing keys and drops unknown or invalid ones', () => {
  assert.deepEqual(withDefaults({}), DEFAULT_SETTINGS);
  assert.deepEqual(withDefaults(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(withDefaults({ theme: 257, roundLength: 20, playScope: 'all' }), { ...DEFAULT_SETTINGS, theme: 257 }, 'old and invalid keys dropped');
});

test('parseSettingsUpdate keeps known keys and ignores unknown ones', () => {
  assert.deepEqual(parseSettingsUpdate({ theme: 25, somethingElse: 1, roundLength: 10 }), { theme: 25 });
  assert.deepEqual(parseSettingsUpdate({}), {});
});

test('theme is a Pokédex number, #1 Bulbasaur by default', () => {
  assert.deepEqual(parseSettingsUpdate({ theme: 257 }), { theme: 257 });
  assert.equal(withDefaults({}).theme, 1);
  assert.equal(withDefaults({ theme: null }).theme, 1, 'an old "no theme" falls back to the default');
  assert.throws(() => parseSettingsUpdate({ theme: null }), { status: 400 });
});

test('Play scope is sorted, and "everything selected" is stored as null (all)', () => {
  assert.deepEqual(parseSettingsUpdate({ playScope: { modes: ['type', 'name-text'], gens: [3, 1] } }).playScope, { modes: ['name-text', 'type'], gens: [1, 3] });
  assert.deepEqual(parseSettingsUpdate({ playScope: { modes: null, gens: [9, 8, 7, 6, 5, 4, 3, 2, 1] } }).playScope, { modes: null, gens: null });
});

test('parseSettingsUpdate rejects bad values', () => {
  for (const body of [null, [], 'x', { theme: 0 }, { theme: 1026 }, { theme: '257' }, { theme: 2.5 }]) {
    assert.throws(() => parseSettingsUpdate(body), { status: 400 }, JSON.stringify(body));
  }
});

test('spaced-repetition settings: Play scope, last session lengths, extra new cards', () => {
  assert.deepEqual(withDefaults({}).playScope, { modes: null, gens: null });
  assert.deepEqual(parseSettingsUpdate({ playScope: { modes: ['type', 'name-choice'], gens: [1, 2] } }), { playScope: { modes: ['name-choice', 'type'], gens: [1, 2] } });
  assert.deepEqual(parseSettingsUpdate({ lastLength: { play: { type: 'timer', value: 10 }, free_play: null } }).lastLength.play, { type: 'timer', value: 10 });
  assert.deepEqual(parseSettingsUpdate({ newCardsExtra: { day: '2026-11-01', count: 10 } }), { newCardsExtra: { day: '2026-11-01', count: 10 } });
  for (const body of [
    { playScope: { modes: ['nope'], gens: null } },
    { playScope: { modes: [], gens: null } },
    { playScope: { modes: null, gens: [10] } },
    { playScope: null },
    { lastLength: { play: { type: 'count', value: 30 }, free_play: null } },
    { newCardsExtra: { day: 'today', count: 10 } },
    { newCardsExtra: { day: null, count: -1 } },
  ]) {
    assert.throws(() => parseSettingsUpdate(body), { status: 400 }, JSON.stringify(body));
  }
});

test('lastLength may have a kind missing (not used yet)', () => {
  assert.deepEqual(withDefaults({ lastLength: { play: { type: 'count', value: 10 } } }).lastLength, { play: { type: 'count', value: 10 } });
});

test('new cards per day: unlimited by default, or one of the offered limits', () => {
  assert.equal(withDefaults({}).newCardsPerDay, null);
  assert.deepEqual(parseSettingsUpdate({ newCardsPerDay: 30 }), { newCardsPerDay: 30 });
  assert.deepEqual(parseSettingsUpdate({ newCardsPerDay: null }), { newCardsPerDay: null });
  for (const bad of [0, 25, '20', -1]) assert.throws(() => parseSettingsUpdate({ newCardsPerDay: bad }), { status: 400 }, String(bad));
});
