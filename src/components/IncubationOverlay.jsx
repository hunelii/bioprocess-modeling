import React from 'react';
import {incubEase} from './ControlledIncubation.jsx';

const states=[
  ['RETURN TO SCALE','The expansion vessels recede; the culture lineage continues to controlled growth.'],
  ['INCUBATOR REVEAL','The existing cabinet emerges, with racks, culture containers and a sensor panel.'],
  ['CONTROLLED ENVIRONMENT','Temperature, atmosphere and environmental conditions are monitored and regulated.'],
  ['CULTURE OBSERVATION','The camera approaches the shake flasks on the orbital shaker decks.'],
  ['SUBMERGED CULTURE','Mycelium grows as suspended pellets in the agitated, aerated broth.'],
  ['REFERENCE FLASK','A single central flask anchors the following close-up.']
];
export default function IncubationOverlay({progress}){
  if(progress<.435 || progress>.565)return null;
  const stage=progress<.457?0:progress<.476?1:progress<.493?2:progress<.509?3:progress<.53?4:5;
  const growth=incubEase(.488,.535,progress);
  return <aside className="incubation-inspection" aria-label="Controlled incubation visual explanation">
    <div className="incubation-kicker">ZONE E / CONTROLLED INCUBATION</div>
    <h3>{states[stage][0]}</h3>
    <p>{states[stage][1]}</p>
    <div className="incubation-stage-bar" aria-hidden="true"><span style={{width:`${Math.round(growth*100)}%`}}/></div>
    <div className="incubation-metrics"><span>ENVIRONMENT <b>MONITORED</b></span><span>CULTURE <b>{growth<.05?'DORMANT VISUAL':growth<.95?'DEVELOPING':'ESTABLISHED'}</b></span></div>
    <div className="incubation-label">Growth shown as an illustrative sequence, not measured experimental data.</div>
  </aside>;
}
