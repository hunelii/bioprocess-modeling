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
 * Exact basidiospore deformation equation preserving asymmetry, apiculus hilum bump & chitin microrelief
 */
export function deformSporeVertex(x, y, z, scaleRadius = 1.0) {
  const sx = x * scaleRadius, sy = y * scaleRadius, sz = z * scaleRadius;
  const taper = 1.0 + 0.12 * sz - 0.06 * sz * sz;
  const dorsalCurve = 0.045 * (1.0 - sz * sz);
  const apiculusMask = Math.exp(-18.0 * ((sx + 0.35) * (sx + 0.35) + sy * sy + (sz + 0.88) * (sz + 0.88)));
  const macroCell = 0.022 * Math.sin(14.0 * sx + 4.0 * sz) * Math.cos(13.0 * sy - 3.0 * sx)
                  + 0.014 * Math.cos(23.0 * sz + 17.0 * sx) * Math.sin(19.0 * sy + 7.0 * sz);
  const microRelief = 0.0065 * Math.sin(43.0 * sx + 29.0 * sy) * Math.cos(37.0 * sz - 19.0 * sx);
  const disp = macroCell + microRelief + 0.055 * apiculusMask;
  const nx = (sx * taper + dorsalCurve) * (1.0 + disp);
  const ny = sy * (0.94 + 0.06 * sz) * (1.0 + disp);
  const nz = sz * (1.0 + 0.85 * disp) - 0.035 * apiculusMask;
  return [nx, ny, nz];
}

/**
 * Creates hemisphere with exact basidiospore deformation
 * isFront = false -> Back Cup (y >= 0, theta: 0 -> PI/2)
 * isFront = true  -> Front Cap (y <= 0, theta: PI/2 -> PI)
 */
export function createDeformedSporeHemisphere(isFront, segW = 48, segH = 28) {
  const thetaStart = isFront ? Math.PI / 2 : 0;
  const thetaLength = Math.PI / 2;
  const geo = new THREE.SphereGeometry(1, segW, segH, 0, Math.PI * 2, thetaStart, thetaLength);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [nx, ny, nz] = deformSporeVertex(x, y, z);
    pos.setXYZ(i, nx, ny, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * FungalCellAnatomy: The inner cellular organelle world of Huner Biofoundry,
 * integrated seamlessly inside the Bioprocess 3D basidiospore cutaway.
 */
export default function FungalCellAnatomy({ progressRef, opening: staticOpening }) {
  const relief = useMemo(() => createReliefTexture(512), []);
  const light1Ref = useRef();
  const light2Ref = useRef();

  useFrame(() => {
    const p = progressRef ? clamp01(progressRef.current) : 0;
    const t = beat(p);
    const opening = staticOpening !== undefined ? staticOpening : smooth(0.32, 0.67, t);
    const intensity = Math.max(0.08, opening);
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
      wall: createMat(0x6c8056, 0.72, 0.025),
      wallEdge: createMat(0xb8bc8b, 0.65, 0.016),
      membrane: createMat(0x607548, 0.50, 0.009, 0.18),
      cytoplasm: createMat(0x354c2b, 0.78, 0.015),
      ribosome: createMat(0xb0b68d, 0.65, 0.006),
      nucleus: createMat(0xa87b48, 0.62, 0.015, 0.15),
      nuclearEdge: createMat(0xd2b481, 0.53, 0.009),
      chromatin: createMat(0x74502d, 0.56, 0.005),
      vacuole: new THREE.MeshPhysicalMaterial({
        color: 0xb7c59d,
        roughness: 0.22,
        metalness: 0.04,
        bumpMap: relief,
        bumpScale: 0.006,
        clearcoat: 0.65,
        clearcoatRoughness: 0.15,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      }),
      mitoOuter: createMat(0x9eae76, 0.58, 0.012),
      mitoInner: createMat(0x57693d, 0.68, 0.013),
      cristae: createMat(0xc0c893, 0.50, 0.008, 0.15)
    };
  }, [relief]);

  // 1. Cut Wall Laminations & Membrane Rings
  const rimBatched = useMemo(() => {
    // 9 layered fibrous lamination tubes
    const wallTubes = [];
    const wallEdgeTubes = [];
    for (let layer = 0; layer < 9; layer++) {
      const pts = [];
      const count = 96;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const [rx, _, rz] = deformSporeVertex(-Math.cos(a), 0, Math.sin(a), 0.945 + layer * 0.005);
        const wrinkle = Math.sin(a * 28.0 + layer * 0.5) * 0.002;
        const yOffset = 0.004 + Math.sin((layer / 8) * Math.PI) * 0.014 + wrinkle;
        pts.push(new THREE.Vector3(rx, yOffset, rz));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.0055, 6, true);
      if (layer % 3 === 0) wallEdgeTubes.push(tube);
      else wallTubes.push(tube);
    }

    // Membrane rim tubes
    const memTubes = [];
    for (const depth of [-0.002, 0.016]) {
      const pts = [];
      const count = 80;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const [rx, _, rz] = deformSporeVertex(-Math.cos(a), 0, Math.sin(a), 0.93);
        pts.push(new THREE.Vector3(rx, depth, rz));
      }
      memTubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.005, 6, true));
    }

    // Cytoplasm inner cavity backing
    const cytoGeo = createDeformedSporeHemisphere(false, 36, 20);
    const pos = cytoGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * 0.92, pos.getY(i) * 0.90 + 0.008, pos.getZ(i) * 0.92);
    }
    cytoGeo.computeVertexNormals();

    return {
      wallTubesGeo: mergeGeometriesFast(wallTubes),
      wallEdgeTubesGeo: mergeGeometriesFast(wallEdgeTubes),
      memTubesGeo: mergeGeometriesFast(memTubes),
      cytoGeo
    };
  }, []);

  // 2. Phospholipid Bilayer Instances (1200 lipid heads along the cut rim)
  const lipidMesh = useMemo(() => {
    const count = 1200;
    const geo = new THREE.IcosahedronGeometry(0.0045, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.wallEdge, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const row = i < 600 ? 0 : 1;
      const a = (i / 600) * Math.PI * 2;
      const radiusScale = row === 0 ? 0.932 : 0.916;
      const [rx, _, rz] = deformSporeVertex(-Math.cos(a), 0, Math.sin(a), radiusScale);
      dummy.position.set(rx, 0.015, rz);
      dummy.scale.set(1.0, 1.35, 1.0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [materials.wallEdge]);

  // 3. Nucleus & Nucleolus (Çekirdek & Çekirdekçik)
  const nucleusData = useMemo(() => {
    const center = [0.12, 0.22, 0.14];
    const openingAngle = 0.85;

    // Cutaway nuclear envelope
    const envelopeGeo = transformGeo(
      new THREE.SphereGeometry(0.24, 36, 28, 0, Math.PI * 2, openingAngle, Math.PI - openingAngle),
      center
    );

    // Nuclear cut rim
    const rimGeo = transformGeo(
      new THREE.TorusGeometry(0.24 * Math.sin(openingAngle), 0.004, 8, 36),
      [center[0], center[1] + 0.24 * Math.cos(openingAngle), center[2]],
      [Math.PI / 2, 0, 0]
    );

    // Inner chromatin core
    const chromatinGeo = transformGeo(
      new THREE.SphereGeometry(0.21, 32, 24),
      center
    );

    // Dense nucleolus body
    const nucleolusGeo = transformGeo(
      new THREE.SphereGeometry(0.065, 20, 16),
      [center[0] + 0.04, center[1] + 0.06, center[2] + 0.05],
      [0, 0, 0],
      [1.1, 0.9, 0.95]
    );

    // 18 chromatin DNA filament tubes
    const dnaTubes = [];
    for (let j = 0; j < 18; j++) {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const t = i / 39, a = t * Math.PI * 2;
        const x = center[0] + 0.03 + Math.sin(a * 2.0 + j * 2.1) * 0.12;
        const z = center[2] - 0.02 + Math.cos(a * 3.0 + j * 0.91) * 0.12;
        const distSq = (x - center[0]) ** 2 + (z - center[2]) ** 2;
        const y = center[1] + Math.sqrt(Math.max(0.004, 0.20 ** 2 - distSq)) * 0.85 + j * 0.0006;
        pts.push(new THREE.Vector3(x, y, z));
      }
      dnaTubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0028, 5, false));
    }

    // 60 nuclear pore toruses
    const poreList = [];
    const poreProto = new THREE.TorusGeometry(0.009, 0.0024, 6, 12);
    for (let i = 0; i < 60; i++) {
      const yNorm = 1 - ((i + 0.5) / 60) * 2;
      const a = i * 2.39996;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const n = new THREE.Vector3(Math.cos(a) * rad, yNorm, Math.sin(a) * rad);
      if (n.y > Math.cos(openingAngle) * 0.8) continue;
      const p = n.clone().multiplyScalar(0.242).add(new THREE.Vector3(...center));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const euler = new THREE.Euler().setFromQuaternion(q);
      poreList.push(transformGeo(poreProto, [p.x, p.y, p.z], [euler.x, euler.y, euler.z]));
    }

    return {
      envelopeGeo,
      rimGeo,
      chromatinGeo,
      nucleolusGeo,
      dnaGeo: mergeGeometriesFast(dnaTubes),
      poresGeo: mergeGeometriesFast(poreList)
    };
  }, []);

  // 4. Mitochondria (4 Adet Kıvrımlı İç Krista Çıkıntılarına Sahip Mitokondri)
  const mitoData = useMemo(() => {
    const mitoConfigs = [
      { pos: [-0.40, 0.22, -0.26], rot: [0.15, 0.45, -0.3], scale: 0.88 },
      { pos: [0.36, 0.24, -0.30], rot: [-0.1, -0.35, 0.2], scale: 0.82 },
      { pos: [-0.34, 0.26, 0.38], rot: [0.2, -0.4, 0.15], scale: 0.92 },
      { pos: [0.42, 0.20, 0.32], rot: [-0.15, 0.5, -0.25], scale: 0.78 }
    ];

    const outerList = [];
    const innerList = [];
    const cristaeList = [];

    for (const { pos, rot, scale } of mitoConfigs) {
      // Outer envelope cut shell
      const outerProto = new THREE.SphereGeometry(1, 28, 20, Math.PI, Math.PI);
      const outerScaled = transformGeo(outerProto, pos, rot, [0.18 * scale, 0.09 * scale, 0.08 * scale]);
      outerList.push(outerScaled);

      // Inner matrix
      const innerProto = new THREE.SphereGeometry(1, 24, 16, Math.PI, Math.PI);
      const innerScaled = transformGeo(innerProto, [pos[0], pos[1] + 0.005, pos[2]], rot, [0.165 * scale, 0.075 * scale, 0.065 * scale]);
      innerList.push(innerScaled);

      // 6 sinusoidal folded inner cristae ridges per mitochondrion
      for (let j = -3; j <= 2; j++) {
        const len = Math.sqrt(Math.max(0.01, 1 - (j / 3.8) ** 2)) * 0.055 * scale;
        const pts = [];
        for (let i = 0; i < 18; i++) {
          const t = i / 17;
          pts.push(new THREE.Vector3(
            j * 0.026 * scale + Math.sin(t * Math.PI * 2) * 0.012 * scale,
            0.004 + Math.sin(t * Math.PI) * 0.015 * scale,
            -len + t * len * 2
          ));
        }
        const tubeProto = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0045 * scale, 5, false);
        cristaeList.push(transformGeo(tubeProto, pos, rot));
      }
    }

    return {
      outerGeo: mergeGeometriesFast(outerList),
      innerGeo: mergeGeometriesFast(innerList),
      cristaeGeo: mergeGeometriesFast(cristaeList)
    };
  }, []);

  // 5. Vacuole (Sıvı Vakuol Kesesi) & Surface Vesicles
  const vacuoleData = useMemo(() => {
    const center = [-0.22, 0.20, -0.12];
    const scale = [0.26, 0.28, 0.21];
    const vacGeo = transformGeo(new THREE.SphereGeometry(1, 32, 24), center, [0, 0, 0], scale);

    // Surface vesicles
    const vList = [];
    const vProto = new THREE.SphereGeometry(1, 10, 8);
    let seed = 4921;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 55; i++) {
      const a = i * 2.39996;
      const yNorm = 1 - ((i + 0.5) / 55) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (yNorm < -0.2) continue; // Face towards the cutaway opening
      const r = 0.007 + rand() * 0.008;
      vList.push(transformGeo(
        vProto,
        [center[0] + x * scale[0] * 1.02, center[1] + yNorm * scale[1] * 1.02, center[2] + z * scale[2] * 1.02],
        [0, 0, 0],
        [r, r, r * 0.6]
      ));
    }

    return {
      vacGeo,
      vesiclesGeo: mergeGeometriesFast(vList)
    };
  }, []);

  // 6. Endoplasmic Reticulum (ER) sheets & Ribosome Granules
  const erData = useMemo(() => {
    const erGranules = [];
    const sheets = [];
    for (let layer = 0; layer < 5; layer++) {
      const vertices = [], uv = [], indices = [];
      for (let i = 0; i <= 48; i++) {
        for (let j = 0; j <= 6; j++) {
          const a = -0.3 + (i / 48) * Math.PI * 1.35;
          const r = 0.27 + layer * 0.026 + (j / 6) * 0.020;
          const x = 0.12 + Math.cos(a) * r;
          const z = 0.14 + Math.sin(a) * r * 0.88;
          const y = 0.16 + Math.sin(a * 8.0 + layer * 0.65) * 0.018 + Math.sin((j / 6) * Math.PI) * 0.012;
          vertices.push(x, y, z);
          uv.push(i / 48, j / 6);
          if (i < 48 && j < 6) {
            const n = i * 7 + j;
            indices.push(n, n + 7, n + 1, n + 1, n + 7, n + 8);
          }
          if (i % 3 === 0 && j % 2 === 0) {
            erGranules.push({ pos: [x, y + 0.005, z], scale: 0.0035 });
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

    // Stacked Golgi cisternae tubes
    const golgiList = [];
    for (let j = 0; j < 5; j++) {
      const pts = [];
      for (let i = 0; i < 30; i++) {
        const t = i / 29;
        const a = 0.2 + t * Math.PI * 0.85;
        pts.push(new THREE.Vector3(
          0.22 + Math.cos(a) * (0.14 - j * 0.008),
          0.18 + Math.sin(t * Math.PI) * 0.010,
          -0.15 + Math.sin(a) * (0.09 - j * 0.006) - j * 0.018
        ));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.008, 5, false);
      golgiList.push(tube);
    }

    return {
      erSheetsGeo: mergeGeometriesFast(sheets),
      erGranules,
      golgiGeo: mergeGeometriesFast(golgiList)
    };
  }, []);

  // 7. Instanced ER Ribosome Granules
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

  // 8. Dense Cytoplasmic Ribosome Granules (~1600 particles filling the cell cavity)
  const cytoplasmRibosomeMesh = useMemo(() => {
    const count = 1600;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geo, materials.ribosome, count);
    const dummy = new THREE.Object3D();
    let seed = 3892;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };

    let added = 0;
    for (let attempt = 0; attempt < 8000 && added < count; attempt++) {
      const x = (rand() - 0.5) * 1.6;
      const z = (rand() - 0.5) * 1.6;
      const y = 0.04 + rand() * 0.55;

      // Ensure inside spore boundary
      const [edgeX, _, edgeZ] = deformSporeVertex(
        x / Math.sqrt(x * x + z * z || 1),
        0,
        z / Math.sqrt(x * x + z * z || 1),
        0.88
      );
      const dCenter = Math.sqrt(x * x + z * z);
      const dEdge = Math.sqrt(edgeX * edgeX + edgeZ * edgeZ);
      if (dCenter > dEdge * 0.88) continue;

      // Avoid dense nucleus interior
      const dNuc = Math.hypot(x - 0.12, y - 0.22, z - 0.14);
      if (dNuc < 0.22) continue;

      // Avoid vacuole interior
      const dVac = Math.hypot(x + 0.22, y - 0.20, z + 0.12);
      if (dVac < 0.24) continue;

      const r = 0.0035 + Math.pow(rand(), 2) * 0.005;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      mesh.setMatrixAt(added++, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [materials.ribosome]);

  const groupRef = useRef();

  return (
    <group ref={groupRef} name="FUNGAL_CELL_ORGANELLES">
      {/* Local biological illumination illuminating the exposed organelles */}
      <pointLight ref={light1Ref} position={[0.1, -0.25, 0.1]} intensity={0.2} color="#effee8" distance={2.2} decay={2} />
      <pointLight ref={light2Ref} position={[-0.3, 0.1, -0.2]} intensity={0.1} color="#f7ecd0" distance={1.8} decay={2} />

      {/* 1. Cytoplasm Backing & Wall Rim */}
      <mesh geometry={rimBatched.cytoGeo} material={materials.cytoplasm} />
      <mesh geometry={rimBatched.wallTubesGeo} material={materials.wall} />
      <mesh geometry={rimBatched.wallEdgeTubesGeo} material={materials.wallEdge} />
      <mesh geometry={rimBatched.memTubesGeo} material={materials.membrane} />
      <primitive object={lipidMesh} />

      {/* 2. Nucleus & Nucleolus */}
      <mesh geometry={nucleusData.envelopeGeo} material={materials.nucleus} />
      <mesh geometry={nucleusData.rimGeo} material={materials.nuclearEdge} />
      <mesh geometry={nucleusData.chromatinGeo} material={materials.chromatin} />
      <mesh geometry={nucleusData.nucleolusGeo} material={materials.nuclearEdge} />
      <mesh geometry={nucleusData.dnaGeo} material={materials.nucleus} />
      <mesh geometry={nucleusData.poresGeo} material={materials.nuclearEdge} />

      {/* 3. Mitochondria with Folded Cristae */}
      <mesh geometry={mitoData.outerGeo} material={materials.mitoOuter} />
      <mesh geometry={mitoData.innerGeo} material={materials.mitoInner} />
      <mesh geometry={mitoData.cristaeGeo} material={materials.cristae} />

      {/* 4. Vacuole & Vesicles */}
      <mesh geometry={vacuoleData.vacGeo} material={materials.vacuole} />
      <mesh geometry={vacuoleData.vesiclesGeo} material={materials.membrane} />

      {/* 5. Endoplasmic Reticulum & Golgi */}
      <mesh geometry={erData.erSheetsGeo} material={materials.membrane} />
      <mesh geometry={erData.golgiGeo} material={materials.membrane} />
      <primitive object={erRibosomeMesh} />

      {/* 6. Cytoplasmic Ribosomes */}
      <primitive object={cytoplasmRibosomeMesh} />
    </group>
  );
}
