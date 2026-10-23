/*
 * T17 — Keep-ceremony + naming persistence test.
 *
 * Acceptance:
 *  - A named sett survives a simulated cold-start reload (new store instance).
 *  - The name is preserved in the collection and round-trips correctly.
 *  - An unnamed sett is handled gracefully (null/undefined name).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter } from '../../src/engine/game.js';
import { createStore } from '../../src/store/persistence.js';

let dbn = 0;
const freshName = () => `tartan-keep-${Date.now()}-${dbn++}`;

test('T17: named sett survives reload (name persists in collection)', async () => {
  const dbName = freshName();
  const wild = wildLitter({ seed: 20260704, size: 9 });

  // Save a named sett
  const named = { ...wild[0], name: 'Caledonian Dawn' };
  const unnamed = { ...wild[3] };

  const s1 = createStore({ dbName });
  await s1.saveKept(named);
  await s1.saveKept(unnamed);

  // Cold start — new store instance, same db
  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();

  assert.equal(col.length, 2, 'both setts reloaded');
  assert.equal(col[0].name, 'Caledonian Dawn', 'named sett retains its name after reload');
  assert.equal(col[1].name, undefined, 'unnamed sett has no name');
  assert.equal(col[0].id, named.id);
  assert.equal(col[1].id, unnamed.id);
});

test('T17: empty name is treated gracefully', async () => {
  const dbName = freshName();
  const wild = wildLitter({ seed: 42, size: 9 });
  const ind = { ...wild[0], name: '' };

  const s1 = createStore({ dbName });
  await s1.saveKept(ind);

  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();
  assert.equal(col[0].name, '', 'empty string name round-trips');
});

test('T17: renamed sett preserves name (re-save with updated name)', async () => {
  const dbName = freshName();
  const wild = wildLitter({ seed: 77, size: 9 });
  const ind = { ...wild[0], name: 'First Name' };

  const s1 = createStore({ dbName });
  await s1.saveKept(ind);
  ind.name = 'Renamed';
  await s1.saveKept(ind); // re-save same id with new name

  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();
  assert.equal(col.length, 1, 'still one entry (re-save updates in place)');
  assert.equal(col[0].name, 'Renamed', 'name reflects latest save');
});
