import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp01 } from '../data/camera.js';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';

const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const beat = (p) => clamp01(p / 0.11);

/**
 * Procedural relief bump texture matching Huner Biofoundry's FungalCell.ts
 * Generates organic micro-folds and cellular grains without external image dependencies.
 */
export function createReliefTexture(size = 512) {
  const data = new Uint8Array(size * size);
  let seed = 2718;
  const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const folds = Math.sin(u * 23 + Math.sin(v * 13) * 2) * Math.sin(v * 29 + Math.sin(u * 11));
      const grains = Math.sin(u * 117 + Math.cos(v * 83)) * Math.cos(v * 97 + Math.sin(u * 109));
      data[y * size + x] = Math.round(128 + folds * 35 + grains * 24 + (rand() - 0.5) * 22);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Exact outer fungal shell geometry matching Huner Biofoundry's FungalCell.ts
 * Horizontal elliptical proportions: X = 1.62, Y = 1.08, Z = 0.76 with organic micro-ripple
 */
export function createHunerFungalShell(isFront, segW = 64, segH = 48) {
  const phiStart = isFront ? 0 : Math.PI;
  const phiLength = Math.PI;
  const geo = new THREE.SphereGeometry(1, segW, segH, phiStart, phiLength);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ripple = 1.0 + 0.012 * Math.sin(x * 19.0 + y * 13.0) * Math.sin(y * 17.0 + z * 9.0);
    // Subtle anatomical basidiospore hilar appendix / apiculus projection at the pole
    let apicX = 0.0, apicY = 0.0;
    if (x < -0.80) {
      const d = (x - (-1.0)) * (x - (-1.0)) + y * y + z * z;
      const f = Math.exp(-d * 14.0) * 0.055;
      apicX = -f * 1.5;
      apicY = -f * 0.45;
    }
    pos.setXYZ(i, (x * ripple + apicX) * 1.62, (y * ripple + apicY) * 1.08, z * ripple * 0.76);
  }
  geo.computeVertexNormals();
  return geo;
}

export const createDeformedSporeHemisphere = createHunerFungalShell;
export function deformSporeVertex(x, y, z) {
  const ripple = 1.0 + 0.012 * Math.sin(x * 19.0 + y * 13.0) * Math.sin(y * 17.0 + z * 9.0);
  return [x * ripple * 1.62, y * ripple * 1.08, z * ripple * 0.76];
}

/**
 * FungalCellAnatomy: The inner cellular organelle world of Huner Biofoundry,
 * integrated seamlessly inside the Bioprocess 3D basidiospore cutaway.
 */
export default function FungalCellAnatomy({ progressRef, handoffRef }) {
  const relief = useMemo(() => createReliefTexture(512), []);
  const light1Ref = useRef();
  const light2Ref = useRef();

  useFrame(() => {
    const p = progressRef ? clamp01(progressRef.current) : 0;
    const t = beat(p);
    const handoff = handoffRef ? clamp01(handoffRef.current ?? 1) : 1;
    const inCoda = p > 0.92;
    const opening = inCoda ? 0.0 : (handoff < 0.60 ? 0.0 : smooth(0.12, 0.52, t));
    const intensity = Math.max(0.40, opening);
    if (light1Ref.current) light1Ref.current.intensity = 2.4 * intensity;
    if (light2Ref.current) light2Ref.current.intensity = 1.2 * intensity;
  });

  // Biological material definitions from living-foundry/FungalCell.ts
  const materials = useMemo(() => {
    const createMat = (color, roughness = 0.58, bumpScale = 0.01, clearcoat = 0.08) => new THREE.MeshPhysicalMaterial({
      color,
      roughness,
      metalness: 0.02,
      bumpMap: relief,
      bumpScale,
      clearcoat,
      clearcoatRoughness: 0.36,
      side: THREE.DoubleSide
    });

    return {
      wallMelanin: createMat(0x657850, 0.74, 0.025),
      betaGlucan: createMat(0x8ea06a, 0.65, 0.016),
      chitinFibrils: createMat(0xc2c99a, 0.52, 0.012, 0.18),
      ergosterolMembrane: createMat(0x4a6540, 0.48, 0.009, 0.20),
      cytoplasm: createMat(0x2d4023, 0.80, 0.015),
      nucleus: createMat(0xa27542, 0.60, 0.014, 0.16),
      nuclearEdge: createMat(0xd4b47c, 0.52, 0.009),
      chromatin: createMat(0x6f4b28, 0.58, 0.006),
      spb: createMat(0x38552c, 0.42, 0.008, 0.25),
      vacuole: new THREE.MeshPhysicalMaterial({
        color: 0xb0c296,
        roughness: 0.28,
        metalness: 0.03,
        bumpMap: relief,
        bumpScale: 0.008,
        clearcoat: 0.52,
        clearcoatRoughness: 0.2,
        transparent: true,
        opacity: 0.90,
        side: THREE.DoubleSide
      }),
      polyphosphate: createMat(0x72a562, 0.22, 0.005, 0.82),
      mitoOuter: createMat(0x94a66e, 0.56, 0.012),
      mitoInner: createMat(0x526639, 0.68, 0.013),
      cristae: createMat(0xb8c48a, 0.48, 0.008, 0.18),
      chitosome: createMat(0xe0dd75, 0.32, 0.005, 0.55),
      secretoryVesicle: createMat(0xa6c672, 0.42, 0.007, 0.38),
      lipidDroplet: createMat(0xdca038, 0.22, 0.006, 0.78),
      ribosome: createMat(0xb2b88e, 0.65, 0.006)
    };
  }, [relief]);

  // 1. Cut Wall Stratified Laminations & Membrane Rings
  const rimBatched = useMemo(() => {
    const wallTubes = [];
    const glucanTubes = [];
    const chitinTubes = [];

    // 9 layered fibrous lamination tubes in horizontal XY plane
    for (let layer = 0; layer < 9; layer++) {
      const pts = [];
      const count = 96;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const wrinkle = Math.sin(a * 31.0 + layer * 0.5) * 0.003;
        pts.push(new THREE.Vector3(
          Math.cos(a) * (1.50 + layer * 0.014 + wrinkle),
          Math.sin(a) * (0.972 + layer * 0.012 + wrinkle),
          0.018 + Math.sin((layer / 8.0) * Math.PI) * 0.024
        ));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.008, 6, true);
      if (layer >= 6) wallTubes.push(tube);
      else if (layer >= 3) glucanTubes.push(tube);
      else chitinTubes.push(tube);
    }

    // Membrane rim tubes
    const memTubes = [];
    for (const depth of [-0.002, 0.023]) {
      const pts = [];
      const count = 80;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * 1.482, Math.sin(a) * 0.958, depth));
      }
      memTubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.008, 6, true));
    }

    // Cytoplasm inner cavity backing shell
    const cytoGeo = new THREE.SphereGeometry(1, 48, 36, Math.PI, Math.PI);
    const pos = cytoGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * 1.49, pos.getY(i) * 0.97, pos.getZ(i) * 0.65);
    }
    cytoGeo.computeVertexNormals();

    return {
      wallTubesGeo: mergeGeometriesFast(wallTubes),
      glucanTubesGeo: mergeGeometriesFast(glucanTubes),
      chitinTubesGeo: mergeGeometriesFast(chitinTubes),
      memTubesGeo: mergeGeometriesFast(memTubes),
      cytoGeo
    };
  }, []);

  // 2. Phospholipid Bilayer Instances (1200 lipid heads along the cut rim)
  const lipidMesh = useMemo(() => {
    const count = 1200;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.chitinFibrils, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const row = i < 600 ? 0 : 1;
      const a = (i / 600) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * (1.472 - row * 0.016), Math.sin(a) * (0.947 - row * 0.011), 0.03);
      dummy.scale.set(0.005, 0.005, 0.007);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [materials.chitinFibrils]);

  // 3. Nucleus, Spindle Pole Body (SPB) & Nucleolus
  const nucleusData = useMemo(() => {
    const center = [-0.55, 0.21, 0.06];
    const opening = 0.85;
    const openingAxis = new THREE.Vector3(0.45, -0.08, 1).normalize();

    // Cutaway nuclear envelope
    const envelopeGeo = transformGeo(
      new THREE.SphereGeometry(0.365, 36, 28, 0, Math.PI * 2, opening, Math.PI - opening),
      center
    );

    // Nuclear cut rim
    const rimGeo = transformGeo(
      new THREE.TorusGeometry(0.365 * Math.sin(opening), 0.0045, 8, 36),
      [
        center[0] + openingAxis.x * 0.365 * Math.cos(opening),
        center[1] + openingAxis.y * 0.365 * Math.cos(opening),
        center[2] + openingAxis.z * 0.365 * Math.cos(opening)
      ]
    );

    // Inner chromatin core
    const chromatinGeo = transformGeo(new THREE.SphereGeometry(0.333, 32, 24), center);

    // Dense nucleolus body
    const nucleolusGeo = transformGeo(
      new THREE.SphereGeometry(1, 20, 16),
      [center[0] + 0.065, center[1] - 0.05, center[2] + 0.29],
      [0, 0, 0],
      [0.09, 0.085, 0.07]
    );

    // 18 chromatin DNA filament tubes
    const dnaTubes = [];
    for (let j = 0; j < 18; j++) {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const t = i / 39, a = t * Math.PI * 2;
        const x = center[0] + 0.05 + Math.sin(a * 2.0 + j * 2.1) * 0.19;
        const y = center[1] - 0.025 + Math.cos(a * 3.0 + j * 0.91) * 0.19;
        const distSq = (x - center[0]) ** 2 + (y - center[1]) ** 2;
        const z = center[2] + Math.sqrt(Math.max(0.008, 0.32 ** 2 - distSq)) + 0.006 + j * 0.0004;
        pts.push(new THREE.Vector3(x, y, z));
      }
      dnaTubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0035, 5, false));
    }

    // 60 nuclear pore toruses
    const poreList = [];
    const poreProto = new THREE.TorusGeometry(0.012, 0.003, 6, 12);
    for (let i = 0; i < 60; i++) {
      const yNorm = 1 - ((i + 0.5) / 60) * 2;
      const a = i * 2.39996;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const n = new THREE.Vector3(Math.cos(a) * rad, yNorm, Math.sin(a) * rad);
      if (n.dot(openingAxis) > Math.cos(opening)) continue;
      const p = n.clone().multiplyScalar(0.367).add(new THREE.Vector3(...center));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const euler = new THREE.Euler().setFromQuaternion(q);
      poreList.push(transformGeo(poreProto, [p.x, p.y, p.z], [euler.x, euler.y, euler.z]));
    }

    // Spindle Pole Body (SPB) Plaque and astral microtubule demetleri
    const spbPos = [center[0] - 0.18, center[1] + 0.26, center[2] + 0.18];
    const spbPlaque = transformGeo(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), spbPos, [Math.PI / 2, 0, 0]);
    const spbTubes = [];
    for (let m = 0; m < 5; m++) {
      const a = (m / 5) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(...spbPos),
        new THREE.Vector3(spbPos[0] + Math.cos(a) * 0.06, spbPos[1] + Math.sin(a) * 0.06, spbPos[2] + 0.03),
        new THREE.Vector3(spbPos[0] + Math.cos(a) * 0.12, spbPos[1] + Math.sin(a) * 0.12, spbPos[2] + 0.07)
      ];
      spbTubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0022, 4, false));
    }

    return {
      envelopeGeo,
      rimGeo,
      chromatinGeo,
      nucleolusGeo,
      dnaGeo: mergeGeometriesFast(dnaTubes),
      poresGeo: mergeGeometriesFast(poreList),
      spbPlaque,
      spbTubesGeo: mergeGeometriesFast(spbTubes)
    };
  }, []);

  // 4. Spitzenkörper & Chitosomes (Apikal Büyüme ve Duvar Sentez Merkezi)
  const spitzenkorperData = useMemo(() => {
    const apexCenter = [1.15, 0.52, 0.08];
    const tracks = [];
    for (let k = 0; k < 3; k++) {
      const trackPoints = [
        new THREE.Vector3(0.45 + k * 0.08, 0.12 - k * 0.05, -0.02),
        new THREE.Vector3(0.78 + k * 0.06, 0.28 + k * 0.02, 0.02),
        new THREE.Vector3(1.05 + k * 0.03, 0.45 + k * 0.02, 0.06),
        new THREE.Vector3(...apexCenter)
      ];
      tracks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trackPoints), 16, 0.003, 4, false));
    }

    let seed = 9283;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    const chitosomes = [];
    for (let i = 0; i < 60; i++) {
      const r = Math.pow(rand(), 0.6) * 0.045;
      const th = rand() * Math.PI * 2, ph = (rand() - 0.5) * Math.PI;
      chitosomes.push({
        pos: [
          apexCenter[0] + r * Math.cos(th) * Math.cos(ph),
          apexCenter[1] + r * Math.sin(th) * Math.cos(ph) * 0.9,
          apexCenter[2] + r * Math.sin(ph) * 0.7
        ],
        scale: 0.0045
      });
    }

    const secretoryMantle = [];
    for (let i = 0; i < 80; i++) {
      const r = 0.04 + Math.pow(rand(), 0.7) * 0.065;
      const th = rand() * Math.PI * 2, ph = (rand() - 0.5) * Math.PI;
      secretoryMantle.push({
        pos: [
          apexCenter[0] + r * Math.cos(th) * Math.cos(ph),
          apexCenter[1] + r * Math.sin(th) * Math.cos(ph) * 0.9,
          apexCenter[2] + r * Math.sin(ph) * 0.7
        ],
        scale: 0.0075
      });
    }

    return {
      tracksGeo: mergeGeometriesFast(tracks),
      chitosomes,
      secretoryMantle
    };
  }, []);

  // 5. Mitochondria (4 Adet Kıvrımlı İç Krista Çıkıntılarına Sahip Mitokondri)
  const mitoData = useMemo(() => {
    const configs = [
      { pos: [-1.0, -0.38, 0.10], rot: [0, 0, -0.45], scale: 1.0 },
      { pos: [0.15, 0.66, 0.10], rot: [0, 0, 0.35], scale: 0.9 },
      { pos: [-0.03, -0.68, 0.10], rot: [0, 0, -0.3], scale: 1.05 },
      { pos: [1.08, 0.35, 0.10], rot: [0, 0, 0.8], scale: 0.85 }
    ];

    const outerList = [];
    const innerList = [];
    const cristaeList = [];

    for (const { pos, rot, scale } of configs) {
      const outerProto = new THREE.SphereGeometry(1, 28, 20, Math.PI, Math.PI);
      outerList.push(transformGeo(outerProto, pos, rot, [0.235 * scale, 0.115 * scale, 0.10 * scale]));

      const innerProto = new THREE.SphereGeometry(1, 24, 16, Math.PI, Math.PI);
      innerList.push(transformGeo(innerProto, [pos[0], pos[1], pos[2] + 0.008], rot, [0.216 * scale, 0.094 * scale, 0.075 * scale]));

      for (let j = -3; j <= 3; j++) {
        const len = Math.sqrt(Math.max(0.01, 1 - (j / 4.3) ** 2)) * 0.08 * scale;
        const pts = [];
        for (let i = 0; i < 20; i++) {
          const t = i / 19;
          pts.push(new THREE.Vector3(
            j * 0.049 * scale + Math.sin(t * Math.PI * 2) * 0.018 * scale,
            -len + t * len * 2,
            0.005 + Math.sin(t * Math.PI) * 0.023 * scale
          ));
        }
        cristaeList.push(transformGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.007 * scale, 5, false), pos, rot));
      }
    }

    return {
      outerGeo: mergeGeometriesFast(outerList),
      innerGeo: mergeGeometriesFast(innerList),
      cristaeGeo: mergeGeometriesFast(cristaeList)
    };
  }, []);

  // 6. Vacuole & Polyphosphate Granules
  const vacuoleData = useMemo(() => {
    const center = [0.55, -0.1, -0.07];
    const scale = [0.48, 0.53, 0.30];
    const vacGeo = transformGeo(new THREE.SphereGeometry(1, 32, 24), center, [0, 0, 0], scale);

    const vList = [];
    const vProto = new THREE.SphereGeometry(1, 10, 8);
    let seed = 4921;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 65; i++) {
      const a = i * 2.39996;
      const yNorm = 1 - ((i + 0.5) / 65) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (z < 0.2) continue;
      const r = 0.006 + rand() * 0.009;
      vList.push(transformGeo(
        vProto,
        [center[0] + x * scale[0], center[1] + yNorm * scale[1], center[2] + z * scale[2]],
        [0, 0, 0],
        [r, r, r * 0.35]
      ));
    }

    const polyphosphates = [];
    for (let i = 0; i < 24; i++) {
      const u = rand() * Math.PI * 2, v = (rand() - 0.5) * Math.PI;
      const r = Math.pow(rand(), 0.5) * 0.7;
      const radius = 0.018 + rand() * 0.022;
      polyphosphates.push({
        pos: [
          center[0] + Math.cos(u) * Math.cos(v) * 0.35 * r,
          center[1] + Math.sin(u) * Math.cos(v) * 0.38 * r,
          center[2] + Math.sin(v) * 0.20 * r
        ],
        scale: radius
      });
    }

    return {
      vacGeo,
      vesiclesGeo: mergeGeometriesFast(vList),
      polyphosphates
    };
  }, []);

  // 7. Endoplasmic Reticulum (ER), Golgi Cisternae & Lipids
  const erData = useMemo(() => {
    const erGranules = [];
    const sheets = [];
    for (let layer = 0; layer < 6; layer++) {
      const vertices = [], uv = [], indices = [];
      for (let i = 0; i <= 60; i++) {
        for (let j = 0; j <= 6; j++) {
          const a = -0.2 + (i / 60) * Math.PI * 1.45;
          const r = 0.415 + layer * 0.041 + (j / 6) * 0.028;
          const x = -0.55 + Math.cos(a) * r;
          const y = 0.21 + Math.sin(a) * r * 0.9;
          const z = -0.045 + Math.sin(a * 9.0 + layer * 0.65) * 0.024 + Math.sin((j / 6) * Math.PI) * 0.016;
          vertices.push(x, y, z);
          uv.push(i / 60, j / 6);
          if (i < 60 && j < 6) {
            const n = i * 7 + j;
            indices.push(n, n + 7, n + 1, n + 1, n + 7, n + 8);
          }
          if (i % 3 === 0 && j % 3 === 0) {
            erGranules.push({ pos: [x, y, z + 0.008], scale: 0.005 });
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      sheets.push(geo);
    }

    // Stacked Golgi cisternae tubes at [0.25, -0.55, 0.02]
    const golgiList = [];
    for (let j = 0; j < 6; j++) {
      const pts = [];
      for (let i = 0; i < 36; i++) {
        const t = i / 35, a = 0.22 + t * Math.PI * 0.83;
        pts.push(new THREE.Vector3(
          0.25 + Math.cos(a) * (0.19 - j * 0.011),
          -0.55 + Math.sin(a) * (0.12 - j * 0.008) - j * 0.027,
          0.02 + Math.sin(t * Math.PI) * 0.012
        ));
      }
      const cisterna = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.014, 5, false);
      const pos = cisterna.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        pos.setZ(k, pos.getZ(k) * 0.5);
      }
      cisterna.computeVertexNormals();
      golgiList.push(cisterna);
    }

    // Neutral lipid droplets
    let seed = 5129;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    const lipidDroplets = [];
    for (let i = 0; i < 34; i++) {
      const x = (rand() - 0.5) * 2.5, y = (rand() - 0.5) * 1.6;
      if ((x / 1.35) ** 2 + (y / 0.85) ** 2 > 1 || ((x + 0.55) / 0.42) ** 2 + ((y - 0.21) / 0.42) ** 2 < 1 || ((x - 0.55) / 0.53) ** 2 + ((y + 0.1) / 0.59) ** 2 < 1) continue;
      const r = 0.015 + Math.pow(rand(), 2) * 0.022;
      lipidDroplets.push({ pos: [x, y, -0.02 + rand() * 0.05], scale: r });
    }

    return {
      erSheetsGeo: mergeGeometriesFast(sheets),
      erGranules,
      golgiGeo: mergeGeometriesFast(golgiList),
      lipidDroplets
    };
  }, []);

  // Instanced Meshes for Ribosomes, Chitosomes, Polyphosphates & Lipids
  const erRibosomeMesh = useMemo(() => {
    const count = erData.erGranules.length;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.ribosome, count);
    const dummy = new THREE.Object3D();
    erData.erGranules.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [erData, materials.ribosome]);

  const chitosomeMesh = useMemo(() => {
    const count = spitzenkorperData.chitosomes.length;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.chitosome, count);
    const dummy = new THREE.Object3D();
    spitzenkorperData.chitosomes.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [spitzenkorperData, materials.chitosome]);

  const secretoryMesh = useMemo(() => {
    const count = spitzenkorperData.secretoryMantle.length;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.secretoryVesicle, count);
    const dummy = new THREE.Object3D();
    spitzenkorperData.secretoryMantle.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [spitzenkorperData, materials.secretoryVesicle]);

  const polyphosphateMesh = useMemo(() => {
    const count = vacuoleData.polyphosphates.length;
    const geo = new THREE.SphereGeometry(1, 12, 10);
    const mesh = new THREE.InstancedMesh(geo, materials.polyphosphate, count);
    const dummy = new THREE.Object3D();
    vacuoleData.polyphosphates.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [vacuoleData, materials.polyphosphate]);

  const lipidDropletMesh = useMemo(() => {
    const count = erData.lipidDroplets.length;
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const mesh = new THREE.InstancedMesh(geo, materials.lipidDroplet, count);
    const dummy = new THREE.Object3D();
    erData.lipidDroplets.forEach((item, i) => {
      dummy.position.set(...item.pos);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [erData, materials.lipidDroplet]);

  const cytoplasmRibosomeMesh = useMemo(() => {
    const count = 1500;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.ribosome, count);
    const dummy = new THREE.Object3D();
    let seed = 3892;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };

    let added = 0;
    for (let attempt = 0; attempt < 8000 && added < count; attempt++) {
      const x = (rand() - 0.5) * 2.8;
      const y = (rand() - 0.5) * 1.75;
      if ((x / 1.40) ** 2 + (y / 0.88) ** 2 > 1 || ((x + 0.55) / 0.40) ** 2 + ((y - 0.21) / 0.40) ** 2 < 1 || ((x - 0.55) / 0.51) ** 2 + ((y + 0.1) / 0.57) ** 2 < 1) continue;
      const r = 0.003 + Math.pow(rand(), 3) * 0.009;
      dummy.position.set(x, y, -0.03 + rand() * 0.04);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      mesh.setMatrixAt(added++, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [materials.ribosome]);

  return (
    <group name="FUNGAL_CELL_ORGANELLES">
      <pointLight ref={light1Ref} position={[0.2, 0.4, 0.5]} intensity={0.2} color="#effee8" distance={3.2} decay={2} />
      <pointLight ref={light2Ref} position={[-0.4, -0.3, 0.4]} intensity={0.1} color="#f7ecd0" distance={2.8} decay={2} />

      {/* 1. Cytoplasm Backing & Cut Wall Stratified Laminations */}
      <mesh geometry={rimBatched.cytoGeo} material={materials.cytoplasm} />
      <mesh geometry={rimBatched.wallTubesGeo} material={materials.wallMelanin} />
      <mesh geometry={rimBatched.glucanTubesGeo} material={materials.betaGlucan} />
      <mesh geometry={rimBatched.chitinTubesGeo} material={materials.chitinFibrils} />
      <mesh geometry={rimBatched.memTubesGeo} material={materials.ergosterolMembrane} />
      <primitive object={lipidMesh} />

      {/* 2. Nucleus, Spindle Pole Body (SPB) & Nucleolus */}
      <mesh geometry={nucleusData.envelopeGeo} material={materials.nucleus} />
      <mesh geometry={nucleusData.rimGeo} material={materials.nuclearEdge} />
      <mesh geometry={nucleusData.chromatinGeo} material={materials.chromatin} />
      <mesh geometry={nucleusData.nucleolusGeo} material={materials.nuclearEdge} />
      <mesh geometry={nucleusData.dnaGeo} material={materials.nucleus} />
      <mesh geometry={nucleusData.poresGeo} material={materials.nuclearEdge} />
      <mesh geometry={nucleusData.spbPlaque} material={materials.spb} />
      <mesh geometry={nucleusData.spbTubesGeo} material={materials.betaGlucan} />

      {/* 3. Spitzenkörper & Chitosomes */}
      <mesh geometry={spitzenkorperData.tracksGeo} material={materials.ergosterolMembrane} />
      <primitive object={chitosomeMesh} />
      <primitive object={secretoryMesh} />

      {/* 4. Mitochondria with Folded Cristae */}
      <mesh geometry={mitoData.outerGeo} material={materials.mitoOuter} />
      <mesh geometry={mitoData.innerGeo} material={materials.mitoInner} />
      <mesh geometry={mitoData.cristaeGeo} material={materials.cristae} />

      {/* 5. Vacuole & Polyphosphate Granules */}
      <mesh geometry={vacuoleData.vacGeo} material={materials.vacuole} />
      <mesh geometry={vacuoleData.vesiclesGeo} material={materials.ergosterolMembrane} />
      <primitive object={polyphosphateMesh} />

      {/* 6. Endoplasmic Reticulum, Golgi & Lipids */}
      <mesh geometry={erData.erSheetsGeo} material={materials.ergosterolMembrane} />
      <mesh geometry={erData.golgiGeo} material={materials.ergosterolMembrane} />
      <primitive object={erRibosomeMesh} />
      <primitive object={lipidDropletMesh} />

      {/* 7. Cytoplasmic Ribosomes & Glycogen Rosettes */}
      <primitive object={cytoplasmRibosomeMesh} />
    </group>
  );
}
