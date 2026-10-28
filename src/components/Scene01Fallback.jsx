import React from 'react';
import { clamp01 } from '../data/camera.js';

const ease = (a,b,t) => { const x=clamp01((t-a)/(b-a));return x*x*(3-2*x); };

// Accessible DOM/paint-only art direction for no-WebGL, mobile and reduced motion.
// Decorative imagery is kept out of the accessibility tree; narrative text remains HTML.
export default function Scene01Fallback({progress=0}){
  const t=clamp01(progress/.11);
  const reveal=ease(.15,.38,t)*(1-ease(.74,1,t));
  const beam=.22+.78*ease(0,.3,t);
  const petri=ease(.70,.98,t);
  return <div className="scene01-fallback" aria-hidden="true" style={{'--scene01-reveal':reveal,'--scene01-beam':beam,'--scene01-petri':petri}}>
    <div className="scene01-ambient" />
    <div className="scene01-beam" />
    <div className="scene01-specimen"><div className="scene01-specimen-texture"/></div>
    <div className="scene01-petri"><div/></div>
  </div>;
}
