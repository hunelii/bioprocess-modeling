import assert from 'node:assert/strict';
import {
  isAllowedOrigin,
  validateHunerMessage,
  CELL_MATCHING_CONSTANTS
} from '../src/data/embedContract.js';

// 1. Origin verification checks
assert.equal(isAllowedOrigin('https://hunelii.github.io'), true, 'hunelii.github.io must be allowed');
assert.equal(isAllowedOrigin('http://localhost:3000'), true, 'localhost:3000 must be allowed');
assert.equal(isAllowedOrigin('http://localhost:5173'), true, 'localhost:5173 must be allowed');
assert.equal(isAllowedOrigin('https://localhost'), true, 'https://localhost must be allowed');
assert.equal(isAllowedOrigin('http://127.0.0.1:8080'), true, '127.0.0.1 must be allowed');

assert.equal(isAllowedOrigin('https://evil.com'), false, 'evil.com must be rejected');
assert.equal(isAllowedOrigin('https://github.com'), false, 'unauthorized origin must be rejected');
assert.equal(isAllowedOrigin('null'), false, 'null string origin must be rejected');
assert.equal(isAllowedOrigin(null), false, 'null origin must be rejected');
assert.equal(isAllowedOrigin(undefined), false, 'undefined origin must be rejected');
assert.equal(isAllowedOrigin(''), false, 'empty origin must be rejected');

// 2. Message schema & clamping checks
// huner:progress
const pNormal = validateHunerMessage({ type: 'huner:progress', p: 0.45 });
assert.deepEqual(pNormal, { type: 'huner:progress', p: 0.45 });

const pNegative = validateHunerMessage({ type: 'huner:progress', p: -0.3 });
assert.deepEqual(pNegative, { type: 'huner:progress', p: 0 });

const pOverflow = validateHunerMessage({ type: 'huner:progress', p: 1.7 });
assert.deepEqual(pOverflow, { type: 'huner:progress', p: 1 });

assert.equal(validateHunerMessage({ type: 'huner:progress', p: 'invalid' }), null);
assert.equal(validateHunerMessage({ type: 'huner:progress', p: NaN }), null);

// huner:handoff
const tNormal = validateHunerMessage({ type: 'huner:handoff', t: 0.8 });
assert.deepEqual(tNormal, { type: 'huner:handoff', t: 0.8 });

const tNegative = validateHunerMessage({ type: 'huner:handoff', t: -2.5 });
assert.deepEqual(tNegative, { type: 'huner:handoff', t: 0 });

const tOverflow = validateHunerMessage({ type: 'huner:handoff', t: 3.0 });
assert.deepEqual(tOverflow, { type: 'huner:handoff', t: 1 });

assert.equal(validateHunerMessage({ type: 'huner:handoff', t: 'invalid' }), null);

// huner:visibility
const vTrue = validateHunerMessage({ type: 'huner:visibility', visible: true });
assert.deepEqual(vTrue, { type: 'huner:visibility', visible: true });

const vFalse = validateHunerMessage({ type: 'huner:visibility', visible: false });
assert.deepEqual(vFalse, { type: 'huner:visibility', visible: false });

assert.equal(validateHunerMessage({ type: 'huner:visibility', visible: 'yes' }), null);

// unknown or invalid messages
assert.equal(validateHunerMessage({ type: 'unknown:type' }), null);
assert.equal(validateHunerMessage(null), null);
assert.equal(validateHunerMessage(123), null);
assert.equal(validateHunerMessage('test'), null);

// 3. Cell matching constants checks
assert.equal(CELL_MATCHING_CONSTANTS.colors.hunerBackground, '#22311d');
assert.equal(CELL_MATCHING_CONSTANTS.colors.bioprocessBackground, '#07120d');
assert.equal(CELL_MATCHING_CONSTANTS.camera.fovHandoff, 35.0);
assert.equal(CELL_MATCHING_CONSTANTS.camera.fovStation01, 32.0);
assert.deepEqual(CELL_MATCHING_CONSTANTS.geometry.sporeAnchor, [1.2, -0.03, 1.37]);

console.log(JSON.stringify({
  ok: true,
  check: 'embed-contract',
  originsVerified: true,
  clampingVerified: true,
  constantsVerified: true
}));
