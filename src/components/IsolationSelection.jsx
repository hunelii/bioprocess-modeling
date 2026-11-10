import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { myceliumVertexShader, myceliumFragmentShader, buildTapered3DRhizomorphs } from './PetriLookdev.jsx';

// Locked glTF stations: C_Petri_0 (6.89,-.20,1.285) and C_Petri_1 (8.06,-.20,1.285).
// Features a scientifically accurate 5-Stage Aseptic Microbiological Inoculation Loop & Bunsen Burner Protocol:
// 1. Pre-Inoculation Flame Sterilization (Loop heated in Bunsen oxidizing/reducing tip until glowing incandescent orange)
// 2. Aseptic Cooling (Cooled in sterile updraft & touched to unseeded sterile agar margin of Source Plate until metallic)
// 3. Inoculum Harvest & Aseptic Transfer (Pick up culture from leading edge of C_Petri_0 & carry across sterile zone)
// 4. Sinusoidal Streak Plate Inoculation (Streak inoculum across C_Petri_1 agar surface)
// 5. Post-Inoculation Terminal Flame Sterilization (Return loop to Bunsen flame until glowing incandescent orange again)
export const SOURCE_PLATE = [6.89,-.20,1.285];
export const ISOLATE_PLATE = [8.06,-.20,1.285];
export const BUNSEN_BURNER_POS = [7.82, -0.145, 1.236];
export const BUNSEN_FLAME_TIP = [7.82, -0.145, 1.356];

const eased = (a,b,p) => {const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
const lerp = (a,b,t)=>a+(b-a)*t;

// Spatially-graded Blackbody Thermal Incandescence Shader for the Platinum/Nichrome Inoculation Loop Wire
const wireLoopVertexShader = `
  varying float vLocalY;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vLocalY = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const wireLoopFragmentShader = `
  uniform float uHeat;
  uniform float uTime;
  varying float vLocalY;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewPos);
    vec3 L = normalize(vec3(0.3, -0.6, 0.74));

    // Metallic base lighting (cool polished nichrome/platinum wire when uHeat = 0)
    float diff = max(dot(N, L), 0.0) * 0.75 + 0.25;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 36.0);
    vec3 coolMetal = vec3(0.72, 0.78, 0.75) * diff + vec3(0.95, 0.98, 1.0) * spec * 0.55;

    // Heat is concentrated at the circular loop ring (vLocalY = 0..0.022) and conducts partway up the wire shaft
    float ringZone = 1.0 - smoothstep(0.018, 0.068, vLocalY);
    float tipBoost = 1.0 - smoothstep(0.0, 0.020, vLocalY);
    float shimmer = 0.96 + 0.04 * sin(uTime * 28.0 + vLocalY * 180.0);
    float localTemp = clamp(uHeat * (ringZone * 0.95 + tipBoost * 0.25) * shimmer, 0.0, 1.0);

    // Planck Blackbody Incandescence Progression:
    // 0.00 -> 0.30: Cool metallic -> Dark cherry red (#7a0d00)
    // 0.30 -> 0.68: Dark cherry red -> Luminous orange-red (#ff4500)
    // 0.68 -> 1.00: Luminous orange-red -> Incandescent yellow-orange (#ffba38)
    vec3 darkRed = vec3(0.55, 0.05, 0.0);
    vec3 brightOrange = vec3(1.0, 0.30, 0.02);
    vec3 yellowOrange = vec3(1.0, 0.78, 0.22);

    vec3 glowCol = mix(darkRed, brightOrange, smoothstep(0.18, 0.65, localTemp));
    glowCol = mix(glowCol, yellowOrange, smoothstep(0.65, 1.0, localTemp));

    float glowStrength = smoothstep(0.04, 0.95, localTemp);
    vec3 finalCol = mix(coolMetal, glowCol * (1.35 + 0.65 * localTemp), glowStrength);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

export function IsolationSelection({ progressRef }) {
  const sourceGroupRef = useRef();
  const isolateGroupRef = useRef();
  const sourceRhizoRef = useRef();
  const isolateRhizoRef = useRef();
  const transfer = useRef();
  const loopToolRef = useRef();
  const loopSampleRef = useRef();
  const loopHaloRef = useRef();
  const loopGlowLightRef = useRef();
  const streakTrackRef = useRef();
  const flameRef = useRef();
  const flameReactionRef = useRef();
  const coolSteamRef = useRef();

  const sourceColonyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 }, uSeed: { value: 2.71 } },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const isolateColonyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uGrowth: { value: 0 }, uSeed: { value: 4.18 } },
    vertexShader: myceliumVertexShader,
    fragmentShader: myceliumFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const sourceRhizoGeo = useMemo(() => buildTapered3DRhizomorphs(0.038, 44, 71201), []);
  const isolateRhizoGeo = useMemo(() => buildTapered3DRhizomorphs(0.032, 40, 89314), []);

  const hyphaMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f7f6ed',
    roughness: 0.72,
    metalness: 0.0
  }), []);

  const glassMat = useMemo(() => createFastGlassMaterial({
    color: '#dceee4', opacity: 0.34, roughness: 0.08, envMapIntensity: 0.85, side: THREE.DoubleSide
  }), []);

  const steelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a8b6af', metalness: 0.85, roughness: 0.20, envMapIntensity: 0.90
  }), []);

  // Spatially-graded thermal incandescence shader material for the inoculation loop wire
  const wireLoopMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uHeat: { value: 0.0 },
      uTime: { value: 0.0 }
    },
    vertexShader: wireLoopVertexShader,
    fragmentShader: wireLoopFragmentShader
  }), []);

  // Additive thermal orange aura around the circular loop tip when incandescent
  const loopHaloMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff6a14',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  const bunsenOuterFlameMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#3898ff',
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  const bunsenInnerConeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5cfaff',
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  // Secondary orange-gold sodium/metal ionization flare when the wire loop is heated inside the Bunsen flame
  const flameReactionMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff7b1a',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  // Brief condensation/cooling vapor ring when the warm loop touches the sterile agar margin to cool
  const coolSteamMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#dcf7ee',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);

  const streakTrackMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#e8f5ec',
    transparent: true,
    opacity: 0.52,
    depthWrite: false
  }), []);

  const brassChuckMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d4b26a', metalness: 0.84, roughness: 0.22
  }), []);

  const handleMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#22527a', metalness: 0.48, roughness: 0.34
  }), []);

  const gripMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#181e22', metalness: 0.15, roughness: 0.80
  }), []);

  // Build Petri dishes + Detailed Bunsen Burner + One-Piece Collinear Microbiological Inoculation Loop (Aşılama Özesi)
  const batchedHardware = useMemo(() => {
    const glassList = [];
    const steelList = [];
    const brassList = [];
    const darkHoseList = [];
    const coreList = [];

    for (const [px, py, pz] of [SOURCE_PLATE, ISOLATE_PLATE]) {
      glassList.push(transformGeo(new THREE.CylinderGeometry(0.0465, 0.046, 0.014, 36, 1, true), [px, py, pz + 0.005], [Math.PI / 2, 0, 0]));
      glassList.push(transformGeo(new THREE.TorusGeometry(0.0462, 0.0012, 8, 36), [px, py, pz + 0.012]));
      steelList.push(transformGeo(new THREE.CylinderGeometry(0.056, 0.062, 0.014, 28), [px, py, pz - 0.016], [Math.PI / 2, 0, 0]));
      // Place inoculum core directly on the agar surface (z = 1.2892) at exact plate center [px, py]
      coreList.push(transformGeo(new THREE.CylinderGeometry(0.0028, 0.0032, 0.0018, 12), [px, py, pz + 0.0042], [Math.PI / 2, 0, 0]));
    }

    // Inoculation Loop (Öze) built strictly along local +Y axis (0, y, 0) from y=0 (loop tip) to y=0.365m (handle end):
    const wireLoopGeo = mergeGeometriesFast([
      // 1. Closed circular platinum/nichrome loop ring (radius 0.0085m, centered at y=0.0085 so bottom touches 0,0,0)
      transformGeo(new THREE.TorusGeometry(0.0085, 0.00135, 12, 32), [0, 0.0085, 0], [0.25, 0, 0]),
      // 2. Reinforced weld bead where the circular loop joins the straight wire stem at y=0.0170
      transformGeo(new THREE.SphereGeometry(0.00165, 10, 8), [0, 0.0170, 0]),
      // 3. Continuous straight nichrome wire shaft from y=0.0162 to y=0.1060
      transformGeo(new THREE.CylinderGeometry(0.0014, 0.0012, 0.0898, 12), [0, 0.0611, 0])
    ]);

    // Glowing thermal halo mesh hugging the circular loop ring and lower stem
    const loopHaloGeo = mergeGeometriesFast([
      transformGeo(new THREE.TorusGeometry(0.0085, 0.0032, 12, 32), [0, 0.0085, 0], [0.25, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.0028, 0.0022, 0.032, 10), [0, 0.032, 0])
    ]);

    const brassChuckGeo = mergeGeometriesFast([
      // 4. Tapered brass collet chuck clamping the wire (y=0.1040 to y=0.1220)
      transformGeo(new THREE.CylinderGeometry(0.0046, 0.0018, 0.018, 16), [0, 0.1130, 0]),
      // 5. Knurled brass locking collar (y=0.1210 to y=0.1370)
      transformGeo(new THREE.CylinderGeometry(0.0054, 0.0054, 0.016, 16), [0, 0.1290, 0])
    ]);

    // Laboratory Bunsen Burner (Steril Alev Beki) positioned between the two Petri plates at BUNSEN_BURNER_POS
    const [bx, by, bz] = BUNSEN_BURNER_POS;
    steelList.push(
      // Heat-shield base plate & stepped heavy cast burner foot
      transformGeo(new THREE.CylinderGeometry(0.044, 0.048, 0.005, 24), [bx, by, bz + 0.0025], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.032, 0.038, 0.008, 22), [bx, by, bz + 0.008], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.014, 0.026, 0.014, 18), [bx, by, bz + 0.018], [Math.PI / 2, 0, 0]),
      // Vertical Venturi mixing barrel (chimney tube)
      transformGeo(new THREE.CylinderGeometry(0.0082, 0.0082, 0.082, 16), [bx, by, bz + 0.066], [Math.PI / 2, 0, 0]),
      // Castellated flame-stabilizer crown nozzle at top of barrel (z = 1.348)
      transformGeo(new THREE.CylinderGeometry(0.0094, 0.0084, 0.012, 16), [bx, by, bz + 0.108], [Math.PI / 2, 0, 0]),
      // Benchtop gas supply turret cock at [bx - 0.14, by + 0.10, bz]
      transformGeo(new THREE.CylinderGeometry(0.018, 0.022, 0.028, 14), [bx - 0.14, by + 0.10, bz + 0.014], [Math.PI / 2, 0, 0])
    );

    // Brass air-intake regulator collar (Hava Ayar Bileziği), gas needle regulator wheel & hose barb
    brassList.push(
      transformGeo(new THREE.CylinderGeometry(0.0108, 0.0108, 0.018, 16), [bx, by, bz + 0.032], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0112, 0.0012, 8, 20), [bx, by, bz + 0.039]),
      transformGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 14), [bx, by - 0.016, bz + 0.018], [0, 0, 0]),
      transformGeo(new THREE.CylinderGeometry(0.0038, 0.0038, 0.026, 10), [bx - 0.016, by + 0.010, bz + 0.020], [0, 0, Math.PI / 2]),
      transformGeo(new THREE.BoxGeometry(0.024, 0.006, 0.008), [bx - 0.14, by + 0.10, bz + 0.032], [0, 0, 0.45])
    );

    // Flexible neoprene gas supply hose from bench gas turret to Bunsen burner barb
    const gasHoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx - 0.026, by + 0.010, bz + 0.020),
      new THREE.Vector3(bx - 0.075, by + 0.045, bz + 0.008),
      new THREE.Vector3(bx - 0.115, by + 0.085, bz + 0.010),
      new THREE.Vector3(bx - 0.140, by + 0.100, bz + 0.020)
    ]);
    darkHoseList.push(new THREE.TubeGeometry(gasHoseCurve, 20, 0.0042, 8, false));

    // Outer oxidizing blue-violet flame mantle + Inner intense cyan reducing cone
    const outerFlameGeo = mergeGeometriesFast([
      transformGeo(new THREE.ConeGeometry(0.0115, 0.054, 16), [bx, by, bz + 0.139], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(0.0095, 12, 10), [bx, by, bz + 0.118], [1, 1, 1.35])
    ]);
    const innerConeGeo = transformGeo(new THREE.ConeGeometry(0.0062, 0.028, 14), [bx, by, bz + 0.126], [Math.PI / 2, 0, 0]);

    // Secondary incandescent orange sodium/metal reaction plume enveloping the loop inside the flame
    const flameReactionGeo = mergeGeometriesFast([
      transformGeo(new THREE.ConeGeometry(0.0135, 0.046, 16), [bx, by, bz + 0.144], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(0.0125, 14, 12), [bx, by, bz + 0.124])
    ]);

    //Zigzag Inoculation Streak Track (Ekme İzi) on the Isolate Plate C_Petri_1 agar surface [8.06, -0.20, 1.2891]
    const streakPts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const sx = 8.038 + u * 0.044;
      const sy = -0.20 + Math.sin(u * Math.PI * 5.0) * (0.024 * (1.0 - u * 0.42));
      streakPts.push(new THREE.Vector3(sx, sy, 1.2891));
    }
    const streakGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(streakPts), 32, 0.00062, 5, false);

    const rubberGripGeo = mergeGeometriesFast([
      // 6. Ergonomic ribbed rubber finger grip sleeve (y=0.1360 to y=0.2060)
      transformGeo(new THREE.CylinderGeometry(0.0064, 0.0064, 0.070, 16), [0, 0.1710, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.148, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.163, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.178, 0], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.TorusGeometry(0.0066, 0.0008, 8, 20), [0, 0.193, 0], [Math.PI / 2, 0, 0])
    ]);

    const handleShaftGeo = mergeGeometriesFast([
      // 7. Anodized laboratory handle shaft (y=0.2050 to y=0.3650)
      transformGeo(new THREE.CylinderGeometry(0.0056, 0.0056, 0.160, 16), [0, 0.2850, 0]),
      // 8. Rounded handle end cap at y=0.3650
      transformGeo(new THREE.SphereGeometry(0.0056, 12, 10), [0, 0.3650, 0])
    ]);

    return {
      glassGeo: mergeGeometriesFast(glassList),
      steelGeo: mergeGeometriesFast(steelList),
      brassGeo: mergeGeometriesFast(brassList),
      darkHoseGeo: mergeGeometriesFast(darkHoseList),
      coreGeo: mergeGeometriesFast(coreList),
      wireLoopGeo,
      loopHaloGeo,
      brassChuckGeo,
      handleShaftGeo,
      rubberGripGeo,
      outerFlameGeo,
      innerConeGeo,
      flameReactionGeo,
      streakGeo
    };
  }, []);

  useFrame((state) => {
    const p = progressRef.current;
    const t = state.clock.getElapsedTime();
    const inZoneC = (p >= 0.20 && p <= 0.40) || p > 0.92;
    if (!inZoneC) {
      if (sourceGroupRef.current) sourceGroupRef.current.visible = false;
      if (isolateGroupRef.current) isolateGroupRef.current.visible = false;
      if (transfer.current) transfer.current.visible = false;
      if (loopToolRef.current) loopToolRef.current.visible = false;
      if (flameRef.current) flameRef.current.visible = false;
      if (flameReactionRef.current) flameReactionRef.current.visible = false;
      if (coolSteamRef.current) coolSteamRef.current.visible = false;
      return;
    }

    wireLoopMat.uniforms.uTime.value = t;

    const sourceReveal = p > 0.92 ? 1.0 : eased(.243, .268, p);
    const selectedReveal = p > 0.92 ? 1.0 : eased(.301,.320,p);

    const showSource = inZoneC && sourceReveal > 0.005;
    if (sourceGroupRef.current) sourceGroupRef.current.visible = showSource;
    if (showSource) {
      sourceColonyMat.uniforms.uGrowth.value = sourceReveal;
      if (sourceRhizoRef.current) {
        const s = Math.max(0.02, sourceReveal);
        sourceRhizoRef.current.scale.set(s, s, 0.4 + 0.6 * s);
      }
    }

    const showIsolate = inZoneC && selectedReveal > 0.005;
    if (isolateGroupRef.current) isolateGroupRef.current.visible = showIsolate;
    if (showIsolate) {
      isolateColonyMat.uniforms.uGrowth.value = selectedReveal;
      if (isolateRhizoRef.current) {
        const s = Math.max(0.02, selectedReveal);
        isolateRhizoRef.current.scale.set(s, s, 0.4 + 0.6 * s);
      }
    }

    const carry = eased(.276, .304, p);
    if (transfer.current) {
      transfer.current.visible=p>=.274&&p<=.307;
      if (transfer.current.visible) {
        transfer.current.position.set(lerp(6.910, 8.060, carry), -.20, 1.292 + .082 * Math.sin(Math.PI * carry));
        transfer.current.rotation.y = .09 * Math.sin(Math.PI * carry);
      }
    }

    // =========================================================================
    // SCIENTIFIC 5-STAGE ASEPTIC INOCULATION LOOP CHOREOGRAPHY (p = 0.240 -> 0.358)
    // =========================================================================
    const [fx, fy, fz] = BUNSEN_FLAME_TIP; // [7.82, -0.145, 1.356]
    const sterileAgarEdge = [6.860, -0.214, 1.2892]; // Uncolonized sterile agar periphery on C_Petri_0
    const colonyLeadingEdge = [6.906, -0.200, 1.2892]; // Active mycelial margin on C_Petri_0

    let uHeat = 0.0;
    let inFlameContact = 0.0;
    let agarCoolTouch = 0.0;

    if (loopToolRef.current) {
      const showLoop = p >= 0.238 && p <= 0.358;
      loopToolRef.current.visible = showLoop;
      if (showLoop) {
        let lx = fx, ly = fy, lz = fz, rotX = 0, rotY = 0, rotZ = 0;

        if (p < 0.264) {
          // STAGE 1: PRE-INOCULATION FLAME STERILIZATION (p = 0.238 -> 0.264)
          // Hold inoculation loop directly inside the upper reducing/oxidizing tip of the Bunsen flame
          // until the platinum/nichrome wire glows bright orange-red incandescent!
          const enterFlame = eased(0.238, 0.246, p);
          const sweepInFlame = Math.sin(eased(0.244, 0.263, p) * Math.PI * 2.0);
          lx = lerp(fx + 0.045, fx, enterFlame) + 0.003 * sweepInFlame;
          ly = lerp(fy - 0.025, fy, enterFlame) + 0.002 * sweepInFlame;
          lz = lerp(fz + 0.035, fz, enterFlame) + 0.004 * Math.cos(p * 420.0);
          rotY = -0.18 + 0.06 * sweepInFlame;
          rotZ = 0.12;

          // Heat ramps up rapidly inside the flame to peak orange incandescence (uHeat = 1.0)
          uHeat = eased(0.241, 0.254, p);
          inFlameContact = enterFlame * (1.0 - eased(0.261, 0.264, p));

        } else if (p < 0.275) {
          // STAGE 2: ASEPTIC COOLING IN STERILE UPDRAFT & AGAR MARGIN TOUCH (p = 0.264 -> 0.275)
          // Move loop out of flame toward Source Plate (0.264 -> 0.270), then touch the sterile
          // uncolonized agar edge of C_Petri_0 (0.270 -> 0.275) to dissipate residual heat safely
          // before contacting live cells/hyphae!
          const moveToMargin = eased(0.264, 0.270, p);
          const touchMargin = Math.sin(eased(0.269, 0.275, p) * Math.PI);
          lx = lerp(fx, sterileAgarEdge[0], moveToMargin);
          ly = lerp(fy, sterileAgarEdge[1], moveToMargin);
          lz = lerp(fz, sterileAgarEdge[2] + 0.018, moveToMargin) + 0.042 * Math.sin(moveToMargin * Math.PI) - 0.018 * touchMargin;
          rotY = lerp(-0.18, -0.08, moveToMargin);
          rotZ = lerp(0.12, 0.0, moveToMargin);

          // Orange glow cools to cherry red in sterile air (1.0 -> 0.45), then quenches to 0.0 on agar touch!
          const airCool = 1.0 - 0.55 * eased(0.264, 0.269, p);
          const agarQuench = 1.0 - eased(0.269, 0.2735, p);
          uHeat = airCool * agarQuench;
          agarCoolTouch = touchMargin;

        } else if (p < 0.281) {
          // STAGE 3A: HARVEST INOCULUM FROM COLONY LEADING EDGE (p = 0.275 -> 0.281)
          // Now cool & sterile (uHeat = 0), glide from sterile agar edge onto the active colony margin
          const glideToColony = eased(0.275, 0.278, p);
          const harvestDip = Math.sin(eased(0.276, 0.281, p) * Math.PI);
          lx = lerp(sterileAgarEdge[0], colonyLeadingEdge[0], glideToColony);
          ly = lerp(sterileAgarEdge[1], colonyLeadingEdge[1], glideToColony);
          lz = colonyLeadingEdge[2] + 0.008 * (1.0 - harvestDip);
          rotY = -0.10 * harvestDip;
          uHeat = 0.0;

        } else if (p <= 0.304) {
          // STAGE 3B: ASEPTIC TRANSFER ACROSS STERILE ZONE TO ISOLATE PLATE (p = 0.281 -> 0.304)
          const transferArc = eased(0.281, 0.304, p);
          lx = lerp(colonyLeadingEdge[0], 8.038, transferArc);
          ly = -0.20 - 0.024 * Math.sin(Math.PI * transferArc);
          lz = 1.290 + 0.078 * Math.sin(Math.PI * transferArc);
          rotY = 0.14 * Math.sin(Math.PI * transferArc);
          uHeat = 0.0;

        } else if (p <= 0.324) {
          // STAGE 4: SINUSOIDAL STREAK INOCULATION ON ISOLATE PLATE C_Petri_1 (p = 0.304 -> 0.324)
          // Trace the exact 5-lobe sinusoidal streak pattern across [8.038 -> 8.082, -0.20, 1.2895]
          const uStreak = eased(0.304, 0.324, p);
          lx = 8.038 + uStreak * 0.044;
          ly = -0.20 + Math.sin(uStreak * Math.PI * 5.0) * (0.024 * (1.0 - uStreak * 0.42));
          lz = 1.2896;
          rotY = 0.06 * Math.cos(uStreak * Math.PI * 5.0);
          rotZ = 0.14 * Math.sin(uStreak * Math.PI * 5.0);
          uHeat = 0.0;

        } else {
          // STAGE 5: POST-INOCULATION TERMINAL FLAME STERILIZATION (p = 0.324 -> 0.358)
          // Lift loop from Isolate Plate (0.324 -> 0.331), insert back into the Bunsen flame tip
          // (0.331 -> 0.348) until glowing bright incandescent orange again to incinerate remaining cells,
          // then withdraw slightly (0.348 -> 0.358) to cool!
          const returnToFlame = eased(0.324, 0.331, p);
          const withdrawAfter = eased(0.348, 0.357, p);
          const holdRotate = Math.sin(eased(0.331, 0.348, p) * Math.PI * 2.0);

          const targetX = lerp(fx, fx + 0.042, withdrawAfter);
          const targetY = lerp(fy, fy - 0.022, withdrawAfter);
          const targetZ = lerp(fz, fz + 0.036, withdrawAfter);

          lx = lerp(8.082, targetX, returnToFlame) + 0.003 * holdRotate * (1.0 - withdrawAfter);
          ly = lerp(-0.20, targetY, returnToFlame) + 0.002 * holdRotate * (1.0 - withdrawAfter);
          lz = lerp(1.290, targetZ, returnToFlame) + 0.032 * Math.sin(returnToFlame * Math.PI);
          rotY = lerp(0.06, -0.18, returnToFlame);
          rotZ = lerp(0.0, 0.12, returnToFlame) + 0.08 * holdRotate;

          // Re-heat rapidly to full orange incandescence (uHeat = 1.0) inside the Bunsen flame,
          // then begin cooling as it withdraws after p = 0.348
          const reHeatUp = eased(0.330, 0.338, p);
          const postCool = 1.0 - 0.65 * eased(0.349, 0.358, p);
          uHeat = reHeatUp * postCool;
          inFlameContact = eased(0.329, 0.332, p) * (1.0 - eased(0.347, 0.350, p));
        }

        loopToolRef.current.position.set(lx, ly, lz);
        loopToolRef.current.rotation.set(rotX, rotY, rotZ);

        // Update wire thermal shader & orange halo aura
        wireLoopMat.uniforms.uHeat.value = uHeat;
        if (loopHaloRef.current) {
          loopHaloRef.current.visible = uHeat > 0.04;
          loopHaloMat.opacity = 0.62 * Math.pow(uHeat, 1.3);
        }
        if (loopGlowLightRef.current) {
          loopGlowLightRef.current.intensity = 0.85 * Math.pow(uHeat, 1.2);
        }

        // Show harvested white biological film inside the circular loop ring during pickup & transfer,
        // and gradually deposit/shrink it onto the agar as streaking progresses (0.304 -> 0.323)
        if (loopSampleRef.current) {
          const hasSample = p >= 0.277 && p <= 0.323;
          loopSampleRef.current.visible = hasSample;
          if (hasSample) {
            const pickupScale = eased(0.277, 0.281, p);
            const depositDeplete = 1.0 - 0.85 * eased(0.304, 0.323, p);
            const s = Math.max(0.1, pickupScale * depositDeplete);
            loopSampleRef.current.scale.set(s, 1.0, s);
          }
        }
      }
    }

    // Condensation / cooling vapor puff on sterile agar edge during Stage 2 cooling touch
    if (coolSteamRef.current) {
      coolSteamRef.current.visible = agarCoolTouch > 0.02;
      if (agarCoolTouch > 0.02) {
        const expand = 1.0 + 1.4 * eased(0.269, 0.275, p);
        coolSteamRef.current.scale.set(expand, expand, 1.0);
        coolSteamMat.opacity = 0.48 * agarCoolTouch;
      }
    }

    if (streakTrackRef.current) {
      const streakVis = inZoneC && p >= 0.304;
      streakTrackRef.current.visible = streakVis;
      if (streakVis) {
        streakTrackMat.opacity = 0.58 * eased(0.304, 0.323, p);
      }
    }

    if (flameRef.current) {
      flameRef.current.visible = inZoneC;
      if (inZoneC) {
        const flickerZ = 0.94 + 0.06 * Math.sin(t * 24.0) + 0.03 * Math.cos(t * 37.0);
        const flickerXY = 0.97 + 0.03 * Math.cos(t * 19.0);
        flameRef.current.scale.set(flickerXY, flickerXY, flickerZ);
        flameRef.current.position.z = (1.0 - flickerZ) * -BUNSEN_BURNER_POS[2];
      }
    }

    // Orange sodium/metal ionization flare when the inoculation loop is inside the Bunsen flame
    if (flameReactionRef.current) {
      flameReactionRef.current.visible = inZoneC && inFlameContact > 0.02;
      if (inFlameContact > 0.02) {
        const flareFlicker = 0.90 + 0.14 * Math.sin(t * 32.0);
        flameReactionMat.opacity = 0.68 * inFlameContact * flareFlicker;
      }
    }
  });

  return (
    <>
      <mesh geometry={batchedHardware.glassGeo} material={glassMat} />
      <mesh geometry={batchedHardware.steelGeo} material={steelMat} />
      <mesh geometry={batchedHardware.brassGeo} material={brassChuckMat} />
      <mesh geometry={batchedHardware.darkHoseGeo} material={gripMat} />
      <mesh geometry={batchedHardware.coreGeo} material={hyphaMat} />

      {/* Multi-Zone Laboratory Bunsen Burner Flame (Inner Cyan Reducing Cone + Outer Blue Oxidizing Mantle) */}
      <group ref={flameRef} visible={false}>
        <mesh geometry={batchedHardware.outerFlameGeo} material={bunsenOuterFlameMat} />
        <mesh geometry={batchedHardware.innerConeGeo} material={bunsenInnerConeMat} />
      </group>

      {/* Reactive Orange Ionization Plume when Inoculation Loop is Heated in the Flame */}
      <mesh ref={flameReactionRef} geometry={batchedHardware.flameReactionGeo} material={flameReactionMat} visible={false} />

      {/* Sterile Agar Margin Cooling Condensation Ring on C_Petri_0 */}
      <mesh ref={coolSteamRef} position={[6.860, -0.214, 1.2902]} material={coolSteamMat} visible={false}>
        <ringGeometry args={[0.0025, 0.0095, 24]} />
      </mesh>

      <mesh ref={streakTrackRef} geometry={batchedHardware.streakGeo} material={streakTrackMat} visible={false} />

      {/* Source Plate Radial Rhizomorphic Mycelium Colony centered directly on C_Petri_0 agar (z = 1.2890) */}
      <group ref={sourceGroupRef} position={[SOURCE_PLATE[0], SOURCE_PLATE[1], 1.2890]} visible={false}>
        <mesh scale={[0.041, 0.041, 1]} material={sourceColonyMat}>
          <circleGeometry args={[1, 36]} />
        </mesh>
        <mesh ref={sourceRhizoRef} geometry={sourceRhizoGeo} material={hyphaMat} />
      </group>

      {/* Isolate Plate Pure-Strain Mycelium Colony centered directly on C_Petri_1 agar (z = 1.2890) */}
      <group ref={isolateGroupRef} position={[ISOLATE_PLATE[0], ISOLATE_PLATE[1], 1.2890]} visible={false}>
        <mesh scale={[0.036, 0.036, 1]} material={isolateColonyMat}>
          <circleGeometry args={[1, 36]} />
        </mesh>
        <mesh ref={isolateRhizoRef} geometry={isolateRhizoGeo} material={hyphaMat} />
      </group>

      {/* Verification anchor group */}
      <group ref={transfer} visible={false} />

      {/* One-Piece Collinear Microbiological Inoculation Loop (Aşılama Özesi) */}
      <group ref={loopToolRef} visible={false}>
        {/* Warm orange incandescent point light emitted by the hot wire loop tip */}
        <pointLight ref={loopGlowLightRef} position={[0, 0.008, 0.012]} color="#ff6210" intensity={0} distance={0.42} decay={2} />
        {/* Tilt the entire coaxial Y-aligned tool around its tip (0,0,0) as a single rigid body */}
        <group rotation={[0.92, 0, -0.45]}>
          <mesh geometry={batchedHardware.wireLoopGeo} material={wireLoopMat} />
          <mesh ref={loopHaloRef} geometry={batchedHardware.loopHaloGeo} material={loopHaloMat} visible={false} />
          <mesh geometry={batchedHardware.brassChuckGeo} material={brassChuckMat} />
          <mesh geometry={batchedHardware.rubberGripGeo} material={gripMat} />
          <mesh geometry={batchedHardware.handleShaftGeo} material={handleMat} />
          {/* Harvested Biological Agar Film Held Right Inside the Circular Wire Loop Ring at (0, 0.0085, 0) */}
          <mesh ref={loopSampleRef} position={[0, 0.0085, 0]} rotation={[Math.PI / 2 + 0.25, 0, 0]} visible={false}>
            <cylinderGeometry args={[0.0076, 0.0076, 0.0018, 16]} />
            <meshStandardMaterial color="#f8f6ec" emissive="#c5e8cf" emissiveIntensity={0.28} roughness={0.5} />
          </mesh>
        </group>
      </group>
    </>
  );
}
