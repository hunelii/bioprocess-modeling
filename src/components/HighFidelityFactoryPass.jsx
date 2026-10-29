import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

// Pure 3D Architectural, Precision Fermenter Interior (Zone G) & Chalkboard + Scientist Desk (Zone H) Pass.
// Zero 2D texture uploads, geometry-batched by material for 60fps scroll performance.

const brothVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;
  void main() {
    vUv = uv;
    vLocalPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

// Semi-translucent golden-amber fermentation broth so the internal coil, impellers, baffles & sparger shine through
const brothFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec3 vLocalPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);

    float swirl1 = sin(vUv.x * 18.0 + vUv.y * 9.0 - uTime * 1.4) * cos(vUv.y * 14.0 - uTime * 0.9);
    float swirl2 = cos(vUv.x * 28.0 - vUv.y * 12.0 + uTime * 1.9);
    float caustic = clamp(0.5 + 0.28 * swirl1 + 0.16 * swirl2, 0.0, 1.0);

    float coreLight = (1.0 - abs(vUv.y - 0.46) * 1.25) * (0.40 + 0.55 * ndotv);
    vec3 deepAmber = vec3(0.36, 0.18, 0.05);
    vec3 goldenBroth = vec3(0.84, 0.56, 0.18);
    vec3 aeratedFoam = vec3(0.96, 0.88, 0.68);

    vec3 col = mix(deepAmber, goldenBroth, clamp(coreLight + caustic * 0.35, 0.0, 1.0));
    float topFoam = smoothstep(0.88, 0.99, vUv.y);
    col = mix(col, aeratedFoam, topFoam * 0.72);

    // Edge fresnel keeps the outer glass silhouette crisp while the center is crystal clear to reveal internal hardware
    float alpha = mix(0.52, 0.28, ndotv) + topFoam * 0.25;
    gl_FragColor = vec4(col, alpha);
  }
`;

const chalkboardVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Realistic dusty dark-green/slate academic chalkboard surface with wiped chalk clouds & subtle grid
const chalkboardFragmentShader = `
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Base dark slate green-black chalkboard tone
    vec3 slateBase = vec3(0.085, 0.125, 0.105);
    vec3 chalkDustColor = vec3(0.76, 0.80, 0.77);

    // Multi-scale erased chalk smudge clouds (diagonal wiping strokes)
    vec2 wipeUv = vec2(vUv.x * 6.0 + vUv.y * 2.5, vUv.y * 5.0 - vUv.x * 1.5);
    float smudge1 = noise(wipeUv);
    float smudge2 = noise(wipeUv * 2.7 + 4.2);
    float fineGrain = noise(vUv * vec2(180.0, 90.0));

    // Concentrate chalk eraser dust in the active drawing zones
    float centerMask = smoothstep(0.04, 0.18, vUv.x) * smoothstep(0.96, 0.82, vUv.x)
                     * smoothstep(0.06, 0.22, vUv.y) * smoothstep(0.94, 0.78, vUv.y);
    float dust = (smudge1 * 0.55 + smudge2 * 0.35 + fineGrain * 0.10) * centerMask * 0.22;

    // Subtle faint chalk graph grid in the middle panel (vUv.x in 0.34..0.66)
    float inGrid = step(0.33, vUv.x) * step(vUv.x, 0.67) * step(0.16, vUv.y) * step(vUv.y, 0.82);
    float gx = abs(fract(vUv.x * 28.0) - 0.5);
    float gy = abs(fract(vUv.y * 14.0) - 0.5);
    float gridLine = (1.0 - smoothstep(0.0, 0.045, min(gx, gy))) * inGrid * 0.11;

    // Subtle border vignette near the wooden frame
    float edgeDark = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
                   * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

    vec3 col = mix(slateBase * 0.75, slateBase, edgeDark);
    col = mix(col, chalkDustColor, dust + gridLine);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function CathedralArchitectureAndBiophilia() {
  const darkArchMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#16211b', metalness: 0.65, roughness: 0.45, envMapIntensity: 0.65
  }), []);

  const brushedSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.72, roughness: 0.36, envMapIntensity: 0.75
  }), []);

  const copperPipeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f7355', metalness: 0.68, roughness: 0.38, envMapIntensity: 0.7
  }), []);

  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1b231e', roughness: 0.92, metalness: 0.06
  }), []);

  const mossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#26422c', roughness: 0.92, metalness: 0.0
  }), []);

  const batched = useMemo(() => {
    const steelList = [];
    const darkArchList = [];
    const rockList = [];
    const mossList = [];

    // Note: Stepped platforms under tables/benches have been removed so all original bench/table surfaces remain in their original state.

    // Overhead pipes & catwalk rails
    steelList.push(transformGeo(new THREE.CylinderGeometry(0.055, 0.055, 33.0, 10), [16.0, 1.45, 3.78], [0, 0, Math.PI / 2]));
    steelList.push(transformGeo(new THREE.CylinderGeometry(0.042, 0.042, 33.0, 10), [16.0, 1.62, 3.96], [0, 0, Math.PI / 2]));
    steelList.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 33.0, 8), [16.0, 1.95, 3.98], [0, 0, Math.PI / 2]));

    darkArchList.push(transformGeo(new THREE.CylinderGeometry(0.065, 0.065, 33.0, 10), [16.0, 1.85, 4.18], [0, 0, Math.PI / 2]));
    darkArchList.push(transformGeo(new THREE.BoxGeometry(33.0, 0.85, 0.08), [16.0, 2.35, 3.52]));

    const colBox = new THREE.BoxGeometry(0.18, 0.24, 3.5);
    const kneeTorus = new THREE.TorusGeometry(1.15, 0.055, 8, 16, Math.PI * 0.5);

    for (const xCol of [0.15, 2.5, 6.0, 9.0, 13.0, 18.0, 22.0, 28.0, 31.9]) {
      darkArchList.push(transformGeo(colBox, [xCol, 2.80, 1.85]));
      darkArchList.push(transformGeo(kneeTorus, [xCol, 1.50, 3.85], [Math.PI / 2, 0, 0]));
    }

    const rockA = new THREE.DodecahedronGeometry(0.32, 1);
    const mossGeo = new THREE.DodecahedronGeometry(0.24, 1);

    const biophilicPockets = [
      { x: 0.35, y: -2.15, z: 0.08, s: 1.15 },
      { x: 5.85, y: -2.45, z: 0.05, s: 0.85 },
      { x: 13.05, y: -2.10, z: 0.08, s: 1.05 },
      { x: 17.85, y: -2.15, z: 0.10, s: 1.20 },
      { x: 22.15, y: -2.20, z: 0.08, s: 1.05 },
      { x: 27.55, y: -2.30, z: 0.08, s: 1.15 }
    ];

    biophilicPockets.forEach((p, idx) => {
      rockList.push(transformGeo(rockA, [p.x, p.y, p.z + 0.06 * p.s], [0.2, idx * 0.8, 0.1], [1.35 * p.s, 0.95 * p.s, 0.58 * p.s]));
      mossList.push(transformGeo(mossGeo, [p.x - 0.10 * p.s, p.y + 0.06 * p.s, p.z + 0.14 * p.s], [0, 0, 0], [1.3 * p.s, 0.95 * p.s, 0.45 * p.s]));
    });

    const copperPipeGeo = transformGeo(new THREE.CylinderGeometry(0.032, 0.032, 33.0, 8), [16.0, 1.25, 3.64], [0, 0, Math.PI / 2]);

    return {
      copperPipeGeo,
      steelGeo: mergeGeometriesFast(steelList),
      darkArchGeo: mergeGeometriesFast(darkArchList),
      rockGeo: mergeGeometriesFast(rockList),
      mossGeo: mergeGeometriesFast(mossList)
    };
  }, []);

  return (
    <group name="CATHEDRAL_ARCHITECTURE_AND_BIOPHILIA">
      <mesh geometry={batched.steelGeo} material={brushedSteelMat} />
      <mesh geometry={batched.darkArchGeo} material={darkArchMat} />
      <mesh geometry={batched.copperPipeGeo} material={copperPipeMat} />
      <mesh geometry={batched.rockGeo} material={rockMat} />
      <mesh geometry={batched.mossGeo} material={mossMat} />
    </group>
  );
}

function ZoneGFermentationHero({ progressRef }) {
  const groupRef = useRef();
  const agitatorRef = useRef();
  const biomassVortexRef = useRef();
  const bubblesRef = useRef();

  const brothMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: brothVertexShader,
    fragmentShader: brothFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const mirrorSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#b8c7c0', metalness: 0.84, roughness: 0.20, envMapIntensity: 0.95
  }), []);

  const internalCoilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4e2dc', metalness: 0.88, roughness: 0.16, envMapIntensity: 1.05
  }), []);

  const copperSensorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c9935b', metalness: 0.78, roughness: 0.25, envMapIntensity: 0.85
  }), []);

  const brushedSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8c9992', metalness: 0.72, roughness: 0.34, envMapIntensity: 0.75
  }), []);

  const darkIndustrialMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#18221d', metalness: 0.65, roughness: 0.42
  }), []);

  const sightGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#def2e7', opacity: 0.20, roughness: 0.06, envMapIntensity: 0.95, side: THREE.DoubleSide
  }), []);

  const mycelialBiomassMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7ebd2',
    emissive: '#7a4e16',
    emissiveIntensity: 0.25,
    roughness: 0.55,
    metalness: 0.02
  }), []);

  const bubbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff9e6',
    emissive: '#ffcf70',
    emissiveIntensity: 0.42,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82
  }), []);

  const foamCapMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5e8cc',
    emissive: '#6e4918',
    emissiveIntensity: 0.18,
    roughness: 0.65,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  }), []);

  const batched = useMemo(() => {
    const mirrorList = [];
    const boltList = [];
    const stairSteelList = [];
    const internalStaticSteel = [];
    const sensorCopperList = [];

    // 1. Exterior Upper & Lower Stainless-Steel Jacketed Vessel Sections (replacing opaque G_reactor_shell so middle z=1.64..3.52 is 100% transparent glass!)
    // Lower stainless jacket (z = 0.81..1.64)
    mirrorList.push(transformGeo(new THREE.CylinderGeometry(1.05, 1.05, 0.83, 36), [25.0, 0, 1.225], [Math.PI / 2, 0, 0]));
    // Bottom dished torispherical head below skirt
    mirrorList.push(transformGeo(new THREE.SphereGeometry(1.04, 28, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), [25.0, 0, 0.82], [Math.PI / 2, 0, 0], [1, 0.32, 1]));
    // Upper domed head & sight-section heavy flanges
    mirrorList.push(transformGeo(new THREE.SphereGeometry(1.08, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), [25.0, 0, 3.56], [0, 0, 0], [1, 1, 0.36]));
    mirrorList.push(transformGeo(new THREE.CylinderGeometry(1.14, 1.14, 0.09, 36), [25.0, 0, 3.52], [Math.PI / 2, 0, 0]));
    mirrorList.push(transformGeo(new THREE.CylinderGeometry(1.14, 1.14, 0.09, 36), [25.0, 0, 1.64], [Math.PI / 2, 0, 0]));
    // Intermediate sight-glass stiffening ring with front viewing window cutout
    mirrorList.push(transformGeo(new THREE.TorusGeometry(1.06, 0.024, 10, 40), [25.0, 0, 3.08]));

    // Front circular observation porthole frame bezel on the glass wall (at y = -1.045, z = 2.19)
    mirrorList.push(transformGeo(new THREE.TorusGeometry(0.49, 0.032, 12, 36), [25.0, -1.045, 2.19], [Math.PI / 2, 0, 0]));

    const boltCyl = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6);
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const bx = 25.0 + Math.cos(ang) * 1.10;
      const by = Math.sin(ang) * 1.10;
      boltList.push(transformGeo(boltCyl, [bx, by, 3.58], [Math.PI / 2, 0, 0]));
      boltList.push(transformGeo(boltCyl, [bx, by, 1.70], [Math.PI / 2, 0, 0]));
    }
    // Porthole bezel bolts
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      boltList.push(transformGeo(
        new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6),
        [25.0 + Math.cos(ang) * 0.49, -1.075, 2.19 + Math.sin(ang) * 0.49]
      ));
    }

    // 6 External Structural Tie-Rods outside the glass cylinder
    const tieCol = new THREE.CylinderGeometry(0.032, 0.032, 1.88, 8);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + 0.32;
      mirrorList.push(transformGeo(tieCol, [25.0 + Math.cos(ang) * 1.09, Math.sin(ang) * 1.09, 2.58], [Math.PI / 2, 0, 0]));
    }

    // Overhead process manifolds
    const curves = [
      [[23.35, -0.35, 0.75], [23.35, -0.35, 3.85], [23.75, -0.35, 4.15], [24.35, -0.35, 4.15]],
      [[25.55, 0.15, 3.85], [25.55, 0.15, 4.45], [27.45, 0.15, 4.45], [27.45, 0.15, 3.15]],
      [[25.82, 0.35, 3.65], [25.82, 0.35, 4.22], [27.85, 0.35, 4.22], [27.85, 0.35, 3.05]]
    ];
    curves.forEach((pts, idx) => {
      mirrorList.push(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))),
        20, idx === 1 ? 0.075 : 0.052, 8, false
      ));
    });

    // Analog Pressure Manometer Gauges (Basınç Saatleri) on the Top Head & Manifold Pipes
    const gaugeSpecs = [
      { x: 24.32, y: -0.62, z: 3.76 },
      { x: 25.55, y: -0.45, z: 3.82 },
      { x: 23.35, y: -0.44, z: 2.65 }
    ];
    for (const g of gaugeSpecs) {
      // Stainless stem & dial bezel facing -Y (camera side)
      mirrorList.push(transformGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 8), [g.x, g.y + 0.03, g.z - 0.05], [Math.PI / 2, 0, 0]));
      mirrorList.push(transformGeo(new THREE.CylinderGeometry(0.088, 0.088, 0.036, 18), [g.x, g.y, g.z], [0, 0, 0]));
      // Dark indicator needle inside the pressure gauge
      boltList.push(transformGeo(new THREE.BoxGeometry(0.055, 0.008, 0.008), [g.x + 0.012, g.y - 0.020, g.z + 0.01], [0, 0.65, 0]));
    }

    // Spoked Process Valve Handwheels (Vana Volanları) on Manifold Lines
    const wheelSpecs = [
      { x: 23.35, y: -0.52, z: 2.15, rotX: 0 },
      { x: 23.35, y: -0.52, z: 3.25, rotX: 0 },
      { x: 26.25, y: 0.02, z: 4.45, rotX: Math.PI / 2 },
      { x: 24.15, y: -0.82, z: 1.32, rotX: 0 }
    ];
    for (const w of wheelSpecs) {
      sensorCopperList.push(transformGeo(new THREE.TorusGeometry(0.105, 0.014, 8, 18), [w.x, w.y, w.z], [Math.PI / 2 + w.rotX, 0, 0]));
      sensorCopperList.push(transformGeo(new THREE.CylinderGeometry(0.010, 0.010, 0.20, 6), [w.x, w.y, w.z], [w.rotX, 0, Math.PI / 2]));
      sensorCopperList.push(transformGeo(new THREE.CylinderGeometry(0.010, 0.010, 0.20, 6), [w.x, w.y, w.z], [Math.PI / 2 + w.rotX, 0, 0]));
      mirrorList.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), [w.x, w.y + 0.07, w.z]));
    }

    // Sanitary Sampling Spigot Valve (Numune Alma Musluğu) + Stainless Drip Shelf & Sample Flask at [24.15, -0.95, 1.05]
    mirrorList.push(
      transformGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 10), [24.15, -0.88, 1.24]),
      transformGeo(new THREE.CylinderGeometry(0.012, 0.008, 0.09, 8), [24.15, -0.98, 1.19], [Math.PI / 2, 0, 0]),
      // Perforated stainless sample tray bracket holding the Erlenmeyer flask
      transformGeo(new THREE.CylinderGeometry(0.14, 0.12, 0.022, 18), [24.15, -0.98, 0.92], [Math.PI / 2, 0, 0]),
      // Conical Erlenmeyer sample flask neck & base sitting under the sampling valve
      transformGeo(new THREE.ConeGeometry(0.095, 0.16, 18), [24.15, -0.98, 1.01], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.028, 0.032, 0.07, 14), [24.15, -0.98, 1.11], [Math.PI / 2, 0, 0])
    );
    // Golden sample broth inside the Erlenmeyer flask
    sensorCopperList.push(transformGeo(new THREE.ConeGeometry(0.088, 0.10, 16), [24.15, -0.98, 0.985], [Math.PI / 2, 0, 0]));

    // Access staircase
    const stepBox = new THREE.BoxGeometry(0.22, 0.82, 0.035);
    for (let s = 0; s < 7; s++) {
      const sx = 27.25 + s * 0.14 - 0.42;
      const sy = -1.05 + s * 0.12;
      const sz = 0.28 + s * 0.12 + 0.08;
      stairSteelList.push(transformGeo(stepBox, [sx, sy, sz]));
    }
    const railBar = new THREE.CylinderGeometry(0.016, 0.016, 1.35, 8);
    const postBar = new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8);
    for (const yRail of [-0.40, 0.40]) {
      mirrorList.push(transformGeo(railBar, [27.25, -1.05 + yRail + 0.36, 0.28 + 1.12], [0, -0.58, 0]));
      [-0.42, 0.0, 0.42].forEach((xPost, pIdx) => {
        stairSteelList.push(transformGeo(
          postBar,
          [27.25 + xPost, -1.05 + yRail + pIdx * 0.36, 0.28 + 0.55 + pIdx * 0.36],
          [Math.PI / 2, 0, 0]
        ));
      });
    }

    // ============================================================================
    // 2. DETAILED INTERIOR HARDWARE INSIDE THE FERMENTER GLASS (x=25.0, y=0.0, z=1.64..3.50)
    // ============================================================================

    // A. 7-Turn Helical Serpentine Heat-Exchanger Cooling Coil (r = 0.74m, z = 1.76..2.92)
    const coilPts = [];
    const turns = 7.0;
    const coilSteps = 64;
    const coilR = 0.74;
    for (let i = 0; i <= coilSteps; i++) {
      const t = i / coilSteps;
      const theta = t * turns * Math.PI * 2;
      const cz = 1.76 + t * 1.14;
      coilPts.push(new THREE.Vector3(
        25.0 + Math.cos(theta) * coilR,
        Math.sin(theta) * coilR,
        cz
      ));
    }
    internalStaticSteel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 64, 0.024, 6, false));
    // Vertical cooling-water supply & return risers for the helical coil + 4 vertical coil support struts
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.024, 0.024, 1.76, 8), [25.0 + coilR, 0, 2.64], [Math.PI / 2, 0, 0]));
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.65, 8), [25.0 - coilR, 0, 3.20], [Math.PI / 2, 0, 0]));
    for (let c = 0; c < 4; c++) {
      const ca = (c / 4) * Math.PI * 2 + 0.35;
      internalStaticSteel.push(transformGeo(
        new THREE.BoxGeometry(0.022, 0.045, 1.22),
        [25.0 + Math.cos(ca) * (coilR + 0.028), Math.sin(ca) * (coilR + 0.028), 2.33],
        [0, 0, ca + Math.PI / 2]
      ));
    }

    // B. 4 Vertical Anti-Vortex Wall Baffles (r = 0.92m, z = 1.70..3.36) with stand-off brackets
    const bafflePlate = new THREE.BoxGeometry(0.11, 0.018, 1.64);
    const baffleBracket = new THREE.BoxGeometry(0.08, 0.024, 0.035);
    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * Math.PI * 2 + Math.PI * 0.25;
      const bx = 25.0 + Math.cos(ba) * 0.91;
      const by = Math.sin(ba) * 0.91;
      internalStaticSteel.push(transformGeo(bafflePlate, [bx, by, 2.52], [0, 0, ba]));
      for (const bz of [1.82, 2.52, 3.22]) {
        internalStaticSteel.push(transformGeo(
          baffleBracket,
          [25.0 + Math.cos(ba) * 0.97, Math.sin(ba) * 0.97, bz],
          [0, 0, ba]
        ));
      }
    }

    // C. Bottom Perforated Toroidal Oxygen Ring Sparger (z = 1.71, r = 0.50m) + O2 feed downcomer pipe
    internalStaticSteel.push(transformGeo(new THREE.TorusGeometry(0.50, 0.028, 10, 36), [25.0, 0, 1.71]));
    // Cross-sparger spoke bars & centralsteady bearing spider at bottom of vessel
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 1.00, 8), [25.0, 0, 1.71], [0, 0, Math.PI / 2]));
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.018, 0.018, 1.00, 8), [25.0, 0, 1.71]));
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.095, 0.11, 0.08, 16), [25.0, 0, 1.68], [Math.PI / 2, 0, 0]));
    // Sparger air-supply downcomer pipe from top head
    internalStaticSteel.push(transformGeo(new THREE.CylinderGeometry(0.022, 0.022, 1.80, 8), [25.0 - 0.50, -0.18, 2.61], [Math.PI / 2, 0, 0]));

    // D. Immersion Sensor Probes (pH, Dissolved Oxygen, Temperature, Foam Probe) in copper/brass & steel housings
    const probeSpecs = [
      { x: 24.46, y: -0.36, zTop: 3.50, len: 1.45, r: 0.022 },
      { x: 25.54, y: -0.34, zTop: 3.50, len: 1.55, r: 0.022 },
      { x: 24.64, y: 0.38, zTop: 3.50, len: 1.30, r: 0.019 },
      { x: 25.32, y: -0.28, zTop: 3.50, len: 0.58, r: 0.018 }
    ];
    for (const pr of probeSpecs) {
      sensorCopperList.push(transformGeo(
        new THREE.CylinderGeometry(pr.r, pr.r * 0.85, pr.len, 10),
        [pr.x, pr.y, pr.zTop - pr.len * 0.5],
        [Math.PI / 2, 0, 0]
      ));
      sensorCopperList.push(transformGeo(
        new THREE.CylinderGeometry(pr.r * 1.6, pr.r * 1.6, 0.06, 10),
        [pr.x, pr.y, pr.zTop - 0.04],
        [Math.PI / 2, 0, 0]
      ));
      // Coiled sensor transmitter cable curving from probe head into top junction manifold
      const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(pr.x, pr.y, pr.zTop + 0.02),
        new THREE.Vector3(pr.x + (pr.x < 25 ? -0.10 : 0.10), pr.y - 0.08, pr.zTop + 0.22),
        new THREE.Vector3(25.0 + (pr.x < 25 ? -0.22 : 0.22), 0.0, pr.zTop + 0.34)
      ]);
      boltList.push(new THREE.TubeGeometry(cableCurve, 10, 0.008, 5, false));
    }

    // ============================================================================
    // 3. ROTATING CENTRAL AGITATOR SHAFT & 4-STAGE IMPELLER TURBINE RIG (centered at local 0,0,0)
    // ============================================================================
    const agitatorList = [];
    // Central heavy drive shaft (z = 1.66..3.54 -> local z = -0.84..+1.04 relative to z=2.50)
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.048, 0.048, 1.88, 16), [0, 0, 0.10], [Math.PI / 2, 0, 0]));
    // Flanged shaft couplings & mechanical seal housing
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.095, 0.095, 0.11, 16), [0, 0, 0.72], [Math.PI / 2, 0, 0]));
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.13, 0.10, 0.16, 16), [0, 0, 0.94], [Math.PI / 2, 0, 0]));

    // Stage 1 (Bottom, z = 1.88 -> local z = -0.62): 6-Blade Rushton Radial Disc Turbine
    const rushtonZ = -0.62;
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 16), [0, 0, rushtonZ], [Math.PI / 2, 0, 0]));
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.36, 0.36, 0.022, 24), [0, 0, rushtonZ], [Math.PI / 2, 0, 0]));
    const rushtonBlade = new THREE.BoxGeometry(0.22, 0.020, 0.115);
    for (let b = 0; b < 6; b++) {
      const ba = (b / 6) * Math.PI * 2;
      agitatorList.push(transformGeo(rushtonBlade, [Math.cos(ba) * 0.35, Math.sin(ba) * 0.35, rushtonZ], [0, 0, ba]));
    }

    // Stage 2 (Lower-Mid, z = 2.30 -> local z = -0.20): 4-Blade Pitched Hydrofoil Axial Turbine
    const hydro1Z = -0.20;
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.105, 0.105, 0.085, 16), [0, 0, hydro1Z], [Math.PI / 2, 0, 0]));
    const pitchedBlade = new THREE.BoxGeometry(0.38, 0.016, 0.105);
    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * Math.PI * 2 + 0.4;
      agitatorList.push(transformGeo(pitchedBlade, [Math.cos(ba) * 0.26, Math.sin(ba) * 0.26, hydro1Z], [0.58, 0, ba]));
    }

    // Stage 3 (Upper-Mid, z = 2.72 -> local z = +0.22): 4-Blade Pitched Hydrofoil Axial Turbine
    const hydro2Z = 0.22;
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.105, 0.105, 0.085, 16), [0, 0, hydro2Z], [Math.PI / 2, 0, 0]));
    for (let b = 0; b < 4; b++) {
      const ba = (b / 4) * Math.PI * 2 + 1.18;
      agitatorList.push(transformGeo(pitchedBlade, [Math.cos(ba) * 0.25, Math.sin(ba) * 0.25, hydro2Z], [0.58, 0, ba]));
    }

    // Stage 4 (Headspace Foam-Breaker, z = 3.12 -> local z = +0.62): 6-arm mechanical foam breaker paddle
    const foamZ = 0.62;
    agitatorList.push(transformGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12), [0, 0, foamZ], [Math.PI / 2, 0, 0]));
    const foamBar = new THREE.BoxGeometry(0.46, 0.014, 0.045);
    for (let b = 0; b < 3; b++) {
      agitatorList.push(transformGeo(foamBar, [0, 0, foamZ], [0, 0, (b / 3) * Math.PI]));
    }

    // ============================================================================
    // 4. SWIRLING 3D MYCELIAL BIOMASS RIBBONS & PELLETS + 300 RISING O2 BUBBLES
    // ============================================================================
    const biomassGeos = [];
    let seed = 772913;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    // 18 Swirling helical mycelial cords suspended in the vortex around the impellers
    for (let s = 0; s < 18; s++) {
      const baseAng = (s / 18) * Math.PI * 2 + rand() * 0.3;
      const baseR = 0.24 + rand() * 0.44;
      const zStart = -0.68 + rand() * 0.85;
      const pts = [];
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        const a = baseAng + u * (1.2 + rand() * 0.8);
        const r = baseR + Math.sin(u * Math.PI * 2 + s) * 0.06;
        const z = zStart + u * 0.32 + Math.cos(u * Math.PI + s) * 0.03;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
      }
      const tubeR = 0.010 + (s % 4) * 0.004;
      biomassGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, tubeR, 5, false));
    }
    // 32 Buoyant golden-cream fungal pellets/flocs circulating through the broth
    const pelletGeo = new THREE.DodecahedronGeometry(0.026, 0);
    for (let p = 0; p < 32; p++) {
      const pa = rand() * Math.PI * 2;
      const pr = 0.16 + rand() * 0.56;
      const pz = -0.70 + rand() * 1.08;
      const sx = 0.65 + rand() * 0.95;
      const sy = 0.65 + rand() * 0.95;
      const sz = 0.55 + rand() * 0.75;
      biomassGeos.push(transformGeo(pelletGeo, [Math.cos(pa) * pr, Math.sin(pa) * pr, pz], [rand() * 3, rand() * 3, 0], [sx, sy, sz]));
    }

    // 140 Rising Specular Oxygen Bubbles from the bottom ring sparger
    const bubbleGeos = [];
    const sphereBubble = new THREE.OctahedronGeometry(0.014, 0);
    for (let i = 0; i < 140; i++) {
      const ba = rand() * Math.PI * 2;
      const br = 0.14 + rand() * 0.72;
      const bz = -0.76 + rand() * 1.16;
      const bs = 0.45 + rand() * 1.15;
      bubbleGeos.push(transformGeo(sphereBubble, [Math.cos(ba) * br, Math.sin(ba) * br, bz], [0, 0, 0], [bs, bs, bs * 1.15]));
    }

    return {
      mirrorGeo: mergeGeometriesFast(mirrorList),
      boltsGeo: mergeGeometriesFast(boltList),
      stairSteelGeo: mergeGeometriesFast(stairSteelList),
      internalStaticGeo: mergeGeometriesFast(internalStaticSteel),
      sensorCopperGeo: mergeGeometriesFast(sensorCopperList),
      agitatorGeo: mergeGeometriesFast(agitatorList),
      biomassVortexGeo: mergeGeometriesFast(biomassGeos),
      bubblesGeo: mergeGeometriesFast(bubbleGeos)
    };
  }, []);

  const lastP = useRef(-1);
  useFrame(() => {
    const p = progressRef.current;
    const active = p >= 0.66;
    if (groupRef.current) groupRef.current.visible = active;
    if (!active) return;
    if (Math.abs(p - lastP.current) < 0.0002) return;
    lastP.current = p;

    brothMat.uniforms.uTime.value = p * 28.0;
    if (agitatorRef.current) {
      agitatorRef.current.rotation.z = p * 85.0;
    }
    if (biomassVortexRef.current) {
      biomassVortexRef.current.rotation.z = p * 52.0;
    }
    if (bubblesRef.current) {
      bubblesRef.current.rotation.z = -p * 24.0;
      bubblesRef.current.position.z = 2.50 + ((p * 18.0) % 0.14) - 0.07;
    }
  });

  return (
    <group ref={groupRef} name="ZONE_G_PRECISION_FERMENTATION_HERO" visible={false}>
      {/* Exterior Vessel Flanges, Lower Jacket, Upper Dome & Manifolds */}
      <mesh geometry={batched.mirrorGeo} material={mirrorSteelMat} />
      <mesh geometry={batched.boltsGeo} material={darkIndustrialMat} />
      <mesh geometry={batched.stairSteelGeo} material={brushedSteelMat} />

      {/* Internal Helical Cooling Coil, 4 Wall Baffles, Bottom Toroidal Ring Sparger & Sensor Probes */}
      <mesh geometry={batched.internalStaticGeo} material={internalCoilMat} />
      <mesh geometry={batched.sensorCopperGeo} material={copperSensorMat} />

      {/* Rotating Central Agitator Shaft + Rushton Disc Turbine + 2 Pitched Hydrofoil Impellers + Foam Breaker */}
      <group ref={agitatorRef} position={[25.0, 0, 2.50]}>
        <mesh geometry={batched.agitatorGeo} material={internalCoilMat} />
      </group>

      {/* Swirling 3D Mycelial Biomass Ribbons & Fungal Pellets inside the Broth Vortex */}
      <group ref={biomassVortexRef} position={[25.0, 0, 2.50]}>
        <mesh geometry={batched.biomassVortexGeo} material={mycelialBiomassMat} />
      </group>

      {/* Rising Specular Oxygenation Bubbles from the Bottom Ring Sparger */}
      <group ref={bubblesRef} position={[25.0, 0, 2.50]}>
        <mesh geometry={batched.bubblesGeo} material={bubbleMat} />
      </group>

      {/* Top Aerated Broth Meniscus & Foam Ring at z = 2.94 */}
      <mesh position={[25.0, 0, 2.94]} material={foamCapMat}>
        <ringGeometry args={[0.06, 0.97, 36]} />
      </mesh>

      {/* Semi-Translucent Golden-Amber Aerated Liquid Broth (z = 1.66..2.94) */}
      <mesh position={[25.0, 0, 2.30]} rotation={[Math.PI / 2, 0, 0]} material={brothMat}>
        <cylinderGeometry args={[0.98, 0.98, 1.28, 36, 4]} />
      </mesh>

      {/* Crystal-Clear Full-Height Borosilicate Sight-Glass Wall (z = 1.64..3.52) */}
      <mesh position={[25.0, 0, 2.58]} rotation={[Math.PI / 2, 0, 0]} material={sightGlassMat}>
        <cylinderGeometry args={[1.035, 1.035, 1.84, 36, 1, true]} />
      </mesh>
    </group>
  );
}

// Helper to create 3D chalk line strokes on the chalkboard (at y = 1.106, in XZ plane)
function chalkStroke(pts2D, radius = 0.0048, yPlane = 1.106) {
  const vecs = pts2D.map(([x, z]) => new THREE.Vector3(x, yPlane, z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vecs), Math.max(4, pts2D.length * 2), radius, 4, false);
}

function ZoneHOptimizationHero({ progressRef }) {
  const groupRef = useRef();

  const chalkboardMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: chalkboardVertexShader,
    fragmentShader: chalkboardFragmentShader
  }), []);

  const woodFrameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4a3221', roughness: 0.58, metalness: 0.08
  }), []);

  const chalkWhiteMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f5f4ec' }), []);
  const chalkYellowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f7de6c' }), []);
  const chalkGreenMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#92ebb4' }), []);
  const chalkPinkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f59da4' }), []);

  const postItYellowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fae36c', roughness: 0.75 }), []);
  const postItPinkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f598b2', roughness: 0.75 }), []);
  const postItMintMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8ce6b6', roughness: 0.75 }), []);
  const postItOrangeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f7b168', roughness: 0.75 }), []);
  const postItBlueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#85d4f2', roughness: 0.75 }), []);

  const inkDarkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#1e2622' }), []);

  const microscopeBodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e8e6de', roughness: 0.32, metalness: 0.35, envMapIntensity: 0.8
  }), []);

  const microscopeDarkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1b221f', roughness: 0.38, metalness: 0.65, envMapIntensity: 0.75
  }), []);

  const brassOpticMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c9a959', roughness: 0.22, metalness: 0.85, envMapIntensity: 0.95
  }), []);

  const slideGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#d4f5e9', opacity: 0.55, roughness: 0.08
  }), []);

  const illuminatorGlowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d8fff0' }), []);

  const paperWhiteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7f4ea', roughness: 0.82, metalness: 0.0
  }), []);

  const batched = useMemo(() => {
    const woodFrameList = [];
    const whiteChalkList = [];
    const yellowChalkList = [];
    const greenChalkList = [];
    const pinkChalkList = [];

    const postYellowList = [];
    const postPinkList = [];
    const postMintList = [];
    const postOrangeList = [];
    const postBlueList = [];
    const inkScribbleList = [];

    const scopeBodyList = [];
    const scopeDarkList = [];
    const scopeBrassList = [];

    const paperList = [];

    // ============================================================================
    // 1. LARGE ACADEMIC CHALKBOARD (KARA TAHTA) AT x=30.10, y=1.12, z=2.24 (3.26m x 1.38m)
    // ============================================================================
    const bx = 30.10, by = 1.12, bz = 2.24, bw = 3.26, bh = 1.38;
    // Wooden frame moldings (top, bottom, left, right)
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(bw + 0.14, 0.08, 0.07), [bx, by - 0.01, bz + bh * 0.5 + 0.03]));
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(bw + 0.14, 0.08, 0.07), [bx, by - 0.01, bz - bh * 0.5 - 0.03]));
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(0.07, 0.08, bh + 0.12), [bx - bw * 0.5 - 0.035, by - 0.01, bz]));
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(0.07, 0.08, bh + 0.12), [bx + bw * 0.5 + 0.035, by - 0.01, bz]));
    // Protruding lower chalk tray / ledge along the bottom of the chalkboard
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(bw + 0.16, 0.14, 0.032), [bx, by - 0.06, bz - bh * 0.5 - 0.045]));
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(bw + 0.16, 0.022, 0.038), [bx, by - 0.12, bz - bh * 0.5 - 0.035]));

    // Chalkboard Eraser (Wooden handle + dark felt pad) on the chalk tray
    const trayZ = bz - bh * 0.5 - 0.015;
    woodFrameList.push(transformGeo(new THREE.BoxGeometry(0.16, 0.055, 0.024), [29.45, by - 0.075, trayZ + 0.018], [0, 0, 0.05]));
    scopeDarkList.push(transformGeo(new THREE.BoxGeometry(0.16, 0.055, 0.022), [29.45, by - 0.075, trayZ], [0, 0, 0.05]));

    // Chalk sticks resting on the chalk tray
    const chalkCyl = new THREE.CylinderGeometry(0.008, 0.008, 0.075, 8);
    whiteChalkList.push(transformGeo(chalkCyl, [28.92, by - 0.08, trayZ], [0.1, 0.2, 1.48]));
    whiteChalkList.push(transformGeo(chalkCyl, [29.02, by - 0.085, trayZ], [-0.1, 0.1, 1.62]));
    whiteChalkList.push(transformGeo(chalkCyl, [30.48, by - 0.08, trayZ], [0, 0.15, 1.52]));
    yellowChalkList.push(transformGeo(chalkCyl, [29.82, by - 0.08, trayZ], [0.1, -0.1, 1.45]));
    yellowChalkList.push(transformGeo(chalkCyl, [30.88, by - 0.085, trayZ], [0, 0.2, 1.60]));
    greenChalkList.push(transformGeo(chalkCyl, [29.95, by - 0.08, trayZ], [-0.1, 0.1, 1.55]));
    pinkChalkList.push(transformGeo(chalkCyl, [30.62, by - 0.08, trayZ], [0.1, -0.15, 1.50]));

    // ============================================================================
    // 2. HAND-DRAWN 3D CHALK DIAGRAMS, EQUATIONS & MUSHROOM SKETCHES ON THE BOARD
    // ============================================================================
    // --- PANEL 1 (Left, x = 28.62..29.52): Spore Cell -> Hyphal Branching Network + Stoichiometry ---
    // Top title underline & header bars
    whiteChalkList.push(chalkStroke([[28.65, 2.74], [29.42, 2.74]], 0.0055));
    yellowChalkList.push(chalkStroke([[28.65, 2.69], [29.18, 2.69]], 0.0040));

    // Chalk Spore Cell circle + nucleus at [28.78, 2.38]
    const sporeCircle = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      sporeCircle.push([28.78 + Math.cos(a) * 0.095, 2.38 + Math.sin(a) * 0.095]);
    }
    whiteChalkList.push(chalkStroke(sporeCircle, 0.0052));
    yellowChalkList.push(chalkStroke(sporeCircle.map(([x, z]) => [28.78 + (x - 28.78) * 0.42, 2.38 + (z - 2.38) * 0.42]), 0.0042));

    // Germ tube & bifurcating mycelial hyphal tree growing right from the spore
    greenChalkList.push(chalkStroke([[28.88, 2.38], [29.04, 2.39], [29.22, 2.48], [29.44, 2.58]], 0.0052));
    greenChalkList.push(chalkStroke([[29.04, 2.39], [29.24, 2.28], [29.46, 2.18]], 0.0050));
    greenChalkList.push(chalkStroke([[29.22, 2.48], [29.38, 2.41], [29.50, 2.38]], 0.0042));
    greenChalkList.push(chalkStroke([[29.24, 2.28], [29.40, 2.31]], 0.0040));
    greenChalkList.push(chalkStroke([[29.30, 2.52], [29.45, 2.66]], 0.0038));
    greenChalkList.push(chalkStroke([[29.30, 2.24], [29.46, 2.09]], 0.0038));

    // Bottom-left: Liquid O2 sparging beaker diagram & Monod equation strokes
    whiteChalkList.push(chalkStroke([[28.68, 2.08], [28.68, 1.72], [29.04, 1.72], [29.04, 2.08]], 0.0048));
    // Wavy liquid meniscus & rising O2 bubble circles inside chalk beaker
    yellowChalkList.push(chalkStroke([[28.70, 1.98], [28.79, 2.00], [28.88, 1.96], [28.96, 2.00], [29.02, 1.98]], 0.0040));
    for (const [bx0, bz0] of [[28.78, 1.80], [28.86, 1.86], [28.94, 1.82], [28.83, 1.92]]) {
      const bCirc = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        bCirc.push([bx0 + Math.cos(a) * 0.022, bz0 + Math.sin(a) * 0.022]);
      }
      whiteChalkList.push(chalkStroke(bCirc, 0.0032));
    }
    // Chalk equation lines next to beaker (μ = μ_max * S / (Ks + S))
    whiteChalkList.push(chalkStroke([[29.12, 1.98], [29.48, 1.98]], 0.0045));
    yellowChalkList.push(chalkStroke([[29.12, 1.88], [29.45, 1.88]], 0.0042));
    pinkChalkList.push(chalkStroke([[29.12, 1.78], [29.40, 1.78]], 0.0042));

    // --- PANEL 2 (Center, x = 29.60..30.65): Bioprocess Kinetics Graph & Optimal Harvest Curve ---
    // Graph Axes (Vertical Z axis at x=29.66, Horizontal X axis at z=1.74)
    whiteChalkList.push(chalkStroke([[29.66, 2.68], [29.66, 1.74], [30.62, 1.74]], 0.0058));
    // Axis arrowheads
    whiteChalkList.push(chalkStroke([[29.63, 2.63], [29.66, 2.69], [29.69, 2.63]], 0.0048));
    whiteChalkList.push(chalkStroke([[30.57, 1.77], [30.63, 1.74], [30.57, 1.71]], 0.0048));
    // Tick marks along axes
    for (let tx = 29.82; tx <= 30.50; tx += 0.17) {
      whiteChalkList.push(chalkStroke([[tx, 1.72], [tx, 1.76]], 0.0036));
    }
    for (let tz = 1.90; tz <= 2.55; tz += 0.16) {
      whiteChalkList.push(chalkStroke([[29.64, tz], [29.68, tz]], 0.0036));
    }

    // Exponential Mycelial Biomass Growth S-Curve (Green Chalk)
    const growthCurve = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const gx = 29.68 + u * 0.90;
      const sig = 1.0 / (1.0 + Math.exp(-(u - 0.45) * 8.5));
      const gz = 1.78 + sig * 0.74;
      growthCurve.push([gx, gz]);
    }
    greenChalkList.push(chalkStroke(growthCurve, 0.0062));

    // Dissolved Oxygen / Substrate Depletion Curve (Yellow Chalk)
    const doCurve = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const gx = 29.68 + u * 0.90;
      const gz = 2.48 - 0.62 * Math.pow(u, 1.35) + 0.05 * Math.sin(u * 12.0);
      doCurve.push([gx, gz]);
    }
    yellowChalkList.push(chalkStroke(doCurve, 0.0050));

    // Secondary Metabolite / Enzyme Yield Peak Curve (White Chalk)
    const yieldCurve = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const gx = 29.68 + u * 0.90;
      const gz = 1.76 + 0.62 * Math.exp(-Math.pow((u - 0.72) / 0.24, 2.0));
      yieldCurve.push([gx, gz]);
    }
    whiteChalkList.push(chalkStroke(yieldCurve, 0.0048));

    // Coral-Pink Chalk target circle around the optimal harvest intersection [30.33, 2.46] + callout arrow
    const optCircle = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      optCircle.push([30.33 + Math.cos(a) * 0.075, 2.46 + Math.sin(a) * 0.075]);
    }
    pinkChalkList.push(chalkStroke(optCircle, 0.0052));
    pinkChalkList.push(chalkStroke([[30.12, 2.64], [30.26, 2.52]], 0.0048));
    // Top center title underline
    whiteChalkList.push(chalkStroke([[29.74, 2.74], [30.52, 2.74]], 0.0055));

    // --- PANEL 3 (Right, x = 30.72..31.58): Chalk Oyster Mushroom Anatomy & Fermenter Sketch ---
    whiteChalkList.push(chalkStroke([[30.76, 2.74], [31.52, 2.74]], 0.0055));

    // Hand-drawn Pleurotus Oyster Mushroom Cluster Sketch (x = 30.95, z = 2.15..2.58)
    // Dominant fan cap outline
    whiteChalkList.push(chalkStroke([
      [30.82, 2.38], [30.78, 2.48], [30.88, 2.58], [31.06, 2.60], [31.18, 2.52], [31.14, 2.42], [30.98, 2.36], [30.82, 2.38]
    ], 0.0055));
    // Secondary overlapping lower oyster cap outline
    whiteChalkList.push(chalkStroke([
      [30.96, 2.26], [31.08, 2.35], [31.24, 2.34], [31.26, 2.24], [31.12, 2.18], [30.96, 2.26]
    ], 0.0048));
    // Curved lateral stem down to substrate base
    whiteChalkList.push(chalkStroke([[30.86, 2.38], [30.88, 2.22], [30.94, 2.08]], 0.0052));
    whiteChalkList.push(chalkStroke([[30.98, 2.36], [30.98, 2.20], [31.02, 2.08]], 0.0052));
    // Decurrent radial gill lines under the chalk mushroom cap (Yellow Chalk)
    for (const gxEnd of [30.84, 30.92, 31.00, 31.08, 31.13]) {
      yellowChalkList.push(chalkStroke([[30.92, 2.32], [gxEnd, 2.46]], 0.0032));
    }

    // Chalk callout box & checkmarks at bottom right (x = 30.78..31.54, z = 1.72..2.02)
    greenChalkList.push(chalkStroke([
      [30.78, 2.02], [31.54, 2.02], [31.54, 1.72], [30.78, 1.72], [30.78, 2.02]
    ], 0.0045));
    yellowChalkList.push(chalkStroke([[30.84, 1.92], [30.88, 1.87], [30.96, 1.96]], 0.0045));
    whiteChalkList.push(chalkStroke([[31.02, 1.91], [31.46, 1.91]], 0.0042));
    yellowChalkList.push(chalkStroke([[30.84, 1.81], [30.88, 1.76], [30.96, 1.85]], 0.0045));
    whiteChalkList.push(chalkStroke([[31.02, 1.80], [31.42, 1.80]], 0.0042));

    // Coral-Pink Chalk Connection Arrows linking the Frame Post-it Notes to the Chalkboard Diagrams
    pinkChalkList.push(chalkStroke([[28.59, 2.58], [28.68, 2.52], [28.74, 2.45]], 0.0038));
    pinkChalkList.push(chalkStroke([[28.59, 2.24], [28.82, 2.26], [29.02, 2.34]], 0.0038));
    pinkChalkList.push(chalkStroke([[29.22, 1.68], [29.48, 1.78], [29.74, 1.86]], 0.0038));
    pinkChalkList.push(chalkStroke([[30.18, 1.68], [30.26, 2.05], [30.32, 2.38]], 0.0038));

    // Hand-written 3D Chalk Glyphs ("O2", "pH", "OPT") on the Chalkboard
    // "O2" glyph near beaker (x=29.15, z=2.04)
    yellowChalkList.push(chalkStroke([[29.14, 2.06], [29.17, 2.09], [29.20, 2.06], [29.17, 2.03], [29.14, 2.06]], 0.0032));
    yellowChalkList.push(chalkStroke([[29.23, 2.05], [29.26, 2.05], [29.23, 2.02], [29.27, 2.02]], 0.0028));
    // "OPT" glyph above optimal harvest circle (x=30.22, z=2.60)
    pinkChalkList.push(chalkStroke([[30.20, 2.60], [30.23, 2.64], [30.26, 2.60], [30.23, 2.57], [30.20, 2.60]], 0.0032));
    pinkChalkList.push(chalkStroke([[30.29, 2.57], [30.29, 2.64], [30.33, 2.62], [30.29, 2.60]], 0.0032));
    pinkChalkList.push(chalkStroke([[30.36, 2.64], [30.42, 2.64]], 0.0032));
    pinkChalkList.push(chalkStroke([[30.39, 2.57], [30.39, 2.64]], 0.0032));

    // Accumulated White & Yellow Chalk Dust Piles along the wooden chalk tray (z = trayZ)
    const dustMound = new THREE.DodecahedronGeometry(0.022, 0);
    for (const dx of [28.88, 29.38, 29.88, 30.45, 30.92, 31.28]) {
      whiteChalkList.push(transformGeo(dustMound, [dx, by - 0.075, trayZ - 0.006], [0, dx * 2, 0], [1.8, 0.7, 0.35]));
    }
    for (const dx of [29.78, 30.82]) {
      yellowChalkList.push(transformGeo(dustMound, [dx, by - 0.078, trayZ - 0.005], [0, dx, 0], [1.4, 0.6, 0.30]));
    }

    // ============================================================================
    // 3. COLORFUL POST-IT STICKY NOTES (ON CHALKBOARD FRAME & SCATTERED ON DESK)
    // ============================================================================
    const postBoardGeo = new THREE.BoxGeometry(0.115, 0.004, 0.115);
    const boardPostIts = [
      { x: 28.53, z: 2.58, rotY: 0.12, mat: postYellowList },
      { x: 28.54, z: 2.41, rotY: -0.08, mat: postPinkList },
      { x: 28.52, z: 2.24, rotY: 0.15, mat: postMintList },
      { x: 28.55, z: 2.06, rotY: -0.14, mat: postOrangeList },
      { x: 28.53, z: 1.88, rotY: 0.06, mat: postBlueList },
      { x: 29.22, z: 1.62, rotY: -0.10, mat: postYellowList },
      { x: 30.18, z: 1.63, rotY: 0.09, mat: postPinkList },
      { x: 31.38, z: 1.63, rotY: -0.12, mat: postMintList }
    ];
    for (const bp of boardPostIts) {
      bp.mat.push(transformGeo(postBoardGeo, [bp.x, 1.098, bp.z], [0.04, bp.rotY, 0]));
      // Handwritten scribble bars on each board Post-it
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.075, 0.002, 0.008), [bp.x, 1.094, bp.z + 0.022], [0, bp.rotY, 0]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.065, 0.002, 0.007), [bp.x - 0.005, 1.094, bp.z], [0, bp.rotY, 0]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.052, 0.002, 0.007), [bp.x - 0.010, 1.094, bp.z - 0.022], [0, bp.rotY, 0]));
    }

    // Desk top is H_console_top at z = 1.195 (x = 28.3..31.7, y = -1.35..0.35)
    const deskZ = 1.196;
    const postDeskGeo = new THREE.BoxGeometry(0.105, 0.105, 0.004);
    const deskPostIts = [
      { x: 28.62, y: -0.78, rotZ: 0.24, mat: postYellowList },
      { x: 28.76, y: -0.84, rotZ: -0.18, mat: postPinkList },
      { x: 28.68, y: -0.62, rotZ: 0.09, mat: postMintList },
      { x: 29.38, y: -0.76, rotZ: -0.28, mat: postYellowList },
      { x: 29.52, y: -0.82, rotZ: 0.16, mat: postOrangeList },
      { x: 29.46, y: -0.64, rotZ: -0.12, mat: postBlueList },
      { x: 29.88, y: -0.86, rotZ: 0.32, mat: postPinkList },
      { x: 30.02, y: -0.92, rotZ: -0.14, mat: postYellowList },
      { x: 30.72, y: -0.78, rotZ: 0.21, mat: postMintList },
      { x: 30.86, y: -0.86, rotZ: -0.25, mat: postYellowList },
      { x: 30.80, y: -0.64, rotZ: 0.11, mat: postOrangeList },
      { x: 31.18, y: -0.74, rotZ: -0.19, mat: postBlueList },
      { x: 31.32, y: -0.82, rotZ: 0.28, mat: postPinkList },
      { x: 30.05, y: -0.32, rotZ: -0.09, mat: postYellowList },
      { x: 30.22, y: -0.28, rotZ: 0.18, mat: postMintList }
    ];
    for (const dp of deskPostIts) {
      // Slight upward paper curl (pitch 0.06 rad) so Post-its cast crisp shadows on the desk
      dp.mat.push(transformGeo(postDeskGeo, [dp.x, dp.y, deskZ + 0.004], [0.06, 0, dp.rotZ]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.068, 0.007, 0.002), [dp.x, dp.y + 0.018, deskZ + 0.007], [0.06, 0, dp.rotZ]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.056, 0.006, 0.002), [dp.x, dp.y - 0.004, deskZ + 0.007], [0.06, 0, dp.rotZ]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.045, 0.006, 0.002), [dp.x, dp.y - 0.024, deskZ + 0.007], [0.06, 0, dp.rotZ]));
    }
    // Thick Post-it Pad blocks on the desk
    postYellowList.push(transformGeo(new THREE.BoxGeometry(0.11, 0.11, 0.022), [29.55, -0.45, deskZ + 0.011], [0, 0, 0.18]));
    postPinkList.push(transformGeo(new THREE.BoxGeometry(0.11, 0.11, 0.018), [29.68, -0.49, deskZ + 0.009], [0, 0, -0.22]));

    // ============================================================================
    // 4. DETAILED COMPOUND LABORATORY MICROSCOPE ON THE DESK (x=29.02, y=-0.52, z=1.196)
    // ============================================================================
    const mx = 29.02, my = -0.52, mz = deskZ;
    // Heavy cast-metal horseshoe base & foot
    scopeDarkList.push(transformGeo(new THREE.BoxGeometry(0.24, 0.30, 0.042), [mx, my, mz + 0.021]));
    scopeBodyList.push(transformGeo(new THREE.BoxGeometry(0.20, 0.25, 0.032), [mx, my + 0.01, mz + 0.052]));
    // Substage field illuminator housing
    scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.048, 0.056, 0.028, 20), [mx, my - 0.035, mz + 0.078], [Math.PI / 2, 0, 0]));

    // Sweeping ergonomic C-shaped microscope arm curving from rear of base up to optical head
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(mx, my + 0.085, mz + 0.06),
      new THREE.Vector3(mx, my + 0.135, mz + 0.18),
      new THREE.Vector3(mx, my + 0.115, mz + 0.32),
      new THREE.Vector3(mx, my + 0.020, mz + 0.41),
      new THREE.Vector3(mx, my - 0.035, mz + 0.42)
    ]);
    scopeBodyList.push(new THREE.TubeGeometry(armCurve, 24, 0.034, 12, false));

    // Coaxial coarse & fine focus knobs on left and right of lower arm
    scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.135, 18), [mx, my + 0.115, mz + 0.155], [0, 0, Math.PI / 2]));
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.165, 16), [mx, my + 0.115, mz + 0.155], [0, 0, Math.PI / 2]));

    // Mechanical XY Specimen Stage + Substage Abbe Condenser
    scopeDarkList.push(transformGeo(new THREE.BoxGeometry(0.19, 0.18, 0.018), [mx, my - 0.030, mz + 0.215]));
    scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.035, 0.028, 0.045, 16), [mx, my - 0.035, mz + 0.182], [Math.PI / 2, 0, 0]));
    // Coaxial XY stage vernier control rod hanging on right side of stage
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 10), [mx + 0.075, my - 0.01, mz + 0.175], [Math.PI / 2, 0, 0]));

    // Revolving Nosepiece Turret + 3 Objective Lenses (4x, 10x, 40x)
    scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.046, 0.052, 0.026, 20), [mx, my - 0.035, mz + 0.335], [Math.PI / 2, 0, 0]));
    // Active vertical objective lens pointing straight at the slide
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.014, 0.010, 0.068, 14), [mx, my - 0.035, mz + 0.292], [Math.PI / 2, 0, 0]));
    // Forward-left and forward-right angled objectives on the turret
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.013, 0.009, 0.058, 14), [mx - 0.026, my - 0.055, mz + 0.302], [Math.PI / 2 + 0.35, 0, -0.32]));
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.012, 0.008, 0.048, 14), [mx + 0.026, my - 0.055, mz + 0.305], [Math.PI / 2 + 0.35, 0, 0.32]));

    // Upper Optical Prism Head & Twin Inclined Binocular Eyepiece Tubes (Oküler)
    scopeBodyList.push(transformGeo(new THREE.SphereGeometry(0.048, 16, 12), [mx, my - 0.035, mz + 0.425], [0, 0, 0], [1.0, 1.15, 0.85]));
    for (const xEye of [-0.028, 0.028]) {
      // Chrome eyepiece barrel inclined at 45 deg toward the viewer (-Y)
      scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.115, 14), [mx + xEye, my - 0.088, mz + 0.475], [Math.PI * 0.28, 0, 0]));
      // Black rubber eye-cup at the top of each ocular
      scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.020, 0.017, 0.028, 14), [mx + xEye, my - 0.125, mz + 0.508], [Math.PI * 0.28, 0, 0]));
    }

    // ============================================================================
    // 5. OPEN LAB NOTEBOOK, PEN HOLDER CUP, PENS, PENCILS & HIGHLIGHTERS ON DESK
    // ============================================================================
    // Open Hardcover Lab Notebook at [30.32, -0.60, deskZ]
    const nbx = 30.32, nby = -0.60;
    // Dark hardcover binding
    scopeDarkList.push(transformGeo(new THREE.BoxGeometry(0.46, 0.32, 0.010), [nbx, nby, deskZ + 0.005], [0, 0, -0.08]));
    // Left and right open white paper page blocks
    paperList.push(transformGeo(new THREE.BoxGeometry(0.21, 0.29, 0.014), [nbx - 0.11, nby + 0.008, deskZ + 0.013], [0, 0.04, -0.08]));
    paperList.push(transformGeo(new THREE.BoxGeometry(0.21, 0.29, 0.014), [nbx + 0.11, nby - 0.008, deskZ + 0.013], [0, -0.04, -0.08]));
    // Handwritten ink lines & sketch on the open notebook pages
    for (let lineIdx = 0; lineIdx < 6; lineIdx++) {
      const ly = nby + 0.08 - lineIdx * 0.032;
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.15, 0.005, 0.002), [nbx - 0.11, ly + 0.008, deskZ + 0.021], [0, 0, -0.08]));
      inkScribbleList.push(transformGeo(new THREE.BoxGeometry(0.14, 0.005, 0.002), [nbx + 0.11, ly - 0.008, deskZ + 0.021], [0, 0, -0.08]));
    }

    // Cylindrical Pen Holder Cup (Kalemlik) at [29.68, -0.36, deskZ]
    const cupX = 29.68, cupY = -0.36;
    scopeDarkList.push(transformGeo(new THREE.CylinderGeometry(0.052, 0.046, 0.125, 20), [cupX, cupY, deskZ + 0.062], [Math.PI / 2, 0, 0]));
    // Pens, yellow pencils & highlighters sticking out of the pen cup at angles
    const penInCupGeo = new THREE.CylinderGeometry(0.0065, 0.0055, 0.18, 8);
    postYellowList.push(transformGeo(penInCupGeo, [cupX - 0.018, cupY - 0.01, deskZ + 0.105], [Math.PI / 2 + 0.18, 0, 0.24]));
    postPinkList.push(transformGeo(penInCupGeo, [cupX + 0.016, cupY + 0.01, deskZ + 0.102], [Math.PI / 2 - 0.15, 0, -0.28]));
    postMintList.push(transformGeo(penInCupGeo, [cupX + 0.005, cupY - 0.018, deskZ + 0.108], [Math.PI / 2 + 0.22, 0, -0.12]));
    postBlueList.push(transformGeo(penInCupGeo, [cupX - 0.012, cupY + 0.015, deskZ + 0.100], [Math.PI / 2 - 0.20, 0, 0.15]));
    postOrangeList.push(transformGeo(penInCupGeo, [cupX + 0.020, cupY - 0.008, deskZ + 0.098], [Math.PI / 2 + 0.12, 0, -0.35]));
    // Stainless steel ruler in the pen cup
    scopeBrassList.push(transformGeo(new THREE.BoxGeometry(0.028, 0.003, 0.21), [cupX, cupY + 0.018, deskZ + 0.11], [0.15, -0.18, 0.1]));

    // 12 Loose Pens, Wooden Pencils & Highlighter Markers scattered across the desk surface
    const deskPenGeo = new THREE.CylinderGeometry(0.006, 0.005, 0.165, 8);
    const deskPenTipGeo = new THREE.ConeGeometry(0.005, 0.022, 8);
    const deskPens = [
      { x: 29.88, y: -0.68, rotZ: 0.52, mat: postYellowList },
      { x: 29.96, y: -0.74, rotZ: 0.38, mat: postBlueList },
      { x: 30.38, y: -0.58, rotZ: -0.65, mat: scopeBrassList, zOff: 0.016 }, // Fountain pen resting on open notebook!
      { x: 30.64, y: -0.54, rotZ: 0.82, mat: postPinkList },
      { x: 30.72, y: -0.48, rotZ: -0.42, mat: postMintList },
      { x: 29.34, y: -0.52, rotZ: 1.15, mat: postOrangeList },
      { x: 28.82, y: -0.44, rotZ: -0.75, mat: postYellowList },
      { x: 31.05, y: -0.66, rotZ: 0.28, mat: postBlueList },
      { x: 31.14, y: -0.58, rotZ: -0.54, mat: postYellowList }
    ];
    for (const p of deskPens) {
      const pz = deskZ + 0.006 + (p.zOff || 0);
      p.mat.push(transformGeo(deskPenGeo, [p.x, p.y, pz], [0, 0, p.rotZ]));
      // Dark graphite/ink cone tip at the end of each pencil/pen
      const tipX = p.x - Math.sin(p.rotZ) * 0.092;
      const tipY = p.y + Math.cos(p.rotZ) * 0.092;
      inkScribbleList.push(transformGeo(deskPenTipGeo, [tipX, tipY, pz], [0, 0, p.rotZ]));
    }

    // ============================================================================
    // 6. EXTRA SCIENTIST DESK MICRO-DETAILS: STEAMING COFFEE MUG, EYEGLASSES,
    //    PRECISION MICROPIPETTE + 96-TIP RACK BOX & LIVE OYSTER SPECIMEN JAR
    // ============================================================================

    // A. Steaming Ceramic Coffee Mug (Kahve Kupası) at [31.18, -0.42, deskZ]
    const mugX = 31.18, mugY = -0.42;
    scopeBodyList.push(transformGeo(new THREE.CylinderGeometry(0.044, 0.040, 0.098, 18), [mugX, mugY, deskZ + 0.049], [Math.PI / 2, 0, 0]));
    scopeBodyList.push(transformGeo(new THREE.TorusGeometry(0.028, 0.0065, 8, 16, Math.PI), [mugX + 0.042, mugY, deskZ + 0.050], [Math.PI / 2, 0, -Math.PI / 2]));
    // Dark espresso coffee surface inside mug
    inkScribbleList.push(transformGeo(new THREE.CylinderGeometry(0.039, 0.039, 0.004, 16), [mugX, mugY, deskZ + 0.090], [Math.PI / 2, 0, 0]));
    // 3 Curling wisps of warm steam rising above the coffee mug
    for (let sw = 0; sw < 3; sw++) {
      const sxOff = (sw - 1) * 0.014;
      const steamCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(mugX + sxOff, mugY, deskZ + 0.105),
        new THREE.Vector3(mugX + sxOff + 0.010, mugY - 0.008, deskZ + 0.145),
        new THREE.Vector3(mugX + sxOff - 0.008, mugY + 0.008, deskZ + 0.185),
        new THREE.Vector3(mugX + sxOff + 0.006, mugY, deskZ + 0.225)
      ]);
      whiteChalkList.push(new THREE.TubeGeometry(steamCurve, 8, 0.0022, 4, false));
    }

    // B. Scientist's Wire-Rim Eyeglasses (Gözlük) resting next to the open notebook at [30.02, -0.42, deskZ]
    const glX = 30.02, glY = -0.42;
    scopeBrassList.push(
      transformGeo(new THREE.TorusGeometry(0.028, 0.0022, 6, 18), [glX - 0.034, glY, deskZ + 0.004], [0.08, 0, 0.22]),
      transformGeo(new THREE.TorusGeometry(0.028, 0.0022, 6, 18), [glX + 0.034, glY + 0.014, deskZ + 0.004], [0.08, 0, 0.22]),
      // Nose bridge & folded temple arms
      transformGeo(new THREE.BoxGeometry(0.018, 0.0025, 0.0025), [glX, glY + 0.007, deskZ + 0.005], [0, 0, 0.22]),
      transformGeo(new THREE.BoxGeometry(0.0025, 0.11, 0.003), [glX - 0.055, glY + 0.052, deskZ + 0.005], [0, 0, -0.15]),
      transformGeo(new THREE.BoxGeometry(0.0025, 0.11, 0.003), [glX + 0.048, glY + 0.068, deskZ + 0.005], [0, 0, 0.45])
    );

    // C. Precision Single-Channel Micropipette & Open 200 µL Tip Box Rack at [28.56, -0.48, deskZ]
    const pipX = 28.68, pipY = -0.42;
    // Micropipette ergonomic white body, blue dosing plunger & dark tip cone resting on a stainless stand
    scopeBodyList.push(transformGeo(new THREE.CylinderGeometry(0.011, 0.009, 0.14, 12), [pipX, pipY, deskZ + 0.028], [0.18, 0, -0.45]));
    postBlueList.push(transformGeo(new THREE.CylinderGeometry(0.008, 0.006, 0.035, 10), [pipX + 0.038, pipY + 0.072, deskZ + 0.042], [0.18, 0, -0.45]));
    scopeDarkList.push(transformGeo(new THREE.ConeGeometry(0.008, 0.065, 10), [pipX - 0.042, pipY - 0.078, deskZ + 0.012], [-Math.PI + 0.18, 0, 0.45]));
    // Pipette Tip Rack Box at [28.48, -0.60, deskZ]
    const rackX = 28.48, rackY = -0.60;
    scopeDarkList.push(transformGeo(new THREE.BoxGeometry(0.13, 0.095, 0.042), [rackX, rackY, deskZ + 0.021], [0, 0, 0.12]));
    postYellowList.push(transformGeo(new THREE.BoxGeometry(0.122, 0.088, 0.006), [rackX, rackY, deskZ + 0.044], [0, 0, 0.12]));
    const tipPin = new THREE.ConeGeometry(0.0038, 0.014, 6);
    for (let tr = 0; tr < 3; tr++) {
      for (let tc = 0; tc < 5; tc++) {
        postYellowList.push(transformGeo(
          tipPin,
          [rackX - 0.040 + tc * 0.020, rackY - 0.022 + tr * 0.022, deskZ + 0.052],
          [Math.PI / 2, 0, 0]
        ));
      }
    }

    // D. Sealed Specimen Jar with Live Miniature Oyster Mushroom Bouquet at [29.36, -0.34, deskZ]
    const jarX = 29.36, jarY = -0.34;
    scopeBrassList.push(transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 18), [jarX, jarY, deskZ + 0.132], [Math.PI / 2, 0, 0]));
    postMintList.push(transformGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.022, 18), [jarX, jarY, deskZ + 0.012], [Math.PI / 2, 0, 0]));
    // Miniature oyster mushroom caps & stems growing inside the specimen jar on the scientist's desk!
    paperList.push(
      transformGeo(new THREE.CylinderGeometry(0.008, 0.011, 0.055, 8), [jarX, jarY, deskZ + 0.048], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(0.032, 12, 8), [jarX - 0.006, jarY - 0.008, deskZ + 0.078], [0.2, 0, 0], [1.2, 1.0, 0.32]),
      transformGeo(new THREE.SphereGeometry(0.024, 10, 8), [jarX + 0.014, jarY + 0.006, deskZ + 0.062], [-0.15, 0.2, 0], [1.1, 0.95, 0.30]),
      transformGeo(new THREE.SphereGeometry(0.018, 10, 8), [jarX - 0.016, jarY + 0.010, deskZ + 0.052], [0.1, -0.2, 0], [1.0, 0.9, 0.28])
    );

    return {
      woodFrameGeo: mergeGeometriesFast(woodFrameList),
      whiteChalkGeo: mergeGeometriesFast(whiteChalkList),
      yellowChalkGeo: mergeGeometriesFast(yellowChalkList),
      greenChalkGeo: mergeGeometriesFast(greenChalkList),
      pinkChalkGeo: mergeGeometriesFast(pinkChalkList),
      postYellowGeo: mergeGeometriesFast(postYellowList),
      postPinkGeo: mergeGeometriesFast(postPinkList),
      postMintGeo: mergeGeometriesFast(postMintList),
      postOrangeGeo: mergeGeometriesFast(postOrangeList),
      postBlueGeo: mergeGeometriesFast(postBlueList),
      inkScribbleGeo: mergeGeometriesFast(inkScribbleList),
      scopeBodyGeo: mergeGeometriesFast(scopeBodyList),
      scopeDarkGeo: mergeGeometriesFast(scopeDarkList),
      scopeBrassGeo: mergeGeometriesFast(scopeBrassList),
      paperGeo: mergeGeometriesFast(paperList)
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const active = p >= 0.76;
    if (groupRef.current) groupRef.current.visible = active;
  });

  return (
    <group ref={groupRef} name="ZONE_H_PROCESS_OPTIMIZATION_AND_SHOWCASE" visible={false}>
      {/* 1. Large Slate Chalkboard (Kara Tahta) Surface */}
      <mesh position={[30.10, 1.112, 2.24]} rotation={[Math.PI / 2, 0, 0]} material={chalkboardMat}>
        <planeGeometry args={[3.26, 1.38]} />
      </mesh>

      {/* Wooden Chalkboard Frame, Chalk Tray & Eraser Handle */}
      <mesh geometry={batched.woodFrameGeo} material={woodFrameMat} />

      {/* 2. Hand-Drawn 3D Chalk Drawings, Mushroom Anatomy, Growth Curves & Formulas */}
      <mesh geometry={batched.whiteChalkGeo} material={chalkWhiteMat} />
      <mesh geometry={batched.yellowChalkGeo} material={chalkYellowMat} />
      <mesh geometry={batched.greenChalkGeo} material={chalkGreenMat} />
      <mesh geometry={batched.pinkChalkGeo} material={chalkPinkMat} />

      {/* 3. Colorful Post-it Sticky Notes (on Chalkboard & Desk) + Pencils/Highlighters */}
      <mesh geometry={batched.postYellowGeo} material={postItYellowMat} />
      <mesh geometry={batched.postPinkGeo} material={postItPinkMat} />
      <mesh geometry={batched.postMintGeo} material={postItMintMat} />
      <mesh geometry={batched.postOrangeGeo} material={postItOrangeMat} />
      <mesh geometry={batched.postBlueGeo} material={postItBlueMat} />
      <mesh geometry={batched.inkScribbleGeo} material={inkDarkMat} />

      {/* 4. Detailed Binocular Compound Microscope, Open Lab Notebook & Pen Cup */}
      <mesh geometry={batched.scopeBodyGeo} material={microscopeBodyMat} />
      <mesh geometry={batched.scopeDarkGeo} material={microscopeDarkMat} />
      <mesh geometry={batched.scopeBrassGeo} material={brassOpticMat} />
      <mesh geometry={batched.paperGeo} material={paperWhiteMat} />

      {/* Microscope Illuminator Lens Glow & Glass Specimen Slide on the Microscope Stage */}
      <mesh position={[29.02, -0.555, 1.289]} material={illuminatorGlowMat}>
        <circleGeometry args={[0.036, 20]} />
      </mesh>
      <mesh position={[29.02, -0.555, 1.422]} material={slideGlassMat}>
        <boxGeometry args={[0.085, 0.028, 0.003]} />
      </mesh>
      <mesh position={[29.02, -0.555, 1.425]}>
        <circleGeometry args={[0.009, 16]} />
        <meshBasicMaterial color="#4ad698" />
      </mesh>
      {/* Borosilicate Glass Cylinder of the Live Oyster Mushroom Specimen Jar on the Desk */}
      <mesh position={[29.36, -0.34, 1.262]} rotation={[Math.PI / 2, 0, 0]} material={slideGlassMat}>
        <cylinderGeometry args={[0.050, 0.050, 0.125, 18, 1, true]} />
      </mesh>
    </group>
  );
}

export default function HighFidelityFactoryPass({ progressRef }) {
  return (
    <group name="HUNER_HIGH_FIDELITY_FACTORY_PASS">
      <CathedralArchitectureAndBiophilia />
      <ZoneGFermentationHero progressRef={progressRef} />
      <ZoneHOptimizationHero progressRef={progressRef} />
    </group>
  );
}
