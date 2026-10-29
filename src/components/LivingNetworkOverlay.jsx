import React from 'react';
const STAGES=[
  ['REFERENCE FLASK','The central Fernbach flask on the middle orbital shaker deck is selected.'],
  ['OPTICAL APPROACH','The camera moves toward the flask without changing its physical scale.'],
  ['INSIDE THE FLASK','The camera passes through the glass into the swirling liquid culture.'],
  ['ORBITAL MIXING','Continuous orbital shaking keeps the broth moving and well oxygenated.'],
  ['SUSPENDED BIOMASS','Mycelial pellets stay suspended in the swirling medium.'],
  ['AERATION','Fine O2 bubbles rise from the sparger through the culture.'],
  ['RETURN TO CONTEXT','The camera withdraws from the flask back to the incubator.']
];
export default function LivingNetworkOverlay({progress}){
  if(progress<.548||progress>.690)return null;
  const stage=progress<.57?0:progress<.597?1:progress<.614?2:progress<.627?3:progress<.644?4:progress<.658?5:6;
  const [heading,desc]=STAGES[stage];
  return <aside className="living-network-inspection" aria-label="Microscopic mycelial visualization">
    <div className="network-kicker">ZONE E / SAME REFERENCE CULTURE</div>
    <h3>{heading}</h3>
    <p>{desc}</p>
    <div className="network-stage-bar" aria-hidden="true"><span style={{width:`${Math.max(0,Math.min(100,Math.round((progress-.548)/.142*100)))}%`}}/></div>
    <div className="network-disclaimer">OPTICAL MACRO VISUALIZATION · NOT A MEASURED GROWTH RATE</div>
  </aside>;
}
