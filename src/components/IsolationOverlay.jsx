import React, {useMemo} from 'react';
const limit=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,p)=>{const v=limit((p-a)/(b-a));return v*v*(3-2*v);};
function Hyphae({cx,cy,extent}){
 const rays=useMemo(()=>Array.from({length:30},(_,i)=>{
  const angle=(i/30)*Math.PI*2+.06*Math.sin(i*1.6);
  const len=55*(.72+.18*Math.sin(i*2.3));
  const a=[];
  for(let j=0;j<10;j++){
   const t=j/9;const theta=angle+.07*Math.sin(t*7+i);
   a.push(`${j?'L':'M'}${(cx+len*t*Math.cos(theta)).toFixed(1)},${(cy+len*t*Math.sin(theta)).toFixed(1)}`);
  }
  return a.join(' ');
 }),[cx,cy]);
 return <g opacity={extent}>{rays.map((d,i)=><path key={i} d={d} fill="none" stroke="#e3f1dc" strokeWidth="1.2" strokeLinecap="round" pathLength="1" strokeDasharray={`${Math.max(0,extent)} 1`} />)}</g>;
}
export default function IsolationOverlay({progress}){
 if(progress<.242||progress>.329)return null;
 const selected=smooth(.301,.320,progress);
 const stage=progress<.278?'SELECT THE LEADING EDGE':progress<.305?'TRANSFER AN AGAR PLUG':'ESTABLISH THE ISOLATE';
 return <aside className="isolation-overlay" aria-label="Culture selection diagram, magnified and not to scale">
  <div className="isolation-overline">MICROSCOPIC DETAIL · SCHEMATIC MAGNIFICATION</div>
  <svg viewBox="0 0 440 160" role="img" aria-label="A parent fungal culture on the left and a separate developing culture on the right">
    <circle cx="102" cy="76" r="65" fill="#557060" fillOpacity=".32" stroke="#a9d2b2" strokeWidth="2"/>
    <circle cx="341" cy="76" r="65" fill="#557060" fillOpacity=".28" stroke="#a9d2b2" strokeWidth="2"/>
    <Hyphae cx={102} cy={76} extent={1}/><Hyphae cx={341} cy={76} extent={selected}/>
    <path d="M185 76H254" stroke="#75c896" strokeWidth="2"/><path d="M253 76l-9 -5v10Z" fill="#75c896"/>
    <text x="55" y="157" fill="#dce9d9" fontSize="11">PARENT CULTURE</text>
    <text x="300" y="157" fill="#dce9d9" fontSize="11">NEW ISOLATE</text>
  </svg>
  <div className="isolation-foot">{stage} <span>Illustration only · no measured data</span></div>
 </aside>;
}
