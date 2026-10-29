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

test('parseSettingsUpdate sorts generations and treats all of them as "all"', () => {
  assert.deepEqual(parseSettingsUpdate({ gens: [3, 1] }), { gens: [1, 3] });
  assert.deepEqual(parseSettingsUpdate({ gens: [9, 8, 7, 6, 5, 4, 3, 2, 1] }), { gens: [] });
});

test('parseSettingsUpdate rejects bad values', () => {
  for (const body of [null, [], 'x', { roundLength: 25 }, { gens: [10] }, { autoAdvance: 1 }]) {
    assert.throws(() => parseSettingsUpdate(body), { status: 400 }, JSON.stringify(body));
  }
});
