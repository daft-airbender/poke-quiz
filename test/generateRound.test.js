import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRound } from '../src/quiz/generateRound.js';
import { getMode, listModes } from '../src/quiz/modes/index.js';
import { ALL_POKEMON } from '../src/quiz/pokemon.js';
import { multiplier, TYPES } from '../src/quiz/typeEffectiveness.js';

const byName = new Map(ALL_POKEMON.map((p) => [p.name, p]));
const byId = new Map(ALL_POKEMON.map((p) => [p.id, p]));
const idFromKey = (key) => Number(key.split(':')[1]);

test('registry lists the initial modes', () => {
  assert.deepEqual(listModes(), [
    { id: 'name', label: 'Name it', answerType: 'choice' },
    { id: 'type', label: 'Type it', answerType: 'types' },
    { id: 'matchup', label: 'Matchup', answerType: 'choice' },
  ]);
});

test('every mode returns the requested number of distinct, well-formed questions', () => {
  for (const { id, answerType } of listModes()) {
    const questions = generateRound({ modeId: id, count: 20 });
    assert.equal(questions.length, 20, id);
    assert.equal(new Set(questions.map((q) => q.questionKey)).size, 20, `${id}: duplicate questions`);
    for (const q of questions) {
      assert.equal(q.mode, id);
      assert.equal(q.answerType, answerType);
      assert.ok(q.questionKey.startsWith(`${id}:`));
      assert.ok(q.prompt);
      assert.match(q.sprite, /^https:\/\//);
    }
  }
});

test('name: 4 unique choices including the answer, distractors from the same generation', () => {
  for (const q of generateRound({ modeId: 'name', count: 50 })) {
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

test('matchup: answer matches the type chart, defenders are a real combo, key is normalized', () => {
  for (const q of generateRound({ modeId: 'matchup', count: 50 })) {
    assert.deepEqual(q.choices, ['0×', '¼×', '½×', '1×', '2×', '4×']);
    const labels = { 0: '0×', 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×', 4: '4×' };
    assert.equal(q.answer, labels[multiplier(q.attackType, q.defenderTypes)]);

    assert.deepEqual(q.defenderTypes, [...q.defenderTypes].sort(), 'defender types sorted');
    assert.equal(q.questionKey, `matchup:${q.attackType}>${q.defenderTypes.join('/')}`);

    const example = byName.get(q.example);
    assert.deepEqual([...example.types].sort(), q.defenderTypes, 'example Pokémon has the defender types');
    assert.equal(q.sprite, example.sprite);
  }
});

test('generation filter is respected', () => {
  for (const modeId of ['name', 'type']) {
    for (const q of generateRound({ modeId, count: 30, gens: [1, 3] })) {
      assert.ok([1, 3].includes(byId.get(idFromKey(q.questionKey)).generation));
    }
  }
  for (const q of generateRound({ modeId: 'matchup', count: 30, gens: [1] })) {
    assert.equal(byName.get(q.example).generation, 1);
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
      if (q.answerType === 'types' || id === 'matchup') assert.deepEqual(described.answer, q.answer, q.questionKey);
    }
    assert.equal(getMode(id).describe(`${id}:nonsense>x`), null, id);
  }
});
