import React from 'react';
const smooth=(a,b,p)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
export function FruitingOverlay({progress}){
  const a=smooth(.704,.726,progress)*(1-smooth(.790,.810,progress));
  if(a<.005)return null;
  const label=progress<.727?'PRIMORDIA':progress<.747?'YOUNG FRUITING BODIES':progress<.768?'CAP EXPANSION':'MATURE PLEUROTUS MORPHOLOGY';
  return <aside className="fruiting-label" style={{opacity:a}} aria-label="Fruiting development visualization">
    <strong>ZONE F · CONTROLLED FRUITING</strong><span>{label}</span>
    <small>Colonized substrate → primordia → fruiting bodies</small>
  </aside>;
}
