import fs from 'node:fs';
import assert from 'node:assert/strict';
const w=JSON.parse(fs.readFileSync(new URL('../src/data/world.json', import.meta.url)));
assert.equal(w.zones.length,8,'Eight stations');
assert.equal(w.cameraPath.length,1001,'Locked 1001 camera samples');
assert.equal(w.cameraKeyframes.length,11,'10 frames plus factory ending');
assert.equal(w.cameraBeats.length,36,'36 camera choreography beats');
assert.deepEqual(w.cameraKeyframes.slice(0,10).map(x=>x.zone),['A','B','B','C','D','E','E','F','G','H']);
assert.equal(w.cameraPath[0].position.length,3);
for(const [i,p] of w.cameraPath.entries()){
  assert.equal(p.position.length,3,`position of ${i}`);
  assert.equal(p.target.length,3,`target of ${i}`);
  assert.ok([...p.position,...p.target,p.fov].every(Number.isFinite),`finite ${i}`);
  assert.ok(p.fov>10&&p.fov<100,`fov ${i}`);
}
assert.equal(w.cameraKeyframes[0].progress,0);assert.equal(w.cameraKeyframes.at(-1).progress,1);
console.log('PASS world: 8 zones, 11 camera keys, 36 beats, 1001 camera samples, finite values.');
