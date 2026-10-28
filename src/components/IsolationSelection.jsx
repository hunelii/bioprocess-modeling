import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { myceliumVertexShader, myceliumFragmentShader, buildTapered3DRhizomorphs } from './PetriLookdev.jsx';

// Locked glTF stations: C_Petri_0 (6.89,-.20,1.285) and C_Petri_1 (8.06,-.20,1.285).
// Features a single continuous, unbreakable Microbiological Inoculation Loop (Aşılama Özesi) along its local Y axis.
export const SOURCE_PLATE = [6.89,-.20,1.285];
export const ISOLATE_PLATE = [8.06,-.20,1.285];
const eased = (a,b,p) => {const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
const lerp = (a,b,t)=>a+(b-a)*t;

export function IsolationSelection({ progressRef }) {
  const sourceGroupRef = useRef();
  const isolateGroupRef = useRef();
  const sourceRhizoRef = useRef();
  const isolateRhizoRef = useRef();
  const transfer = useRef();
  const loopToolRef = useRef();
  const loopSampleRef = useRef();
  const light = useRef();

  const sourceColonyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 }, uSeed: { value: 2.71 } },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const isolateColonyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 }, uSeed: { value: 4.18 } },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const sourceRhizoGeo = useMemo(() => buildTapered3DRhizomorphs(0.038, 44, 71201), []);
  const isolateRhizoGeo = useMemo(() => buildTapered3DRhizomorphs(0.032, 40, 89314), []);

  const hyphaMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7f6ed',
    roughness: 0.72,
    metalness: 0.0
  }), []);

  const glassMat = useMemo(() => createFastGlassMaterial({
    color: '#dceee4', opacity: 0.34, roughness: 0.08, envMapIntensity: 0.85, side: THREE.DoubleSide
  }), []);

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a8b6af', metalness: 0.85, roughness: 0.20, envMapIntensity: 0.90
  }), []);

  const brassChuckMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4b26a', metalness: 0.84, roughness: 0.22
  }), []);

  const handleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#22527a', metalness: 0.48, roughness: 0.34
  }), []);

  const gripMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#181e22', metalness: 0.15, roughness: 0.80
  }), []);

  // Build Petri dishes + One-Piece Collinear Microbiological Inoculation Loop (Aşılama Özesi)
  const batchedHardware = useMemo(() => {
    const glassList = [];
    const steelList = [];
    const coreList = [];

    for (const [px, py, pz] of [SOURCE_PLATE, ISOLATE_PLATE]) {
      glassList.push(transformGeo(new THREE.CylinderGeometry(0.0465, 0.046, 0.014, 36, 1, true), [px, py, pz + 0.005], [Math.PI / 2, 0, 0]));
      glassList.push(transformGeo(new THREE.TorusGeometry(0.0462, 0.0012, 8, 36), [px, py, pz + 0.012]));
      steelList.push(transformGeo(new THREE.CylinderGeometry(0.056, 0.062, 0.014, 28), [px, py, pz - 0.016], [Math.PI / 2, 0, 0]));
      // Place inoculum core directly on the agar surface (z = 1.2892) at exact plate center [px, py]
      coreList.push(transformGeo(new THREE.CylinderGeometry(0.0028, 0.0032, 0.0018, 12), [px, py, pz + 0.0042], [Math.PI / 2, 0, 0]));
    }

    // Inoculation Loop (Öze) built strictly along local +Y axis (0, y, 0) from y=0 (loop tip) to y=0.36m (handle end):
    // Since Three.js CylinderGeometry is natively aligned along the Y axis, building along (0, y, 0) guarantees
    // every segment is 100% coaxial and overlapping with zero gaps at any camera zoom!
    const wireLoopGeo = mergeGeometriesFast([
      // 1. Closed circular platinum/nichrome loop ring (radius 0.0085m, centered at y=0.0085 so bottom touches 0,0,0 and top is at y=0.0170)
      transformGeo(new THREE.TorusGeometry(0.0085, 0.00125, 12, 32), [0, 0.0085, 0], [0.25, 0, 0]),
      // 2. Reinforced weld bead where the circular loop joins the straight wire stem at y=0.0170
      transformGeo(new THREE.SphereGeometry(0.0016, 10, 8), [0, 0.0170, 0]),
      // 3. Continuous straight nichrome wire shaft from y=0.0162 to y=0.1060 (length 0.0898m, center y=0.0611)
      transformGeo(new THREE.CylinderGeometry(0.00135, 0.00115, 0.0898, 12), [0, 0.0611, 0])
    ]);

    const brassChuckGeo = mergeGeometriesFast([
      // 4. Tapered brass collet chuck clamping the wire (y=0.1040 to y=0.1220, length 0.018m, center y=0.1130)
      transformGeo(new THREE.CylinderGeometry(0.0046, 0.0018, 0.018, 16), [0, 0.1130, 0]),
      // 5. Knurled brass locking collar (y=0.1210 to y=0.1370, length 0.016m, center y=0.1290)
      transformGeo(new THREE.CylinderGeometry(0.0054, 0.0054, 0.016, 16), [0, 0.1290, 0])
    ]);

    const rubberGripGeo = mergeGeometriesFast([
      // 6. Ergonomic ribbed rubber finger grip sleeve (y=0.1360 to y=0.2060, length 0.070m, center y=0.1710)
      transformGeo(new THREE.CylinderGeometry(0.0064, 0.0064, 0.070, 16), [0, 0.1710, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.148, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.163, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.178, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.193, 0], [Math.PI / 2, 0, 0])
    ]);

    const handleShaftGeo = mergeGeometriesFast([
      // 7. Anodized laboratory handle shaft (y=0.2050 to y=0.3650, length 0.160m, center y=0.2850)
      transformGeo(new THREE.CylinderGeometry(0.0056, 0.0056, 0.160, 16), [0, 0.2850, 0]),
      // 8. Rounded handle end cap at y=0.3650
      transformGeo(new THREE.SphereGeometry(0.0056, 12, 10), [0, 0.3650, 0])
    ]);

    return {
      glassGeo: mergeGeometriesFast(glassList),
      steelGeo: mergeGeometriesFast(steelList),
      coreGeo: mergeGeometriesFast(coreList),
      wireLoopGeo,
      brassChuckGeo,
      handleShaftGeo,
      rubberGripGeo
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const activeGlow = eased(.240, .272, p) * (1 - eased(.33, .36, p));
    if (light.current) {
      light.current.visible = activeGlow > 0.01;
      if (light.current.visible) light.current.intensity = 0.25 + 0.95 * activeGlow;
    }

    const inZoneC = (p >= 0.20 && p <= 0.40) || p > 0.92;
    const sourceReveal = p > 0.92 ? 1.0 : eased(.243, .268, p);
    const selectedReveal = p > 0.92 ? 1.0 : eased(.301,.320,p);

    const showSource = inZoneC && sourceReveal > 0.005;
    if (sourceGroupRef.current) sourceGroupRef.current.visible = showSource;
    if (showSource) {
      sourceColonyMat.uniforms.uGrowth.value = sourceReveal;
      if (sourceRhizoRef.current) {
        const s = Math.max(0.02, sourceReveal);
        sourceRhizoRef.current.scale.set(s, s, 0.4 + 0.6 * s);
      }
    }

    const showIsolate = inZoneC && selectedReveal > 0.005;
    if (isolateGroupRef.current) isolateGroupRef.current.visible = showIsolate;
    if (showIsolate) {
      isolateColonyMat.uniforms.uGrowth.value = selectedReveal;
      if (isolateRhizoRef.current) {
        const s = Math.max(0.02, selectedReveal);
        isolateRhizoRef.current.scale.set(s, s, 0.4 + 0.6 * s);
      }
    }

    const carry = eased(.276, .304, p);
    if (transfer.current) {
      transfer.current.visible=p>=.274&&p<=.307;
      if (transfer.current.visible) {
        transfer.current.position.set(lerp(6.910, 8.060, carry), -.20, 1.292 + .082 * Math.sin(Math.PI * carry));
        transfer.current.rotation.y = .09 * Math.sin(Math.PI * carry);
      }
    }

    // Full Inoculation Loop choreography across Scene 04 (dip -> harvest & carry -> streak on isolate plate)
    if (loopToolRef.current) {
      const showLoop = p >= 0.230 && p <= 0.355;
      loopToolRef.current.visible = showLoop;
      if (showLoop) {
        const dipIn = eased(0.242, 0.268, p);
        const streakOut = eased(0.305, 0.332, p);
        let lx = 6.905, ly = -0.20, lz = 1.290, rotY = 0, rotZ = 0;

        if (p < 0.274) {
          // Hover & dip loop into leading edge of source mycelium colony on C_Petri_0
          const descend = Math.sin(dipIn * Math.PI);
          lx = 6.906 - 0.006 * dipIn;
          ly = -0.20;
          lz = 1.328 - 0.038 * descend;
          rotY = -0.10 * descend;
        } else if (p <= 0.307) {
          // Lift and carry inoculum across from Source Plate (6.89) to Isolate Plate (8.06)
          lx = lerp(6.900, 8.060, carry);
          ly = -0.20 - 0.020 * Math.sin(Math.PI * carry);
          lz = 1.290 + 0.088 * Math.sin(Math.PI * carry);
          rotY = 0.12 * Math.sin(Math.PI * carry);
        } else {
          // Touch down onto Isolate Plate center (8.06, -0.20, 1.289) and gently streak
          const liftAway = eased(0.325, 0.352, p);
          lx = 8.060 + 0.011 * Math.sin(streakOut * Math.PI * 2.0);
          ly = -0.20 + 0.007 * Math.cos(streakOut * Math.PI * 2.0);
          lz = 1.290 + 0.048 * liftAway;
          rotZ = 0.12 * Math.sin(streakOut * Math.PI);
        }
        loopToolRef.current.position.set(lx, ly, lz);
        loopToolRef.current.rotation.set(0, rotY, rotZ);

        // Show harvested white mycelial film inside the circular loop ring during pickup & transfer
        if (loopSampleRef.current) {
          loopSampleRef.current.visible = p >= 0.256 && p <= 0.315;
        }
      }
    }
  });

  return (
    <>
      <mesh geometry={batchedHardware.glassGeo} material={glassMat} />
      <mesh geometry={batchedHardware.steelGeo} material={steelMat} />
      <mesh geometry={batchedHardware.coreGeo} material={hyphaMat} />

      {/* Source Plate Radial Rhizomorphic Mycelium Colony centered directly on C_Petri_0 agar (z = 1.2890) */}
      <group ref={sourceGroupRef} position={[SOURCE_PLATE[0], SOURCE_PLATE[1], 1.2890]} visible={false}>
        <mesh scale={[0.041, 0.041, 1]} material={sourceColonyMat}>
          <circleGeometry args={[1, 36]} />
        </mesh>
        <mesh ref={sourceRhizoRef} geometry={sourceRhizoGeo} material={hyphaMat} />
      </group>

      {/* Isolate Plate Pure-Strain Mycelium Colony centered directly on C_Petri_1 agar (z = 1.2890) */}
      <group ref={isolateGroupRef} position={[ISOLATE_PLATE[0], ISOLATE_PLATE[1], 1.2890]} visible={false}>
        <mesh scale={[0.036, 0.036, 1]} material={isolateColonyMat}>
          <circleGeometry args={[1, 36]} />
        </mesh>
        <mesh ref={isolateRhizoRef} geometry={isolateRhizoGeo} material={hyphaMat} />
      </group>

      {/* Verification anchor group */}
      <group ref={transfer} visible={false} />

      {/* One-Piece Collinear Microbiological Inoculation Loop (Aşılama Özesi) */}
      <group ref={loopToolRef} visible={false}>
        {/* Tilt the entire coaxial Y-aligned tool around its tip (0,0,0) as a single rigid body */}
        <group rotation={[0.92, 0, -0.45]}>
          <mesh geometry={batchedHardware.wireLoopGeo} material={steelMat} />
          <mesh geometry={batchedHardware.brassChuckGeo} material={brassChuckMat} />
          <mesh geometry={batchedHardware.rubberGripGeo} material={gripMat} />
          <mesh geometry={batchedHardware.handleShaftGeo} material={handleMat} />
          {/* Harvested Mycelial Agar Film Held Right Inside the Circular Wire Loop Ring at (0, 0.0085, 0) */}
          <mesh ref={loopSampleRef} position={[0, 0.0085, 0]} rotation={[Math.PI / 2 + 0.25, 0, 0]}>
            <cylinderGeometry args={[0.0076, 0.0076, 0.0018, 20]} />
            <meshStandardMaterial color="#f8f6ec" emissive="#c5e8cf" emissiveIntensity={0.28} roughness={0.5} />
          </mesh>
        </group>
      </group>

      <pointLight ref={light} position={[7.45, -.55, 2.3]} color="#fff5e2" intensity={.25} distance={3.5} decay={2} />
    </>
  );
}
