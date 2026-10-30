/**
 * EMBED-CONTRACT.js
 * Bioprocess 3D <-> Huner Biofoundry postMessage communication protocol and schema validation.
 */

export const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/hunelii\.github\.io$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/
];

/**
 * Checks whether the page is launched with ?embed=1 in the query string.
 */
export function isEmbedMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === '1';
  } catch (e) {
    return false;
  }
}

/**
 * Validates postMessage sender origin.
 * Strictly accepts https://hunelii.github.io and localhost (plus same origin).
 */
export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  if (origin === 'null') return false;
  if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

/**
 * Validates incoming message data from Huner parent window.
 * Returns sanitized message object or null if invalid / untrusted.
 */
export function validateHunerMessage(data) {
  if (!data || typeof data !== 'object') return null;

  switch (data.type) {
    case 'huner:progress': {
      if (typeof data.p !== 'number' || Number.isNaN(data.p)) return null;
      const p = Math.max(0, Math.min(1, data.p));
      return { type: 'huner:progress', p };
    }
    case 'huner:handoff': {
      if (typeof data.t !== 'number' || Number.isNaN(data.t)) return null;
      const t = Math.max(0, Math.min(1, data.t));
      return { type: 'huner:handoff', t };
    }
    case 'huner:visibility': {
      if (typeof data.visible !== 'boolean') return null;
      return { type: 'huner:visibility', visible: data.visible };
    }
    default:
      return null;
  }
}

/**
 * Notifies parent window that Bioprocess 3D is fully loaded and ready for rendering.
 */
export function sendBioprocessReady() {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
  window.parent.postMessage({
    type: 'bioprocess:ready',
    version: 1,
    stations: 8
  }, '*');
}

/**
 * Notifies parent window of a WebGL initialization or runtime failure.
 */
export function sendBioprocessError(reason) {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
  window.parent.postMessage({
    type: 'bioprocess:error',
    reason: String(reason || 'WebGL initialization failure')
  }, '*');
}

/**
 * Exact values used for visual cell matching between Huner Biofoundry and Bioprocess 3D.
 */
export const CELL_MATCHING_CONSTANTS = {
  colors: {
    hunerBackground: '#22311d', // RGB(34, 49, 29) - Huner's cell scene background
    bioprocessBackground: '#07120d', // RGB(7, 18, 13) - Bioprocess deep lab space
    chitinWall: '#6c8056', // Fungal chitin exterior shell
    chitinCutEdge: '#b8bc8b', // Cross-section cut rim
    membrane: '#607548', // Phospholipid bilayer
    cytoplasm: '#354c2b', // Intracellular matrix
    ribosome: '#b0b68d', // Instanced ribosomes
    nucleusEnvelope: '#a87b48', // Nuclear envelope
    nucleusEdge: '#d2b481', // Nuclear pores & nucleolus
    chromatin: '#74502d', // DNA chromatin strands
    vacuole: '#b7c59d', // Liquid vacuole
    mitoOuter: '#9eae76', // Mitochondria outer membrane
    mitoInner: '#57693d', // Mitochondria matrix
    mitoCristae: '#c0c893', // Folded cristae ridges
    peakGlow: '#d8ffb8' // Emissive luminescence peak at handoff t=0
  },
  geometry: {
    sporeAnchor: [1.2, -0.03, 1.37],
    specimenScale: [0.128, 0.082, 0.168],
    hunerEquivalentApertureFraction: 0.67, // Cell visual vertical height on screen
    apiculusHilumOffset: [-0.28, 0.0, -0.76]
  },
  rotation: {
    handoffStart: [-0.24, 0.22, -0.36], // Centered closed cell facing viewer at t=0
    station01Start: [-0.24, 0.22, -0.36] // Smoothly continues into Station 01
  },
  camera: {
    fovHandoff: 35.0, // Matches Huner FungalCell camera FOV (35 deg)
    fovStation01: 32.0, // Standard Bioprocess 3D camera FOV (32 deg)
    positionHandoff: [1.193, -0.56, 1.49], // Close-up distance ~0.54m centered on spore
    positionStation01: [1.18, -1.55, 1.72], // Normal Station 01 starting position
    target: [1.2, -0.03, 1.37] // Locked on SPORE_ANCHOR throughout handoff
  },
  lighting: {
    keyBeamDownwardDir: [-0.45, -0.35, 0.82],
    fillDir: [0.6, -0.5, -0.4],
    peakGlowIntensity: 2.8 // Peak internal glow at t=0, decays to 0.0 at t=1
  }
};
