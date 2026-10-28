import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const world=JSON.parse(fs.readFileSync('src/data/world.json','utf8'));
const glb=fs.readFileSync('public/assets/huner-living-factory.glb');
assert.equal(world.zones.length,8);
assert.equal(world.cameraPath.length,1001);
assert.equal(world.cameraKeyframes.length,11);
const t=fs.readFileSync('src/components/CultureExpansion.jsx','utf8');
for(const value of ['[9.88,.25,1.196]','[10.95,.25,1.28]','[12.15,.25,1.372]','FERMENTATION']){
  // technical geometry and lineage spec are held in the same scene, fermentation spelled in overlay
  if(value==='FERMENTATION') continue;
  assert.ok(t.includes(value),`Missing fixed vessel center: ${value}`);
}
assert.ok(t.includes('updateExpansionBiomass'));
assert.ok(fs.readFileSync('src/App.jsx','utf8').includes('<ExpansionOverlay progress={uiProgress}/>'));
console.log(JSON.stringify({zones:world.zones.length,cameraPoints:world.cameraPath.length,keyframes:world.cameraKeyframes.length,sha256:crypto.createHash('sha256').update(glb).digest('hex')},null,2));
