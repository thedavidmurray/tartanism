/*
 * WILD-IS-FREE test (T15).
 * The wild reroll is the panel's loudest signal: it must be FREE and unmetered
 * forever — no currency, no cooldown counter, no depletion, no cost gate of any
 * kind. This test is a REGRESSION FENCE: it fails the moment anyone bolts an
 * economy onto the reroll.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../../src/engine/game.js';
import { wildLitter, randomIndividual } from '../../src/engine/game.js';

test('wildLitter takes only {seed,size,pin} — no cost/currency/cooldown params', () => {
  // arity is (options) — one object arg. No balance ledger threaded in.
  assert.equal(wildLitter.length, 0, 'wildLitter must accept a single options object, no cost args');
  // exercising it with ONLY seed+size succeeds (no required currency field)
  const l = wildLitter({ seed: 1, size: 9 });
  assert.equal(l.length, 9);
});

test('the reroll never depletes: 500 consecutive wilds all return a full litter', () => {
  for (let i = 0; i < 500; i++) {
    const l = wildLitter({ seed: 1000 + i, size: 9 });
    assert.equal(l.length, 9, `reroll #${i} returned a short/blocked litter — a gate crept in`);
    // and nothing is ever an error/locked sentinel
    for (const ind of l) assert.ok(ind && ind.threadcount, `reroll #${i} yielded a non-sett (gated?)`);
  }
});

test('no cost/economy surface leaks from the engine module', () => {
  const banned = /cost|price|coin|credit|token|currency|balance|wallet|gem|energy|stamina|cooldown|paywall|purchase|premium|iap/i;
  for (const name of Object.keys(game)) {
    assert.ok(!banned.test(name),
      `engine exports "${name}" — smells like an economy bolted onto the free reroll`);
  }
});

test('a wild individual carries no cost/lock fields on its genome', () => {
  const ind = randomIndividual(42);
  const banned = ['cost', 'price', 'locked', 'gated', 'currency', 'credits', 'energy', 'cooldown'];
  for (const k of banned) {
    assert.ok(!(k in ind), `wild genome exposes "${k}" — the reroll must stay unmetered`);
  }
});
