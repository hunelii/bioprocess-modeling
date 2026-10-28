import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=new URL('../public/assets/',import.meta.url);
const model=new URL('huner-living-factory.glb',root);
const b=fs.readFileSync(model);
assert.equal(b.toString('ascii',0,4),'glTF','GLB magic');
assert.equal(b.readUInt32LE(4),2,'GLB version');
assert.equal(b.readUInt32LE(8),b.length,'GLB declared byte count');
for(let i=1;i<=10;i++){
 const p=new URL(`posters/${String(i).padStart(2,'0')}.webp`,root);assert.ok(fs.statSync(p).size>5000,`Poster ${i}`);
}
assert.ok(fs.statSync(new URL('posters/master.webp',root)).size>5000);
console.log('PASS assets: GLB header/length, 10 stage WebP posters, complete-world poster');
console.log('GLB sha256:',crypto.createHash('sha256').update(b).digest('hex'));
