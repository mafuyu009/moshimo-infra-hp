// Moshimo Ring: 47 prefecture tiles -> 8 regional rings -> Japan tile map -> back into the tunnel (loop).
import * as M from './lib/motion.js';
import * as G from './lib/gl.js';
import { ringSet, RINGS } from './sets/ring.js';

const { W, H, FORMAT, E, prog, lerp, kf, text, font, fill } = M;
const MONO = 'Display', UI = 'UI';
const AMBER = '#ffb454';
const SAFE = FORMAT.safe;
let SET;

const HITS = [
  [0, 'tunnel', 'impact'],
  [0.0, 'drone', 'sub', { len: 3.5 }],
  [3.7, 'exit riser', 'riser', { len: 1.7 }],
  [4.2, 'hole whoosh', 'whoosh', { len: 0.9, from: 300, to: 3000 }],
  [5.5, 'rings part', 'click'], [6.0, 'rings part', 'click'], [6.5, 'rings part', 'click'], [7.0, 'rings part', 'click'],
  [8, 'DROP', 'impact'],
  ...[8.4, 8.9, 9.4, 9.9, 10.4, 10.9, 11.4, 11.9].map((b, i) => [b, 'label ' + i, 'tick']),
  [11.6, 'dive', 'whoosh', { len: 0.5, from: 500, to: 3500 }],
  [12.6, 'macro', 'thud'],
  [14.0, 'tiles lift', 'pop', { pitch: 'A5' }], [14.5, 'tiles lift', 'pop', { pitch: 'D6' }],
  [16, 'to axis', 'swell'], [16.2, 'axis whoosh', 'whoosh', { len: 0.6, from: 2500, to: 500 }],
  ...[16.5, 17.0, 17.5, 18.0, 18.5, 19.0].map((b) => [b, 'count', 'blip', { pitch: 'D7' }]),
  [19.5, 'map begins', 'riser', { len: 1.8 }],
  [21.4, 'Aomori', 'pop', { pitch: 'D5' }], [21.85, 'Iwate', 'pop', { pitch: 'F5' }], [22.3, 'Akita', 'pop', { pitch: 'A5' }],
  [22.75, 'Gifu', 'pop', { pitch: 'C6' }], [23.2, 'Shizuoka', 'pop', { pitch: 'D6' }], [23.65, 'Hyogo', 'pop', { pitch: 'F6' }],
  [24, 'map held', 'bell', { pitch: 'D6' }],
  [25.5, 'roll up', 'swell'],
  [28, 'loop in', 'impact'],
  [29.5, 'logo', 'bell', { pitch: 'D6' }],
];

const v3 = (a, b, p) => a.map((x, i) => lerp(x, b[i], p));
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const orb = (phi, D, z) => [D * Math.cos(phi), D * Math.sin(phi), z];
const L0 = RINGS.reduce((a, r) => a + r.w, 0);

const S1ex = { P: [0, 0, -L0 / 2 - 0.3], L: [0, 0, -L0 / 2 - 6], up: [0, 1, 0], fov: 92, fog: 0.085 };
const S3start = { P: [17 * Math.cos(0.9), 17 * Math.sin(0.9), 0], L: [0, 0, 0], up: [0, 0, 1], fov: 42, fog: 0.045 };

function camAt(u, set) {
  const Z = set.zc(u).z;
  const zTohoku = Z[4];
  const spinT = set.spinOf(RINGS[4], u);
  const mixS = (a, b, p, bump = 0, out = [0, 0, 0]) => ({
    P: v3(a.P, b.P, p).map((x, i) => x + out[i] * Math.sin(Math.PI * p) * bump), L: v3(a.L, b.L, p),
    up: norm(v3(a.up, b.up, p)), fov: lerp(a.fov, b.fov, p), fog: lerp(a.fog, b.fog, p),
  });
  if (u < 2.9) {
    const z = lerp(L0 / 2 - 0.35, -L0 / 2 - 0.3, prog(u, 0, 2.9) ** 1.12);
    return { P: [0.05 * Math.sin(u * 2.1), 0.04 * Math.cos(u * 3.1), z], L: [0, 0, z - 4], up: [0.12 * Math.sin(u * 0.9), 1, 0], fov: lerp(82, 92, prog(u, 0, 3.7)), fog: 0.085 };
  }
  const S3 = (() => {
    const p = E.inOutCubic(prog(u, 7.4, 11.8));
    const phi = lerp(0.9, 2.3, p), D = lerp(17, 8.0, E.outCubic(prog(u, 7.4, 9.4)));
    const lz = kf(u, [[7.4, 0], [8.3, 0], [11.8, zTohoku]]);
    return { P: orb(phi, D, lz), L: [0, 0, lz], up: [0, 0, 1], fov: lerp(42, 50, p), fog: lerp(0.045, 0.07, p) };
  })();
  if (u < 7.4) {
    const p = E.inOutCubic(prog(u, 2.9, 7.4)), m = mixS(S1ex, S3start, p, 1, [8, 8, 0]);
    m.L = v3(S1ex.L, S3start.L, E.outCubic(prog(u, 2.9, 3.7)));
    return m;
  }
  if (u < 11.5) return S3;
  const S4 = (() => {
    const phi = spinT + 3.9 + 0.35 * Math.sin((u - 12) * 0.5), R = RINGS[4].R;
    const d = lerp(1.7, 1.0, prog(u, 12.5, 16));
    const z = zTohoku - 0.12 + 0.12 * (u - 13);
    return { P: orb(phi, R + d, z), L: [Math.cos(phi + 0.15) * R, Math.sin(phi + 0.15) * R, z - 0.15], up: [0, 0, 1], fov: 52, fog: 0.05 };
  })();
  if (u < 13.0) return mixS(S3, S4, E.inOutCubic(prog(u, 11.5, 13.0)));
  if (u < 15.6) return S4;
  const axisZ = kf(u, [[17, 17], [19.6, 12.6], [22.5, 21], [25.2, 21], [28, L0 / 2 - 0.35]], E.inOutCubic);
  const S5 = { P: [0, 0, axisZ], L: [0, 0, 0], up: [0, 1, 0], fov: lerp(60, 40, prog(u, 18, 22.5)), fog: lerp(0.03, 0.02, prog(u, 18, 22)) };
  if (u < 17.4) return mixS(S4, S5, E.inOutCubic(prog(u, 15.6, 17.4)), 1, [6, 0, 0]);
  const z8 = lerp(L0 / 2 - 0.35, -L0 / 2 + 1.7, E.outCubic(prog(u, 28, 31.8)));
  const S8 = { P: [0.03 * Math.sin(u), 0.03 * Math.cos(u * 1.3), z8], L: [0, 0, z8 - 4], up: [0, 1, 0], fov: lerp(92, 70, prog(u, 28, 32)), fog: 0.085 };
  if (u < 25.2) return S5;
  if (u < 28) return mixS(S5, S8, E.inOutCubic(prog(u, 25.2, 28)));
  return S8;
}

function labels(ctx, u, set) {
  const cam = set.camera;
  RINGS.forEach((r, i) => {
    const t0 = 8.2 + i * 0.5, k = prog(u, t0, t0 + 0.35);
    if (k <= 0 || u > 11.9) return;
    const Z = set.zc(u).z;
    const dir = new G.THREE.Vector3(cam.position.x, cam.position.y, 0).normalize();
    const a = new G.THREE.Vector3(dir.x * r.R, dir.y * r.R, Z[i]).project(cam);
    const x = (a.x * 0.5 + 0.5) * W, y = (-a.y * 0.5 + 0.5) * H;
    if (a.z > 1 || y < SAFE.y * 0.6 || y > H - 380 || x < -50 || x > W + 50) return;
    ctx.save(); ctx.globalAlpha = k;
    ctx.strokeStyle = 'rgba(232,237,247,0.85)'; ctx.lineWidth = 2.2;
    const x0 = SAFE.x, lx = lerp(x, x0, E.outCubic(k));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(lx, y); ctx.stroke();
    ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
    text(ctx, r.name, x0, y - 14, font(46, 700, MONO), '#e8edf7');
    text(ctx, String(r.prefs.length).padStart(2, '0'), x0, y + 42, font(30, 400, UI), '#93a3c4');
    ctx.restore();
  });
}

function counter(ctx, u) {
  const k = prog(u, 16.3, 19.2), n = Math.round(47 * E.outCubic(k));
  const fade = prog(u, 16.2, 16.6) * (1 - prog(u, 19.3, 19.7));
  if (fade <= 0) return;
  ctx.save(); ctx.globalAlpha = fade;
  text(ctx, String(n).padStart(2, '0'), SAFE.x, SAFE.y + 110, font(150, 700, MONO), '#e8edf7');
  text(ctx, '× 256', SAFE.x + 6, SAFE.y + 170, font(44, 400, UI), '#93a3c4');
  ctx.restore();
}

function endCard(ctx, u) {
  const k = prog(u, 28.9, 29.4), fade = prog(u, 28.4, 29.2);
  if (fade <= 0) return;
  const cx = W / 2, cy = H * 0.46;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
  g.addColorStop(0, `rgba(5,8,15,${0.88 * fade})`); g.addColorStop(0.65, `rgba(5,8,15,${0.7 * fade})`); g.addColorStop(1, 'rgba(5,8,15,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const dot = E.outBack(prog(u, 28.6, 29.1), 2) * 14;
  ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(cx, cy - 130, Math.max(dot, 0), 0, 7); ctx.fill();
  if (k > 0) {
    ctx.save(); ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = font(78, 700, MONO); ctx.fillStyle = '#e8edf7'; ctx.fillText('MOSHIMO', cx, cy - 20);
    ctx.fillText('INFRA', cx, cy + 66);
    ctx.font = '400 42px "WenQuanYi Zen Hei","Noto Sans CJK JP",sans-serif'; ctx.fillStyle = '#93a3c4';
    ctx.fillText('もしもインフラ', cx, cy + 150);
    ctx.restore();
  }
}

M.film({
  fonts: [font(100, 700, MONO), font(40, 400, UI)],
  hits: HITS,
  samples: () => 5,
  async init() { await G.initGL({}); SET = ringSet(); },
  draw(ctx, u, t) {
    fill(ctx, '#05080f');
    const c = camAt(u, SET);
    G.renderSet(ctx, SET, t, u, { cam: c.P, look: c.L, up: c.up, fov: c.fov, fog: c.fog });
    labels(ctx, u, SET); counter(ctx, u); endCard(ctx, u);
  },
  post(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
});
