import React, { useState, useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import FactoryScene from './components/FactoryScene.jsx';
import SceneBoundary from './components/SceneBoundary.jsx';
import Scene01Fallback from './components/Scene01Fallback.jsx';
import IsolationOverlay from './components/IsolationOverlay.jsx';
import ExpansionOverlay from './components/ExpansionOverlay.jsx';
import IncubationOverlay from './components/IncubationOverlay.jsx';
import LivingNetworkOverlay from './components/LivingNetworkOverlay.jsx';
import {FruitingOverlay} from './components/FruitingOverlay.jsx';
import { STAGES, stageAt, clamp01 } from './data/camera.js';
import copy from './data/content.json';

gsap.registerPlugin(ScrollTrigger);
const STAGE_COUNT = STAGES.length;
const ID = 'huner-living-factory';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function webglSupport() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
      || canvas.getContext('webgl2')
      || canvas.getContext('webgl');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

const ease = (a,b,t) => { const x=clamp01((t-a)/(b-a)); return x*x*(3-2*x); };
const BASE = import.meta.env.BASE_URL || './';
const poster = (index, coda) => coda ? `${BASE}assets/posters/master.webp` : `${BASE}assets/posters/${String(index + 1).padStart(2, '0')}.webp`;

export default function App() {
  const storyRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const progressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const registerInvalidate = useRef(null);
  const trackBarRef = useRef(null);
  const percentTextRef = useRef(null);
  const [uiProgress, setUiProgress] = useState(0);
  const [detail, setDetail] = useState(true);
  const [canRender, setCanRender] = useState(() => webglSupport());
  const [approached, setApproached] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [renderFailure, setRenderFailure] = useState('');
  const [staticChoice, setStaticChoice] = useState(false);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const small = useMediaQuery('(max-width: 760px)');
  // Enable the optimized 3D experience across all devices (desktop, laptop, tablet, and mobile)
  const readyToAttempt3D = canRender && !renderFailure && !staticChoice;
  const using3D = readyToAttempt3D && approached;
  const posterMode = !using3D || !sceneReady;
  // Visual-only fallback: transition between Scene 01 and 02 without a hard poster swap.
  // In WebGL mode the real GLB camera remains continuous instead.
  const openingBlend = ease(.095, .123, uiProgress);
  const openingBridge = uiProgress < .123;
  const stageIndex = stageAt(uiProgress);
  const coda = uiProgress > .982;
  const stage = coda ? null : STAGES[stageIndex];

  useEffect(() => { setCanRender(webglSupport()); }, []);

  useEffect(() => {
    if (!storyRef.current || !('IntersectionObserver' in window)) {
      setApproached(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) { setApproached(true); observer.disconnect(); }
    }, { rootMargin: '750px 0px' });
    observer.observe(storyRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!storyRef.current || !panelRef.current) return;
    const trigger = ScrollTrigger.create({
      id: ID,
      trigger: storyRef.current,
      pin: panelRef.current,
      start: 'top top',
      end: () => '+=' + window.innerHeight * (small ? 7 : 10),
      pinSpacing: true,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      onUpdate: self => {
        const p = clamp01(self.progress);
        targetProgressRef.current = p;
        registerInvalidate.current?.();
        // Throttle React state updates to ~32 steps across the entire scroll
        setUiProgress(old => Math.round(old * 32) === Math.round(p * 32) ? old : p);
      }
    });
    triggerRef.current = trigger;
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    return () => {
      window.removeEventListener('load', refresh);
      trigger.kill();
      triggerRef.current = null;
    };
  }, [small, reduced]);

  const seek = useCallback((p) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * clamp01(p), behavior: reduced ? 'instant' : 'smooth' });
  }, [reduced]);

  useEffect(() => {
    const onKey = event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const active = document.activeElement;
      if (active?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const bounds = panelRef.current?.getBoundingClientRect();
      if (!bounds || bounds.bottom <= 0 || bounds.top >= innerHeight) return;
      const options = STAGES.map(s => s.progress);
      const p = event.key === 'ArrowRight' ? options.find(v => v > uiProgress + .004) : options.slice().reverse().find(v => v < uiProgress - .004);
      event.preventDefault();
      seek(p ?? (event.key === 'ArrowRight' ? 1 : 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seek, uiProgress]);

  const onFailure = useCallback((message) => {
    setRenderFailure(message || 'WebGL failed');
    setSceneReady(false);
    registerInvalidate.current = null;
  }, []);
  const onReady = useCallback(() => setSceneReady(true), []);
  const portraitFocus = small ? [8,14,24,35,44,50,55,62,66,80][stageIndex] + "% center" : "50% center";
  const title = coda ? 'Making with life, for life.' : copy.headlines[stageIndex];
  const description = coda ? 'One connected world. Two scientific pathways.' : (stageIndex === 0 ? 'A microscopic beginning.' : copy.subtitles[stageIndex]);

  return <>
    <main id="living-factory-main">
      <section ref={storyRef} className="story" aria-label="Bioprocess 3D Interactive Model">
        <div ref={panelRef} className="pinned">
          {using3D && (
            <div className="scene-shell" style={{ opacity: 1 }} aria-hidden="true">
              <SceneBoundary onFailure={onFailure}>
                <FactoryScene
                  progressRef={progressRef}
                  targetProgressRef={targetProgressRef}
                  registerInvalidate={registerInvalidate}
                  detail={!small && detail}
                  onReady={onReady}
                  onFailure={onFailure}
                  trackBarRef={trackBarRef}
                  percentTextRef={percentTextRef}
                />
              </SceneBoundary>
            </div>
          )}
          <div className="veil" aria-hidden="true"/>
          <IsolationOverlay progress={uiProgress}/>
          <ExpansionOverlay progress={uiProgress}/>
          <IncubationOverlay progress={uiProgress}/>
          <LivingNetworkOverlay progress={uiProgress}/>
          <FruitingOverlay progress={uiProgress}/>
          <div className="overlay-top">
            <div className="identity">
              <a href="https://hunelii.github.io/huner-biofoundry/" className="brand" target="_blank" rel="noreferrer" title="Return to Main Website">
                HUNER BIOFOUNDRY ↗
              </a>
              <span>BIOPROCESS 3D MODELING</span>
            </div>
            <span className="status">01—10 / PROCESS STAGES</span>
          </div>
          <article className="story-copy" aria-live="off" style={{opacity:1-(1-Math.min(1,Math.abs(uiProgress-.11)/.012))*.94}}>
            <div className="chapter">{coda ? 'COMPLETE PROCESS' : `${String(stageIndex + 1).padStart(2, '0')} / ${STAGE_COUNT}`}</div>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {coda ? 'Complete process overview' : `Stage ${stageIndex + 1}: ${copy.labels[stageIndex]}`}
          </p>
          <div className="right-note">
            CURRENT STATION<strong>{stage ? copy.labels[stageIndex] : 'BIOPROCESS MODEL'}</strong>
          </div>
          <footer className="story-footer">
            <div className="eyebrow-bar">
              <span>BIOPROCESS VISUALIZATION · 10 SCIENTIFIC STAGES</span>
              <span ref={percentTextRef}>{Math.round(uiProgress * 100)}%</span>
            </div>
            <nav className="stage-nav" aria-label="Ten scientific stages">
              {STAGES.map((s, i) => (
                <button
                  type="button"
                  key={s.id}
                  className={!coda && stageIndex === i ? 'active' : ''}
                  aria-label={`Go to ${copy.labels[i].toLowerCase()} stage`}
                  aria-current={!coda && stageIndex === i ? 'step' : undefined}
                  onClick={() => seek(s.progress)}
                >
                  {copy.labels[i]}
                </button>
              ))}
            </nav>
            <div className="track" role="progressbar" aria-label="Process journey progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(uiProgress * 100)}>
              <div ref={trackBarRef} style={{transform: `scaleX(${uiProgress})`}} />
            </div>
            <div className="footnote">
              <button type="button" onClick={() => seek(0)}>↶ RESTART</button>
              <span>SCROLL VERTICALLY · ARROW KEYS TO CHANGE CHAPTER</span>
              {using3D && sceneReady && (
                <button type="button" aria-pressed={!detail} onClick={() => setDetail(v => !v)}>
                  {detail ? 'FULL DETAIL' : 'SIMPLIFIED DETAIL'}
                </button>
              )}
            </div>
          </footer>
          {using3D && !sceneReady && (
            <div className="load-status" role="status">LOADING 3D WORLD…</div>
          )}
        </div>
      </section>
    </main>
  </>;
}
