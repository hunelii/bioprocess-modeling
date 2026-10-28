import world from './world.json';

export const CAMERA_BEATS = world.cameraBeats;
export const KEYFRAMES = world.cameraKeyframes;
export const STAGES = KEYFRAMES.slice(0,10);
export const ANIMATION_WINDOWS = world.animationWindows;
export const clamp01 = (x) => Math.max(0,Math.min(1,x));

// Camera samples are from the Phase 4 approved route; no new camera path is synthesized.
// All positions and targets use the locked-world convention +Z = up.
import {scene01CameraProgress} from './camera-timing.js';
export {scene01CameraProgress, CAMERA_TIME_KNOTS} from './camera-timing.js';

export function cameraAt(progress){
  const x=clamp01(progress)*1000;
  const i=Math.min(999,Math.floor(x));
  const t=x-i;
  const a=world.cameraPath[i];
  const b=world.cameraPath[i+1];
  const mix=(u,v)=>u+(v-u)*t;
  return {
    position:a.position.map((v,k)=>mix(v,b.position[k])),
    target:a.target.map((v,k)=>mix(v,b.target[k])),
    fov:mix(a.fov,b.fov)
  };
}

export function stageAt(progress){
  const p=clamp01(progress);
  let current=0;
  for(let i=0;i<STAGES.length;i++)if(p>=STAGES[i].progress-1.2e-4)current=i;
  return current;
}

// Deterministic reveal times, keyed to the original GLB mesh names.
// Fermentation is never fed by fruiting-body meshes.
export function revealAt(name){
  // Same permanently positioned 90 mm Petri dish (B_Petri_1), held dormant
  // until Scene 03. Progressive reveal is order-stable and reversible.
  if(name.startsWith('B_GERMINATION_')) {
    const m = /^B_GERMINATION_(HYPHA|BRANCH)_(\d+)_(\d+)$/.exec(name);
    if (!m) return .207;
    const spoke = Number(m[2]), order = Number(m[3]);
    const jitter = (spoke % 5) * .00048;
    if (m[1] === 'BRANCH') return .173 + (order - 5)*.0067 + jitter;
    return .147 + Math.max(0,order-1)*.00635 + jitter;
  }
  if(name === 'B_germinating_inoculum') return .108;
  if(name.startsWith('E_LIVING_NETWORK_')){
    const m=/(\d{4})$/.exec(name);
    return .607+(Number(m?.[1]??0)/246)*.088;
  }
  if(name.startsWith('F_PLEUROTUS_')){
    const m=/^F_PLEUROTUS_(\d)_(\d)_(\d)/.exec(name);
    const stagger=m ? (Number(m[1])+Number(m[2])+Number(m[3]))*.003 : 0;
    return (name.includes('PRIMORDIUM')?.70:name.includes('STEM')?.713:name.includes('GILL')?.76:.732)+stagger;
  }
  if(name.startsWith('G_suspended_biomass'))return .823;
  if(name.startsWith('G_VISUAL_'))return .84;
  if(name.startsWith('H_GRAPH_TRACE'))return .91;
  return 0;
}
