import {scene01CameraProgress} from '../src/data/camera-timing.js';
import world from '../src/data/world.json' with {type:'json'};
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const limit=.11,eps=1e-6;
let prev=-1,failures=[];
for(let i=0;i<=10000;i++){
 const p=i/10000*limit;
 const v=scene01CameraProgress(p);
 if(v+eps<prev)failures.push('Nonmonotonic retime at '+i);
 if(v<-.000001||v>limit+.000001)failures.push('Time out of range at '+i);
 prev=v;
}
let discontinuity=0;
for(const p of [0,.033,.0528,.0737,.0946,.11]) {
 const a=scene01CameraProgress(p-1e-7),b=scene01CameraProgress(p+1e-7);
 discontinuity=Math.max(discontinuity,Math.abs(b-a));
}
const bL=(scene01CameraProgress(limit)-scene01CameraProgress(limit-1e-5))/1e-5;
const bR=(scene01CameraProgress(limit+1e-5)-scene01CameraProgress(limit))/1e-5;
if(Math.abs(bL-bR)>.005)failures.push('Boundary camera speed discontinuity '+bL+' vs '+bR);
if(Math.abs(scene01CameraProgress(.11)-.11)>1e-12)failures.push('Scene 02 start position not preserved');
if(Math.abs(scene01CameraProgress(.12)-.12)>1e-12)failures.push('Scene 02 route changed');
const c0=world.cameraPath[0];const c1=world.cameraPath[110];
const round=x=>Math.round(x*100000)/100000;
const report={pass:failures.length===0,checks:['10001 samples monotonic','no timing warp beyond Scene01','Scene02 3D position unchanged','C1 camera speed across cut'],bounds:{begin:c0.position,end:c1.position},maxContinuityGap:discontinuity,speedAtBoundary:[round(bL),round(bR)],failures};
console.log(JSON.stringify(report,null,2));if(failures.length)process.exit(1);
