import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';

/**
 * THE LIVING BIOSPHERE / BİYO-MİMARİ TAPINAĞI
 * (Neri Oxman & Zaha Hadid Visionary Architecture for Huner Living Biofoundry)
 * 
 * 1. LivingBiosphereCanopyAndVaults:
 *    - Akışkan kemiksi/hifsel sütunlar & tonozlar (organik katener yaylar & hifsel kaburgalar)
 *    - Enclosing pressed mycelium composite back wall & parabolic canopy vault (warm bio-cathedral envelope)
 *    - Şeffaf vasküler (damarsal) kıvrımlı biyo-tüpler (besin sıvısı ve sporların dolaştığı yaşayan damarlar)
 * 
 * 2. BiologicalMicroLandscape:
 *    - Biyolojik Mikro-Peyzaj / Terrarium Yatağı (Zone B & C, tezgah yüzeyine oturan zengin mikrokosmos)
 *    - Verimli organik toprak tabakası, kadife yosun öbekleri, kavisli borosilikat cam bordür, mikrobiyal peyzaj
 * 
 * 3. SuspendedDropletReactors:
 *    - Askıda Damla Reaktörleri / Levite Kapsüller (Zone D & E, havada asılı biyolojik damla reaktörleri)
 * 
 * 4. OrganicHeartReactor:
 *    - Organik Kalp Reaktörü (Zone G, aortik damarlar, spiral pericardial mycelium bağları, atan biyo-metabolik çekirdek)
 */

export function LivingBiosphereCanopyAndVaults() {
  const myceliumVaultMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd7c8', // Warm pressed mycelium composite / plaster chalk
    roughness: 0.88,
    metalness: 0.02
  }), []);

  const hyphalRibMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cdc3af', // Calcified sculptural hyphal bone / organic structural ribs
    roughness: 0.82,
    metalness: 0.04
  }), []);

  const vascularGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#c2f0dc',
    opacity: 0.32,
    roughness: 0.06,
    metalness: 0.08,
    side: THREE.DoubleSide
  }), []);

  const nutrientFluidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#df9634',
    emissive: '#844c10',
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.05,
    transparent: true,
    opacity: 0.78
  }), []);

  const sporeFluidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#36bf84',
    emissive: '#12683e',
    emissiveIntensity: 0.52,
    roughness: 0.22,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82
  }), []);

  const floorRockMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1b231e',
    roughness: 0.92,
    metalness: 0.06
  }), []);

  const floorMossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#26422c',
    roughness: 0.92,
    metalness: 0.0
  }), []);

  const batched = useMemo(() => {
    const vaultList = [];
    const ribList = [];
    const glassTubeList = [];
    const nutrientList = [];
    const sporeList = [];
    const rockList = [];
    const mossList = [];

    // =========================================================================
    // 1. ENCLOSING LIVING MYCELIUM BACK WALL & CANOPY VAULT ENVELOPE
    // Warm, sculpted pressed mycelium composite envelope wrapping the entire
    // facility (placed safely at y = 2.85 .. 3.2 behind all equipment benches)
    // =========================================================================
    const xSteps = 24;
    const uSteps = 16;
    const wallVerts = [];
    const wallIndices = [];

    for (let i = 0; i <= xSteps; i++) {
      const x = -2.0 + (i / xSteps) * 36.0;
      for (let j = 0; j <= uSteps; j++) {
        const u = j / uSteps;
        // Profile curving from floor (z=0, y=3.1) up along the wall to vault ceiling (z=5.4, y=0.5)
        const y = 3.10 - 1.20 * Math.pow(u, 1.8) - 1.40 * Math.pow(u, 3.2);
        const z = 0.0 + 5.40 * Math.sin(u * Math.PI * 0.5);
        // Subtle organic fluting / acoustic mycelial ribbing
        const flute = 0.04 * Math.sin(x * 1.8) * Math.sin(u * Math.PI);
        wallVerts.push(x, y + flute, z);
      }
    }

    const stride = uSteps + 1;
    for (let i = 0; i < xSteps; i++) {
      for (let j = 0; j < uSteps; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        wallIndices.push(a, b, d, b, c, d);
      }
    }

    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();
    vaultList.push(wallGeo);

    // =========================================================================
    // 2. AKIŞKAN ORGANİK KEMİKSİ / HİFSEL SÜTUNLAR & TONOZLAR (Zaha Hadid / Oxman)
    // =========================================================================
    const xColumns = [-0.5, 3.2, 6.4, 9.8, 13.6, 17.8, 22.4, 27.6, 32.5];

    for (const xCol of xColumns) {
      // Primary Hyphal Structural Rib Arch: rising from floor at [xCol, 2.95, 0] up to canopy crown [xCol, 0.4, 5.2]
      const archPoints = [
        new THREE.Vector3(xCol, 2.95, 0.0),
        new THREE.Vector3(xCol, 2.75, 0.9),
        new THREE.Vector3(xCol, 2.50, 2.0),
        new THREE.Vector3(xCol, 2.15, 3.2),
        new THREE.Vector3(xCol, 1.65, 4.3),
        new THREE.Vector3(xCol, 1.05, 4.95),
        new THREE.Vector3(xCol, 0.35, 5.25)
      ];
      const archCurve = new THREE.CatmullRomCurve3(archPoints);
      ribList.push(new THREE.TubeGeometry(archCurve, 32, 0.075, 8, false));

      // Flared organic root base at floor (flush with floor at z = 0.06)
      const baseFoot = new THREE.CylinderGeometry(0.24, 0.38, 0.12, 10);
      ribList.push(transformGeo(baseFoot, [xCol, 2.95, 0.06], [Math.PI / 2, 0, 0]));

      // Secondary High-Ceiling Cantilever Rib
      const branchPoints = [
        new THREE.Vector3(xCol, 2.15, 3.2),
        new THREE.Vector3(xCol, 1.70, 4.1),
        new THREE.Vector3(xCol, 1.15, 4.7),
        new THREE.Vector3(xCol, 0.50, 4.95)
      ];
      const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
      ribList.push(new THREE.TubeGeometry(branchCurve, 20, 0.048, 8, false));

      // Transverse connecting bone brace between ribs
      const transversePoints = [
        new THREE.Vector3(xCol, 2.50, 2.0),
        new THREE.Vector3(xCol + 0.35, 2.25, 2.5),
        new THREE.Vector3(xCol, 2.00, 3.3)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(transversePoints), 14, 0.035, 6, false));
    }

    // Longitudinal Inter-Rib Connecting Tendrils (overhead at z >= 4.6)
    for (let k = 0; k < xColumns.length - 1; k++) {
      const xA = xColumns[k];
      const xB = xColumns[k + 1];
      const xMid = (xA + xB) * 0.5;

      const ridgePoints = [
        new THREE.Vector3(xA, 1.05, 4.95),
        new THREE.Vector3(xMid, 0.90, 5.10),
        new THREE.Vector3(xB, 1.05, 4.95)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePoints), 16, 0.040, 6, false));

      const midPoints = [
        new THREE.Vector3(xA, 2.15, 3.2),
        new THREE.Vector3(xMid, 2.28, 3.35),
        new THREE.Vector3(xB, 2.15, 3.2)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midPoints), 16, 0.035, 6, false));
    }

    // =========================================================================
    // 3. ŞEFFAF VASKÜLER (DAMARSAL) KIVRIMLI TÜPLER & DOLAŞIM SİSTEMİ
    // Glowing vascular conduits carrying amber nutrient fluid and emerald spores
    // =========================================================================
    const nutrientSplinePoints = [];
    const sporeSplinePoints = [];
    const numPoints = 28;

    for (let i = 0; i <= numPoints; i++) {
      const u = i / numPoints;
      const x = -0.5 + u * 34.0;
      
      // Arterial nutrient line (Golden Broth)
      const yNutrient = 1.65 + 0.22 * Math.sin(x * 0.42) + 0.06 * Math.cos(x * 0.85);
      const zNutrient = 4.05 + 0.20 * Math.cos(x * 0.38) - 0.05 * Math.sin(x * 0.72);
      nutrientSplinePoints.push(new THREE.Vector3(x, yNutrient, zNutrient));

      // Venous spore line (Jade Spore Broth)
      const ySpore = 1.95 - 0.20 * Math.sin(x * 0.42) + 0.08 * Math.sin(x * 0.65);
      const zSpore = 3.75 - 0.18 * Math.cos(x * 0.38) + 0.06 * Math.sin(x * 0.92);
      sporeSplinePoints.push(new THREE.Vector3(x, ySpore, zSpore));
    }

    const nutrientCurve = new THREE.CatmullRomCurve3(nutrientSplinePoints);
    const sporeCurve = new THREE.CatmullRomCurve3(sporeSplinePoints);

    glassTubeList.push(new THREE.TubeGeometry(nutrientCurve, 120, 0.046, 10, false));
    glassTubeList.push(new THREE.TubeGeometry(sporeCurve, 120, 0.038, 10, false));

    nutrientList.push(new THREE.TubeGeometry(nutrientCurve, 120, 0.034, 8, false));
    sporeList.push(new THREE.TubeGeometry(sporeCurve, 120, 0.026, 8, false));

    // Vascular siphon line feeding into Station 07 (Organic Heart Reactor, x = 25.0)
    const drop3 = new THREE.CatmullRomCurve3([
      nutrientCurve.getPointAt((25.0 + 0.5) / 34.0),
      new THREE.Vector3(24.5, 0.8, 3.8),
      new THREE.Vector3(24.7, 0.2, 3.65),
      new THREE.Vector3(25.0, 0.0, 3.52)
    ]);
    glassTubeList.push(new THREE.TubeGeometry(drop3, 24, 0.034, 10, false));
    nutrientList.push(new THREE.TubeGeometry(drop3, 24, 0.024, 8, false));

    // Floor Biophilic Basalt Pockets & Moss Cushions along viewing aisle
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

    return {
      vaultGeo: mergeGeometriesFast(vaultList),
      ribGeo: mergeGeometriesFast(ribList),
      glassTubeGeo: mergeGeometriesFast(glassTubeList),
      nutrientGeo: mergeGeometriesFast(nutrientList),
      sporeGeo: mergeGeometriesFast(sporeList),
      rockGeo: mergeGeometriesFast(rockList),
      mossGeo: mergeGeometriesFast(mossList)
    };
  }, []);

  return (
    <group name="LIVING_BIOSPHERE_CANOPY_AND_VAULTS">
      <mesh geometry={batched.vaultGeo} material={myceliumVaultMat} />
      <mesh geometry={batched.ribGeo} material={hyphalRibMat} />
      <mesh geometry={batched.glassTubeGeo} material={vascularGlassMat} />
      <mesh geometry={batched.nutrientGeo} material={nutrientFluidMat} />
      <mesh geometry={batched.sporeGeo} material={sporeFluidMat} />
      <mesh geometry={batched.rockGeo} material={floorRockMat} />
      <mesh geometry={batched.mossGeo} material={floorMossMat} />
    </group>
  );
}

/**
 * 2. BİYOLOJİK MİKRO-PEYZAJ / TERRARIUM YATAĞI (Zone B & C çevresi)
 * 
 * Sits directly on the bench worktop surface:
 * Zone B worktop: z = 1.225
 * Zone C counter: z = 1.205
 * 
 * Lush living mycorrhizal soil bed, sculpted emerald moss pillows,
 * polished river stones, and borosilicate retaining rim.
 */
export function BiologicalMicroLandscape() {
  const basinStoneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#28382c', // Dark basalt mineral rim
    roughness: 0.85,
    metalness: 0.04
  }), []);

  const richSoilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#18241a', // Fertile dark organic soil bed
    roughness: 0.94,
    metalness: 0.01
  }), []);

  const mossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#326839', // Vibrant velvety emerald living moss
    roughness: 0.90,
    metalness: 0.0
  }), []);

  const chartreuseMossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4e823c', // Chartreuse accent moss cushions
    roughness: 0.92,
    metalness: 0.0
  }), []);

  const hyphalThreadMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f0ece1',
    emissive: '#5c543f',
    emissiveIntensity: 0.25,
    roughness: 0.70,
    metalness: 0.02
  }), []);

  const riverPebbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2c372f',
    roughness: 0.40,
    metalness: 0.12
  }), []);

  const batched = useMemo(() => {
    const rimList = [];
    const soilList = [];
    const mossList = [];
    const chartreuseList = [];
    const pebbleList = [];

    // 1. Intimate Terrarium Collar hugging the Petri Dish (visible in macro close-up view at [4.4, -0.15, 1.29])
    // Organic soil bed cushion supporting the Petri dish pedestal
    const petriSoilPlate = new THREE.CylinderGeometry(0.068, 0.075, 0.016, 24);
    soilList.push(transformGeo(petriSoilPlate, [4.40, -0.15, 1.254], [Math.PI / 2, 0, 0]));

    const microMossGeo = new THREE.DodecahedronGeometry(0.011, 1);
    const numMicroMoss = 16;
    for (let i = 0; i < numMicroMoss; i++) {
      const a = (i / numMicroMoss) * Math.PI * 2;
      const r = 0.049 + 0.009 * (i % 3);
      const mx = 4.40 + Math.cos(a) * r;
      const my = -0.15 + Math.sin(a) * r;
      const mz = 1.266 + 0.003 * Math.sin(i * 1.8);
      const isChartreuse = i % 2 === 0;
      const targetList = isChartreuse ? chartreuseList : mossList;
      targetList.push(transformGeo(
        microMossGeo,
        [mx, my, mz],
        [0.1, i * 0.45, 0.05],
        [1.15, 1.05, 0.55]
      ));
    }

    // Micro river pebbles tucked into the moss around Petri rim
    const microPebbleGeo = new THREE.DodecahedronGeometry(0.006, 1);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.25;
      const r = 0.058;
      pebbleList.push(transformGeo(
        microPebbleGeo,
        [4.40 + Math.cos(a) * r, -0.15 + Math.sin(a) * r, 1.264],
        [0.2, k * 1.1, 0.1],
        [1.2, 0.9, 0.6]
      ));
    }

    // 2. Wide Terrarium Basin around Zone B (Petri Arrival & Germination, Bench Top z = 1.225)
    const zB = 1.228;

    // Curved borosilicate / dark basalt retaining curb encircling the bed
    const rimCurve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.55, -0.62, zB + 0.015),
      new THREE.Vector3(4.40, -0.72, zB + 0.015),
      new THREE.Vector3(5.25, -0.62, zB + 0.015),
      new THREE.Vector3(5.35, 0.28, zB + 0.015),
      new THREE.Vector3(4.40, 0.38, zB + 0.015),
      new THREE.Vector3(3.45, 0.28, zB + 0.015)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve1, 36, 0.018, 8, true));

    // Fertile organic soil bed disc: flat horizontal on table (rotation [Math.PI/2, 0, 0])
    // Height 0.018, centered at zB + 0.009 (from 1.228 to 1.246)
    const soilGeo1 = new THREE.CylinderGeometry(0.78, 0.82, 0.018, 32);
    soilList.push(transformGeo(soilGeo1, [4.4, -0.15, zB + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    // Lush Living Moss Cushions around Zone B (sitting proudly on the soil at z = 1.248 .. 1.268)
    const mossPillow = new THREE.DodecahedronGeometry(0.065, 1);
    const mossBLocations = [
      { x: 3.75, y: -0.46, z: zB + 0.024, s: 1.25, type: 'dark' },
      { x: 5.05, y: -0.48, z: zB + 0.024, s: 1.20, type: 'chartreuse' },
      { x: 3.65, y: -0.12, z: zB + 0.022, s: 1.10, type: 'dark' },
      { x: 5.15, y: -0.10, z: zB + 0.024, s: 1.15, type: 'chartreuse' },
      { x: 3.80, y: 0.24, z: zB + 0.024, s: 1.30, type: 'chartreuse' },
      { x: 4.40, y: 0.30, z: zB + 0.026, s: 1.40, type: 'dark' },
      { x: 5.00, y: 0.25, z: zB + 0.024, s: 1.25, type: 'dark' }
    ];

    mossBLocations.forEach((m, idx) => {
      const targetList = m.type === 'dark' ? mossList : chartreuseList;
      targetList.push(transformGeo(
        mossPillow,
        [m.x, m.y, m.z],
        [0.12, idx * 0.85, 0.06],
        [1.35 * m.s, 1.15 * m.s, 0.42 * m.s]
      ));
    });

    // Polished Basalt River Stones clustered in the moss
    const pebbleGeo = new THREE.DodecahedronGeometry(0.038, 1);
    const pebbleBLocations = [
      { x: 3.95, y: -0.55, z: zB + 0.020, s: 0.9 },
      { x: 4.85, y: -0.58, z: zB + 0.020, s: 1.0 },
      { x: 3.55, y: 0.12, z: zB + 0.022, s: 1.1 },
      { x: 5.20, y: 0.18, z: zB + 0.022, s: 0.95 }
    ];
    pebbleBLocations.forEach((p, idx) => {
      pebbleList.push(transformGeo(
        pebbleGeo,
        [p.x, p.y, p.z],
        [0.3, idx * 0.9, 0.2],
        [1.2 * p.s, 0.85 * p.s, 0.55 * p.s]
      ));
    });

    // =========================================================================
    // TERRARIUM BASIN 2: Zone C (Isolation Bench Top z = 1.205)
    // Center at [8.06, -0.20], counter is at [8.06, -0.20, 1.205]
    // =========================================================================
    const zC = 1.208;

    const rimCurve2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(7.20, -0.65, zC + 0.015),
      new THREE.Vector3(8.06, -0.75, zC + 0.015),
      new THREE.Vector3(8.92, -0.65, zC + 0.015),
      new THREE.Vector3(9.02, 0.28, zC + 0.015),
      new THREE.Vector3(8.06, 0.38, zC + 0.015),
      new THREE.Vector3(7.10, 0.26, zC + 0.015)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve2, 36, 0.018, 8, true));

    const soilGeo2 = new THREE.CylinderGeometry(0.80, 0.84, 0.018, 32);
    soilList.push(transformGeo(soilGeo2, [8.06, -0.20, zC + 0.009], [Math.PI / 2, 0, 0], [1.15, 0.88, 1]));

    const mossCLocations = [
      { x: 7.35, y: -0.48, z: zC + 0.024, s: 1.20, type: 'dark' },
      { x: 8.75, y: -0.50, z: zC + 0.024, s: 1.25, type: 'chartreuse' },
      { x: 7.25, y: -0.15, z: zC + 0.022, s: 1.10, type: 'chartreuse' },
      { x: 8.85, y: -0.12, z: zC + 0.024, s: 1.15, type: 'dark' },
      { x: 7.45, y: 0.24, z: zC + 0.024, s: 1.30, type: 'dark' },
      { x: 8.06, y: 0.32, z: zC + 0.026, s: 1.45, type: 'chartreuse' },
      { x: 8.68, y: 0.26, z: zC + 0.024, s: 1.20, type: 'dark' }
    ];

    mossCLocations.forEach((m, idx) => {
      const targetList = m.type === 'dark' ? mossList : chartreuseList;
      targetList.push(transformGeo(
        mossPillow,
        [m.x, m.y, m.z],
        [0.15, idx * 0.8, 0.08],
        [1.35 * m.s, 1.15 * m.s, 0.42 * m.s]
      ));
    });

    return {
      rimGeo: mergeGeometriesFast(rimList),
      soilGeo: mergeGeometriesFast(soilList),
      mossGeo: mergeGeometriesFast(mossList),
      chartreuseGeo: mergeGeometriesFast(chartreuseList),
      pebbleGeo: mergeGeometriesFast(pebbleList)
    };
  }, []);

  return (
    <group name="BIOLOGICAL_MICRO_LANDSCAPE_TERRARIUM">
      <mesh geometry={batched.rimGeo} material={basinStoneMat} />
      <mesh geometry={batched.soilGeo} material={richSoilMat} />
      <mesh geometry={batched.mossGeo} material={mossMat} />
      <mesh geometry={batched.chartreuseGeo} material={chartreuseMossMat} />
      <mesh geometry={batched.pebbleGeo} material={riverPebbleMat} />
    </group>
  );
}

/**
 * 3. ASKIDA DAMLA REAKTÖRLERİ / LEVİTE KAPSÜLLER (Zone D & E çevresi)
 * 
 * Beautiful suspended teardrop bioreactor vessels hanging in the upper mid-ground
 * of the Culture Expansion & Controlled Incubation zones (z ≈ 2.25 .. 2.65, y ≈ 0.1 .. 0.5)
 * Completely visible to the camera, framing the shaker tables with bioluminescent living incubators!
 */
export function SuspendedDropletReactors({ progressRef }) {
  const groupRef = useRef();

  const capsuleGlassMat = useMemo(() => createFastGlassMaterial({
    color: '#d6f6e8',
    opacity: 0.35,
    roughness: 0.05,
    metalness: 0.06,
    side: THREE.DoubleSide
  }), []);

  const capsuleCoreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5ecd6', // Cultured living fungal mycelium clump
    emissive: '#a66a1e',
    emissiveIntensity: 0.48,
    roughness: 0.55,
    metalness: 0.02
  }), []);

  const capsuleLiquidMat = new THREE.MeshStandardMaterial({
    color: '#e29c36',
    emissive: '#72420e',
    emissiveIntensity: 0.40,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.75
  });

  const capsuleCollarMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c2b69e', // Bone/composite collar rings
    roughness: 0.55,
    metalness: 0.12
  }), []);

  const tendrilCableMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#464a44', // High-tensile carbon-mycelium suspension cables
    roughness: 0.75,
    metalness: 0.20
  }), []);

  const batched = useMemo(() => {
    const glassList = [];
    const coreList = [];
    const liquidList = [];
    const collarList = [];
    const cableList = [];

    // 5 Levitating / Suspended Droplet Reactors positioned across Zone D & E:
    // Visible in the upper-half of the camera view (z ≈ 2.3 .. 2.65 m, y ≈ 0.1 .. 0.5 m)
    const dropletSpecs = [
      { x: 10.35, y: 0.15, z: 2.35, scale: 1.15 },
      { x: 11.85, y: 0.45, z: 2.58, scale: 1.25 },
      { x: 13.45, y: 0.25, z: 2.42, scale: 1.18 },
      { x: 15.05, y: 0.50, z: 2.62, scale: 1.28 },
      { x: 16.45, y: 0.20, z: 2.45, scale: 1.15 }
    ];

    for (const d of dropletSpecs) {
      const s = d.scale;
      // Inverted Teardrop / Seed-Pod Outer Glass Shell:
      // Top hemisphere dome (radius 0.18 * s)
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.18 * s, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
        [d.x, d.y, d.z + 0.06 * s]
      ));
      // Tapering inverted cone lower body (height 0.36 * s)
      glassList.push(transformGeo(
        new THREE.CylinderGeometry(0.18 * s, 0.035 * s, 0.36 * s, 24, 1, true),
        [d.x, d.y, d.z - 0.12 * s],
        [Math.PI / 2, 0, 0]
      ));
      // Bottom drainage rounded tip
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.035 * s, 16, 10),
        [d.x, d.y, d.z - 0.30 * s]
      ));

      // Collar rings at equator and top crown
      collarList.push(transformGeo(
        new THREE.TorusGeometry(0.182 * s, 0.012 * s, 8, 28),
        [d.x, d.y, d.z + 0.06 * s]
      ));
      collarList.push(transformGeo(
        new THREE.TorusGeometry(0.065 * s, 0.009 * s, 8, 20),
        [d.x, d.y, d.z + 0.24 * s]
      ));

      // Inner Glowing Culture Liquid Body
      liquidList.push(transformGeo(
        new THREE.CylinderGeometry(0.16 * s, 0.04 * s, 0.28 * s, 18),
        [d.x, d.y, d.z - 0.10 * s],
        [Math.PI / 2, 0, 0]
      ));

      // Inner Floating Fungal Biomass Core
      coreList.push(transformGeo(
        new THREE.DodecahedronGeometry(0.095 * s, 1),
        [d.x, d.y, d.z - 0.04 * s],
        [0.2, 0.4, 0.1],
        [1.15, 0.95, 1.25]
      ));

      // Suspension Tendril Cable extending straight up to the ceiling vault (z ≈ 4.85)
      const cableHeight = 4.85 - (d.z + 0.24 * s);
      cableList.push(transformGeo(
        new THREE.CylinderGeometry(0.004, 0.004, cableHeight, 6),
        [d.x, d.y, (d.z + 0.24 * s) + cableHeight * 0.5],
        [Math.PI / 2, 0, 0]
      ));

      // Delicate curved capillary nutrient feeder loop entering top crown
      const capillaryCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(d.x - 0.24, d.y + 0.24, d.z + 0.45 * s),
        new THREE.Vector3(d.x - 0.08, d.y + 0.08, d.z + 0.32 * s),
        new THREE.Vector3(d.x, d.y, d.z + 0.24 * s)
      ]);
      glassList.push(new THREE.TubeGeometry(capillaryCurve, 16, 0.008 * s, 6, false));
    }

    return {
      glassGeo: mergeGeometriesFast(glassList),
      coreGeo: mergeGeometriesFast(coreList),
      liquidGeo: mergeGeometriesFast(liquidList),
      collarGeo: mergeGeometriesFast(collarList),
      cableGeo: mergeGeometriesFast(cableList)
    };
  }, []);

  useFrame(() => {
    const p = progressRef ? progressRef.current : 0;
    if (groupRef.current) {
      groupRef.current.visible = p >= 0.28 && p <= 0.85;
    }
  });

  return (
    <group ref={groupRef} name="SUSPENDED_DROPLET_REACTORS" visible={false}>
      <mesh geometry={batched.glassGeo} material={capsuleGlassMat} />
      <mesh geometry={batched.coreGeo} material={capsuleCoreMat} />
      <mesh geometry={batched.liquidGeo} material={capsuleLiquidMat} />
      <mesh geometry={batched.collarGeo} material={capsuleCollarMat} />
      <mesh geometry={batched.cableGeo} material={tendrilCableMat} />
    </group>
  );
}

/**
 * 4. ORGANİK KALP REAKTÖRÜ (Zone G çevresi)
 * 
 * Hassas fermantasyon istasyonunu canlı bir metabolik biyo-kalbe dönüştüren
 * devasa aortik vasküler kemerler, spiral perikardiyal miselyum kas bantları ve
 * atan iç biyokütle çekirdeği.
 */
export function OrganicHeartReactor({ progressRef }) {
  const groupRef = useRef();
  const heartCoreRef = useRef();

  const heartSinewMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd4c0', // Spiral fibrous mycelium muscle bands / structural sinews
    roughness: 0.78,
    metalness: 0.04
  }), []);

  const aorticVesselMat = useMemo(() => createFastGlassMaterial({
    color: '#c2f2dc',
    opacity: 0.38,
    roughness: 0.06,
    metalness: 0.10
  }), []);

  const heartPulseMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#df8226',
    emissive: '#a6480e',
    emissiveIntensity: 0.65,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82
  }), []);

  const batched = useMemo(() => {
    const sinewList = [];
    const aorticList = [];
    const pulseList = [];

    const hX = 25.0, hY = 0.0;

    // --- Mycelial Pericardial Sinews (Spiral Structural Ribs around Fermenter Glass) ---
    // 3 continuous helical ribbons wrapping around the fermenter body like muscle sinews
    for (let k = 0; k < 3; k++) {
      const sinewPts = [];
      const zStart = 1.62 + k * 0.45;
      const numSteps = 28;
      for (let i = 0; i <= numSteps; i++) {
        const u = i / numSteps;
        const ang = u * Math.PI * 1.8 + (k * Math.PI * 0.65);
        const z = zStart + u * 1.35;
        const rProfile = 1.10 + 0.025 * Math.sin(u * Math.PI);
        const sx = hX + Math.cos(ang) * rProfile;
        const sy = hY + Math.sin(ang) * (rProfile * 0.94);
        sinewPts.push(new THREE.Vector3(sx, sy, z));
      }
      sinewList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sinewPts), 36, 0.024, 8, false));
    }

    // --- Aortic Arch Vessels (Arteria Mycelia & Vena Metabolica) ---
    // Primary Aortic Arch: Sweeping out of the top dome of the fermenter [25.0, 0.0, 3.56]
    // ascending gracefully to [23.8, 0.30, 4.45] and merging into overhead vascular biopipes
    const aortaPoints = [
      new THREE.Vector3(hX, hY, 3.56),
      new THREE.Vector3(hX - 0.25, hY + 0.18, 3.98),
      new THREE.Vector3(hX - 0.75, hY + 0.32, 4.32),
      new THREE.Vector3(hX - 1.55, hY + 0.40, 4.46),
      new THREE.Vector3(hX - 2.45, hY + 0.45, 4.42)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.068, 10, false));
    pulseList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 32, 0.046, 8, false));

    // Venous Return Conduit: Looping from secondary port down along lateral flank
    const venousPoints = [
      new THREE.Vector3(hX + 0.58, hY + 0.25, 3.52),
      new THREE.Vector3(hX + 1.05, hY + 0.35, 3.25),
      new THREE.Vector3(hX + 1.18, hY + 0.14, 2.45),
      new THREE.Vector3(hX + 0.96, hY - 0.14, 1.75),
      new THREE.Vector3(hX + 0.52, hY - 0.25, 1.35)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.052, 10, false));
    pulseList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 32, 0.034, 8, false));

    return {
      sinewGeo: mergeGeometriesFast(sinewList),
      aorticGeo: mergeGeometriesFast(aorticList),
      pulseGeo: mergeGeometriesFast(pulseList)
    };
  }, []);

  useFrame((state) => {
    const p = progressRef ? progressRef.current : 0;
    if (groupRef.current) {
      groupRef.current.visible = p >= 0.72;
    }
    if (heartCoreRef.current) {
      // Gentle bio-metabolic heart pulse
      const t = state.clock.getElapsedTime();
      const pulse = 1.0 + 0.035 * Math.sin(t * 3.2) * Math.sin(t * 6.4);
      heartCoreRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group ref={groupRef} name="ORGANIC_HEART_REACTOR" visible={false}>
      <mesh geometry={batched.sinewGeo} material={heartSinewMat} />
      <mesh geometry={batched.aorticGeo} material={aorticVesselMat} />
      <mesh ref={heartCoreRef} geometry={batched.pulseGeo} material={heartPulseMat} />
    </group>
  );
}
