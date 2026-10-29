import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRound } from '../src/quiz/generateRound.js';
import { getMode, listModes } from '../src/quiz/modes/index.js';
import { ALL_POKEMON } from '../src/quiz/pokemon.js';
import { multiplier, TYPES } from '../src/quiz/typeEffectiveness.js';

const byName = new Map(ALL_POKEMON.map((p) => [p.name, p]));
const byId = new Map(ALL_POKEMON.map((p) => [p.id, p]));
const idFromKey = (key) => Number(key.split(':')[1]);

test('registry lists the modes in order', () => {
  assert.deepEqual(
    listModes().map((m) => m.id),
    ['name-choice', 'type', 'effectiveness-single', 'effectiveness-dual'],
  );
});

test('card counts per mode (all generations)', () => {
  const counts = Object.fromEntries(listModes().map(({ id }) => [id, getMode(id).candidates(ALL_POKEMON).length]));
  assert.deepEqual(counts, {
    'name-choice': 1025,
    type: 1025,
    'effectiveness-single': 324,
    'effectiveness-dual': 2448,
  });
});

test('every mode returns the requested number of distinct, well-formed questions', () => {
  for (const { id, answerType } of listModes()) {
    const count = Math.min(20, getMode(id).candidates(ALL_POKEMON).length);
    const questions = generateRound({ modeId: id, count });
    assert.equal(questions.length, count, id);
    assert.equal(new Set(questions.map((q) => q.questionKey)).size, count, `${id}: duplicate questions`);
    for (const q of questions) {
      assert.equal(q.mode, id);
      assert.equal(q.answerType, answerType);
      assert.ok(q.questionKey.startsWith(`${id}:`));
      assert.ok(q.prompt);
      if (q.sprite !== undefined) assert.match(q.sprite, /^https:\/\//);
    }
  }
});

test('name-choice: 4 unique choices including the answer, distractors from the same generation', () => {
  for (const q of generateRound({ modeId: 'name-choice', count: 50 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.equal(q.answer, pokemon.name);
    assert.equal(q.sprite, pokemon.sprite);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.ok(q.choices.includes(q.answer));
    for (const choice of q.choices) assert.equal(byName.get(choice).generation, pokemon.generation);
  }
});

test("type: choices are all 18 types and the answer is the Pokémon's types", () => {
  for (const q of generateRound({ modeId: 'type', count: 30 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.deepEqual(q.choices, TYPES);
    assert.deepEqual(q.answer, pokemon.types);
    assert.ok(q.prompt.includes(pokemon.name));
  }
});

const LABELS = { 0: '0×', 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×', 4: '4×' };

test('effectiveness-single: one defending type, 4 choices, answer from the type chart', () => {
  const keys = new Set();
  for (const q of generateRound({ modeId: 'effectiveness-single', count: 324 })) {
    keys.add(q.questionKey);
    assert.deepEqual(q.choices, ['0×', '½×', '1×', '2×']);
    assert.equal(q.defenderTypes.length, 1);
    assert.equal(q.answer, LABELS[multiplier(q.attackType, q.defenderTypes)]);
    assert.equal(q.questionKey, `effectiveness-single:${q.attackType}>${q.defenderTypes[0]}`);
    assert.deepEqual(byName.get(q.example).types, q.defenderTypes, 'example is a pure-type Pokémon');
  }
  assert.equal(keys.size, 324, 'every attack × defender pair');
});

test('effectiveness-dual: real dual combos, 6 choices, sorted key', () => {
  for (const q of generateRound({ modeId: 'effectiveness-dual', count: 100 })) {
    assert.deepEqual(q.choices, ['0×', '¼×', '½×', '1×', '2×', '4×']);
    assert.equal(q.defenderTypes.length, 2);
    assert.equal(q.answer, LABELS[multiplier(q.attackType, q.defenderTypes)]);
    assert.deepEqual(q.defenderTypes, [...q.defenderTypes].sort(), 'defender types sorted');
    assert.equal(q.questionKey, `effectiveness-dual:${q.attackType}>${q.defenderTypes.join('/')}`);

    const example = byName.get(q.example);
    assert.deepEqual([...example.types].sort(), q.defenderTypes, 'example Pokémon has the defender types');
    assert.equal(q.sprite, example.sprite);
  }
});

test('generation filter is respected', () => {
  for (const modeId of ['name-choice', 'type']) {
    for (const q of generateRound({ modeId, count: 30, gens: [1, 3] })) {
      assert.ok([1, 3].includes(byId.get(idFromKey(q.questionKey)).generation));
    }
  }
  for (const modeId of ['effectiveness-dual', 'effectiveness-single']) {
    for (const q of generateRound({ modeId, count: 30, gens: [1] })) {
      // Gen 1 has no pure Flying, Dark, Steel… Pokémon; those single-type examples come from other gens.
      if (modeId === 'effectiveness-dual' || ALL_POKEMON.some((p) => p.generation === 1 && p.types.join() === q.defenderTypes.join())) {
        assert.equal(byName.get(q.example).generation, 1, q.questionKey);
      }
    }
  }
});

test('unknown mode throws', () => {
  assert.throws(() => generateRound({ modeId: 'nope', count: 5 }), /Unknown mode/);
});

test('every mode describes its own question keys for the progress view', () => {
  for (const { id } of listModes()) {
    for (const q of generateRound({ modeId: id, count: 10 })) {
      const described = getMode(id).describe(q.questionKey);
      assert.ok(described?.title, q.questionKey);
      if (described.answer !== undefined) assert.deepEqual(described.answer, q.answer, q.questionKey);
    }
    for (const bad of ['nonsense>x', '99999', 'fire>steel/grass', 'fire>grass/steel/ice']) {
      if (getMode(id).describe(`${id}:${bad}`) !== null) assert.fail(`${id} accepted ${bad}`);
    }
  }
});
