/*
 * ui/birth-event.js — the DOM side of the BIRTH EVENT. Consumes the pure plan
 * from engine/birth-sequence.js and the synthesized SFX from audio/sfx.js and
 * turns them into felt game-feel:
 *
 *   • CHARGE  — the selected parents lift/scale + a rising hum.
 *   • IMPACT  — a hard hit-pause: white flash + screenshake + bass thunk, then a
 *               hard cut to the new (hidden) litter.
 *   • HATCH   — each offspring pops in staggered with a scale-overshoot spring +
 *               a small particle puff; the top-inheritor child GLOWS.
 *   • idle life — the weave breathes continuously and ripples under touch.
 *
 * prefers-reduced-motion → instant reveal + a single soft confirmation tone. No
 * hit-pause, no shake, no particles, no long timers.
 *
 * ONE reusable stage: BREED and WILD both call stage.play(). Restraint over
 * spectacle — the juice is in timing and weight, not confetti.
 */
import { buildBirth, createBirthDriver, topInheritorIndex, DUR } from '../engine/birth-sequence.js';
import { createSfx } from '../audio/sfx.js';

const ACCENT = 'rgba(232,255,89,';   // the app's --accent (electric lime)
const WHITE = 'rgba(255,255,255,';

// ---------------------------------------------------------------------------
// STYLE — injected once so the module is self-contained (additive to index.html).
// ---------------------------------------------------------------------------
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const css = `
  /* CHARGE: parents wind up — lift, scale, glow */
  .cell.charging {
    transform: translateY(-7px) scale(1.055);
    box-shadow: 0 14px 44px rgba(232,255,89,.22), 0 0 0 1px rgba(232,255,89,.5);
    z-index: 6;
    transition: transform ${DUR.charge}ms cubic-bezier(.22,.7,.2,1), box-shadow ${DUR.charge}ms ease;
  }
  /* HATCH: start collapsed, spring in past 1.0 then settle (scale-overshoot) */
  .cell.hatch-pending { opacity: 0; transform: scale(.24); }
  .cell.hatch-in {
    opacity: 1; transform: scale(1);
    transition: transform .34s cubic-bezier(.2,1.55,.32,1), opacity .16s ease-out;
  }
  /* the child that inherits most from the top pick — a steady, tasteful glow */
  .cell.glow { animation: tb-glow 1.9s ease-in-out infinite alternate; }
  @keyframes tb-glow {
    from { box-shadow: 0 0 0 2px var(--accent), 0 0 20px 3px rgba(232,255,89,.38); }
    to   { box-shadow: 0 0 0 2px var(--accent), 0 0 40px 10px rgba(232,255,89,.68); }
  }
  /* IMPACT: one screenshake, short and weighty */
  .grid.tb-shake { animation: tb-shake .15s ease-in-out both; }
  @keyframes tb-shake {
    0%{transform:translate(0,0)} 18%{transform:translate(-5px,2px)} 38%{transform:translate(5px,-2px)}
    58%{transform:translate(-3px,-2px)} 78%{transform:translate(3px,1px)} 100%{transform:translate(0,0)}
  }
  .tb-flash { position: fixed; inset: 0; background:#fff; opacity:0; pointer-events:none; z-index:14; }
  .tb-flash.on { animation: tb-flash .18s ease-out both; }
  @keyframes tb-flash { 0%{opacity:0} 14%{opacity:.4} 100%{opacity:0} }
  .tb-particles { position: fixed; inset: 0; pointer-events: none; z-index: 15; }
  /* idle life: a slow ambient breathe on the woven canvas, + a touch ripple */
  @media (prefers-reduced-motion: no-preference) {
    .cell canvas { animation: tb-breathe 5.5s ease-in-out infinite alternate; will-change: transform; }
    .cell canvas.tb-ripple { animation: tb-ripple .55s ease-out; }
  }
  @keyframes tb-breathe { from{transform:scale(1)} to{transform:scale(1.009)} }
  @keyframes tb-ripple { 0%{transform:scale(1)} 42%{transform:scale(1.055)} 100%{transform:scale(1)} }
  `;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// Particle layer — a single cheap fixed canvas. Puffs are short-lived additive
// dots; the rAF loop only runs while particles are alive.
// ---------------------------------------------------------------------------
function createParticleLayer() {
  if (typeof document === 'undefined') return { puff() {}, dispose() {} };
  const canvas = document.createElement('canvas');
  canvas.className = 'tb-particles';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let parts = [];
  let raf = null;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener('resize', size);

  let last = 0;
  function frame(t) {
    const dt = last ? Math.min(48, t - last) : 16; last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.life -= dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += 0.06 * dt; // slight gravity settle
      const a = Math.max(0, p.life / p.max);
      ctx.beginPath();
      ctx.fillStyle = p.color + (a * 0.9).toFixed(3) + ')';
      ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    if (parts.length) { raf = requestAnimationFrame(frame); }
    else { raf = null; last = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function puff(cell, isGlow) {
    if (!cell || !cell.getBoundingClientRect) return;
    const r = cell.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const n = isGlow ? 16 : 10;
    const color = isGlow ? ACCENT : WHITE;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 6 + Math.random() * (isGlow ? 12 : 8);
      const max = 340 + Math.random() * 260;
      parts.push({
        x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
        r: 1.4 + Math.random() * (isGlow ? 2.4 : 1.6), life: max, max, color,
      });
    }
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  return { puff, dispose() { removeEventListener('resize', size); if (raf) cancelAnimationFrame(raf); canvas.remove(); } };
}

function createFlash() {
  if (typeof document === 'undefined') return { fire() {} };
  const el = document.createElement('div');
  el.className = 'tb-flash';
  document.body.appendChild(el);
  return {
    fire() {
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 220);
    },
  };
}

function defaultReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// touch ripple on the weave — delegated pointerdown, cheap, self-clearing.
function installIdleLife(grid, sfx) {
  if (!grid || typeof grid.addEventListener !== 'function') return;
  let unlocked = false;
  grid.addEventListener('pointerdown', (e) => {
    if (!unlocked) { unlocked = true; sfx && sfx.resume(); }
    const cell = e.target && e.target.closest ? e.target.closest('.cell') : null;
    const cv = cell && cell.querySelector('canvas');
    if (!cv) return;
    cv.classList.remove('tb-ripple'); void cv.offsetWidth; cv.classList.add('tb-ripple');
    cv.addEventListener('animationend', () => cv.classList.remove('tb-ripple'), { once: true });
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// THE STAGE — one reusable sequence, driven for BREED and WILD alike.
// ---------------------------------------------------------------------------
export function createBirthStage({ grid, buildCell, prefersReducedMotion = defaultReducedMotion, sfx = createSfx(), onDone } = {}) {
  injectStyles();
  const driver = createBirthDriver();
  const particles = createParticleLayer();
  const flash = createFlash();
  installIdleLife(grid, sfx);

  function shake(g) {
    if (!g) return;
    g.classList.remove('tb-shake'); void g.offsetWidth; g.classList.add('tb-shake');
    setTimeout(() => g.classList.remove('tb-shake'), DUR.shake + 30);
  }

  function play({ litter, topParent = null, parentCells = [] }) {
    const reduced = prefersReducedMotion();
    const { plan, glowIndex } = buildBirth({ litter, topParent, reducedMotion: reduced });
    let cells = null;

    function buildHidden() {
      grid.innerHTML = '';
      cells = litter.map((ind) => {
        const c = buildCell(ind);
        if (!reduced) c.classList.add('hatch-pending');
        grid.appendChild(c);
        return c;
      });
    }

    if (!reduced) parentCells.forEach((c) => c && c.classList.add('charging'));

    driver.play(plan, {
      onEvent: (ev) => {
        switch (ev.type) {
          case 'charge':
            sfx.resume(); sfx.charge(DUR.charge);
            break;
          case 'impact':
            sfx.thunk();
            if (ev.shake) shake(grid);
            flash.fire();
            buildHidden(); // hard cut to the new litter, hidden, ready to hatch
            break;
          case 'hatch': {
            if (ev.index === 0) sfx.hatch(litter.length, DUR.hatchStagger);
            const cell = cells && cells[ev.index];
            if (cell) {
              cell.classList.remove('hatch-pending');
              cell.classList.add('hatch-in');
              const glowing = ev.index === glowIndex;
              if (glowing) cell.classList.add('glow');
              particles.puff(cell, glowing);
            }
            break;
          }
          case 'reveal-all':
            buildHidden(); // reduced motion: cells visible immediately
            break;
          case 'confirm':
            sfx.resume(); sfx.confirm();
            if (glowIndex >= 0 && cells && cells[glowIndex]) cells[glowIndex].classList.add('glow');
            break;
          default: break;
        }
      },
      onDone: () => {
        parentCells.forEach((c) => c && c.classList.remove('charging'));
        if (onDone) onDone(cells);
      },
    });
  }

  return { play, stop: () => driver.stop(), _sfx: sfx };
}

export { topInheritorIndex };
