import React from 'react';
import { ease,VESSELS } from './CultureExpansion.jsx';
export default function ExpansionOverlay({progress}){
  if(progress<.325 || progress>.449)return null;
  const k=progress<.368?0:progress<.389?1:progress<.410?2:progress<.423?3:4;
  const titles=['SELECTED CULTURE','SEED CULTURE','CONTROLLED EXPANSION','LARGER GROWTH VESSEL','TWO DISTINCT PATHWAYS'];
  const subtitles=[
    'An isolate is prepared for propagation.',
    'A small culture starts the expansion sequence.',
    'An intermediate vessel supports additional growth.',
    'The larger vessel contains increased fungal biomass.',
    'One culture lineage supports growth and fruiting; a selected mycelial inoculum serves fermentation.'
  ];
  return <aside className="expansion-inspection" aria-label="Culture expansion process illustration">
    <div className="expansion-label">CULTURE PROPAGATION · VISUAL SCHEMATIC</div>
    <h3>{titles[k]}</h3><p>{subtitles[k]}</p>
    <div className="expansion-steps">
      {['ISOLATE','SEED','EXPANSION','LARGER CULTURE'].map((x,i)=><span key={x} className={k>=i?'on':''}>
      <small>{String(i+1).padStart(2,'0')}</small><strong>{x}</strong></span>)}
    </div>
    {k===4 && <div className="expansion-branch"><div><b>↗</b> GROWTH → INCUBATION → FRUITING</div><div><b>↘</b> SELECTED MYCELIAL INOCULUM → FERMENTATION</div></div>}
    <div className="expansion-disclaimer">Illustrative process lineage — not a physical transfer pipe</div>
  </aside>;
}
