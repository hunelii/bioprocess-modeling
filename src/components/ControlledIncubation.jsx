import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';

// Eight-zone locked world: Zone E is fixed at X 13.25–17.75 metres.
// Oxygenated Liquid-Culture Incubator: 15 aerated bio-chambers with bottom oxygen spargers,
// rising micro-bubble streams, and buoyant multi-lobed fungal mycelium masses growing in liquid.
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

const liquidVertexShader = `
  varying vec2 vUv;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Oxygenated liquid medium shader: bottom-lit aeration glow + rising micro-bubble curtains
const liquidFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vLocalPos;
  varying vec3 vNormal;

  void main() {
    // Height normalized from bottom (0.0) to top meniscus (1.0) of the container
    float h = clamp((vLocalPos.z + 0.145) / 0.29, 0.0, 1.0);

    // Bottom oxygen sparger illumination gradient (brightest at the bottom where O2 enters)
    float spargerLight = exp(-h * 2.1) * 0.75 + 0.25;

    // Rising vertical streams of fine oxygen bubbles inside the liquid
    float xCoord = vLocalPos.x * 38.0 + vLocalPos.y * 19.0;
    float zRise1 = vLocalPos.z * 55.0 - uTime * 3.8;
    float zRise2 = vLocalPos.z * 85.0 - uTime * 5.2;
    float stream1 = pow(0.5 + 0.5 * sin(xCoord + sin(zRise1 * 0.25)), 4.0) * (0.5 + 0.5 * cos(zRise1));
    float stream2 = pow(0.5 + 0.5 * cos(xCoord * 1.7 - cos(zRise2 * 0.2)), 5.0) * (0.5 + 0.5 * sin(zRise2));
    float bubbles = clamp(stream1 * 0.65 + stream2 * 0.55, 0.0, 1.0);

    vec3 deepBroth = vec3(0.16, 0.34, 0.28);
    vec3 goldenBroth = vec3(0.46, 0.68, 0.52);
    vec3 o2Highlight = vec3(0.84, 0.98, 0.88);

    vec3 col = mix(deepBroth, goldenBroth, spargerLight);
    col = mix(col, o2Highlight, bubbles * 0.65 + (1.0 - h) * 0.25);

    // Frothy aerated top meniscus layer
    float topFoam = smoothstep(0.88, 0.99, h);
    col = mix(col, o2Highlight, topFoam * 0.55);

    gl_FragColor = vec4(col, 0.42 + 0.18 * bubbles);
  }
`;

const fungalMassVertexShader = `
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  void main() {
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Submerged flocculent fungal mass shader with bottom oxygenation subsurface glow
const fungalMassFragmentShader = `
  uniform float uGrowth;
  varying vec3 vLocalPos;
  varying vec3 vNormal;

  void main() {
    if (uGrowth <= 0.01) discard;
    vec3 N = normalize(vNormal);
    // Light from below (oxygen sparger LED + bubble refraction) and front
    vec3 L_bottom = normalize(vec3(0.0, -0.35, -0.92));
    vec3 L_front = normalize(vec3(0.2, -0.85, 0.45));

    float bottomLit = max(dot(N, L_bottom), 0.0);
    float frontLit = max(dot(N, L_front), 0.0);

    // Fibrous cottony mycelial surface texture
    vec3 p = vLocalPos * 42.0;
    float fibers = 0.5 + 0.3 * sin(p.x + cos(p.y * 1.3)) * cos(p.z + sin(p.x * 1.2))
                       + 0.2 * cos(p.y * 2.4 - p.z * 2.1);

    vec3 coreCream = vec3(0.92, 0.90, 0.80);
    vec3 airyHyphae = vec3(0.99, 0.98, 0.93);
    vec3 bottomO2Tint = vec3(0.76, 0.95, 0.84);

    vec3 col = mix(coreCream, airyHyphae, fibers * 0.7 + frontLit * 0.3);
    col = mix(col, bottomO2Tint, bottomLit * 0.42);

    gl_FragColor = vec4(col, 0.94);
  }
`;

// Multi-lobed buoyant fungal mycelium cluster growing suspended in liquid
function createSubmergedFungalMassGeometry() {
  const lobeSpecs = [
    { pos: [0.0, -0.02, 0.0], scale: [0.125, 0.165, 0.082], seed: 1.0 },
    { pos: [-0.068, 0.04, 0.018], scale: [0.088, 0.115, 0.064], seed: 2.4 },
    { pos: [0.072, 0.03, -0.015], scale: [0.092, 0.120, 0.066], seed: 3.8 },
    { pos: [0.015, -0.10, -0.022], scale: [0.078, 0.095, 0.055], seed: 5.1 },
    { pos: [-0.035, -0.08, 0.028], scale: [0.068, 0.085, 0.048], seed: 6.7 }
  ];

  const geos = lobeSpecs.map(spec => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wave = 1.0
        + 0.22 * Math.sin(4.5 * x + spec.seed) * Math.cos(4.2 * y - spec.seed)
        + 0.12 * Math.cos(9.5 * z + 7.2 * x);
      pos.setXYZ(
        i,
        spec.pos[0] + x * spec.scale[0] * wave,
        spec.pos[1] + y * spec.scale[1] * wave,
        spec.pos[2] + z * spec.scale[2] * wave
      );
    }
    g.computeVertexNormals();
    return g;
  });

  return mergeGeometriesFast(geos);
}

const COLS_X = [13.72, 14.52, 15.32, 16.12, 16.92];
const ROWS_Z = [1.05, 1.71, 2.38];

function IncubatorArchitecturalDetailing({ progressRef }) {
  const rowRefs = useRef([]);
  const bubblePointsRef = useRef();
  const lastP = useRef(-1);

  const liquidMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: liquidVertexShader,
    fragmentShader: liquidFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  const sharedMassMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 1.0 } },
    vertexShader: fungalMassVertexShader,
    fragmentShader: fungalMassFragmentShader,
    transparent: true
  }), []);

  // Rising 3D oxygen bubbles across all 15 liquid containers
  const o2Bubbles = useMemo(() => {
    const perTank = 12;
    const count = 15 * perTank;
    const pos = new Float32Array(count * 3);
    const baseZ = new Float32Array(count);
    const speeds = new Float32Array(count);
    let seed = 55109;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    let idx = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col], cy = 0.08, cz = ROWS_Z[row];
        for (let k = 0; k < perTank; k++) {
          pos[idx * 3] = cx + (rand() - 0.5) * 0.34;
          pos[idx * 3 + 1] = cy + (rand() - 0.5) * 0.52;
          const z0 = cz - 0.135;
          baseZ[idx] = z0;
          pos[idx * 3 + 2] = z0 + rand() * 0.27;
          speeds[idx] = 0.3 + rand() * 0.7;
          idx++;
        }
      }
    }
    return { pos, baseZ, speeds, count };
  }, []);

  const brushedSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const spargerGlowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#a8f0c6', transparent: true, opacity: 0.75
  }), []);

  // Batch all 15 liquid volumes, 15 bottom oxygen sparger diffusers, 3 row-grouped fungal mass meshes, and transfer pipes to Zone F & G!
  const batched = useMemo(() => {
    const singleMass = createSubmergedFungalMassGeometry();
    const liquidList = [];
    const spargerList = [];
    const rowMassGeos = [[], [], []];
    const steelList = [
      transformGeo(new THREE.BoxGeometry(2.55, 0.22, 0.12), [15.5, -1.16, 3.27])
    ];
    const pillarCyl = new THREE.CylinderGeometry(0.055, 0.055, 2.68, 12);
    for (const xPos of [13.21, 15.38, 17.78]) {
      steelList.push(transformGeo(pillarCyl, [xPos, -1.24, 1.86], [Math.PI / 2, 0, 0]));
    }

    const liqBox = new THREE.BoxGeometry(0.43, 0.70, 0.29);
    const spargerBar = new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8);
    const statusLedBox = new THREE.BoxGeometry(0.022, 0.012, 0.010);

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = COLS_X[col], cy = 0.08, cz = ROWS_Z[row];
        liquidList.push(transformGeo(liqBox, [cx, cy, cz - 0.01]));
        spargerList.push(transformGeo(spargerBar, [cx, cy - 0.08, cz - 0.142], [0, 0, Math.PI / 2]));
        // Emerald-green chamber aeration status LED indicator at the top front edge of each bio-chamber
        spargerList.push(transformGeo(statusLedBox, [cx - 0.16, cy - 0.355, cz + 0.145]));
        // Position relative to row center [15.32, 0.08, ROWS_Z[row]] so each row scales cleanly around its shelf center
        rowMassGeos[row].push(transformGeo(singleMass, [cx - 15.32, 0, 0]));
      }
    }

    // Dual Vertical Oxygen Rotameter Flowmeter Banks (Debi Ölçer Tüpler) on Left (x=13.28) & Right (x=17.68) Pillars
    for (const rx of [13.28, 17.68]) {
      // Stainless rotameter backplate & valve blocks
      steelList.push(transformGeo(new THREE.BoxGeometry(0.11, 0.035, 0.88), [rx, -1.18, 1.88]));
      for (const rz of [1.54, 1.88, 2.22]) {
        // Glass rotameter flow tube
        liquidList.push(transformGeo(new THREE.CylinderGeometry(0.014, 0.011, 0.24, 10), [rx, -1.21, rz], [Math.PI / 2, 0, 0]));
        // Glowing emerald O2 float bobbin inside each rotameter tube
        spargerList.push(transformGeo(new THREE.SphereGeometry(0.011, 8, 6), [rx, -1.21, rz + 0.03]));
        // Brass/steel needle valve knob at base of each rotameter
        steelList.push(transformGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 10), [rx, -1.225, rz - 0.13]));
      }
    }

    const transferUpper = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.15, 0.08, 1.71),
        new THREE.Vector3(17.95, 0.08, 1.71),
        new THREE.Vector3(18.35, 0.08, 1.98),
        new THREE.Vector3(18.84, 0.08, 1.98)
      ]),
      18, 0.036, 8, false
    );
    const transferLower = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(17.15, 0.25, 1.05),
        new THREE.Vector3(18.10, 0.25, 1.05),
        new THREE.Vector3(18.10, 0.85, 0.72),
        new THREE.Vector3(23.60, 0.85, 0.72)
      ]),
      20, 0.042, 8, false
    );
    steelList.push(transferUpper, transferLower);

    return {
      liquidGeo: mergeGeometriesFast(liquidList),
      spargerGeo: mergeGeometriesFast(spargerList),
      steelGeo: mergeGeometriesFast(steelList),
      rowGeos: rowMassGeos.map(list => mergeGeometriesFast(list))
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    if (p < 0.36) return;
    if (Math.abs(p - lastP.current) < 0.0003) return;
    lastP.current = p;

    const growth = p > 0.92 ? 1.0 : incubEase(.465, .540, p);
    liquidMat.uniforms.uTime.value = p * 38.0;
    sharedMassMat.uniforms.uGrowth.value = Math.max(0.05, growth);

    for (let row = 0; row < 3; row++) {
      const m = rowRefs.current[row];
      if (!m) continue;
      const phase = THREE.MathUtils.clamp(growth * 1.35 - row * 0.15, 0, 1);
      m.visible = phase > 0.02;
      if (m.visible) {
        const s = 0.28 + 0.72 * phase;
        m.scale.set(1, s, s);
        // Gentle buoyant floating oscillation driven by bottom O2 aeration
        m.position.z = ROWS_Z[row] + 0.009 * Math.sin(p * 110.0 + row * 2.1);
        m.rotation.y = 0.022 * Math.cos(p * 85.0 + row * 1.7);
      }
    }

    if (bubblePointsRef.current && p <= 0.68) {
      const attr = bubblePointsRef.current.geometry.attributes.position;
      for (let i = 0; i < o2Bubbles.count; i++) {
        const z0 = o2Bubbles.baseZ[i];
        const zRel = ((i * 0.037 + p * 12.0 * o2Bubbles.speeds[i]) % 1.0) * 0.27;
        attr.setZ(i, z0 + zRel);
      }
      attr.needsUpdate = true;
    }
  });

  return (
    <group name="ZONE_E_HIGH_DETAIL_INCUBATOR">
      <mesh geometry={batched.steelGeo} material={brushedSteelMat} />
      {/* Bottom Oxygen Sparger Diffuser Bars */}
      <mesh geometry={batched.spargerGeo} material={spargerGlowMat} />
      {/* Oxygenated Nutrient Liquid Columns in All 15 Containers */}
      <mesh geometry={batched.liquidGeo} material={liquidMat} />

      {/* Rising Oxygen Bubble Streams from Bottom Spargers */}
      <points ref={bubblePointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[o2Bubbles.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#d8fceb" size={0.016} transparent opacity={0.82} depthWrite={false} sizeAttenuation />
      </points>

      {/* 15 Buoyant Submerged Fungal Mycelium Masses Batched into 3 Shelf Rows (3 Draw Calls Total) */}
      {ROWS_Z.map((rz, row) => (
        <mesh
          key={row}
          ref={el => rowRefs.current[row] = el}
          geometry={batched.rowGeos[row]}
          material={sharedMassMat}
          position={[15.32, 0.08, rz]}
          visible={false}
        />
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
