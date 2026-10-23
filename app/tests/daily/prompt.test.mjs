/*
 * T6 acceptance tests — daily/prompt.js
 *   • deterministic per date (same date → same prompt, offline, no network)
 *   • varies across dates (the exogenous novelty clock actually ticks)
 *   • every part is drawn from the curated pools (taste vocabulary, not junk)
 *   • Date object and "YYYY-MM-DD" string agree
 *   • unknown/edge inputs behave
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyPrompt, dateKey, POOLS } from '../../src/daily/prompt.js';

test('deterministic: same date → identical prompt, repeated calls', () => {
  const a = dailyPrompt('2026-07-04');
  const b = dailyPrompt('2026-07-04');
  assert.deepEqual(a, b);
  assert.equal(a.text, b.text);
});

test('deterministic: Date object and its YYYY-MM-DD string agree', () => {
  const key = '2026-07-04';
  // Build a local Date for that calendar day (noon avoids DST edges).
  const [y, m, d] = key.split('-').map(Number);
  const asDate = new Date(y, m - 1, d, 12, 0, 0);
  assert.equal(dateKey(asDate), key);
  assert.deepEqual(dailyPrompt(asDate), dailyPrompt(key));
});

test('varies across dates: not every day is the same prompt', () => {
  const texts = [];
  for (let d = 1; d <= 28; d++) {
    texts.push(dailyPrompt(`2026-02-${String(d).padStart(2, '0')}`).text);
  }
  const distinct = new Set(texts);
  // A month must produce real variety, not one frozen constraint.
  assert.ok(distinct.size >= 10, `expected >=10 distinct prompts in a month, got ${distinct.size}`);
});

test('parts are always drawn from the curated pools', () => {
  for (let i = 0; i < 200; i++) {
    // spread across many dates
    const date = new Date(2026, 0, 1 + i);
    const { parts, text } = dailyPrompt(date);
    assert.ok(POOLS.light.includes(parts.light), `light "${parts.light}" in pool`);
    assert.ok(POOLS.colors.includes(parts.colors), `colors "${parts.colors}" in pool`);
    assert.ok(POOLS.rhythm.includes(parts.rhythm), `rhythm "${parts.rhythm}" in pool`);
    assert.equal(text, `${parts.light} · ${parts.colors} · ${parts.rhythm}`);
  }
});

test('axes move independently (not all locked to one index)', () => {
  // If the three axes were perfectly correlated they would share a period;
  // sample a run of days and confirm each axis takes >1 value.
  const seen = { light: new Set(), colors: new Set(), rhythm: new Set() };
  for (let d = 0; d < 40; d++) {
    const { parts } = dailyPrompt(new Date(2026, 3, 1 + d));
    seen.light.add(parts.light);
    seen.colors.add(parts.colors);
    seen.rhythm.add(parts.rhythm);
  }
  assert.ok(seen.light.size > 1);
  assert.ok(seen.colors.size > 1);
  assert.ok(seen.rhythm.size > 1);
});

test('dateKey rejects malformed strings', () => {
  assert.throws(() => dateKey('2026/07/04'));
  assert.throws(() => dateKey('july 4'));
});
