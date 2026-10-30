import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, parseSettingsUpdate, withDefaults } from '../src/routes/settings.js';

test('withDefaults fills in missing keys and drops unknown or invalid ones', () => {
  assert.deepEqual(withDefaults({}), DEFAULT_SETTINGS);
  assert.deepEqual(withDefaults(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(withDefaults({ roundLength: 20, theme: 'dark', autoAdvance: 'yes' }), { ...DEFAULT_SETTINGS, roundLength: 20 });
});

test('parseSettingsUpdate keeps known keys and ignores unknown ones', () => {
  assert.deepEqual(parseSettingsUpdate({ autoAdvance: true, somethingElse: 1 }), { autoAdvance: true });
  assert.deepEqual(parseSettingsUpdate({}), {});
});

test('theme is a Pokédex number or null', () => {
  assert.deepEqual(parseSettingsUpdate({ theme: 257 }), { theme: 257 });
  assert.deepEqual(parseSettingsUpdate({ theme: null }), { theme: null });
  assert.equal(withDefaults({}).theme, null);
});

test('parseSettingsUpdate sorts generations and treats all of them as "all"', () => {
  assert.deepEqual(parseSettingsUpdate({ gens: [3, 1] }), { gens: [1, 3] });
  assert.deepEqual(parseSettingsUpdate({ gens: [9, 8, 7, 6, 5, 4, 3, 2, 1] }), { gens: [] });
});

test('parseSettingsUpdate rejects bad values', () => {
  for (const body of [null, [], 'x', { roundLength: 25 }, { gens: [10] }, { autoAdvance: 1 }, { theme: 0 }, { theme: 1026 }, { theme: '257' }, { theme: 2.5 }]) {
    assert.throws(() => parseSettingsUpdate(body), { status: 400 }, JSON.stringify(body));
  }
});

test('spaced-repetition settings: Play scope, last session lengths, extra new cards', () => {
  assert.deepEqual(withDefaults({}).playScope, { modes: null, gens: null });
  assert.deepEqual(parseSettingsUpdate({ playScope: { modes: ['type', 'name-choice'], gens: [1, 2] } }), { playScope: { modes: ['type', 'name-choice'], gens: [1, 2] } });
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
