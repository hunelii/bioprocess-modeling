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
 if(progress<.256||progress>.356)return null;
 const selected=smooth(.301,.320,progress);
 const isHeating1 = progress < .278;
 const isCooling = progress >= .278 && progress < .289;
 const isTransfer = progress >= .289 && progress < .307;
 const isStreaking = progress >= .307 && progress <= .324;
 const isHeating2 = progress > .324;

 const stage = isHeating1
  ? '1/5 · FLAME STERILIZE LOOP TIP (INCANDESCENT ORANGE)'
  : isCooling
  ? '2/5 · COOL LOOP IN STERILE ZONE & AGAR MARGIN'
  : isTransfer
  ? '3/5 · HARVEST COLONY & ASEPTIC TRANSFER'
  : isStreaking
  ? '4/5 · SINUSOIDAL STREAK INOCULATION'
  : '5/5 · TERMINAL POST-INOCULATION RE-FLAME';

 const loopColor = (isHeating1 || isHeating2) ? '#ff6a1a' : isCooling ? '#6ad4ff' : '#75c896';

 return <aside className="isolation-overlay" aria-label="Culture selection diagram, magnified and not to scale">
  <div className="isolation-overline">MICROSCOPIC DETAIL · ASEPTIC PROTOCOL</div>
  <svg viewBox="0 0 440 160" role="img" aria-label="A parent fungal culture on the left, Bunsen burner in the center, and a separate developing culture on the right">
    <circle cx="96" cy="76" r="62" fill="#557060" fillOpacity=".32" stroke="#a9d2b2" strokeWidth="2"/>
    <circle cx="344" cy="76" r="62" fill="#557060" fillOpacity=".28" stroke="#a9d2b2" strokeWidth="2"/>
    <Hyphae cx={96} cy={76} extent={1}/><Hyphae cx={344} cy={76} extent={selected}/>
    {/* Bunsen Burner Schematic Icon in Center (x=220) */}
    <rect x="215" y="106" width="10" height="26" rx="2" fill="#8fa399" />
    <rect x="206" y="130" width="28" height="5" rx="2" fill="#6b7f75" />
    <path d="M220 64 C211 80, 212 96, 220 105 C228 96, 229 80, 220 64 Z" fill="#42b8ff" fillOpacity="0.85" />
    <path d="M220 78 C216 88, 216 98, 220 105 C224 98, 224 88, 220 78 Z" fill="#7cfaff" />
    {/* Inoculation Loop Indicator Ring */}
    <circle
      cx={isHeating1 ? 220 : isCooling ? 142 : isTransfer ? 190 : isStreaking ? 344 : 220}
      cy={isHeating1 ? 74 : isCooling ? 44 : isTransfer ? 52 : isStreaking ? 76 : 74}
      r="8"
      fill="none"
      stroke={loopColor}
      strokeWidth="2.8"
    />
    <path d="M168 76H202" stroke="#75c896" strokeWidth="1.6" strokeDasharray="3 3"/>
    <path d="M238 76H272" stroke="#75c896" strokeWidth="2"/><path d="M274 76l-8 -4.5v9Z" fill="#75c896"/>
    <text x="48" y="155" fill="#dce9d9" fontSize="10.5">PARENT CULTURE</text>
    <text x="192" y="155" fill="#9ad8ff" fontSize="10">BUNSEN FLAME</text>
    <text x="304" y="155" fill="#dce9d9" fontSize="10.5">NEW ISOLATE</text>
  </svg>
  <div className="isolation-foot">{stage} <span>Aseptic microbiology protocol</span></div>
 </aside>;
}
