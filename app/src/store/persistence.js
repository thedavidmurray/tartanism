/*
 * store/persistence.js — local-first structured store for the growing data:
 * the kept COLLECTION, the full LINEAGE graph, and the last-litter snapshot.
 *
 * Backend selection is automatic and the API is identical in both:
 *   • Browser / WKWebView  → IndexedDB (platform-native, zero native plugin).
 *   • Node / CI (no IDB)   → an in-process registry keyed by dbName. A NEW
 *                            store instance with the same dbName reads the same
 *                            data — which is exactly how "survives reload" is
 *                            simulated in the `node --test` harness.
 *
 * Ordering guarantees (test D / H depend on these):
 *   loadCollection() returns genomes in insertion order (dedup by id; a re-save
 *   updates in place, keeping position). loadLineage() returns edges in the
 *   order they were saved.
 *
 * All methods are async (Promise) — IndexedDB is async and the API must not
 * change shape between backends.
 */

const STORES = { KEPT: 'kept', LINEAGE: 'lineage', META: 'meta' };
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// In-memory backend (Node/CI + browsers without IndexedDB). The module-level
// registry is the "disk": it outlives individual store instances, so a fresh
// createStore({dbName}) is a genuine cold start against persisted data.
// ---------------------------------------------------------------------------
const _registry = new Map(); // dbName -> { keptOrder:[], kept:Map, lineage:[], meta:Map }

function memDb(dbName) {
  let db = _registry.get(dbName);
  if (!db) {
    db = { keptOrder: [], kept: new Map(), lineage: [], meta: new Map() };
    _registry.set(dbName, db);
  }
  return db;
}

function memBackend(dbName) {
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async putKept(id, value) {
      const db = memDb(dbName);
      if (!db.kept.has(id)) db.keptOrder.push(id);
      db.kept.set(id, clone(value));
    },
    async allKept() {
      const db = memDb(dbName);
      return db.keptOrder.map((id) => clone(db.kept.get(id)));
    },
    async deleteKept(id) {
      const db = memDb(dbName);
      db.kept.delete(id);
      const i = db.keptOrder.indexOf(id);
      if (i >= 0) db.keptOrder.splice(i, 1);
    },
    async appendLineage(edge) {
      memDb(dbName).lineage.push(clone(edge));
    },
    async allLineage() {
      return memDb(dbName).lineage.map(clone);
    },
    async putMeta(key, value) {
      memDb(dbName).meta.set(key, clone(value));
    },
    async getMeta(key) {
      return clone(memDb(dbName).meta.get(key));
    },
  };
}

// ---------------------------------------------------------------------------
// IndexedDB backend (browser / WKWebView). Insertion order is preserved via an
// explicit monotonic `_ord` on each record; edges use an autoIncrement key.
// ---------------------------------------------------------------------------
function idbOpen(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.KEPT)) db.createObjectStore(STORES.KEPT, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.LINEAGE)) db.createObjectStore(STORES.LINEAGE, { autoIncrement: true });
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbBackend(dbName) {
  const withStore = async (name, mode, fn) => {
    const db = await idbOpen(dbName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const store = tx.objectStore(name);
      let out;
      Promise.resolve(fn(store)).then((v) => { out = v; }).catch(reject);
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  };
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  return {
    async putKept(id, value) {
      await withStore(STORES.KEPT, 'readwrite', async (store) => {
        const existing = await reqP(store.get(id));
        const ord = existing && existing._ord !== undefined ? existing._ord : Date.now() * 1000 + (idbBackend._n = (idbBackend._n || 0) + 1);
        store.put({ id, _ord: ord, data: value });
      });
    },
    async allKept() {
      return withStore(STORES.KEPT, 'readonly', async (store) => {
        const recs = await reqP(store.getAll());
        recs.sort((a, b) => a._ord - b._ord);
        return recs.map((r) => r.data);
      });
    },
    async deleteKept(id) {
      await withStore(STORES.KEPT, 'readwrite', (store) => { store.delete(id); });
    },
    async appendLineage(edge) {
      await withStore(STORES.LINEAGE, 'readwrite', (store) => { store.add(edge); });
    },
    async allLineage() {
      return withStore(STORES.LINEAGE, 'readonly', (store) => reqP(store.getAll()));
    },
    async putMeta(key, value) {
      await withStore(STORES.META, 'readwrite', (store) => { store.put({ k: key, v: value }); });
    },
    async getMeta(key) {
      return withStore(STORES.META, 'readonly', async (store) => {
        const rec = await reqP(store.get(key));
        return rec ? rec.v : undefined;
      });
    },
  };
}

function pickBackend(dbName) {
  return (typeof indexedDB !== 'undefined') ? idbBackend(dbName) : memBackend(dbName);
}

// ---------------------------------------------------------------------------
// Public store — thin, intention-revealing methods over the chosen backend.
// ---------------------------------------------------------------------------
export function createStore({ dbName = 'tartanism', backend } = {}) {
  const be = backend || pickBackend(dbName);

  return {
    async saveKept(individual) {
      if (!individual || !individual.id) throw new Error('saveKept requires an individual with an id');
      await be.putKept(individual.id, individual);
      return individual.id;
    },
    async loadCollection() {
      return be.allKept();
    },
    async removeKept(id) {
      if (!id) throw new Error('removeKept requires an id');
      await be.deleteKept(id);
    },
    async saveLineageEdge(childId, parentIds) {
      await be.appendLineage({ childId, parentIds: (parentIds || []).slice() });
    },
    async loadLineage() {
      return be.allLineage();
    },
    async saveLastLitter(descriptor) {
      await be.putMeta('lastLitter', descriptor);
    },
    async loadLastLitter() {
      return be.getMeta('lastLitter');
    },
  };
}

export const _internal = { STORES, memBackend, _registry };
