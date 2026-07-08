/*
 * ui/app.js — the playable breeder controller, now sitting ON the foundation:
 *   • SEED CAPTURE   — every litter records the CONCRETE integer seed (the
 *     Math.random-mixed nextSeed() output), built into a descriptor. Never the
 *     date. This is the load-bearing replay fact.
 *   • PERSISTENCE    — kept setts + lineage edges + last-litter descriptor go to
 *     IndexedDB, so the collection AND the current litter survive a hard reload.
 *   • DEEP LINK      — a #g= fragment reconstructs the sharer's EXACT litter and
 *     lands the viewer ready to Breed-from on the first tap.
 *   • SHARE          — Keep/Share builds a #g= URL for the current litter.
 *
 * The USER is the fitness function. Rendering uses the real engine renderer.
 */
import { wildLitter, breedLitter, makePin } from '../engine/game.js';
import { wildDescriptor, bredDescriptor } from '../genome/serialize.js';
import { reconstructLitter } from '../genome/replay.js';
import { buildHash, consumeLocationHash } from '../genome/deeplink.js';
import { createStore } from '../store/persistence.js';
import { createKV } from '../store/kv.js';
import { renderInto } from './render.js';
import { renderSharePng } from './share-frame.js';
import { buildLoopSpec, exportLoop, renderLoopFrame } from './loop-export.js';
import { resolveBrowserMuxerFactory } from './loop-mux.js';
import { encodeLoopNative, isNativeLoopEncoderAvailable } from '../native/loop-encoder.js';
import { createBirthStage } from './birth-event.js';
import { dailyPrompt } from '../daily/prompt.js';
import { createStreak } from '../daily/streak.js';

const LITTER = 9;
const $ = (id) => document.getElementById(id);
const grid = $('grid'), tray = $('tray');

const store = createStore({ dbName: 'tartanism' });
const kv = createKV({ namespace: 'tartanism' });
const streak = createStreak(kv);

// ---- daily prompt (exogenous novelty clock) + streak counter -------------
async function renderDaily() {
  const bar = $('daily');
  if (!bar) return;
  const p = dailyPrompt();
  const el = $('dailyPrompt'); if (el) el.textContent = p.text;
  const c = $('streakCount'); if (c) c.textContent = String(await streak.current());
  bar.hidden = false;
}
// Engaging with today's prompt (Breed or Wild) counts once per calendar day.
async function markEngaged() {
  const n = await streak.record();
  const c = $('streakCount'); if (c) c.textContent = String(n);
}

// ---- deterministic session seed: date base + Math.random entropy, LCG step.
// The concrete integer nextSeed() returns is captured per litter (see descriptor
// construction in doWild/doBreed) — this is the ONLY thing that replays.
const today = new Date();
let seedCtr = (today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate()) * 1000
  + Math.floor(Math.random() * 1000);
const nextSeed = () => (seedCtr = (seedCtr * 1103515245 + 12345) >>> 0);

// ---- state ----
let litter = [];
let lastDescriptor = null;   // the captured descriptor for the on-screen litter
let gen = 0;
let wildness = 0.7;
let activePin = null;        // { gene, source } — the locked gene, or null
let pinnedId = null;         // id of the sett the pin was taken from (for the badge)
const selected = new Set();
const kept = [];
const byId = new Map();

// ---------------------------------------------------------------------------
// LITTER grid
// ---------------------------------------------------------------------------
function shortSeed(ind) { return 'seed ' + (ind.seed >>> 0).toString(36); }

function buildCell(ind) {
  const cell = document.createElement('div');
  cell.className = 'cell' + (selected.has(ind.id) ? ' sel' : '')
    + (pinnedId === ind.id ? ' pinned' : '');
  cell.dataset.id = ind.id;
  const canvas = document.createElement('canvas');
  cell.appendChild(canvas);

  const badge = document.createElement('div');
  badge.className = 'pinbadge';
  badge.textContent = '📌 ' + (activePin ? activePin.gene : '');
  cell.appendChild(badge);

  attachLongPress(cell, () => openPinMenu(ind));

  if (ind.parents && ind.parents.length) {
    const lin = document.createElement('div');
    lin.className = 'lin';
    lin.textContent = `gen ${ind.gen} · ${ind.parents.join('×')}`;
    cell.appendChild(lin);
  }
  const tick = document.createElement('div');
  tick.className = 'tick'; tick.textContent = '✓';
  cell.appendChild(tick);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const chip = document.createElement('div');
  chip.className = 'seedchip'; chip.textContent = shortSeed(ind);
  chip.addEventListener('click', (e) => { e.stopPropagation(); copySeed(ind); });
  const keep = document.createElement('div');
  keep.className = 'keep' + (kept.some((k) => k.id === ind.id) ? ' on' : '');
  keep.textContent = '♥';
  keep.addEventListener('click', (e) => { e.stopPropagation(); toggleKeep(ind, keep); });
  meta.appendChild(chip); meta.appendChild(keep);
  cell.appendChild(meta);

  cell.addEventListener('click', () => toggleSelect(ind, cell));
  requestAnimationFrame(() => {
    const r = cell.getBoundingClientRect();
    renderInto(canvas, ind, r.width, r.height);
  });
  return cell;
}

function renderLitter() {
  grid.innerHTML = '';
  for (const ind of litter) { byId.set(ind.id, ind); grid.appendChild(buildCell(ind)); }
  updateSelUI();
}

// ---------------------------------------------------------------------------
// BIRTH EVENT — one reusable sequence for BOTH Breed and Wild (and idle life).
// buildCell is wrapped so the stage registers each offspring in byId (so tap-
// select keeps working after a hatch).
// ---------------------------------------------------------------------------
const birthStage = createBirthStage({
  grid,
  buildCell: (ind) => { byId.set(ind.id, ind); return buildCell(ind); },
  onDone: () => updateSelUI(),
});

// ---------------------------------------------------------------------------
// SELECT / KEEP / actions
// ---------------------------------------------------------------------------
function toggleSelect(ind, cell) {
  if (selected.has(ind.id)) selected.delete(ind.id); else selected.add(ind.id);
  cell.classList.toggle('sel', selected.has(ind.id));
  [...tray.querySelectorAll('.t')].forEach((t) => t.classList.toggle('sel', selected.has(t.dataset.id)));
  updateSelUI();
}

function updateSelUI() {
  const n = selected.size;
  $('selcount').innerHTML = n === 0 ? 'Nothing selected'
    : `<b>${n}</b> parent${n > 1 ? 's' : ''} selected — breed to blend their genes`;
  $('breedBtn').disabled = n === 0;
  $('gen').textContent = gen === 0 ? 'Wild · Gen 0' : `Gen ${gen}`;
}

// ---------------------------------------------------------------------------
// TRAIT PINNING (T16) — tap-and-hold a sett to LOCK one gene (palette OR
// stripe-rhythm OR proportions). The pinned gene carries into every future
// litter (breed AND wild) while everything else keeps breeding wild.
// ---------------------------------------------------------------------------
function attachLongPress(el, onHold, ms = 450) {
  let timer = null, sx = 0, sy = 0;
  const start = (x, y) => {
    sx = x; sy = y;
    timer = setTimeout(() => { timer = null; el.dataset.suppressClick = '1'; onHold(); }, ms);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointerdown', (e) => start(e.clientX, e.clientY));
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel();
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  // swallow the click-to-select that a browser fires after a long-press hold
  el.addEventListener('click', (e) => {
    if (el.dataset.suppressClick === '1') { e.stopImmediatePropagation(); e.preventDefault(); el.dataset.suppressClick = '0'; }
  }, true);
}

const pinScrim = $('pinScrim');
let pinMenuTarget = null;
function openPinMenu(ind) {
  pinMenuTarget = ind;
  if (pinScrim) pinScrim.classList.add('on');
}
function closePinMenu() { pinMenuTarget = null; if (pinScrim) pinScrim.classList.remove('on'); }

function setPin(gene, ind) {
  activePin = makePin(gene, ind);
  pinnedId = ind.id;
  syncPinUI();
  renderLitter();          // repaint so the badge shows on the pinned sett
  toast(`Pinned ${gene} 📌`);
}
function clearPin() {
  activePin = null; pinnedId = null;
  syncPinUI();
  renderLitter();
  toast('Unpinned — full variation');
}
function syncPinUI() {
  const bar = $('pinstatus'); if (!bar) return;
  if (activePin) {
    bar.classList.add('on');
    const t = $('pinstatusText');
    if (t) t.textContent = `Pinned · ${activePin.gene}`;
  } else {
    bar.classList.remove('on');
  }
}

if (pinScrim) {
  pinScrim.querySelectorAll('.gene').forEach((btn) => {
    btn.addEventListener('click', () => { const g = btn.dataset.gene; const t = pinMenuTarget; closePinMenu(); if (t) setPin(g, t); });
  });
  const cancelBtn = $('pinCancel'); if (cancelBtn) cancelBtn.addEventListener('click', closePinMenu);
  pinScrim.addEventListener('click', (e) => { if (e.target === pinScrim) closePinMenu(); });
}
const pinClearBtn = $('pinClear'); if (pinClearBtn) pinClearBtn.addEventListener('click', clearPin);

// ---------------------------------------------------------------------------
// KEEP CEREMONY (T17) — heart-tap → pause + bloom + name field
// Reuses the T9 bloom (birth-event) to animate the sett's weave into a card,
// then asks for a name. Respects reduced-motion.
// ---------------------------------------------------------------------------
const keepScrim = $('keepCeremonyScrim');
const keepCanvas = $('keepBloomCanvas');
const keepStage = $('keepBloomStage');
const keepForm  = $('keepForm');
const keepInput = $('keepNameInput');

let keepTarget = null;
let keepTargetEl = null;

function openCeremony(ind, el) {
  keepTarget = ind;
  keepTargetEl = el;
  keepInput.value = ind.name || '';
  keepForm.hidden = true;
  keepScrim.classList.add('on');

  // render the sett's weave into the bloom canvas
  const sz = keepStage.clientWidth || 300;
  keepCanvas.width = sz * (window.devicePixelRatio || 1);
  keepCanvas.height = sz * (window.devicePixelRatio || 1);
  keepCanvas.style.width = sz + 'px';
  keepCanvas.style.height = sz + 'px';
  renderInto(keepCanvas, ind, sz, sz);

  // BLOOM animation — reusable T9 feel, scaled down to a single card reveal
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Restart the bloom animation by removing and re-adding the class
  keepStage.classList.remove('bloom-in');
  void keepStage.offsetWidth;

  if (reduced) {
    // instant reveal — no scale/brightness keyframe
    keepForm.hidden = false;
    keepInput.focus();
  } else {
    keepStage.classList.add('bloom-in');
    // after the bloom settles (~620ms), reveal the form
    setTimeout(() => {
      keepForm.hidden = false;
      keepInput.focus();
    }, 620);
  }
}

function closeCeremony() {
  keepScrim.classList.remove('on');
  keepTarget = null;
  keepTargetEl = null;
}

async function confirmKeep(nameOverride) {
  const ind = keepTarget, el = keepTargetEl;
  if (!ind) return;

  const name = (nameOverride !== undefined ? nameOverride : keepInput.value.trim()) || null;
  if (name) ind.name = name;

  kept.unshift(ind);
  if (el) el.classList.add('on');

  await store.saveKept(ind);
  if (ind.parents && ind.parents.length) await store.saveLineageEdge(ind.id, ind.parents);
  byId.set(ind.id, ind);

  closeCeremony();
  renderTray();
  toast(name ? `Kept "${name}" ♥` : 'Kept ♥');
}

// wire ceremony buttons
$('keepBtnSave').addEventListener('click', () => confirmKeep());
$('keepBtnSkip').addEventListener('click', () => confirmKeep(null));
$('keepBtnCancel').addEventListener('click', closeCeremony);
keepScrim.addEventListener('click', (e) => { if (e.target === keepScrim) closeCeremony(); });
keepInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmKeep(); });

async function toggleKeep(ind, el) {
  const i = kept.findIndex((k) => k.id === ind.id);
  if (i >= 0) {
    kept.splice(i, 1);
    await store.removeKept(ind.id);   // persist the removal or it resurrects on reload
    el && el.classList.remove('on');
    renderTray();
    toast('Removed from collection');
  } else {
    // OPEN the keep ceremony instead of silently saving
    openCeremony(ind, el);
  }
}

function renderTray() {
  $('trayCount').textContent = String(kept.length);
  if (kept.length === 0) { tray.innerHTML = '<div class="empty">Tap ♥ on a sett to keep it here.</div>'; return; }
  tray.innerHTML = '';
  for (const ind of kept) {
    const t = document.createElement('div');
    t.className = 't' + (selected.has(ind.id) ? ' sel' : '');
    t.dataset.id = ind.id;
    const c = document.createElement('canvas'); t.appendChild(c);
    if (ind.name) {
      const nm = document.createElement('div');
      nm.className = 'keep-name-chip';
      nm.textContent = ind.name;
      t.appendChild(nm);
    }
    t.addEventListener('click', () => {
      if (selected.has(ind.id)) selected.delete(ind.id); else selected.add(ind.id);
      byId.set(ind.id, ind);
      t.classList.toggle('sel', selected.has(ind.id));
      const cell = grid.querySelector(`.cell[data-id="${ind.id}"]`);
      if (cell) cell.classList.toggle('sel', selected.has(ind.id));
      updateSelUI();
    });
    tray.appendChild(t);
    requestAnimationFrame(() => { const r = t.getBoundingClientRect(); renderInto(c, ind, r.width, r.height); });
  }
}

async function persistLastLitter() {
  lastDescriptor.gen = gen;
  await store.saveLastLitter(lastDescriptor);
}

function doBreed() {
  const selIds = [...selected];
  const parents = selIds.map((id) => byId.get(id)).filter(Boolean);
  if (!parents.length) return;
  // the FIRST-tapped selection is the "top pick" — its strongest inheritor glows.
  const topParent = byId.get(selIds[0]) || parents[0];
  const parentCells = [...grid.querySelectorAll('.cell.sel')];
  window.scrollTo({ top: 0, behavior: 'smooth' });

  gen += 1;
  const seed = nextSeed();                         // CONCRETE captured seed
  litter = breedLitter(parents, { seed, size: LITTER, wildness, pin: activePin });
  lastDescriptor = bredDescriptor(parents.map((p) => p.threadcount), { seed, size: LITTER, wildness, pin: activePin });
  persistLastLitter();
  selected.clear();
  birthStage.play({ litter, topParent, parentCells });
  markEngaged();
  toast(parents.length === 1 ? 'Bred from 1 favorite' : `Bred from ${parents.length} favorites`);
}

function doWild() {
  // the whole board winds up on a wild reroll (no single top pick → nothing glows)
  const parentCells = [...grid.querySelectorAll('.cell')];
  window.scrollTo({ top: 0, behavior: 'smooth' });

  gen = 0;
  const seed = nextSeed();                          // CONCRETE captured seed
  litter = wildLitter({ seed, size: LITTER, pin: activePin });
  lastDescriptor = wildDescriptor(seed, LITTER, activePin);
  persistLastLitter();
  selected.clear();
  birthStage.play({ litter, topParent: null, parentCells });
  markEngaged();
  toast('Wild litter ⟳');
}

async function copySeed(ind) {
  const payload = `${ind.threadcount}  ·  seed ${(ind.seed >>> 0).toString(36)}`;
  try { await navigator.clipboard.writeText(payload); toast('Seed copied'); }
  catch { toast(payload); }
}

// Share the CURRENT litter as a deep link — reconstructs byte-identically on open.
async function doShare() {
  if (!lastDescriptor) return;
  const base = (typeof location !== 'undefined')
    ? location.origin + location.pathname
    : 'https://tartanism.app/b';
  const url = base + buildHash(lastDescriptor);
  try { await navigator.clipboard.writeText(url); toast('Share link copied'); }
  catch { toast('Link: ' + url); }
}

// ---------------------------------------------------------------------------
// SHARE CARD (T11) — the signature before/after artifact.
// Trace a result's WILD ANCESTOR up the in-session lineage (parents live in
// byId), then composite ancestor→result into a fixed-dimension PNG with the
// crown + always-on Tartanism watermark, and download it.
// ---------------------------------------------------------------------------
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function traceAncestor(result) {
  let cur = result, depth = 0;
  while (cur && cur.parents && cur.parents.length && depth < 64) {
    const p = byId.get(cur.parents[0]);
    if (!p || p === cur) break;
    cur = p; depth += 1;
  }
  return cur || result;
}

// pick the card's subject: last-kept > first selected > top of the litter.
function cardSubject() {
  if (kept.length) return kept[0];
  const sel = [...selected].map((id) => byId.get(id)).filter(Boolean);
  if (sel.length) return sel[0];
  return litter[0] || null;
}

async function exportCard() {
  const result = cardSubject();
  if (!result) { toast('Nothing to card yet'); return; }
  const ancestor = traceAncestor(result);
  const base = (typeof location !== 'undefined') ? location.origin + location.pathname : 'https://tartanism.app/b';
  const link = lastDescriptor ? base + buildHash(lastDescriptor) : base;
  const cardName = result.name || null;
  try {
    const { blob } = await renderSharePng(mkCanvas, { ancestor, result, gens: result.gen || 0, link, name: cardName });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tartanism-${(cardName || result.id || 'sett')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Share card saved ⬇');
  } catch (e) {
    toast('Card export failed');
  }
}

// ---- T13: looping MP4 export (WebCodecs H.264 primary → native AVAssetWriter fallback) ----
async function exportLoopMp4() {
  const result = cardSubject();
  if (!result) { toast('Nothing to loop yet'); return; }
  const base = (typeof location !== 'undefined') ? location.origin + location.pathname : 'https://tartanism.app/b';
  const link = lastDescriptor ? base + buildHash(lastDescriptor) : base;
  const spec = buildLoopSpec({ genome: result, link, name: result.name || null });

  // one offscreen 9:16 canvas drives the whole encode.
  const source = mkCanvas(spec.width, spec.height);
  toast('Encoding loop…');
  try {
    let muxerFactory;
    try {
      muxerFactory = await resolveBrowserMuxerFactory();
    } catch (e) {
      // WebCodecs may still be probed for the fallback decision even without a muxer.
      muxerFactory = null;
    }

    let mp4Bytes = null, filename = `tartanism-${(spec.name || result.id || 'loop')}.mp4`;

    if (muxerFactory) {
      const r = await exportLoop({
        spec,
        deps: { muxerFactory, getCanvas: () => source, mkCanvas },
      });
      if (r.ok) {
        mp4Bytes = r.buffer;
      } else if (r.fallback === 'native' && isNativeLoopEncoderAvailable()) {
        await nativeLoopExport(spec, source, filename); return;
      } else {
        toast(r.reason ? `Loop unavailable: ${r.reason}` : 'Loop export unavailable here');
        return;
      }
    } else if (isNativeLoopEncoderAvailable()) {
      await nativeLoopExport(spec, source, filename); return;
    } else {
      toast('Loop export needs the muxer bundle (add mp4-muxer)');
      return;
    }

    const blob = new Blob([mp4Bytes], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Looping MP4 saved ⬇');
  } catch (e) {
    toast('Loop export failed');
  }
}

// native (Capacitor AVAssetWriter) path — used when WKWebView lacks WebCodecs.
async function nativeLoopExport(spec, source, filename) {
  const ctx = source.getContext('2d');
  const pngB64 = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('toBlob null'));
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1]); // strip data: prefix
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }, 'image/png');
  });
  const r = await encodeLoopNative(spec, {
    canvas: source,
    renderFrame: (i) => renderLoopFrame(ctx, spec, i, undefined, mkCanvas),
    canvasToPngBase64: pngB64,
  });
  if (r.ok) toast('Looping MP4 saved to app ⬇');
  else toast(r.reason ? `Loop failed: ${r.reason}` : 'Loop export failed');
}

// ---- toast ----
let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// ---- wildness dial ----
function wildLabel(w) {
  const tag = w < 0.2 ? 'subtle' : w < 0.45 ? 'gentle' : w < 0.7 ? 'lively' : w < 0.9 ? 'hot' : 'chaos';
  return `${w.toFixed(2)} · ${tag}`;
}
const wildInput = $('wild');
function syncWild() {
  wildness = wildInput.value / 100;
  wildInput.style.setProperty('--fill', wildInput.value + '%');
  $('wildout').textContent = wildLabel(wildness);
}
wildInput.addEventListener('input', syncWild);

$('breedBtn').addEventListener('click', doBreed);
$('wildBtn').addEventListener('click', doWild);
const shareBtn = $('shareBtn');
if (shareBtn) shareBtn.addEventListener('click', doShare);
const cardBtn = $('cardBtn');
if (cardBtn) cardBtn.addEventListener('click', exportCard);
const loopBtn = $('loopBtn');
if (loopBtn) loopBtn.addEventListener('click', exportLoopMp4);

// re-render canvases on resize
let rsTimer;
window.addEventListener('resize', () => {
  clearTimeout(rsTimer);
  rsTimer = setTimeout(() => {
    grid.querySelectorAll('.cell').forEach((cell) => {
      const ind = byId.get(cell.dataset.id); const cv = cell.querySelector('canvas');
      if (ind && cv) { const r = cell.getBoundingClientRect(); renderInto(cv, ind, r.width, r.height); }
    });
  }, 180);
});

// ---------------------------------------------------------------------------
// BOOT: deep link > persisted last litter > fresh wild. Always rehydrate the
// kept collection so a hard reload restores the sett.
// ---------------------------------------------------------------------------
async function restoreCollection() {
  try {
    const col = await store.loadCollection();
    for (const ind of col) { kept.push(ind); byId.set(ind.id, ind); }
    renderTray();
  } catch { /* first run / no store */ }
}

async function boot() {
  syncWild();
  await renderDaily();
  await restoreCollection();

  // 1) shared deep link wins — reconstruct the sharer's EXACT litter
  const deep = consumeLocationHash({ clear: true });
  if (deep) {
    litter = deep.litter;
    lastDescriptor = deep.descriptor;
    gen = deep.descriptor.gen || (deep.descriptor.kind === 'bred' ? 1 : 0);
    await persistLastLitter();   // a shared litter survives a reload too
    renderLitter();
    toast('Opened a shared sett — tap ♥ or Breed');
    return;
  }

  // 2) restore the last on-screen litter from its persisted descriptor
  try {
    const last = await store.loadLastLitter();
    if (last) {
      litter = reconstructLitter(last);
      lastDescriptor = last;
      gen = last.gen || 0;
      renderLitter();
      return;
    }
  } catch { /* fall through */ }

  // 3) fresh wild
  doWild();
}

boot();
window.__breeder = {
  get litter() { return litter; }, get kept() { return kept; }, get descriptor() { return lastDescriptor; },
  get pin() { return activePin; }, exportCard, traceAncestor,
  // test/debug hooks for the pinning flow
  _setPin: (gene, ind) => setPin(gene, ind || litter[0]), _clearPin: clearPin, doWild, doBreed,
};
