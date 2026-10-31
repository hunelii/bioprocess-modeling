import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp01 } from '../data/camera.js';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import FungalCellAnatomy, {
  createHunerFungalShell,
  createDeformedSporeHemisphere,
  deformSporeVertex
} from './FungalCellAnatomy.jsx';

// Scene 01: Dramatic "Birth of the First Cell" volumetric lighting, god-ray shafts, subsurface spore glow & bokeh.
const SPORE_ANCHOR = [1.2, -0.03, 1.37];
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const beat = (p) => clamp01(p / 0.11);

function createMergedInternalCytoplasmWeb() {
  const curves = [];
  let seed = 918273;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 28; i++) {
    const pts = [];
    const theta0 = rand() * Math.PI * 2;
    const phi0 = (rand() - 0.5) * Math.PI * 0.85;
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const r = 0.15 + 0.68 * Math.sin(t * Math.PI) * (0.6 + 0.4 * rand());
      const th = theta0 + (t - 0.5) * 2.2 + 0.25 * Math.sin(t * 6.0 + i);
      const ph = phi0 + (t - 0.5) * 1.4 + 0.2 * Math.cos(t * 5.0 - i);
      pts.push(new THREE.Vector3(
        r * Math.cos(ph) * Math.cos(th),
        r * Math.cos(ph) * Math.sin(th),
        r * Math.sin(ph)
      ));
    }
    curves.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.012 + (i % 3) * 0.004, 4, false));
  }
  return mergeGeometriesFast(curves);
}

function createBokehParticles() {
  let seed = 23843;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const count = 120;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const inBeam = i < 90;
    const z = 0.55 + rand() * 2.65;
    const beamShiftX = (z - 1.37) * -0.22;
    const spread = inBeam ? 0.52 : 1.35;
    positions[i * 3] = SPORE_ANCHOR[0] + beamShiftX + (rand() - 0.5) * spread;
    positions[i * 3 + 1] = SPORE_ANCHOR[1] + (rand() - 0.5) * (inBeam ? 0.48 : 0.95);
    positions[i * 3 + 2] = z;
    scales[i] = 0.35 + Math.pow(rand(), 2.2) * 2.6;
    phases[i] = rand() * Math.PI * 2;
  }
  return { positions, scales, phases, count };
}

const sporeVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Luminous subsurface scattering + cellular wall reticulation + golden/emerald rim light for Scene 01
const sporeFragmentShader = `
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uGlow;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vLocalPos;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float cellularFast(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 base = step(vec3(0.5), f) - vec3(1.0);
    float d1 = 8.0;
    float d2 = 8.0;
    for (int z = 0; z <= 1; z++) {
      for (int y = 0; y <= 1; y++) {
        for (int x = 0; x <= 1; x++) {
          vec3 g = base + vec3(float(x), float(y), float(z));
          vec3 cell = i + g;
          vec3 o = vec3(
            hash31(cell),
            hash31(cell + vec3(17.0, 31.0, 47.0)),
            hash31(cell + vec3(59.0, 83.0, 97.0))
          );
          vec3 r = g + o - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
    }
    return clamp(sqrt(d2) - sqrt(d1), 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPosition);
    vec3 L1 = normalize(vec3(-0.45, -0.35, 0.82));
    vec3 L2 = normalize(vec3(0.6, -0.5, -0.4));

    float ndotv = clamp(abs(dot(N, V)), 0.0, 1.0);
    float oneMinus = 1.0 - ndotv;
    float fresnel = oneMinus * oneMinus * sqrt(oneMinus);
    float rimTight = fresnel * fresnel;

    float cellMacro = cellularFast(vLocalPos * 5.5);
    float ridgeMacro = 1.0 - smoothstep(0.02, 0.16, cellMacro);
    vec3 mp = vLocalPos * 26.0;
    float microWave = abs(sin(mp.x + cos(mp.y)) * cos(mp.z + sin(mp.x)));
    float ridgeMicro = 1.0 - smoothstep(0.04, 0.22, microWave);
    float network = clamp(ridgeMacro * 0.85 + ridgeMicro * 0.42, 0.0, 1.0);

    float diff = max(dot(N, L1), 0.0);
    float backTerm = clamp(dot(-L1, V) * 0.5 + 0.5, 0.0, 1.0);
    float backLight = backTerm * backTerm;
    float warmBounce = max(dot(N, L2), 0.0);

    vec3 deepCore = vec3(0.03, 0.12, 0.06);
    vec3 cytoplasm = vec3(0.20, 0.48, 0.28);
    vec3 ridgeColor = vec3(0.68, 0.88, 0.62);
    vec3 rimGlow = vec3(0.85, 1.0, 0.78);
    vec3 warmGold = vec3(0.98, 0.85, 0.52);

    // Deep sculptural shading with pronounced chitin surface micro-relief
    vec3 col = mix(deepCore, cytoplasm, 0.25 + 0.55 * diff + 0.20 * backLight);
    col = mix(col, ridgeColor, network * (0.42 + 0.58 * fresnel));
    col += rimGlow * fresnel * 0.88;
    col += warmGold * rimTight * 0.75;
    col += warmGold * warmBounce * 0.18;

    // Handoff internal luminescence pulse (t: 0 -> 1)
    vec3 internalGlowColor = vec3(0.45, 0.92, 0.58);
    float glowTerm = clamp(uGlow * 0.45, 0.0, 1.0);
    col = mix(col, internalGlowColor * 1.10, glowTerm * 0.45);
    col += internalGlowColor * (0.22 * uGlow * (0.35 + 0.65 * diff));

    vec3 H = normalize(L1 + V);
    float spec = pow(max(dot(N, H), 0.0), 36.0);
    col += vec3(0.92, 0.98, 0.88) * spec * 0.55;

    float alpha = clamp((0.94 + 0.06 * fresnel + spec * 0.15) * uReveal, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

const beamVertexShader = `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vViewDir = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragmentShader = `
  uniform float uReveal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float radius = length(vWorld.xy - vec2(1.2, -0.03));
    float radialFade = 1.0 - smoothstep(0.02, 0.62, radius);
    float verticalFade = smoothstep(0.45, 1.15, vWorld.z) * (1.0 - smoothstep(2.65, 3.35, vWorld.z));
    float angle = atan(vWorld.y + 0.03, vWorld.x - 1.2);
    float rays = 0.65 + 0.35 * sin(angle * 7.0 + vWorld.z * 2.2) * cos(angle * 11.0 - vWorld.z * 1.5);
    float edgeSoft = abs(dot(vNormal, vViewDir));
    float a = (0.11 + 0.28 * radialFade * rays) * verticalFade * edgeSoft * uReveal;
    vec3 beamCol = mix(vec3(0.32, 0.78, 0.52), vec3(0.84, 0.98, 0.80), radialFade * 0.6);
    gl_FragColor = vec4(beamCol, a);
  }
`;

const bokehVertexShader = `
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.3, -mvPosition.z);
    gl_PointSize = clamp((28.0 * aScale) / dist, 2.0, 38.0);
    float dSpore = length(position - vec3(1.2, -0.03, 1.37));
    vAlpha = clamp(1.15 - dSpore * 0.65, 0.18, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const bokehFragmentShader = `
  uniform float uOpacity;
  varying float vAlpha;
  varying float vPhase;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = dot(uv, uv);
    if (r > 1.0) discard;
    float rad = sqrt(r);
    float disc = 1.0 - smoothstep(0.65, 1.0, rad);
    float ring = smoothstep(0.52, 0.78, rad) * (1.0 - smoothstep(0.78, 0.98, rad));
    float core = 1.0 - smoothstep(0.0, 0.45, rad);
    float intensity = disc * 0.38 + ring * 0.75 + core * 0.45;
    vec3 col = mix(vec3(0.68, 0.95, 0.76), vec3(0.98, 0.92, 0.72), fract(vPhase * 0.318));
    gl_FragColor = vec4(col, intensity * vAlpha * uOpacity);
  }
`;

function ZoneAMicroscopyHardware({ progressRef, handoffRef }) {
  const hwRef = useRef();
  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);
  const darkMetalMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#18221d', metalness: 0.65, roughness: 0.42
  }), []);
  const brassMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a89368', metalness: 0.72, roughness: 0.34
  }), []);
  const glassMat = useMemo(() => createFastGlassMaterial({
    color: '#d8ebe0', opacity: 0.32, envMapIntensity: 0.85
  }), []);

  const batched = useMemo(() => {
    const steelList = [
      transformGeo(new THREE.CylinderGeometry(0.68, 0.74, 0.07, 32), [1.25, 0, 0.555], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.72, 0.68, 0.09, 32), [1.25, 0, 2.21], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.42, 0.46, 0.72, 24), [2.22, -0.46, 0.56], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.BoxGeometry(0.065, 0.09, 0.38), [2.15, -0.41, 1.16], [0, 0.18, -0.35]),
      transformGeo(new THREE.CylinderGeometry(0.055, 0.048, 0.035, 16), [2.24, -0.46, 1.23], [Math.PI / 2, 0.2, 0]),
      transformGeo(new THREE.BoxGeometry(0.12, 0.11, 0.09), [2.22, -0.46, 1.33], [0, -0.45, -0.35]),
      transformGeo(new THREE.BoxGeometry(0.055, 0.075, 0.32), [3.22, -0.32, 1.42], [0, 0, 0.28]),
      transformGeo(new THREE.CylinderGeometry(0.022, 0.018, 0.15, 12), [3.32, -0.32, 1.58], [0, 0.55, Math.PI / 2]),
      transformGeo(new THREE.CylinderGeometry(0.013, 0.009, 0.065, 10), [2.235, -0.488, 1.185], [Math.PI / 2 - 0.25, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.013, 0.009, 0.065, 10), [2.265, -0.432, 1.185], [Math.PI / 2 + 0.25, 0, 0])
    ];

    const darkList = [
      transformGeo(new THREE.CylinderGeometry(0.56, 0.58, 0.025, 32), [1.25, 0, 0.592], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.BoxGeometry(0.24, 0.32, 0.06), [2.22, -0.46, 0.96], [0, 0, -0.35]),
      transformGeo(new THREE.BoxGeometry(0.18, 0.20, 0.022), [2.25, -0.47, 1.12], [0, 0, -0.35]),
      transformGeo(new THREE.CylinderGeometry(0.018, 0.016, 0.14, 12), [2.29, -0.49, 1.39], [0, -0.68, Math.PI / 2]),
      transformGeo(new THREE.CylinderGeometry(0.018, 0.016, 0.14, 12), [2.29, -0.43, 1.39], [0, -0.68, Math.PI / 2]),
      transformGeo(new THREE.BoxGeometry(0.20, 0.24, 0.05), [3.28, -0.32, 1.25], [0, 0, 0.28]),
      transformGeo(new THREE.BoxGeometry(0.15, 0.16, 0.02), [3.30, -0.32, 1.38], [0, 0, 0.28])
    ];

    // Observation Stage base hardware (unobstructed open viewing volume around the hero cell)
    const brassList = [
      transformGeo(new THREE.CylinderGeometry(0.013, 0.009, 0.065, 10), [2.25, -0.46, 1.185], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.016, 0.011, 0.06, 10), [3.30, -0.32, 1.46], [Math.PI / 2, 0, 0]),
      // Precision Optical Micrometer Reticle Rings & Crosshair Scale on the Observation Stage Glass (z = 0.619)
      transformGeo(new THREE.TorusGeometry(0.38, 0.0022, 6, 36), [1.25, 0, 0.619]),
      transformGeo(new THREE.TorusGeometry(0.24, 0.0016, 6, 32), [1.25, 0, 0.619]),
      transformGeo(new THREE.TorusGeometry(0.11, 0.0014, 6, 24), [1.25, 0, 0.619]),
      transformGeo(new THREE.BoxGeometry(0.76, 0.0018, 0.0012), [1.25, 0, 0.619]),
      transformGeo(new THREE.BoxGeometry(0.0018, 0.76, 0.0012), [1.25, 0, 0.619])
    ];
    const tickBox = new THREE.BoxGeometry(0.026, 0.0022, 0.0014);
    for (let t = 0; t < 16; t++) {
      const ang = (t / 16) * Math.PI * 2;
      const rTick = t % 2 === 0 ? 0.365 : 0.23;
      brassList.push(transformGeo(
        tickBox,
        [1.25 + Math.cos(ang) * rTick, Math.sin(ang) * rTick, 0.619],
        [0, 0, ang]
      ));
    }

    const glassGeo = transformGeo(new THREE.CylinderGeometry(0.44, 0.44, 0.012, 28), [1.25, 0, 0.612], [Math.PI / 2, 0, 0]);

    return {
      steelGeo: mergeGeometriesFast(steelList),
      darkGeo: mergeGeometriesFast(darkList),
      brassGeo: mergeGeometriesFast(brassList),
      glassGeo
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const handoff = handoffRef ? clamp01(handoffRef.current ?? 1) : 1;
    if (hwRef.current) {
      const activeStage = p < 0.26 || p > 0.90;
      const visible = activeStage && handoff > 0.05;
      hwRef.current.visible = visible;
      if (visible && handoff < 0.999) {
        const hScale = smooth(0.15, 0.95, handoff);
        hwRef.current.scale.set(hScale, hScale, hScale);
      } else if (visible) {
        hwRef.current.scale.set(1, 1, 1);
      }
    }
  });

  return (
    <group ref={hwRef} name="ZONE_A_HIGH_DETAIL_HARDWARE">
      <mesh geometry={batched.steelGeo} material={steelMat} />
      <mesh geometry={batched.darkGeo} material={darkMetalMat} />
      <mesh geometry={batched.brassGeo} material={brassMat} />
      <mesh geometry={batched.glassGeo} material={glassMat} />
    </group>
  );
}

export default function SporeReveal({ progressRef, handoffRef }) {
  const group = useRef();
  const specimenGroup = useRef();
  const frontShellRef = useRef();
  const germTubeRef = useRef();
  const halo = useRef();
  const particles = useRef();
  const lastP = useRef(-1);

  // Basidiospore outer shell: exactly identical to Huner Biofoundry's horizontal FungalCell
  const backShellGeo = useMemo(() => createHunerFungalShell(false, 64, 48), []);
  const frontShellGeo = useMemo(() => createHunerFungalShell(true, 64, 48), []);
  const lightSporeGeo = useMemo(() => createHunerFungalShell(false, 32, 24), []);

  // Emerging Germ Tube sprouting from the cell's polar hilum towards Scene 02
  const germTubeGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.55, -0.22, 0.0),
      new THREE.Vector3(-2.15, -0.42, -0.35),
      new THREE.Vector3(-2.85, -0.58, -0.75),
      new THREE.Vector3(-3.55, -0.65, -1.15)
    ]);
    const tube = new THREE.TubeGeometry(curve, 16, 0.12, 8, false);
    const tipSphere = transformGeo(new THREE.SphereGeometry(0.12, 10, 8), [-3.55, -0.65, -1.15]);
    return mergeGeometriesFast([tube, tipSphere]);
  }, []);

  const bokeh = useMemo(createBokehParticles, []);

  // Permanent Back Cup Chitin Shader
  const sporeShader = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uReveal: { value: 0 },
      uOpacity: { value: 1.0 },
      uGlow: { value: 0 }
    },
    vertexShader: sporeVertexShader,
    fragmentShader: sporeFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  // Cutaway Front Cap Chitin Shader (opens / dissolves to reveal inner organelles)
  const frontSporeShader = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uReveal: { value: 0 },
      uOpacity: { value: 1.0 },
      uGlow: { value: 0 }
    },
    vertexShader: sporeVertexShader,
    fragmentShader: sporeFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const beamShader = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 } },
    vertexShader: beamVertexShader,
    fragmentShader: beamFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  }), []);

  const bokehShader = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: bokehVertexShader,
    fragmentShader: bokehFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), []);

  useFrame(() => {
    if (!group.current) return;
    const p = clamp01(progressRef.current);
    const inOpening = p < 0.118;
    const inCoda = p > 0.92;
    const vis = inOpening || inCoda;
    group.current.visible = vis;
    if (!vis) return;
    if (Math.abs(p - lastP.current) < 0.00002) return;
    lastP.current = p;

    const t = beat(p);

    const reveal = inCoda
      ? smooth(0.92, 0.96, p)
      : (1.0 - smooth(0.82, 0.99, t));
    const faint = inCoda
      ? 0.80
      : (1.0 - smooth(0.85, 1.0, t));

    const handoff = handoffRef ? clamp01(handoffRef.current ?? 1) : 1;
    const handoffBeam = smooth(0.15, 0.85, handoff);
    const handoffBokeh = smooth(0.2, 0.9, handoff);
    const uGlowVal = (1.0 - handoff) * 2.8;

    sporeShader.uniforms.uReveal.value = Math.max(0.22, reveal);
    sporeShader.uniforms.uGlow.value = uGlowVal;
    frontSporeShader.uniforms.uReveal.value = Math.max(0.22, reveal);
    frontSporeShader.uniforms.uGlow.value = uGlowVal;

    beamShader.uniforms.uReveal.value = (0.38 + 0.62 * reveal) * 0.95 * handoffBeam;
    bokehShader.uniforms.uOpacity.value = 0.68 * Math.max(0.25, faint) * handoffBokeh;

    // Anatomical Cutaway Opening Transition (progress: 0.32 -> 0.67 in Station 01 beat)
    // During handoff (handoff < 0.999), cell is 100% closed
    const opening = inCoda ? 0.0 : (handoff < 0.999 ? 0.0 : smooth(0.32, 0.67, t));
    frontSporeShader.uniforms.uOpacity.value = Math.max(0.0, 1.0 - opening * 1.35);

    if (frontShellRef.current) {
      // Smooth hinged cutaway opening along the depth axis (towards viewer)
      frontShellRef.current.position.set(0, 0, opening * 0.42);
      frontShellRef.current.rotation.set(0, opening * 0.35, 0);
      frontShellRef.current.visible = opening < 0.985;
    }

    if (specimenGroup.current) {
      // Rotation maps Huner's horizontal coordinate frame (XY horizontal, Z depth) to Bioprocess camera view
      // At handoff (t=0): exact match to Huner's closed cell [pitch: +0.18, yaw: -0.32, roll: -0.18]
      // During Station 01: gentle orbital inspection
      specimenGroup.current.rotation.set(
        Math.PI / 2 + 0.18 - opening * 0.08,
        -0.32 + t * 0.35,
        -0.18 + t * 0.15
      );
      specimenGroup.current.position.set(
        SPORE_ANCHOR[0] + t * 0.08,
        SPORE_ANCHOR[1],
        SPORE_ANCHOR[2]
      );
    }
    if (germTubeRef.current) {
      // Sprout the initial hyphal germ tube during the second half of Scene 01 (t = 0.45 -> 0.95)
      const sprout = inCoda ? 1.0 : smooth(0.45, 0.92, t);
      germTubeRef.current.visible = sprout > 0.02;
      if (germTubeRef.current.visible) {
        germTubeRef.current.scale.set(sprout, 0.35 + 0.65 * sprout, sprout);
      }
    }
    if (halo.current) {
      halo.current.material.opacity = 0.24 * reveal * handoff;
      if (specimenGroup.current) {
        halo.current.rotation.copy(specimenGroup.current.rotation);
        halo.current.position.copy(specimenGroup.current.position);
      }
    }
  });

  return (
    <>
      <ZoneAMicroscopyHardware progressRef={progressRef} handoffRef={handoffRef} />
      <group ref={group} visible={false}>
        {/* Volumetric Observation Column & Diagonal God-Ray Shaft */}
        <mesh position={[1.2, -0.03, 1.85]} rotation={[Math.PI / 2, 0, 0]} material={beamShader}>
          <cylinderGeometry args={[0.26, 0.56, 2.55, 32, 1, true]} />
        </mesh>
        <mesh position={[1.08, -0.03, 1.92]} rotation={[Math.PI / 2, 0, -0.26]} material={beamShader}>
          <cylinderGeometry args={[0.16, 0.48, 2.75, 28, 1, true]} />
        </mesh>

        {/* Hero Cell Model: Exactly identical horizontal geometry matching Huner Biofoundry */}
        <group ref={specimenGroup} position={SPORE_ANCHOR} scale={[0.1045, 0.1045, 0.1045]}>
          {/* 1. Permanent Back Cup Chitin Shell */}
          <mesh geometry={backShellGeo} material={sporeShader} />

          {/* 2. Opening Cutaway Front Cap (smoothly aralanır between t: 0.32 -> 0.67) */}
          <mesh ref={frontShellRef} geometry={frontShellGeo} material={frontSporeShader} />

          {/* 3. Authentic Huner Biofoundry FungalCell Organelle World */}
          <FungalCellAnatomy progressRef={progressRef} />

          {/* 4. Hyphal Germ Tube sprouting from polar hilum */}
          <mesh ref={germTubeRef} geometry={germTubeGeo} material={sporeShader} visible={false} />
        </group>

        {/* Luminous Rim Halo */}
        <mesh ref={halo} geometry={lightSporeGeo} position={SPORE_ANCHOR} scale={[0.1128, 0.1128, 0.1128]}>
          <meshBasicMaterial color="#b9f3c4" transparent opacity={0} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>

        <points ref={particles} material={bokehShader} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[bokeh.positions, 3]} />
            <bufferAttribute attach="attributes-aScale" args={[bokeh.scales, 1]} />
            <bufferAttribute attach="attributes-aPhase" args={[bokeh.phases, 1]} />
          </bufferGeometry>
        </points>
      </group>
    </>
  );
}
