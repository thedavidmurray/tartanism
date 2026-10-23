"""Exercise the real browser canvas -> WebCodecs -> MP4 muxer path and save a sample."""
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(__file__).resolve().parents[1] / 'export-probe.mp4'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://127.0.0.1:5179/', wait_until='load')
    result = page.evaluate('''async () => {
      const {wildLitter} = await import('/src/engine/game.js');
      const {buildLoopSpec, encodeLoopMp4, probeVideoEncoder, seamOffsets} = await import('/src/ui/loop-export.js');
      const {resolveBrowserMuxerFactory} = await import('/src/ui/loop-mux.js');
      const genome = wildLitter({seed:333, size:1})[0];
      const spec = buildLoopSpec({genome, link:'https://edgelesslab.com'});
      const probe = await probeVideoEncoder();
      if (!probe.supported || !probe.h264) throw Error('Headless browser lacks H.264 WebCodecs');
      // Keep the same frame compositor, muxer, H.264 codec and closed motion
      // cycle, but use a small asset so CI machines can run the probe quickly.
      spec.width = 320; spec.height = 568; spec.totalFrames = 24;
      spec.cfg.totalFrames = 24; spec.fps = 12; spec.bitrate = 1000000;
      if (!seamOffsets(spec.cfg).seamless) throw Error('Seam regression');
      const canvas = document.createElement('canvas'); canvas.width = spec.width; canvas.height = spec.height;
      const muxerFactory = await resolveBrowserMuxerFactory();
      const result = await encodeLoopMp4(spec, {probe, muxerFactory, getCanvas:()=>canvas,
        mkCanvas:(w,h)=>{const c=document.createElement('canvas'); c.width=w; c.height=h; return c;}});
      if (!result.ok) throw Error(JSON.stringify(result));
      return {codec:result.codec, frames:result.framesEncoded, bytes:Array.from(result.buffer)};
    }''')
    browser.close()
out.write_bytes(bytes(result['bytes']))
print(f"{out}: codec={result['codec']} frames={result['frames']} bytes={out.stat().st_size}")
