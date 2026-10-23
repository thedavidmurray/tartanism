/* Bundle the muxer into the actual app, not an opaque browser import. */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export async function resolveBrowserMuxerFactory() {
  return mp4MuxerFactory(Muxer, ArrayBufferTarget);
}

function mp4MuxerFactory(Muxer, ArrayBufferTarget) {
  return ({ width, height, mux }) => {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: mux, width, height },
      fastStart: 'in-memory',           // moov up front → streamable / social-import friendly
    });
    return {
      addVideoChunk: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      finalize: () => { muxer.finalize(); return new Uint8Array(target.buffer); },
    };
  };
}
