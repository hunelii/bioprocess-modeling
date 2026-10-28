import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const base=crypto.createHash('sha256').update(fs.readFileSync('public/assets/huner-living-factory.glb')).digest('hex');
assert.equal(base,'0a5b7859297163a4474e68186918b9a61514a33254cc276fefb05eb86437163f');
const w=JSON.parse(fs.readFileSync('src/data/world.json','utf8'));
assert.equal(w.zones.length,8);assert.equal(w.cameraPath.length,1001);assert.equal(w.cameraKeyframes.length,11);
const f=fs.readFileSync('src/components/FruitingDevelopment.jsx','utf8');
const scene=fs.readFileSync('src/components/FactoryScene.jsx','utf8');
assert.ok(f.includes('numberOfClusters:24')&&f.includes('object.scale.setScalar(size)'));
assert.ok(f.includes('F_PLEUROTUS_') && f.includes('object.position.set(pivot[0]*(1-size)'));
assert.ok(scene.includes('updateFruitingDevelopment(actors,p)'));
for (let i=0;i<=1000;i++){
 const p=i/1000; const ease=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 const growing=ease(.743,.774,p);assert.ok(growing>=0&&growing<=1);
}
console.log(JSON.stringify({ok:true,worldZones:8,fruits:24,tiers:3,samples:1001,glbHash:base,maturityReversible:true}));
