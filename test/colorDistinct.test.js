import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distinctColors } from '../scripts/colorDistinct.js';

test('distinct means different hues, or a color against a clearly different neutral', () => {
  const distinct = [
    ['#e03030', '#f08a24', 'red / orange'],
    ['#e03030', '#f39ab5', 'red / pink'],
    ['#315a7b', '#f6e5bf', 'teal / cream'],
    ['#f6e756', '#a65000', 'yellow / brown'],
    ['#6a319c', '#e0d7e7', 'purple / lavender'],
    ['#f8f8f8', '#303030', 'white / black'],
  ];
  const alike = [
    ['#e03030', '#8a1c1c', 'red / dark red'],
    ['#8ec8d0', '#5a9ca4', 'two blues'],
    ['#f6e756', '#f6e5bf', 'yellow / cream'],
    ['#f8f8f8', '#b0b0b0', 'white / gray'],
  ];
  for (const [a, b, label] of distinct) assert.equal(distinctColors(a, b), true, label);
  for (const [a, b, label] of alike) assert.equal(distinctColors(a, b), false, label);
});
