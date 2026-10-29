import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';
import { myceliumVertexShader, myceliumFragmentShader } from './PetriLookdev.jsx';

// Zone E: reference container E_culture_container_2_1, immutable in the locked GLB.
// Macro inspection inside the central oxygenated liquid culture tank of the incubator.
export const NETWORK_REFERENCE = Object.freeze({
  containerName: 'E_culture_container_2_1',
  center: [15.32, -0.235, 1.665],
  bounds: { x: [15.085, 15.555], y: [-0.310, 0.470], z: [1.535, 1.885] },
  interval: [0.595, 0.671]
});

export function networkEase(a, b, p) {
  const t = THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function randomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildNetworkFilaments(seed=20261027) {
  const rand = randomFactory(seed), result = [];
  const center = NETWORK_REFERENCE.center;
  function grow(start, theta, length, depth, rootId) {
    const n = 10;
    const points = [];
    const wobble = (rand() - .5) * .24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = theta + wobble * t + .065 * Math.sin(t * 4.3 + rootId);
      const x = THREE.MathUtils.clamp(start.x + Math.cos(a) * length * t, 15.088,15.552);
      const z = THREE.MathUtils.clamp(start.z + Math.sin(a) * length * t, 1.539,1.881);
      const y = start.y + (rand() - .5) * .0025 + Math.sin(t * Math.PI) * .0055 - depth * 0.0025;
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const radius = Math.max(.00032, .00115 * Math.pow(.68, depth));
    const tube = new THREE.TubeGeometry(curve, 12, radius, 5, false);
    result.push({
      geometry: tube,
      depth,
      rootId
    });
    if (depth >= 3) return;
    for (const turn of [-1, 1]) {
      const at = .48 + rand() * .21;
      const position = curve.getPointAt(at);
      grow(position, theta + turn * (.39 + rand() * .38), (length * .58 + rand() * .009), depth + 1, rootId);
    }
  }
  for (let i = 0; i < 12; i++) {
    const theta = i * 2.399963229728653;
    const r = .012 + .026 * rand();
    const start = new THREE.Vector3(
      center[0] + Math.cos(theta) * r,
      center[1] + (rand() - .5) * .018,
      center[2] + Math.sin(theta) * r * .8
    );
    grow(start, theta + .12 * (rand() - .5), .048 + .020 * rand(), 0, i);
  }
  return result;
}

function buildBatchedAnastomosisTiers() {
  const rand = randomFactory(884219);
  const tierCount = 6;
  const buckets = Array.from({ length: tierCount }, () => []);
  const center = NETWORK_REFERENCE.center;
  for (let i = 0; i < 96; i++) {
    const ang1 = rand() * Math.PI * 2;
    const ang2 = ang1 + (rand() - 0.5) * 0.9;
    const r1 = 0.015 + rand() * 0.16;
    const r2 = r1 + (rand() - 0.3) * 0.045;
    const yLayer = center[1] - 0.022 + rand() * 0.044;
    const p0 = new THREE.Vector3(
      THREE.MathUtils.clamp(center[0] + Math.cos(ang1) * r1, 15.095, 15.545),
      yLayer,
      THREE.MathUtils.clamp(center[2] + Math.sin(ang1) * r1 * 0.78, 1.545, 1.875)
    );
    const p2 = new THREE.Vector3(
      THREE.MathUtils.clamp(center[0] + Math.cos(ang2) * r2, 15.095, 15.545),
      yLayer + (rand() - 0.5) * 0.010,
      THREE.MathUtils.clamp(center[2] + Math.sin(ang2) * r2 * 0.78, 1.545, 1.875)
    );
    const p1 = p0.clone().lerp(p2, 0.5);
    p1.x += (rand() - 0.5) * 0.012;
    p1.z += (rand() - 0.5) * 0.012;
    p1.y -= 0.003;
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
    const tIdx = Math.min(tierCount - 1, Math.floor((i / 96) * tierCount));
    buckets[tIdx].push(new THREE.TubeGeometry(curve, 8, 0.00022 + (i % 3) * 0.00007, 4, false));
  }
  return buckets.map((b, idx) => ({
    geometry: mergeGeometriesFast(b),
    order: idx / tierCount
  }));
}

export function LivingNetwork({ progressRef }) {
  const tierRefs = useRef([]);
  const crossRefs = useRef([]);
  const spitzenRef = useRef();
  const groupRef = useRef();
  const bubbleGroupRef = useRef();
  const lastP = useRef(-1);

  const webMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 }, uSeed: { value: 5.83 } },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const batchedPrimary = useMemo(() => {
    const raw = buildNetworkFilaments();
    const tierCount = 12;
    const tubeBuckets = Array.from({ length: tierCount }, () => []);
    raw.forEach((item, idx) => {
      const tIdx = Math.min(tierCount - 1, Math.floor((idx / raw.length) * tierCount));
      tubeBuckets[tIdx].push(item.geometry);
    });
    return {
      tubes: tubeBuckets.map(b => mergeGeometriesFast(b)),
      tierCount
    };
  }, []);

  const crossTiers = useMemo(() => buildBatchedAnastomosisTiers(), []);

  // Optical macro sight-window ring & micro-bubbles suspended inside E_culture_container_2_1
  const macroFrameAndBubbles = useMemo(() => {
    const rand = randomFactory(314159);
    const frameGeo = mergeGeometriesFast([
      transformGeo(new THREE.TorusGeometry(0.165, 0.0045, 10, 48), [15.32, -0.252, 1.665], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.174, 0.0022, 8, 48), [15.32, -0.255, 1.665], [Math.PI / 2, 0, 0])
    ]);
    const bubbleGeos = [];
    const sphere = new THREE.SphereGeometry(0.0022, 6, 5);
    for (let i = 0; i < 65; i++) {
      const bx = 15.16 + rand() * 0.32;
      const by = -0.26 + rand() * 0.08;
      const bz = 1.54 + rand() * 0.26;
      const s = 0.6 + rand() * 1.1;
      bubbleGeos.push(transformGeo(sphere, [bx, by, bz], [0, 0, 0], [s, s, s]));
    }

    // Bioluminescent Spitzenkörper (Hyphal Tip Growth Vesicles & Anastomosis Nodes)
    const spitzenGeos = [];
    const tipOct = new THREE.OctahedronGeometry(0.0024, 0);
    for (let k = 0; k < 56; k++) {
      const ang = (k / 56) * Math.PI * 2 + rand() * 0.25;
      const rad = 0.035 + Math.pow(rand(), 0.7) * 0.145;
      const sx = THREE.MathUtils.clamp(15.32 + Math.cos(ang) * rad, 15.10, 15.54);
      const sy = -0.235 + (rand() - 0.5) * 0.028;
      const sz = THREE.MathUtils.clamp(1.665 + Math.sin(ang) * rad * 0.78, 1.55, 1.87);
      spitzenGeos.push(transformGeo(tipOct, [sx, sy, sz]));
    }

    return {
      frameGeo,
      bubblesGeo: mergeGeometriesFast(bubbleGeos),
      spitzenGeo: mergeGeometriesFast(spitzenGeos)
    };
  }, []);

  const spitzenMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#9effc8',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  const primaryMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fcfaf2',
    emissive: '#3d6e54',
    emissiveIntensity: 0.22,
    roughness: 0.55,
    metalness: 0.0
  }), []);

  const crossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#eeeae0',
    emissive: '#2f5943',
    emissiveIntensity: 0.16,
    roughness: 0.65,
    transparent: true,
    opacity: 0.86
  }), []);

  const lensRingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#9db5a9',
    metalness: 0.82,
    roughness: 0.24
  }), []);

  const microBubbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e6fff2',
    emissive: '#6ad99b',
    emissiveIntensity: 0.35,
    roughness: 0.1,
    transparent: true,
    opacity: 0.78
  }), []);

  useFrame(() => {
    const p = progressRef.current;
    const appearing = networkEase(.596, .651, p);
    const withdrawing = 1 - networkEase(.654, .670, p);
    const visibleFraction = appearing * withdrawing;
    const active = visibleFraction > 0.001;

    if (groupRef.current) groupRef.current.visible = active;
    if (!active) return;
    if (Math.abs(p - lastP.current) < 0.0002) return;
    lastP.current = p;

    webMat.uniforms.uGrowth.value = visibleFraction;
    if (bubbleGroupRef.current) {
      bubbleGroupRef.current.position.z = ((p * 12.0) % 0.04) - 0.02;
    }
    if (spitzenRef.current) {
      spitzenRef.current.visible = visibleFraction > 0.25;
      if (spitzenRef.current.visible) {
        const pulse = 0.62 + 0.38 * Math.sin(p * 260.0);
        spitzenMat.opacity = visibleFraction * pulse * 0.92;
      }
    }

    const N = batchedPrimary.tierCount;
    for (let i = 0; i < N; i++) {
      const threshold = i / N;
      const m = tierRefs.current[i];
      if (m) m.visible = visibleFraction > threshold;
    }
    for (let j = 0; j < crossRefs.current.length; j++) {
      const cm = crossRefs.current[j];
      if (cm) cm.visible = visibleFraction > 0.25 + crossTiers[j].order * 0.68;
    }
  });

  return (
    <group ref={groupRef} name="SCENE07_REFERENCE_CONTAINER_MICROSCOPY" visible={false}>
      {/* Optical Macro Viewport Ring mounted on the front glass of Central Incubator Tank E_culture_container_2_1 */}
      <mesh geometry={macroFrameAndBubbles.frameGeo} material={lensRingMat} />

      {/* Translucent Oxygenated Liquid Backlight Window inside the Central Incubator Tank */}
      <mesh position={[15.32, -0.222, 1.665]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.165, 32]} />
        <meshBasicMaterial color="#123024" transparent opacity={0.52} depthWrite={false} />
      </mesh>

      {/* Suspended Gossamer Rhizomorphic Mycelium Core in Liquid Culture */}
      <mesh position={[15.32, -0.238, 1.665]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 0.16, 1]} material={webMat}>
        <circleGeometry args={[1, 32]} />
      </mesh>

      {/* Rising Micro-Bubbles around the 3D Hyphal Filaments */}
      <group ref={bubbleGroupRef}>
        <mesh geometry={macroFrameAndBubbles.bubblesGeo} material={microBubbleMat} />
      </group>

      {/* Bioluminescent Spitzenkörper Hyphal Tip Vesicles & Anastomosis Nodes */}
      <mesh ref={spitzenRef} geometry={macroFrameAndBubbles.spitzenGeo} material={spitzenMat} visible={false} frustumCulled={false} />

      {batchedPrimary.tubes.map((geometry, i) => (
        <mesh
          key={i}
          ref={el => tierRefs.current[i] = el}
          geometry={geometry}
          material={primaryMat}
          visible={false}
          frustumCulled={false}
        />
      ))}

      {crossTiers.map(({ geometry }, j) => (
        <mesh
          key={'cross-' + j}
          ref={el => crossRefs.current[j] = el}
          geometry={geometry}
          material={crossMat}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
