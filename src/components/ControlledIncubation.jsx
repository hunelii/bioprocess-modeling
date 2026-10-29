import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

// Eight-zone locked world: Zone E is fixed at X 13.25–17.75 metres.
// 3-Tier Multi-Deck Orbital Shaker & Aerated Flask Incubator Bay:
// - All 3 Shelves (z = 0.90, 1.58, 2.24) are equipped with synchronized eccentric-drive Orbital Shaker Decks
// - 30 High-Detail Borosilicate Fernbach & Baffled Erlenmeyer Shake Flasks (10 per shelf: 5 columns x 2 rows)
// - Individual overhead O2 gas distribution rails, silicone sparging capillaries, glowing sintered micro-sparger tips,
//   spring-wire petal clamps, frosted graduation scales, digital RPM/temp telemetry bars, O2 rotameter flowmeters,
//   and dual sanitary transfer manifolds feeding Zone F & Zone G.
export const INCUBATION_WINDOW = Object.freeze([.43, .54]);
export const INCUBATOR_CENTER = Object.freeze([15.5, .08, 1.87]);
export const INCUBATION_SUBSTRATES = 14;
export const incubEase = (a, b, p) => {
  const t = THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function updateIncubationBiomass(actors, p) {
  const growth = p > 0.92 ? 1.0 : incubEase(.488, .535, p);
  for (const { object } of actors) {
    const m = /^E_colonized_material_(\d)_(\d)$/.exec(object.name || '');
    if (!m) continue;
    const column = Number(m[1]), row = Number(m[2]);
    const order = row * 5 + column;
    const phase = THREE.MathUtils.clamp(growth * 1.55 - order * .045, 0, 1);
    object.visible = false;
    object.userData.incubationGrowth = phase;
  }
}

const shakerBrothVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;
  uniform float uOrbitAngle;
  void main() {
    vUv = uv;
    vLocalPos = position;
    // Subtle centrifugal liquid surface slosh wave synced to orbital rotation
    vec3 pos = position;
    float slosh = 0.014 * (sin(uOrbitAngle + position.x * 14.0) + cos(uOrbitAngle - position.y * 14.0));
    pos.z += slosh * smoothstep(0.2, 0.95, uv.y);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

// Swirling Golden-Amber & Emerald Oxygenated Shake-Flask Broth Shader
const shakerBrothFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);

    float h = clamp(vUv.y, 0.0, 1.0);
    float angle = vUv.x * 37.699;

    // Centrifugal swirling ribbons & bottom sparger illumination
    float swirl1 = sin(angle * 4.0 - uTime * 5.5 + h * 9.0);
    float swirl2 = cos(angle * 7.0 + uTime * 4.2 - h * 12.0);
    float ribbon = clamp(0.5 + 0.30 * swirl1 + 0.22 * swirl2, 0.0, 1.0);

    vec3 deepAmber = vec3(0.46, 0.31, 0.09);
    vec3 goldenNutrients = vec3(0.84, 0.65, 0.24);
    vec3 o2BioGlow = vec3(0.62, 0.88, 0.68);
    vec3 whiteFoam = vec3(0.95, 0.98, 0.92);

    float bottomSparger = exp(-h * 2.5) * 0.55;
    vec3 col = mix(deepAmber, goldenNutrients, 0.38 + 0.62 * ribbon);
    col = mix(col, o2BioGlow, bottomSparger + ribbon * 0.22);

    float meniscusFoam = smoothstep(0.82, 0.99, h);
    col = mix(col, whiteFoam, meniscusFoam * 0.68);

    float alpha = mix(0.68, 0.34, ndotv) + meniscusFoam * 0.18;
    gl_FragColor = vec4(col, alpha);
  }
`;

const pelletVertexShader = `
  attribute float aOrder;
  attribute float aSize;
  attribute float aPhase;
  uniform float uGrowth;
  varying float vVisible;
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    float localG = clamp((uGrowth - aOrder * 0.58) / 0.42, 0.0, 1.0);
    vVisible = localG;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.35, -mvPosition.z);
    gl_PointSize = clamp((aSize * localG * 125.0) / dist, 0.0, 28.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fluffy stellate (star-haired) cream-white mycelial micro-pellets swirling inside the 30 Shake Flasks
const pelletFragmentShader = `
  varying float vVisible;
  varying float vPhase;
  void main() {
    if (vVisible <= 0.02) discard;
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    float theta = atan(uv.y, uv.x) + vPhase;
    float hairs = 0.5 + 0.5 * sin(theta * 17.0 + r * 6.0) * cos(theta * 29.0 - vPhase);
    float core = 1.0 - smoothstep(0.0, 0.50, r);
    float halo = (1.0 - smoothstep(0.26, 0.98, r)) * (0.48 + 0.52 * hairs);
    float alpha = clamp(core * 0.95 + halo * 0.72, 0.0, 0.96) * vVisible;
    if (alpha < 0.03) discard;
    vec3 innerCream = vec3(0.99, 0.97, 0.91);
    vec3 outerHyphae = vec3(0.88, 0.95, 0.85);
    gl_FragColor = vec4(mix(outerHyphae, innerCream, core), alpha);
  }
`;

const COLS_X = [13.72, 14.52, 15.32, 16.12, 16.92];
const SHELF_Z = [0.90, 1.58, 2.24];
const FLASK_ROWS_Y = [-0.14, 0.26];

// Builds a 3D swirling vortex of branching filamentous mycelium & buoyant biomass flocs inside a shake flask
function buildFlaskSwirlingMycelium(cx, cy, fz, rBot, hBroth, seed = 101) {
  let s = seed;
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const geos = [];

  // Central flocculent mycelial core cushion + 3 satellite biomass globules
  geos.push(transformGeo(new THREE.IcosahedronGeometry(rBot * 0.16, 1), [cx, cy, fz + hBroth * 0.42], [0, 0, 0], [1.2, 1.2, 0.75]));
  for (let g = 0; g < 3; g++) {
    const ga = (g / 3) * Math.PI * 2 + seed * 0.4;
    const gr = rBot * 0.42;
    geos.push(transformGeo(
      new THREE.IcosahedronGeometry(rBot * 0.11, 1),
      [cx + Math.cos(ga) * gr, cy + Math.sin(ga) * gr, fz + hBroth * (0.35 + 0.18 * g)],
      [0, 0, ga],
      [1.3, 0.95, 0.7]
    ));
  }

  // 14 Helical & Radially Branching 3D Hyphal Filaments caught in the orbital vortex
  const strandCount = 14;
  for (let i = 0; i < strandCount; i++) {
    const baseAng = (i / strandCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const pts = [];
    const steps = 6;
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      const rCurve = rBot * (0.16 + 0.62 * Math.sin(u * Math.PI * 0.85)) * (0.80 + 0.20 * rand());
      // Strong spiral vortex twist from orbital shaking
      const swirl = baseAng + u * 2.1 + 0.18 * Math.sin(u * 5.0 + i);
      const zPos = fz + 0.018 + u * (hBroth * 0.85) + 0.008 * Math.cos(u * Math.PI * 2.0);
      pts.push(new THREE.Vector3(
        cx + Math.cos(swirl) * rCurve,
        cy + Math.sin(swirl) * rCurve,
        zPos
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    geos.push(new THREE.TubeGeometry(curve, 6, 0.0016 + (i % 2) * 0.0005, 4, false));
  }
  return mergeGeometriesFast(geos);
}

function IncubatorArchitecturalDetailing({ progressRef }) {
  const tierDeckRefs = useRef([]);
  const tierBrothRefs = useRef([]);
  const tierMyceliumRefs = useRef([]);
  const tierPelletRefs = useRef([]);
  const tierBubbleRefs = useRef([]);

  const shakerBrothMats = useMemo(() => [0, 1, 2].map((tier) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: tier * 2.1 }, uOrbitAngle: { value: tier * 2.094 } },
    vertexShader: shakerBrothVertexShader,
    fragmentShader: shakerBrothFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })), []);

  const pelletMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 } },
    vertexShader: pelletVertexShader,
    fragmentShader: pelletFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const brushedSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#95a39c', metalness: 0.80, roughness: 0.26, envMapIntensity: 0.88
  }), []);

  const darkIndustrialMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#19231e', metalness: 0.55, roughness: 0.45
  }), []);

  const borosilicateGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#dcf2e6', opacity: 0.27, roughness: 0.06, envMapIntensity: 0.96, side: THREE.DoubleSide
  }), []);

  const mycelialCordMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#faf8ef',
    emissive: '#3b7052',
    emissiveIntensity: 0.24,
    roughness: 0.55,
    metalness: 0.0
  }), []);

  const spargerGlowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#95f7c3', transparent: true, opacity: 0.88
  }), []);

  const blueCapMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#286c9c', roughness: 0.36, metalness: 0.24
  }), []);

  const siliconeTubeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d9eee4', transparent: true, opacity: 0.58, roughness: 0.25, metalness: 0.05
  }), []);

  const frostedScaleMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#eef7f2', transparent: true, opacity: 0.62, side: THREE.DoubleSide
  }), []);

  // Build Walk-In Climate Chamber + Pipe Manifolds + 3 Full-Width Animated Orbital Shaker Tiers (30 Flasks total)
  const batched = useMemo(() => {
    const staticSteelList = [];
    const staticDarkList = [];
    const staticGlassList = [];
    const staticSpargerList = [];
    const staticSiliconeList = [];

    // ============================================================================
    // 0. WALK-IN CLIMATE-CONTROLLED INCUBATOR CABINET, LOUVERS, SENSORS & O2 ROTAMETERS
    // ============================================================================
    // Top stainless climate header fascia & digital telemetry bar
    staticSteelList.push(transformGeo(new THREE.BoxGeometry(4.56, 0.18, 0.14), [15.5, -1.18, 3.24]));
    staticDarkList.push(transformGeo(new THREE.BoxGeometry(4.42, 0.04, 0.10), [15.5, -1.26, 3.24]));
    for (let d = 0; d < 6; d++) {
      staticSpargerList.push(transformGeo(new THREE.BoxGeometry(0.18, 0.015, 0.032), [13.85 + d * 0.65, -1.28, 3.24]));
    }

    // 3 Vertical Brushed-Steel Structural Chamber Pillars
    const pillarCyl = new THREE.CylinderGeometry(0.052, 0.052, 2.68, 12);
    for (const xPos of [13.21, 15.48, 17.78]) {
      staticSteelList.push(transformGeo(pillarCyl, [xPos, -1.24, 1.86], [Math.PI / 2, 0, 0]));
    }

    // Rear Chamber Ribbed Laminar Air-Duct Plenums & Ceiling Temp/RH/O2 Sensor Probes
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      staticSteelList.push(transformGeo(new THREE.BoxGeometry(0.52, 0.03, 1.82), [cx, 0.56, 1.82]));
      for (let lv = 0; lv < 9; lv++) {
        staticDarkList.push(transformGeo(new THREE.BoxGeometry(0.46, 0.012, 0.022), [cx, 0.54, 1.02 + lv * 0.20]));
      }
      // Hanging Environmental PT100 Temperature & Optical O2 Probe on each shelf
      for (let tier = 0; tier < 3; tier++) {
        const zCeil = SHELF_Z[tier] + 0.62;
        staticSteelList.push(transformGeo(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), [cx + 0.28, -0.02, zCeil - 0.06], [Math.PI / 2, 0, 0]));
        staticSpargerList.push(transformGeo(new THREE.SphereGeometry(0.009, 8, 6), [cx + 0.28, -0.02, zCeil - 0.12]));
      }
    }

    // Left (x=13.28) & Right (x=17.68) 3-Channel O2 Rotameter Flowmeter Banks (1 flowmeter per shaker tier!)
    for (const rx of [13.28, 17.68]) {
      staticSteelList.push(transformGeo(new THREE.BoxGeometry(0.12, 0.04, 0.96), [rx, -1.18, 1.88]));
      staticDarkList.push(transformGeo(new THREE.BoxGeometry(0.09, 0.015, 0.90), [rx, -1.20, 1.88]));
      for (const rz of [1.54, 1.88, 2.22]) {
        staticGlassList.push(transformGeo(new THREE.CylinderGeometry(0.015, 0.012, 0.25, 10), [rx, -1.215, rz], [Math.PI / 2, 0, 0]));
        staticSpargerList.push(transformGeo(new THREE.SphereGeometry(0.011, 8, 6), [rx, -1.215, rz + 0.035]));
        staticSteelList.push(transformGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.026, 10), [rx, -1.23, rz - 0.135]));
      }
    }

    // ============================================================================
    // 1. SANITARY PIPE MANIFOLDS & 3-TIER OVERHEAD O2 GAS DISTRIBUTION RAILS
    // ============================================================================
    for (let tier = 0; tier < 3; tier++) {
      const zRail = SHELF_Z[tier] + 0.53;
      // Horizontal brushed-stainless O2 supply header above each shelf
      staticSteelList.push(
        transformGeo(new THREE.CylinderGeometry(0.016, 0.016, 3.68, 10), [15.32, 0.06, zRail], [0, 0, Math.PI / 2]),
        // Left & Right manifold pressure regulator blocks
        transformGeo(new THREE.BoxGeometry(0.06, 0.06, 0.06), [13.48, 0.06, zRail]),
        transformGeo(new THREE.BoxGeometry(0.06, 0.06, 0.06), [17.16, 0.06, zRail])
      );
      // Flexible translucent silicone O2 feed loops dropping from the overhead rail toward each of the 10 flasks on this shelf
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col];
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const fy = FLASK_ROWS_Y[rIdx];
          const fTopZ = SHELF_Z[tier] + (tier === 1 && col === 2 && rIdx === 0 ? 0.48 : 0.44);
          const hoseCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(cx, 0.06, zRail),
            new THREE.Vector3(cx + (rIdx === 0 ? -0.04 : 0.04), fy * 0.55, (zRail + fTopZ) * 0.5 + 0.03),
            new THREE.Vector3(cx, fy, fTopZ)
          ]);
          staticSiliconeList.push(new THREE.TubeGeometry(hoseCurve, 8, 0.0045, 6, false));
          // Stainless manifold check-valve boss on the rail
          staticSteelList.push(transformGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.024, 8), [cx, 0.06, zRail], [Math.PI / 2, 0, 0]));
        }
      }
    }

    // Dual Sanitary Transfer Manifolds on the Right Side (connecting Zone E to Zone F Fruiting & Zone G Fermenter)
    const transferUpper = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.16, 0.06, 2.77),
        new THREE.Vector3(17.95, 0.08, 2.52),
        new THREE.Vector3(18.35, 0.08, 1.98),
        new THREE.Vector3(18.84, 0.08, 1.98)
      ]),
      18, 0.034, 8, false
    );
    const transferLower = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.16, 0.06, 2.11),
        new THREE.Vector3(17.75, 0.12, 1.43),
        new THREE.Vector3(18.10, 0.85, 0.72),
        new THREE.Vector3(23.60, 0.85, 0.72)
      ]),
      22, 0.040, 8, false
    );
    staticSteelList.push(transferUpper, transferLower);

    // ============================================================================
    // 2. THREE ANIMATED ORBITAL SHAKER PLATFORMS & 30 DETAILED BOROSILICATE SHAKE FLASKS
    // ============================================================================
    const tiers = [0, 1, 2].map((tier) => {
      const sz = SHELF_Z[tier];
      const deckZ = sz + 0.042;
      const tierSteel = [];
      const tierDark = [];
      const tierGlass = [];
      const tierBroth = [];
      const tierMycelium = [];
      const tierCap = [];
      const tierSparger = [];
      const tierScale = [];

      // Fixed Eccentric Counterweighted Motor Housings & EPDM Isolation Boots bolted to the static shelf (sz)
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col];
        for (const dy of [-0.16, 0.28]) {
          staticDarkList.push(transformGeo(new THREE.CylinderGeometry(0.058, 0.068, 0.026, 12), [cx, dy, sz + 0.013], [Math.PI / 2, 0, 0]));
          staticSteelList.push(transformGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.020, 10), [cx, dy, sz + 0.030], [Math.PI / 2, 0, 0]));
        }
      }

      // Full-Width Anodized Brushed-Steel Orbital Shaker Tray Platform + Front/Rear Retaining Lip Rails
      tierSteel.push(
        transformGeo(new THREE.BoxGeometry(3.88, 0.80, 0.020), [15.32, 0.06, deckZ]),
        transformGeo(new THREE.BoxGeometry(3.90, 0.022, 0.038), [15.32, -0.34, deckZ + 0.012]),
        transformGeo(new THREE.BoxGeometry(3.90, 0.022, 0.038), [15.32, 0.46, deckZ + 0.012])
      );
      // Dark Anti-Slip Neoprene Shaker Mat + Perforation Grid Strips + Front Digital Telemetry Bar
      tierDark.push(
        transformGeo(new THREE.BoxGeometry(3.80, 0.74, 0.006), [15.32, 0.06, deckZ + 0.011]),
        transformGeo(new THREE.BoxGeometry(0.95, 0.016, 0.030), [15.32, -0.352, deckZ + 0.012])
      );
      // Glowing Cyan/Emerald RPM & O2 Telemetry Readout LEDs on the front edge of the shaker tray
      for (let led = -2; led <= 2; led++) {
        tierSparger.push(transformGeo(new THREE.BoxGeometry(0.11, 0.008, 0.014), [15.32 + led * 0.18, -0.360, deckZ + 0.012]));
      }

      // 10 Borosilicate Shake Flasks per Shelf (5 columns x 2 rows: Front = Wide Fernbach, Rear = Baffled Erlenmeyer)
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col];
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const fy = FLASK_ROWS_Y[rIdx];
          const fz = deckZ + 0.014;
          // Hero Fernbach Flask on Middle Tier (tier === 1, col === 2, front row) is slightly larger so Scene 07 macro zoom
          // at [15.32, -0.235, 1.665] enters right through its front glass wall into the swirling mycelial culture!
          const isHero = tier === 1 && col === 2 && rIdx === 0;
          const isFrontFernbach = rIdx === 0;

          const rBot = isHero ? 0.175 : (isFrontFernbach ? 0.155 : 0.138);
          const rNeck = isHero ? 0.056 : (isFrontFernbach ? 0.050 : 0.045);
          const hCone = isHero ? 0.275 : (isFrontFernbach ? 0.245 : 0.265);
          const hNeck = isHero ? 0.095 : 0.088;
          const hBroth = isHero ? 0.135 : (isFrontFernbach ? 0.115 : 0.122);
          const rBrothTop = THREE.MathUtils.lerp(rBot * 0.96, rNeck * 0.96, hBroth / hCone);

          // 1. 6-Petal Stainless Spring-Wire Flask Clamp Bolted to the Shaker Deck
          tierSteel.push(
            transformGeo(new THREE.CylinderGeometry(rBot * 1.03, rBot * 1.07, 0.022, 18, 1, true), [cx, fy, fz + 0.012], [Math.PI / 2, 0, 0]),
            transformGeo(new THREE.TorusGeometry(rBot * 1.04, 0.0045, 6, 18), [cx, fy, fz + 0.026])
          );
          for (let p = 0; p < 6; p++) {
            const pa = (p / 6) * Math.PI * 2;
            tierSteel.push(transformGeo(
              new THREE.BoxGeometry(0.014, 0.005, 0.052),
              [cx + Math.cos(pa) * (rBot * 1.01), fy + Math.sin(pa) * (rBot * 1.01), fz + 0.026],
              [0, 0, pa]
            ));
          }

          // 2. Borosilicate Flask Rounded Base + Conical Body + Cylindrical Neck + Flared Lip Rim
          tierGlass.push(
            transformGeo(new THREE.CylinderGeometry(rNeck, rBot, hCone, 24, 1, true), [cx, fy, fz + hCone * 0.5], [Math.PI / 2, 0, 0]),
            transformGeo(new THREE.CylinderGeometry(rNeck * 0.96, rNeck, hNeck, 18, 1, true), [cx, fy, fz + hCone + hNeck * 0.5], [Math.PI / 2, 0, 0]),
            transformGeo(new THREE.TorusGeometry(rNeck * 1.02, 0.005, 6, 18), [cx, fy, fz + hCone + hNeck])
          );

          // 4 Vertical Indent Baffles on the Rear Row Baffled Erlenmeyer Flasks (breaks vortex & boosts O2 kLa!)
          if (!isFrontFernbach) {
            for (let b = 0; b < 4; b++) {
              const ba = (b / 4) * Math.PI * 2 + Math.PI * 0.25;
              const rMid = (rBot + rNeck) * 0.5 * 0.93;
              tierGlass.push(transformGeo(
                new THREE.BoxGeometry(0.008, 0.022, hCone * 0.62),
                [cx + Math.cos(ba) * rMid, fy + Math.sin(ba) * rMid, fz + hCone * 0.44],
                [0, 0, ba]
              ));
            }
          }

          // 3. White Frosted Volume Graduation Scale Ticks (500 mL, 1000 mL, 1500 mL) & ID Patch on Front Wall
          for (let tick = 1; tick <= 3; tick++) {
            const uTick = 0.22 + tick * 0.18;
            const zTick = fz + hCone * uTick;
            const rTick = THREE.MathUtils.lerp(rBot, rNeck, uTick) + 0.002;
            tierScale.push(transformGeo(
              new THREE.CylinderGeometry(rTick, rTick, 0.0035, 12, 1, true, -Math.PI * 0.68, Math.PI * 0.36),
              [cx, fy, zTick],
              [Math.PI / 2, 0, 0]
            ));
          }
          // Rectangular Frosted Sample Label Patch
          const uPatch = 0.52;
          const rPatch = THREE.MathUtils.lerp(rBot, rNeck, uPatch) + 0.0025;
          tierScale.push(transformGeo(
            new THREE.CylinderGeometry(rPatch, rPatch, 0.028, 10, 1, true, -Math.PI * 0.38, Math.PI * 0.22),
            [cx, fy, fz + hCone * uPatch],
            [Math.PI / 2, 0, 0]
          ));

          // 4. Sterile Blue GL45 Breathable Membrane Screw Cap + 0.22 µm White PTFE Vent Ring + Internal O2 Sparger Tube
          const zCap = fz + hCone + hNeck + 0.016;
          tierCap.push(transformGeo(new THREE.CylinderGeometry(rNeck * 1.12, rNeck * 1.08, 0.046, 18), [cx, fy, zCap], [Math.PI / 2, 0, 0]));
          tierScale.push(transformGeo(new THREE.CylinderGeometry(rNeck * 0.72, rNeck * 0.72, 0.008, 14), [cx, fy, zCap + 0.025], [Math.PI / 2, 0, 0]));
          // Stainless O2 Sparging Capillary descending from the cap down into the broth + Glowing Sintered Sparger Stone
          const capHeight = hCone + hNeck - 0.015;
          tierSteel.push(transformGeo(new THREE.CylinderGeometry(0.0035, 0.0035, capHeight, 6), [cx, fy, fz + capHeight * 0.5 + 0.025], [Math.PI / 2, 0, 0]));
          tierSparger.push(
            transformGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 10), [cx, fy, fz + 0.026], [Math.PI / 2, 0, 0]),
            transformGeo(new THREE.TorusGeometry(rBot * 0.34, 0.006, 6, 16), [cx, fy, fz + 0.018])
          );

          // 5. Swirling Oxygenated Liquid Culture Broth + Concave Centrifugal Meniscus Torus
          tierBroth.push(
            transformGeo(new THREE.CylinderGeometry(rBrothTop, rBot * 0.96, hBroth, 22), [cx, fy, fz + hBroth * 0.5 + 0.006], [Math.PI / 2, 0, 0]),
            transformGeo(new THREE.TorusGeometry(rBrothTop * 0.76, rBrothTop * 0.22, 8, 22), [cx, fy, fz + hBroth + 0.004], [0.06, 0, 0], [1, 1, 0.32])
          );

          // 6. 3D Swirling Branching Filamentous Mycelium & Biomass Flocs inside every Flask
          tierMycelium.push(buildFlaskSwirlingMycelium(cx, fy, fz + 0.006, rBot * 0.88, hBroth, 701 + tier * 200 + col * 31 + rIdx * 13));
        }
      }

      return {
        steelGeo: mergeGeometriesFast(tierSteel),
        darkGeo: mergeGeometriesFast(tierDark),
        glassGeo: mergeGeometriesFast(tierGlass),
        brothGeo: mergeGeometriesFast(tierBroth),
        myceliumGeo: mergeGeometriesFast(tierMycelium),
        capGeo: mergeGeometriesFast(tierCap),
        spargerGeo: mergeGeometriesFast(tierSparger),
        scaleGeo: mergeGeometriesFast(tierScale)
      };
    });

    return {
      staticSteelGeo: mergeGeometriesFast(staticSteelList),
      staticDarkGeo: mergeGeometriesFast(staticDarkList),
      staticGlassGeo: mergeGeometriesFast(staticGlassList),
      staticSpargerGeo: mergeGeometriesFast(staticSpargerList),
      staticSiliconeGeo: mergeGeometriesFast(staticSiliconeList),
      tiers
    };
  }, []);

  // Per-Tier Suspended Stellate Mycelial Micro-Pellets & Rising O2 Sparger Micro-Bubbles (so they orbit with each shaker deck!)
  const tierParticles = useMemo(() => {
    let seed = 88219;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    return [0, 1, 2].map((tier) => {
      const fz = SHELF_Z[tier] + 0.056;
      const pelletsPerFlask = 22;
      const pelletCount = 10 * pelletsPerFlask;
      const pPos = new Float32Array(pelletCount * 3);
      const pOrd = new Float32Array(pelletCount);
      const pSize = new Float32Array(pelletCount);
      const pPhase = new Float32Array(pelletCount);

      const bubblesPerFlask = 14;
      const bubbleCount = 10 * bubblesPerFlask;
      const bPos = new Float32Array(bubbleCount * 3);
      const bBaseZ = new Float32Array(bubbleCount);
      const bSpeeds = new Float32Array(bubbleCount);

      let pIdx = 0;
      let bIdx = 0;
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col];
        for (let rIdx = 0; rIdx < 2; rIdx++) {
          const fy = FLASK_ROWS_Y[rIdx];
          const isHero = tier === 1 && col === 2 && rIdx === 0;
          const rMax = isHero ? 0.142 : (rIdx === 0 ? 0.125 : 0.110);
          const hMax = isHero ? 0.120 : 0.102;

          for (let k = 0; k < pelletsPerFlask; k++) {
            const ang = rand() * Math.PI * 2;
            const r = Math.pow(rand(), 0.58) * rMax;
            pPos[pIdx * 3] = cx + Math.cos(ang) * r;
            pPos[pIdx * 3 + 1] = fy + Math.sin(ang) * r;
            pPos[pIdx * 3 + 2] = fz + 0.012 + rand() * hMax;
            pOrd[pIdx] = (col * 0.10 + rIdx * 0.08 + (k / pelletsPerFlask) * 0.48);
            pSize[pIdx] = 0.13 + rand() * 0.18;
            pPhase[pIdx] = rand() * Math.PI * 2;
            pIdx++;
          }

          for (let b = 0; b < bubblesPerFlask; b++) {
            const ang = rand() * Math.PI * 2;
            const r = Math.sqrt(rand()) * (rMax * 0.65);
            bPos[bIdx * 3] = cx + Math.cos(ang) * r;
            bPos[bIdx * 3 + 1] = fy + Math.sin(ang) * r;
            const z0 = fz + 0.015;
            bBaseZ[bIdx] = z0;
            bPos[bIdx * 3 + 2] = z0 + rand() * hMax;
            bSpeeds[bIdx] = 0.45 + rand() * 0.65;
            bIdx++;
          }
        }
      }
      return { pPos, pOrd, pSize, pPhase, bPos, bBaseZ, bSpeeds, bubbleCount };
    });
  }, []);

  useFrame((state) => {
    const p = progressRef.current;
    if (p < 0.35 || p > 0.72) return;

    // Keep orbital shakers visibly orbiting & sloshing even when the user pauses scrolling inside Scene 06!
    if (p >= 0.38 && p <= 0.64) {
      state.invalidate();
    }

    const t = state.clock.elapsedTime;
    const growth = p > 0.92 ? 1.0 : Math.max(0.18, incubEase(.445, .538, p));
    pelletMat.uniforms.uGrowth.value = growth;

    // Continuous 180 RPM Orbital Shaker Agitation across all 3 Shelves (with 120° phase offset between shelves for dynamic balance)
    const baseOmega = t * 5.2 + p * 160.0;
    const orbitRadius = 0.026;

    for (let tier = 0; tier < 3; tier++) {
      const theta = baseOmega + tier * 2.094395;
      const dx = Math.cos(theta) * orbitRadius;
      const dy = Math.sin(theta) * orbitRadius;

      const deck = tierDeckRefs.current[tier];
      if (deck) {
        deck.position.x = dx;
        deck.position.y = dy;
      }

      const brothMat = shakerBrothMats[tier];
      if (brothMat) {
        brothMat.uniforms.uTime.value = t * 1.4 + p * 35.0 + tier * 1.7;
        brothMat.uniforms.uOrbitAngle.value = theta;
      }

      // Dynamic bobbing & centrifugal wave motion of the 3D filamentous mycelium inside the flasks
      const myc = tierMyceliumRefs.current[tier];
      if (myc) {
        myc.position.x = -Math.sin(theta) * 0.006;
        myc.position.y = Math.cos(theta) * 0.006;
        myc.position.z = Math.sin(theta * 2.0) * 0.004;
      }

      // Rising O2 Micro-Bubbles inside the 10 flasks of this shaker tier
      const bubbles = tierBubbleRefs.current[tier];
      if (bubbles) {
        const attr = bubbles.geometry.attributes.position;
        const bp = tierParticles[tier];
        for (let i = 0; i < bp.bubbleCount; i++) {
          const z0 = bp.bBaseZ[i];
          const zRel = ((i * 0.043 + (t * 0.55 + p * 12.0) * bp.bSpeeds[i]) % 1.0) * 0.105;
          attr.setZ(i, z0 + zRel);
        }
        attr.needsUpdate = true;
      }
    }
  });

  return (
    <group name="ZONE_E_HIGH_DETAIL_INCUBATOR">
      {/* Static Climate-Controlled Chamber Frame, Rear Air-Duct Plenums, O2 Rotameters, Overhead O2 Rails & Transfer Manifolds */}
      <mesh geometry={batched.staticSteelGeo} material={brushedSteelMat} />
      <mesh geometry={batched.staticDarkGeo} material={darkIndustrialMat} />
      <mesh geometry={batched.staticSpargerGeo} material={spargerGlowMat} />
      <mesh geometry={batched.staticSiliconeGeo} material={siliconeTubeMat} />
      <mesh geometry={batched.staticGlassGeo} material={borosilicateGlassMat} />

      {/* 3 Synchronized Orbital Shaker Platforms (Lower z=0.90, Middle z=1.58, Upper z=2.24) — 30 Aerated Flasks Total */}
      {batched.tiers.map((tGeo, tier) => (
        <group key={tier} ref={(el) => { tierDeckRefs.current[tier] = el; }}>
          {/* Shaker Tray Deck, 6-Petal Spring Clamps & Internal Stainless O2 Capillaries */}
          <mesh geometry={tGeo.steelGeo} material={brushedSteelMat} />
          <mesh geometry={tGeo.darkGeo} material={darkIndustrialMat} />
          <mesh geometry={tGeo.capGeo} material={blueCapMat} />
          <mesh geometry={tGeo.spargerGeo} material={spargerGlowMat} />

          {/* 3D Swirling Branching Filamentous Mycelium & Biomass Flocs inside all 10 Flasks */}
          <mesh
            ref={(el) => { tierMyceliumRefs.current[tier] = el; }}
            geometry={tGeo.myceliumGeo}
            material={mycelialCordMat}
          />

          {/* Fluffy Stellate Mycelial Micro-Pellets swirling inside the 10 Flasks */}
          <points
            ref={(el) => { tierPelletRefs.current[tier] = el; }}
            material={pelletMat}
            frustumCulled={false}
          >
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[tierParticles[tier].pPos, 3]} />
              <bufferAttribute attach="attributes-aOrder" args={[tierParticles[tier].pOrd, 1]} />
              <bufferAttribute attach="attributes-aSize" args={[tierParticles[tier].pSize, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[tierParticles[tier].pPhase, 1]} />
            </bufferGeometry>
          </points>

          {/* Rising Specular O2 Micro-Bubbles from the Sintered Sparger Stones inside each Flask */}
          <points
            ref={(el) => { tierBubbleRefs.current[tier] = el; }}
            frustumCulled={false}
          >
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[tierParticles[tier].bPos, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#dcfaec" size={0.013} transparent opacity={0.86} depthWrite={false} sizeAttenuation />
          </points>

          {/* Sloshing Oxygenated Liquid Broth with Centrifugal Meniscus Wave */}
          <mesh
            ref={(el) => { tierBrothRefs.current[tier] = el; }}
            geometry={tGeo.brothGeo}
            material={shakerBrothMats[tier]}
          />

          {/* Frosted White Graduation Scales (mL), Sample ID Patches & 0.22 µm PTFE Vent Membranes */}
          <mesh geometry={tGeo.scaleGeo} material={frostedScaleMat} />

          {/* Outer Borosilicate Glass Bodies of the 10 Fernbach & Baffled Erlenmeyer Flasks */}
          <mesh geometry={tGeo.glassGeo} material={borosilicateGlassMat} />
        </group>
      ))}
    </group>
  );
}

function ReferenceMycelium({ progressRef }) {
  const tierRefs = useRef([]);
  const tiers = useMemo(() => {
    const tierCount = 6;
    const buckets = Array.from({ length: tierCount }, () => []);
    for (let i = 0; i < 48; i++) {
      const phi = (i * 2.399963229728653) % (2 * Math.PI);
      const x=15.32,y=.08,z=1.69;
      const length = .058 + (i % 7) * .011;
      const pts = Array.from({ length: 7 }, (_, j) => {
        const s = j / 6;
        return new THREE.Vector3(
          x + Math.cos(phi + 0.14 * Math.sin(s * 5 + i)) * (length * s),
          y + Math.sin(phi) * (length * s) * 1.85,
          z + .024 * Math.sin(phi * 1.5 + s * 3.5) * s
        );
      });
      const tIdx = Math.min(tierCount - 1, Math.floor((i / 48) * tierCount));
      buckets[tIdx].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, .0010, 4, false));
    }
    return buckets.map(b => mergeGeometriesFast(b));
  }, []);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5f3e8', roughness: .65
  }), []);

  useFrame(() => {
    const p = progressRef.current;
    const inView = p >= 0.45 && p <= 0.67;
    const a = incubEase(.501, .535, p);
    tierRefs.current.forEach((m, i) => {
      if (m) m.visible = inView && a > (i + .5) / tiers.length;
    });
  });

  return (
    <group>
      {tiers.map((geometry, i) => (
        <mesh key={i} ref={el => tierRefs.current[i] = el} geometry={geometry} material={mat} visible={false} />
      ))}
    </group>
  );
}

export function ControlledIncubation({ progressRef }) {
  return (
    <>
      <IncubatorArchitecturalDetailing progressRef={progressRef} />
      <ReferenceMycelium progressRef={progressRef} />
    </>
  );
}
