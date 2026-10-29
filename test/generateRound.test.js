import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRound } from '../src/quiz/generateRound.js';
import { getMode, listModes } from '../src/quiz/modes/index.js';
import { ALL_POKEMON, REGIONS, regionOf } from '../src/quiz/pokemon.js';
import { multiplier, TYPES } from '../src/quiz/typeEffectiveness.js';

const byName = new Map(ALL_POKEMON.map((p) => [p.name, p]));
const byId = new Map(ALL_POKEMON.map((p) => [p.id, p]));
const idFromKey = (key) => Number(key.split(':')[1]);

test('registry lists the modes in order', () => {
  assert.deepEqual(
    listModes().map((m) => m.id),
    [
      'name-text',
      'name-choice',
      'type',
      'effectiveness-single',
      'effectiveness-dual',
      'counters-single',
      'counters-dual',
      'mon-to-dex',
      'dex-to-mon',
      'mon-to-region',
      'region-to-mon',
    ],
  );
});

test('card counts per mode (all generations)', () => {
  const counts = Object.fromEntries(listModes().map(({ id }) => [id, getMode(id).candidates(ALL_POKEMON).length]));
  assert.deepEqual(counts, {
    'name-text': 1025,
    'name-choice': 1025,
    type: 1025,
    'effectiveness-single': 324,
    'effectiveness-dual': 2448,
    'counters-single': 18,
    'counters-dual': 136,
    'mon-to-dex': 1025,
    'dex-to-mon': 1025,
    'mon-to-region': 1025,
    'region-to-mon': 1025,
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

test('counters: answer is every attack type at 2× or more, in chart order, with no pick limit', () => {
  for (const modeId of ['counters-single', 'counters-dual']) {
    for (const q of generateRound({ modeId, count: 18 })) {
      assert.equal(q.defenderTypes.length, modeId === 'counters-single' ? 1 : 2);
      assert.deepEqual(q.answer, TYPES.filter((t) => multiplier(t, q.defenderTypes) >= 2));
      assert.ok(q.answer.length >= 1);
      assert.equal(q.maxSelected, 18);
      assert.deepEqual(q.choices, TYPES);
    }
  }
  const grassSteel = getMode('counters-dual').describe('counters-dual:grass/steel');
  assert.deepEqual(grassSteel.answer, ['fire', 'fighting'], 'Fire is 4×, Fighting 2×');
  assert.deepEqual(getMode('counters-single').describe('counters-single:grass').answer, ['fire', 'poison', 'flying', 'bug', 'ice'].sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b)));
});

test('regions: debut generation, except the seven Hisui Pokémon', () => {
  assert.equal(regionOf(byName.get('Pikachu')), 'Kanto');
  assert.equal(regionOf(byName.get('Grookey')), 'Galar');
  assert.equal(regionOf(byName.get('Meltan')), 'Alola');
  assert.equal(regionOf(byName.get('Sprigatito')), 'Paldea');
  const hisui = ALL_POKEMON.filter((p) => regionOf(p) === 'Hisui').map((p) => p.name);
  assert.deepEqual(hisui, ['Wyrdeer', 'Kleavor', 'Ursaluna', 'Basculegion', 'Sneasler', 'Overqwil', 'Enamorus']);
  assert.equal(REGIONS.length, 10);
  assert.ok(ALL_POKEMON.every((p) => REGIONS.includes(regionOf(p))));
});

test('mon-to-region: all 10 regions in order, answer is the debut region', () => {
  for (const q of generateRound({ modeId: 'mon-to-region', count: 50 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.deepEqual(q.choices, REGIONS);
    assert.equal(q.answer, regionOf(pokemon));
    assert.ok(q.prompt.includes(pokemon.name));
  }
});

test('region-to-mon: 4 options with sprites, wrong ones from other regions within 2 generations', () => {
  for (const q of generateRound({ modeId: 'region-to-mon', count: 200 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    const region = regionOf(pokemon);
    assert.equal(q.answer, pokemon.name);
    assert.ok(q.prompt.includes(region));
    assert.equal(q.sprite, undefined, 'no sprite: it would give the answer away');
    assert.equal(new Set(q.choices).size, 4);
    assert.ok(q.choices.includes(q.answer));
    assert.deepEqual(Object.keys(q.choiceSprites).sort(), [...q.choices].sort());
    for (const name of q.choices.filter((c) => c !== q.answer)) {
      const other = byName.get(name);
      assert.notEqual(regionOf(other), region, `${name} is also from ${region}`);
      assert.ok(Math.abs(other.generation - pokemon.generation) <= 2, `${name} is too far from ${pokemon.name}`);
    }
  }
});

test('region-to-mon: Hisui questions use Gen 6–9 wrong options, never Hisui', () => {
  const kleavor = byName.get('Kleavor');
  const mode = getMode('region-to-mon');
  for (let i = 0; i < 50; i++) {
    const q = mode.question({ pokemon: kleavor }, ALL_POKEMON, Math.random);
    assert.equal(q.prompt, 'Which of these is from Hisui?');
    for (const name of q.choices.filter((c) => c !== 'Kleavor')) {
      assert.ok(byName.get(name).generation >= 6 && regionOf(byName.get(name)) !== 'Hisui', name);
    }
  }
});

test('typed modes: name-text and dex-to-mon expect the name, mon-to-dex the number', () => {
  for (const q of generateRound({ modeId: 'name-text', count: 30 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.equal(q.answer, pokemon.name);
    assert.equal(q.sprite, pokemon.sprite);
    assert.equal(q.choices, undefined);
    assert.ok(!q.prompt.includes(pokemon.name));
    assert.ok(Array.isArray(q.lookAlikes) && !q.lookAlikes.includes(pokemon.name));
  }
  for (const q of generateRound({ modeId: 'dex-to-mon', count: 30 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.equal(q.answer, pokemon.name);
    assert.equal(q.sprite, undefined, 'no sprite: it would give the answer away');
    assert.ok(q.prompt.includes(`#${String(pokemon.id).padStart(3, '0')}`));
  }
  for (const q of generateRound({ modeId: 'mon-to-dex', count: 30 })) {
    const pokemon = byId.get(idFromKey(q.questionKey));
    assert.equal(q.answer, pokemon.id);
    assert.equal(q.max, 1025);
    assert.ok(q.prompt.includes(pokemon.name));
  }
  const porygon2 = generateRound({ modeId: 'name-text', count: 1025 }).find((q) => q.answer === 'Porygon2');
  assert.deepEqual([...porygon2.lookAlikes].sort(), ['Porygon', 'Porygon-Z']);
});

test('generation filter is respected', () => {
  for (const modeId of ['name-text', 'name-choice', 'type', 'mon-to-dex', 'dex-to-mon', 'mon-to-region', 'region-to-mon']) {
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

test('every mode has a description, an example, and a question count for the info dialog', () => {
  for (const mode of listModes()) {
    assert.ok(mode.description?.length > 20, mode.id);
    assert.ok(mode.example?.length > 3, mode.id);
    assert.equal(mode.totalQuestions, getMode(mode.id).candidates(ALL_POKEMON).length, mode.id);
  }
});
