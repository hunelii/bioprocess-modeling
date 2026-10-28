import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

// Art-directable biological proxies: all assets anchored to the existing Zone F trays.
// Realistic lateral spathulate / oyster-shell Pleurotus ostreatus fruiting bouquets with primordia-to-cap unfurling.
const X = [18.84, 19.60, 20.42, 21.13];
const Y = [0.53, -0.24, 0.53, -0.24];
const Z = [1.168, 1.978, 2.738];
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, p) => { const x = clamp((p - a) / (b - a)); return x * x * (3 - 2 * x); };
const capColors = ['#c7bbb0', '#d4c9bc', '#b8aba0', '#ddd3c7', '#c2b5a8'];

// True spathulate / kidney-fan Pleurotus ostreatus cap radiating from lateral stem attachment at (0,0,0)
function createOysterShellCapGeometry() {
  const segA = 36, segR = 14;
  const vertices = [], faces = [];
  // Rear attachment depression at (0, 0, 0)
  vertices.push(0, 0, 0.004);

  for (let j = 1; j <= segR; j++) {
    const u = j / segR; // 0..1 from lateral attachment out to margin
    const edgeRuffle = Math.pow(u, 2.2);
    for (let i = 0; i <= segA; i++) {
      const s = i / segA; // 0..1 across the fan arc
      // Fan angle spans -125 deg to +125 deg (-2.18 to +2.18 rad), sweeping forward toward -Y (camera side)
      const alpha = (s - 0.5) * 4.36;
      // Kidney/oyster shell reach: broadest in forward lobe, indented at lateral edges
      const lobeReach = 0.72 + 0.34 * Math.cos(alpha * 0.65) - 0.08 * Math.cos(alpha * 2.0) + 0.03 * Math.sin(alpha * 5.0);
      const r = u * lobeReach;

      // Forward direction is -Y, lateral spread is X
      const px = r * Math.sin(alpha * 0.72) * 0.92;
      const py = -r * (0.28 + 0.72 * Math.cos(alpha * 0.52));

      // Natural Pleurotus profile: depressed near stem base, rising into a smooth fleshy arch, then rolled margin
      const funnelBase = -0.012 * Math.exp(-u * 5.0);
      const arch = 0.044 * Math.sin(u * Math.PI * 0.84);
      const wave = 0.0065 * edgeRuffle * (Math.sin(alpha * 5.0 + 0.3) + 0.45 * Math.cos(alpha * 9.0));
      const rolledLip = -0.013 * Math.pow(u, 3.8);
      const pz = 0.004 + funnelBase + arch + wave + rolledLip;

      vertices.push(px, py, pz);
    }
  }

  const ringStride = segA + 1;
  for (let i = 0; i < segA; i++) {
    faces.push(0, 1 + i, 1 + i + 1);
  }
  for (let j = 0; j < segR - 1; j++) {
    const rowA = 1 + j * ringStride;
    const rowB = rowA + ringStride;
    for (let i = 0; i < segA; i++) {
      const a = rowA + i;
      const b = rowA + i + 1;
      const c = rowB + i;
      const d = rowB + i + 1;
      faces.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

// Decurrent radial lamellae (gills) flowing from the oyster cap margin down into the lateral stem
function createOysterGillsGeometry() {
  const pos = [], indices = [];
  const numGills = 28, steps = 8;

  for (let k = 0; k < numGills; k++) {
    const s = (k + 0.5) / numGills;
    const alpha = (s - 0.5) * 4.10;
    const lobeReach = 0.72 + 0.34 * Math.cos(alpha * 0.65) - 0.08 * Math.cos(alpha * 2.0);

    for (let j = 0; j <= steps; j++) {
      const u = 0.04 + (j / steps) * 0.91;
      const r = u * lobeReach;
      const px = r * Math.sin(alpha * 0.72) * 0.92;
      const py = -r * (0.28 + 0.72 * Math.cos(alpha * 0.52));

      const funnelBase = -0.012 * Math.exp(-u * 5.0);
      const arch = 0.042 * Math.sin(u * Math.PI * 0.84);
      const rolledLip = -0.011 * Math.pow(u, 3.8);
      const zTop = 0.002 + funnelBase + arch + rolledLip;
      // Gills are deepest in the middle-inner zone and taper cleanly at margin & decurrent stem
      const depth = 0.015 * Math.sin(u * Math.PI) + 0.009 * (1.0 - u);

      pos.push(px, py, zTop);
      pos.push(px + 0.0025 * Math.cos(alpha), py + 0.0025 * Math.sin(alpha), zTop - depth);
    }
  }

  for (let k = 0; k < numGills; k++) {
    const base = k * (steps + 1) * 2;
    for (let j = 0; j < steps; j++) {
      const a = base + j * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Fleshy curved lateral stem tapering at substrate base and flaring into the eccentric cap attachment
function createOysterStemGeometry(attachX, attachY, attachZ, baseRadius = 0.022) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(attachX * 0.15, attachY * 0.10, -0.015),
    new THREE.Vector3(attachX * 0.45, attachY * 0.42, attachZ * 0.36),
    new THREE.Vector3(attachX * 0.82, attachY * 0.78, attachZ * 0.74),
    new THREE.Vector3(attachX, attachY, attachZ + 0.004)
  ]);
  const geo = new THREE.TubeGeometry(curve, 12, baseRadius, 8, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = clamp((z + 0.015) / (attachZ + 0.02));
    // Flare trumpet-like into the decurrent underside of the cap
    const flare = 0.72 + 0.68 * Math.pow(t, 1.7);
    pos.setX(i, pos.getX(i) * flare);
    pos.setY(i, pos.getY(i) * flare);
  }
  geo.computeVertexNormals();
  return geo;
}

const baseCap = createOysterShellCapGeometry();
const baseGills = createOysterGillsGeometry();
const R_REF = 0.175;

// 6-Cap Overlapping Imbricate Oyster Mushroom Shelf Rosette per Cluster!
const SHELF_SPECS = [
  // 1. Dominant top-center oyster shell
  { pos: [0.01, -0.02, 0.215], rot: [0.10, 0.0, 0.04], scale: [R_REF * 1.32, R_REF * 1.28, 1.15], stemR: 0.023 },
  // 2. Upper-left overlapping fan
  { pos: [-0.055, -0.015, 0.172], rot: [0.14, -0.16, 0.52], scale: [R_REF * 1.08, R_REF * 1.05, 1.02], stemR: 0.020 },
  // 3. Upper-right overlapping fan
  { pos: [0.062, -0.01, 0.158], rot: [0.12, 0.18, -0.48], scale: [R_REF * 0.98, R_REF * 0.96, 0.96], stemR: 0.019 },
  // 4. Mid-front shelf cap
  { pos: [-0.015, -0.045, 0.122], rot: [0.22, -0.05, 0.15], scale: [R_REF * 0.86, R_REF * 0.84, 0.88], stemR: 0.017 },
  // 5. Lower-right lateral shelf cap
  { pos: [0.048, -0.035, 0.092], rot: [0.24, 0.14, -0.32], scale: [R_REF * 0.68, R_REF * 0.66, 0.78], stemR: 0.014 },
  // 6. Lower-left young shelf cap
  { pos: [-0.048, -0.032, 0.078], rot: [0.26, -0.12, 0.38], scale: [R_REF * 0.56, R_REF * 0.55, 0.70], stemR: 0.013 }
];

const bouquetCapGeo = mergeGeometriesFast(
  SHELF_SPECS.map(s => transformGeo(baseCap, s.pos, s.rot, s.scale))
);

const bouquetGillGeo = mergeGeometriesFast(
  SHELF_SPECS.map(s => transformGeo(baseGills, s.pos, s.rot, s.scale))
);

// Merge colonized mycelial cushion + 6 curved lateral stems + 4 basal primordia pinheads
const bouquetStemGeo = mergeGeometriesFast([
  transformGeo(new THREE.DodecahedronGeometry(0.085, 1), [0, -0.01, -0.008], [0, 0, 0], [1.25, 0.95, 0.45]),
  ...SHELF_SPECS.map(s => createOysterStemGeometry(s.pos[0], s.pos[1], s.pos[2], s.stemR)),
  // Young primordia pinheads around the base
  transformGeo(new THREE.CapsuleGeometry(0.011, 0.028, 4, 8), [0.025, -0.045, 0.022], [0.35, 0, -0.2]),
  transformGeo(new THREE.CapsuleGeometry(0.009, 0.022, 4, 8), [-0.032, -0.042, 0.018], [0.38, 0, 0.25]),
  transformGeo(new THREE.CapsuleGeometry(0.008, 0.018, 4, 8), [0.0, -0.052, 0.014], [0.42, 0, 0.05])
]);

const gillMaterial = new THREE.MeshStandardMaterial({
  color: '#ede3d4',
  emissive: '#291e14',
  emissiveIntensity: 0.10,
  roughness: 0.64,
  metalness: 0.02,
  side: THREE.DoubleSide
});

const stemMaterial = new THREE.MeshStandardMaterial({
  color: '#f4eee2',
  emissive: '#241b12',
  emissiveIntensity: 0.08,
  roughness: 0.68,
  metalness: 0.02
});

export function upgradeFactoryMaterials(world) {
  const sharedFloorMat = new THREE.MeshStandardMaterial({
    color: '#111d17',
    roughness: 0.48,
    metalness: 0.22,
    envMapIntensity: 0.55
  });
  const sharedPathMat = new THREE.MeshStandardMaterial({
    color: '#4f8c69',
    emissive: '#1d402c',
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.1
  });
  const sharedGlassMat = createFastGlassMaterial({
    color: '#d8eae0',
    opacity: 0.28,
    roughness: 0.08,
    envMapIntensity: 0.85
  });
  const sharedLiquidMat = new THREE.MeshStandardMaterial({
    color: '#c98a32',
    roughness: 0.28,
    metalness: 0.08,
    transparent: true,
    opacity: 0.72
  });
  const sharedDisplayMat = new THREE.MeshStandardMaterial({
    color: '#0c1f16',
    roughness: 0.35,
    metalness: 0.2
  });
  const sharedFrameMat = new THREE.MeshStandardMaterial({
    color: '#8d9993',
    roughness: 0.34,
    metalness: 0.72,
    envMapIntensity: 0.75
  });
  const sharedColumnMat = new THREE.MeshStandardMaterial({
    color: '#1c2822',
    roughness: 0.46,
    metalness: 0.62,
    envMapIntensity: 0.6
  });
  const sharedTrayMat = new THREE.MeshStandardMaterial({
    color: '#3d3326',
    roughness: 0.92,
    metalness: 0.04
  });

  world.traverse(object => {
    if (!object.isMesh) return;
    const name = object.name || '';
    if (name.startsWith('F_substrate_tray_')) {
      object.material = sharedTrayMat;
    } else if (name.startsWith('F_') && /(frame|support|rail|enclosure|post|roof)/i.test(name)) {
      object.material = sharedFrameMat;
    } else if (name.startsWith('G_') && /(body|tank|manifold|shell|steel|rim|skirt|motor|leg|outlet|sensor|pillar)/i.test(name)) {
      object.material = sharedFrameMat;
    } else if (/(floor|foundation|service_datum)/i.test(name)) {
      object.material = sharedFloorMat;
    } else if (/(column_|truss_cross|continuous_lintel|rear_structural)/i.test(name)) {
      object.material = sharedColumnMat;
    } else if (/(narrative_life_path|upstream_culture_branch|process_measurement_route|front_luminous_edge)/i.test(name)) {
      object.material = sharedPathMat;
    } else if (/(D_glass_vessel|E_culture_container|G_observation_porthole|A_cylindrical_observation_shell)/i.test(name)) {
      object.material = sharedGlassMat;
    } else if (name === 'G_observation_liquid') {
      object.material = sharedLiquidMat;
    } else if (name.startsWith('H_display_') && !name.includes('trim')) {
      object.material = sharedDisplayMat;
    } else if (name.startsWith('H_GRAPH_TRACE') || name.startsWith('H_illustrative_curve')) {
      object.material = new THREE.MeshBasicMaterial({
        color: name.includes('_0_') ? '#5fb883' : name.includes('_1_') ? '#cfa85b' : '#58abb0'
      });
    }
  });
}

export function DetailedOysterMushrooms({ progressRef }) {
  const rootGroupRef = useRef();
  const groups = useRef([]);
  const capRefs = useRef([]);
  const gillRefs = useRef([]);
  const items = useMemo(() => {
    const result = [];
    let idx = 0;
    for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(let pair=0;pair<2;pair++){
      const jitter = (Math.sin(idx * 13.71) * .5 + .5);
      result.push({
        row,
        col,
        pair,
        idx,
        x: X[col] + (pair === 0 ? -.085 : .09),
        y: Y[col] + (pair === 0 ? .055 : -.07),
        z: Z[row] - .055,
        rotZ: (pair === 0 ? -0.18 : 0.22) + (jitter - 0.5) * 0.35,
        radiusScale: (.155 + .048 * jitter) / R_REF
      });
      idx++;
    }
    return result;
  }, []);

  const capMaterials = useMemo(() => capColors.map(c => new THREE.MeshStandardMaterial({
    color: c,
    emissive: '#221912',
    emissiveIntensity: 0.08,
    roughness: 0.52,
    metalness: 0.03,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide
  })), []);

  useFrame(() => {
    const p = progressRef.current;
    const active = p >= .695;
    if (rootGroupRef.current) rootGroupRef.current.visible = active;
    if (!active) return;

    const showGills = p <= 0.81;

    items.forEach((item, i) => {
      const actor = groups.current[i];
      if (!actor) return;
      const stagger = .0017 * item.col + .002 * item.row + .0012 * item.pair;
      // Stage 1: Primordia emergence (.702 -> .730)
      const prim = p > 0.92 ? 1.0 : smooth(.702 + stagger, .730 + stagger, p);
      // Stage 2: Oyster-shell cap unfurling & lateral shelf expansion (.724 -> .772)
      const unfurl = p > 0.92 ? 1.0 : smooth(.724 + stagger, .772 + stagger, p);
      actor.visible = p >= .695;

      // Stems and primordia grow upward early, while caps unfurl outward horizontally
      const baseScale = (.06 + prim * .28 + unfurl * .66) * item.radiusScale;
      actor.scale.set(
        Math.max(.001, baseScale * (0.55 + 0.45 * unfurl)),
        Math.max(.001, baseScale * (0.55 + 0.45 * unfurl)),
        Math.max(.001, baseScale * (0.75 + 0.25 * prim))
      );

      // Caps unfurl after initial primordia pinning
      if (capRefs.current[i]) {
        const capExpand = Math.max(0.12, 0.15 * prim + 0.85 * Math.pow(unfurl, 0.85));
        capRefs.current[i].scale.set(capExpand, capExpand, 0.45 + 0.55 * unfurl);
      }
      if (gillRefs.current[i]) {
        gillRefs.current[i].visible = showGills && unfurl > 0.15;
        if (gillRefs.current[i].visible) {
          const capExpand = Math.max(0.12, 0.15 * prim + 0.85 * Math.pow(unfurl, 0.85));
          gillRefs.current[i].scale.set(capExpand, capExpand, 0.45 + 0.55 * unfurl);
        }
      }
    });
  });

  return (
    <group ref={rootGroupRef} name="HUNER_LOOKDEV_DETAILED_OYSTER_OVERLAY" visible={false}>
      {items.map((item, i) => {
        const matMain = capMaterials[item.idx % capMaterials.length];
        return (
          <group
            key={item.idx}
            ref={el => groups.current[i] = el}
            position={[item.x, item.y, item.z]}
            rotation={[0, 0, item.rotZ]}
          >
            {/* Colonized Mycelial Cushion, Primordia Pinheads & 6 Flared Lateral Stems */}
            <mesh geometry={bouquetStemGeo} material={stemMaterial} />
            {/* 6 Overlapping Spathulate Oyster-Shell Caps that Unfurl Outward */}
            <mesh ref={el => capRefs.current[i] = el} geometry={bouquetCapGeo} material={matMain} />
            {/* Decurrent Radial Gills with Automatic Distance LOD */}
            <mesh ref={el => gillRefs.current[i] = el} geometry={bouquetGillGeo} material={gillMaterial} />
          </group>
        );
      })}
    </group>
  );
}

export function LookdevLocalLights() {
  return (
    <>
      <pointLight position={[20.0, -2.4, 3.8]} color="#fff5e4" intensity={0.85} distance={11} decay={2} />
      <pointLight position={[25.0, -2.5, 4.2]} color="#ffeacc" intensity={0.75} distance={11} decay={2} />
    </>
  );
}
