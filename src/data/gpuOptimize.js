import * as THREE from 'three';

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Clones and transforms a BufferGeometry in-place for static draw-call batching.
 */
export function transformGeo(geometry, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  _pos.set(pos[0], pos[1], pos[2]);
  _euler.set(rot[0], rot[1], rot[2]);
  _quat.setFromEuler(_euler);
  if (typeof scale === 'number') {
    _scale.set(scale, scale, scale);
  } else {
    _scale.set(scale[0], scale[1], scale[2]);
  }
  _mat.compose(_pos, _quat, _scale);
  g.applyMatrix4(_mat);
  return g;
}

/**
 * Merges an array of BufferGeometries into a single BufferGeometry (1 GPU draw call).
 */
export function mergeGeometriesFast(geometries) {
  if (!geometries || geometries.length === 0) return new THREE.BufferGeometry();
  const nonIndexed = geometries.map(g => {
    const ni = g.index ? g.toNonIndexed() : g;
    if (!ni.attributes.normal) ni.computeVertexNormals();
    return ni;
  });
  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  let offset3 = 0;
  let offset2 = 0;
  for (const g of nonIndexed) {
    const count = g.attributes.position.count;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    positions.set(p, offset3);
    normals.set(n, offset3);
    if (g.attributes.uv && g.attributes.uv.array.length >= count * 2) {
      uvs.set(g.attributes.uv.array.subarray(0, count * 2), offset2);
    } else {
      // Synthesize clean spatial UVs from vertex positions when a custom geometry lacks explicit UVs
      for (let i = 0; i < count; i++) {
        uvs[offset2 + i * 2] = p[i * 3] + p[i * 3 + 1] * 0.5;
        uvs[offset2 + i * 2 + 1] = p[i * 3 + 2] + p[i * 3 + 1] * 0.5;
      }
    }
    offset3 += count * 3;
    offset2 += count * 2;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Single-pass environment-mapped laboratory glass material.
 * Avoids Three.js multi-pass WebGL transmission FBO redraws so integrated GPUs stay at 60 FPS.
 */
export function createFastGlassMaterial({
  color = '#e4f8ed',
  emissive = '#163826',
  emissiveIntensity = 0.12,
  opacity = 0.42,
  roughness = 0.05,
  metalness = 0.14,
  envMapIntensity = 2.1,
  side = THREE.FrontSide
} = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness,
    envMapIntensity,
    transparent: true,
    opacity,
    depthWrite: false,
    side
  });
}
