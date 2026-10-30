import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';

// Locked vessels in the original GLB — geometry and positions must never change.
// Realistic submerged liquid culture: stellate mycelial micro-pellets & gossamer vortex filaments.
export const VESSELS = Object.freeze([
  {id:0,center:[9.88,.25,1.196],start:.368,end:.387,radius:.12,outerRadius:.29,zBottom:.82,zTop:1.70},
  {id:1,center:[10.95,.25,1.28],start:.387,end:.409,radius:.19,outerRadius:.46,zBottom:.82,zTop:2.12},
  {id:2,center:[12.15,.25,1.372],start:.406,end:.428,radius:.27,outerRadius:.59,zBottom:.82,zTop:2.58}
]);
export const EXPANSION_WINDOW=[.32,.43];
export const ease=(a,b,p)=>{const t=THREE.MathUtils.clamp((p-a)/(b-a),0,1);return t*t*(3-2*t);};

const pelletVertexShader = `
  attribute float aOrder;
  attribute float aSize;
  attribute float aPhase;
  uniform float uGrowth;
  varying float vVisible;
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    // Progressive multiplication of suspended mycelial pellets as culture expands
    float localG = clamp((uGrowth - aOrder * 0.72) / 0.28, 0.0, 1.0);
    vVisible = localG;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.4, -mvPosition.z);
    gl_PointSize = clamp((aSize * localG * 120.0) / dist, 0.0, 32.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Renders each point as a fluffy, stellate (star-haired) cream-white mycelial micro-pellet
const pelletFragmentShader = `
  varying float vVisible;
  varying float vPhase;
  void main() {
    if (vVisible <= 0.02) discard;
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    float theta = atan(uv.y, uv.x) + vPhase;

    // Radiating microscopic hyphal hairs around the pellet periphery
    float hairs = 0.5 + 0.5 * sin(theta * 19.0 + r * 6.0) * cos(theta * 31.0 - vPhase);
    float core = 1.0 - smoothstep(0.0, 0.52, r);
    float halo = (1.0 - smoothstep(0.32, 0.98, r)) * (0.45 + 0.55 * hairs);
    float alpha = clamp(core * 0.92 + halo * 0.65, 0.0, 0.95) * vVisible;
    if (alpha < 0.03) discard;

    vec3 innerCream = vec3(0.97, 0.95, 0.88);
    vec3 outerHyphae = vec3(0.89, 0.86, 0.76);
    vec3 col = mix(outerHyphae, innerCream, core);
    gl_FragColor = vec4(col, alpha);
  }
`;

function CultureThreads({ vessel, progressRef }) {
  const group = useRef();
  const stirBarRef = useRef();
  const tierRefs = useRef([]);
  const lastP = useRef(-1);

  const cx = vessel.center[0], cy = vessel.center[1];
  const rOut = vessel.outerRadius;
  const h = vessel.zTop - vessel.zBottom;
  const zMid = (vessel.zTop + vessel.zBottom) * 0.5;

  const pelletMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 } },
    vertexShader: pelletVertexShader,
    fragmentShader: pelletFragmentShader,
    transparent: true,
    depthWrite: false
  }), []);

  // Build suspended stellate mycelial micro-pellet cloud + gossamer vortex filaments
  const batchedBiomass = useMemo(() => {
    const tierCount = 6;
    const strandBuckets = Array.from({ length: tierCount }, () => []);

    for (let i = 0; i < 48; i++) {
      const angle = 2 * Math.PI * ((i * .61803398875) % 1);
      const r = (.16 + .72 * ((i * .41421356237) % 1)) * vessel.outerRadius * 0.78;
      const zSpan = (vessel.zTop - vessel.zBottom) * 0.58;
      const zOff = ((i % 9) - 4) * zSpan * 0.11;
      const points = Array.from({ length: 8 }, (_, j) => {
        const t = j / 7;
        const swirl = angle + t * 1.45 + 0.18 * Math.sin(t * 6 + i);
        return new THREE.Vector3(
          vessel.center[0] + r * Math.cos(swirl) * (.28 + t * .72),
          vessel.center[1] + r * Math.sin(swirl) * (.28 + t * .72),
          vessel.center[2] + zOff + (t - 0.3) * zSpan * 0.55 + 0.03 * Math.sin(i + t * 5)
        );
      });
      const tIdx = Math.min(tierCount - 1, Math.floor((i / 48) * tierCount));
      strandBuckets[tIdx].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, .0011 + (i % 3) * .0004, 4, false));
    }

    // 140..260 suspended mycelial micro-pellets depending on vessel size
    const pelletCount = 120 + vessel.id * 70;
    const positions = new Float32Array(pelletCount * 3);
    const orders = new Float32Array(pelletCount);
    const sizes = new Float32Array(pelletCount);
    const phases = new Float32Array(pelletCount);
    let seed = 31091 + vessel.id * 997;
    const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

    for (let i = 0; i < pelletCount; i++) {
      const ang = i * 2.399963229728653 + rand() * 0.3;
      const radialFrac = Math.pow(rand(), 0.55);
      const r = radialFrac * vessel.outerRadius * 0.78;
      const z = vessel.zBottom + 0.10 + rand() * (vessel.zTop - vessel.zBottom) * 0.62;
      positions[i * 3] = cx + Math.cos(ang) * r;
      positions[i * 3 + 1] = cy + Math.sin(ang) * r;
      positions[i * 3 + 2] = z;
      orders[i] = i / pelletCount;
      sizes[i] = (0.18 + 0.32 * rand()) * (0.85 + vessel.id * 0.22);
      phases[i] = rand() * Math.PI * 2;
    }

    return {
      strandTiers: strandBuckets.map(b => mergeGeometriesFast(b)),
      tierCount,
      pellets: { positions, orders, sizes, phases }
    };
  }, [vessel, cx, cy]);

  const batchedVessel = useMemo(() => {
    const steelList = [
      transformGeo(new THREE.CylinderGeometry(rOut * 1.04, rOut * 1.08, 0.09, 28), [cx, cy, vessel.zBottom - 0.02], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(rOut * 1.05, rOut * 1.05, 0.055, 28), [cx, cy, vessel.zTop + 0.02], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(rOut * 0.98, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), [cx, cy, vessel.zTop + 0.06], [0, 0, 0], [1, 1, 0.28]),
      transformGeo(new THREE.CylinderGeometry(0.012, 0.012, h * 0.88, 8), [cx, cy, zMid], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(rOut * 0.34, rOut * 0.34, 0.012, 14), [cx, cy, zMid - h * 0.18], [Math.PI / 2, 0, 0])
    ];
    const darkList = [
      transformGeo(new THREE.CylinderGeometry(rOut * 0.22, rOut * 0.26, 0.18, 16), [cx, cy, vessel.zTop + 0.19], [Math.PI / 2, 0, 0])
    ];

    const portCyl = new THREE.CylinderGeometry(0.022, 0.022, 0.11, 8);
    const capCyl = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8);
    const hepaDisc = new THREE.CylinderGeometry(0.052, 0.052, 0.014, 14);
    const clampBox = new THREE.BoxGeometry(0.036, 0.018, 0.022);
    const tieRodCyl = new THREE.CylinderGeometry(0.011, 0.011, h + 0.04, 6);

    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.4;
      const pr = rOut * 0.58;
      const px = cx + Math.cos(ang) * pr;
      const py = cy + Math.sin(ang) * pr;
      steelList.push(transformGeo(portCyl, [px, py, vessel.zTop + 0.11], [Math.PI / 2, 0, 0]));
      darkList.push(transformGeo(capCyl, [px, py, vessel.zTop + 0.175], [Math.PI / 2, 0, 0]));

      // Add 0.22 µm sterile PTFE HEPA vent filter discs & silicone dosing hose with pinch clamp on front/side ports
      if (k < 2) {
        steelList.push(transformGeo(hepaDisc, [px, py, vessel.zTop + 0.205], [Math.PI / 2, 0, 0]));
        const hoseCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, py, vessel.zTop + 0.215),
          new THREE.Vector3(px + (k === 0 ? 0.08 : -0.08), py - 0.06, vessel.zTop + 0.30),
          new THREE.Vector3(cx + (k === 0 ? 0.16 : -0.16), cy - 0.12, vessel.zTop + 0.24)
        ]);
        steelList.push(new THREE.TubeGeometry(hoseCurve, 10, 0.0085, 6, false));
        darkList.push(transformGeo(clampBox, [px + (k === 0 ? 0.05 : -0.05), py - 0.04, vessel.zTop + 0.27], [0.3, 0, ang]));
      }

      const tang = (k / 4) * Math.PI * 2 + 0.78;
      steelList.push(transformGeo(tieRodCyl, [cx + Math.cos(tang) * (rOut * 1.02), cy + Math.sin(tang) * (rOut * 1.02), zMid], [Math.PI / 2, 0, 0]));
    }

    // Broth column + concave spinning vortex meniscus funnel at the top of the liquid
    const zMeniscus = vessel.zBottom + h * 0.78;
    const brothGeo = mergeGeometriesFast([
      transformGeo(new THREE.CylinderGeometry(rOut * 0.93, rOut * 0.93, h * 0.76, 24), [cx, cy, vessel.zBottom + h * 0.40], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(rOut * 0.62, rOut * 0.26, 8, 24), [cx, cy, zMeniscus - 0.015], [0, 0, 0], [1, 1, 0.22]),
      transformGeo(new THREE.ConeGeometry(rOut * 0.42, h * 0.16, 18, 1, true), [cx, cy, zMeniscus - h * 0.08], [-Math.PI / 2, 0, 0])
    ]);

    // PTFE / Teflon Magnetic Stir Bar capsule at the bottom center of the vessel
    const stirBarGeo = transformGeo(new THREE.CapsuleGeometry(0.016 + vessel.id * 0.004, 0.075 + vessel.id * 0.025, 4, 8), [0, 0, 0], [0, 0, Math.PI / 2]);

    return {
      steelGeo: mergeGeometriesFast(steelList),
      darkGeo: mergeGeometriesFast(darkList),
      brothGeo,
      stirBarGeo
    };
  }, [cx, cy, rOut, h, zMid, vessel]);

  const strandMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5f2e4',
    roughness: 0.70,
    metalness: 0.0
  }), []);

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const darkSteelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e2924', metalness: 0.65, roughness: 0.42
  }), []);

  const brothMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4be8c',
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  }), []);

  useFrame(() => {
    const p = progressRef.current;
    const a = p > 0.92 ? 1.0 : ease(vessel.start - 0.02, vessel.end, p);
    const active = a > 0.01 && (p >= 0.28 || p > 0.90);
    if (group.current) group.current.visible = active;
    if (!active) return;
    if (Math.abs(p - lastP.current) < 0.00002) return;
    lastP.current = p;

    if (stirBarRef.current) {
      stirBarRef.current.rotation.z = p * (140.0 + vessel.id * 25.0);
    }

    pelletMat.uniforms.uGrowth.value = a;
    for (let i = 0; i < batchedBiomass.tierCount; i++) {
      const thresh = (i + 0.35) / batchedBiomass.tierCount;
      if (tierRefs.current[i]) tierRefs.current[i].visible = a > thresh;
    }
  });

  return (
    <group name={`ZONE_D_VESSEL_${vessel.id}_ASSEMBLY`}>
      <mesh geometry={batchedVessel.steelGeo} material={steelMat} />
      <mesh geometry={batchedVessel.darkGeo} material={darkSteelMat} />
      <mesh geometry={batchedVessel.brothGeo} material={brothMat} />
      {/* Spinning PTFE Magnetic Stir Bar at the bottom center of each vessel */}
      <mesh
        ref={stirBarRef}
        geometry={batchedVessel.stirBarGeo}
        material={strandMat}
        position={[cx, cy, vessel.zBottom + 0.042]}
      />

      <group ref={group} visible={false}>
        <points material={pelletMat} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[batchedBiomass.pellets.positions, 3]} />
            <bufferAttribute attach="attributes-aOrder" args={[batchedBiomass.pellets.orders, 1]} />
            <bufferAttribute attach="attributes-aSize" args={[batchedBiomass.pellets.sizes, 1]} />
            <bufferAttribute attach="attributes-aPhase" args={[batchedBiomass.pellets.phases, 1]} />
          </bufferGeometry>
        </points>
        {batchedBiomass.strandTiers.map((geo, i) => (
          <mesh key={'st-' + i} ref={el => tierRefs.current[i] = el} geometry={geo} material={strandMat} visible={false} />
        ))}
      </group>
    </group>
  );
}

// Thin conceptual pathway guides. They are visual annotations, NOT fluid conduits.
function Line({ points, color, progressRef, start, end }) {
  const line = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 24, .007, 5, false);
  }, [points]);
  const ref = useRef();
  useFrame(() => {
    if (ref.current) {
      const a = ease(start, end, progressRef.current);
      ref.current.visible = a > .005;
      if (ref.current.visible) ref.current.material.opacity = .55 * a;
    }
  });
  return (
    <mesh ref={ref} geometry={line} visible={false}>
      <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function ZoneDOverheadPiping() {
  const steelPipeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const mergedPipesGeo = useMemo(() => mergeGeometriesFast([
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(12.15, 0.25, 2.66),
        new THREE.Vector3(12.15, 0.25, 3.02),
        new THREE.Vector3(12.45, 0.25, 3.12),
        new THREE.Vector3(13.25, 0.25, 3.12)
      ]),
      20, 0.052, 10, false
    ),
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(12.35, 0.38, 2.62),
        new THREE.Vector3(12.38, 0.38, 2.86),
        new THREE.Vector3(12.68, 0.38, 2.92),
        new THREE.Vector3(13.25, 0.38, 2.92)
      ]),
      20, 0.042, 10, false
    )
  ]), []);

  return (
    <group name="ZONE_D_OVERHEAD_PIPES_AND_HUD">
      <mesh geometry={mergedPipesGeo} material={steelPipeMat} />
    </group>
  );
}

export function CultureExpansion({ progressRef }) {
  return (
    <>
      <ZoneDOverheadPiping />
      {VESSELS.map(v => <CultureThreads key={v.id} vessel={v} progressRef={progressRef} />)}
      <Line
        points={[[12.45, .55, 1.24], [12.70, .83, 1.26], [13.05, 1.08, 1.29]]}
        color="#8ec99b"
        progressRef={progressRef}
        start={.415}
        end={.430}
      />
      <Line
        points={[[12.45, .55, 1.24], [12.65, 1.14, 1.31], [12.89, 1.57, 1.36]]}
        color="#c2b686"
        progressRef={progressRef}
        start={.419}
        end={.430}
      />
    </>
  );
}

export function updateExpansionBiomass(actors, p) {
  for (const { object } of actors) {
    const m = /^D_(?:biomass|fungal_clump)_(\d)(?:_|$)/.exec(object.name || '');
    if (!m) continue;
    const vessel = VESSELS[+m[1]];
    const t = p > 0.92 ? 1.0 : ease(vessel.start, vessel.end, p);
    // Keep legacy boxy GLB clumps hidden so realistic stellate mycelial suspension is clearly seen
    object.visible = false;
    object.scale.setScalar(.75 + .25 * t);
    object.userData.expansionVisibility = t;
  }
}
