import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, matchName, normalizeName } from '../shared/nameMatch.js';
import { lookAlikesOf } from '../src/quiz/lookAlikes.js';
import { ALL_POKEMON } from '../src/quiz/pokemon.js';

const match = (typed, answer) => matchName(typed, answer, lookAlikesOf(answer));

test('case, accents, spaces and punctuation are ignored', () => {
  for (const [typed, answer] of [
    ['pikachu', 'Pikachu'],
    ['  PIKACHU ', 'Pikachu'],
    ['farfetchd', 'Farfetch’d'],
    ["farfetch'd", 'Farfetch’d'],
    ['mr mime', 'Mr. Mime'],
    ['mrmime', 'Mr. Mime'],
    ['flabebe', 'Flabébé'],
    ['type null', 'Type: Null'],
    ['hooh', 'Ho-Oh'],
    ['porygon z', 'Porygon-Z'],
    ['nidoran f', 'Nidoran♀'],
    ['Nidoran♂', 'Nidoran♂'],
    ['kommo o', 'Kommo-o'],
  ]) {
    assert.equal(match(typed, answer), 'correct', `${typed} -> ${answer}`);
  }
});

test('close misspellings are "close": 1 edit for short names, 2 for longer', () => {
  for (const [typed, answer] of [
    ['charizrd', 'Charizard'], // missing letter
    ['charrizard', 'Charizard'], // extra letter
    ['chairzard', 'Charizard'], // swapped letters
    ['charozerd', 'Charizard'], // two wrong letters
    ['pikchu', 'Pikachu'],
    ['mww', 'Mew'],
    ['onixx', 'Onix'],
  ]) {
    assert.equal(match(typed, answer), 'close', `${typed} -> ${answer}`);
  }
});

test('far-off answers are wrong', () => {
  for (const [typed, answer] of [
    ['bulbasaur', 'Charizard'],
    ['chrzrd', 'Charizard'], // 3 edits
    ['mwe2', 'Mew'], // 2 edits on a short name
    ['', 'Pikachu'],
  ]) {
    assert.equal(match(typed, answer), 'wrong', `${typed} -> ${answer}`);
  }
});

test("another Pokémon's name is wrong, never a typo", () => {
  assert.equal(match('Porygon-Z', 'Porygon2'), 'wrong');
  assert.equal(match('Porygon', 'Porygon2'), 'wrong');
  assert.equal(match('Mr. Rime', 'Mr. Mime'), 'wrong');
  assert.equal(match('Nidoran♂', 'Nidoran♀'), 'wrong');
  assert.equal(match('Mew', 'Mewtwo'), 'wrong');
  // A typo of the right name that isn't itself a Pokémon is still close.
  assert.equal(match('Porygn2', 'Porygon2'), 'close');
});

test('every Pokémon name normalizes to something unique', () => {
  const keys = ALL_POKEMON.map((p) => normalizeName(p.name));
  assert.ok(keys.every((key) => /^[a-z0-9]+$/.test(key)));
  assert.equal(new Set(keys).size, keys.length);
});

test('editDistance counts a swap as one edit', () => {
  assert.equal(editDistance('ab', 'ba'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
});

test('Nidoran♀ / Nidoran♂ can be typed without the symbols', () => {
  for (const typed of ['Nidoran f', 'nidoranf', 'Nidoran female', 'nidoran (F)', 'Nidoran-Female', 'Nidoran♀']) {
    assert.equal(match(typed, 'Nidoran♀'), 'correct', typed);
  }
  for (const typed of ['Nidoran m', 'Nidoran male', 'nidoran (M)', 'Nidoran♂']) {
    assert.equal(match(typed, 'Nidoran♂'), 'correct', typed);
  }
});

test('Nidoran without a readable gender gets a retry; the other Nidoran is a real mix-up', () => {
  for (const typed of ['Nidoran', 'nidoran girl', 'Nidoran fem']) assert.equal(match(typed, 'Nidoran♀'), 'close', typed);
  for (const typed of ['Nidoran m', 'Nidoran male', 'Nidorina']) assert.equal(match(typed, 'Nidoran♀'), 'wrong', typed);
  assert.equal(match('Nidoran female', 'Nidoran♂'), 'wrong');
  // Other names are unaffected: "male"/"female" only mean ♂/♀ for these two.
  assert.equal(match('Pikachu female', 'Pikachu'), 'wrong');
});
