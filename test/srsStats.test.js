import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityLevels, currentStreak, fillDays, lastDayPerWeek, tierCountsByDay, weekOf } from '../src/srs/stats.js';

test('weeks start on Monday', () => {
  assert.equal(weekOf('2026-11-02'), '2026-11-02'); // a Monday
  assert.equal(weekOf('2026-11-08'), '2026-11-02'); // Sunday
  assert.equal(weekOf('2026-11-09'), '2026-11-09');
  assert.equal(weekOf('2027-01-01'), '2026-12-28'); // across a year end
});

test('tier counts per day add up to the total, from a replay of tier changes', () => {
  const changes = [
    { day: '2026-11-01', cardId: 1, tierAfter: 'rotation' },
    { day: '2026-11-01', cardId: 2, tierAfter: 'rotation' },
    { day: '2026-11-03', cardId: 1, tierAfter: 'bank' },
    { day: '2026-11-03', cardId: 3, tierAfter: 'mastered' }, // marked mastered by hand, never answered
    { day: '2026-11-04', cardId: 1, tierAfter: 'rotation' }, // missed a check-in
    { day: '2026-11-04', cardId: 2, tierAfter: 'rotation' }, // an answer that changed nothing
  ];
  const rows = tierCountsByDay(changes, 10, '2026-10-31', '2026-11-04');
  assert.deepEqual(rows, [
    { day: '2026-10-31', unseen: 10, rotation: 0, bank: 0, mastered: 0 },
    { day: '2026-11-01', unseen: 8, rotation: 2, bank: 0, mastered: 0 },
    { day: '2026-11-02', unseen: 8, rotation: 2, bank: 0, mastered: 0 },
    { day: '2026-11-03', unseen: 7, rotation: 1, bank: 1, mastered: 1 },
    { day: '2026-11-04', unseen: 7, rotation: 2, bank: 0, mastered: 1 },
  ]);
  for (const row of rows) assert.equal(row.unseen + row.rotation + row.bank + row.mastered, 10);
});

test("streak: consecutive days ending today, or yesterday if I haven't played yet today", () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'];
  assert.equal(currentStreak(days, '2026-11-06').length, 2, 'played today');
  assert.equal(currentStreak(days, '2026-11-07').length, 2, 'not yet today: yesterday still counts');
  assert.deepEqual(currentStreak(days, '2026-11-07').days, ['2026-11-05', '2026-11-06']);
  assert.equal(currentStreak(days, '2026-11-08').length, 0, 'a day off resets it');
  assert.equal(currentStreak(days, '2026-11-04').length, 3);
  assert.equal(currentStreak([], '2026-11-04').length, 0);
});

test('activity shading: none, then four levels by my own range', () => {
  const level = activityLevels([0, 2, 5, 10, 40, 80, 0]);
  assert.equal(level(0), 0);
  assert.ok(level(2) >= 1 && level(2) <= 2);
  assert.equal(level(80), 4);
  assert.ok(level(5) <= level(10) && level(10) <= level(40));
  assert.equal(activityLevels([])(5), 0);
});

test('gaps are carried forward, and long ranges keep one point per week', () => {
  const rows = [
    { day: '2026-11-01', n: 1 },
    { day: '2026-11-04', n: 4 },
  ];
  assert.deepEqual(
    fillDays(rows, '2026-10-31', '2026-11-05').map((r) => `${r.day}:${r.n}`),
    ['2026-11-01:1', '2026-11-02:1', '2026-11-03:1', '2026-11-04:4', '2026-11-05:4'],
  );
  const daily = fillDays(rows, '2026-11-01', '2026-11-16');
  assert.deepEqual(lastDayPerWeek(daily).map((r) => r.day), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-16']);
});
