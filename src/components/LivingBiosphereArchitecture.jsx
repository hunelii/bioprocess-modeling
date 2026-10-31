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
 *    - Preslenmiş mycelium kompoziti & kireç/kil sıva kubbe panelleri
 *    - Şeffaf vasküler (damarsal) kıvrımlı biyo-tüpler (besin sıvısı ve sporların dolaştığı yaşayan damarlar)
 * 
 * 2. BiologicalMicroLandscape:
 *    - Biyolojik Mikro-Peyzaj / Terrarium Yatağı (Zone B & C çevresi, Petri kaplarının oturduğu canlı mikrokosmos)
 * 
 * 3. SuspendedDropletReactors:
 *    - Askıda Damla Reaktörleri / Levite Kapsüller (Zone D & E çevresi, askıda asılı biyolojik damla reaktörleri)
 * 
 * 4. OrganicHeartReactor:
 *    - Organik Kalp Reaktörü (Zone G, çift hazneli anatomik yaşayan cam kalp, aortik damarlar, spiral mycelium bağları)
 */

export function LivingBiosphereCanopyAndVaults() {
  const myceliumVaultMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#dfd7c8', // Warm pressed mycelium composite / plaster chalk
    roughness: 0.90,
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
    // 1. AKIŞKAN ORGANİK KEMİKSİ / HİFSEL SÜTUNLAR & TONOZLAR (Zaha Hadid / Oxman)
    // Sütunlar arka hatta (y >= 2.2) ve tavana (z >= 4.4) yerleştirilerek
    // kameranın önü ve istasyonların görüş açısı tamamen açık tutulur.
    // =========================================================================
    const xColumns = [-0.5, 3.2, 6.4, 9.8, 13.6, 17.8, 22.4, 27.6, 32.5];

    for (const xCol of xColumns) {
      // Primary Hyphal Structural Rib Arch:
      // Zeminle buluştuğu yer arka duvarda [xCol, 2.95, 0.0], yukarı ve tavana doğru akar
      const archPoints = [
        new THREE.Vector3(xCol, 2.95, 0.0),
        new THREE.Vector3(xCol, 2.75, 0.8),
        new THREE.Vector3(xCol, 2.50, 1.8),
        new THREE.Vector3(xCol, 2.20, 2.9),
        new THREE.Vector3(xCol, 1.80, 3.9),
        new THREE.Vector3(xCol, 1.30, 4.6),
        new THREE.Vector3(xCol, 0.60, 5.0)
      ];
      const archCurve = new THREE.CatmullRomCurve3(archPoints);
      ribList.push(new THREE.TubeGeometry(archCurve, 28, 0.065, 8, false));

      // Flared organic root base at floor (horizontally oriented, flush with floor)
      const baseFoot = new THREE.CylinderGeometry(0.22, 0.35, 0.12, 10);
      ribList.push(transformGeo(baseFoot, [xCol, 2.95, 0.06], [Math.PI / 2, 0, 0]));

      // Secondary High-Ceiling Cantilever Rib (stays strictly overhead at z >= 3.8)
      const branchPoints = [
        new THREE.Vector3(xCol, 2.20, 2.9),
        new THREE.Vector3(xCol, 1.80, 3.8),
        new THREE.Vector3(xCol, 1.25, 4.4),
        new THREE.Vector3(xCol, 0.65, 4.75)
      ];
      const branchCurve = new THREE.CatmullRomCurve3(branchPoints);
      ribList.push(new THREE.TubeGeometry(branchCurve, 18, 0.045, 8, false));

      // Transverse connecting bone brace between ribs at upper height
      const transversePoints = [
        new THREE.Vector3(xCol, 2.50, 1.8),
        new THREE.Vector3(xCol + 0.30, 2.30, 2.3),
        new THREE.Vector3(xCol, 2.05, 3.1)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(transversePoints), 12, 0.032, 6, false));
    }

    // Longitudinal Inter-Rib Connecting Tendrils (overhead at z >= 4.4)
    for (let k = 0; k < xColumns.length - 1; k++) {
      const xA = xColumns[k];
      const xB = xColumns[k + 1];
      const xMid = (xA + xB) * 0.5;

      const ridgePoints = [
        new THREE.Vector3(xA, 1.30, 4.6),
        new THREE.Vector3(xMid, 1.15, 4.75),
        new THREE.Vector3(xB, 1.30, 4.6)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePoints), 16, 0.038, 6, false));

      const midPoints = [
        new THREE.Vector3(xA, 2.20, 2.9),
        new THREE.Vector3(xMid, 2.32, 3.05),
        new THREE.Vector3(xB, 2.20, 2.9)
      ];
      ribList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midPoints), 16, 0.032, 6, false));
    }

    // High ceiling canopy ribs (open structure letting atmospheric lighting through)
    for (let s = 0; s < 10; s++) {
      const xArc = s * 3.3 + 1.2;
      const canopyRib = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xArc, 2.4, 4.2),
        new THREE.Vector3(xArc, 1.5, 4.8),
        new THREE.Vector3(xArc, 0.6, 5.1),
        new THREE.Vector3(xArc, -0.2, 5.0)
      ]);
      vaultList.push(new THREE.TubeGeometry(canopyRib, 20, 0.042, 6, false));
    }

    // =========================================================================
    // 2. ŞEFFAF VASKÜLER (DAMARSAL) KIVRIMLI TÜPLER & DOLAŞIM SİSTEMİ
    // Yüksek tavanda ve arka duvarda (y >= 1.6, z >= 3.8) dolaşan canlı hatlar
    // =========================================================================
    const nutrientSplinePoints = [];
    const sporeSplinePoints = [];
    const numPoints = 28;

    for (let i = 0; i <= numPoints; i++) {
      const u = i / numPoints;
      const x = -0.5 + u * 34.0;
      
      // Arterial nutrient line (Golden Broth)
      const yNutrient = 1.85 + 0.20 * Math.sin(x * 0.42) + 0.06 * Math.cos(x * 0.85);
      const zNutrient = 4.15 + 0.20 * Math.cos(x * 0.38) - 0.05 * Math.sin(x * 0.72);
      nutrientSplinePoints.push(new THREE.Vector3(x, yNutrient, zNutrient));

      // Venous spore line (Jade Spore Broth)
      const ySpore = 2.05 - 0.18 * Math.sin(x * 0.42) + 0.08 * Math.sin(x * 0.65);
      const zSpore = 3.82 - 0.18 * Math.cos(x * 0.38) + 0.06 * Math.sin(x * 0.92);
      sporeSplinePoints.push(new THREE.Vector3(x, ySpore, zSpore));
    }

    const nutrientCurve = new THREE.CatmullRomCurve3(nutrientSplinePoints);
    const sporeCurve = new THREE.CatmullRomCurve3(sporeSplinePoints);

    glassTubeList.push(new THREE.TubeGeometry(nutrientCurve, 120, 0.046, 10, false));
    glassTubeList.push(new THREE.TubeGeometry(sporeCurve, 120, 0.038, 10, false));

    nutrientList.push(new THREE.TubeGeometry(nutrientCurve, 120, 0.034, 8, false));
    sporeList.push(new THREE.TubeGeometry(sporeCurve, 120, 0.026, 8, false));

    // Main vascular line drops gracefully into Station 07 (Organic Heart Reactor, x = 25.0)
    const drop3 = new THREE.CatmullRomCurve3([
      nutrientCurve.getPointAt((25.0 + 0.5) / 34.0),
      new THREE.Vector3(24.5, 0.8, 3.8),
      new THREE.Vector3(24.7, 0.2, 3.65),
      new THREE.Vector3(25.0, 0.0, 3.52)
    ]);
    glassTubeList.push(new THREE.TubeGeometry(drop3, 24, 0.034, 10, false));
    nutrientList.push(new THREE.TubeGeometry(drop3, 24, 0.024, 8, false));

    // Floor Biophilic Pockets (Organic basalt stones and moss cushions along viewing aisle)
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
 * Petri kapları ve izolasyon istasyonunun oturduğu, kavisli mineral bordürler,
 * zengin organik toprak katmanları, canlı yosun adacıkları ve yayılan ipeksi hif hatları.
 * Petri kapları kaldırılmadan bu mikro-ekosistemin içine gömülür.
 */
export function BiologicalMicroLandscape() {
  const basinStoneMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#28362c', // Dark basalt / mineral carved terrarium rim
    roughness: 0.88,
    metalness: 0.04
  }), []);

  const richSoilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a221b', // Fertile organic mycorrhizal soil bed
    roughness: 0.95,
    metalness: 0.01
  }), []);

  const mossMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2d5232', // Lush velvety living moss
    roughness: 0.92,
    metalness: 0.0
  }), []);

  const hyphalThreadMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#eee6d4', // Spreading white-cream fungal mycelium threads
    emissive: '#443c2c',
    emissiveIntensity: 0.20,
    roughness: 0.75,
    metalness: 0.02
  }), []);

  const riverPebbleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#344037', // Polished dark river stones
    roughness: 0.45,
    metalness: 0.12
  }), []);

  const batched = useMemo(() => {
    const rimList = [];
    const soilList = [];
    const mossList = [];
    const hyphaList = [];
    const pebbleList = [];

    // --- TERRARIUM BASIN 1: Around Zone B (Petri Arrival & Germination, x ≈ 3.5 .. 5.4) ---
    // Curved retaining lip contour lying flat on the bench at z = 1.185
    const rimCurve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.7, -0.58, 1.185),
      new THREE.Vector3(4.4, -0.65, 1.185),
      new THREE.Vector3(5.1, -0.58, 1.185),
      new THREE.Vector3(5.2, 0.22, 1.185),
      new THREE.Vector3(4.4, 0.28, 1.185),
      new THREE.Vector3(3.6, 0.20, 1.185)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve1, 32, 0.014, 8, true));

    // Fertile soil bed: HORIZONTAL (rotation [Math.PI/2, 0, 0]), thin disc flush with worktop
    const soilGeo1 = new THREE.CylinderGeometry(0.62, 0.65, 0.008, 24);
    soilList.push(transformGeo(soilGeo1, [4.4, -0.15, 1.182], [Math.PI / 2, 0, 0], [1.12, 0.85, 1]));

    // --- TERRARIUM BASIN 2: Around Zone C (Isolation & Selection, x ≈ 7.3 .. 8.9) ---
    const rimCurve2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(7.3, -0.62, 1.185),
      new THREE.Vector3(8.06, -0.68, 1.185),
      new THREE.Vector3(8.8, -0.60, 1.185),
      new THREE.Vector3(8.9, 0.22, 1.185),
      new THREE.Vector3(8.06, 0.28, 1.185),
      new THREE.Vector3(7.2, 0.18, 1.185)
    ], true);
    rimList.push(new THREE.TubeGeometry(rimCurve2, 32, 0.014, 8, true));

    // Fertile soil bed: HORIZONTAL, thin disc flush with worktop
    const soilGeo2 = new THREE.CylinderGeometry(0.65, 0.68, 0.008, 24);
    soilList.push(transformGeo(soilGeo2, [8.06, -0.20, 1.182], [Math.PI / 2, 0, 0], [1.12, 0.88, 1]));

    // --- Living Moss Mounds & Lichen Cushions (Flat on soil, z = 1.188) ---
    const mossPillow = new THREE.DodecahedronGeometry(0.045, 1);
    const mossLocations = [
      // Basin 1 clusters (around Petri dish at [4.4, -0.15])
      { x: 3.88, y: -0.42, z: 1.188, s: 1.0 },
      { x: 4.92, y: -0.45, z: 1.188, s: 0.9 },
      { x: 3.88, y: 0.15, z: 1.188, s: 1.1 },
      { x: 4.92, y: 0.14, z: 1.188, s: 0.95 },
      // Basin 2 clusters (around Isolation at [8.06, -0.20])
      { x: 7.48, y: -0.45, z: 1.188, s: 1.0 },
      { x: 8.65, y: -0.48, z: 1.188, s: 0.95 },
      { x: 7.48, y: 0.18, z: 1.188, s: 1.05 },
      { x: 8.65, y: 0.16, z: 1.188, s: 1.1 }
    ];

    mossLocations.forEach((m, idx) => {
      mossList.push(transformGeo(
        mossPillow,
        [m.x, m.y, m.z],
        [0.15, idx * 0.7, 0.08],
        [1.2 * m.s, 1.0 * m.s, 0.22 * m.s]
      ));
    });

    return {
      rimGeo: mergeGeometriesFast(rimList),
      soilGeo: mergeGeometriesFast(soilList),
      mossGeo: mergeGeometriesFast(mossList),
      pebbleGeo: mergeGeometriesFast(pebbleList)
    };
  }, []);

  return (
    <group name="BIOLOGICAL_MICRO_LANDSCAPE_TERRARIUM">
      <mesh geometry={batched.rimGeo} material={basinStoneMat} />
      <mesh geometry={batched.soilGeo} material={richSoilMat} />
      <mesh geometry={batched.mossGeo} material={mossMat} />
      <mesh geometry={batched.pebbleGeo} material={riverPebbleMat} />
    </group>
  );
}

/**
 * 3. ASKIDA DAMLA REAKTÖRLERİ / LEVİTE KAPSÜLLER (Zone D & E çevresi)
 * 
 * Erlenmeyer çalkalayıcı ve kuluçka ünitelerinin üzerinde asılı duran,
 * ters damla / tohum kozası formunda aerodinamik şeffaf biyo-reaktörler.
 * İçlerinde ışıldayan biyokütle çekirdeği ve üstten inen kılcal besleme hatları.
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
    emissive: '#8c5818',
    emissiveIntensity: 0.38,
    roughness: 0.55,
    metalness: 0.02
  }), []);

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
    const collarList = [];
    const cableList = [];

    // 3 Levitating / Suspended Droplet Reactors (high in the ceiling void, framing gracefully)
    const dropletSpecs = [
      { x: 10.85, y: 1.05, z: 3.55, scale: 0.88 },
      { x: 12.65, y: 1.18, z: 3.75, scale: 0.96 },
      { x: 14.35, y: 1.05, z: 3.58, scale: 0.88 }
    ];

    for (const d of dropletSpecs) {
      const s = d.scale;
      // Inverted Teardrop / Seed-Pod Outer Glass Shell:
      // Top hemisphere dome (radius 0.18 * s)
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.18 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        [d.x, d.y, d.z + 0.06 * s]
      ));
      // Tapering inverted cone lower body (height 0.36 * s)
      glassList.push(transformGeo(
        new THREE.CylinderGeometry(0.18 * s, 0.035 * s, 0.36 * s, 20, 1, true),
        [d.x, d.y, d.z - 0.12 * s],
        [Math.PI / 2, 0, 0]
      ));
      // Bottom drainage rounded tip
      glassList.push(transformGeo(
        new THREE.SphereGeometry(0.035 * s, 14, 8),
        [d.x, d.y, d.z - 0.30 * s]
      ));

      // Collar rings at equator and top crown
      collarList.push(transformGeo(
        new THREE.TorusGeometry(0.182 * s, 0.012 * s, 8, 24),
        [d.x, d.y, d.z + 0.06 * s]
      ));
      collarList.push(transformGeo(
        new THREE.TorusGeometry(0.065 * s, 0.009 * s, 8, 18),
        [d.x, d.y, d.z + 0.24 * s]
      ));

      // Inner Floating Fungal Biomass Core
      coreList.push(transformGeo(
        new THREE.DodecahedronGeometry(0.088 * s, 1),
        [d.x, d.y, d.z - 0.04 * s],
        [0.2, 0.4, 0.1],
        [1.1, 0.95, 1.25]
      ));

      // Suspension Tendril Cable extending straight up to the ceiling vault (z ≈ 4.85)
      const cableHeight = 4.85 - (d.z + 0.24 * s);
      cableList.push(transformGeo(
        new THREE.CylinderGeometry(0.0035, 0.0035, cableHeight, 6),
        [d.x, d.y, (d.z + 0.24 * s) + cableHeight * 0.5],
        [Math.PI / 2, 0, 0]
      ));

      // Delicate curved capillary nutrient feeder loop entering top crown
      const capillaryCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(d.x - 0.22, d.y + 0.22, d.z + 0.42 * s),
        new THREE.Vector3(d.x - 0.08, d.y + 0.08, d.z + 0.32 * s),
        new THREE.Vector3(d.x, d.y, d.z + 0.24 * s)
      ]);
      glassList.push(new THREE.TubeGeometry(capillaryCurve, 14, 0.007 * s, 6, false));
    }

    return {
      glassGeo: mergeGeometriesFast(glassList),
      coreGeo: mergeGeometriesFast(coreList),
      collarGeo: mergeGeometriesFast(collarList),
      cableGeo: mergeGeometriesFast(cableList)
    };
  }, []);

  useFrame(() => {
    const p = progressRef ? progressRef.current : 0;
    if (groupRef.current) {
      groupRef.current.visible = p >= 0.28 && p <= 0.82;
    }
  });

  return (
    <group ref={groupRef} name="SUSPENDED_DROPLET_REACTORS" visible={false}>
      <mesh geometry={batched.glassGeo} material={capsuleGlassMat} />
      <mesh geometry={batched.coreGeo} material={capsuleCoreMat} />
      <mesh geometry={batched.collarGeo} material={capsuleCollarMat} />
      <mesh geometry={batched.cableGeo} material={tendrilCableMat} />
    </group>
  );
}

/**
 * 4. ORGANİK KALP REAKTÖRÜ (Zone G çevresi)
 * 
 * Hassas fermantasyon istasyonunu soğuk bir bira/ilaç tankından çıkarıp,
 * aortik damarlarla ve spiral mycelium bağlarıyla yaşayan bir biyo-kalbe
 * dönüştüren mimari eklemeler.
 */
export function OrganicHeartReactor({ progressRef }) {
  const groupRef = useRef();

  const heartSinewMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ded3be', // Spiral fibrous mycelium muscle bands / structural sinews
    roughness: 0.78,
    metalness: 0.04
  }), []);

  const aorticVesselMat = useMemo(() => createFastGlassMaterial({
    color: '#b6eed3',
    opacity: 0.38,
    roughness: 0.06,
    metalness: 0.10
  }), []);

  const batched = useMemo(() => {
    const sinewList = [];
    const aorticList = [];

    const hX = 25.0, hY = 0.0;

    // --- Mycelial Pericardial Sinews (Spiral Structural Ribs around Fermenter Glass) ---
    // 3 continuous helical ribbons wrapping around the fermenter body like muscle sinews
    for (let k = 0; k < 3; k++) {
      const sinewPts = [];
      const zStart = 1.72 + k * 0.45;
      const numSteps = 24;
      for (let i = 0; i <= numSteps; i++) {
        const u = i / numSteps;
        const ang = u * Math.PI * 1.8 + (k * Math.PI * 0.65);
        const z = zStart + u * 1.25;
        const rProfile = 1.09 + 0.02 * Math.sin(u * Math.PI);
        const sx = hX + Math.cos(ang) * rProfile;
        const sy = hY + Math.sin(ang) * (rProfile * 0.94);
        sinewPts.push(new THREE.Vector3(sx, sy, z));
      }
      sinewList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sinewPts), 32, 0.018, 6, false));
    }

    // --- Aortic Arch Vessels (Arteria Mycelia & Vena Metabolica) ---
    // Primary Aortic Arch: Sweeping out of the top of the fermenter [25.0, 0.0, 3.56]
    // ascending gracefully to [24.1, 0.25, 4.35] and merging into overhead vascular biopipes
    const aortaPoints = [
      new THREE.Vector3(hX, hY, 3.56),
      new THREE.Vector3(hX - 0.22, hY + 0.15, 3.92),
      new THREE.Vector3(hX - 0.65, hY + 0.28, 4.25),
      new THREE.Vector3(hX - 1.35, hY + 0.35, 4.38),
      new THREE.Vector3(hX - 2.15, hY + 0.40, 4.35)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(aortaPoints), 28, 0.058, 8, false));

    // Venous Return Conduit: Looping from secondary port down along lateral flank
    const venousPoints = [
      new THREE.Vector3(hX + 0.55, hY + 0.22, 3.52),
      new THREE.Vector3(hX + 0.95, hY + 0.32, 3.25),
      new THREE.Vector3(hX + 1.12, hY + 0.12, 2.45),
      new THREE.Vector3(hX + 0.92, hY - 0.12, 1.75),
      new THREE.Vector3(hX + 0.48, hY - 0.22, 1.35)
    ];
    aorticList.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(venousPoints), 28, 0.046, 8, false));

    return {
      sinewGeo: mergeGeometriesFast(sinewList),
      aorticGeo: mergeGeometriesFast(aorticList)
    };
  }, []);

  useFrame(() => {
    const p = progressRef ? progressRef.current : 0;
    if (groupRef.current) {
      groupRef.current.visible = p >= 0.72;
    }
  });

  return (
    <group ref={groupRef} name="ORGANIC_HEART_REACTOR" visible={false}>
      <mesh geometry={batched.sinewGeo} material={heartSinewMat} />
      <mesh geometry={batched.aorticGeo} material={aorticVesselMat} />
    </group>
  );
}
