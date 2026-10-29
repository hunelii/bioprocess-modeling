import React, { useEffect, useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { cameraAt, scene01CameraProgress, revealAt, clamp01 } from '../data/camera.js';
import SporeReveal from './SporeReveal.jsx';
import { applyPetriMaterials, PetriLight, smooth } from './PetriLookdev.jsx';
import { IsolationSelection } from './IsolationSelection.jsx';
import { CultureExpansion, updateExpansionBiomass } from './CultureExpansion.jsx';
import { ControlledIncubation, updateIncubationBiomass } from './ControlledIncubation.jsx';
import { LivingNetwork } from './LivingNetwork.jsx';
import { FruitingAtmosphere, updateFruitingDevelopment } from './FruitingDevelopment.jsx';
import { LookdevLocalLights, DetailedOysterMushrooms, upgradeFactoryMaterials } from './CinematicLookdev.jsx';
import EFGDetailPass from './EFGDetailPass.jsx';
import HighFidelityFactoryPass from './HighFidelityFactoryPass.jsx';
import { mergeGeometriesFast } from '../data/gpuOptimize.js';

// Use the lightweight untextured GLB (3.42 MB, 0 PNG textures) and batch all 480 static meshes by material
// into ~14 GPU draw calls at startup while preserving original bench/table colors via upgradeFactoryMaterials.
const WORLD_FILE = `${import.meta.env.BASE_URL}assets/huner-living-factory.glb`;
const UP = new THREE.Vector3(0, 0, 1);
const LOOK_AT = new THREE.Vector3();
const CAMERA_CONFIG = { position: [1.18, -1.55, 1.72], fov: 32, near: 0.015, far: 160, up: [0, 0, 1] };
const GL_CONFIG = { alpha: false, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false };

function World({ progressRef, registerInvalidate, detail, onReady }) {
  const { scene } = useLoader(GLTFLoader, WORLD_FILE);
  const rootScene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const lastProgress = useRef(-1);
  const lastDetail = useRef(null);

  const { world, actors } = useMemo(() => {
    const cloned = scene.clone(true);
    upgradeFactoryMaterials(cloned);
    applyPetriMaterials(cloned);
    cloned.updateMatrixWorld(true);

    const dynamicEntries = [];
    const staticByMaterial = new Map();
    const toRemove = [];

    cloned.traverse(object => {
      if (!object.isMesh) return;
      const name = object.name || '';
      object.frustumCulled = true;

      const lowPolySpore = name.startsWith('A_spore_');
      const badLegacyIsolation = name.startsWith('C_colony_');
      const isHypha = name.startsWith('B_GERMINATION_');
      const legacyMacro = name.startsWith('E_LIVING_NETWORK_');
      const legacyFruit = name.startsWith('F_PLEUROTUS_');
      const legacyExpansion = /^D_(?:biomass|fungal_clump)_/.test(name);
      // Hide legacy rectangular shoebox containers & flat backing plate in Zone E so our cylindrical Airlift bioreactors,
      // orbital shaker Erlenmeyer flasks, and solid-state colonization jars replace them cleanly!
      const legacyIncubation = name.startsWith('E_colonized_material_')
        || name.startsWith('E_culture_container_')
        || name === 'E_sample_2_1_substrate_back';
      // Hide opaque G_reactor_shell & fake porthole disc so the detailed glass fermenter interior is 100% visible
      const legacyFerment = name.startsWith('G_suspended_biomass')
        || name === 'G_reactor_shell'
        || name === 'G_observation_liquid'
        || name.startsWith('G_observation_porthole_')
        || name.startsWith('G_VISUAL_IMPELLER_TRACE_');
      // Hide legacy digital displays in Zone H so the Kara Tahta (chalkboard) & desk props (microscope, post-its, pens) take center stage
      const legacyZoneHScreen = name.startsWith('H_display_')
        || name.startsWith('H_illustrative_curve_')
        || name.startsWith('H_GRAPH_TRACE_')
        || name.startsWith('H_status_base_');

      if (lowPolySpore || badLegacyIsolation || isHypha || legacyMacro || legacyFruit || legacyExpansion || legacyIncubation || legacyFerment || legacyZoneHScreen) {
        object.visible = false;
        toRemove.push(object);
        return;
      }

      const start = revealAt(name);
      const isContainer = name === 'A_cylindrical_observation_shell';
      if (start > 0 || isContainer) {
        dynamicEntries.push({ object, start });
      } else {
        // Batch all 480 static GLB meshes by material into ~14 combined meshes (cutting ~466 draw calls & ~1,200 scene nodes!)
        const mat = object.material;
        if (mat && object.geometry) {
          const g = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
          if (!g.attributes.normal) g.computeVertexNormals();
          g.applyMatrix4(object.matrixWorld);
          let bucket = staticByMaterial.get(mat);
          if (!bucket) {
            bucket = [];
            staticByMaterial.set(mat, bucket);
          }
          bucket.push(g);
          toRemove.push(object);
        }
      }
    });

    for (const obj of toRemove) {
      if (obj.parent) obj.parent.remove(obj);
    }

    for (const [mat, geos] of staticByMaterial.entries()) {
      const mergedGeo = mergeGeometriesFast(geos);
      const batchedMesh = new THREE.Mesh(mergedGeo, mat);
      batchedMesh.matrixAutoUpdate = false;
      batchedMesh.frustumCulled = false;
      cloned.add(batchedMesh);
    }

    cloned.updateMatrixWorld(true);
    return { world: cloned, actors: dynamicEntries };
  }, [scene]);

  useEffect(() => {
    camera.up.copy(UP);
    camera.near = 0.015;
    camera.far = 160;
    camera.updateProjectionMatrix();

    // Pre-compile every shader & upload every VBO to GPU once at startup (including initially-hidden station groups)
    // so scrolling across station boundaries never triggers a first-time shader compile hitch!
    const hiddenObjects = [];
    rootScene.traverse(obj => {
      if (!obj.visible) {
        hiddenObjects.push(obj);
        obj.visible = true;
      }
    });
    gl.compile(rootScene, camera);
    for (const obj of hiddenObjects) {
      obj.visible = false;
    }

    lastProgress.current = -1;
    registerInvalidate.current = invalidate;
    invalidate();
    onReady();
    return () => {
      if (registerInvalidate.current === invalidate) registerInvalidate.current = null;
    };
  }, [world, rootScene, gl, camera, invalidate, registerInvalidate, onReady]);

  useEffect(() => {
    lastDetail.current = null;
    invalidate();
  }, [detail, invalidate]);

  useFrame(() => {
    const p = clamp01(progressRef.current);
    const point = cameraAt(scene01CameraProgress(p));
    camera.position.set(...point.position);
    LOOK_AT.set(...point.target);
    camera.lookAt(LOOK_AT);
    if (Math.abs(camera.fov - point.fov) > 0.005) {
      camera.fov = point.fov;
      camera.updateProjectionMatrix();
    }
    if (Math.abs(p - lastProgress.current) < 0.00005 && lastDetail.current === detail) return;
    lastProgress.current = p;
    lastDetail.current = detail;

    const cutaway = p < 0.06;
    for (const { object, start } of actors) {
      const isContainer = object.name === 'A_cylindrical_observation_shell';
      const lowPolySpore = object.name.startsWith('A_spore_');
      const badLegacyIsolation = object.name.startsWith('C_colony_');
      const isHypha = object.name.startsWith('B_GERMINATION_');
      const legacyMacro = object.name.startsWith('E_LIVING_NETWORK_');
      const growth = isHypha ? smooth(start, start + .0052, p) : 1;
      object.visible = (isHypha ? growth > .002 : p + .00005 >= start)
        && !(cutaway && isContainer) && !lowPolySpore && !badLegacyIsolation && !legacyMacro
        && (detail || !object.name.includes('GILL'));
    }
    updateExpansionBiomass(actors,p);
    updateIncubationBiomass(actors,p);
    updateFruitingDevelopment(actors,p);
    // Runtime-only override; do not alter the immutable source GLB.
    for(const {object} of actors) if(object.name.startsWith("F_PLEUROTUS_")) object.visible=false;
  });

  return (
    <>
      <primitive object={world} dispose={null} />
      <HighFidelityFactoryPass progressRef={progressRef} />
      <PetriLight progressRef={progressRef}/>
      <IsolationSelection progressRef={progressRef}/>
      <CultureExpansion progressRef={progressRef}/>
      <ControlledIncubation progressRef={progressRef}/>
      <LivingNetwork progressRef={progressRef}/>
      <FruitingAtmosphere progressRef={progressRef}/>
      <DetailedOysterMushrooms progressRef={progressRef}/>
      <EFGDetailPass progressRef={progressRef}/>
    </>
  );
}

function PanoramaEnvironment() {
  const env = useLoader(THREE.TextureLoader, `${import.meta.env.BASE_URL}assets/master00-env.png`);
  const root = useThree(state => state.scene);
  useEffect(() => {
    env.mapping = THREE.EquirectangularReflectionMapping;
    const prior = root.environment;
    root.environment = env;
    root.environmentIntensity = 0.55;
    return () => { root.environment = prior; };
  }, [env, root]);
  return null;
}

function CinematicLightRig({ progressRef }) {
  const ambient = useRef();
  const key = useRef();
  const rim = useRef();
  const stationKey = useRef();
  const stationFill = useRef();
  const camera = useThree(state => state.camera);
  useEffect(() => {
    camera.up.copy(UP);
    const point = cameraAt(scene01CameraProgress(clamp01(progressRef.current)));
    camera.position.set(...point.position);
    LOOK_AT.set(...point.target);
    camera.lookAt(LOOK_AT);
    camera.fov = point.fov;
    camera.updateProjectionMatrix();
  }, [camera, progressRef]);
  useFrame(() => {
    const p = clamp01(progressRef.current);
    const t = Math.max(0, Math.min(1, (p - .058) / .052));
    const f = t * t * (3 - 2 * t);
    if (ambient.current) ambient.current.intensity = .34 + .22 * f;
    if (key.current) key.current.intensity = .58 + .55 * f;
    if (rim.current) rim.current.intensity = .28 + .32 * f;

    // 2 Permanently-Visible Follower Point Lights (NUM_POINT_LIGHTS is permanently 2 -> ZERO shader recompilations ever!)
    if (stationKey.current && stationFill.current) {
      if (p < 0.105) {
        // Scene 01: Spore Birth Key & Warm Rim
        stationKey.current.position.set(0.78, -0.55, 2.85);
        stationKey.current.color.setHex(0xa8f0c0);
        stationKey.current.intensity = 2.2;
        stationKey.current.distance = 4.5;
        stationFill.current.position.set(1.45, -0.35, 1.15);
        stationFill.current.color.setHex(0xffe5a8);
        stationFill.current.intensity = 0.95;
        stationFill.current.distance = 2.8;
      } else if (p < 0.235) {
        // Scene 02-03: Petri Dish Key
        stationKey.current.position.set(4.15, -0.95, 2.75);
        stationKey.current.color.setHex(0xfff4e0);
        stationKey.current.intensity = 1.35;
        stationKey.current.distance = 4.8;
        stationFill.current.position.set(4.65, 0.35, 1.95);
        stationFill.current.color.setHex(0xc8f0d8);
        stationFill.current.intensity = 0.55;
        stationFill.current.distance = 3.5;
      } else if (p < 0.415) {
        // Scene 04-05: Isolation Selection & Culture Expansion
        const xFollow = 7.45 + Math.max(0, (p - 0.33) / 0.08) * 3.5;
        stationKey.current.position.set(xFollow, -0.65, 2.45);
        stationKey.current.color.setHex(0xfff5e2);
        stationKey.current.intensity = 1.25;
        stationKey.current.distance = 5.2;
        stationFill.current.position.set(xFollow + 0.8, 0.55, 1.85);
        stationFill.current.color.setHex(0xb8ebd0);
        stationFill.current.intensity = 0.65;
        stationFill.current.distance = 4.5;
      } else if (p < 0.675) {
        // Scene 06-07: Controlled Incubation & Bottom Oxygen Sparger Glow
        stationKey.current.position.set(15.49, -1.25, 2.78);
        stationKey.current.color.setHex(0xfff3de);
        stationKey.current.intensity = 1.55;
        stationKey.current.distance = 7.5;
        stationFill.current.position.set(15.32, -0.35, 1.35);
        stationFill.current.color.setHex(0x8ef2c0);
        stationFill.current.intensity = 1.35;
        stationFill.current.distance = 5.5;
      } else if (p < 0.815) {
        // Scene 08: Zone F Fruiting Body Warm Botanical Key & Under-Gill Fill
        stationKey.current.position.set(19.85, -1.95, 3.35);
        stationKey.current.color.setHex(0xfff2dc);
        stationKey.current.intensity = 2.15;
        stationKey.current.distance = 8.5;
        stationFill.current.position.set(20.05, -1.15, 1.55);
        stationFill.current.color.setHex(0xffe6c4);
        stationFill.current.intensity = 1.35;
        stationFill.current.distance = 6.5;
      } else {
        // Scene 09-10: Zone G Fermenter Core Glow & Zone H Chalkboard/Desk Study Lamp
        stationKey.current.position.set(25.0, -0.85, 2.45);
        stationKey.current.color.setHex(0xffdfa8);
        stationKey.current.intensity = 2.10;
        stationKey.current.distance = 6.5;
        stationFill.current.position.set(30.10, -0.65, 2.85);
        stationFill.current.color.setHex(0xfff3dc);
        stationFill.current.intensity = 1.55;
        stationFill.current.distance = 7.5;
      }
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={.36} color="#d4ded6" />
      <hemisphereLight args={['#dce6de', '#141f19', 0.38]} />
      <directionalLight ref={key} position={[8, -11, 16]} intensity={.65} color="#f7ecda" />
      <directionalLight ref={rim} position={[26, 5, 11]} intensity={.32} color="#9bc4ab" />
      <pointLight ref={stationKey} position={[0.78, -0.55, 2.85]} color="#a8f0c0" intensity={2.2} distance={4.5} decay={2} />
      <pointLight ref={stationFill} position={[1.45, -0.35, 1.15]} color="#ffe5a8" intensity={0.95} distance={2.8} decay={2} />
    </>
  );
}

const FactoryScene = React.memo(function FactoryScene({ progressRef, registerInvalidate, detail, onReady, onFailure }) {
  const onCreated = useMemo(() => ({ gl }) => {
    gl.setClearColor('#07120d');
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.96;
    const canvas = gl.domElement;
    const onLost = (event) => { event.preventDefault(); onFailure('WebGL context lost'); };
    canvas.addEventListener('webglcontextlost', onLost, { once: true });
    if (gl.getContext().isContextLost()) onFailure('WebGL context unavailable');
  }, [onFailure]);

  return (
    <Canvas
      aria-label="Interactive 3D visualization of the living biofoundry"
      fallback={<span className="sr-only">3D graphics unavailable. The illustrated experience remains accessible.</span>}
      frameloop="demand"
      dpr={1}
      camera={CAMERA_CONFIG}
      gl={GL_CONFIG}
      onCreated={onCreated}
    >
      <color attach="background" args={['#07120d']} />
      <fog attach="fog" args={['#07120d', 18, 86]} />
      <CinematicLightRig progressRef={progressRef} />
      <LookdevLocalLights />
      <SporeReveal progressRef={progressRef}/>
      <Suspense fallback={null}><PanoramaEnvironment /></Suspense>
      <Suspense fallback={null}>
        <World progressRef={progressRef} registerInvalidate={registerInvalidate} detail={detail} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
});

export default FactoryScene;
