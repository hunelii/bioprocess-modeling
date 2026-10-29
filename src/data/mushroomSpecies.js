import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from './gpuOptimize.js';

// ============================================================================
// Zone F multi-species fruiting library.
// Each species is modelled after its real cultivated growth habit & cultivation vessel:
//  - Pleurotus ostreatus / djamor   : imbricate lateral shelves from side slits of grow bags
//  - Pleurotus citrinopileatus      : bouquet of funnel-shaped yellow caps on fused central stems
//  - Lentinula edodes               : solitary umbrella caps, in-rolled margin, white veil flecks, browned sawdust block
//  - Hericium erinaceus             : cap-less globose mass of cascading downward spines from a bag slit
//  - Flammulina velutipes           : dense tuft of long white stems & pin caps inside a PP bottle collar
//  - Hypsizygus marmoreus           : tight fused clusters of marbled convex caps from a PP bottle
//  - Ganoderma lucidum              : lacquered kidney-shaped bracket with white growing margin + young antler
//  - Grifola frondosa               : rosette of overlapping spoon-shaped fronds on a branching white core
//  - Pholiota nameko                : small amber caps coated in translucent mucilage
//  - Cordyceps militaris            : orange club-shaped stromata rising from a brown-rice bed in a glass jar
//  - Agaricus bisporus              : white buttons emerging from a peat casing layer, partial veil -> ring
// Local cluster coordinates: origin on the tray surface, +Z up, -Y toward the camera.
// Every species must stay below ~0.21 m tall (cluster group is scaled ×1.3 in the scene).
// ============================================================================

const PI = Math.PI;
const UNIT_Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}

function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  return g;
}

// Place a Z-up local geometry at pos, rotating local +Z onto dir.
function orient(geo, pos, dir, scale = [1, 1, 1], spin = 0) {
  const g = prep(geo);
  const d = _v.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UNIT_Z, d);
  if (spin) _q.multiply(new THREE.Quaternion().setFromAxisAngle(UNIT_Z, spin));
  _m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
  g.applyMatrix4(_m);
  g.computeVertexNormals();
  return g;
}

// Place a geometry: scale -> tilt about local X -> yaw about Z -> translate (intuitive for shelf caps).
function yawTilt(geo, pos, yaw, tilt, scale = [1, 1, 1], roll = 0) {
  const g = prep(geo);
  const S = new THREE.Matrix4().makeScale(scale[0], scale[1], scale[2]);
  const Ry = new THREE.Matrix4().makeRotationY(roll);
  const Rx = new THREE.Matrix4().makeRotationX(tilt);
  const Rz = new THREE.Matrix4().makeRotationZ(yaw);
  const T = new THREE.Matrix4().makeTranslation(pos[0], pos[1], pos[2]);
  g.applyMatrix4(T.multiply(Rz).multiply(Rx).multiply(Ry).multiply(S));
  g.computeVertexNormals();
  return g;
}

const move = (geo, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => transformGeo(geo, pos, rot, scale);

// Z-up cylinder with its base on z = 0
function cylZ(rt, rb, h, seg = 12, open = false) {
  return transformGeo(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), [0, 0, h / 2], [PI / 2, 0, 0]);
}

// Z-up surface of revolution from [radius, height] profile pairs
function lathe(profile, seg = 20) {
  const pts = profile.map(([r, h]) => new THREE.Vector2(Math.max(0.0001, r), h));
  return transformGeo(new THREE.LatheGeometry(pts, seg), [0, 0, 0], [PI / 2, 0, 0]);
}

// Wavy / lobed margin on a Z-up revolved cap
function ruffle(geo, ampR, ampZ, freq, phase = 0) {
  const g = prep(geo);
  const pos = g.attributes.position;
  let rMax = 0;
  for (let i = 0; i < pos.count; i++) rMax = Math.max(rMax, Math.hypot(pos.getX(i), pos.getY(i)));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const u = Math.pow(r / rMax, 2.2);
    const k = 1 + ampR * u * Math.sin(a * freq + phase);
    pos.setXYZ(i, x * k, y * k, pos.getZ(i) + ampZ * u * Math.sin(a * (freq + 2) + phase * 1.7) * rMax);
  }
  g.computeVertexNormals();
  return g;
}

// Tapered curved tube through points (rBot at start, rTop at end)
function taperTube(points, rBot, rTop, tubSeg = 8, radSeg = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, tubSeg, rBot, radSeg, false);
  const pos = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    const t = Math.floor(k / (radSeg + 1)) / tubSeg;
    curve.getPointAt(Math.min(1, t), c);
    v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(THREE.MathUtils.lerp(1, rTop / rBot, t)).add(c);
    pos.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Shared cap primitives (unit radius)
// ---------------------------------------------------------------------------
// Pleurotus spathulate / kidney-fan shell, attachment at origin, fanning toward -Y
function oysterShell(ruffleAmp = 1, segA = 26, segR = 12) {
  const vertices = [0, 0, 0.004], faces = [];
  for (let j = 1; j <= segR; j++) {
    const u = j / segR;
    const edge = Math.pow(u, 2.0);
    for (let i = 0; i <= segA; i++) {
      const s = i / segA;
      const alpha = (s - 0.5) * 4.36;
      // High-resolution asymmetric kidney-fan lobe reach with radial striations
      const reach = 0.72 + 0.34 * Math.cos(alpha * 0.65) - 0.08 * Math.cos(alpha * 2.0) + 0.04 * Math.sin(alpha * 5.0) - 0.015 * Math.cos(alpha * 11.0);
      const r = u * reach;
      const px = r * Math.sin(alpha * 0.72) * 0.92;
      const py = -r * (0.28 + 0.72 * Math.cos(alpha * 0.52));
      const funnel = -0.10 * Math.exp(-u * 5.0);
      const arch = 0.28 * Math.sin(u * PI * 0.84);
      // Concentric growth rings and delicate undulations on the pileus margin
      const concentricRidge = 0.008 * Math.sin(u * 32.0) * (1.0 - Math.exp(-u * 3.0));
      const wave = 0.05 * ruffleAmp * edge * (Math.sin(alpha * 5.0 + 0.3) + 0.45 * Math.cos(alpha * 9.0 * ruffleAmp));
      const lip = -0.09 * Math.pow(u, 3.8);
      vertices.push(px, py, 0.02 + funnel + arch + concentricRidge + wave + lip);
    }
  }
  const stride = segA + 1;
  for (let i = 0; i < segA; i++) faces.push(0, 1 + i, 2 + i);
  for (let j = 0; j < segR - 1; j++) {
    const a0 = 1 + j * stride, b0 = a0 + stride;
    for (let i = 0; i < segA; i++) faces.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  return g;
}

// Decurrent radial lamellae under an oyster shell with fine branching anastomoses
function oysterGills(numGills = 28) {
  const pos = [], idx = [], steps = 6;
  for (let k = 0; k < numGills; k++) {
    const alpha = ((k + 0.5) / numGills - 0.5) * 4.15;
    const reach = 0.72 + 0.34 * Math.cos(alpha * 0.65) - 0.08 * Math.cos(alpha * 2.0);
    const isInterveined = k % 2 === 1;
    const startU = isInterveined ? 0.35 : 0.04;
    for (let j = 0; j <= steps; j++) {
      const u = startU + (j / steps) * (0.94 - startU);
      const r = u * reach;
      const px = r * Math.sin(alpha * 0.72) * 0.92;
      const py = -r * (0.28 + 0.72 * Math.cos(alpha * 0.52));
      const zTop = 0.005 - 0.10 * Math.exp(-u * 5) + 0.27 * Math.sin(u * PI * 0.84) - 0.08 * Math.pow(u, 3.8);
      const depth = (0.10 * Math.sin(u * PI) + 0.06 * (1 - u)) * (isInterveined ? 0.65 : 1.0);
      pos.push(px, py, zTop, px, py, zTop - depth);
    }
  }
  for (let k = 0; k < numGills; k++) {
    const b = k * (steps + 1) * 2;
    for (let j = 0; j < steps; j++) { const a = b + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Radial gill fins under an umbrella cap (unit radius, flat underside at z ≈ zUnder)
function radialGills(count, rIn, rOut, zUnder, depth) {
  const geos = [];
  const fin = new THREE.BoxGeometry(rOut - rIn, 0.012, depth);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * PI * 2;
    const rm = (rIn + rOut) / 2;
    geos.push(move(fin, [Math.cos(a) * rm, Math.sin(a) * rm, zUnder - depth / 2], [1, 1, 1], [0, 0, a]));
  }
  return mergeGeometriesFast(geos);
}

const SHELL = oysterShell(1.0);
const SHELL_RUFFLED = oysterShell(2.3, 22, 9);
const SHELL_FROND = oysterShell(1.6, 12, 6);
const GILLS = oysterGills(16);

// ---------------------------------------------------------------------------
// Cultivation vessels
// ---------------------------------------------------------------------------
function growBag(h = 0.17, r = 0.066, seed = 1) {
  const rand = rng(seed);
  const body = move(cylZ(r * 0.94, r, h, 16), [0, 0, 0], [1, 0.78, 1]);
  const shoulder = move(new THREE.SphereGeometry(r * 0.94, 16, 6, 0, PI * 2, 0, PI / 2), [0, 0, h], [1, 0.45, 0.78], [PI / 2, 0, 0]);
  const gather = move(new THREE.ConeGeometry(r * 0.32, 0.045, 10), [0, 0, h + 0.035], [1, 1, 1], [PI / 2, 0, 0]);
  const tie = move(new THREE.TorusGeometry(0.014, 0.004, 6, 12), [0, 0, h + 0.03]);
  const geos = [body, shoulder, gather, tie];
  // Sparse mycelial knots on the bag surface
  for (let i = 0; i < 10; i++) {
    const a = rand() * PI * 2, z = 0.02 + rand() * (h - 0.04);
    geos.push(move(new THREE.IcosahedronGeometry(0.006 + rand() * 0.005, 0), [Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.78, z], [1.4, 1.4, 0.6]));
  }
  return mergeGeometriesFast(geos);
}

// White breathable filter patch square on the rear of a bag (accent layer)
function filterPatch(h, r) {
  return move(new THREE.BoxGeometry(0.04, 0.004, 0.04), [0.0, r * 0.79, h * 0.72]);
}

function sawdustBlock(w, d, h, seed = 3, bumps = 12) {
  const rand = rng(seed);
  const geos = [move(new THREE.BoxGeometry(w, d, h, 3, 3, 3), [0, 0, h / 2])];
  for (let i = 0; i < bumps; i++) {
    const face = rand();
    const p = face < 0.5
      ? [(rand() - 0.5) * w * 0.9, -d / 2, 0.015 + rand() * (h - 0.03)]
      : [(rand() - 0.5) * w * 0.9, (rand() - 0.5) * d * 0.9, h];
    geos.push(move(new THREE.IcosahedronGeometry(0.008 + rand() * 0.008, 0), p, [1.3, 1.3, 0.7]));
  }
  return mergeGeometriesFast(geos);
}

function ppBottle(h = 0.12) {
  return lathe([
    [0.0, 0.0], [0.050, 0.0], [0.054, 0.006], [0.054, h * 0.76], [0.045, h * 0.88],
    [0.036, h * 0.94], [0.036, h], [0.033, h], [0.0, h - 0.004]
  ], 22);
}

function glassJar(r = 0.058, h = 0.13) {
  return mergeGeometriesFast([
    cylZ(r, r, h, 24, true),
    move(new THREE.CircleGeometry(r, 24), [0, 0, 0.002]),
    move(new THREE.TorusGeometry(r, 0.004, 6, 24), [0, 0, h])
  ]);
}

// ---------------------------------------------------------------------------
// Species builders: return { base, base2, accent, stem, cap, detail, pivot }
// ---------------------------------------------------------------------------
function buildOysterShelves({ seed, count, scaleMin, scaleMax, shell, bagH = 0.17 }) {
  const rand = rng(seed);
  const r = 0.066;
  const base = growBag(bagH, r, seed);
  const stem = [], cap = [], detail = [];
  // Three tiered side slits bursting with lush, overlapping cascading oyster clusters
  const slits = [[-0.024, 0.125], [0.026, 0.082], [-0.015, 0.042]];
  slits.forEach(([sx, sz], si) => {
    const n = Math.round(count / slits.length) + (si === 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const sc = THREE.MathUtils.lerp(scaleMax, scaleMin, t) * (0.95 + rand() * 0.25);
      const x = sx + (rand() - 0.5) * 0.065;
      const z = sz + 0.055 - t * 0.075 + (rand() - 0.5) * 0.015;
      const yaw = (rand() - 0.5) * 1.25 + (x * 6.5);
      const tilt = -0.22 - rand() * 0.28;
      const attach = [x * 1.15, -r * 0.78 - 0.015, z];
      stem.push(taperTube([[x * 0.55, -r * 0.60, z - 0.020], [x * 0.88, -r * 0.74, z - 0.008], attach], 0.012 * (sc / 0.08) + 0.004, 0.009 * (sc / 0.08) + 0.003, 6, 7));
      cap.push(yawTilt(shell, attach, yaw, tilt, [sc, sc, sc]));
      detail.push(yawTilt(GILLS, attach, yaw, tilt, [sc * 0.97, sc * 0.97, sc]));
    }
    // Young primordial pins & hyphal cords bursting from each slit
    for (let k = 0; k < 6; k++) {
      detail.push(move(new THREE.SphereGeometry(0.004 + rand() * 0.0035, 6, 5), [sx + (rand() - 0.5) * 0.06, -r * 0.81, sz - 0.035 + (rand() - 0.5) * 0.025]));
    }
  });
  return { base, accent: filterPatch(bagH, r), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
}

const BUILDERS = {
  pleurotus_ostreatus: () => buildOysterShelves({ seed: 101, count: 12, scaleMin: 0.048, scaleMax: 0.098, shell: SHELL }),

  pleurotus_djamor: () => buildOysterShelves({ seed: 202, count: 15, scaleMin: 0.036, scaleMax: 0.072, shell: SHELL_RUFFLED }),

  pleurotus_citrinopileatus: () => {
    const rand = rng(303);
    const bagH = 0.13, r = 0.064;
    const root = [0, -0.005, bagH + 0.03];
    const stem = [move(new THREE.SphereGeometry(0.026, 12, 8), root, [1.15, 1.05, 0.8])];
    const cap = [], detail = [];
    const capTop = ruffle(lathe([[0.0, -0.10], [0.25, -0.03], [0.55, 0.07], [0.85, 0.15], [1.0, 0.14], [1.02, 0.10]], 22), 0.07, 0.05, 6);
    const capUnder = lathe([[1.0, 0.09], [0.7, 0.02], [0.4, -0.08], [0.18, -0.18], [0.06, -0.30]], 18);
    // 22 clustered golden funnel caps
    for (let i = 0; i < 22; i++) {
      const a = i * 2.399 + rand() * 0.35;
      const out = 0.20 + rand() * 0.65;
      const len = 0.032 + rand() * 0.065;
      const dir = new THREE.Vector3(Math.cos(a) * out, Math.sin(a) * out - 0.15, 1).normalize();
      const tip = [root[0] + dir.x * len, root[1] + dir.y * len, root[2] + dir.z * len];
      const mid = [root[0] + dir.x * len * 0.45, root[1] + dir.y * len * 0.45, root[2] + dir.z * len * 0.6];
      stem.push(taperTube([root, mid, tip], 0.0058, 0.0044, 6, 6));
      const R = 0.018 + rand() * 0.022;
      const cdir = [dir.x * 0.55, dir.y * 0.55, 1];
      cap.push(orient(capTop, tip, cdir, [R, R, R], rand() * PI));
      detail.push(orient(capUnder, tip, cdir, [R * 0.98, R * 0.98, R]));
    }
    return { base: growBag(bagH, r, 303), accent: filterPatch(bagH, r), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
  },

  lentinula_edodes: () => {
    const rand = rng(404);
    const bw = 0.17, bd = 0.13, bh = 0.11;
    const capTop = lathe([[0.0, 0.40], [0.3, 0.38], [0.6, 0.30], [0.85, 0.17], [0.98, 0.04], [0.96, -0.06], [0.88, -0.08]], 24);
    const gills = mergeGeometriesFast([
      lathe([[0.88, -0.075], [0.6, -0.03], [0.3, 0.02], [0.12, 0.04]], 20),
      radialGills(28, 0.14, 0.86, 0.0, 0.05)
    ]);
    const fruits = [
      { p: [-0.045, -0.022, bh], d: [-0.15, -0.25, 1], R: 0.054, h: 0.048 },
      { p: [0.048, 0.022, bh], d: [0.2, 0.1, 1], R: 0.044, h: 0.038 },
      { p: [0.015, -bd / 2, 0.065], d: [0.05, -1.0, 0.75], R: 0.036, h: 0.032 },
      { p: [-0.015, 0.038, bh], d: [-0.1, 0.2, 1], R: 0.040, h: 0.035 },
      { p: [0.055, -bd / 2 + 0.015, 0.045], d: [0.4, -0.9, 0.6], R: 0.028, h: 0.025 }
    ];
    const stem = [], cap = [], detail = [];
    for (const f of fruits) {
      const d = new THREE.Vector3(...f.d).normalize();
      const top = [f.p[0] + d.x * f.h, f.p[1] + d.y * f.h, f.p[2] + d.z * f.h];
      stem.push(taperTube([f.p, [f.p[0] + d.x * f.h * 0.5, f.p[1] + d.y * f.h * 0.5, f.p[2] + d.z * f.h * 0.55], top], f.R * 0.26, f.R * 0.22, 6, 8));
      const cdir = [d.x * 0.5, d.y * 0.5, 1];
      cap.push(orient(capTop, top, cdir, [f.R, f.R, f.R]));
      detail.push(orient(gills, top, cdir, [f.R, f.R, f.R]));
      // White cracked veil-remnant flecks near the cap margin
      const flecks = [];
      for (let k = 0; k < 18; k++) {
        const a = rand() * PI * 2, u = 0.42 + rand() * 0.50;
        const z = 0.40 * (1 - u * u) + 0.02;
        flecks.push(move(new THREE.IcosahedronGeometry(0.06 + rand() * 0.05, 0), [Math.cos(a) * u, Math.sin(a) * u, z + 0.02], [1.6, 1.0, 0.35], [0, 0, a]));
      }
      detail.push(orient(mergeGeometriesFast(flecks), top, cdir, [f.R, f.R, f.R]));
    }
    return { base: sawdustBlock(bw, bd, bh, 404, 10), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
  },

  hericium_erinaceus: () => {
    const rand = rng(505);
    const bagH = 0.16, r = 0.068;
    const C = [0, -r * 0.78 - 0.035, 0.105];
    const body = [
      move(new THREE.IcosahedronGeometry(0.048, 2), C, [1.15, 0.95, 0.85]),
      move(new THREE.IcosahedronGeometry(0.03, 1), [C[0] - 0.035, C[1] + 0.01, C[2] + 0.02], [1, 1, 0.8]),
      move(new THREE.IcosahedronGeometry(0.028, 1), [C[0] + 0.036, C[1] + 0.012, C[2] + 0.015], [1, 1, 0.8]),
      taperTube([[0, -r * 0.7, C[2]], [0, C[1] * 0.7, C[2]], C], 0.02, 0.026, 3, 8)
    ];
    // Fine tapered spine teeth (420 cascading icicles)
    const spineUnit = transformGeo(new THREE.ConeGeometry(0.0018, 1, 5), [0, 0, -0.5], [-PI / 2, 0, 0]); // apex at z = -1, base at 0
    const spines = [];
    for (let i = 0; i < 420; i++) {
      // Sample lower & front hemisphere of the globose body
      const th = rand() * PI * 2;
      const ph = PI * (0.34 + rand() * 0.64);
      const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th) * 0.95, Math.cos(ph));
      if (n.y > 0.52) continue;
      const p = [C[0] + n.x * 0.054, C[1] + n.y * 0.046, C[2] + n.z * 0.040];
      const down = THREE.MathUtils.clamp(-n.z * 0.85 + 0.45, 0.25, 1.0);
      const len = 0.018 + down * (0.028 + rand() * 0.038);
      const dir = new THREE.Vector3(-n.x * 0.32, -n.y * 0.32, 1.0).normalize(); // spine apex (local −Z) hangs down & outward
      spines.push(orient(spineUnit, p, [dir.x, dir.y, dir.z], [1, 1, len], rand() * PI));
    }
    return {
      base: growBag(bagH, r, 505),
      accent: move(new THREE.BoxGeometry(0.07, 0.004, 0.012), [0, -r * 0.79, C[2] - 0.045]),
      stem: mergeGeometriesFast(body),
      cap: mergeGeometriesFast(spines),
      pivot: C
    };
  },

  flammulina_velutipes: () => {
    const rand = rng(606);
    const bh = 0.10;
    const top = [0, 0, bh];
    const stalks = [], caps = [];
    const stalkUnit = cylZ(0.0016, 0.0022, 1, 6);
    const capUnit = move(new THREE.SphereGeometry(1, 10, 6, 0, PI * 2, 0, PI / 2), [0, 0, 0], [1, 0.65, 1], [PI / 2, 0, 0]);
    // 95 slender thread-like stems bundled tightly inside the microclimate collar
    for (let i = 0; i < 95; i++) {
      const a = rand() * PI * 2, rr = Math.sqrt(rand()) * 0.032;
      const start = [Math.cos(a) * rr, Math.sin(a) * rr, bh];
      const spread = 0.04 + rr * 4.0;
      const dir = [Math.cos(a) * spread, Math.sin(a) * spread, 1];
      const len = 0.078 + rand() * 0.038;
      const dn = new THREE.Vector3(...dir).normalize();
      stalks.push(orient(stalkUnit, start, dir, [1, 1, len]));
      const R = 0.0038 + rand() * 0.0028;
      caps.push(orient(capUnit, [start[0] + dn.x * len, start[1] + dn.y * len, start[2] + dn.z * len], dir, [R, R, R]));
    }
    return {
      base: ppBottle(bh),
      base2: move(cylZ(0.066, 0.037, 0.085, 18, true), top),   // clear PP collar sleeve
      accent: move(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 18), [0, 0, bh - 0.001], [1, 1, 1], [PI / 2, 0, 0]),
      stem: mergeGeometriesFast(stalks),
      cap: mergeGeometriesFast(caps),
      pivot: top
    };
  },

  hypsizygus_marmoreus: () => {
    const rand = rng(707);
    const bh = 0.10;
    const root = [0, 0, bh + 0.008];
    const capTop = lathe([[0.0, 0.48], [0.4, 0.44], [0.72, 0.30], [0.93, 0.11], [1.0, 0.0], [0.92, -0.05]], 18);
    const under = lathe([[0.92, -0.05], [0.55, -0.02], [0.18, 0.03]], 14);
    const stem = [move(new THREE.SphereGeometry(0.03, 12, 8), root, [1.0, 1.0, 0.5])];
    const cap = [], detail = [];
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399 + rand() * 0.4;
      const out = 0.15 + (i / 18) * 0.85;
      const len = 0.04 + rand() * 0.045 - out * 0.012;
      const dir = new THREE.Vector3(Math.cos(a) * out, Math.sin(a) * out, 1).normalize();
      const s = [root[0] + Math.cos(a) * 0.012, root[1] + Math.sin(a) * 0.012, root[2]];
      const tip = [s[0] + dir.x * len, s[1] + dir.y * len, s[2] + dir.z * len];
      stem.push(taperTube([s, [s[0] + dir.x * len * 0.4, s[1] + dir.y * len * 0.4, s[2] + dir.z * len * 0.55], tip], 0.0068, 0.0052, 6, 6));
      const R = 0.012 + rand() * 0.01;
      const cdir = [dir.x * 0.45, dir.y * 0.45, 1];
      cap.push(orient(capTop, tip, cdir, [R, R, R]));
      // Water-soaked marbling spots on the cap surface + pale gills underneath
      const marb = [under];
      for (let k = 0; k < 7; k++) {
        const ma = rand() * PI * 2, u = 0.2 + rand() * 0.6;
        marb.push(move(new THREE.CircleGeometry(0.09 + rand() * 0.07, 6), [Math.cos(ma) * u, Math.sin(ma) * u, 0.48 * (1 - u * u * 0.9) + 0.012], [1, 1, 1], [-(Math.sin(ma) * u) * 0.9, (Math.cos(ma) * u) * 0.9, 0]));
      }
      detail.push(orient(mergeGeometriesFast(marb), tip, cdir, [R, R, R]));
    }
    return { base: ppBottle(bh), accent: move(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 18), [0, 0, bh - 0.001], [1, 1, 1], [PI / 2, 0, 0]), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail), pivot: [0, 0, bh] };
  },

  ganoderma_lucidum: () => {
    const bw = 0.16, bd = 0.13, bh = 0.12;
    const stem = [
      // Primary tiered antler stipe
      taperTube([[0.018, 0.0, bh - 0.005], [0.025, -0.015, bh + 0.035], [0.008, -0.035, 0.170], [0.0, -0.055, 0.185]], 0.017, 0.012, 10, 8),
      // Secondary lateral shelf stipe
      taperTube([[-0.035, -0.02, bh - 0.005], [-0.045, -0.035, bh + 0.03], [-0.05, -0.065, 0.13]], 0.013, 0.009, 8, 8),
      // Two young antler-form branching horns
      taperTube([[-0.045, 0.02, bh - 0.005], [-0.06, 0.01, bh + 0.035], [-0.075, -0.008, bh + 0.075]], 0.011, 0.008, 6, 8),
      taperTube([[0.05, 0.025, bh - 0.005], [0.062, 0.015, bh + 0.03], [0.07, 0.005, bh + 0.06]], 0.010, 0.0075, 6, 8)
    ];
    const cTop = lathe([[0.0, 0.15], [0.4, 0.145], [0.72, 0.10], [0.92, 0.04], [1.0, 0.0], [0.95, -0.035]], 32);
    const ridges = mergeGeometriesFast([0.38, 0.58, 0.78, 0.90].map((u, i) => move(new THREE.TorusGeometry(u, 0.014, 6, 32), [0, 0, 0.15 * (1 - u * u) + 0.002 - i * 0.004])));
    
    // Main upper lacquered conk
    const capC1 = [0, -0.125, 0.192];
    const S1 = [0.105, 0.086, 0.088];
    // Lower secondary conk
    const capC2 = [-0.05, -0.115, 0.138];
    const S2 = [0.068, 0.055, 0.06];

    const cap = [
      yawTilt(cTop, capC1, 0, -0.12, S1),
      yawTilt(ridges, capC1, 0, -0.12, S1),
      yawTilt(cTop, capC2, -0.3, -0.16, S2),
      yawTilt(ridges, capC2, -0.3, -0.16, S2)
    ];
    const detail = [
      // Bright white-yellow actively growing margin on both brackets
      yawTilt(new THREE.TorusGeometry(0.99, 0.045, 6, 36), [capC1[0], capC1[1], capC1[2] - 0.001], 0, -0.12, S1),
      yawTilt(new THREE.CircleGeometry(0.95, 32), [capC1[0], capC1[1], capC1[2] - 0.003], 0, -0.12 + PI, S1),
      yawTilt(new THREE.TorusGeometry(0.99, 0.045, 6, 36), [capC2[0], capC2[1], capC2[2] - 0.001], -0.3, -0.16, S2),
      yawTilt(new THREE.CircleGeometry(0.95, 32), [capC2[0], capC2[1], capC2[2] - 0.003], -0.3, -0.16 + PI, S2),
      // White growing tips of the young antlers
      move(new THREE.SphereGeometry(0.009, 10, 8), [-0.075, -0.008, bh + 0.078], [1, 1, 1.3]),
      move(new THREE.SphereGeometry(0.008, 10, 8), [0.07, 0.005, bh + 0.063], [1, 1, 1.3])
    ];
    return { base: sawdustBlock(bw, bd, bh, 808, 10), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
  },

  grifola_frondosa: () => {
    const rand = rng(909);
    const bw = 0.17, bd = 0.14, bh = 0.09;
    const C = [0, -0.01, bh];
    const stem = [move(new THREE.SphereGeometry(0.042, 14, 10), [C[0], C[1], C[2] + 0.01], [1.2, 1.1, 0.85])];
    const cap = [], detail = [];
    const fronds = 54;
    for (let k = 0; k < fronds; k++) {
      const t = k / fronds;
      const a = k * 2.39996 + rand() * 0.25;
      const rr = 0.014 + (1 - t) * 0.065;
      const h = 0.018 + t * 0.082 + rand() * 0.015;
      const tipP = [C[0] + Math.cos(a) * rr, C[1] + Math.sin(a) * rr, C[2] + h];
      stem.push(taperTube([[C[0] + Math.cos(a) * 0.012, C[1] + Math.sin(a) * 0.012, C[2] + 0.01], [C[0] + Math.cos(a) * rr * 0.6, C[1] + Math.sin(a) * rr * 0.6, C[2] + h * 0.6], tipP], 0.0075, 0.0052, 5, 5));
      const sc = 0.034 + (1 - t) * 0.028 + rand() * 0.008;
      const yaw = a + PI / 2;
      const tilt = -0.15 - t * 0.80;
      cap.push(yawTilt(SHELL_FROND, tipP, yaw, tilt, [sc * 0.82, sc, sc]));
      detail.push(yawTilt(GILLS, tipP, yaw, tilt, [sc * 0.80, sc * 0.97, sc]));
    }
    return { base: sawdustBlock(bw, bd, bh, 909, 8), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
  },

  pholiota_nameko: () => {
    const rand = rng(1010);
    const bw = 0.16, bd = 0.12, bh = 0.10;
    const C = [0, -0.01, bh];
    const capTop = lathe([[0.0, 0.62], [0.45, 0.56], [0.8, 0.38], [0.98, 0.12], [1.0, 0.0], [0.9, -0.05], [0.4, -0.04]], 18);
    const stem = [move(new THREE.SphereGeometry(0.032, 12, 8), C, [1.35, 1.05, 0.38])];
    const cap = [], detail = [];
    // 34 small button caps in tight clusters
    for (let i = 0; i < 34; i++) {
      const a = i * 2.399 + rand() * 0.35;
      const out = 0.1 + rand() * 0.85;
      const len = 0.024 + rand() * 0.044;
      const dir = new THREE.Vector3(Math.cos(a) * out, Math.sin(a) * out, 1).normalize();
      const s = [C[0] + Math.cos(a) * 0.024 * rand(), C[1] + Math.sin(a) * 0.024 * rand(), C[2]];
      const tip = [s[0] + dir.x * len, s[1] + dir.y * len, s[2] + dir.z * len];
      stem.push(taperTube([s, tip], 0.0044, 0.0036, 4, 6));
      const R = 0.011 + rand() * 0.011;
      const cdir = [dir.x * 0.5, dir.y * 0.5, 1];
      cap.push(orient(capTop, tip, cdir, [R, R, R]));
      detail.push(orient(capTop, [tip[0], tip[1], tip[2] - R * 0.02], cdir, [R * 1.12, R * 1.12, R * 1.14]));
    }
    return { base: sawdustBlock(bw, bd, bh, 1010, 8), stem: mergeGeometriesFast(stem), cap: mergeGeometriesFast(cap), detail: mergeGeometriesFast(detail) };
  },

  cordyceps_militaris: () => {
    const rand = rng(1111);
    const jr = 0.058, jh = 0.125, bedH = 0.042;
    const bed = [cylZ(jr - 0.004, jr - 0.004, bedH, 24)];
    for (let i = 0; i < 42; i++) {
      const a = rand() * PI * 2, rr = Math.sqrt(rand()) * (jr - 0.010);
      bed.push(move(new THREE.SphereGeometry(0.0035, 6, 5), [Math.cos(a) * rr, Math.sin(a) * rr, bedH], [1.8, 1, 0.8], [0, 0, a]));
    }
    const stalks = [], heads = [];
    const headUnit = transformGeo(new THREE.CapsuleGeometry(1, 2.8, 5, 9), [0, 0, 1.8], [PI / 2, 0, 0]);
    // 52 vibrant orange club-shaped stromata rising from the fortified brown-rice grain bed
    for (let i = 0; i < 52; i++) {
      const a = rand() * PI * 2, rr = Math.sqrt(rand()) * (jr - 0.012);
      const s = [Math.cos(a) * rr, Math.sin(a) * rr, bedH];
      const lean = 0.05 + rand() * 0.19;
      const len = 0.048 + rand() * 0.044;
      const la = a + (rand() - 0.5) * 1.3;
      const tip = [s[0] + Math.cos(la) * lean * len, s[1] + Math.sin(la) * lean * len, s[2] + len * 0.74];
      const mid = [s[0] + Math.cos(la) * lean * len * 0.3, s[1] + Math.sin(la) * lean * len * 0.3, s[2] + len * 0.38];
      stalks.push(taperTube([s, mid, tip], 0.0022, 0.0027, 6, 6));
      const d = [tip[0] - mid[0], tip[1] - mid[1], tip[2] - mid[2]];
      const hr = 0.0033 + rand() * 0.0013;
      heads.push(orient(headUnit, tip, d, [hr, hr, hr * (1.7 + rand() * 1.5)]));
    }
    return {
      base: mergeGeometriesFast(bed),
      base2: glassJar(jr, jh),
      stem: mergeGeometriesFast(stalks),
      cap: mergeGeometriesFast(heads),
      pivot: [0, 0, bedH]
    };
  },

  agaricus_bisporus: () => {
    const rand = rng(1212);
    const bw = 0.22, bd = 0.16, bh = 0.06;
    const surf = bh + 0.004;
    const button = lathe([[0.0, 0.66], [0.42, 0.62], [0.76, 0.46], [0.97, 0.18], [0.94, -0.06], [0.62, -0.14], [0.30, -0.15]], 22);
    const open = lathe([[0.0, 0.42], [0.5, 0.38], [0.84, 0.22], [1.0, 0.04], [0.96, -0.03]], 24);
    const openGills = mergeGeometriesFast([lathe([[0.96, -0.02], [0.6, -0.06], [0.3, -0.08]], 20), radialGills(36, 0.32, 0.92, -0.04, 0.05)]);
    const stem = [], cap = [], detail = [];
    // Mycelial knots ("pins") breaking through the casing
    for (let i = 0; i < 18; i++) {
      stem.push(move(new THREE.SphereGeometry(0.0035 + rand() * 0.003, 6, 5), [(rand() - 0.5) * bw * 0.85, (rand() - 0.5) * bd * 0.85, surf], [1, 1, 0.7]));
    }
    const shrooms = [
      [-0.07, -0.04, 0.030, 1], [0.01, -0.045, 0.034, 1], [0.075, -0.03, 0.026, 0],
      [-0.03, 0.03, 0.024, 0], [0.05, 0.035, 0.022, 0], [-0.085, 0.035, 0.018, 0],
      [0.02, 0.0, 0.015, 0], [-0.02, -0.005, 0.012, 0], [0.09, 0.055, 0.011, 0]
    ];
    for (const [x, y, R, isOpen] of shrooms) {
      const sh = R * (isOpen ? 1.3 : 0.85);
      stem.push(move(cylZ(R * 0.36, R * 0.42, sh, 10), [x, y, surf - 0.003]));
      const top = [x, y, surf + sh];
      const tilt = (rand() - 0.5) * 0.2;
      if (isOpen) {
        cap.push(move(open, top, [R, R, R], [tilt, tilt * 0.5, 0]));
        detail.push(move(openGills, top, [R, R, R], [tilt, tilt * 0.5, 0]));
        // Torn partial veil remains as a skirt-like ring (annulus) on the stem
        stem.push(move(cylZ(R * 0.62, R * 0.40, R * 0.18, 14, true), [x, y, surf + sh * 0.62]));
      } else {
        cap.push(move(button, top, [R, R, R], [tilt, tilt * 0.5, 0]));
      }
    }
    return {
      base: move(new THREE.BoxGeometry(bw, bd, bh), [0, 0, bh / 2]),
      base2: mergeGeometriesFast([
        move(new THREE.BoxGeometry(bw - 0.012, bd - 0.012, 0.006), [0, 0, bh + 0.001]),
        ...Array.from({ length: 22 }, () => move(new THREE.IcosahedronGeometry(0.004 + rand() * 0.004, 0), [(rand() - 0.5) * bw * 0.9, (rand() - 0.5) * bd * 0.9, bh + 0.004], [1.3, 1.3, 0.6]))
      ]),
      stem: mergeGeometriesFast(stem),
      cap: mergeGeometriesFast(cap),
      detail: mergeGeometriesFast(detail)
    };
  }
};

// ---------------------------------------------------------------------------
// Species catalogue: tray assignment, colours, growth animation style
// rows: 0 = lower tray, 1 = middle tray, 2 = upper tray; cols 0..3 from left to right
// anim: 'shelf' (caps unfurl outward), 'elongate' (stems stretch upward), 'umbrella' (stem rises, cap opens), 'globe' (mass swells, spines lengthen)
// ---------------------------------------------------------------------------
export const MUSHROOM_SPECIES = [
  { key: 'pleurotus_ostreatus', latin: 'Pleurotus ostreatus', common: 'Pearl oyster', row: 0, col: 0, anim: 'shelf',
    mats: { base: { color: '#ebe6d8', rough: 0.85 }, accent: { color: '#ffffff', rough: 0.9 }, stem: { color: '#efe9dc', rough: 0.7 }, cap: { color: '#8e8983', rough: 0.55 }, detail: { color: '#f1ead9', rough: 0.75 } } },
  { key: 'pleurotus_djamor', latin: 'Pleurotus djamor', common: 'Pink oyster', row: 0, col: 1, anim: 'shelf',
    mats: { base: { color: '#ebe6d8', rough: 0.85 }, accent: { color: '#ffffff', rough: 0.9 }, stem: { color: '#f2d4d4', rough: 0.7 }, cap: { color: '#e28c9a', rough: 0.5 }, detail: { color: '#f4c3c8', rough: 0.7 } } },
  { key: 'pleurotus_citrinopileatus', latin: 'Pleurotus citrinopileatus', common: 'Golden oyster', row: 0, col: 2, anim: 'umbrella',
    mats: { base: { color: '#ebe6d8', rough: 0.85 }, accent: { color: '#ffffff', rough: 0.9 }, stem: { color: '#f4eedb', rough: 0.7 }, cap: { color: '#f0be1c', rough: 0.45 }, detail: { color: '#f7e7a6', rough: 0.7 } } },
  { key: 'lentinula_edodes', latin: 'Lentinula edodes', common: 'Shiitake', row: 0, col: 3, anim: 'umbrella',
    mats: { base: { color: '#5e3f26', rough: 0.95 }, stem: { color: '#dccbab', rough: 0.8 }, cap: { color: '#5b3720', rough: 0.6 }, detail: { color: '#efe5d1', rough: 0.8 } } },

  { key: 'hericium_erinaceus', latin: 'Hericium erinaceus', common: "Lion's mane", row: 1, col: 0, anim: 'globe',
    mats: { base: { color: '#e8e1cf', rough: 0.85 }, accent: { color: '#3a3024', rough: 0.9 }, stem: { color: '#f6f0e1', rough: 0.8 }, cap: { color: '#f8f1df', rough: 0.75 } } },
  { key: 'flammulina_velutipes', latin: 'Flammulina velutipes', common: 'Enoki', row: 1, col: 1, anim: 'elongate',
    mats: { base: { color: '#d9ded8', rough: 0.45 }, base2: { glass: true, color: '#eef6f2', opacity: 0.22 }, accent: { color: '#c9ab78', rough: 0.95 }, stem: { color: '#f6f1e0', rough: 0.65 }, cap: { color: '#efe5c8', rough: 0.6 } } },
  { key: 'hypsizygus_marmoreus', latin: 'Hypsizygus marmoreus', common: 'Brown beech (shimeji)', row: 1, col: 2, anim: 'elongate',
    mats: { base: { color: '#c9d4dc', rough: 0.45 }, accent: { color: '#c9ab78', rough: 0.95 }, stem: { color: '#f3eee3', rough: 0.7 }, cap: { color: '#6c4c32', rough: 0.55 }, detail: { color: '#9c7d5c', rough: 0.6 } } },
  { key: 'ganoderma_lucidum', latin: 'Ganoderma lucidum', common: 'Reishi', row: 1, col: 3, anim: 'shelf',
    mats: { base: { color: '#cbbb98', rough: 0.9 }, stem: { color: '#4a1a10', rough: 0.22, metal: 0.08 }, cap: { color: '#6a1d12', rough: 0.16, metal: 0.1 }, detail: { color: '#f2e2b0', rough: 0.7 } } },

  { key: 'grifola_frondosa', latin: 'Grifola frondosa', common: 'Maitake', row: 2, col: 0, anim: 'shelf',
    mats: { base: { color: '#c7b38f', rough: 0.9 }, stem: { color: '#efe8d6', rough: 0.75 }, cap: { color: '#685948', rough: 0.6 }, detail: { color: '#e6dccb', rough: 0.75 } } },
  { key: 'pholiota_nameko', latin: 'Pholiota nameko', common: 'Nameko', row: 2, col: 1, anim: 'umbrella',
    mats: { base: { color: '#a98a62', rough: 0.9 }, stem: { color: '#ead9a6', rough: 0.6 }, cap: { color: '#b4541a', rough: 0.1, metal: 0.05 }, detail: { color: '#f0a54a', rough: 0.05, opacity: 0.32 } } },
  { key: 'cordyceps_militaris', latin: 'Cordyceps militaris', common: 'Cordyceps', row: 2, col: 2, anim: 'elongate',
    mats: { base: { color: '#eec06a', rough: 0.85 }, base2: { glass: true, color: '#e8f4ee', opacity: 0.2 }, stem: { color: '#f29a3a', rough: 0.55 }, cap: { color: '#e5601a', rough: 0.5 } } },
  { key: 'agaricus_bisporus', latin: 'Agaricus bisporus', common: 'Button mushroom', row: 2, col: 3, anim: 'umbrella',
    mats: { base: { color: '#2d3330', rough: 0.6 }, base2: { color: '#3a2c22', rough: 0.98 }, stem: { color: '#efeae0', rough: 0.7 }, cap: { color: '#f2eee5', rough: 0.55 }, detail: { color: '#8b6656', rough: 0.8 } } }
];

export function buildSpeciesGeometry(key) {
  const out = BUILDERS[key]();
  const pivot = out.pivot || [0, 0, 0];
  // Re-centre animated layers on their growth pivot so scaling happens from the point of emergence
  const shift = (g) => {
    if (!g) return null;
    if (pivot[0] || pivot[1] || pivot[2]) g.translate(-pivot[0], -pivot[1], -pivot[2]);
    g.computeBoundingSphere();
    return g;
  };
  return {
    base: out.base || null,
    base2: out.base2 || null,
    accent: out.accent || null,
    stem: shift(out.stem),
    cap: shift(out.cap),
    detail: shift(out.detail),
    pivot
  };
}

// Canvas texture atlas for the 12 plant-tag labels (Latin binomial + common name)
export function createSpeciesLabelAtlas() {
  const cols = 4, rows = 3, cw = 512, ch = 176;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext('2d');
  MUSHROOM_SPECIES.forEach((sp, i) => {
    const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = '#4f8c69';
    ctx.fillRect(cx, cy, 14, ch);
    ctx.fillStyle = '#1d2a23';
    let size = 46;
    ctx.font = `italic 600 ${size}px Georgia, serif`;
    while (ctx.measureText(sp.latin).width > cw - 50 && size > 22) { size -= 2; ctx.font = `italic 600 ${size}px Georgia, serif`; }
    ctx.fillText(sp.latin, cx + 32, cy + 74);
    ctx.fillStyle = '#5b6a61';
    ctx.font = '500 32px Helvetica, Arial, sans-serif';
    ctx.fillText(sp.common.toUpperCase(), cx + 32, cy + 128);
    ctx.fillStyle = '#c9c3b2';
    ctx.fillRect(cx + 32, cy + 150, cw - 64, 3);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, cols, rows };
}
