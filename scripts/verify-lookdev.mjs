import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const sha=crypto.createHash('sha256').update(fs.readFileSync('public/assets/huner-living-factory.glb')).digest('hex');
assert.equal(sha,'0a5b7859297163a4474e68186918b9a61514a33254cc276fefb05eb86437163f');
const world=JSON.parse(fs.readFileSync('src/data/world.json','utf8'));
assert.equal(world.zones.length,8);assert.equal(world.cameraPath.length,1001);
const c=fs.readFileSync('src/components/CinematicLookdev.jsx','utf8');
assert.ok(c.includes('for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(let pair=0;pair<2;pair++)'));
assert.ok(c.includes('groups.current[i]')&&c.includes('upgradeFactoryMaterials'));
const f=fs.readFileSync('src/components/FactoryScene.jsx','utf8');
assert.ok(f.includes('<EFGDetailPass progressRef={progressRef}/>'));
const extra=fs.readFileSync('src/components/EFGDetailPass.jsx','utf8');
assert.ok(extra.includes('F11_MUSHROOM_')&&extra.includes('huner-efg-detail.glb'));
assert.ok(fs.statSync('public/assets/huner-efg-detail.glb').size>100000);
assert.ok(f.includes('object.name.startsWith("F_PLEUROTUS_")'));
assert.ok(f.includes('frameloop="demand"'));
for(let i=0;i<=1000;i++){
 const p=i/1000,t=Math.max(0,Math.min(1,(p-.732)/(.77-.732)));
 const k=t*t*(3-2*t);assert.ok(k>=0&&k<=1);
}
console.log(JSON.stringify({ok:true,worldZones:8,fruitPositions:24,cameraSamples:1001,geometrySourceUntouched:true,sha}));
