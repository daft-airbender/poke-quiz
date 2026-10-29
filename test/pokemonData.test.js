import { test } from 'node:test';
import assert from 'node:assert/strict';
import pokemon from '../data/pokemon.json' with { type: 'json' };
import { TYPES } from '../src/quiz/typeEffectiveness.js';

// Sanity checks on the generated data/pokemon.json.

test('ids are unique and ascending', () => {
  for (let i = 1; i < pokemon.length; i++) {
    assert.ok(pokemon[i].id > pokemon[i - 1].id, `id order broken at #${pokemon[i].id}`);
  }
});

test('every entry is well-formed', () => {
  for (const p of pokemon) {
    assert.ok(p.name, `#${p.id} has no name`);
    assert.ok(p.types.length === 1 || p.types.length === 2, `#${p.id} has ${p.types.length} types`);
    for (const type of p.types) assert.ok(TYPES.includes(type), `#${p.id} has unknown type ${type}`);
    assert.ok(Number.isInteger(p.generation) && p.generation >= 1, `#${p.id} has bad generation`);
    assert.match(p.sprite, /^https:\/\//, `#${p.id} has no sprite`);
  }
});

test('spot checks', () => {
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  assert.deepEqual(byId.get(1), {
    id: 1,
    name: 'Bulbasaur',
    types: ['grass', 'poison'],
    generation: 1,
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
  });
  assert.equal(byId.get(122).name, 'Mr. Mime');
  assert.deepEqual(byId.get(6).types, ['fire', 'flying']);
  assert.equal(byId.get(1025)?.generation, 9);
});
