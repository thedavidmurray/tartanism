/*
 * T11 — Share-frame compositor + PNG export.
 *
 * Acceptance:
 *  - the composited PNG is VALID + FIXED DIMENSIONS (1080×1350).
 *  - the before/after uses REAL ancestor + result genomes (not a swatch grid).
 *  - the watermark (free-growth end-card) is present.
 *  - deterministic given the same genomes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShareSpec, composeShareFrame, exportSharePng, renderSharePng,
  SHARE_W, SHARE_H,
} from '../../src/ui/share-frame.js';
import { individualFromThreadcount, breedLitter } from '../../src/engine/game.js';
import { makeFakeCanvasFactory, parsePng } from './_fake-canvas.mjs';

// a real ancestor→result lineage from the engine (deterministic).
function lineage() {
  const ancestor = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
  const p2 = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 2);
  const litter = breedLitter([ancestor, p2], { seed: 4242, size: 9, wildness: 0.5 });
  return { ancestor, result: litter[0] };
}

test('spec: before/after carries the REAL ancestor + result genomes', () => {
  const { ancestor, result } = lineage();
  const spec = buildShareSpec({ ancestor, result, gens: 3 });
  assert.equal(spec.before.genome.threadcount, ancestor.threadcount, 'before = ancestor genome');
  assert.equal(spec.after.genome.threadcount, result.threadcount, 'after = result genome');
  assert.notEqual(spec.before.genome.threadcount, spec.after.genome.threadcount, 'not the same sett twice');
  assert.equal(spec.after.crown, true, 'the result wears the crown');
  assert.equal(spec.before.crown, false);
  assert.equal(spec.gens, 3);
  assert.match(spec.title, /bred in 3 gens/);
});

test('spec: watermark (free-growth end-card) is always present + tappable', () => {
  const { ancestor, result } = lineage();
  const link = 'https://tartanism.app/b#g=ABC123';
  const spec = buildShareSpec({ ancestor, result, link });
  assert.equal(spec.watermark.present, true);
  assert.equal(spec.watermark.wordmark, 'Tartanism');
  assert.equal(spec.watermark.tappable, true);
  assert.equal(spec.watermark.link, link, 'end-card carries the breedable App-Clip link');
});

test('spec: fixed aspect / dimensions', () => {
  const { ancestor, result } = lineage();
  const spec = buildShareSpec({ ancestor, result });
  assert.equal(spec.width, SHARE_W);
  assert.equal(spec.height, SHARE_H);
  assert.equal(SHARE_W, 1080);
  assert.equal(SHARE_H, 1350);
});

test('spec: deterministic given the same genomes', () => {
  const a = buildShareSpec(lineage2());
  const b = buildShareSpec(lineage2());
  assert.deepEqual(a, b, 'same genomes → identical spec');
  function lineage2() {
    const ancestor = individualFromThreadcount('FO/20 EM8 SG6 EM8 FO/20', 1);
    const p2 = individualFromThreadcount('SA/22 CB8 TQ6 CB8 SA/22', 2);
    const result = breedLitter([ancestor, p2], { seed: 99, size: 9, wildness: 0.4 })[0];
    return { ancestor, result, gens: 2 };
  }
});

test('spec: gens=0 degrades to a wild-sett card without throwing', () => {
  const { ancestor } = lineage();
  const spec = buildShareSpec({ ancestor, result: ancestor, gens: 0 });
  assert.equal(spec.gens, 0);
  assert.equal(spec.after.label, 'WILD · GEN 0');
  assert.match(spec.title, /wild sett/);
});

test('spec: missing genome throws (guards the wiring)', () => {
  assert.throws(() => buildShareSpec({ result: lineage().result }), /ancestor genome required/);
  assert.throws(() => buildShareSpec({ ancestor: lineage().ancestor }), /result genome required/);
});

test('compositor: produces a fixed-dimension canvas from real genomes', () => {
  const mk = makeFakeCanvasFactory();
  const { ancestor, result } = lineage();
  const spec = buildShareSpec({ ancestor, result, gens: 3 });
  const canvas = composeShareFrame(mk, spec);
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1350);
  assert.equal(canvas.__shareSpec, spec, 'spec is carried on the canvas');
});

test('export: canvas.toBlob yields a VALID PNG at FIXED dimensions', async () => {
  const mk = makeFakeCanvasFactory();
  const { ancestor, result } = lineage();
  const { blob } = await renderSharePng(mk, { ancestor, result, gens: 4 });
  assert.equal(blob.type, 'image/png');
  assert.ok(blob.size > 0, 'blob has bytes');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const png = parsePng(bytes);
  assert.equal(png.valid, true, 'PNG magic + IHDR present');
  assert.equal(png.width, 1080, 'PNG width == fixed share width');
  assert.equal(png.height, 1350, 'PNG height == fixed share height');
});

test('export: rejects when toBlob is unavailable', async () => {
  await assert.rejects(exportSharePng({}), /toBlob unavailable/);
});

// T17 — name on the share card
test('spec: name is carried into the spec when provided', () => {
  const { ancestor, result } = lineage();
  const spec = buildShareSpec({ ancestor, result, gens: 2, name: 'The Robertson' });
  assert.equal(spec.name, 'The Robertson');
});

test('spec: name from result.name is read when no explicit name param', () => {
  const { ancestor, result } = lineage();
  result.name = 'Highland Dusk';
  const spec = buildShareSpec({ ancestor, result, gens: 1 });
  assert.equal(spec.name, 'Highland Dusk');
});

test('spec: name is null when none provided and result has no name', () => {
  const { ancestor, result } = lineage();
  delete result.name;
  const spec = buildShareSpec({ ancestor, result });
  assert.equal(spec.name, null);
});

test('compositor: named spec still produces fixed-dimensions', () => {
  const mk = makeFakeCanvasFactory();
  const { ancestor, result } = lineage();
  const spec = buildShareSpec({ ancestor, result, gens: 3, name: 'MacTartan' });
  const canvas = composeShareFrame(mk, spec);
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1350);
  assert.equal(canvas.__shareSpec.name, 'MacTartan');
});

test('export: named sett exports a valid PNG with name in spec', async () => {
  const mk = makeFakeCanvasFactory();
  const { ancestor, result } = lineage();
  result.name = 'Glen Affric';
  const { blob } = await renderSharePng(mk, { ancestor, result, gens: 3 });
  assert.ok(blob.size > 0);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const png = parsePng(bytes);
  assert.equal(png.valid, true);
  assert.equal(png.width, 1080);
  assert.equal(png.height, 1350);
});
