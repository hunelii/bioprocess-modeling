import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { getSharedArchitecturalRelief } from './CinematicLookdev.jsx';

/**
 * THE LIVING BIOSPHERE / BİYO-MİMARİ TAPINAĞI
 * (Neri Oxman & Zaha Hadid Visionary Architecture + High-Detail Botanical & Bryophyte Flora Engine)
 *
 * Includes:
 * 1. LivingBotanicalFloraEngine:
 *    - Pinnate Ferns (Asplenium / Adiantum) with paired leaflets & coiled fiddlehead crosiers
 *    - Star-Moss Cushions (Polytrichum / Sphagnum) covered in leafy gametophyte rosettes & golden sporophyte capsules
 *    - Peltate & Cordate Biophilic Foliage Clusters (Pilea / Peperomia) in golden-angle phyllotaxis
 *    - Dichotomous Thalloid Liverworts (Marchantia) with gemma cups & umbrella archegoniophores
 *    - Creeping Leafy Vines & Epiphytic Tendrils wrapping Petri collars, terrarium rims, and droplet reactors
 *    - Custom Living Chlorophyll Subsurface & Leaf-Venation Shader with real-time laminar breeze sway!
 */

const vascularFlowVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const vascularFlowFragmentShader = `
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uPulseColor;
  uniform float uSpeed;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 1.8);

    float flowCoord = vUv.x * 18.0 - uTime * uSpeed;
    float bolus1 = pow(0.5 + 0.5 * sin(flowCoord), 3.0);
    float bolus2 = pow(0.5 + 0.5 * sin(flowCoord * 2.3 + vUv.y * 6.28318), 4.0);
    float microBeads = smoothstep(0.62, 0.98, sin(vUv.x * 55.0 - uTime * uSpeed * 2.6 + sin(vUv.y * 12.56)));

    float pulse = clamp(bolus1 * 0.65 + bolus2 * 0.45 + microBeads * 0.40, 0.0, 1.0);
    vec3 col = mix(uBaseColor, uPulseColor, pulse);
    col += uPulseColor * fresnel * 0.45;

    float alpha = clamp(0.68 + 0.26 * pulse + 0.12 * fresnel, 0.0, 0.95);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Living Botanical Chlorophyll, Leaf Venation & Subsurface Translucency Shader with Gentle Respiration Sway
export const botanicalFoliageVertexShader = `
  uniform float uTime;
  uniform float uSwayAmp;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Gentle laminar biofoundry air-current sway on leaf tips and fern fronds (anchored at base vUv.y = 0)
    float tipFactor = clamp(vUv.y, 0.0, 1.0);
    float phase = pos.x * 11.0 + pos.y * 9.0 + pos.z * 7.0;
    pos.x += sin(uTime * 1.85 + phase) * uSwayAmp * tipFactor;
    pos.y += cos(uTime * 1.55 + phase * 1.1) * uSwayAmp * tipFactor;
    pos.z += sin(uTime * 2.20 + phase * 0.8) * (uSwayAmp * 0.45) * tipFactor;

    vWorldPos = pos;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

export const botanicalFoliageFragmentShader = `
  uniform vec3 uDeepChlorophyll;
  uniform vec3 uMidLeafColor;
  uniform vec3 uSubsurfaceGlow;
  uniform vec3 uVeinColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    vec3 L1 = normalize(vec3(0.35, -0.55, 0.75));
    vec3 L2 = normalize(vec3(-0.45, 0.40, 0.80));

    float diff = max(dot(N, L1), 0.0) * 0.72 + max(dot(N, L2), 0.0) * 0.28;
    float backLight = pow(clamp(dot(-N, L1), 0.0, 1.0), 1.6);
    float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);

    // Procedural Botanical Leaf Venation (Midrib + branching lateral pinnate veins + cellular mesophyll)
    float uCentered = abs(vUv.x - 0.5) * 2.0;
    float midrib = exp(-uCentered * 14.0) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    float lateralWave = abs(sin((vUv.y * 14.0 - uCentered * 5.5) * 3.14159265));
    float lateralVeins = pow(1.0 - lateralWave, 7.0) * exp(-uCentered * 2.2) * smoothstep(0.05, 0.20, uCentered);
    float microCells = 0.5 + 0.5 * sin(vWorldPos.x * 240.0 + sin(vWorldPos.y * 190.0)) * cos(vWorldPos.y * 240.0 + vWorldPos.z * 180.0);

    float veinMask = clamp(midrib * 0.85 + lateralVeins * 0.65, 0.0, 1.0);
    float marginFactor = smoothstep(0.35, 0.95, uCentered) + smoothstep(0.65, 1.0, vUv.y) * 0.45;

    // Rich living chlorophyll gradient from deep forest core to translucent chartreuse margins
    vec3 col = mix(uDeepChlorophyll, uMidLeafColor, clamp(0.25 + 0.65 * diff + 0.12 * microCells, 0.0, 1.0));
    col = mix(col, uSubsurfaceGlow, clamp(marginFactor * 0.42 + backLight * 0.58 + fresnel * 0.45, 0.0, 0.92));
    col = mix(col, uVeinColor, veinMask * 0.58);

    // Dewy cuticle specular highlight
    vec3 H = normalize(L1 + V);
    float spec = pow(max(dot(N, H), 0.0), 28.0);
    col += vec3(0.88, 1.0, 0.84) * spec * 0.28;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const terrariumMistVertexShader = `
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    float cycle = fract(aPhase + uTime * 0.18);
    vec3 pos = position;
    pos.z += cycle * 0.16;
    pos.x += sin(uTime * 1.2 + aPhase * 12.0) * 0.015;
    pos.y += cos(uTime * 1.1 + aPhase * 9.0) * 0.015;

    vAlpha = sin(cycle * 3.14159265) * 0.72;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp((aScale * 85.0) / max(0.3, -mv.z), 2.0, 18.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const terrariumMistFragmentShader = `
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    float soft = pow(1.0 - r, 2.0);
    gl_FragColor = vec4(0.68, 0.98, 0.78, soft * vAlpha);
  }
`;

// ============================================================================
// PROCEDURAL BOTANICAL & BRYOPHYTE GEOMETRY GENERATORS
// Replaces all low-poly dodecahedron blobs with true botanical leaf blades,
// pinnate fern fronds, coiled fiddleheads, star-moss rosettes & sporophytes!
// ============================================================================

const UNIT_Z = new THREE.Vector3(0, 0, 1);
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _vec3 = new THREE.Vector3();
const _scale3 = new THREE.Vector3();

function orientGeo(geo, pos, dir, scale = [1, 1, 1], spin = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const d = _vec3.set(dir[0], dir[1], dir[2]).normalize();
  _quat.setFromUnitVectors(UNIT_Z, d);
  if (spin) _quat.multiply(new THREE.Quaternion().setFromAxisAngle(UNIT_Z, spin));
  _mat4.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), _quat, _scale3.set(scale[0], scale[1], scale[2]));
  g.applyMatrix4(_mat4);
  g.computeVertexNormals();
  return g;
}

// Creates a detailed 3D botanical leaf blade with midrib fold, serrated/undulating edge, and acuminate drip-tip
// Local coordinates: base at (0,0,0), growing along +Z (length = 1.0), width along X
function createSculptedLeafBladePrimitive(segU = 6, segV = 10, serration = 0.08, cup = 0.14, arch = 0.28) {
  const verts = [];
  const uvs = [];
  const indices = [];

  for (let j = 0; j <= segV; j++) {
    const v = j / segV; // 0 at petiole base -> 1 at leaf apex
    // Natural cordate/lanceolate leaf silhouette profile
    const widthProfile = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 - 0.18 * v);
    const serrateWave = 1.0 + serration * Math.sin(v * Math.PI * 10.0) * Math.sin(v * Math.PI);
    const halfW = 0.38 * widthProfile * serrateWave;

    // Graceful outward arch along +Y and drooping tip
    const zPos = v * (1.0 - 0.12 * v * v);
    const yArch = -arch * Math.pow(v, 1.65);

    for (let i = 0; i <= segU; i++) {
      const u = i / segU; // 0 (left margin) -> 0.5 (midrib) -> 1.0 (right margin)
      const s = (u - 0.5) * 2.0; // -1 .. +1
      const xPos = s * halfW;
      // Midrib V-fold + gentle upward marginal cupping + marginal undulation
      const midribCrease = Math.abs(s) * cup * (1.0 - 0.4 * v);
      const marginRipple = 0.022 * Math.pow(Math.abs(s), 1.5) * Math.sin(v * 14.0 + s * 2.0);
      const yPos = yArch + midribCrease + marginRipple;

      verts.push(xPos, yPos, zPos);
      uvs.push(u, v);
    }
  }

  const stride = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Creates a single Pinnate Fern Frond (arching rachis stem + 12 paired opposing leaflets tapering to apex)
function createPinnateFernFrondPrimitive(pinnaPairs = 7) {
  const parts = [];
  const leafPinna = createSculptedLeafBladePrimitive(4, 6, 0.06, 0.08, 0.16);

  // Arching central rachis stem from (0,0,0) curving outward along -Y and up along +Z
  const rachisPts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    rachisPts.push(new THREE.Vector3(
      0,
      -0.68 * Math.pow(t, 1.35),
      0.82 * Math.sin(t * Math.PI * 0.62)
    ));
  }
  const rachisCurve = new THREE.CatmullRomCurve3(rachisPts);
  parts.push(new THREE.TubeGeometry(rachisCurve, 12, 0.016, 5, false));

  // Paired lateral pinnae (leaflets) along the rachis
  for (let p = 1; p <= pinnaPairs; p++) {
    const u = 0.14 + (p / (pinnaPairs + 1)) * 0.78;
    const pt = rachisCurve.getPointAt(u);
    const tang = rachisCurve.getTangentAt(u);
    // Envelope: largest in lower-middle frond, tapering toward tip
    const pinnaScale = (0.28 + 0.12 * Math.sin(u * Math.PI)) * (1.08 - 0.58 * u);

    for (const side of [-1, 1]) {
      const dir = [
        side * 0.82,
        tang.y * 0.55 - 0.25,
        tang.z * 0.45 + 0.22
      ];
      parts.push(orientGeo(
        leafPinna,
        [pt.x + side * 0.01, pt.y, pt.z],
        dir,
        [pinnaScale * 0.85, pinnaScale, pinnaScale * 1.15],
        side * 0.35
      ));
    }
  }

  // Terminal apical leaflet at the tip of the frond
  const tipPt = rachisCurve.getPointAt(0.96);
  const tipTang = rachisCurve.getTangentAt(0.96);
  parts.push(orientGeo(leafPinna, [tipPt.x, tipPt.y, tipPt.z], [tipTang.x, tipTang.y, tipTang.z], [0.16, 0.18, 0.24], 0));

  return mergeGeometriesFast(parts);
}

// Creates a coiled young Fern Fiddlehead Crosier (koru spiral) unfurling from the center of a fern
function createFiddleheadCrosierPrimitive() {
  const pts = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (t < 0.55) {
      const u = t / 0.55;
      pts.push(new THREE.Vector3(0, -0.08 * u * u, 0.52 * u));
    } else {
      const u = (t - 0.55) / 0.45;
      const ang = u * Math.PI * 2.6;
      const r = 0.085 * (1.0 - 0.68 * u);
      pts.push(new THREE.Vector3(
        0,
        -0.08 - r * Math.sin(ang),
        0.52 + r * (1.0 - Math.cos(ang))
      ));
    }
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.018, 6, false);
}

// Creates a dense Star-Moss Gametophyte Rosette (Polytrichum / Mnium) with 6 radiating pointed micro-leaves
function createStarMossRosettePrimitive() {
  const parts = [];
  const microBlade = createSculptedLeafBladePrimitive(4, 5, 0.02, 0.18, 0.22);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const tilt = 0.45 + (k % 2) * 0.22;
    parts.push(orientGeo(
      microBlade,
      [Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.05],
      [Math.cos(a) * Math.sin(tilt), Math.sin(a) * Math.sin(tilt), Math.cos(tilt)],
      [0.42, 0.45, 0.52],
      a + Math.PI * 0.5
    ));
  }
  return mergeGeometriesFast(parts);
}

// Creates a Moss Sporophyte Stalk (slender curving seta + nodding calyptra spore capsule at tip)
function createSporophyteStalkPrimitive() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.02, -0.02, 0.45),
    new THREE.Vector3(0.05, -0.05, 0.88),
    new THREE.Vector3(0.09, -0.10, 0.96),
    new THREE.Vector3(0.12, -0.14, 0.89)
  ]);
  const stalk = new THREE.TubeGeometry(curve, 10, 0.014, 5, false);
  const capsule = orientGeo(
    new THREE.CapsuleGeometry(0.038, 0.085, 5, 8),
    [0.12, -0.14, 0.89],
    [0.35, -0.45, -0.75],
    [1, 1, 1]
  );
  return mergeGeometriesFast([stalk, capsule]);
}

// Creates a Dichotomous Thalloid Liverwort Lobe (Marchantia) with a tiny gemma cup on top
function createLiverwortThallusPrimitive() {
  const baseBlade = createSculptedLeafBladePrimitive(6, 7, 0.14, -0.08, 0.08);
  const leftFork = orientGeo(baseBlade, [-0.05, -0.12, 0.02], [-0.35, -0.88, 0.18], [0.85, 0.75, 0.65], -0.25);
  const rightFork = orientGeo(baseBlade, [0.05, -0.12, 0.02], [0.35, -0.88, 0.18], [0.85, 0.75, 0.65], 0.25);
  const gemmaCup = transformGeo(new THREE.CylinderGeometry(0.065, 0.042, 0.038, 10, 1, true), [0, -0.22, 0.07], [Math.PI / 2, 0, 0]);
  return mergeGeometriesFast([leftFork, rightFork, gemmaCup]);
}

// Shared singleton botanical primitives built once at module load
let _botanicalPrimitives = null;
function getBotanicalPrimitives() {
  if (_botanicalPrimitives) return _botanicalPrimitives;
  _botanicalPrimitives = {
    broadLeaf: createSculptedLeafBladePrimitive(6, 9, 0.07, 0.15, 0.30),
    fernFrond: createPinnateFernFrondPrimitive(7),
    fiddlehead: createFiddleheadCrosierPrimitive(),
    starRosette: createStarMossRosettePrimitive(),
    sporophyte: createSporophyteStalkPrimitive(),
    liverwort: createLiverwortThallusPrimitive()
  };
  return _botanicalPrimitives;
}

/**
 * Populates a full multi-species botanical garden cluster at `center` [x, y, z]:
 * - Sculpted multi-lobed bryophyte hummock cushion covered in Star-Moss rosettes
 * - Golden-tipped Sporophyte stalks rising from the moss
 * - Arching Pinnate Fern fronds & coiled Fiddlehead crosiers
 * - Broad-leaved Pilea/Peperomia foliage in golden-angle phyllotaxis
 * - Dichotomous Liverwort thallus mats hugging the base
 */
export function populateBotanicalGardenCluster({
  center,
  scale = 1.0,
  seed = 101,
  darkFoliageList,
  brightFoliageList,
  sporophyteList,
  includeFerns = true,
  includeBroadLeaves = true,
  mossDensity = 12,
  sporophyteCount = 5
}) {
  const prims = getBotanicalPrimitives();
  const [cx, cy, cz] = center;
  let s = seed >>> 0;
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };

  // 1. Sculpted Organic Bryophyte Cushion Base (high-subdivision undulating dome, NOT a low-poly dodecahedron!)
  const hummockGeo = new THREE.SphereGeometry(0.062 * scale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const posAttr = hummockGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const ang = Math.atan2(vz, vx);
    const lobe = 1.0 + 0.16 * Math.sin(ang * 5.0 + seed) + 0.09 * Math.cos(ang * 9.0 - seed * 1.7);
    posAttr.setXYZ(i, vx * lobe * 1.25, vy * 0.46, vz * lobe * 1.12);
  }
  hummockGeo.computeVertexNormals();
  darkFoliageList.push(transformGeo(hummockGeo, [cx, cy, cz], [Math.PI / 2, seed * 0.4, 0]));

  // 2. Dense Star-Moss Gametophyte Rosettes blanketing the cushion surface
  for (let m = 0; m < mossDensity; m++) {
    const phi = m * 2.3999632 + rand() * 0.25;
    const radFrac = Math.sqrt((m + 0.3) / mossDensity);
    const r = radFrac * 0.058 * scale;
    const mx = cx + Math.cos(phi) * r * 1.15;
    const my = cy + Math.sin(phi) * r * 1.02;
    const mz = cz + Math.cos(radFrac * Math.PI * 0.45) * 0.026 * scale;
    const dir = [
      Math.cos(phi) * radFrac * 0.55,
      Math.sin(phi) * radFrac * 0.55,
      1.0
    ];
    const rScale = (0.018 + 0.008 * rand()) * scale;
    const targetList = m % 2 === 0 ? brightFoliageList : darkFoliageList;
    targetList.push(orientGeo(prims.starRosette, [mx, my, mz], dir, [rScale, rScale, rScale], phi));
  }

  // 3. Slender Sporophyte Stalks with Nodding Spore Capsules rising from the moss cushion
  for (let sp = 0; sp < sporophyteCount; sp++) {
    const a = (sp / Math.max(1, sporophyteCount)) * Math.PI * 2 + rand() * 0.5;
    const r = (0.012 + 0.032 * rand()) * scale;
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const sz = cz + 0.018 * scale;
    const spScale = (0.042 + 0.024 * rand()) * scale;
    sporophyteList.push(orientGeo(
      prims.sporophyte,
      [sx, sy, sz],
      [(rand() - 0.5) * 0.28, (rand() - 0.5) * 0.28, 1.0],
      [spScale, spScale, spScale * 1.15],
      a
    ));
  }

  // 4. Pinnate Fern Rosette & Unfurling Fiddlehead Crosiers
  if (includeFerns) {
    const frondCount = 5 + (seed % 3);
    for (let f = 0; f < frondCount; f++) {
      const fAng = (f / frondCount) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const fScale = (0.078 + 0.032 * rand()) * scale;
      const tiltOut = 0.35 + 0.25 * (f % 2);
      const targetList = f % 2 === 0 ? brightFoliageList : darkFoliageList;
      targetList.push(orientGeo(
        prims.fernFrond,
        [cx + Math.cos(fAng) * 0.012 * scale, cy + Math.sin(fAng) * 0.012 * scale, cz + 0.016 * scale],
        [Math.cos(fAng) * tiltOut, Math.sin(fAng) * tiltOut, 1.0],
        [fScale, fScale, fScale],
        fAng + Math.PI * 0.5
      ));
    }
    // 2 Coiled Fiddlehead Crosiers in the center of the fern crown
    for (let c = 0; c < 2; c++) {
      const cAng = c * Math.PI + rand();
      const cScale = 0.055 * scale;
      brightFoliageList.push(orientGeo(
        prims.fiddlehead,
        [cx, cy, cz + 0.018 * scale],
        [Math.cos(cAng) * 0.15, Math.sin(cAng) * 0.15, 1.0],
        [cScale, cScale, cScale],
        cAng
      ));
    }
  }

  // 5. Broad-Leaved Botanical Rosette (Pilea / Peperomia) + Marchantia Liverwort Basal Lobes
  if (includeBroadLeaves) {
    const leafCount = 6 + (seed % 3);
    for (let l = 0; l < leafCount; l++) {
      const lAng = l * 2.3999632 + seed * 0.3;
      const lRad = (0.018 + 0.025 * (l / leafCount)) * scale;
      const lScale = (0.042 + 0.022 * (1.0 - l / leafCount)) * scale;
      const targetList = l % 2 === 0 ? darkFoliageList : brightFoliageList;
      targetList.push(orientGeo(
        prims.broadLeaf,
        [cx + Math.cos(lAng) * lRad, cy + Math.sin(lAng) * lRad, cz + 0.012 * scale],
        [Math.cos(lAng) * 0.72, Math.sin(lAng) * 0.72, 0.68],
        [lScale * 1.15, lScale, lScale],
        lAng + Math.PI * 0.5
      ));
    }
    // 3 Basal Dichotomous Liverwort Thallus Mats hugging the soil perimeter
    for (let lv = 0; lv < 3; lv++) {
      const lvAng = (lv / 3) * Math.PI * 2 + 0.4;
      const lvR = 0.052 * scale;
      const lvScale = 0.048 * scale;
      darkFoliageList.push(orientGeo(
        prims.liverwort,
        [cx + Math.cos(lvAng) * lvR, cy + Math.sin(lvAng) * lvR, cz + 0.005 * scale],
        [Math.cos(lvAng) * 0.25, Math.sin(lvAng) * 0.25, 0.96],
        [lvScale, lvScale, lvScale],
        lvAng + Math.PI * 0.5
      ));
    }
  }
}

/**
 * Builds a creeping botanical vine stem with alternating petiolate leaves & micro-fern shoots along a 3D spline
 */
export function populateCreepingBotanicalVine({
  points,
  stemRadius = 0.003,
  leafCount = 18,
  leafScale = 0.022,
  closed = false,
  darkFoliageList,
  brightFoliageList,
  sporophyteList,
  seed = 77
}) {
  const prims = getBotanicalPrimitives();
  const curve = new THREE.CatmullRomCurve3(points.map(p => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p))), closed);
  darkFoliageList.push(new THREE.TubeGeometry(curve, Math.max(20, leafCount * 2), stemRadius, 6, closed));

  for (let i = 0; i < leafCount; i++) {
    const u = (i + 0.5) / leafCount;
    const pt = curve.getPointAt(u);
    const tang = curve.getTangentAt(u);
    const side = i % 2 === 0 ? 1 : -1;
    // Lateral direction perpendicular to vine tangent in XY plane
    const latX = -tang.y * side;
    const latY = tang.x * side;
    const s = leafScale * (0.78 + 0.38 * Math.sin(i * 1.7 + seed));
    const targetList = i % 3 === 0 ? brightFoliageList : darkFoliageList;

    targetList.push(orientGeo(
      prims.broadLeaf,
      [pt.x + latX * stemRadius * 1.2, pt.y + latY * stemRadius * 1.2, pt.z + stemRadius * 0.5],
      [latX * 0.75 + tang.x * 0.35, latY * 0.75 + tang.y * 0.35, 0.65],
      [s * 1.1, s, s * 1.15],
      Math.atan2(latY, latX) + Math.PI * 0.5
    ));

    // Every 4th node, sprout a tiny star-moss rosette + golden sporophyte capsule!
    if (i % 4 === 0) {
      const rScale = s * 0.58;
      brightFoliageList.push(orientGeo(
        prims.starRosette,
        [pt.x, pt.y, pt.z + stemRadius],
        [latX * 0.2, latY * 0.2, 1.0],
        [rScale, rScale, rScale],
        i * 1.1
      ));
      if (sporophyteList && i % 8 === 0) {
        const spScale = s * 0.85;
        sporophyteList.push(orientGeo(
          prims.sporophyte,
          [pt.x, pt.y, pt.z + stemRadius],
          [-latX * 0.18, -latY * 0.18, 1.0],
          [spScale, spScale, spScale],
          i * 0.9
        ));
      }
    }
  }
}

export function LivingBiosphereCanopyAndVaults() {
  const archRelief = useMemo(() => getSharedArchitecturalRelief(), []);

  const myceliumVaultMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd7c8',
    roughness: 0.86,
    metalness: 0.02,
    bumpMap: archRelief,
    bumpScale: 0.018
  }), [archRelief]);

  const hyphalRibMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cdc3af',
    roughness: 0.78,
    metalness: 0.05,
    bumpMap: archRelief,
    bumpScale: 0.014
  }), [archRelief]);

  const flangeBronzeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8c7454',
    roughness: 0.34,
    metalness: 0.76,
    envMapIntensity: 0.85
  }), []);

  const darkCompositeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1d2921',
    roughness: 0.52,
    metalness: 0.22,
    bumpMap: archRelief,
    bumpScale: 0.008
  }), [archRelief]);

  const vascularGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#c2f0dc',
    opacity: 0.32,
    roughness: 0.05,
    metalness: 0.08,
    side: THREE.DoubleSide
  }), []);

  const nutrientFlowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color('#b86814') },
      uPulseColor: { value: new THREE.Color('#ffcf68') },
      uSpeed: { value: 2.4 }
    },
    vertexShader: vascularFlowVertexShader,
    fragmentShader: vascularFlowFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const sporeFlowMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color('#147045') },
      uPulseColor: { value: new THREE.Color('#6effb8') },
      uSpeed: { value: 3.1 }
    },
    vertexShader: vascularFlowVertexShader,
    fragmentShader: vascularFlowFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const floorRockMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1b231e',
    roughness: 0.88,
    metalness: 0.06,
    bumpMap: archRelief,
    bumpScale: 0.015
  }), [archRelief]);

  // Living Botanical Chlorophyll Shaders for Floor & Canopy Biophilic Flora
  const floorDarkBotanicalMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0045 },
      uDeepChlorophyll: { value: new THREE.Color('#14381c') },
      uMidLeafColor: { value: new THREE.Color('#2c6b34') },
      uSubsurfaceGlow: { value: new THREE.Color('#74d64c') },
      uVeinColor: { value: new THREE.Color('#529c44') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const floorBrightBotanicalMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0055 },
      uDeepChlorophyll: { value: new THREE.Color('#1f4f24') },
      uMidLeafColor: { value: new THREE.Color('#468e3c') },
      uSubsurfaceGlow: { value: new THREE.Color('#a4f25e') },
      uVeinColor: { value: new THREE.Color('#72c84e') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const sporophyteGoldMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d49b38',
    emissive: '#6e420c',
    emissiveIntensity: 0.35,
    roughness: 0.38,
    metalness: 0.08
  }), []);

  const batched = useMemo(() => {
    const vaultList = [];
    const ribList = [];
    const glassTubeList = [];
    const nutrientList = [];
    const sporeList = [];
    const flangeList = [];
    const darkPodList = [];
    const rockList = [];
    const darkFloraList = [];
    const brightFloraList = [];
    const sporophyteList = [];

    const addVascularConduit = (points, radius = 0.024, isSpore = false, segments = 28) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p))));
      glassTubeList.push(new THREE.TubeGeometry(curve, segments, radius, 8, false));
      const innerGeo = new THREE.TubeGeometry(curve, segments, radius * 0.70, 6, false);
      if (isSpore) sporeList.push(innerGeo);
      else nutrientList.push(innerGeo);

      for (const u of [0.0, 0.5, 1.0]) {
        const pt = curve.getPointAt(u);
        flangeList.push(transformGeo(
          new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, 0.022, 12),
          [pt.x, pt.y, pt.z],
          [Math.PI / 2, 0, 0]
        ));
      }
    };

    // 1. ENCLOSING LIVING MYCELIUM BACK WALL & CANOPY VAULT ENVELOPE
    const xSteps = 32;
    const uSteps = 20;
    const wallVerts = [];
    const wallIndices = [];

    for (let i = 0; i <= xSteps; i++) {
      const x = -2.0 + (i / xSteps) * 36.0;
      for (let j = 0; j <= uSteps; j++) {
        const u = j / uSteps;
        const y = 3.10 - 1.20 * Math.pow(u, 1.8) - 1.40 * Math.pow(u, 3.2);
        const z = 0.0 + 5.40 * Math.sin(u * Math.PI * 0.5);
        const flute = 0.045 * Math.sin(x * 1.8) * Math.sin(u * Math.PI) + 0.015 * Math.cos(x * 5.2 + u * 8.0);
        wallVerts.push(x, y + flute, z);
      }
    }

    const stride = uSteps + 1;
    for (let i = 0; i < xSteps; i++) {
      for (let j = 0; j < uSteps; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        wallIndices.push(a, b, d, b, c, d);
      }
    }

    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();
    vaultList.push(wallGeo);

    // 2. AKIŞKAN ORGANİK KEMİKSİ / HİFSEL SÜTUNLAR, KÖK PAYANDALARI & EPİFİT BİTKİ SARMAŞIKLARI
    const xColumns = [-0.5, 3.2, 6.4, 9.8, 13.6, 17.8, 22.4, 27.6, 32.5];

    for (let cIdx = 0; cIdx < xColumns.length; cIdx++) {
      const xCol = xColumns[cIdx];
      const archPoints = [
        new THREE.Vector3(xCol, 2.95, 0.0),
        new THREE.Vector3(xCol, 2.75, 0.9),
        new THREE.Vector3(xCol, 2.50, 2.0),
        new THREE.Vector3(xCol, 2.15, 3.2),
        new THREE.Vector3(xCol, 1.65, 4.3),
        new THREE.Vector3(xCol, 1.05, 4.95),
        new THREE.Vector3(xCol, 0.35, 5.25)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints), 36, 0.078, 10, false));
      ribList.push(transformGeo(new THREE.CylinderGeometry(0.24, 0.42, 0.14, 12), [xCol, 2.95, 0.07], [Math.PI / 2, 0, 0]));

      for (const dir of [-1, 1]) {
        const rootCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(xCol, 2.85, 0.38),
          new THREE.Vector3(xCol + dir * 0.35, 2.35, 0.14),
          new THREE.Vector3(xCol + dir * 0.65, 1.65, 0.04)
        ]);
        ribList.push(new THREE.TubeGeometry(rootCurve, 14, 0.032, 6, false));
      }

      // Climbing Epiphytic Botanical Vine spiralling up the lower column rib!
      populateCreepingBotanicalVine({
        points: [
          [xCol + 0.08, 2.85, 0.18],
          [xCol - 0.09, 2.72, 0.85],
          [xCol + 0.09, 2.52, 1.65],
          [xCol - 0.07, 2.30, 2.45]
        ],
        stemRadius: 0.008,
        leafCount: 16,
        leafScale: 0.075,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        seed: 300 + cIdx * 19
      });

      const branchPoints = [
        new THREE.Vector3(xCol, 2.15, 3.2),
        new THREE.Vector3(xCol, 1.70, 4.1),
        new THREE.Vector3(xCol, 1.15, 4.7),
        new THREE.Vector3(xCol, 0.50, 4.95)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPoints), 22, 0.048, 8, false));

      const transversePoints = [
        new THREE.Vector3(xCol, 2.50, 2.0),
        new THREE.Vector3(xCol + 0.35, 2.25, 2.5),
        new THREE.Vector3(xCol, 2.00, 3.3)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(transversePoints), 14, 0.035, 6, false));
    }

    for (let k = 0; k < xColumns.length - 1; k++) {
      const xA = xColumns[k];
      const xB = xColumns[k + 1];
      const xMid = (xA + xB) * 0.5;

      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 1.05, 4.95),
        new THREE.Vector3(xMid, 0.90, 5.10),
        new THREE.Vector3(xB, 1.05, 4.95)
      ]), 16, 0.040, 6, false));

      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 2.15, 3.2),
        new THREE.Vector3(xMid, 2.28, 3.35),
        new THREE.Vector3(xB, 2.15, 3.2)
      ]), 16, 0.035, 6, false));

      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 2.50, 2.0),
        new THREE.Vector3(xMid, 1.85, 3.6),
        new THREE.Vector3(xB, 1.05, 4.95)
      ]), 18, 0.022, 6, false));
    }

    // 3. ANA VASKÜLER DOLAŞIM DAMARLARI
    const nutrientSplinePoints = [];
    const sporeSplinePoints = [];
    const numPoints = 32;

    for (let i = 0; i <= numPoints; i++) {
      const u = i / numPoints;
      const x = -0.5 + u * 34.0;
      const yNutrient = 1.65 + 0.22 * Math.sin(x * 0.42) + 0.06 * Math.cos(x * 0.85);
      const zNutrient = 4.05 + 0.20 * Math.cos(x * 0.38) - 0.05 * Math.sin(x * 0.72);
      nutrientSplinePoints.push(new THREE.Vector3(x, yNutrient, zNutrient));

      const ySpore = 1.95 - 0.20 * Math.sin(x * 0.42) + 0.08 * Math.sin(x * 0.65);
      const zSpore = 3.75 - 0.18 * Math.cos(x * 0.38) + 0.06 * Math.sin(x * 0.92);
      sporeSplinePoints.push(new THREE.Vector3(x, ySpore, zSpore));
    }

    const nutrientCurve = new THREE.CatmullRomCurve3(nutrientSplinePoints);
    const sporeCurve = new THREE.CatmullRomCurve3(sporeSplinePoints);

    glassTubeList.push(new THREE.TubeGeometry(nutrientCurve, 140, 0.048, 10, false));
    glassTubeList.push(new THREE.TubeGeometry(sporeCurve, 140, 0.040, 10, false));
    nutrientList.push(new THREE.TubeGeometry(nutrientCurve, 140, 0.035, 8, false));
    sporeList.push(new THREE.TubeGeometry(sporeCurve, 140, 0.028, 8, false));

    for (let u = 0.04; u <= 0.96; u += 0.075) {
      const pN = nutrientCurve.getPointAt(u);
      const pS = sporeCurve.getPointAt(u);
      flangeList.push(transformGeo(new THREE.TorusGeometry(0.052, 0.008, 6, 14), [pN.x, pN.y, pN.z], [0, Math.PI / 2, 0]));
      flangeList.push(transformGeo(new THREE.TorusGeometry(0.044, 0.007, 6, 14), [pS.x, pS.y, pS.z], [0, Math.PI / 2, 0]));
    }

    // 4. İSTASYONLAR ARASI FİZİKSEL BAĞLANTI KÖPRÜLERİ
    addVascularConduit([
      [1.25, 0.18, 2.21],
      [1.85, 0.25, 1.85],
      [2.65, 0.15, 1.48],
      [3.58, -0.22, 1.26]
    ], 0.018, true, 24);

    addVascularConduit([
      [1.25, -0.18, 0.58],
      [2.05, -0.28, 0.72],
      [2.85, -0.32, 0.98],
      [3.58, -0.36, 1.25]
    ], 0.020, false, 24);

    darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.11, 16), [3.58, -0.29, 1.28], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 12), [3.58, -0.29, 1.32], [Math.PI / 2, 0, 0]));
    addVascularConduit([
      [3.64, -0.26, 1.26],
      [3.98, -0.22, 1.25],
      [4.32, -0.16, 1.26]
    ], 0.010, true, 16);

    // Inline Peristaltic Buffer Station & Botanical Garden between Bench B and Bench C (x = 6.22)
    const hubX = 6.22, hubY = -0.12;
    darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.18, 0.26, 1.18, 18), [hubX, hubY, 0.59], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 18), [hubX, hubY, 1.20], [Math.PI / 2, 0, 0]));
    glassTubeList.push(transformGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 20), [hubX, hubY, 1.36], [Math.PI / 2, 0, 0]));
    sporeList.push(transformGeo(new THREE.CylinderGeometry(0.105, 0.105, 0.22, 16), [hubX, hubY, 1.34], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 18), [hubX, hubY, 1.51], [Math.PI / 2, 0, 0]));

    // Lush Botanical Fern & Moss Collar crowning the Inter-Bench Buffer Pedestal!
    populateBotanicalGardenCluster({
      center: [hubX - 0.16, hubY - 0.14, 1.21],
      scale: 1.15,
      seed: 622,
      darkFoliageList: darkFloraList,
      brightFoliageList: brightFloraList,
      sporophyteList,
      includeFerns: true,
      includeBroadLeaves: true,
      mossDensity: 14,
      sporophyteCount: 6
    });

    for (const dir of [-1, 1]) {
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(hubX, hubY, 1.15),
        new THREE.Vector3(hubX + dir * 0.45, hubY + 0.08, 0.65),
        new THREE.Vector3(hubX + dir * 0.78, hubY + 0.12, 0.12)
      ]), 14, 0.028, 6, false));
    }

    addVascularConduit([
      [4.48, -0.15, 1.26],
      [4.95, -0.18, 1.25],
      [5.55, -0.15, 1.28],
      [hubX - 0.12, hubY, 1.36]
    ], 0.016, true, 24);
    addVascularConduit([
      [hubX + 0.12, hubY, 1.36],
      [6.75, -0.16, 1.28],
      [7.35, -0.20, 1.24],
      [7.98, -0.20, 1.26]
    ], 0.016, false, 24);

    addVascularConduit([
      [8.14, -0.20, 1.26],
      [8.82, -0.12, 1.25],
      [9.35, 0.08, 1.48],
      [9.88, 0.25, 1.72]
    ], 0.018, true, 24);

    addVascularConduit([
      [9.88, 0.25, 1.74],
      [10.42, 0.25, 2.02],
      [10.95, 0.25, 2.16]
    ], 0.020, false, 20);
    addVascularConduit([
      [10.95, 0.25, 2.18],
      [11.55, 0.25, 2.48],
      [12.15, 0.25, 2.62]
    ], 0.022, true, 20);

    addVascularConduit([
      [12.15, 0.25, 2.64],
      [12.95, 0.18, 2.52],
      [13.72, 0.05, 2.32]
    ], 0.024, false, 20);

    addVascularConduit([
      [16.92, 0.15, 2.30],
      [17.95, 0.22, 2.65],
      [19.20, 0.18, 2.85],
      [20.65, 0.18, 2.85],
      [22.10, 0.15, 2.65],
      [23.85, 0.08, 2.45],
      [24.55, 0.0, 2.35]
    ], 0.028, true, 36);

    addVascularConduit([
      nutrientCurve.getPointAt((25.0 + 0.5) / 34.0),
      [24.5, 0.8, 3.8],
      [24.7, 0.2, 3.65],
      [25.0, 0.0, 3.52]
    ], 0.036, false, 24);

    addVascularConduit([
      [25.52, -0.25, 1.35],
      [26.85, -0.32, 1.12],
      [28.25, -0.28, 1.08],
      [29.55, -0.18, 1.18]
    ], 0.024, true, 28);

    // 5. ZEMİN ALTI REZERVUAR PODLARI & YÜKSEK DETAYLI BİYOFİLİK KAYA-EĞRELTİ BAHÇELERİ
    const floorSpinePts = [];
    for (let i = 0; i <= 24; i++) {
      const fx = 0.8 + (i / 24) * 29.4;
      const fy = -0.58 + 0.12 * Math.sin(fx * 0.55);
      floorSpinePts.push(new THREE.Vector3(fx, fy, 0.12));
    }
    addVascularConduit(floorSpinePts, 0.032, false, 72);

    const sumpLocations = [
      { x: 2.65, y: -0.45 },
      { x: 6.22, y: -0.52 },
      { x: 9.25, y: -0.42 },
      { x: 12.85, y: -0.48 },
      { x: 17.45, y: -0.45 },
      { x: 22.35, y: -0.48 },
      { x: 27.85, y: -0.45 }
    ];
    for (let sIdx = 0; sIdx < sumpLocations.length; sIdx++) {
      const s = sumpLocations[sIdx];
      darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 16), [s.x, s.y, 0.04], [Math.PI / 2, 0, 0]));
      glassTubeList.push(transformGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 16), [s.x, s.y, 0.22], [Math.PI / 2, 0, 0]));
      nutrientList.push(transformGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 14), [s.x, s.y, 0.20], [Math.PI / 2, 0, 0]));
      flangeList.push(transformGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 16), [s.x, s.y, 0.37], [Math.PI / 2, 0, 0]));

      // Companion fern & star-moss cluster hugging the base of each sub-bench nutrient reservoir pod!
      populateBotanicalGardenCluster({
        center: [s.x + 0.22, s.y - 0.12, 0.03],
        scale: 1.55,
        seed: 800 + sIdx * 37,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: true,
        includeBroadLeaves: true,
        mossDensity: 12,
        sporophyteCount: 5
      });
    }

    // Sculpted Volcanic Basalt Boulders & Lush Multi-Species Floor Botanical Sanctuary Pockets
    const rockA = new THREE.IcosahedronGeometry(0.28, 2);
    const biophilicPockets = [
      { x: 0.35, y: -2.15, z: 0.04, s: 1.25 },
      { x: 3.10, y: -1.85, z: 0.04, s: 1.10 },
      { x: 5.85, y: -2.45, z: 0.04, s: 1.05 },
      { x: 9.40, y: -1.95, z: 0.04, s: 1.15 },
      { x: 13.05, y: -2.10, z: 0.04, s: 1.20 },
      { x: 17.85, y: -2.15, z: 0.04, s: 1.30 },
      { x: 22.15, y: -2.20, z: 0.04, s: 1.20 },
      { x: 27.55, y: -2.30, z: 0.04, s: 1.25 }
    ];
    biophilicPockets.forEach((p, idx) => {
      rockList.push(transformGeo(rockA, [p.x, p.y, p.z + 0.05 * p.s], [0.2, idx * 0.8, 0.1], [1.35 * p.s, 0.95 * p.s, 0.52 * p.s]));
      // Populate rich botanical fern, broad-leaf, star-moss & sporophyte clusters over & around each floor boulder!
      populateBotanicalGardenCluster({
        center: [p.x - 0.08 * p.s, p.y + 0.05 * p.s, p.z + 0.14 * p.s],
        scale: 3.2 * p.s,
        seed: 500 + idx * 43,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: true,
        includeBroadLeaves: true,
        mossDensity: 18,
        sporophyteCount: 8
      });
    });

    return {
      vaultGeo: mergeGeometriesFast(vaultList),
      ribGeo: mergeGeometriesFast(ribList),
      glassTubeGeo: mergeGeometriesFast(glassTubeList),
      nutrientGeo: mergeGeometriesFast(nutrientList),
      sporeGeo: mergeGeometriesFast(sporeList),
      flangeGeo: mergeGeometriesFast(flangeList),
      darkPodGeo: mergeGeometriesFast(darkPodList),
      rockGeo: mergeGeometriesFast(rockList),
      darkFloraGeo: mergeGeometriesFast(darkFloraList),
      brightFloraGeo: mergeGeometriesFast(brightFloraList),
      sporophyteGeo: mergeGeometriesFast(sporophyteList)
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    nutrientFlowMat.uniforms.uTime.value = t;
    sporeFlowMat.uniforms.uTime.value = t;
    floorDarkBotanicalMat.uniforms.uTime.value = t;
    floorBrightBotanicalMat.uniforms.uTime.value = t;
  });

  return (
    <group name="LIVING_BIOSPHERE_CANOPY_AND_VAULTS">
      <mesh geometry={batched.vaultGeo} material={myceliumVaultMat} />
      <mesh geometry={batched.ribGeo} material={hyphalRibMat} />
      <mesh geometry={batched.flangeGeo} material={flangeBronzeMat} />
      <mesh geometry={batched.darkPodGeo} material={darkCompositeMat} />
      <mesh geometry={batched.glassTubeGeo} material={vascularGlassMat} />
      <mesh geometry={batched.nutrientGeo} material={nutrientFlowMat} />
      <mesh geometry={batched.sporeGeo} material={sporeFlowMat} />
      <mesh geometry={batched.rockGeo} material={floorRockMat} />
      <mesh geometry={batched.darkFloraGeo} material={floorDarkBotanicalMat} />
      <mesh geometry={batched.brightFloraGeo} material={floorBrightBotanicalMat} />
      <mesh geometry={batched.sporophyteGeo} material={sporophyteGoldMat} />
    </group>
  );
}

/**
 * 2. BİYOLOJİK MİKRO-PEYZAJ / TERRARIUM YATAĞI (Zone B & C çevresi)
 *
 * Replaces every single low-poly green dodecahedron with:
 * - Intricate creeping botanical vines with veined leaves encircling the Petri dishes
 * - Star-Moss gametophyte rosettes & golden sporophyte capsule stalks
 * - Miniature pinnate ferns, unfurling fiddlehead crosiers & dichotomous Marchantia liverworts
 * - Living Chlorophyll Subsurface & Venation Shaders with gentle laminar breeze sway!
 */
export function BiologicalMicroLandscape() {
  const archRelief = useMemo(() => getSharedArchitecturalRelief(), []);
  const armBRef = useRef();
  const armCRef = useRef();

  const basinStoneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#28382c',
    roughness: 0.78,
    metalness: 0.08,
    bumpMap: archRelief,
    bumpScale: 0.012
  }), [archRelief]);

  const richSoilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#18241a',
    roughness: 0.92,
    metalness: 0.02,
    bumpMap: archRelief,
    bumpScale: 0.018
  }), [archRelief]);

  // High-detail Living Chlorophyll & Leaf-Venation Shaders for Terrarium Flora
  const terrariumDarkFloraMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0018 },
      uDeepChlorophyll: { value: new THREE.Color('#143c1d') },
      uMidLeafColor: { value: new THREE.Color('#2e7437') },
      uSubsurfaceGlow: { value: new THREE.Color('#7ae252') },
      uVeinColor: { value: new THREE.Color('#58ad46') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const terrariumBrightFloraMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0024 },
      uDeepChlorophyll: { value: new THREE.Color('#225626') },
      uMidLeafColor: { value: new THREE.Color('#4c983e') },
      uSubsurfaceGlow: { value: new THREE.Color('#aff864') },
      uVeinColor: { value: new THREE.Color('#7cd452') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const sporophyteGoldMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e0a63a',
    emissive: '#7a480e',
    emissiveIntensity: 0.42,
    roughness: 0.34,
    metalness: 0.10
  }), []);

  const riverPebbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2c372f',
    roughness: 0.32,
    metalness: 0.16,
    bumpMap: archRelief,
    bumpScale: 0.006
  }), [archRelief]);

  const brassArmMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a89064',
    roughness: 0.28,
    metalness: 0.78
  }), []);

  const laserTipMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#7dffbe',
    emissive: '#28d882',
    emissiveIntensity: 1.4,
    roughness: 0.15,
    transparent: true,
    opacity: 0.88
  }), []);

  const mistMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: terrariumMistVertexShader,
    fragmentShader: terrariumMistFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), []);

  const batched = useMemo(() => {
    const rimList = [];
    const soilList = [];
    const darkFloraList = [];
    const brightFloraList = [];
    const sporophyteList = [];
    const pebbleList = [];

    // =========================================================================
    // 1. INTIMATE BOTANICAL WREATH HUGGING ZONE B PETRI DISH ([4.40, -0.15, 1.29])
    // Visible in close-up macro view (stage02_petri & stage03_germination)!
    // =========================================================================
    const petriSoilPlate = new THREE.CylinderGeometry(0.068, 0.078, 0.016, 36);
    soilList.push(transformGeo(petriSoilPlate, [4.40, -0.15, 1.254], [Math.PI / 2, 0, 0]));

    // Creeping Leafy Botanical Vine encircling the Petri dish collar
    const petriBWreathPts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 0.054 + 0.004 * Math.sin(i * 3.0);
      petriBWreathPts.push(new THREE.Vector3(4.40 + Math.cos(a) * r, -0.15 + Math.sin(a) * r, 1.264 + 0.002 * Math.cos(i * 2.0)));
    }
    populateCreepingBotanicalVine({
      points: petriBWreathPts,
      stemRadius: 0.0018,
      leafCount: 28,
      leafScale: 0.014,
      closed: true,
      darkFoliageList: darkFloraList,
      brightFoliageList: brightFloraList,
      sporophyteList,
      seed: 102
    });

    // 12 Miniature Botanical Bryophyte, Fern & Sporophyte Clusters around the Petri B perimeter
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.12;
      const r = 0.055 + 0.007 * (i % 2);
      populateBotanicalGardenCluster({
        center: [4.40 + Math.cos(a) * r, -0.15 + Math.sin(a) * r, 1.262],
        scale: 0.22 + 0.05 * (i % 3),
        seed: 200 + i * 17,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: i % 2 === 0,
        includeBroadLeaves: true,
        mossDensity: 8,
        sporophyteCount: 3
      });
    }

    // Smooth wet river pebbles tucked among the micro-ferns and moss rosettes
    const microPebbleGeo = new THREE.IcosahedronGeometry(0.0055, 2);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.20;
      const r = 0.058 + 0.005 * (k % 2);
      pebbleList.push(transformGeo(
        microPebbleGeo,
        [4.40 + Math.cos(a) * r, -0.15 + Math.sin(a) * r, 1.263],
        [0.2, k * 1.1, 0.1],
        [1.25, 0.90, 0.55]
      ));
    }

    // =========================================================================
    // 2. WIDE TERRARIUM SANCTUARY AROUND ZONE B (Bench Top z = 1.225)
    // =========================================================================
    const zB = 1.228;
    const rimCurve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.55, -0.62, zB + 0.015),
      new THREE.Vector3(4.40, -0.72, zB + 0.015),
      new THREE.Vector3(5.25, -0.62, zB + 0.015),
      new THREE.Vector3(5.35, 0.28, zB + 0.015),
      new THREE.Vector3(4.40, 0.38, zB + 0.015),
      new THREE.Vector3(3.45, 0.28, zB + 0.015)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve1, 42, 0.018, 10, true));

    // Creeping Botanical Vine trailing along the Zone B Terrarium retaining rim
    populateCreepingBotanicalVine({
      points: [
        [3.52, -0.58, zB + 0.028],
        [3.95, -0.68, zB + 0.028],
        [4.85, -0.68, zB + 0.028],
        [5.28, -0.55, zB + 0.028],
        [5.32, 0.18, zB + 0.028]
      ],
      stemRadius: 0.004,
      leafCount: 26,
      leafScale: 0.036,
      closed: false,
      darkFoliageList: darkFloraList,
      brightFoliageList: brightFloraList,
      sporophyteList,
      seed: 305
    });

    const soilGeo1 = new THREE.CylinderGeometry(0.78, 0.82, 0.018, 36);
    soilList.push(transformGeo(soilGeo1, [4.4, -0.15, zB + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    // 8 Lush Multi-Species Botanical Clusters (Pinnate Ferns, Fiddleheads, Pilea Rosettes & Star-Moss) around Zone B
    const gardenBLocations = [
      { x: 3.75, y: -0.46, z: zB + 0.016, s: 1.25 },
      { x: 5.05, y: -0.48, z: zB + 0.016, s: 1.20 },
      { x: 3.65, y: -0.12, z: zB + 0.016, s: 1.15 },
      { x: 5.15, y: -0.10, z: zB + 0.016, s: 1.18 },
      { x: 3.70, y: 0.14, z: zB + 0.016, s: 1.10 },
      { x: 5.10, y: 0.16, z: zB + 0.016, s: 1.12 },
      { x: 4.08, y: 0.22, z: zB + 0.016, s: 1.05 },
      { x: 4.72, y: 0.22, z: zB + 0.016, s: 1.08 }
    ];
    gardenBLocations.forEach((g, idx) => {
      populateBotanicalGardenCluster({
        center: [g.x, g.y, g.z],
        scale: g.s,
        seed: 400 + idx * 29,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: true,
        includeBroadLeaves: true,
        mossDensity: 14,
        sporophyteCount: 6
      });
    });

    const pebbleGeo = new THREE.IcosahedronGeometry(0.036, 2);
    const pebbleBLocations = [
      { x: 3.95, y: -0.55, z: zB + 0.018, s: 0.9 },
      { x: 4.85, y: -0.58, z: zB + 0.018, s: 1.0 },
      { x: 3.55, y: 0.12, z: zB + 0.018, s: 1.1 },
      { x: 5.20, y: 0.18, z: zB + 0.018, s: 0.95 }
    ];
    pebbleBLocations.forEach((p, idx) => {
      pebbleList.push(transformGeo(pebbleGeo, [p.x, p.y, p.z], [0.3, idx * 0.9, 0.2], [1.2 * p.s, 0.85 * p.s, 0.50 * p.s]));
    });

    // =========================================================================
    // 3. INTIMATE BOTANICAL WREATH & TERRARIUM BASIN 2: ZONE C ([8.06, -0.20, 1.208])
    // =========================================================================
    const zC = 1.208;
    const isolSoilPlate = new THREE.CylinderGeometry(0.088, 0.096, 0.016, 36);
    soilList.push(transformGeo(isolSoilPlate, [8.06, -0.20, zC + 0.046], [Math.PI / 2, 0, 0]));

    // Creeping Leafy Botanical Vine encircling the Zone C Isolation Petri Dish
    const petriCWreathPts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 0.076 + 0.005 * Math.sin(i * 3.0);
      petriCWreathPts.push(new THREE.Vector3(8.06 + Math.cos(a) * r, -0.20 + Math.sin(a) * r, zC + 0.056));
    }
    populateCreepingBotanicalVine({
      points: petriCWreathPts,
      stemRadius: 0.0020,
      leafCount: 32,
      leafScale: 0.016,
      closed: true,
      darkFoliageList: darkFloraList,
      brightFoliageList: brightFloraList,
      sporophyteList,
      seed: 512
    });

    // 14 Miniature Botanical Bryophyte, Fern & Sporophyte Clusters around the Zone C Isolation Dish
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.08;
      const r = 0.078 + 0.008 * (i % 2);
      populateBotanicalGardenCluster({
        center: [8.06 + Math.cos(a) * r, -0.20 + Math.sin(a) * r, zC + 0.054],
        scale: 0.25 + 0.05 * (i % 3),
        seed: 600 + i * 23,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: i % 2 === 0,
        includeBroadLeaves: true,
        mossDensity: 9,
        sporophyteCount: 4
      });
    }

    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.15;
      const r = 0.084 + 0.006 * (k % 2);
      pebbleList.push(transformGeo(
        microPebbleGeo,
        [8.06 + Math.cos(a) * r, -0.20 + Math.sin(a) * r, zC + 0.055],
        [0.2, k * 1.1, 0.1],
        [1.2, 0.9, 0.55]
      ));
    }

    const rimCurve2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(7.20, -0.65, zC + 0.015),
      new THREE.Vector3(8.06, -0.75, zC + 0.015),
      new THREE.Vector3(8.92, -0.65, zC + 0.015),
      new THREE.Vector3(9.02, 0.28, zC + 0.015),
      new THREE.Vector3(8.06, 0.38, zC + 0.015),
      new THREE.Vector3(7.10, 0.26, zC + 0.015)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve2, 42, 0.018, 10, true));

    populateCreepingBotanicalVine({
      points: [
        [7.18, -0.60, zC + 0.028],
        [7.65, -0.72, zC + 0.028],
        [8.48, -0.72, zC + 0.028],
        [8.95, -0.58, zC + 0.028],
        [8.98, 0.18, zC + 0.028]
      ],
      stemRadius: 0.004,
      leafCount: 26,
      leafScale: 0.036,
      closed: false,
      darkFoliageList: darkFloraList,
      brightFoliageList: brightFloraList,
      sporophyteList,
      seed: 709
    });

    const soilGeo2 = new THREE.CylinderGeometry(0.80, 0.84, 0.018, 36);
    soilList.push(transformGeo(soilGeo2, [8.06, -0.20, zC + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    const gardenCLocations = [
      { x: 7.35, y: -0.48, z: zC + 0.016, s: 1.22 },
      { x: 8.75, y: -0.50, z: zC + 0.016, s: 1.25 },
      { x: 7.25, y: -0.15, z: zC + 0.016, s: 1.15 },
      { x: 8.85, y: -0.12, z: zC + 0.016, s: 1.18 },
      { x: 7.45, y: 0.20, z: zC + 0.016, s: 1.15 },
      { x: 8.68, y: 0.22, z: zC + 0.016, s: 1.15 },
      { x: 7.82, y: 0.25, z: zC + 0.016, s: 1.08 },
      { x: 8.32, y: 0.24, z: zC + 0.016, s: 1.10 }
    ];
    gardenCLocations.forEach((g, idx) => {
      populateBotanicalGardenCluster({
        center: [g.x, g.y, g.z],
        scale: g.s,
        seed: 750 + idx * 31,
        darkFoliageList: darkFloraList,
        brightFoliageList: brightFloraList,
        sporophyteList,
        includeFerns: true,
        includeBroadLeaves: true,
        mossDensity: 14,
        sporophyteCount: 6
      });
    });

    // Articulated Micro-Inoculation & Optical Scanning Arm Geometry
    const armGeo = mergeGeometriesFast([
      transformGeo(new THREE.CylinderGeometry(0.016, 0.020, 0.08, 12), [0, 0, 0.04], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(0.018, 12, 10), [0, 0, 0.085]),
      transformGeo(new THREE.CylinderGeometry(0.007, 0.009, 0.16, 10), [-0.055, -0.045, 0.11], [0.4, -0.6, 0.5]),
      transformGeo(new THREE.CylinderGeometry(0.005, 0.002, 0.045, 10), [-0.105, -0.085, 0.085], [Math.PI / 2, 0, 0])
    ]);
    const dropletTipGeo = transformGeo(new THREE.SphereGeometry(0.0055, 10, 8), [-0.105, -0.085, 0.060]);

    // Rising Spore & Humidity Micro-Mist Particle Cloud over Zone B & Zone C Terrariums
    const mistCount = 64;
    const mistPos = new Float32Array(mistCount * 3);
    const mistPhase = new Float32Array(mistCount);
    const mistScale = new Float32Array(mistCount);
    for (let i = 0; i < mistCount; i++) {
      const isZoneC = i >= 32;
      const cx = isZoneC ? 8.06 : 4.40;
      const cy = isZoneC ? -0.20 : -0.15;
      const cz = isZoneC ? 1.25 : 1.26;
      const ang = (i * 2.39996) % (Math.PI * 2);
      const rad = 0.05 + ((i * 0.3183) % 1) * 0.62;
      mistPos[i * 3] = cx + Math.cos(ang) * rad;
      mistPos[i * 3 + 1] = cy + Math.sin(ang) * rad * 0.72;
      mistPos[i * 3 + 2] = cz;
      mistPhase[i] = (i / mistCount);
      mistScale[i] = 0.12 + (i % 5) * 0.04;
    }

    return {
      rimGeo: mergeGeometriesFast(rimList),
      soilGeo: mergeGeometriesFast(soilList),
      darkFloraGeo: mergeGeometriesFast(darkFloraList),
      brightFloraGeo: mergeGeometriesFast(brightFloraList),
      sporophyteGeo: mergeGeometriesFast(sporophyteList),
      pebbleGeo: mergeGeometriesFast(pebbleList),
      armGeo,
      dropletTipGeo,
      mist: { mistPos, mistPhase, mistScale }
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    mistMat.uniforms.uTime.value = t;
    terrariumDarkFloraMat.uniforms.uTime.value = t;
    terrariumBrightFloraMat.uniforms.uTime.value = t;
    if (armBRef.current) {
      armBRef.current.rotation.z = Math.sin(t * 1.4) * 0.22;
      armBRef.current.position.z = 1.245 + Math.sin(t * 2.8) * 0.006;
    }
    if (armCRef.current) {
      armCRef.current.rotation.z = Math.cos(t * 1.2) * 0.26;
      armCRef.current.position.z = 1.235 + Math.cos(t * 2.4) * 0.006;
    }
  });

  return (
    <group name="BIOLOGICAL_MICRO_LANDSCAPE_TERRARIUM">
      <mesh geometry={batched.rimGeo} material={basinStoneMat} />
      <mesh geometry={batched.soilGeo} material={richSoilMat} />
      <mesh geometry={batched.darkFloraGeo} material={terrariumDarkFloraMat} />
      <mesh geometry={batched.brightFloraGeo} material={terrariumBrightFloraMat} />
      <mesh geometry={batched.sporophyteGeo} material={sporophyteGoldMat} />
      <mesh geometry={batched.pebbleGeo} material={riverPebbleMat} />

      {/* Kinetic Articulated Micro-Inoculation & Optical Sensor Arm tending Zone B Petri Dish */}
      <group ref={armBRef} position={[4.54, -0.04, 1.245]}>
        <mesh geometry={batched.armGeo} material={brassArmMat} />
        <mesh geometry={batched.dropletTipGeo} material={laserTipMat} />
      </group>

      {/* Kinetic Articulated Colony-Isolation Picker Arm tending Zone C Petri Dish */}
      <group ref={armCRef} position={[8.22, -0.08, 1.235]}>
        <mesh geometry={batched.armGeo} material={brassArmMat} />
        <mesh geometry={batched.dropletTipGeo} material={laserTipMat} />
      </group>

      {/* Rising Bioluminescent Spore & Humidity Micro-Mist */}
      <points material={mistMat} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[batched.mist.mistPos, 3]} />
          <bufferAttribute attach="attributes-aPhase" args={[batched.mist.mistPhase, 1]} />
          <bufferAttribute attach="attributes-aScale" args={[batched.mist.mistScale, 1]} />
        </bufferGeometry>
      </points>
    </group>
  );
}

/**
 * 3. ASKIDA DAMLA REAKTÖRLERİ / LEVİTE KAPSÜLLER (Zone D & E çevresi)
 *
 * Includes living epiphytic botanical fern & vine crowns growing around the top bio-collars!
 */
const DROPLET_SPECS = [
  { x: 10.35, y: 0.15, z: 2.35, scale: 1.15, targetDown: [9.88, 0.25, 1.72] },
  { x: 11.85, y: 0.45, z: 2.58, scale: 1.25, targetDown: [10.95, 0.25, 2.14] },
  { x: 13.45, y: 0.25, z: 2.42, scale: 1.18, targetDown: [12.15, 0.25, 2.58] },
  { x: 15.05, y: 0.50, z: 2.62, scale: 1.28, targetDown: [14.52, 0.26, 2.24] },
  { x: 16.45, y: 0.20, z: 2.45, scale: 1.15, targetDown: [16.92, 0.26, 2.24] }
];

export function SuspendedDropletReactors({ progressRef }) {
  const groupRef = useRef();
  const coreRefs = useRef([]);
  const liquidRefs = useRef([]);

  const capsuleGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#d6f6e8',
    opacity: 0.35,
    roughness: 0.05,
    metalness: 0.06,
    side: THREE.DoubleSide
  }), []);

  const capsuleCoreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5ecd6',
    emissive: '#b8741e',
    emissiveIntensity: 0.58,
    roughness: 0.50,
    metalness: 0.02
  }), []);

  const capsuleLiquidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f09e32',
    emissive: '#b0580e',
    emissiveIntensity: 0.72,
    roughness: 0.16,
    metalness: 0.08,
    transparent: true,
    opacity: 0.85
  }), []);

  const capsuleCollarMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a8926a',
    roughness: 0.38,
    metalness: 0.65
  }), []);

  const tendrilCableMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#464a44',
    roughness: 0.75,
    metalness: 0.20
  }), []);

  const epiphyteFloraMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0038 },
      uDeepChlorophyll: { value: new THREE.Color('#194620') },
      uMidLeafColor: { value: new THREE.Color('#3b8438') },
      uSubsurfaceGlow: { value: new THREE.Color('#96f05a') },
      uVeinColor: { value: new THREE.Color('#68be4a') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const batched = useMemo(() => {
    const glassList = [];
    const collarList = [];
    const cableList = [];
    const epiphyteList = [];

    for (let idx = 0; idx < DROPLET_SPECS.length; idx++) {
      const d = DROPLET_SPECS[idx];
      const s = d.scale;
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.18 * s, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
        [d.x, d.y, d.z + 0.06 * s]
      ));
      glassList.push(transformGeo(
        new THREE.CylinderGeometry(0.18 * s, 0.035 * s, 0.36 * s, 24, 1, true),
        [d.x, d.y, d.z - 0.12 * s],
        [Math.PI / 2, 0, 0]
      ));
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.035 * s, 16, 10),
        [d.x, d.y, d.z - 0.30 * s]
      ));

      collarList.push(transformGeo(new THREE.TorusGeometry(0.182 * s, 0.012 * s, 8, 28), [d.x, d.y, d.z + 0.06 * s]));
      collarList.push(transformGeo(new THREE.TorusGeometry(0.065 * s, 0.010 * s, 8, 20), [d.x, d.y, d.z + 0.24 * s]));
      collarList.push(transformGeo(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.04 * s, 12), [d.x, d.y, d.z - 0.32 * s], [Math.PI / 2, 0, 0]));

      // Epiphytic Botanical Vine & Micro-Ferns crowning the equator bio-collar of each Droplet Reactor!
      const ringPts = [];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 0.186 * s;
        ringPts.push(new THREE.Vector3(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r, d.z + 0.065 * s));
      }
      populateCreepingBotanicalVine({
        points: ringPts,
        stemRadius: 0.0028,
        leafCount: 18,
        leafScale: 0.028 * s,
        closed: true,
        darkFoliageList: epiphyteList,
        brightFoliageList: epiphyteList,
        seed: 900 + idx * 41
      });

      const cableHeight = 4.85 - (d.z + 0.24 * s);
      cableList.push(transformGeo(
        new THREE.CylinderGeometry(0.0045, 0.0045, cableHeight, 6),
        [d.x, d.y, (d.z + 0.24 * s) + cableHeight * 0.5],
        [Math.PI / 2, 0, 0]
      ));

      const topFeederCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(d.x, 1.65, 3.95),
        new THREE.Vector3(d.x - 0.12, d.y + 0.55, d.z + 0.65 * s),
        new THREE.Vector3(d.x, d.y, d.z + 0.24 * s)
      ]);
      glassList.push(new THREE.TubeGeometry(topFeederCurve, 18, 0.011 * s, 6, false));

      const botTipZ = d.z - 0.32 * s;
      const [tx, ty, tz] = d.targetDown;
      const botDrainCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(d.x, d.y, botTipZ),
        new THREE.Vector3((d.x + tx) * 0.5, (d.y + ty) * 0.5 + 0.08, (botTipZ + tz) * 0.5),
        new THREE.Vector3(tx, ty, tz)
      ]);
      glassList.push(new THREE.TubeGeometry(botDrainCurve, 18, 0.009 * s, 6, false));
      collarList.push(transformGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10), [tx, ty, tz], [Math.PI / 2, 0, 0]));
    }

    const unitLiquidGeo = transformGeo(new THREE.CylinderGeometry(0.155, 0.038, 0.28, 18), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const unitCoreGeo = mergeGeometriesFast([
      transformGeo(new THREE.DodecahedronGeometry(0.092, 1), [0, 0, 0], [0.2, 0.4, 0.1], [1.15, 0.95, 1.25]),
      transformGeo(new THREE.IcosahedronGeometry(0.024, 1), [0.06, 0.04, 0.08]),
      transformGeo(new THREE.IcosahedronGeometry(0.018, 1), [-0.05, -0.04, 0.11]),
      transformGeo(new THREE.IcosahedronGeometry(0.015, 1), [0.02, -0.06, -0.07])
    ]);

    return {
      glassGeo: mergeGeometriesFast(glassList),
      collarGeo: mergeGeometriesFast(collarList),
      cableGeo: mergeGeometriesFast(cableList),
      epiphyteGeo: mergeGeometriesFast(epiphyteList),
      unitLiquidGeo,
      unitCoreGeo
    };
  }, []);

  useFrame((state) => {
    const p = progressRef ? progressRef.current : 0;
    const vis = p >= 0.26 && p <= 0.88;
    if (groupRef.current) {
      groupRef.current.visible = vis;
    }
    if (!vis) return;

    const t = state.clock.getElapsedTime();
    epiphyteFloraMat.uniforms.uTime.value = t;
    DROPLET_SPECS.forEach((d, idx) => {
      const s = d.scale;
      const coreMesh = coreRefs.current[idx];
      const liqMesh = liquidRefs.current[idx];
      if (coreMesh) {
        coreMesh.position.z = d.z - 0.04 * s + Math.sin(t * 2.1 + idx * 1.3) * 0.022;
        coreMesh.rotation.z = t * (0.65 + idx * 0.12);
        coreMesh.rotation.x = Math.sin(t * 1.4 + idx) * 0.18;
      }
      if (liqMesh) {
        const breath = s * (1.0 + 0.045 * Math.sin(t * 2.6 + idx * 0.9));
        liqMesh.scale.set(breath, breath, s);
      }
    });
  });

  return (
    <group ref={groupRef} name="SUSPENDED_DROPLET_REACTORS" visible={false}>
      <mesh geometry={batched.glassGeo} material={capsuleGlassMat} />
      <mesh geometry={batched.collarGeo} material={capsuleCollarMat} />
      <mesh geometry={batched.cableGeo} material={tendrilCableMat} />
      <mesh geometry={batched.epiphyteGeo} material={epiphyteFloraMat} />
      {DROPLET_SPECS.map((d, i) => (
        <React.Fragment key={i}>
          <mesh
            ref={el => liquidRefs.current[i] = el}
            geometry={batched.unitLiquidGeo}
            material={capsuleLiquidMat}
            position={[d.x, d.y, d.z - 0.10 * d.scale]}
            scale={[d.scale, d.scale, d.scale]}
          />
          <mesh
            ref={el => coreRefs.current[i] = el}
            geometry={batched.unitCoreGeo}
            material={capsuleCoreMat}
            position={[d.x, d.y, d.z - 0.04 * d.scale]}
            scale={[d.scale, d.scale, d.scale]}
          />
        </React.Fragment>
      ))}
    </group>
  );
}

/**
 * 4. ORGANİK KALP REAKTÖRÜ (Zone G çevresi)
 */
export function OrganicHeartReactor({ progressRef }) {
  const archRelief = useMemo(() => getSharedArchitecturalRelief(), []);
  const groupRef = useRef();
  const heartCoreRef = useRef();
  const sinewRef = useRef();
  const lightRef = useRef();

  const heartSinewMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd4c0',
    roughness: 0.74,
    metalness: 0.04,
    bumpMap: archRelief,
    bumpScale: 0.016
  }), [archRelief]);

  const aorticVesselMat = useMemo(() => createFastGlassMaterial({
    color: '#c2f2dc',
    opacity: 0.38,
    roughness: 0.06,
    metalness: 0.10
  }), []);

  const heartCoreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f2962e',
    emissive: '#d85e12',
    emissiveIntensity: 0.95,
    roughness: 0.22,
    metalness: 0.05,
    transparent: true,
    opacity: 0.90
  }), []);

  const aorticPulseMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color('#c85a12') },
      uPulseColor: { value: new THREE.Color('#ffe07d') },
      uSpeed: { value: 3.8 }
    },
    vertexShader: vascularFlowVertexShader,
    fragmentShader: vascularFlowFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const batched = useMemo(() => {
    const sinewList = [];
    const aorticList = [];
    const pulseVesselList = [];

    const hX = 25.0, hY = 0.0, hZ = 2.30;

    for (let k = 0; k < 4; k++) {
      const sinewPts = [];
      const zStart = -0.68 + k * 0.32;
      const numSteps = 28;
      for (let i = 0; i <= numSteps; i++) {
        const u = i / numSteps;
        const ang = u * Math.PI * 1.85 + (k * Math.PI * 0.5);
        const z = zStart + u * 1.25;
        const rProfile = 1.09 + 0.03 * Math.sin(u * Math.PI);
        sinewPts.push(new THREE.Vector3(
          Math.cos(ang) * rProfile,
          Math.sin(ang) * (rProfile * 0.94),
          z
        ));
      }
      sinewList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sinewPts), 36, 0.026, 8, false));
    }

    const aortaPoints = [
      new THREE.Vector3(hX, hY, 3.56),
      new THREE.Vector3(hX - 0.25, hY + 0.18, 3.98),
      new THREE.Vector3(hX - 0.75, hY + 0.32, 4.32),
      new THREE.Vector3(hX - 1.55, hY + 0.40, 4.46),
      new THREE.Vector3(hX - 2.45, hY + 0.45, 4.42)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.068, 10, false));
    pulseVesselList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.048, 8, false));

    const venousPoints = [
      new THREE.Vector3(hX + 0.58, hY + 0.25, 3.52),
      new THREE.Vector3(hX + 1.05, hY + 0.35, 3.25),
      new THREE.Vector3(hX + 1.18, hY + 0.14, 2.45),
      new THREE.Vector3(hX + 0.96, hY - 0.14, 1.75),
      new THREE.Vector3(hX + 0.52, hY - 0.25, 1.35)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.054, 10, false));
    pulseVesselList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.036, 8, false));

    const heartCoreGeo = mergeGeometriesFast([
      transformGeo(new THREE.SphereGeometry(0.42, 32, 24), [0, 0, 0], [0, 0, 0], [1.0, 0.92, 1.15]),
      transformGeo(new THREE.TorusGeometry(0.32, 0.045, 10, 28), [0, 0, 0.12], [0.35, 0.2, 0]),
      transformGeo(new THREE.TorusGeometry(0.28, 0.038, 10, 28), [0, 0, -0.14], [-0.3, -0.2, 0])
    ]);

    return {
      sinewGeo: mergeGeometriesFast(sinewList),
      aorticGeo: mergeGeometriesFast(aorticList),
      pulseVesselGeo: mergeGeometriesFast(pulseVesselList),
      heartCoreGeo,
      center: [hX, hY, hZ]
    };
  }, []);

  useFrame((state) => {
    const p = progressRef ? progressRef.current : 0;
    const vis = p >= 0.72;
    if (groupRef.current) {
      groupRef.current.visible = vis;
    }
    if (!vis) return;

    const t = state.clock.getElapsedTime();
    aorticPulseMat.uniforms.uTime.value = t;

    const phase = (t * 1.15) % 1.0;
    const lub = Math.exp(-Math.pow((phase - 0.18) / 0.075, 2.0));
    const dub = 0.62 * Math.exp(-Math.pow((phase - 0.36) / 0.065, 2.0));
    const beat = lub + dub;

    if (heartCoreRef.current) {
      const sXY = 1.0 + 0.11 * beat;
      const sZ = 1.0 - 0.05 * beat + 0.08 * lub;
      heartCoreRef.current.scale.set(sXY, sXY, sZ);
      heartCoreRef.current.rotation.z = t * 0.35;
    }
    if (sinewRef.current) {
      const sSinew = 1.0 + 0.025 * beat;
      sinewRef.current.scale.set(sSinew, sSinew, 1.0);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 2.4 + 1.8 * beat;
    }
  });

  return (
    <group ref={groupRef} name="ORGANIC_HEART_REACTOR" visible={false}>
      <mesh
        ref={sinewRef}
        geometry={batched.sinewGeo}
        material={heartSinewMat}
        position={batched.center}
      />
      <mesh geometry={batched.aorticGeo} material={aorticVesselMat} />
      <mesh geometry={batched.pulseVesselGeo} material={aorticPulseMat} />
      <mesh
        ref={heartCoreRef}
        geometry={batched.heartCoreGeo}
        material={heartCoreMat}
        position={batched.center}
      />
      <pointLight ref={lightRef} position={[25.0, 0.0, 2.32]} color="#ffa23a" intensity={2.8} distance={4.8} decay={2} />
    </group>
  );
}
