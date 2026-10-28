import React from 'react';
const STAGES=[
  ['REFERENCE CULTURE','The same centrally selected culture container remains fixed inside the incubator.'],
  ['OPTICAL APPROACH','The camera approaches the container without changing its physical scale.'],
  ['OBSERVATION WINDOW','The culture is shown through a controlled optical cutaway of its transparent enclosure.'],
  ['FIRST FILAMENTS','Fine hyphae appear from the established mycelium within the same culture.'],
  ['BRANCHING','New branches extend from the existing filament network.'],
  ['LIVING NETWORK','Filaments form a dense, irregular mesh. This is a visual time-lapse, not real experimental footage.'],
  ['RETURN TO CONTEXT','The optical macro view withdraws through the same reference container.']
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
