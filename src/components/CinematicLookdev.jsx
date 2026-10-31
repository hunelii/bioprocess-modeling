import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { MUSHROOM_SPECIES, buildSpeciesGeometry, createSpeciesLabelAtlas } from '../data/mushroomSpecies.js';

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
  const segA = 18, segR = 8;
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
  const numGills = 14, steps = 4;

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

// Merge colonized mycelial cushion + 6 curved lateral stems + 6 decurrent radial gill sets + 3 basal primordia pinheads
// into a single geometry per cluster so each cluster takes only 2 draw calls instead of 3!
const bouquetStemGeo = mergeGeometriesFast([
  transformGeo(new THREE.DodecahedronGeometry(0.085, 1), [0, -0.01, -0.008], [0, 0, 0], [1.25, 0.95, 0.45]),
  ...SHELF_SPECS.map(s => createOysterStemGeometry(s.pos[0], s.pos[1], s.pos[2], s.stemR)),
  ...SHELF_SPECS.map(s => transformGeo(baseGills, s.pos, s.rot, s.scale)),
  // Young primordia pinheads around the base
  transformGeo(new THREE.CapsuleGeometry(0.011, 0.028, 3, 6), [0.025, -0.045, 0.022], [0.35, 0, -0.2]),
  transformGeo(new THREE.CapsuleGeometry(0.009, 0.022, 3, 6), [-0.032, -0.042, 0.018], [0.38, 0, 0.25]),
  transformGeo(new THREE.CapsuleGeometry(0.008, 0.018, 3, 6), [0.0, -0.052, 0.014], [0.42, 0, 0.05])
]);

const stemMaterial = new THREE.MeshStandardMaterial({
  color: '#f2ece0',
  emissive: '#261c13',
  emissiveIntensity: 0.09,
  roughness: 0.66,
  metalness: 0.02,
  side: THREE.DoubleSide
});

export function upgradeFactoryMaterials(world) {
  // THE LIVING BIOSPHERE / BİYO-MİMARİ TAPINAĞI (Neri Oxman & Zaha Hadid Visionary Architecture)
  // Replaces cold industrial steel with sculptural hyphal bone, pressed mycelium composite,
  // monolithic basalt stone, and living biological materials.

  // 1. Structural Columns, Trusses & Arches: Calcified Hyphal Bone / Sculptural Pressed Mycelium
  const sharedColumnMat = new THREE.MeshStandardMaterial({
    color: '#dfd7c8', // Warm pressed mycelium composite / plaster chalk
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.40
  });

  // 2. Equipment Frameworks & Enclosures: Dark Matte Biopolymer / Deep Fossil Composite
  const sharedFrameMat = new THREE.MeshStandardMaterial({
    color: '#243329', // Organic deep biophilic composite (replaces grey industrial steel)
    roughness: 0.74,
    metalness: 0.06,
    envMapIntensity: 0.45
  });

  // 3. Worktops: Monolithic Matte Basalt Stone / Dark Mineral Composite (museum-grade tactile stone)
  const sharedWorktopStoneMat = new THREE.MeshStandardMaterial({
    color: '#1e2821', // Monolithic dark stone worktop
    roughness: 0.65,
    metalness: 0.06,
    envMapIntensity: 0.60
  });

  // 4. Bench Plinths & Pedestals: Sculpted Rammed Earth / Compressed Mycelium Plinth Blocks
  const sharedBenchPlinthMat = new THREE.MeshStandardMaterial({
    color: '#cdc3af', // Warm rammed mycelium substrate block
    roughness: 0.84,
    metalness: 0.02,
    envMapIntensity: 0.45
  });

  // 5. Floor & Foundation: Rich Living Biological Humus / Earth Terrazzo Substrate
  const sharedFloorMat = new THREE.MeshStandardMaterial({
    color: '#131c15', // Deep living mossy humus floor
    roughness: 0.86,
    metalness: 0.03,
    envMapIntensity: 0.35
  });

  // 6. Narrative Life Path: Luminescent Bioluminescent Guide Ribbon
  const sharedPathMat = new THREE.MeshStandardMaterial({
    color: '#52c68c',
    emissive: '#165233',
    emissiveIntensity: 0.42,
    roughness: 0.42,
    metalness: 0.08
  });

  // 7. Borosilicate Glassware & Vessels
  const sharedGlassMat = createFastGlassMaterial({
    color: '#d6ede0',
    opacity: 0.30,
    roughness: 0.06,
    envMapIntensity: 0.88
  });

  // 8. Fermentation Vessel Shell: Translucent Borosilicate Heart Chamber
  const sharedHeartGlassMat = createFastGlassMaterial({
    color: '#e4eee0',
    opacity: 0.38,
    roughness: 0.10,
    envMapIntensity: 0.92
  });

  // 9. Cultivation Broth & Metabolic Fluids
  const sharedLiquidMat = new THREE.MeshStandardMaterial({
    color: '#df9834',
    emissive: '#663c0a',
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.06,
    transparent: true,
    opacity: 0.78
  });

  const sharedDisplayMat = new THREE.MeshStandardMaterial({
    color: '#0c1a13',
    roughness: 0.40,
    metalness: 0.15
  });

  const sharedTrayMat = new THREE.MeshStandardMaterial({
    color: '#2e261d',
    roughness: 0.94,
    metalness: 0.02
  });

  world.traverse(object => {
    if (!object.isMesh) return;
    const name = object.name || '';
    if (/^(B_worktop|C_counter|E_cabinet_top|H_console_top)$/.test(name)) {
      object.material = sharedWorktopStoneMat;
    } else if (/^(B_bench_plinth|C_sterile_bench|D_growth_plinth|H_console)$/.test(name)) {
      object.material = sharedBenchPlinthMat;
    } else if (name.startsWith('F_substrate_tray_')) {
      object.material = sharedTrayMat;
    } else if (name.startsWith('E_') && /(rack|post|door_frame|cabinet_bottom|sensor_panel)/i.test(name)) {
      object.material = sharedFrameMat;
    } else if (name === 'E_rear_wall') {
      object.material = sharedColumnMat;
    } else if (name.startsWith('F_') && /(frame|support|rail|enclosure|post|roof)/i.test(name)) {
      object.material = sharedFrameMat;
    } else if (name.startsWith('G_') && /(body|tank|shell)/i.test(name)) {
      object.material = sharedHeartGlassMat;
    } else if (name.startsWith('G_') && /(manifold|steel|rim|skirt|motor|leg|outlet|sensor|pillar)/i.test(name)) {
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
  const stemRefs = useRef([]);
  const lastP = useRef(-1);

  // 12 unique cultivated species mapped across 24 positions (2 positions per species: primary front-left & partner offset)
  const speciesData = useMemo(() => {
    return MUSHROOM_SPECIES.map((spec) => {
      const geos = buildSpeciesGeometry(spec.key);
      const mats = {};
      const mCfg = spec.mats;

      // Base substrate / block / bag / bottle
      mats.base = new THREE.MeshStandardMaterial({
        color: mCfg.base.color,
        emissive: mCfg.base.emissive || '#000000',
        emissiveIntensity: mCfg.base.emissiveIntensity || 0,
        roughness: mCfg.base.rough ?? 0.8,
        metalness: mCfg.base.metal ?? 0.05
      });

      if (geos.base2) {
        if (mCfg.base2?.glass) {
          mats.base2 = createFastGlassMaterial({
            color: mCfg.base2.color,
            opacity: mCfg.base2.opacity,
            roughness: 0.1
          });
        } else {
          mats.base2 = new THREE.MeshStandardMaterial({
            color: mCfg.base2?.color || '#333333',
            roughness: mCfg.base2?.rough ?? 0.9
          });
        }
      }

      if (geos.accent) {
        mats.accent = new THREE.MeshStandardMaterial({
          color: mCfg.accent?.color || '#ffffff',
          roughness: mCfg.accent?.rough ?? 0.8
        });
      }

      mats.stem = new THREE.MeshStandardMaterial({
        color: mCfg.stem.color,
        emissive: mCfg.stem.emissive || '#000000',
        emissiveIntensity: mCfg.stem.emissiveIntensity || 0,
        roughness: mCfg.stem.rough ?? 0.7,
        metalness: mCfg.stem.metal ?? 0.02,
        side: THREE.DoubleSide
      });

      mats.cap = new THREE.MeshStandardMaterial({
        color: mCfg.cap.color,
        emissive: mCfg.cap.emissive || '#000000',
        emissiveIntensity: mCfg.cap.emissiveIntensity || 0,
        roughness: mCfg.cap.rough ?? 0.5,
        metalness: mCfg.cap.metal ?? 0.04,
        side: THREE.DoubleSide
      });

      if (geos.detail) {
        mats.detail = new THREE.MeshStandardMaterial({
          color: mCfg.detail?.color || mCfg.cap.color,
          emissive: mCfg.detail?.emissive || '#000000',
          emissiveIntensity: mCfg.detail?.emissiveIntensity || 0,
          roughness: mCfg.detail?.rough ?? 0.6,
          metalness: mCfg.detail?.metal ?? 0.02,
          transparent: !!mCfg.detail?.opacity,
          opacity: mCfg.detail?.opacity ?? 1.0,
          side: THREE.DoubleSide
        });
      }

      return { spec, geos, mats };
    });
  }, []);

  // Scientific identification plant tag label atlas & geometries
  const labelData = useMemo(() => {
    const { texture, cols, rows } = createSpeciesLabelAtlas();
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const tagBaseMat = new THREE.MeshStandardMaterial({ color: '#55665c', metalness: 0.8, roughness: 0.3 });
    const tagStakeGeo = transformGeo(new THREE.CylinderGeometry(0.002, 0.002, 0.075, 6), [0, 0, 0.038], [Math.PI / 2, 0, 0]);

    // Build UV-mapped tag cards for each species index 0..11
    const tagCards = MUSHROOM_SPECIES.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const u0 = col / cols, u1 = (col + 1) / cols;
      const v1 = 1 - row / rows, v0 = 1 - (row + 1) / rows;
      const plane = new THREE.PlaneGeometry(0.082, 0.032);
      const uv = plane.attributes.uv;
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      uv.needsUpdate = true;
      // Position tag angled up toward camera
      return transformGeo(plane, [0, -0.095, 0.075], [-0.55, 0, 0]);
    });

    return { mat, tagBaseMat, tagStakeGeo, tagCards };
  }, []);

  const items = useMemo(() => {
    const result = [];
    let idx = 0;
    for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(let pair=0;pair<2;pair++){
      const specIdx = row * 4 + col;
      const isPair = pair === 1;
      const jitter = (Math.sin(idx * 13.71) * .5 + .5);
      result.push({
        row,
        col,
        pair,
        idx,
        specIdx,
        x: X[col] + (pair === 0 ? -.145 : .145),
        y: (pair === 0 ? -.16 : .08),
        z: Z[row] - .045,
        rotZ: (pair === 0 ? -0.12 : 0.16) + (jitter - 0.5) * 0.2,
        scale: (isPair ? 1.45 + jitter * 0.25 : 1.75 + jitter * 0.2)
      });
      idx++;
    }
    return result;
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const active = p >= .695;
    if (rootGroupRef.current) rootGroupRef.current.visible = active;
    if (!active) return;
    if (Math.abs(p - lastP.current) < 0.00002 || (p > 0.785 && lastP.current > 0.785)) return;
    lastP.current = p;

    items.forEach((item, i) => {
      const actor = groups.current[i];
      if (!actor) return;
      const spData = speciesData[item.specIdx];
      const animType = spData?.spec?.anim || 'shelf';
      const stagger = .0017 * item.col + .002 * item.row + .0012 * item.pair;

      // Biological 3-stage morphogenesis:
      // Stage 1: Primordia emergence & pinning (0.702 -> 0.730)
      const prim = p > 0.92 ? 1.0 : smooth(.702 + stagger, .730 + stagger, p);
      // Stage 2: Stipe elongation / stroma emergence (0.718 -> 0.752)
      const elongate = p > 0.92 ? 1.0 : smooth(.718 + stagger, .752 + stagger, p);
      // Stage 3: Cap expansion, margin unrolling & spine cascading (0.735 -> 0.774)
      const expand = p > 0.92 ? 1.0 : smooth(.735 + stagger, .774 + stagger, p);

      actor.visible = p >= .695;

      const stemMesh = stemRefs.current[i];
      const capMesh = capRefs.current[i];

      if (animType === 'shelf') {
        // Oyster, Reishi, Maitake: lateral shelves emerge, then caps unfurl outward horizontally
        if (stemMesh) {
          const sScale = Math.max(0.001, (0.08 + prim * 0.35 + elongate * 0.57));
          stemMesh.scale.set(sScale, sScale, sScale);
        }
        if (capMesh) {
          const capScaleXY = Math.max(0.001, (0.04 + prim * 0.12 + Math.pow(expand, 0.82) * 0.84));
          const capScaleZ = Math.max(0.001, (0.10 + prim * 0.25 + expand * 0.65));
          capMesh.scale.set(capScaleXY, capScaleXY, capScaleZ);
        }
      } else if (animType === 'elongate') {
        // Enoki, Shimeji, Cordyceps: tall slender stipes stretch up high before caps mature
        if (stemMesh) {
          const sRad = Math.max(0.001, (0.12 + prim * 0.32 + elongate * 0.56));
          const sHeight = Math.max(0.001, (0.04 + prim * 0.18 + Math.pow(elongate, 1.25) * 0.78));
          stemMesh.scale.set(sRad, sRad, sHeight);
        }
        if (capMesh) {
          const capRad = Math.max(0.001, (0.05 + prim * 0.15 + expand * 0.80));
          const capZ = Math.max(0.001, (0.04 + prim * 0.18 + Math.pow(elongate, 1.25) * 0.78));
          capMesh.scale.set(capRad, capRad, capZ);
        }
      } else if (animType === 'globe') {
        // Lion's Mane: central fleshy tubercle swells, then cascading icicle spines grow downward
        if (stemMesh) {
          const bScale = Math.max(0.001, (0.08 + prim * 0.42 + expand * 0.50));
          stemMesh.scale.set(bScale, bScale, bScale);
        }
        if (capMesh) {
          // Spines lengthen downward prominently during mature stage
          const spWidth = Math.max(0.001, (0.06 + prim * 0.30 + expand * 0.64));
          const spLen = Math.max(0.001, (0.02 + prim * 0.10 + Math.pow(expand, 1.4) * 0.88));
          capMesh.scale.set(spWidth, spWidth, spLen);
        }
      } else {
        // Umbrella (Shiitake, Golden Oyster, Button, Nameko): central stipe raises, then convex cap flattens
        if (stemMesh) {
          const sRad = Math.max(0.001, (0.10 + prim * 0.35 + elongate * 0.55));
          const sZ = Math.max(0.001, (0.05 + prim * 0.25 + elongate * 0.70));
          stemMesh.scale.set(sRad, sRad, sZ);
        }
        if (capMesh) {
          const cRad = Math.max(0.001, (0.05 + prim * 0.15 + Math.pow(expand, 0.85) * 0.80));
          const cZ = Math.max(0.001, (0.08 + prim * 0.32 + expand * 0.60));
          capMesh.scale.set(cRad, cRad, cZ);
        }
      }
    });
  });

  return (
    <group ref={rootGroupRef} name="HUNER_LOOKDEV_DETAILED_OYSTER_OVERLAY" visible={false}>
      {items.map((item, i) => {
        const { geos, mats } = speciesData[item.specIdx];
        const isPrimary = item.pair === 0;

        return (
          <group
            key={item.idx}
            ref={el => groups.current[i] = el}
            position={[item.x, item.y, item.z]}
            rotation={[0, 0, item.rotZ]}
            scale={[item.scale, item.scale, item.scale]}
          >
            {/* 1. Base Substrate Vessel (Sawdust Block, Autoclaved Bag, PP Bottle or Brown-Rice Jar) */}
            {geos.base && <mesh geometry={geos.base} material={mats.base} />}
            {geos.base2 && <mesh geometry={geos.base2} material={mats.base2} />}
            {geos.accent && <mesh geometry={geos.accent} material={mats.accent} />}

            {/* 2. Scientific Species Botanical Plant Tag Marker (Displayed on front/primary position) */}
            {isPrimary && (
              <group position={[0, 0, 0]}>
                <mesh geometry={labelData.tagStakeGeo} material={labelData.tagBaseMat} />
                <mesh geometry={labelData.tagCards[item.specIdx]} material={labelData.mat} />
              </group>
            )}

            {/* 3. Emerging Morphological Fruiting Bodies (Anchored to Growth Pivot) */}
            <group position={geos.pivot}>
              {/* Dynamic Stipe / Stems / Tubercle Body */}
              {geos.stem && (
                <mesh
                  ref={el => stemRefs.current[i] = el}
                  geometry={geos.stem}
                  material={mats.stem}
                />
              )}

              {/* Dynamic Pileus Caps / Spines / Stromata */}
              {geos.cap && (
                <mesh
                  ref={el => capRefs.current[i] = el}
                  geometry={geos.cap}
                  material={mats.cap}
                />
              )}

              {/* Fine Anatomical Details: Gills, Veil Remnants, Mucilage & Pores */}
              {geos.detail && (
                <mesh
                  geometry={geos.detail}
                  material={mats.detail}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}

export function LookdevLocalLights() {
  return null;
}
