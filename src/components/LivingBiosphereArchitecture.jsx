import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { getSharedArchitecturalRelief } from './CinematicLookdev.jsx';

/**
 * THE LIVING BIOSPHERE / BİYO-MİMARİ TAPINAĞI
 * (Neri Oxman & Zaha Hadid Visionary Architecture for Huner Living Biofoundry)
 *
 * Full-Facility Interconnected Metabolic Ecosystem:
 * 1. LivingBiosphereCanopyAndVaults:
 *    - Sculptural pressed mycelium vaults & calcified hyphal ribs with high-res micro-relief
 *    - Animated peristaltic vascular conduits (flowing golden nutrient broth & emerald spore packets)
 *    - Physical inter-station bridges (A -> B -> C -> D -> E -> F -> G -> H) with bronze flange sockets & inline dosing manifolds
 *    - Sub-bench illuminated nutrient reservoir pods, floor bioluminescent channels & mycelial root buttresses
 *
 * 2. BiologicalMicroLandscape:
 *    - Zone B & C Terrarium beds with multi-toned velvet moss cushions, river pebbles & borosilicate curbs
 *    - Kinetic articulated micro-inoculation & optical laser-scanning arms actively tending the Petri dishes
 *    - Rising bioluminescent spore & humidity micro-mist particles
 *
 * 3. SuspendedDropletReactors:
 *    - 5 levitating teardrop bioreactors physically connected via top vascular feeders & bottom vessel inoculation lines
 *    - Real-time peristaltic breathing liquid pulse, levitating/rotating fungal biomass cores & rising O2 bubble streams
 *
 * 4. OrganicHeartReactor:
 *    - Realistic systolic/diastolic cardiac contraction (lub-dub wave) of both the metabolic core & spiral pericardial sinews
 *    - Animated aortic & venous pulse waves pumping nutrient energy across the facility
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

// Flowing peristaltic fluid & bioluminescent spore bolus shader along TubeGeometry UV.x
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

    // Traveling peristaltic bolus waves & micro-bubble packets along tube length (vUv.x)
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

export function LivingBiosphereCanopyAndVaults() {
  const archRelief = useMemo(() => getSharedArchitecturalRelief(), []);

  const myceliumVaultMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd7c8', // Warm pressed mycelium composite / plaster chalk
    roughness: 0.86,
    metalness: 0.02,
    bumpMap: archRelief,
    bumpScale: 0.018
  }), [archRelief]);

  const hyphalRibMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cdc3af', // Calcified sculptural hyphal bone / organic structural ribs
    roughness: 0.78,
    metalness: 0.05,
    bumpMap: archRelief,
    bumpScale: 0.014
  }), [archRelief]);

  const flangeBronzeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8c7454', // Oxidized sanitary bronze/titanium socket collars & manifold valves
    roughness: 0.34,
    metalness: 0.76,
    envMapIntensity: 0.85
  }), []);

  const darkCompositeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1d2921', // Monolithic dark basalt / biopolymer manifold housings
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

  const floorMossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#26422c',
    roughness: 0.90,
    metalness: 0.0,
    bumpMap: archRelief,
    bumpScale: 0.016
  }), [archRelief]);

  const batched = useMemo(() => {
    const vaultList = [];
    const ribList = [];
    const glassTubeList = [];
    const nutrientList = [];
    const sporeList = [];
    const flangeList = [];
    const darkPodList = [];
    const rockList = [];
    const mossList = [];

    // Helper to add a flanged vascular conduit (glass outer tube + inner flowing stream + bronze socket collars at ends)
    const addVascularConduit = (points, radius = 0.024, isSpore = false, segments = 28) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p))));
      glassTubeList.push(new THREE.TubeGeometry(curve, segments, radius, 8, false));
      const innerGeo = new THREE.TubeGeometry(curve, segments, radius * 0.70, 6, false);
      if (isSpore) sporeList.push(innerGeo);
      else nutrientList.push(innerGeo);

      // Add sanitary bronze flange collars at start, midpoint, and end so tubes physically dock with sockets
      for (const u of [0.0, 0.5, 1.0]) {
        const pt = curve.getPointAt(u);
        flangeList.push(transformGeo(
          new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, 0.022, 12),
          [pt.x, pt.y, pt.z],
          [Math.PI / 2, 0, 0]
        ));
      }
    };

    // =========================================================================
    // 1. ENCLOSING LIVING MYCELIUM BACK WALL & CANOPY VAULT ENVELOPE
    // =========================================================================
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

    // =========================================================================
    // 2. AKIŞKAN ORGANİK KEMİKSİ / HİFSEL SÜTUNLAR, KÖK PAYANDALARI & TONOZ AĞI
    // =========================================================================
    const xColumns = [-0.5, 3.2, 6.4, 9.8, 13.6, 17.8, 22.4, 27.6, 32.5];

    for (const xCol of xColumns) {
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

      // Flared organic root base & spreading mycelial floor buttress tendrils
      ribList.push(transformGeo(new THREE.CylinderGeometry(0.24, 0.42, 0.14, 12), [xCol, 2.95, 0.07], [Math.PI / 2, 0, 0]));
      for (const dir of [-1, 1]) {
        const rootCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(xCol, 2.85, 0.38),
          new THREE.Vector3(xCol + dir * 0.35, 2.35, 0.14),
          new THREE.Vector3(xCol + dir * 0.65, 1.65, 0.04)
        ]);
        ribList.push(new THREE.TubeGeometry(rootCurve, 14, 0.032, 6, false));
      }

      // Secondary High-Ceiling Cantilever Rib
      const branchPoints = [
        new THREE.Vector3(xCol, 2.15, 3.2),
        new THREE.Vector3(xCol, 1.70, 4.1),
        new THREE.Vector3(xCol, 1.15, 4.7),
        new THREE.Vector3(xCol, 0.50, 4.95)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPoints), 22, 0.048, 8, false));

      // Transverse connecting bone brace between ribs
      const transversePoints = [
        new THREE.Vector3(xCol, 2.50, 2.0),
        new THREE.Vector3(xCol + 0.35, 2.25, 2.5),
        new THREE.Vector3(xCol, 2.00, 3.3)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(transversePoints), 14, 0.035, 6, false));
    }

    // Longitudinal Inter-Rib Connecting Tendrils + Diagonal Mycelial Canopy Webbing
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

      // Organic cross-ribbing web in the upper canopy so the vault ceiling feels richly woven
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(xA, 2.50, 2.0),
        new THREE.Vector3(xMid, 1.85, 3.6),
        new THREE.Vector3(xB, 1.05, 4.95)
      ]), 18, 0.022, 6, false));
    }

    // =========================================================================
    // 3. ANA VASKÜLER DOLAŞIM DAMARLARI (Overhead Arterial & Venous Biopipes)
    // =========================================================================
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

    // Bronze clamping rings along overhead vascular lines every ~2.5m
    for (let u = 0.04; u <= 0.96; u += 0.075) {
      const pN = nutrientCurve.getPointAt(u);
      const pS = sporeCurve.getPointAt(u);
      flangeList.push(transformGeo(new THREE.TorusGeometry(0.052, 0.008, 6, 14), [pN.x, pN.y, pN.z], [0, Math.PI / 2, 0]));
      flangeList.push(transformGeo(new THREE.TorusGeometry(0.044, 0.007, 6, 14), [pS.x, pS.y, pS.z], [0, Math.PI / 2, 0]));
    }

    // =========================================================================
    // 4. İSTASYONLAR ARASI FİZİKSEL BAĞLANTI KÖPRÜLERİ (A -> B -> C -> D -> E -> F -> G -> H)
    // Eliminates every isolated island or dead gap between benches!
    // =========================================================================

    // --- BRIDGE 1: Station A (Levitation Chamber [1.25, 0, 0.56]) -> Station B (Terrarium [3.62, -0.35, 1.25]) ---
    // Twin vascular capillary lines + Terrarium Dosing Manifold Pod on Zone B bench left edge
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

    // Zone B Terrarium Dosing Manifold Hub at [3.58, -0.29, 1.28]
    darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.11, 16), [3.58, -0.29, 1.28], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 12), [3.58, -0.29, 1.32], [Math.PI / 2, 0, 0]));
    // Capillary feeder from manifold directly to Petri dish collar [4.40, -0.15, 1.26]
    addVascularConduit([
      [3.64, -0.26, 1.26],
      [3.98, -0.22, 1.25],
      [4.32, -0.16, 1.26]
    ], 0.010, true, 16);

    // --- BRIDGE 2: Station B (Terrarium [5.25, -0.15, 1.24]) -> Station C (Isolation Terrarium [7.20, -0.20, 1.22]) ---
    // Fills the empty gap between Bench B and Bench C (x = 5.35 .. 7.10) with an Inline Peristaltic Buffer Station!
    const hubX = 6.22, hubY = -0.12, hubZ = 1.22;
    // Monolithic basalt pedestal column rising from floor to support the inter-bench inline dosing hub
    darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.18, 0.26, 1.18, 18), [hubX, hubY, 0.59], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 18), [hubX, hubY, 1.20], [Math.PI / 2, 0, 0]));
    // Glowing cylindrical glass buffer bioreceiver on top of pedestal
    glassTubeList.push(transformGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.28, 20), [hubX, hubY, 1.36], [Math.PI / 2, 0, 0]));
    sporeList.push(transformGeo(new THREE.CylinderGeometry(0.105, 0.105, 0.22, 16), [hubX, hubY, 1.34], [Math.PI / 2, 0, 0]));
    flangeList.push(transformGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 18), [hubX, hubY, 1.51], [Math.PI / 2, 0, 0]));
    // Mycelial root buttresses wrapping the inter-bench hub pedestal
    for (const dir of [-1, 1]) {
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(hubX, hubY, 1.15),
        new THREE.Vector3(hubX + dir * 0.45, hubY + 0.08, 0.65),
        new THREE.Vector3(hubX + dir * 0.78, hubY + 0.12, 0.12)
      ]), 14, 0.028, 6, false));
    }
    // Vascular conduits bridging Zone B -> Inline Hub -> Zone C -> Petri C
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

    // --- BRIDGE 3: Station C (Isolation [8.85, -0.15, 1.22]) -> Station D (Culture Expansion Vessels [9.88, 10.95, 12.15]) ---
    addVascularConduit([
      [8.14, -0.20, 1.26],
      [8.82, -0.12, 1.25],
      [9.35, 0.08, 1.48],
      [9.88, 0.25, 1.72]
    ], 0.018, true, 24);

    // Inter-Vessel Sequential Cascade Header (Vessel 0 [9.88] -> Vessel 1 [10.95] -> Vessel 2 [12.15])
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

    // --- BRIDGE 4: Station D ([12.15]) -> Station E (Incubation Racks [13.72 .. 16.92]) -> Station F (Fruiting [18.8 .. 21.2]) ---
    addVascularConduit([
      [12.15, 0.25, 2.64],
      [12.95, 0.18, 2.52],
      [13.72, 0.05, 2.32]
    ], 0.024, false, 20);

    // Vascular nutrient & humidity distribution header across Zone F Fruiting Trays (x = 17.5 -> 22.2)
    addVascularConduit([
      [16.92, 0.15, 2.30],
      [17.95, 0.22, 2.65],
      [19.20, 0.18, 2.85],
      [20.65, 0.18, 2.85],
      [22.10, 0.15, 2.65],
      [23.85, 0.08, 2.45],
      [24.55, 0.0, 2.35]
    ], 0.028, true, 36);

    // Vascular siphon line feeding from overhead artery into Station 07 (Organic Heart Reactor, x = 25.0)
    addVascularConduit([
      nutrientCurve.getPointAt((25.0 + 0.5) / 34.0),
      [24.5, 0.8, 3.8],
      [24.7, 0.2, 3.65],
      [25.0, 0.0, 3.52]
    ], 0.036, false, 24);

    // --- BRIDGE 5: Station G (Organic Heart Reactor [25.52, -0.25, 1.35]) -> Station H (Telemetry Desk [29.6, -0.15, 1.15]) ---
    addVascularConduit([
      [25.52, -0.25, 1.35],
      [26.85, -0.32, 1.12],
      [28.25, -0.28, 1.08],
      [29.55, -0.18, 1.18]
    ], 0.024, true, 28);

    // =========================================================================
    // 5. ZEMİN ALTI VE TEZGAH ALTI REZERVUAR PODLARI & BİYOLÜMİNESAN KÖK DAMARLARI
    // Ensures zero empty/dead floor space beneath or between stations!
    // =========================================================================
    // Continuous Sub-Bench Bioluminescent Arterial Floor Conduit running from x = 0.8 to x = 30.2
    const floorSpinePts = [];
    for (let i = 0; i <= 24; i++) {
      const fx = 0.8 + (i / 24) * 29.4;
      const fy = -0.58 + 0.12 * Math.sin(fx * 0.55);
      floorSpinePts.push(new THREE.Vector3(fx, fy, 0.12));
    }
    addVascularConduit(floorSpinePts, 0.032, false, 72);

    // 7 Sub-Bench Glowing Nutrient Sump & Peristaltic Reservoir Pods tucked along the floor/plinths
    const sumpLocations = [
      { x: 2.65, y: -0.45 },
      { x: 6.22, y: -0.52 },
      { x: 9.25, y: -0.42 },
      { x: 12.85, y: -0.48 },
      { x: 17.45, y: -0.45 },
      { x: 22.35, y: -0.48 },
      { x: 27.85, y: -0.45 }
    ];
    for (const s of sumpLocations) {
      darkPodList.push(transformGeo(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 16), [s.x, s.y, 0.04], [Math.PI / 2, 0, 0]));
      glassTubeList.push(transformGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 16), [s.x, s.y, 0.22], [Math.PI / 2, 0, 0]));
      nutrientList.push(transformGeo(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 14), [s.x, s.y, 0.20], [Math.PI / 2, 0, 0]));
      flangeList.push(transformGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 16), [s.x, s.y, 0.37], [Math.PI / 2, 0, 0]));
    }

    // Floor Biophilic Basalt Pockets & Moss Cushions along viewing aisle
    const rockA = new THREE.DodecahedronGeometry(0.32, 1);
    const mossGeo = new THREE.DodecahedronGeometry(0.24, 1);
    const biophilicPockets = [
      { x: 0.35, y: -2.15, z: 0.08, s: 1.15 },
      { x: 3.10, y: -1.85, z: 0.06, s: 0.95 },
      { x: 5.85, y: -2.45, z: 0.05, s: 0.85 },
      { x: 9.40, y: -1.95, z: 0.07, s: 1.00 },
      { x: 13.05, y: -2.10, z: 0.08, s: 1.05 },
      { x: 17.85, y: -2.15, z: 0.10, s: 1.20 },
      { x: 22.15, y: -2.20, z: 0.08, s: 1.05 },
      { x: 27.55, y: -2.30, z: 0.08, s: 1.15 }
    ];
    biophilicPockets.forEach((p, idx) => {
      rockList.push(transformGeo(rockA, [p.x, p.y, p.z + 0.06 * p.s], [0.2, idx * 0.8, 0.1], [1.35 * p.s, 0.95 * p.s, 0.58 * p.s]));
      mossList.push(transformGeo(mossGeo, [p.x - 0.10 * p.s, p.y + 0.06 * p.s, p.z + 0.14 * p.s], [0, 0, 0], [1.3 * p.s, 0.95 * p.s, 0.45 * p.s]));
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
      mossGeo: mergeGeometriesFast(mossList)
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    nutrientFlowMat.uniforms.uTime.value = t;
    sporeFlowMat.uniforms.uTime.value = t;
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
      <mesh geometry={batched.mossGeo} material={floorMossMat} />
    </group>
  );
}

/**
 * 2. BİYOLOJİK MİKRO-PEYZAJ / TERRARIUM YATAĞI (Zone B & C çevresi)
 *
 * Includes:
 * - Sculpted velvet moss collars, fertile soil beds & polished river pebbles
 * - Active kinetic Micro-Inoculation & Optical Scanning Arms tending both Petri dishes
 * - Rising bioluminescent spore & humidity micro-mist particles
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

  const mossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#326839',
    roughness: 0.88,
    metalness: 0.0,
    bumpMap: archRelief,
    bumpScale: 0.020
  }), [archRelief]);

  const chartreuseMossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4e823c',
    roughness: 0.88,
    metalness: 0.0,
    bumpMap: archRelief,
    bumpScale: 0.020
  }), [archRelief]);

  const riverPebbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2c372f',
    roughness: 0.36,
    metalness: 0.14,
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
    const mossList = [];
    const chartreuseList = [];
    const pebbleList = [];

    // 1. Intimate Terrarium Collar hugging the Petri Dish at [4.4, -0.15, 1.29]
    const petriSoilPlate = new THREE.CylinderGeometry(0.065, 0.076, 0.016, 32);
    soilList.push(transformGeo(petriSoilPlate, [4.40, -0.15, 1.254], [Math.PI / 2, 0, 0]));

    const mossTorusGeo = new THREE.TorusGeometry(0.054, 0.009, 10, 36);
    mossList.push(transformGeo(mossTorusGeo, [4.40, -0.15, 1.266], [0, 0, 0], [1.0, 1.0, 0.65]));

    const microMossGeo = new THREE.DodecahedronGeometry(0.009, 1);
    const numMicroMoss = 18;
    for (let i = 0; i < numMicroMoss; i++) {
      const a = (i / numMicroMoss) * Math.PI * 2;
      const r = 0.048 + 0.010 * (i % 3);
      const mx = 4.40 + Math.cos(a) * r;
      const my = -0.15 + Math.sin(a) * r;
      const mz = 1.268 + 0.003 * Math.sin(i * 1.8);
      const targetList = i % 2 === 0 ? chartreuseList : mossList;
      targetList.push(transformGeo(microMossGeo, [mx, my, mz], [0.1, i * 0.45, 0.05], [1.15, 1.05, 0.55]));
    }

    const microPebbleGeo = new THREE.DodecahedronGeometry(0.0055, 1);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.20;
      const r = 0.056 + 0.004 * (k % 2);
      pebbleList.push(transformGeo(
        microPebbleGeo,
        [4.40 + Math.cos(a) * r, -0.15 + Math.sin(a) * r, 1.265],
        [0.2, k * 1.1, 0.1],
        [1.2, 0.9, 0.6]
      ));
    }

    // 2. Wide Terrarium Basin around Zone B (Bench Top z = 1.225)
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

    const soilGeo1 = new THREE.CylinderGeometry(0.78, 0.82, 0.018, 36);
    soilList.push(transformGeo(soilGeo1, [4.4, -0.15, zB + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    const mossPillow = new THREE.DodecahedronGeometry(0.065, 1);
    const mossBLocations = [
      { x: 3.75, y: -0.46, z: zB + 0.024, s: 1.25, type: 'dark' },
      { x: 5.05, y: -0.48, z: zB + 0.024, s: 1.20, type: 'chartreuse' },
      { x: 3.65, y: -0.12, z: zB + 0.022, s: 1.10, type: 'dark' },
      { x: 5.15, y: -0.10, z: zB + 0.024, s: 1.15, type: 'chartreuse' },
      { x: 3.70, y: 0.12, z: zB + 0.020, s: 1.05, type: 'chartreuse' },
      { x: 5.10, y: 0.14, z: zB + 0.020, s: 1.05, type: 'dark' }
    ];
    mossBLocations.forEach((m, idx) => {
      const targetList = m.type === 'dark' ? mossList : chartreuseList;
      targetList.push(transformGeo(mossPillow, [m.x, m.y, m.z], [0.12, idx * 0.85, 0.06], [1.35 * m.s, 1.15 * m.s, 0.42 * m.s]));
    });

    const pebbleGeo = new THREE.DodecahedronGeometry(0.038, 1);
    const pebbleBLocations = [
      { x: 3.95, y: -0.55, z: zB + 0.020, s: 0.9 },
      { x: 4.85, y: -0.58, z: zB + 0.020, s: 1.0 },
      { x: 3.55, y: 0.12, z: zB + 0.022, s: 1.1 },
      { x: 5.20, y: 0.18, z: zB + 0.022, s: 0.95 }
    ];
    pebbleBLocations.forEach((p, idx) => {
      pebbleList.push(transformGeo(pebbleGeo, [p.x, p.y, p.z], [0.3, idx * 0.9, 0.2], [1.2 * p.s, 0.85 * p.s, 0.55 * p.s]));
    });

    // 3. Terrarium Basin 2: Zone C (Isolation Bench Top z = 1.205)
    const zC = 1.208;
    const isolSoilPlate = new THREE.CylinderGeometry(0.088, 0.096, 0.016, 32);
    soilList.push(transformGeo(isolSoilPlate, [8.06, -0.20, zC + 0.046], [Math.PI / 2, 0, 0]));

    const isolTorusGeo = new THREE.TorusGeometry(0.076, 0.011, 10, 36);
    mossList.push(transformGeo(isolTorusGeo, [8.06, -0.20, zC + 0.056], [0, 0, 0], [1.0, 1.0, 0.65]));

    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = 0.072 + 0.010 * (i % 3);
      const mx = 8.06 + Math.cos(a) * r;
      const my = -0.20 + Math.sin(a) * r;
      const mz = zC + 0.058 + 0.003 * Math.sin(i * 1.8);
      const targetList = i % 2 === 0 ? chartreuseList : mossList;
      targetList.push(transformGeo(microMossGeo, [mx, my, mz], [0.1, i * 0.45, 0.05], [1.15, 1.05, 0.55]));
    }

    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.15;
      const r = 0.084 + 0.006 * (k % 2);
      pebbleList.push(transformGeo(
        microPebbleGeo,
        [8.06 + Math.cos(a) * r, -0.20 + Math.sin(a) * r, zC + 0.056],
        [0.2, k * 1.1, 0.1],
        [1.2, 0.9, 0.6]
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

    const soilGeo2 = new THREE.CylinderGeometry(0.80, 0.84, 0.018, 36);
    soilList.push(transformGeo(soilGeo2, [8.06, -0.20, zC + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    const mossCLocations = [
      { x: 7.35, y: -0.48, z: zC + 0.024, s: 1.20, type: 'dark' },
      { x: 8.75, y: -0.50, z: zC + 0.024, s: 1.25, type: 'chartreuse' },
      { x: 7.25, y: -0.15, z: zC + 0.022, s: 1.10, type: 'chartreuse' },
      { x: 8.85, y: -0.12, z: zC + 0.024, s: 1.15, type: 'dark' },
      { x: 7.45, y: 0.20, z: zC + 0.024, s: 1.15, type: 'dark' },
      { x: 8.68, y: 0.22, z: zC + 0.024, s: 1.15, type: 'dark' }
    ];
    mossCLocations.forEach((m, idx) => {
      const targetList = m.type === 'dark' ? mossList : chartreuseList;
      targetList.push(transformGeo(mossPillow, [m.x, m.y, m.z], [0.15, idx * 0.8, 0.08], [1.35 * m.s, 1.15 * m.s, 0.42 * m.s]));
    });

    // Articulated Micro-Inoculation & Optical Scanning Arm Geometry (centered at pivot [0,0,0])
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
      mossGeo: mergeGeometriesFast(mossList),
      chartreuseGeo: mergeGeometriesFast(chartreuseList),
      pebbleGeo: mergeGeometriesFast(pebbleList),
      armGeo,
      dropletTipGeo,
      mist: { mistPos, mistPhase, mistScale }
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    mistMat.uniforms.uTime.value = t;
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
      <mesh geometry={batched.mossGeo} material={mossMat} />
      <mesh geometry={batched.chartreuseGeo} material={chartreuseMossMat} />
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
 * Physically connected to the overhead vascular lines AND down into the Zone D & E vessels below!
 * Each droplet actively breathes/pulsates while its internal fungal biomass clump levitates and spins.
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

  const batched = useMemo(() => {
    const glassList = [];
    const collarList = [];
    const cableList = [];

    for (const d of DROPLET_SPECS) {
      const s = d.scale;
      // Outer Teardrop Glass Shell
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

      // Collar rings at equator, top crown, and bottom nozzle valve
      collarList.push(transformGeo(new THREE.TorusGeometry(0.182 * s, 0.012 * s, 8, 28), [d.x, d.y, d.z + 0.06 * s]));
      collarList.push(transformGeo(new THREE.TorusGeometry(0.065 * s, 0.010 * s, 8, 20), [d.x, d.y, d.z + 0.24 * s]));
      collarList.push(transformGeo(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.04 * s, 12), [d.x, d.y, d.z - 0.32 * s], [Math.PI / 2, 0, 0]));

      // Suspension Tendril Cable extending straight up to the ceiling vault (z ≈ 4.85)
      const cableHeight = 4.85 - (d.z + 0.24 * s);
      cableList.push(transformGeo(
        new THREE.CylinderGeometry(0.0045, 0.0045, cableHeight, 6),
        [d.x, d.y, (d.z + 0.24 * s) + cableHeight * 0.5],
        [Math.PI / 2, 0, 0]
      ));

      // Top Vascular Feeder Conduit descending from overhead arterial line (z = 3.95, y = 1.65) into droplet top crown
      const topFeederCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(d.x, 1.65, 3.95),
        new THREE.Vector3(d.x - 0.12, d.y + 0.55, d.z + 0.65 * s),
        new THREE.Vector3(d.x, d.y, d.z + 0.24 * s)
      ]);
      glassList.push(new THREE.TubeGeometry(topFeederCurve, 18, 0.011 * s, 6, false));

      // Bottom Inoculation & Drainage Capillary Conduit connecting droplet bottom tip directly to the vessel/shaker below!
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

    // Per-droplet local geometries for real-time breathing & rotation
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
    DROPLET_SPECS.forEach((d, idx) => {
      const s = d.scale;
      const coreMesh = coreRefs.current[idx];
      const liqMesh = liquidRefs.current[idx];
      if (coreMesh) {
        // Buoyant levitation bobbing + gentle orbital spin of the cultured fungal biomass clump
        coreMesh.position.z = d.z - 0.04 * s + Math.sin(t * 2.1 + idx * 1.3) * 0.022;
        coreMesh.rotation.z = t * (0.65 + idx * 0.12);
        coreMesh.rotation.x = Math.sin(t * 1.4 + idx) * 0.18;
      }
      if (liqMesh) {
        // Peristaltic breathing pulsation of the nutrient droplet
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
 *
 * True systolic/diastolic cardiac contraction (double-beat lub-dub waveform)
 * of the metabolic core and pericardial sinews, pumping luminous nutrient waves
 * through the aortic and venous vessels!
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

    // 4 Helical Mycelial Pericardial Sinews centered around [0, 0, 0] (at world [25.0, 0.0, 2.30]) so they contract with the heart!
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

    // Primary Aortic Arch Vessel
    const aortaPoints = [
      new THREE.Vector3(hX, hY, 3.56),
      new THREE.Vector3(hX - 0.25, hY + 0.18, 3.98),
      new THREE.Vector3(hX - 0.75, hY + 0.32, 4.32),
      new THREE.Vector3(hX - 1.55, hY + 0.40, 4.46),
      new THREE.Vector3(hX - 2.45, hY + 0.45, 4.42)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.068, 10, false));
    pulseVesselList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.048, 8, false));

    // Venous Return Conduit
    const venousPoints = [
      new THREE.Vector3(hX + 0.58, hY + 0.25, 3.52),
      new THREE.Vector3(hX + 1.05, hY + 0.35, 3.25),
      new THREE.Vector3(hX + 1.18, hY + 0.14, 2.45),
      new THREE.Vector3(hX + 0.96, hY - 0.14, 1.75),
      new THREE.Vector3(hX + 0.52, hY - 0.25, 1.35)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.054, 10, false));
    pulseVesselList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.036, 8, false));

    // Central Metabolic Bioreactor Heart Core (centered at [0,0,0] for clean systolic/diastolic scaling)
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

    // Realistic cardiac "lub-dub" systolic/diastolic waveform
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
