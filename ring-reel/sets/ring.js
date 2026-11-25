// Prefecture-tile data sculpture: 47 prefectures x 256 tiles, wrapped in 8 regional rings
// (ring width = prefecture count) and re-laid as a Japan tile map. Pure function of (u).
import * as M from '../lib/motion.js';
import * as G from '../lib/gl.js';
const { THREE } = G;

const PER = 256, c = 0.07, MC = 0.44;          // tiles per prefecture, ring cell, map cell
// name, region, mapCol, mapRow
const P = [
  ['Hokkaido', 'HOKKAIDO', 14, 0],
  ['Aomori', 'TOHOKU', 14, 1], ['Iwate', 'TOHOKU', 15, 2], ['Akita', 'TOHOKU', 14, 2], ['Miyagi', 'TOHOKU', 15, 3], ['Yamagata', 'TOHOKU', 14, 3], ['Fukushima', 'TOHOKU', 14, 4],
  ['Ibaraki', 'KANTO', 15, 5], ['Tochigi', 'KANTO', 14, 5], ['Gunma', 'KANTO', 13, 5], ['Saitama', 'KANTO', 14, 6], ['Chiba', 'KANTO', 15, 6], ['Tokyo', 'KANTO', 14, 7], ['Kanagawa', 'KANTO', 14, 8],
  ['Niigata', 'CHUBU', 13, 4], ['Toyama', 'CHUBU', 12, 5], ['Ishikawa', 'CHUBU', 11, 5], ['Fukui', 'CHUBU', 10, 6], ['Yamanashi', 'CHUBU', 13, 7], ['Nagano', 'CHUBU', 13, 6], ['Gifu', 'CHUBU', 12, 7], ['Shizuoka', 'CHUBU', 13, 8], ['Aichi', 'CHUBU', 12, 8],
  ['Mie', 'KINKI', 11, 8], ['Shiga', 'KINKI', 11, 7], ['Kyoto', 'KINKI', 10, 7], ['Osaka', 'KINKI', 10, 8], ['Hyogo', 'KINKI', 9, 7], ['Nara', 'KINKI', 11, 9], ['Wakayama', 'KINKI', 10, 9],
  ['Tottori', 'CHUGOKU', 8, 7], ['Shimane', 'CHUGOKU', 7, 7], ['Okayama', 'CHUGOKU', 8, 8], ['Hiroshima', 'CHUGOKU', 7, 8], ['Yamaguchi', 'CHUGOKU', 6, 8],
  ['Kagawa', 'SHIKOKU', 8, 9], ['Tokushima', 'SHIKOKU', 9, 9], ['Ehime', 'SHIKOKU', 7, 10], ['Kochi', 'SHIKOKU', 8, 10],
  ['Fukuoka', 'KYUSHU', 4, 8], ['Saga', 'KYUSHU', 3, 8], ['Nagasaki', 'KYUSHU', 2, 8], ['Oita', 'KYUSHU', 5, 9], ['Kumamoto', 'KYUSHU', 3, 9], ['Miyazaki', 'KYUSHU', 4, 10], ['Kagoshima', 'KYUSHU', 3, 10], ['Okinawa', 'KYUSHU', 1, 12],
];
const POSTED = new Set(['Aomori', 'Akita', 'Iwate', 'Shizuoka', 'Hyogo', 'Gifu']);
const SOON = 'Fukushima';
// ring order along +z (big end first) and radii
export const RINGS = [['CHUBU', 2.4], ['KANTO', 2.0], ['KYUSHU', 1.8], ['KINKI', 1.6], ['TOHOKU', 1.3], ['CHUGOKU', 1.0], ['SHIKOKU', 0.8], ['HOKKAIDO', 0.5]]
  .map(([name, R], i) => {
    const prefs = P.map((p, j) => ({ p, j })).filter((o) => o.p[1] === name);
    const n = prefs.length * PER, C = Math.floor((TAU() * R) / c), rows = Math.ceil(n / C);
    return { name, R, i, prefs, n, C, rows, w: rows * c, dir: i % 2 ? -1 : 1 };
  });
function TAU() { return Math.PI * 2; }

const PAL = ['#e8d9b8', '#c9a36a', '#7d8fb3', '#34456b', '#b5543a', '#6a8a78', '#d6d6d6', '#8e8e94', '#a07850', '#3b4a63'];
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const Zax = new THREE.Vector3(0, 0, 1), Yax = new THREE.Vector3(0, 1, 0);
const m4 = new THREE.Matrix4(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), sc = new THREE.Vector3();
const qFace = new THREE.Quaternion().setFromAxisAngle(Yax, Math.PI / 2);
const E = M.E;

export function ringSet() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);
  scene.fog = new THREE.FogExp2(0x05080f, 0.085);
  const cam = G.camera(60, 0.02, 80);
  const N = P.length * PER;
  const geo = new THREE.PlaneGeometry(c * 0.95, c * 0.95);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  scene.add(mesh);

  // per tile static data
  const T = [];
  const base = new Float32Array(N * 3);
  const col = (h) => new THREE.Color(h).convertSRGBToLinear();
  RINGS.forEach((r) => {
    let k = 0;
    r.prefs.forEach(({ p, j }, pi) => {
      for (let t = 0; t < PER; t++, k++) {
        const id = j * PER + t, h1 = M.hash01(id, 7), h2 = M.hash01(id, 11), h3 = M.hash01(id, 13);
        const c0 = col(PAL[Math.floor(h1 * PAL.length)]);
        const lum = 0.3 + 0.7 * h2; c0.lerp(new THREE.Color(0.5, 0.5, 0.52), 0.38);
        const idx = id;
        base[idx * 3] = c0.r * lum; base[idx * 3 + 1] = c0.g * lum; base[idx * 3 + 2] = c0.b * lum;
        T[idx] = { r, k, name: p[0], posted: POSTED.has(p[0]), soon: p[0] === SOON,
          mx: (p[2] - 8 + ((t % 16) - 7.5) / 16) * MC, my: -(p[3] - 6 + (Math.floor(t / 16) - 7.5) / 16) * MC,
          dl: h3, ord: [...POSTED].indexOf(p[0]) };
      }
    });
  });
  const amber = col('#ffb454');

  const gapAt = (u) => M.kf(u, [[0, 0], [3.8, 0], [7, 1.1], [16, 1.1], [19.5, 2.4], [23, 2.4], [26, 0.0], [28, 0]]);
  const zc = (u) => {   // ring centre z, whole sculpture centred on the origin
    const g = gapAt(u); let L = 0; RINGS.forEach((r) => (L += r.w)); L += g * (RINGS.length - 1);
    let z = L / 2; const out = [];
    RINGS.forEach((r) => { out.push(z - r.w / 2); z -= r.w + g; });
    return { z: out, L };
  };
  const spinOf = (r, u) => r.dir * (0.16 + 0.04 * r.i) * u * 0.6 + r.dir * 0.5 * E.inOutCubic(M.prog(u, 7.5, 12)) * 0;

  const set = {
    scene, camera: cam, bloom: 0.62, bloomThreshold: 0.8, bloomRadius: 0.6,
    zc, gapAt, spinOf,
    update(t, u, o = {}) {
      const Z = zc(u).z, dim = M.kf(u, [[0, 1], [19, 1], [23, 0.6], [26.5, 0.6], [28, 1]]);
      const mapP0 = (tl) => M.clamp((u - 19.4 - tl.dl * 1.6 - (tl.posted ? 0.8 + tl.ord * 0.5 - tl.dl * 1.6 : 0)) / 1.5);
      const toRing = (tl) => M.clamp((u - 26 - tl.dl * 1.4) / 1.5);
      const popAt = (tl) => (tl.posted ? M.bump(u, 13.7 + tl.dl * 1.5, 0.9) : 0);
      const cols = mesh.instanceColor.array;
      for (let id = 0; id < N; id++) {
        const tl = T[id], r = tl.r;
        const col_ = tl.k % r.C, row = Math.floor(tl.k / r.C);
        const a = (col_ / r.C) * Math.PI * 2 + spinOf(r, u);
        const rr = r.R + 0.01 + popAt(tl) * 0.3;
        v1.set(Math.cos(a) * rr, Math.sin(a) * rr, Z[r.i] + (row - (r.rows - 1) / 2) * c);
        qa.setFromAxisAngle(Zax, a).multiply(qFace);
        let s = 1;
        // ring -> map -> ring
        const p1 = E.inOutCubic(mapP0(tl)), p2 = E.inOutCubic(toRing(tl));
        const p = p1 * (1 - p2);
        if (p > 0) {
          v2.set(tl.mx, tl.my, 0);
          qb.identity();
          v1.lerp(v2, p); qa.slerp(qb, p);
          s = M.lerp(1, MC / 16 / c * 0.94, p) + 0.35 * Math.sin(p * Math.PI);
        }
        sc.set(s, s, 1);
        m4.compose(v1, qa, sc);
        mesh.setMatrixAt(id, m4);
        // colour: posted prefectures glow amber, everything else dims during the map
        let k = 1, r_ = base[id * 3], g_ = base[id * 3 + 1], b_ = base[id * 3 + 2];
        if (tl.posted) {
          const hot = 1.0 + 1.3 * M.bump(u, 13.7 + tl.dl * 1.5, 0.9) + 1.1 * Math.max(M.bump(u, 22.4 + tl.ord * 0.45, 0.9), 0.55 * M.prog(u, 20, 23) * (u < 27 ? 1 : 0));
          r_ = amber.r * hot; g_ = amber.g * hot; b_ = amber.b * hot;
        } else if (tl.soon) {
          const f = 0.5 + 0.5 * Math.sin(u * 6.28 / 2 * 3 + tl.dl * 9);
          const hot = 0.25 + 0.9 * f * M.prog(u, 20, 23);
          k = dim; r_ = M.lerp(r_ * k, amber.r * hot, M.prog(u, 20, 22)); g_ = M.lerp(g_ * k, amber.g * hot, M.prog(u, 20, 22)); b_ = M.lerp(b_ * k, amber.b * hot, M.prog(u, 20, 22));
        } else { r_ *= dim; g_ *= dim; b_ *= dim; }
        cols[id * 3] = r_; cols[id * 3 + 1] = g_; cols[id * 3 + 2] = b_;
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      scene.fog.density = o.fog ?? 0.085;
      if (o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
      cam.position.set(...o.cam); cam.up.set(...(o.up ?? [0, 1, 0])); cam.lookAt(...(o.look ?? [0, 0, 0]));
    },
  };
  return set;
}
