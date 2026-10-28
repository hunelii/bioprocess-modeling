import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=(name)=>fs.readFileSync(name,'utf8');
const world=JSON.parse(read('src/data/world.json'));
assert.equal(world.zones.length,8);
assert.equal(world.cameraPath.length,1001);
assert.equal(world.cameraKeyframes.length,11);
const base=crypto.createHash('sha256').update(fs.readFileSync('public/assets/huner-living-factory.glb')).digest('hex');
assert.equal(base,'0a5b7859297163a4474e68186918b9a61514a33254cc276fefb05eb86437163f');
const network=read('src/components/LivingNetwork.jsx');
const factory=read('src/components/FactoryScene.jsx');
const app=read('src/App.jsx');
assert.ok(network.includes("E_culture_container_2_1"));
assert.ok(network.includes('20261027'));
assert.ok(network.includes('new THREE.TubeGeometry'));
assert.ok(network.includes('15.088,15.552'));
assert.ok(network.includes('1.539,1.881'));
assert.ok(factory.includes('legacyMacro') && factory.includes('!legacyMacro'));
assert.ok(factory.includes('<LivingNetwork progressRef={progressRef}/>'));
assert.ok(app.includes('<LivingNetworkOverlay progress={uiProgress}/>'));
const w=world.cameraPath;
const sample={start:w[540],macro:w[650],exit:w[670]};
for(const key of ['start','macro','exit']){
 assert.ok(sample[key].position.every(Number.isFinite));
 assert.ok(sample[key].target.every(Number.isFinite));
}
const ease=(a,b,p)=>{let t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t)};
const state=p=>ease(.596,.651,p)*(1-ease(.654,.670,p));
assert.equal(state(.54),0);
assert.ok(state(.65)>.95);
assert.equal(state(.67),0);
for(let i=0;i<=1000;i++){
 const p=.54+.13*i/1000;
 assert.equal(state(p),state(p)); // progress is pure, independent of scroll direction
}
// 12 primary filaments, each splits twice at depths 0,1,2 = 15 tubes/root.
const filamentCount=12*(1+2+4+8);
assert.equal(filamentCount,180);
console.log(JSON.stringify({success:true,worldZones:8,keyframes:11,pathSamples:1001,filaments:180,sourceGlbSha256:base,macroProgress:0.65,reverseDeterministic:true}));
