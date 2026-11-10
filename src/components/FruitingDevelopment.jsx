import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';
import {
  botanicalFoliageVertexShader,
  botanicalFoliageFragmentShader,
  populateBotanicalGardenCluster,
  populateCreepingBotanicalVine
} from './LivingBiosphereArchitecture.jsx';

// All 24 fruiting positions and five anatomical parts already exist in the immutable GLB.
// Botanical 3-point lighting rig (Warm Key + Shelf Under-Gill Fill + Cool Rim Backlight) for Zone F fruiting bodies.
export const FRUITING_REFERENCE = Object.freeze({
  zone: 'F', worldX: [18,22], numberOfClusters:24,
  substrateTrays: ['F_substrate_tray_0','F_substrate_tray_1','F_substrate_tray_2'],
  progress: [0.700,0.785]
});
export function fruitEase(a,b,p){
  const t=THREE.MathUtils.clamp((p-a)/(b-a),0,1);
  return t*t*(3-2*t);
}
const X=[18.84,19.60,20.42,21.13];
const Y=[.53,-.24,.53,-.24];
const Z=[1.168,1.978,2.738];
export function fruitState(p, row, col, pair){
  const stagger=(col*.0018+row*.0023+pair*.0012);
  const prim=fruitEase(.702+stagger,.729+stagger,p);
  const young=fruitEase(.722+stagger,.755+stagger,p);
  const mature=fruitEase(.743+stagger,.774+stagger,p);
  return {prim,young,mature};
}
export function updateFruitingDevelopment(actors,p){
  for(const {object} of actors){
    const match=/^F_PLEUROTUS_(\d)_(\d)_(\d)_(PRIMORDIUM|LATERAL_STEM|CAP|UNDER|GILLS)$/.exec(object.name||'');
    if(!match)continue;
    const row=+match[1],col=+match[2],pair=+match[3],kind=match[4];
    const {prim,young,mature}=fruitState(p,row,col,pair);
    const x=X[col],y=Y[col],z=Z[row]-.022;
    let size=0;
    if(kind==='PRIMORDIUM'){
      size=Math.max(.001,prim*(1-fruitEase(.743,.765,p)));
    } else if(kind==='LATERAL_STEM') {
      size=.001+young*.999;
    } else if(kind==='CAP'||kind==='UNDER'){
      size=.001+Math.pow(mature,.75)*.999;
    } else if(kind==='GILLS'){
      size=.001+fruitEase(.748,.778,p)*mature*.999;
    }
    const pivot=object.userData.fruitBasePivot || (object.userData.fruitBasePivot=[x,y,z]);
    object.scale.setScalar(size);
    object.position.set(pivot[0]*(1-size),pivot[1]*(1-size),pivot[2]*(1-size));
    object.visible=size>.015 && (kind==='PRIMORDIUM' ? p<.764 : true);
  }
}

export function FruitingAtmosphere({ progressRef }) {
  const groupRef = useRef();
  const mistRef = useRef();

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const growLightDiffuserMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff3de',
    emissive: '#ffdfad',
    emissiveIntensity: 0.65,
    roughness: 0.25
  }), []);

  const trayDarkBotanicalMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0042 },
      uDeepChlorophyll: { value: new THREE.Color('#13361b') },
      uMidLeafColor: { value: new THREE.Color('#276131') },
      uSubsurfaceGlow: { value: new THREE.Color('#6dd95b') },
      uVeinColor: { value: new THREE.Color('#8ff578') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const trayBrightBotanicalMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSwayAmp: { value: 0.0062 },
      uDeepChlorophyll: { value: new THREE.Color('#1d4b23') },
      uMidLeafColor: { value: new THREE.Color('#3c8a3b') },
      uSubsurfaceGlow: { value: new THREE.Color('#a4ff6e') },
      uVeinColor: { value: new THREE.Color('#d2ff9e') }
    },
    vertexShader: botanicalFoliageVertexShader,
    fragmentShader: botanicalFoliageFragmentShader,
    side: THREE.DoubleSide
  }), []);

  const traySporophyteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c9a94b',
    emissive: '#4d3a08',
    emissiveIntensity: 0.28,
    roughness: 0.45,
    metalness: 0.12
  }), []);

  const batched = useMemo(() => {
    const steelGeos = [
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 12), [18.30, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 12), [21.70, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 3.45, 12), [20.0, -1.25, 3.22], [0, 0, Math.PI / 2])
    ];
    const diffuserGeos = [];
    const darkFoliageGeos = [];
    const brightFoliageGeos = [];
    const sporophyteGeos = [];
    const nozzleCyl = new THREE.CylinderGeometry(0.012, 0.018, 0.042, 8);

    // Overhead shelf grow-light housings, LED strip bars & living biological shelf environment
    for (let r = 0; r < 3; r++) {
      const zBar = [1.46, 2.26, 3.04][r];
      const zTray = Z[r] - 0.055;
      steelGeos.push(transformGeo(new THREE.BoxGeometry(2.85, 0.09, 0.032), [20.0, -0.05, zBar]));
      diffuserGeos.push(transformGeo(new THREE.BoxGeometry(2.76, 0.055, 0.012), [20.0, -0.05, zBar - 0.018]));

      for (let c = 0; c < 4; c++) {
        const nx = X[c];
        // Ultrasonic misting nozzle on the overhead bar
        steelGeos.push(transformGeo(nozzleCyl, [nx, -0.05, zBar - 0.035], [Math.PI / 2, 0, 0]));

        // Symbiotic companion bryophyte & micro-fern cushions flanking each Pleurotus fruiting cluster
        for (let pIdx = 0; pIdx < 2; pIdx++) {
          const [pairOffX, pairOffY] = pIdx === 0 ? [-0.145, -0.16] : [0.145, 0.08];
          populateBotanicalGardenCluster({
            center: [nx + pairOffX, pairOffY, zTray - 0.002],
            scale: 1.55,
            seed: 910 + r * 31 + c * 11 + pIdx * 5,
            darkFoliageList: darkFoliageGeos,
            brightFoliageList: brightFoliageGeos,
            sporophyteList: sporophyteGeos,
            includeFerns: true,
            includeBroadLeaves: true,
            mossDensity: 12,
            sporophyteCount: 4
          });
        }

        // Creeping leafy botanical stolon & inter-cluster micro-garden bridging adjacent fruiting cultures
        if (c < 3) {
          const nextX = X[c + 1];
          const midX = (nx + nextX) * 0.5;
          populateBotanicalGardenCluster({
            center: [midX, -0.04, zTray - 0.003],
            scale: 1.25,
            seed: 980 + r * 23 + c * 7,
            darkFoliageList: darkFoliageGeos,
            brightFoliageList: brightFoliageGeos,
            sporophyteList: sporophyteGeos,
            includeFerns: (c + r) % 2 === 0,
            includeBroadLeaves: true,
            mossDensity: 10,
            sporophyteCount: 3
          });
          populateCreepingBotanicalVine({
            points: [
              [nx + 0.08, -0.10, zTray + 0.002],
              [midX, -0.02 + (r % 2 === 0 ? 0.06 : -0.06), zTray + 0.005],
              [nextX - 0.08, 0.05, zTray + 0.002]
            ],
            stemRadius: 0.0032,
            leafCount: 10,
            leafScale: 0.026,
            closed: false,
            darkFoliageList: darkFoliageGeos,
            brightFoliageList: brightFoliageGeos,
            sporophyteList: sporophyteGeos,
            seed: 1020 + r * 17 + c
          });
        }
      }
    }
    return {
      steelGeo: mergeGeometriesFast(steelGeos),
      diffuserGeo: mergeGeometriesFast(diffuserGeos),
      darkFoliageGeo: mergeGeometriesFast(darkFoliageGeos),
      brightFoliageGeo: mergeGeometriesFast(brightFoliageGeos),
      sporophyteGeo: mergeGeometriesFast(sporophyteGeos)
    };
  }, []);

  useFrame((state) => {
    const p = progressRef.current;
    const active = p >= 0.64;
    if (groupRef.current) groupRef.current.visible = active;
    if (active) {
      const t = state.clock.elapsedTime;
      trayDarkBotanicalMat.uniforms.uTime.value = t;
      trayBrightBotanicalMat.uniforms.uTime.value = t;
    }
  });

  return (
    <group ref={groupRef} name="ZONE_F_CHAMBER_ATMOSPHERE_AND_LIGHTING" visible={false}>
      <mesh geometry={batched.steelGeo} material={steelMat} />
      <mesh geometry={batched.diffuserGeo} material={growLightDiffuserMat} />
      <mesh geometry={batched.darkFoliageGeo} material={trayDarkBotanicalMat} />
      <mesh geometry={batched.brightFoliageGeo} material={trayBrightBotanicalMat} />
      <mesh geometry={batched.sporophyteGeo} material={traySporophyteMat} />
    </group>
  );
}
