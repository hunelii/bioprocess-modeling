import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast } from '../data/gpuOptimize.js';

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

  const mistMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#dff7ec',
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const batched = useMemo(() => {
    const steelGeos = [
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 12), [18.30, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 12), [21.70, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 3.45, 12), [20.0, -1.25, 3.22], [0, 0, Math.PI / 2])
    ];
    const diffuserGeos = [];
    const mistGeos = [];
    const nozzleCyl = new THREE.CylinderGeometry(0.012, 0.018, 0.042, 8);
    const mistCone = new THREE.ConeGeometry(0.24, 0.42, 12, 1, true);
    const subPatch = new THREE.DodecahedronGeometry(0.11, 0);

    // Overhead shelf grow-light housings + 12 Ultrasonic Humidity Mist Nozzles above each of the 3 fruiting tiers
    for (let r = 0; r < 3; r++) {
      const zBar = [1.46, 2.26, 3.04][r];
      const zTray = Z[r] - 0.055;
      steelGeos.push(transformGeo(new THREE.BoxGeometry(2.85, 0.09, 0.032), [20.0, -0.05, zBar]));
      diffuserGeos.push(transformGeo(new THREE.BoxGeometry(2.76, 0.055, 0.012), [20.0, -0.05, zBar - 0.018]));

      for (let c = 0; c < 4; c++) {
        const nx = X[c];
        const ny = Y[c];
        // Ultrasonic misting nozzle on the overhead bar
        steelGeos.push(transformGeo(nozzleCyl, [nx, -0.05, zBar - 0.035], [Math.PI / 2, 0, 0]));
        // Downward-drifting translucent humidity mist plume & spore veil
        mistGeos.push(transformGeo(mistCone, [nx, ny * 0.55, zBar - 0.24], [Math.PI / 2, 0, 0]));

        // White colonized mycelial mat & surface veins spreading across the dark substrate tray around each cluster pair
        for (const pairOff of [-0.085, 0.09]) {
          diffuserGeos.push(transformGeo(
            subPatch,
            [nx + pairOff, ny + (pairOff < 0 ? 0.055 : -0.07), zTray - 0.008],
            [0, 0, c * 0.7 + r],
            [1.45, 1.15, 0.14]
          ));
        }
      }
    }
    return {
      steelGeo: mergeGeometriesFast(steelGeos),
      diffuserGeo: mergeGeometriesFast(diffuserGeos),
      mistGeo: mergeGeometriesFast(mistGeos)
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const active = p >= 0.64;
    if (groupRef.current) groupRef.current.visible = active;
    if (active && mistRef.current) {
      mistRef.current.position.z = -((p * 8.0) % 0.035);
    }
  });

  return (
    <group ref={groupRef} name="ZONE_F_CHAMBER_ATMOSPHERE_AND_LIGHTING" visible={false}>
      <mesh geometry={batched.steelGeo} material={steelMat} />
      <mesh geometry={batched.diffuserGeo} material={growLightDiffuserMat} />
      <mesh ref={mistRef} geometry={batched.mistGeo} material={mistMat} />
    </group>
  );
}
