import * as THREE from 'three';

const vertexShader = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aShade;
attribute vec2 aLight;
varying vec2 vUv;
varying vec3 vShade;
varying vec2 vLight;
varying float vFogDepth;
void main() {
  vUv = aUv;
  vShade = aShade;
  vLight = aLight;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vShade;
varying vec2 vLight;
varying float vFogDepth;
void main() {
  vec4 tex = texture2D(map, vUv);
  #ifdef ALPHA_CUTOUT
  if (tex.a < 0.5) discard;
  #endif
  // Luz del cielo escalada por la hora del día; luz de antorcha con tono cálido.
  float sky = vLight.x * uDaylight;
  vec3 light = max(vec3(sky), vLight.y * vec3(1.0, 0.84, 0.6));
  light = max(light * (0.5 + 0.5 * light), vec3(0.07));
  vec3 color = tex.rgb * vShade * light;
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  gl_FragColor = vec4(mix(color, uFogColor, fog), tex.a * uAlpha);
}
`;

export interface ChunkMaterials {
  opaque: THREE.ShaderMaterial;
  water: THREE.ShaderMaterial;
  setDaylight(value: number): void;
  setFog(color: THREE.Color, near: number, far: number): void;
  dispose(): void;
}

export function createChunkMaterials(atlas: THREE.Texture): ChunkMaterials {
  const shared = {
    map: { value: atlas },
    uDaylight: { value: 1 },
    uFogColor: { value: new THREE.Color(0xbfd9f2) },
    uFogNear: { value: 40 },
    uFogFar: { value: 80 },
  };
  const opaque = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlpha: { value: 1 } },
    vertexShader,
    fragmentShader,
    defines: { ALPHA_CUTOUT: 1 },
  });
  const water = new THREE.ShaderMaterial({
    uniforms: { ...shared, uAlpha: { value: 0.82 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return {
    opaque,
    water,
    setDaylight(value) {
      shared.uDaylight.value = value;
    },
    setFog(color, near, far) {
      shared.uFogColor.value.copy(color);
      shared.uFogNear.value = near;
      shared.uFogFar.value = far;
    },
    dispose() {
      opaque.dispose();
      water.dispose();
    },
  };
}
