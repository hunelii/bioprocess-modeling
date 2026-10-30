import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

// Anchored to the original B_Petri_1 (x=4.40, y=-.15, z~1.29), no GLB edit.
// Realistic radial rhizomorphic & cottony mycelium colony growth + tapered 3D aerial hyphae.
export const PETRI_CENTER = [4.4, -.15, 1.285];
export const PETRI_WINDOW = [.11, .21];
export const smooth = (a, b, p) => {
  const t = Math.max(0, Math.min(1, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const myceliumVertexShader = `
  varying vec2 vLocal;
  varying vec3 vNormal;
  void main() {
    vLocal = position.xy;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Procedural biological shader for radial rhizomorphic fungal mycelium on agar
export const myceliumFragmentShader = `
  uniform float uGrowth;
  uniform float uSeed;
  varying vec2 vLocal;
  varying vec3 vNormal;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    if (uGrowth <= 0.005) discard;
    float r = length(vLocal);
    if (r > 1.0) discard;
    float theta = atan(vLocal.y, vLocal.x) + uSeed;

    // Natural lobate / irregular colony margin
    float lobe = 0.86
      + 0.07 * sin(theta * 5.0 + uSeed)
      + 0.04 * cos(theta * 11.0 - r * 4.0)
      + 0.03 * sin(theta * 19.0 + uSeed * 2.0);
    float maxR = uGrowth * lobe;
    if (r > maxR) discard;

    // Normalized radial position within current colony radius (0 at center, 1 at leading hyphal tips)
    float nr = r / max(0.001, maxR);

    // Multi-order bifurcating rhizomorphic cords (branch frequency increases with radius)
    float warp1 = 0.18 * sin(r * 16.0 + theta * 4.0) + 0.09 * cos(r * 28.0 - theta * 7.0);
    float cord1 = pow(abs(cos((theta + warp1) * 18.0)), 1.6);
    float warp2 = 0.12 * cos(r * 34.0 - theta * 9.0);
    float cord2 = pow(abs(sin((theta + warp2) * 42.0 + r * 14.0)), 2.2);
    float cord3 = pow(abs(cos((theta - warp1 * 0.6) * 86.0 - r * 26.0)), 3.0);

    // Combine primary cords (inner-mid) + secondary bifurcations (mid-outer) + fine leading tips (outer)
    float veins = cord1 * (1.0 - nr * 0.35)
                + cord2 * smoothstep(0.12, 0.45, nr) * 0.85
                + cord3 * smoothstep(0.35, 0.85, nr) * 0.75;

    // Cottony aerial mycelium cushion near central inoculum core
    float cottonCore = exp(-r * 6.5 / max(0.25, uGrowth));
    // Soft concentric circadian growth zones seen in real Petri cultures
    float ringZone = 0.88 + 0.12 * sin(r * 42.0);
    // Feathery leading-edge fade where individual hyphal tips penetrate fresh agar
    float edgeFeather = 1.0 - smoothstep(0.72, 1.0, nr);
    float tipExtension = smoothstep(0.55, 0.95, veins) * (1.0 - smoothstep(0.88, 1.0, nr));

    float density = clamp((cottonCore * 0.95 + veins * 0.72 * edgeFeather + tipExtension * 0.65) * ringZone, 0.0, 1.0);
    if (density < 0.03) discard;

    vec3 subAgarTint = vec3(0.82, 0.87, 0.79);
    vec3 silkyHyphae = vec3(0.96, 0.95, 0.90);
    vec3 denseCotton = vec3(0.99, 0.98, 0.95);

    vec3 col = mix(subAgarTint, silkyHyphae, smoothstep(0.1, 0.6, density));
    col = mix(col, denseCotton, smoothstep(0.6, 0.95, density));

    gl_FragColor = vec4(col, density * 0.94);
  }
`;

// Builds fine 3D tapered rhizomorphic filaments that radiate from (0,0,0) so they can scale smoothly with growth
export function buildTapered3DRhizomorphs(maxRadius = 0.038, count = 48, seed = 44015) {
  const geos = [];
  let s = seed;
  const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };

  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.09;
    const len = maxRadius * (0.68 + 0.30 * rand());
    const pts = [];
    const steps = 10;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const curl = 0.08 * Math.sin(t * 6.5 + i * 0.7) + 0.04 * Math.cos(t * 11.0 - i);
      const r = len * t;
      pts.push(new THREE.Vector3(
        Math.cos(baseAngle + curl) * r,
        Math.sin(baseAngle + curl) * r,
        0.00045 * (1.0 - t * 0.85) + 0.00015 * Math.sin(t * Math.PI)
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 10, 0.00024, 4, false);
    // Taper radius along the filament from root to tip so it looks like a biological hypha, not a pipe
    const pos = tube.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k), vy = pos.getY(k), vz = pos.getZ(k);
      const radialDist = Math.min(1, Math.hypot(vx, vy) / len);
      const taper = 1.0 - 0.75 * Math.pow(radialDist, 1.4);
      pos.setZ(k, vz * taper);
    }
    geos.push(tube);

    // Secondary Y-fork bifurcation near mid-radius
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const forkT = 0.40 + 0.22 * rand();
        const origin = curve.getPointAt(forkT);
        const subAngle = baseAngle + side * (0.32 + 0.22 * rand());
        const subLen = len * (1.0 - forkT) * 0.78;
        const subPts = [];
        for (let m = 0; m <= 6; m++) {
          const st = m / 6;
          const scurl = side * 0.10 * st * st;
          subPts.push(new THREE.Vector3(
            origin.x + Math.cos(subAngle + scurl) * subLen * st,
            origin.y + Math.sin(subAngle + scurl) * subLen * st,
            origin.z * (1.0 - st * 0.7)
          ));
        }
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(subPts), 6, 0.00014, 3, false));
      }
    }
  }
  return mergeGeometriesFast(geos);
}

export function applyPetriMaterials(world) {
  const source = { agar: [], glass: [], bottom: [], hyphae: [], inoculum: [] };
  const sharedAgarMat = new THREE.MeshStandardMaterial({
    color: '#b8cbb2',
    metalness: 0.04,
    roughness: 0.26,
    envMapIntensity: 0.65,
    side: THREE.DoubleSide
  });
  const sharedGlassMat = createFastGlassMaterial({
    color: '#dcebe2',
    opacity: 0.34,
    roughness: 0.08,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide
  });
  const sharedBottomMat = new THREE.MeshStandardMaterial({
    color: '#aec2b5',
    metalness: 0.08,
    roughness: 0.28,
    envMapIntensity: 0.6,
    transparent: true,
    opacity: 0.65,
    depthWrite: false
  });
  const sharedInoculumMat = new THREE.MeshStandardMaterial({
    color: '#f5f2e6',
    roughness: 0.75,
    metalness: 0.0
  });
  const sharedHyphaMat = new THREE.MeshStandardMaterial({
    color: '#f7f5ec',
    roughness: 0.65,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  world.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const name = mesh.name || '';
    if (name === 'B_Petri_1_agar' || name === 'B_Petri_0_agar' || name === 'B_Petri_2_agar' || name === 'C_Petri_0_agar' || name === 'C_Petri_1_agar') {
      mesh.material = sharedAgarMat;
      source.agar.push(mesh);
    } else if (name.startsWith('B_Petri_') && name.includes('_rim_') || name.startsWith('C_Petri_') && name.includes('_ring_')) {
      mesh.material = sharedGlassMat;
      source.glass.push(mesh);
    } else if (name.startsWith('B_Petri_') && name.endsWith('_bottom')) {
      mesh.material = sharedBottomMat;
      source.bottom.push(mesh);
    } else if (name === 'B_germinating_inoculum') {
      mesh.material = sharedInoculumMat;
      // The GLB mesh B_germinating_inoculum has baked vertices centered at [4.40, -0.14, 1.294],
      // which is 0.010m off-center in +Y and 0.005m above the agar surface [4.40, -0.15, 1.2885].
      // Shift it to the exact mathematical center of B_Petri_1 [4.40, -0.15, 1.2892]:
      mesh.position.set(0, -0.010, -0.0048);
      mesh.updateMatrix();
      source.inoculum.push(mesh);
    } else if (name.startsWith('B_GERMINATION_')) {
      mesh.material = sharedHyphaMat;
      // Hide legacy blocky cylinder sticks from GLB; replaced by continuous radial rhizomorphic mycelium
      mesh.visible = false;
      source.hyphae.push(mesh);
    }
  });
  return source;
}

export function PetriLight({ progressRef }) {
  const colonyGroupRef = useRef();
  const rhizomorphMeshRef = useRef();
  const guttaMeshRef = useRef();
  const lastP = useRef(-1);

  const colonyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uGrowth: { value: 0 },
      uSeed: { value: 1.42 }
    },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const rhizomorphGeo = useMemo(() => buildTapered3DRhizomorphs(0.038, 36, 44015), []);
  const rhizomorphMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f8f6ed',
    roughness: 0.72,
    metalness: 0.0
  }), []);

  // Golden-amber secondary metabolite exudate droplets (Gutta) forming on mature aerial mycelium
  const guttaGeo = useMemo(() => {
    const drops = [];
    const dropSphere = new THREE.SphereGeometry(0.00085, 8, 6);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.22;
      const r = 0.0045 + (i % 4) * 0.0032;
      const s = 0.65 + (i % 3) * 0.25;
      drops.push(transformGeo(dropSphere, [Math.cos(a) * r, Math.sin(a) * r, 0.00065], [0, 0, 0], [s, s, s * 0.78]));
    }
    return mergeGeometriesFast(drops);
  }, []);

  const guttaMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e89b2d',
    emissive: '#8c4f08',
    emissiveIntensity: 0.32,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88
  }), []);

  const glassRimMat = useMemo(() => createFastGlassMaterial({
    color: '#dceee4', opacity: 0.36, roughness: 0.08, envMapIntensity: 0.9, side: THREE.DoubleSide
  }), []);

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const batchedDish = useMemo(() => {
    const [cx, cy, cz] = PETRI_CENTER;
    const glassList = [
      // Main Petri dish glass wall & top lip torus
      transformGeo(new THREE.CylinderGeometry(0.0465, 0.046, 0.014, 32, 1, true), [cx, cy, cz + 0.005], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0462, 0.0012, 6, 32), [cx, cy, cz + 0.012]),
      // Stretched Parafilm M sealing band around the Petri dish perimeter
      transformGeo(new THREE.CylinderGeometry(0.0474, 0.0474, 0.0048, 32, 1, true), [cx, cy, cz + 0.0065], [Math.PI / 2, 0, 0])
    ];
    // Micro-condensation droplets inside the glass rim perimeter
    const condDrop = new THREE.OctahedronGeometry(0.0008, 0);
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + 0.15;
      const cr = 0.036 + (i % 3) * 0.003;
      glassList.push(transformGeo(condDrop, [cx + Math.cos(ang) * cr, cy + Math.sin(ang) * cr, cz + 0.0115], [0, 0, ang], [1.2, 1.2, 0.4]));
    }

    // Stack of 3 Spare Sterile Petri Dishes on the benchtop at [4.18, -0.27, 1.258]
    const sx = 4.18, sy = -0.27, szBase = 1.258;
    for (let k = 0; k < 3; k++) {
      const sz = szBase + k * 0.0135;
      glassList.push(transformGeo(new THREE.CylinderGeometry(0.044, 0.044, 0.012, 24), [sx, sy, sz + 0.006], [Math.PI / 2, 0, 0]));
      glassList.push(transformGeo(new THREE.TorusGeometry(0.044, 0.001, 6, 24), [sx, sy, sz + 0.012]));
    }

    // Borosilicate L-Shaped Drigalski Cell Spreader (Cam Yayma Çubuğu) resting on a stainless holder at [4.59, -0.24, 1.264]
    const spreaderCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.56, -0.32, 1.268),
      new THREE.Vector3(4.58, -0.23, 1.268),
      new THREE.Vector3(4.585, -0.215, 1.262),
      new THREE.Vector3(4.625, -0.215, 1.262)
    ]);
    glassList.push(new THREE.TubeGeometry(spreaderCurve, 14, 0.0022, 6, false));

    const steelList = [
      // Main Petri dish stainless warming pedestal
      transformGeo(new THREE.CylinderGeometry(0.058, 0.064, 0.016, 24), [cx, cy, cz - 0.018], [Math.PI / 2, 0, 0]),
      // Sample ID tag plate on rim ("HNR-01")
      transformGeo(new THREE.BoxGeometry(0.018, 0.006, 0.0018), [cx - 0.042, cy - 0.022, cz + 0.008], [0, 0, 0.48]),
      // Spare Petri stack tray base & Drigalski spreader rest rack
      transformGeo(new THREE.CylinderGeometry(0.048, 0.050, 0.004, 24), [sx, sy, szBase - 0.002], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.BoxGeometry(0.032, 0.010, 0.010), [4.57, -0.26, 1.258])
    ];

    return {
      glassGeo: mergeGeometriesFast(glassList),
      steelGeo: mergeGeometriesFast(steelList)
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    // Continuous radial colony expansion from p=0.138 to p=0.208
    const growth = p > 0.92 ? 1.0 : smooth(0.138, 0.208, p);
    const vis = growth > 0.008 && (p <= 0.32 || p > 0.90);
    if (colonyGroupRef.current) colonyGroupRef.current.visible = vis;
    if (!vis) return;
    if (Math.abs(p - lastP.current) < 0.00002) return;
    lastP.current = p;

    colonyMat.uniforms.uGrowth.value = growth;
    if (rhizomorphMeshRef.current) {
      const s = Math.max(0.02, growth);
      rhizomorphMeshRef.current.scale.set(s, s, 0.4 + 0.6 * s);
    }
    if (guttaMeshRef.current) {
      const guttaAppear = smooth(0.42, 0.92, growth);
      guttaMeshRef.current.visible = guttaAppear > 0.02;
      if (guttaMeshRef.current.visible) {
        guttaMeshRef.current.scale.setScalar(guttaAppear);
      }
    }
  });

  return (
    <>
      <mesh geometry={batchedDish.glassGeo} material={glassRimMat} />
      <mesh geometry={batchedDish.steelGeo} material={steelMat} />

      {/* Realistic Radial Rhizomorphic Mycelium Colony centered at [4.40, -0.15, 1.2890] on B_Petri_1 */}
      <group ref={colonyGroupRef} position={[4.40, -0.15, 1.2890]} visible={false}>
        <mesh scale={[0.041, 0.041, 1]} material={colonyMat}>
          <circleGeometry args={[1, 32]} />
        </mesh>
        <mesh ref={rhizomorphMeshRef} geometry={rhizomorphGeo} material={rhizomorphMat} />
        <mesh ref={guttaMeshRef} geometry={guttaGeo} material={guttaMat} visible={false} />
      </group>
    </>
  );
}
