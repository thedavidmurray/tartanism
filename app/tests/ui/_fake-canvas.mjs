/*
 * tests/ui/_fake-canvas.mjs — a DOM-free canvas harness for node:test.
 *
 * Node has no <canvas>. This factory returns canvas objects with a no-op 2D
 * context (records nothing it can't) and a toBlob that emits a REAL, valid PNG
 * of the canvas's exact width/height (solid fill) via node:zlib — so the
 * "valid PNG + fixed dimensions" acceptance is asserted at the byte level, the
 * same contract a browser canvas.toBlob('image/png') satisfies.
 */
import zlib from 'node:zlib';

// ---- CRC32 (PNG chunk checksums) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// build a valid RGB PNG of w×h, solid mid-grey.
export function encodePng(w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type 2 = truecolor RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw scanlines: each row = filter byte 0 + w*3 bytes
  const raw = Buffer.alloc(h * (1 + w * 3), 0x40);
  for (let y = 0; y < h; y++) raw[y * (1 + w * 3)] = 0; // filter=none per row
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// parse the PNG header → { valid, width, height } (used by tests).
export function parsePng(bytes) {
  const b = Buffer.from(bytes);
  const sigOk = b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ihdrType = b.slice(12, 16).toString('ascii');
  return {
    valid: sigOk && ihdrType === 'IHDR',
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
  };
}

// a no-op 2D context that accepts every call/assignment the compositor makes.
function makeCtx() {
  const noop = () => {};
  const target = {
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    roundRect: noop, fill: noop, stroke: noop, clip: noop, save: noop, restore: noop,
    translate: noop, scale: noop, rotate: noop, drawImage: noop, setTransform: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: () => true, // absorb fillStyle / font / lineWidth / etc.
  });
}

export function makeFakeCanvasFactory() {
  return function mkCanvas(w = 0, h = 0) {
    const ctx = makeCtx();
    return {
      width: w,
      height: h,
      getContext() { return ctx; },
      toBlob(cb, type = 'image/png') {
        const png = encodePng(this.width, this.height);
        const blob = new Blob([png], { type });
        cb(blob);
      },
    };
  };
}
