import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

// Eight-zone locked world: Zone E is fixed at X 13.25–17.75 metres.
// Multi-System Hybrid Bioprocess Incubator Bay combining:
// 1. Lower Tier (z = 0.90..1.52): Orbital Shaker Platform with 10 Borosilicate Fernbach/Erlenmeyer Seed Flasks
// 2. Middle Tier (z = 1.58..2.18): 5 Cylindrical Borosilicate "Airlift / Bubble-Column" Bioreactors with internal draft tubes,
//    bottom O2 ring spargers, 3D branching rhizomorphic hyphal networks & stellate mycelial micro-pellets
// 3. Upper Tier (z = 2.24..2.78): 10 Cylindrical Solid-State Substrate Colonization Jars with progressive climbing rhizomorphic mycelium
// 4. Climate-Controlled Walk-In Chamber Frame, O2 Rotameters, Digital Control Header & Dual-Pathway Transfer Manifolds (to Zone F & Zone G)
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

const airliftBrothVertexShader = `
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

// Cylindrical Airlift Bioreactor Broth Shader: bottom O2 sparger illumination + rising bubble streams + clear core fresnel
const airliftBrothFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);

    float h = clamp(vUv.y, 0.0, 1.0);
    float spargerGlow = exp(-h * 2.2) * 0.72 + 0.28;

    float angle = vUv.x * 37.699;
    float rise1 = sin(angle * 3.0 + sin(h * 18.0 - uTime * 3.2)) * cos(h * 26.0 - uTime * 4.5);
    float rise2 = cos(angle * 5.0 - cos(h * 22.0 - uTime * 5.1));
    float microStream = clamp(0.45 + 0.35 * rise1 + 0.25 * rise2, 0.0, 1.0);

    vec3 deepTealAmber = vec3(0.14, 0.34, 0.26);
    vec3 goldenCulture = vec3(0.58, 0.76, 0.52);
    vec3 o2Foam = vec3(0.88, 0.99, 0.90);

    vec3 col = mix(deepTealAmber, goldenCulture, spargerGlow);
    col = mix(col, o2Foam, microStream * 0.38 + (1.0 - h) * 0.22);

    float topFoam = smoothstep(0.88, 0.99, h);
    col = mix(col, o2Foam, topFoam * 0.65);

    // Fresnel transparency: crisp edges, clear center so the internal draft tube & 3D mycelial network shine through
    float alpha = mix(0.54, 0.24, ndotv) + topFoam * 0.22;
    gl_FragColor = vec4(col, alpha);
  }
`;

const solidColonizationVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Upper Tier Solid-State Substrate Colonization Shader: branching white rhizomorphic mycelium climbing down/up the grain cylinder
const solidColonizationFragmentShader = `
  uniform float uGrowth;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    if (uGrowth <= 0.01) discard;
    // Colonization progresses from top inoculation port (vUv.y = 1.0) down to bottom (vUv.y = 0.0) and radially
    float theta = vUv.x * 6.2831853;
    float waveFront = 0.08 * sin(theta * 5.0) + 0.05 * cos(theta * 11.0);
    float distFromTop = 1.0 - vUv.y;
    float reach = uGrowth * 1.12 + waveFront;
    if (distFromTop > reach) discard;

    float nr = clamp(distFromTop / max(0.001, reach), 0.0, 1.0);

    // Multi-order bifurcating rhizomorphic hyphal cords wrapping the substrate cylinder
    float warp = 0.22 * sin(vUv.y * 22.0 + theta * 3.0);
    float cord1 = pow(abs(cos((theta + warp) * 14.0)), 1.8);
    float cord2 = pow(abs(sin((theta - warp * 0.7) * 32.0 + vUv.y * 18.0)), 2.4);
    float cord3 = pow(abs(cos((theta + warp * 1.2) * 64.0 - vUv.y * 34.0)), 3.0);

    float veins = cord1 * (1.0 - nr * 0.3) + cord2 * 0.8 + cord3 * smoothstep(0.3, 0.9, nr) * 0.75;
    float denseMat = exp(-nr * 2.8);
    float leadingTips = smoothstep(0.5, 0.95, veins) * (1.0 - smoothstep(0.82, 1.0, nr));
    float density = clamp(denseMat * 0.88 + veins * 0.68 * (1.0 - smoothstep(0.75, 1.0, nr)) + leadingTips * 0.65, 0.0, 1.0);
    if (density < 0.05) discard;

    vec3 warmCream = vec3(0.88, 0.85, 0.76);
    vec3 pureMycelium = vec3(0.98, 0.97, 0.93);
    vec3 col = mix(warmCream, pureMycelium, smoothstep(0.2, 0.85, density));
    gl_FragColor = vec4(col, density * 0.95);
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
    float localG = clamp((uGrowth - aOrder * 0.65) / 0.35, 0.0, 1.0);
    vVisible = localG;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.35, -mvPosition.z);
    gl_PointSize = clamp((aSize * localG * 115.0) / dist, 0.0, 28.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fluffy stellate (star-haired) cream-white mycelial micro-pellets suspended in the Airlift & Shaker reactors
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
    float halo = (1.0 - smoothstep(0.28, 0.98, r)) * (0.45 + 0.55 * hairs);
    float alpha = clamp(core * 0.94 + halo * 0.68, 0.0, 0.96) * vVisible;
    if (alpha < 0.03) discard;
    vec3 innerCream = vec3(0.98, 0.96, 0.90);
    vec3 outerHyphae = vec3(0.86, 0.94, 0.84);
    gl_FragColor = vec4(mix(outerHyphae, innerCream, core), alpha);
  }
`;

const COLS_X = [13.72, 14.52, 15.32, 16.12, 16.92];
const ROWS_Z = [1.05, 1.71, 2.38];

// Builds a 3D branching rhizomorphic & filamentous mycelial suspension plume for an Airlift Bioreactor Column
function buildAirliftMyceliumPlume(cx, cy, cz, rad = 0.16, hSpan = 0.34, seed = 101) {
  let s = seed;
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
  const geos = [];

  // Central buoyant flocculent inoculum cushion inside the draft tube
  geos.push(transformGeo(new THREE.IcosahedronGeometry(0.032, 1), [cx, cy, cz - 0.02], [0, 0, 0], [1.1, 1.1, 1.35]));

  // 24 Helical & Radially Branching 3D Hyphal Cords rising through the draft tube and looping into the outer annulus
  const strandCount = 24;
  for (let i = 0; i < strandCount; i++) {
    const baseAng = (i / strandCount) * Math.PI * 2 + (rand() - 0.5) * 0.2;
    const pts = [];
    const steps = 8;
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      // Rise up the central draft tube (u < 0.6) and fountain outward at the top of the airlift loop (u >= 0.6)
      const rCurve = rad * (0.18 + 0.76 * Math.sin(u * Math.PI * 0.88)) * (0.75 + 0.25 * rand());
      const swirl = baseAng + u * 1.15 + 0.16 * Math.sin(u * 6.0 + i);
      const zPos = cz - hSpan * 0.45 + u * hSpan + 0.018 * Math.sin(u * Math.PI * 2.0);
      pts.push(new THREE.Vector3(
        cx + Math.cos(swirl) * rCurve,
        cy + Math.sin(swirl) * rCurve,
        zPos
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    geos.push(new THREE.TubeGeometry(curve, 8, 0.0018 + (i % 3) * 0.0006, 4, false));

    // Secondary Y-fork hyphal branches
    if (i % 2 === 0) {
      const forkPt = curve.getPointAt(0.52);
      const subAng = baseAng + (i % 4 === 0 ? 0.55 : -0.55);
      const subPts = [
        forkPt,
        new THREE.Vector3(
          forkPt.x + Math.cos(subAng) * rad * 0.28,
          forkPt.y + Math.sin(subAng) * rad * 0.28,
          forkPt.z + 0.045
        ),
        new THREE.Vector3(
          forkPt.x + Math.cos(subAng + 0.3) * rad * 0.46,
          forkPt.y + Math.sin(subAng + 0.3) * rad * 0.46,
          forkPt.z + 0.075
        )
      ];
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(subPts), 5, 0.0011, 3, false));
    }
  }
  return mergeGeometriesFast(geos);
}

function IncubatorArchitecturalDetailing({ progressRef }) {
  const shakerGroupRef = useRef();
  const airliftMyceliumRef = useRef();
  const bubblePointsRef = useRef();
  const lastP = useRef(-1);

  const airliftBrothMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: airliftBrothVertexShader,
    fragmentShader: airliftBrothFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const solidColonizationMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 } },
    vertexShader: solidColonizationVertexShader,
    fragmentShader: solidColonizationFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const pelletMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 } },
    vertexShader: pelletVertexShader,
    fragmentShader: pelletFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const brushedSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#93a19a', metalness: 0.78, roughness: 0.28, envMapIntensity: 0.85
  }), []);

  const darkIndustrialMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#18221d', metalness: 0.62, roughness: 0.42
  }), []);

  const substrateCoreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#3b2e20', roughness: 0.90, metalness: 0.04
  }), []);

  const shakerBrothMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cfa044',
    emissive: '#4d3208',
    emissiveIntensity: 0.18,
    roughness: 0.20,
    metalness: 0.05,
    transparent: true,
    opacity: 0.62,
    depthWrite: false
  }), []);

  const borosilicateGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#dcf0e5', opacity: 0.26, roughness: 0.06, envMapIntensity: 0.95, side: THREE.DoubleSide
  }), []);

  const mycelialCordMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f8f6ec',
    emissive: '#386b4e',
    emissiveIntensity: 0.22,
    roughness: 0.58,
    metalness: 0.0
  }), []);

  const spargerGlowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#98f5c4', transparent: true, opacity: 0.85
  }), []);

  const blueCapMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2b6e9e', roughness: 0.38, metalness: 0.25
  }), []);

  // Build all 3 Scientific Tiers + Walk-in Chamber Hardware + Dual Transfer Manifolds in batched geometries!
  const batched = useMemo(() => {
    const steelList = [];
    const darkList = [];
    const glassList = [];
    const spargerList = [];
    const substrateList = [];
    const solidColonizationShells = [];
    const airliftBrothList = [];
    const airliftMyceliumList = [];

    // Shaker platform dynamic lists (Row 0, z = 0.90..1.48)
    const shakerSteelList = [];
    const shakerGlassList = [];
    const shakerBrothList = [];
    const shakerCapList = [];

    // ============================================================================
    // 0. WALK-IN / REACH-IN CLIMATE INCUBATOR HEADER, PILLARS & O2 ROTAMETERS
    // ============================================================================
    steelList.push(transformGeo(new THREE.BoxGeometry(4.56, 0.18, 0.14), [15.5, -1.18, 3.24]));
    darkList.push(transformGeo(new THREE.BoxGeometry(4.42, 0.04, 0.10), [15.5, -1.26, 3.24]));
    // Glowing digital climate control telemetry strip on the header fascia
    for (let d = 0; d < 6; d++) {
      spargerList.push(transformGeo(new THREE.BoxGeometry(0.18, 0.015, 0.032), [13.85 + d * 0.65, -1.28, 3.24]));
    }

    const pillarCyl = new THREE.CylinderGeometry(0.052, 0.052, 2.68, 12);
    for (const xPos of [13.21, 15.48, 17.78]) {
      steelList.push(transformGeo(pillarCyl, [xPos, -1.24, 1.86], [Math.PI / 2, 0, 0]));
    }

    // Left (x=13.28) & Right (x=17.68) O2 Rotameter Flowmeter Banks
    for (const rx of [13.28, 17.68]) {
      steelList.push(transformGeo(new THREE.BoxGeometry(0.11, 0.035, 0.88), [rx, -1.18, 1.88]));
      for (const rz of [1.54, 1.88, 2.22]) {
        glassList.push(transformGeo(new THREE.CylinderGeometry(0.014, 0.011, 0.24, 10), [rx, -1.21, rz], [Math.PI / 2, 0, 0]));
        spargerList.push(transformGeo(new THREE.SphereGeometry(0.011, 8, 6), [rx, -1.21, rz + 0.03]));
        steelList.push(transformGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 10), [rx, -1.225, rz - 0.13]));
      }
    }

    // ============================================================================
    // 1. LOWER TIER (z = 0.90..1.52): ORBITAL SHAKER PLATFORM & 10 FERNBACH / ERLENMEYER FLASKS
    // ============================================================================
    // Continuous brushed-steel orbital shaker tray deck suspended on 6 eccentric drive bearings at z = 0.935
    shakerSteelList.push(transformGeo(new THREE.BoxGeometry(3.85, 0.76, 0.022), [15.32, 0.06, 0.935]));
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      // Eccentric drive motor housing fixed to the bottom shelf at z = 0.91
      darkList.push(transformGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.032, 12), [cx, 0.06, 0.912], [Math.PI / 2, 0, 0]));

      // 2 Wide-Body Borosilicate Fernbach / Erlenmeyer Shake Flasks per column (front y = -0.13, rear y = +0.25)
      for (const fy of [-0.13, 0.25]) {
        const fz = 0.948;
        // Stainless spring clamp petals holding flask base to shaker deck
        shakerSteelList.push(transformGeo(new THREE.CylinderGeometry(0.148, 0.155, 0.018, 16, 1, true), [cx, fy, fz + 0.012], [Math.PI / 2, 0, 0]));
        // Conical Fernbach/Erlenmeyer glass body + cylindrical neck + rim lip
        shakerGlassList.push(
          transformGeo(new THREE.CylinderGeometry(0.052, 0.145, 0.26, 20, 1, true), [cx, fy, fz + 0.14], [Math.PI / 2, 0, 0]),
          transformGeo(new THREE.CylinderGeometry(0.048, 0.052, 0.09, 16, 1, true), [cx, fy, fz + 0.315], [Math.PI / 2, 0, 0]),
          transformGeo(new THREE.TorusGeometry(0.050, 0.004, 6, 16), [cx, fy, fz + 0.36])
        );
        // Sterile blue breathable membrane screw cap + stainless O2 feed capillary
        shakerCapList.push(transformGeo(new THREE.CylinderGeometry(0.054, 0.052, 0.048, 16), [cx, fy, fz + 0.375], [Math.PI / 2, 0, 0]));
        shakerSteelList.push(transformGeo(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), [cx, fy, fz + 0.42], [Math.PI / 2, 0, 0]));
        // Swirling golden-amber liquid broth inside each Erlenmeyer flask + concave vortex meniscus
        shakerBrothList.push(
          transformGeo(new THREE.CylinderGeometry(0.105, 0.140, 0.11, 18), [cx, fy, fz + 0.060], [Math.PI / 2, 0, 0]),
          transformGeo(new THREE.TorusGeometry(0.072, 0.028, 6, 18), [cx, fy, fz + 0.112], [0.08, 0, 0], [1, 1, 0.28])
        );
      }
    }

    // ============================================================================
    // 2. MIDDLE TIER (z = 1.58..2.18): 5 CYLINDRICAL "AIRLIFT / BUBBLE-COLUMN" GLASS BIOREACTORS
    // ============================================================================
    // Note: Central reactor at col = 2 (x = 15.32) is slightly wider (r = 0.255m) so its front glass wall
    // passes right through y = -0.235, z = 1.665 for the seamless Scene 07 Macro zoom!
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      const isHero = col === 2;
      const cy = isHero ? 0.015 : 0.05;
      const rCol = isHero ? 0.252 : 0.215;
      const zBot = 1.582;
      const zTop = 2.165;
      const hCol = zTop - zBot;
      const zMid = (zBot + zTop) * 0.5;

      // Sanitary stainless bottom sparger base & top headplate flange
      steelList.push(
        transformGeo(new THREE.CylinderGeometry(rCol * 1.06, rCol * 1.10, 0.036, 28), [cx, cy, zBot + 0.018], [Math.PI / 2, 0, 0]),
        transformGeo(new THREE.CylinderGeometry(rCol * 1.06, rCol * 1.06, 0.034, 28), [cx, cy, zTop - 0.017], [Math.PI / 2, 0, 0]),
        // Domed sanitary top cover & exhaust condenser port
        transformGeo(new THREE.SphereGeometry(rCol * 0.96, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), [cx, cy, zTop], [0, 0, 0], [1, 1, 0.22]),
        transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 10), [cx - rCol * 0.45, cy - rCol * 0.35, zTop + 0.03], [Math.PI / 2, 0, 0])
      );
      // Dark EPDM sanitary flange gaskets
      darkList.push(
        transformGeo(new THREE.TorusGeometry(rCol * 1.02, 0.006, 6, 28), [cx, cy, zBot + 0.036]),
        transformGeo(new THREE.TorusGeometry(rCol * 1.02, 0.006, 6, 28), [cx, cy, zTop - 0.034])
      );
      // 4 External Stainless Tie-Rods around each Airlift Column
      for (let tr = 0; tr < 4; tr++) {
        const ang = (tr / 4) * Math.PI * 2 + Math.PI * 0.25;
        steelList.push(transformGeo(
          new THREE.CylinderGeometry(0.007, 0.007, hCol, 6),
          [cx + Math.cos(ang) * (rCol * 1.04), cy + Math.sin(ang) * (rCol * 1.04), zMid],
          [Math.PI / 2, 0, 0]
        ));
      }

      // Outer Borosilicate Glass Cylinder + Concentric Internal Airlift Draft Tube (Sirkülasyon Borusu)
      glassList.push(
        transformGeo(new THREE.CylinderGeometry(rCol, rCol, hCol - 0.065, 28, 1, true), [cx, cy, zMid], [Math.PI / 2, 0, 0]),
        transformGeo(new THREE.CylinderGeometry(rCol * 0.48, rCol * 0.48, hCol - 0.16, 20, 1, true), [cx, cy, zMid - 0.01], [Math.PI / 2, 0, 0])
      );

      // Glowing Sintered Toroidal O2 Ring Sparger at the bottom of the draft tube + front status LED
      spargerList.push(
        transformGeo(new THREE.TorusGeometry(rCol * 0.38, 0.010, 8, 24), [cx, cy, zBot + 0.048]),
        transformGeo(new THREE.BoxGeometry(0.032, 0.010, 0.010), [cx, cy - rCol * 1.06, zTop - 0.017])
      );

      // Oxygenated Liquid Broth Column inside the Airlift Bioreactor
      airliftBrothList.push(
        transformGeo(new THREE.CylinderGeometry(rCol * 0.96, rCol * 0.96, hCol - 0.10, 24), [cx, cy, zMid - 0.01], [Math.PI / 2, 0, 0])
      );

      // 3D Branching Rhizomorphic & Filamentous Mycelial Plume suspended inside the Airlift Bioreactor
      airliftMyceliumList.push(buildAirliftMyceliumPlume(cx, cy, zMid - 0.01, rCol * 0.82, hCol - 0.15, 401 + col * 97));
    }

    // ============================================================================
    // 3. UPPER TIER (z = 2.24..2.78): 10 SOLID-STATE SUBSTRATE MYCELIUM COLONIZATION JARS
    // ============================================================================
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      // 2 Tall Cylindrical Borosilicate Solid-State Colonization Vessels per station (front y = -0.12, rear y = +0.26)
      for (const jy of [-0.12, 0.26]) {
        const jzBot = 2.242;
        const jH = 0.44;
        const jzMid = jzBot + jH * 0.5;
        const jRad = 0.135;

        // Outer Borosilicate Glass Jar Cylinder
        glassList.push(transformGeo(new THREE.CylinderGeometry(jRad, jRad, jH, 22, 1, true), [cx, jy, jzMid], [Math.PI / 2, 0, 0]));
        // Brushed Stainless Autoclave Lid with 0.22 µm white HEPA filter patch & red silicone septum port
        steelList.push(
          transformGeo(new THREE.CylinderGeometry(jRad * 1.04, jRad * 1.04, 0.028, 22), [cx, jy, jzBot + jH + 0.012], [Math.PI / 2, 0, 0]),
          transformGeo(new THREE.CylinderGeometry(jRad * 1.03, jRad * 1.05, 0.016, 22), [cx, jy, jzBot + 0.008], [Math.PI / 2, 0, 0])
        );
        spargerList.push(transformGeo(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 12), [cx - 0.035, jy, jzBot + jH + 0.028], [Math.PI / 2, 0, 0]));
        shakerCapList.push(transformGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), [cx + 0.042, jy, jzBot + jH + 0.028], [Math.PI / 2, 0, 0]));

        // Dark Lignocellulosic Oak/Grain Substrate Core inside the jar
        const subH = jH * 0.84;
        const subZ = jzBot + subH * 0.5 + 0.014;
        substrateList.push(transformGeo(new THREE.CylinderGeometry(jRad * 0.91, jRad * 0.91, subH, 20), [cx, jy, subZ], [Math.PI / 2, 0, 0]));

        // Progressive White Rhizomorphic Mycelium Colonization Shell hugging the substrate core
        solidColonizationShells.push(transformGeo(new THREE.CylinderGeometry(jRad * 0.935, jRad * 0.935, subH, 22, 1, true), [cx, jy, subZ], [Math.PI / 2, 0, 0]));
      }
    }

    // ============================================================================
    // 4. DUAL-PATHWAY SANITARY TRANSFER MANIFOLDS (TO ZONE F FRUITING & ZONE G FERMENTER)
    // ============================================================================
    // Upper overhead O2 header manifold feeding the 5 Airlift columns
    steelList.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 3.60, 8), [15.32, 0.05, 2.19], [0, 0, Math.PI / 2]));
    // Pathway 1 (Solid-State -> Zone F Fruiting Chamber at x = 18.84)
    const transferUpper = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.12, 0.08, 2.48),
        new THREE.Vector3(17.95, 0.08, 2.48),
        new THREE.Vector3(18.35, 0.08, 1.98),
        new THREE.Vector3(18.84, 0.08, 1.98)
      ]),
      18, 0.036, 8, false
    );
    // Pathway 2 (Liquid Airlift & Shaker -> Zone G Industrial Fermenter at x = 23.60)
    const transferLower = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.12, 0.15, 1.85),
        new THREE.Vector3(18.10, 0.25, 1.45),
        new THREE.Vector3(18.10, 0.85, 0.72),
        new THREE.Vector3(23.60, 0.85, 0.72)
      ]),
      20, 0.042, 8, false
    );
    steelList.push(transferUpper, transferLower);

    return {
      steelGeo: mergeGeometriesFast(steelList),
      darkGeo: mergeGeometriesFast(darkList),
      glassGeo: mergeGeometriesFast(glassList),
      spargerGeo: mergeGeometriesFast(spargerList),
      substrateGeo: mergeGeometriesFast(substrateList),
      solidColonizationGeo: mergeGeometriesFast(solidColonizationShells),
      airliftBrothGeo: mergeGeometriesFast(airliftBrothList),
      airliftMyceliumGeo: mergeGeometriesFast(airliftMyceliumList),
      shakerSteelGeo: mergeGeometriesFast(shakerSteelList),
      shakerGlassGeo: mergeGeometriesFast(shakerGlassList),
      shakerBrothGeo: mergeGeometriesFast(shakerBrothList),
      shakerCapGeo: mergeGeometriesFast(shakerCapList)
    };
  }, []);

  // Suspended Stellate Mycelial Micro-Pellets inside the 5 Middle Airlift Columns & 10 Lower Shaker Flasks
  const suspendedPellets = useMemo(() => {
    const airliftCount = 5 * 55;
    const shakerCount = 10 * 18;
    const total = airliftCount + shakerCount;
    const positions = new Float32Array(total * 3);
    const orders = new Float32Array(total);
    const sizes = new Float32Array(total);
    const phases = new Float32Array(total);
    let seed = 88219;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    let idx = 0;
    // 1. Airlift column stellate mycelial pellets
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      const cy = col === 2 ? 0.015 : 0.05;
      const rMax = (col === 2 ? 0.252 : 0.215) * 0.82;
      for (let k = 0; k < 55; k++) {
        const ang = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.6) * rMax;
        positions[idx * 3] = cx + Math.cos(ang) * r;
        positions[idx * 3 + 1] = cy + Math.sin(ang) * r;
        positions[idx * 3 + 2] = 1.64 + rand() * 0.44;
        orders[idx] = (col * 0.12 + (k / 55) * 0.52);
        sizes[idx] = 0.14 + rand() * 0.22;
        phases[idx] = rand() * Math.PI * 2;
        idx++;
      }
    }
    // 2. Orbital shaker flask stellate mycelial pellets
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      for (const fy of [-0.13, 0.25]) {
        for (let k = 0; k < 18; k++) {
          const ang = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * 0.105;
          positions[idx * 3] = cx + Math.cos(ang) * r;
          positions[idx * 3 + 1] = fy + Math.sin(ang) * r;
          positions[idx * 3 + 2] = 0.965 + rand() * 0.085;
          orders[idx] = (col * 0.10 + (k / 18) * 0.45);
          sizes[idx] = 0.12 + rand() * 0.16;
          phases[idx] = rand() * Math.PI * 2;
          idx++;
        }
      }
    }
    return { positions, orders, sizes, phases };
  }, []);

  // Rising 3D oxygen bubbles inside the 5 Airlift Bioreactor Columns
  const o2Bubbles = useMemo(() => {
    const perCol = 32;
    const count = 5 * perCol;
    const pos = new Float32Array(count * 3);
    const baseZ = new Float32Array(count);
    const speeds = new Float32Array(count);
    let seed = 55109;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    let idx = 0;
    for (let col = 0; col < 5; col++) {
      const cx = COLS_X[col];
      const cy = col === 2 ? 0.015 : 0.05;
      const rDraft = (col === 2 ? 0.252 : 0.215) * 0.45;
      for (let k = 0; k < perCol; k++) {
        const ang = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * rDraft;
        pos[idx * 3] = cx + Math.cos(ang) * r;
        pos[idx * 3 + 1] = cy + Math.sin(ang) * r;
        const z0 = 1.63;
        baseZ[idx] = z0;
        pos[idx * 3 + 2] = z0 + rand() * 0.46;
        speeds[idx] = 0.35 + rand() * 0.65;
        idx++;
      }
    }
    return { pos, baseZ, speeds, count };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    if (p < 0.36) return;
    if (Math.abs(p - lastP.current) < 0.00025) return;
    lastP.current = p;

    const growth = p > 0.92 ? 1.0 : incubEase(.455, .540, p);
    airliftBrothMat.uniforms.uTime.value = p * 38.0;
    solidColonizationMat.uniforms.uGrowth.value = growth;
    pelletMat.uniforms.uGrowth.value = Math.max(0.08, growth);

    // 1. Orbital Shaker circular motion on Lower Tier (Row 0)
    if (shakerGroupRef.current) {
      const orbitAngle = p * 220.0;
      shakerGroupRef.current.position.x = Math.cos(orbitAngle) * 0.012;
      shakerGroupRef.current.position.y = Math.sin(orbitAngle) * 0.012;
    }

    // 2. Buoyant vertical breathing of the 3D Rhizomorphic Mycelial Networks inside the 5 Airlift Columns (Row 1)
    if (airliftMyceliumRef.current) {
      airliftMyceliumRef.current.visible = growth > 0.02;
      if (airliftMyceliumRef.current.visible) {
        const zBob = Math.sin(p * 115.0) * 0.008;
        airliftMyceliumRef.current.position.z = zBob;
      }
    }

    // 3. Rising Oxygen Bubble Stream inside the 5 Airlift Draft Tubes
    if (bubblePointsRef.current && p <= 0.68) {
      const attr = bubblePointsRef.current.geometry.attributes.position;
      for (let i = 0; i < o2Bubbles.count; i++) {
        const z0 = o2Bubbles.baseZ[i];
        const zRel = ((i * 0.037 + p * 14.0 * o2Bubbles.speeds[i]) % 1.0) * 0.46;
        attr.setZ(i, z0 + zRel);
      }
      attr.needsUpdate = true;
    }
  });

  return (
    <group name="ZONE_E_HIGH_DETAIL_INCUBATOR">
      {/* Static Incubator Frame, Airlift Flanges, Tie-Rods, Jar Lids, Rotameters & Dual Transfer Manifolds */}
      <mesh geometry={batched.steelGeo} material={brushedSteelMat} />
      <mesh geometry={batched.darkGeo} material={darkIndustrialMat} />
      <mesh geometry={batched.spargerGeo} material={spargerGlowMat} />

      {/* Upper Tier: 10 Solid-State Lignocellulosic Substrate Cores + Progressive Climbing White Rhizomorphic Mycelium */}
      <mesh geometry={batched.substrateGeo} material={substrateCoreMat} />
      <mesh geometry={batched.solidColonizationGeo} material={solidColonizationMat} />

      {/* Middle Tier: 5 Cylindrical Airlift Bioreactors — 3D Branching Rhizomorphic Mycelium + Oxygenated Broth */}
      <mesh ref={airliftMyceliumRef} geometry={batched.airliftMyceliumGeo} material={mycelialCordMat} />
      <mesh geometry={batched.airliftBrothGeo} material={airliftBrothMat} />

      {/* Lower Tier: Animated Orbital Shaker Platform with 10 Borosilicate Fernbach / Erlenmeyer Seed Flasks */}
      <group ref={shakerGroupRef}>
        <mesh geometry={batched.shakerSteelGeo} material={brushedSteelMat} />
        <mesh geometry={batched.shakerCapGeo} material={blueCapMat} />
        <mesh geometry={batched.shakerBrothGeo} material={shakerBrothMat} />
        <mesh geometry={batched.shakerGlassGeo} material={borosilicateGlassMat} />
      </group>

      {/* Suspended Fluffy Stellate Mycelial Micro-Pellets inside Airlift Columns & Shaker Flasks */}
      <points material={pelletMat} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[suspendedPellets.positions, 3]} />
          <bufferAttribute attach="attributes-aOrder" args={[suspendedPellets.orders, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[suspendedPellets.sizes, 1]} />
          <bufferAttribute attach="attributes-aPhase" args={[suspendedPellets.phases, 1]} />
        </bufferGeometry>
      </points>

      {/* Rising Specular O2 Micro-Bubble Streams from the Bottom Ring Spargers */}
      <points ref={bubblePointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[o2Bubbles.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#d8fceb" size={0.015} transparent opacity={0.85} depthWrite={false} sizeAttenuation />
      </points>

      {/* Outer Borosilicate Glass Cylinders of All 5 Airlift Bioreactors, Draft Tubes & 10 Solid-State Jars */}
      <mesh geometry={batched.glassGeo} material={borosilicateGlassMat} />
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
