/*
 * FOUNDATION acceptance tests — store/persistence.js + store/kv.js
 *   D. PERSISTENCE SURVIVES RELOAD — saveKept + lineage → new (cold) store
 *      instance → loadCollection returns identical genomes and lineage order.
 *   H. LINEAGE INTEGRITY — each child's parents resolve to stored genomes; a
 *      deep gen-0→N chain reconstructs fully from the store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildLitter, breedLitter, individualFromThreadcount } from '../../src/engine/game.js';
import { createStore } from '../../src/store/persistence.js';
import { createKV } from '../../src/store/kv.js';

let dbn = 0;
const freshName = () => `tartan-test-${Date.now()}-${dbn++}`;

test('D. persistence survives a simulated reload (new store instance, same db)', async () => {
  const dbName = freshName();
  const wild = wildLitter({ seed: 20260703, size: 9 });
  const keep = [wild[0], wild[3], wild[6]];

  const s1 = createStore({ dbName });
  for (const ind of keep) await s1.saveKept(ind);
  await s1.saveLineageEdge(keep[1].id, [keep[0].id]);
  await s1.saveLineageEdge(keep[2].id, [keep[0].id, keep[1].id]);
  await s1.saveLastLitter({ v: 1, kind: 'wild', seed: 20260703, size: 9 });

  // COLD START: brand-new store object pointed at the same db
  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();
  assert.equal(col.length, 3);
  // identical genomes, in insertion order
  assert.deepEqual(col.map((g) => g.threadcount), keep.map((g) => g.threadcount));
  assert.deepEqual(col.map((g) => g.id), keep.map((g) => g.id));
  assert.deepEqual(col[0], keep[0]);

  const lin = await s2.loadLineage();
  assert.deepEqual(lin, [
    { childId: keep[1].id, parentIds: [keep[0].id] },
    { childId: keep[2].id, parentIds: [keep[0].id, keep[1].id] },
  ]);

  assert.deepEqual(await s2.loadLastLitter(), { v: 1, kind: 'wild', seed: 20260703, size: 9 });
});

test('D(kv). small KV (streak/settings/pro) survives reload', async () => {
  const ns = freshName();
  const kv1 = createKV({ namespace: ns });
  await kv1.set('streak', 5);
  await kv1.set('pro', true);
  await kv1.set('settings', { reducedMotion: false });

  const kv2 = createKV({ namespace: ns });
  assert.equal(await kv2.get('streak'), 5);
  assert.equal(await kv2.get('pro'), true);
  assert.deepEqual(await kv2.get('settings'), { reducedMotion: false });
  assert.equal(await kv2.get('missing', 'default'), 'default');
});

test('D. un-keeping persists — removeKept survives a cold start (reverse-classical: fails pre-fix)', async () => {
  const dbName = freshName();
  const wild = wildLitter({ seed: 20260704, size: 9 });
  const keep = [wild[0], wild[3], wild[6]];

  const s1 = createStore({ dbName });
  for (const ind of keep) await s1.saveKept(ind);
  await s1.removeKept(keep[1].id);

  // still-open store sees the removal…
  const warm = await s1.loadCollection();
  assert.deepEqual(warm.map((g) => g.id), [keep[0].id, keep[2].id]);

  // …and so does a COLD START (this is what toggleKeep's "Removed" toast promises)
  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();
  assert.deepEqual(col.map((g) => g.id), [keep[0].id, keep[2].id],
    'a removed sett must not resurrect on reload');

  // removing an unknown id is a harmless no-op
  await s2.removeKept('s-not-there');
  assert.equal((await s2.loadCollection()).length, 2);
});

test('H. lineage integrity — every child parent resolves to a stored genome', async () => {
  const dbName = freshName();
  const store = createStore({ dbName });

  const p1 = individualFromThreadcount('SA/40 GD8 SA18 CR12 GD4 CR18 SA/40');
  const p2 = individualFromThreadcount('EM/16 IN4 EM6 IN6 GD2 EM4 IN/16');
  const child = breedLitter([p1, p2], { seed: 42, size: 1, wildness: 0.5 })[0];

  for (const ind of [p1, p2, child]) await store.saveKept(ind);
  await store.saveLineageEdge(child.id, child.parents);

  const col = await store.loadCollection();
  const byId = new Map(col.map((g) => [g.id, g]));
  const lin = await store.loadLineage();
  for (const edge of lin) {
    for (const pid of edge.parentIds) {
      assert.ok(byId.has(pid), `parent ${pid} must resolve to a stored genome`);
    }
  }
});

test('H. deep lineage chain (gen 0 → N) reconstructs fully from the store', async () => {
  const dbName = freshName();
  const store = createStore({ dbName });

  // walk a real gen-0 -> gen-N chain, keeping the top inheritor each step
  let current = wildLitter({ seed: 13, size: 9 })[0];
  await store.saveKept(current);
  const chain = [current.id];
  const N = 5;
  for (let g = 1; g <= N; g++) {
    const child = breedLitter([current], { seed: 100 + g, size: 1, wildness: 0.5 })[0];
    await store.saveKept(child);
    await store.saveLineageEdge(child.id, child.parents);
    chain.push(child.id);
    current = child;
  }

  // cold start, then walk the chain backwards via lineage edges
  const s2 = createStore({ dbName });
  const col = await s2.loadCollection();
  const byId = new Map(col.map((g) => [g.id, g]));
  const edges = await s2.loadLineage();
  const parentOf = new Map(edges.map((e) => [e.childId, e.parentIds]));

  assert.equal(col.length, N + 1, 'all generations persisted');
  let node = chain[chain.length - 1];
  let depth = 0;
  while (parentOf.has(node)) {
    for (const pid of parentOf.get(node)) assert.ok(byId.has(pid), `gen parent ${pid} resolves`);
    node = parentOf.get(node)[0];
    depth++;
  }
  assert.equal(depth, N, 'chain reconstructs to gen 0');
  assert.equal(node, chain[0], 'terminates at the gen-0 ancestor');
});
