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

// Use the original textured GLB so all lab benches, worktops, and consoles have their original textured surfaces,
// while pre-initializing all GPU textures once at startup so zero textures upload mid-scroll.
const WORLD_FILE = `${import.meta.env.BASE_URL}assets/huner-living-factory-textured.glb`;
const UP = new THREE.Vector3(0, 0, 1);
const LOOK_AT = new THREE.Vector3();
const CAMERA_CONFIG = { position: [1.18, -1.55, 1.72], fov: 32, near: 0.015, far: 160, up: [0, 0, 1] };
const GL_CONFIG = { alpha: false, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false };

function World({ progressRef, registerInvalidate, detail, onReady }) {
  const { scene } = useLoader(GLTFLoader, WORLD_FILE);
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const lastProgress = useRef(-1);
  const lastDetail = useRef(null);

  const world = useMemo(() => {
    const cloned = scene.clone(true);
    upgradeFactoryMaterials(cloned);
    return cloned;
  }, [scene]);
  useMemo(() => applyPetriMaterials(world), [world]);

  // Pre-filter the 1,214 GLB meshes once at startup:
  // Freeze matrices on static architecture, permanently hide legacy blockout biology & opaque fermenter/screen blockers,
  // and keep only the truly dynamic meshes in `actors` so useFrame takes < 0.02ms.
  const actors = useMemo(() => {
    const dynamicEntries = [];
    world.traverse(object => {
      if (!object.isMesh) return;
      const name = object.name || '';
      object.frustumCulled = true;

      const lowPolySpore = name.startsWith('A_spore_');
      const badLegacyIsolation = name.startsWith('C_colony_');
      const isHypha = name.startsWith('B_GERMINATION_');
      const legacyMacro = name.startsWith('E_LIVING_NETWORK_');
      const legacyFruit = name.startsWith('F_PLEUROTUS_');
      const legacyExpansion = /^D_(?:biomass|fungal_clump)_/.test(name);
      const legacyIncubation = name.startsWith('E_colonized_material_');
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
        object.matrixAutoUpdate = false;
        object.updateMatrix();
        return;
      }

      const start = revealAt(name);
      const isContainer = name === 'A_cylindrical_observation_shell';
      if (start > 0 || isContainer) {
        dynamicEntries.push({ object, start });
      } else {
        object.visible = true;
        object.matrixAutoUpdate = false;
        object.updateMatrix();
      }
    });
    world.updateMatrixWorld(true);
    return dynamicEntries;
  }, [world]);

  useEffect(() => {
    // Pre-upload all unique textures to GPU VRAM once before scrolling starts so mid-scroll texture stalls never occur
    const uploaded = new Set();
    world.traverse(obj => {
      if (!obj.isMesh || !obj.visible || !obj.material) return;
      const mat = obj.material;
      for (const key of ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap']) {
        const tex = mat[key];
        if (tex && !uploaded.has(tex)) {
          uploaded.add(tex);
          gl.initTexture(tex);
        }
      }
    });

    camera.up.copy(UP);
    camera.near = 0.015;
    camera.far = 160;
    camera.updateProjectionMatrix();
    lastProgress.current = -1;
    registerInvalidate.current = invalidate;
    invalidate();
    onReady();
    return () => {
      if (registerInvalidate.current === invalidate) registerInvalidate.current = null;
    };
  }, [world, gl, camera, invalidate, registerInvalidate, onReady]);

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
      <SporeReveal progressRef={progressRef}/>
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
  useFrame(() => {
    const p = clamp01(progressRef.current);
    const t = Math.max(0, Math.min(1, (p - .058) / .052));
    const f = t * t * (3 - 2 * t);
    if (ambient.current) ambient.current.intensity = .34 + .22 * f;
    if (key.current) key.current.intensity = .58 + .55 * f;
    if (rim.current) rim.current.intensity = .28 + .32 * f;
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={.36} color="#d4ded6" />
      <hemisphereLight args={['#dce6de', '#141f19', 0.38]} />
      <directionalLight ref={key} position={[8, -11, 16]} intensity={.65} color="#f7ecda" />
      <directionalLight ref={rim} position={[26, 5, 11]} intensity={.32} color="#9bc4ab" />
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
      dpr={detail ? 1.25 : 1}
      camera={CAMERA_CONFIG}
      gl={GL_CONFIG}
      onCreated={onCreated}
    >
      <color attach="background" args={['#07120d']} />
      <fog attach="fog" args={['#07120d', 18, 86]} />
      <CinematicLightRig progressRef={progressRef} />
      <LookdevLocalLights />
      <Suspense fallback={null}><PanoramaEnvironment /></Suspense>
      <Suspense fallback={null}>
        <World progressRef={progressRef} registerInvalidate={registerInvalidate} detail={detail} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
});

export default FactoryScene;
