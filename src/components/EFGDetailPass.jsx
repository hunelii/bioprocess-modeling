import React, { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

// Additive 3D overlay. Source UV-textured world and camera coordinates remain immutable.
// Stripped of heavy procedural textures and blocky F11_MUSHROOM_ / E11_BIOMASS proxies for 60fps scroll & realistic biology.
const FILE = `${import.meta.env.BASE_URL}assets/huner-efg-detail.glb`;
const smooth = (a, b, v) => { const x = Math.max(0, Math.min(1, (v - a) / (b - a))); return x * x * (3 - 2 * x); };

export default function EFGDetailPass({ progressRef }) {
  const gltf = useLoader(GLTFLoader, FILE);
  const object = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const sets = useMemo(() => {
    const staticGroups = [];
    const mushrooms = new Map();
    const cleanSteelMat = new THREE.MeshStandardMaterial({
      color: '#8d9993',
      metalness: 0.72,
      roughness: 0.36
    });
    const cleanDarkMat = new THREE.MeshStandardMaterial({
      color: '#1e2823',
      metalness: 0.55,
      roughness: 0.48
    });
    const cleanWarmMat = new THREE.MeshStandardMaterial({
      color: '#d8cbb8',
      roughness: 0.65,
      metalness: 0.1
    });

    object.traverse(child => {
      if (!child.isMesh) return;
      const name = child.name || '';
      const matName = child.material?.name || '';
      // Replace heavy textured GLB materials with lightweight untextured PBR materials to prevent GPU texture upload stalls
      if (matName.includes('STEEL')) {
        child.material = cleanSteelMat;
      } else if (matName.includes('BLACK') || matName.includes('SILICONE') || matName.includes('SUBSTRATE')) {
        child.material = cleanDarkMat;
      } else {
        child.material = cleanWarmMat;
      }

      if (name.startsWith('F11_MUSHROOM_')) {
        const match = /F11_MUSHROOM_(\d+)_/.exec(name);
        if (match) {
          const id = +match[1];
          if (!mushrooms.has(id)) mushrooms.set(id, []);
          mushrooms.get(id).push(child);
        }
        // Hide blocky F11_MUSHROOM_ meshes permanently; DetailedOysterMushrooms renders realistic Pleurotus clusters
        child.visible = false;
      } else if (name.startsWith('P11_STATIC_')) {
        if (name.includes('E11_BIOMASS') || name.includes('F11_CREAM') || name.includes('LIGHT') || name.includes('INDICATOR') || name.includes('AMBER') || name.includes('G11_BLACK')) {
          child.visible = false;
        } else {
          staticGroups.push(child);
          child.visible = true;
        }
      }
      child.frustumCulled = true;
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    });
    object.updateMatrixWorld(true);
    return { staticGroups, mushrooms: [...mushrooms.entries()].sort((a, b) => a[0] - b[0]) };
  }, [object]);

  const last = useRef(-1);
  useFrame(() => {
    const p = progressRef.current;
    if (Math.abs(p - last.current) < .0005) return;
    last.current = p;
    // Keep legacy F11_MUSHROOM_ hidden so only high-detail organic Pleurotus clusters are shown
    const sprout = smooth(.706, .732, p);
    const expand = smooth(.732, .770, p);
    void sprout;
    void expand;
  });
  return <primitive object={object} dispose={null} />;
}
