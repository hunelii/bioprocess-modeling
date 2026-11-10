import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { transformGeo, mergeGeometriesFast, createFastGlassMaterial } from '../data/gpuOptimize.js';
import { myceliumVertexShader, myceliumFragmentShader, buildTapered3DRhizomorphs } from './PetriLookdev.jsx';

// Locked glTF stations: C_Petri_0 (6.89,-.20,1.285) and C_Petri_1 (8.06,-.20,1.285).
// Features a scientifically accurate 5-Stage Aseptic Microbiological Inoculation Loop & Bunsen Burner Protocol:
// 1. Pre-Inoculation Flame Sterilization (Loop tip heated in blue Bunsen flame until ONLY the loop tip glows orange)
// 2. Aseptic Cooling (Cooled in sterile air & touched to unseeded sterile agar margin of Source Plate until metallic)
// 3. Inoculum Harvest & Aseptic Transfer (Pick up culture from leading edge of C_Petri_0 & carry across sterile zone)
// 4. Sinusoidal Streak Plate Inoculation (Streak inoculum across C_Petri_1 agar surface)
// 5. Post-Inoculation Terminal Flame Sterilization (Return loop tip to blue Bunsen flame until loop tip glows orange again)
export const SOURCE_PLATE = [6.89,-.20,1.285];
export const ISOLATE_PLATE = [8.06,-.20,1.285];
export const BUNSEN_BURNER_POS = [7.80, -0.145, 1.236];
export const BUNSEN_NOZZLE_TOP = [7.80, -0.145, 1.350];
export const BUNSEN_FLAME_TIP = [7.7945, -0.1495, 1.366];

const eased = (a,b,p) => {const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
const lerp = (a,b,t)=>a+(b-a)*t;

// Tip-Only Blackbody Thermal Incandescence Shader for the Platinum/Nichrome Inoculation Loop Wire
// Strictly restricts the orange incandescence to the circular loop tip (vLocalY = 0.0 .. 0.022m)
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

    // Strictly localize thermal incandescence to the circular loop tip (vLocalY = 0.0 .. 0.020m)
    // and top 5mm weld neck (0.020 .. 0.026m), keeping the rest of the wire shaft cool metallic!
    float tipRingMask = 1.0 - smoothstep(0.016, 0.026, vLocalY);
    float apexBoost = 1.0 - smoothstep(0.0, 0.014, vLocalY);
    float localTemp = clamp(uHeat * (tipRingMask * 0.92 + apexBoost * 0.18), 0.0, 1.0);

    // Planck Blackbody Incandescence on the wire tip:
    // 0.00 -> 0.30: Cool metallic -> Dark cherry red (#801000)
    // 0.30 -> 0.70: Dark cherry red -> Luminous orange-red (#ff4c00)
    // 0.70 -> 1.00: Luminous orange-red -> Incandescent yellow-orange (#ffae28)
    vec3 darkRed = vec3(0.55, 0.06, 0.0);
    vec3 brightOrange = vec3(1.0, 0.32, 0.02);
    vec3 yellowOrange = vec3(1.0, 0.74, 0.18);

    vec3 glowCol = mix(darkRed, brightOrange, smoothstep(0.15, 0.65, localTemp));
    glowCol = mix(glowCol, yellowOrange, smoothstep(0.65, 1.0, localTemp));

    float glowStrength = smoothstep(0.04, 0.92, localTemp);
    vec3 finalCol = mix(coolMetal, glowCol * (1.25 + 0.45 * localTemp), glowStrength);

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
  const loopTipHaloRef = useRef();
  const streakTrackRef = useRef();
  const flameRef = useRef();
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

  // Tip-only thermal incandescence shader material for the inoculation loop wire
  const wireLoopMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uHeat: { value: 0.0 },
      uTime: { value: 0.0 }
    },
    vertexShader: wireLoopVertexShader,
    fragmentShader: wireLoopFragmentShader
  }), []);

  // Tight, subtle orange incandescence aura strictly on the circular wire loop tip (no stray light on table)
  const loopTipHaloMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff6814',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  const bunsenOuterFlameMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#3492ff',
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  const bunsenInnerConeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#5efaff',
    transparent: true,
    opacity: 0.84,
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

    // Tight tip-only thermal halo hugging ONLY the circular wire loop ring at (0, 0.0085, 0)
    const loopTipHaloGeo = transformGeo(new THREE.TorusGeometry(0.0085, 0.0024, 12, 32), [0, 0.0085, 0], [0.25, 0, 0]);

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
      // Castellated flame-stabilizer crown nozzle at top of barrel (top at z = bz + 0.114 = 1.350)
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

    // IMPORTANT: Build Bunsen flame geometries in LOCAL coordinates relative to BUNSEN_NOZZLE_TOP (0, 0, 0)
    // so that scaling `flameRef` for flicker keeps the flame 100% locked onto the top of the burner nozzle!
    const outerFlameGeo = mergeGeometriesFast([
      transformGeo(new THREE.ConeGeometry(0.0108, 0.052, 16), [0, 0, 0.026], [Math.PI / 2, 0, 0]),
      transformGeo(new THREE.SphereGeometry(0.0088, 12, 10), [0, 0, 0.006], [0, 0, 0], [1, 1, 1.35])
    ]);
    const innerConeGeo = transformGeo(new THREE.ConeGeometry(0.0058, 0.026, 14), [0, 0, 0.013], [Math.PI / 2, 0, 0]);

    // Zigzag Inoculation Streak Track (Ekme İzi) on the Isolate Plate C_Petri_1 agar surface [8.06, -0.20, 1.2891]
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
      loopTipHaloGeo,
      brassChuckGeo,
      handleShaftGeo,
      rubberGripGeo,
      outerFlameGeo,
      innerConeGeo,
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
    // SCIENTIFIC 5-STAGE ASEPTIC INOCULATION LOOP CHOREOGRAPHY (p = 0.258 -> 0.356)
    // =========================================================================
    const [fx, fy, fz] = BUNSEN_FLAME_TIP; // [7.80, -0.145, 1.368]
    const sterileAgarEdge = [6.860, -0.214, 1.2892]; // Uncolonized sterile agar periphery on C_Petri_0
    const colonyLeadingEdge = [6.906, -0.200, 1.2892]; // Active mycelial margin on C_Petri_0

    let uHeat = 0.0;
    let agarCoolTouch = 0.0;

    if (loopToolRef.current) {
      const showLoop = p >= 0.256 && p <= 0.356;
      loopToolRef.current.visible = showLoop;
      if (showLoop) {
        let lx = fx, ly = fy, lz = fz, rotX = 0, rotY = 0, rotZ = 0;

        if (p < 0.278) {
          // STAGE 1: PRE-INOCULATION FLAME STERILIZATION (p = 0.256 -> 0.278)
          // Hold inoculation loop tip directly inside the blue Bunsen burner flame at [7.80, -0.145, 1.368]
          // while the camera frames the Zone C bench (0.262..0.278). ONLY the loop tip glows orange!
          const enterFlame = eased(0.256, 0.263, p);
          const sweepInFlame = Math.sin(eased(0.263, 0.277, p) * Math.PI * 2.0);
          lx = lerp(fx + 0.035, fx, enterFlame) + 0.0025 * sweepInFlame;
          ly = lerp(fy - 0.020, fy, enterFlame) + 0.0015 * sweepInFlame;
          lz = lerp(fz + 0.028, fz, enterFlame);
          rotY = -0.16 + 0.05 * sweepInFlame;
          rotZ = 0.10;

          // Loop tip heats up rapidly inside the flame to bright orange incandescence (uHeat = 1.0)
          uHeat = eased(0.259, 0.267, p);

        } else if (p < 0.289) {
          // STAGE 2: ASEPTIC COOLING IN STERILE UPDRAFT & AGAR MARGIN TOUCH (p = 0.278 -> 0.289)
          // Move loop out of the Bunsen flame over to the sterile uncolonized agar edge of C_Petri_0
          // (0.278 -> 0.284) as the orange tip cools down, then touch the sterile agar margin
          // (0.284 -> 0.289) until completely cooled (uHeat = 0.0) before contacting live cells!
          const moveToMargin = eased(0.278, 0.284, p);
          const touchMargin = Math.sin(eased(0.283, 0.289, p) * Math.PI);
          lx = lerp(fx, sterileAgarEdge[0], moveToMargin);
          ly = lerp(fy, sterileAgarEdge[1], moveToMargin);
          lz = lerp(fz, sterileAgarEdge[2] + 0.016, moveToMargin) + 0.038 * Math.sin(moveToMargin * Math.PI) - 0.016 * touchMargin;
          rotY = lerp(-0.16, -0.08, moveToMargin);
          rotZ = lerp(0.10, 0.0, moveToMargin);

          // Tip glow cools in sterile air (1.0 -> 0.42), then quenches to 0.0 on sterile agar touch!
          const airCool = 1.0 - 0.58 * eased(0.278, 0.283, p);
          const agarQuench = 1.0 - eased(0.283, 0.2875, p);
          uHeat = airCool * agarQuench;
          agarCoolTouch = touchMargin;

        } else if (p < 0.294) {
          // STAGE 3A: HARVEST INOCULUM FROM COLONY LEADING EDGE (p = 0.289 -> 0.294)
          // Now 100% cooled & sterile (uHeat = 0), glide onto the active colony margin on C_Petri_0
          const glideToColony = eased(0.289, 0.2915, p);
          const harvestDip = Math.sin(eased(0.290, 0.294, p) * Math.PI);
          lx = lerp(sterileAgarEdge[0], colonyLeadingEdge[0], glideToColony);
          ly = lerp(sterileAgarEdge[1], colonyLeadingEdge[1], glideToColony);
          lz = colonyLeadingEdge[2] + 0.007 * (1.0 - harvestDip);
          rotY = -0.10 * harvestDip;
          uHeat = 0.0;

        } else if (p <= 0.307) {
          // STAGE 3B: ASEPTIC TRANSFER ACROSS STERILE ZONE TO ISOLATE PLATE (p = 0.294 -> 0.307)
          const transferArc = eased(0.294, 0.307, p);
          lx = lerp(colonyLeadingEdge[0], 8.038, transferArc);
          ly = -0.20 - 0.024 * Math.sin(Math.PI * transferArc);
          lz = 1.290 + 0.072 * Math.sin(Math.PI * transferArc);
          rotY = 0.12 * Math.sin(Math.PI * transferArc);
          uHeat = 0.0;

        } else if (p <= 0.324) {
          // STAGE 4: SINUSOIDAL STREAK INOCULATION ON ISOLATE PLATE C_Petri_1 (p = 0.307 -> 0.324)
          // Trace the 5-lobe sinusoidal streak pattern across [8.038 -> 8.082, -0.20, 1.2896]
          const uStreak = eased(0.307, 0.324, p);
          lx = 8.038 + uStreak * 0.044;
          ly = -0.20 + Math.sin(uStreak * Math.PI * 5.0) * (0.024 * (1.0 - uStreak * 0.42));
          lz = 1.2896;
          rotY = 0.06 * Math.cos(uStreak * Math.PI * 5.0);
          rotZ = 0.14 * Math.sin(uStreak * Math.PI * 5.0);
          uHeat = 0.0;

        } else {
          // STAGE 5: POST-INOCULATION TERMINAL FLAME STERILIZATION (p = 0.324 -> 0.356)
          // Lift loop from Isolate Plate (0.324 -> 0.331), insert tip back into the blue Bunsen flame
          // (0.331 -> 0.348) until ONLY the loop tip glows bright incandescent orange again,
          // then withdraw slightly (0.348 -> 0.356) to cool!
          const returnToFlame = eased(0.324, 0.331, p);
          const withdrawAfter = eased(0.348, 0.356, p);
          const holdRotate = Math.sin(eased(0.331, 0.348, p) * Math.PI * 2.0);

          const targetX = lerp(fx, fx + 0.038, withdrawAfter);
          const targetY = lerp(fy, fy - 0.020, withdrawAfter);
          const targetZ = lerp(fz, fz + 0.032, withdrawAfter);

          lx = lerp(8.082, targetX, returnToFlame) + 0.0025 * holdRotate * (1.0 - withdrawAfter);
          ly = lerp(-0.20, targetY, returnToFlame) + 0.0015 * holdRotate * (1.0 - withdrawAfter);
          lz = lerp(1.290, targetZ, returnToFlame) + 0.028 * Math.sin(returnToFlame * Math.PI);
          rotY = lerp(0.06, -0.16, returnToFlame);
          rotZ = lerp(0.0, 0.10, returnToFlame) + 0.06 * holdRotate;

          // Re-heat loop tip rapidly to full orange incandescence (uHeat = 1.0) inside the Bunsen flame
          const reHeatUp = eased(0.330, 0.336, p);
          const postCool = 1.0 - 0.70 * eased(0.349, 0.356, p);
          uHeat = reHeatUp * postCool;
        }

        loopToolRef.current.position.set(lx, ly, lz);
        loopToolRef.current.rotation.set(rotX, rotY, rotZ);

        // Update wire tip thermal shader & tight tip-only ring halo
        wireLoopMat.uniforms.uHeat.value = uHeat;
        if (loopTipHaloRef.current) {
          loopTipHaloRef.current.visible = uHeat > 0.05;
          loopTipHaloMat.opacity = 0.52 * Math.pow(uHeat, 1.3);
        }

        // Show harvested white biological film inside the circular loop ring during pickup & transfer,
        // and gradually deposit/shrink it onto the agar as streaking progresses (0.307 -> 0.323)
        if (loopSampleRef.current) {
          const hasSample = p >= 0.291 && p <= 0.323;
          loopSampleRef.current.visible = hasSample;
          if (hasSample) {
            const pickupScale = eased(0.291, 0.294, p);
            const depositDeplete = 1.0 - 0.85 * eased(0.307, 0.323, p);
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
        const expand = 1.0 + 1.4 * eased(0.283, 0.289, p);
        coolSteamRef.current.scale.set(expand, expand, 1.0);
        coolSteamMat.opacity = 0.45 * agarCoolTouch;
      }
    }

    if (streakTrackRef.current) {
      const streakVis = inZoneC && p >= 0.307;
      streakTrackRef.current.visible = streakVis;
      if (streakVis) {
        streakTrackMat.opacity = 0.58 * eased(0.307, 0.323, p);
      }
    }

    // Bunsen burner flame group is anchored directly at BUNSEN_NOZZLE_TOP ([7.80, -0.145, 1.350]),
    // so scaling it for natural flame flicker NEVER displaces its world position!
    if (flameRef.current) {
      flameRef.current.visible = inZoneC;
      if (inZoneC) {
        const flickerZ = 0.94 + 0.06 * Math.sin(t * 24.0) + 0.03 * Math.cos(t * 37.0);
        const flickerXY = 0.96 + 0.04 * Math.cos(t * 19.0);
        flameRef.current.scale.set(flickerXY, flickerXY, flickerZ);
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

      {/* Multi-Zone Laboratory Bunsen Burner Flame anchored directly at BUNSEN_NOZZLE_TOP */}
      <group ref={flameRef} position={BUNSEN_NOZZLE_TOP} visible={false}>
        <mesh geometry={batchedHardware.outerFlameGeo} material={bunsenOuterFlameMat} />
        <mesh geometry={batchedHardware.innerConeGeo} material={bunsenInnerConeMat} />
      </group>

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
        {/* Tilt the entire coaxial Y-aligned tool around its tip (0,0,0) as a single rigid body */}
        <group rotation={[0.92, 0, -0.45]}>
          <mesh geometry={batchedHardware.wireLoopGeo} material={wireLoopMat} />
          <mesh ref={loopTipHaloRef} geometry={batchedHardware.loopTipHaloGeo} material={loopTipHaloMat} visible={false} />
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
