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
  const key = useRef(null);
  const fillRef = useRef(null);
  const rimRef = useRef(null);

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8f9c95', metalness: 0.74, roughness: 0.32, envMapIntensity: 0.75
  }), []);

  const growLightDiffuserMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff3de',
    emissive: '#ffdfad',
    emissiveIntensity: 0.55,
    roughness: 0.25
  }), []);

  const batched = useMemo(() => {
    const steelGeos = [
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 14), [18.30, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 2.72, 14), [21.70, -1.25, 1.88], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.052, 0.052, 3.45, 14), [20.0, -1.25, 3.22], [0, 0, Math.PI / 2])
    ];
    const diffuserGeos = [];
    // Overhead shelf grow-light housings above each of the 3 fruiting tiers
    for (const zBar of [1.46, 2.26, 3.04]) {
      steelGeos.push(transformGeo(new THREE.BoxGeometry(2.85, 0.09, 0.032), [20.0, -0.05, zBar]));
      diffuserGeos.push(transformGeo(new THREE.BoxGeometry(2.76, 0.055, 0.012), [20.0, -0.05, zBar - 0.018]));
    }
    return {
      steelGeo: mergeGeometriesFast(steelGeos),
      diffuserGeo: mergeGeometriesFast(diffuserGeos)
    };
  }, []);

  useFrame(() => {
    const p = progressRef.current;
    const active = p >= 0.64;
    if (groupRef.current) groupRef.current.visible = active;
    const lightActive = p >= 0.66 && p <= 0.84;
    const a = lightActive ? fruitEase(.680, .728, p) * (1 - 0.35 * fruitEase(.790, .835, p)) : 0;

    if (key.current) {
      key.current.visible = lightActive;
      if (lightActive) key.current.intensity = 0.55 + 1.75 * a;
    }
    if (fillRef.current) {
      fillRef.current.visible = lightActive;
      if (lightActive) fillRef.current.intensity = 0.35 + 1.15 * a;
    }
    if (rimRef.current) {
      rimRef.current.visible = lightActive;
      if (lightActive) rimRef.current.intensity = 0.30 + 1.05 * a;
    }
  });

  return (
    <group ref={groupRef} name="ZONE_F_CHAMBER_ATMOSPHERE_AND_LIGHTING" visible={false}>
      {/* 1. Warm Botanical Key Light sculpting the upper oyster mushroom caps */}
      <pointLight ref={key} position={[19.85, -1.95, 3.35]} color="#fff2dc" intensity={0.55} distance={7.5} decay={2} />
      {/* 2. Warm Lower-Shelf Fill Light revealing the decurrent radial gills underneath the caps */}
      <pointLight ref={fillRef} position={[20.05, -1.25, 1.52]} color="#ffe6c4" intensity={0.35} distance={5.8} decay={2} />
      {/* 3. Cool Botanical Rim Backlight separating the translucent fan margins from the rear rack */}
      <pointLight ref={rimRef} position={[20.0, 1.28, 2.45]} color="#b4f0cf" intensity={0.30} distance={6.2} decay={2} />

      <mesh geometry={batched.steelGeo} material={steelMat} />
      <mesh geometry={batched.diffuserGeo} material={growLightDiffuserMat} />
    </group>
  );
}
