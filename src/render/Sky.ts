import * as THREE from 'three';
import { SimplexNoise, mulberry32 } from '../world/noise';

const DAY_TOP = new THREE.Color(0x5d97e6);
const DAY_HORIZON = new THREE.Color(0xb9dcf5);
const DUSK_TOP = new THREE.Color(0x3c5a96);
const DUSK_HORIZON = new THREE.Color(0xf0a060);
const NIGHT_TOP = new THREE.Color(0x04070f);
const NIGHT_HORIZON = new THREE.Color(0x111a33);

const CLOUD_Y = 118;
const CLOUD_CELL = 8;
const CLOUD_GRID = 48;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function discTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Cielo con degradado, sol y luna cuadrados, estrellas y una capa de nubes que se desplaza. */
export class Sky {
  readonly group = new THREE.Group();
  readonly fogColor = new THREE.Color();
  daylight = 1;
  /** 0 de día, 1 en plena noche. */
  night = 0;

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private cloudMat: THREE.MeshBasicMaterial;
  private cloudOffset = 0;

  constructor(seed: number) {
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: DAY_TOP.clone() }, uHorizon: { value: DAY_HORIZON.clone() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0); float t = smoothstep(-0.05, 0.45, h); gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0); }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), this.domeMat);
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    const sunTex = discTexture((ctx) => {
      ctx.fillStyle = 'rgba(255,220,120,0.25)';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(6, 6, 20, 20);
      ctx.fillStyle = '#ffe07a';
      ctx.fillRect(9, 9, 14, 14);
    });
    const moonTex = discTexture((ctx) => {
      ctx.fillStyle = '#dfe6f2';
      ctx.fillRect(8, 8, 16, 16);
      ctx.fillStyle = '#b4bccb';
      ctx.fillRect(11, 11, 4, 4);
      ctx.fillRect(18, 16, 3, 3);
      ctx.fillRect(13, 19, 2, 2);
    });
    const sprite = (tex: THREE.Texture, size: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
      );
      m.renderOrder = -9;
      return m;
    };
    this.sun = sprite(sunTex, 70);
    this.moon = sprite(moonTex, 50);
    this.group.add(this.sun, this.moon);

    const rand = mulberry32(seed ^ 0x57a2);
    const starPos: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      if (u < -0.05) continue;
      starPos.push(Math.cos(a) * r * 390, u * 390, Math.sin(a) * r * 390);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.stars.renderOrder = -9;
    this.group.add(this.stars);

    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.9, fog: false });
    this.clouds = new THREE.Mesh(this.buildClouds(seed), this.cloudMat);
    this.clouds.renderOrder = 2;
    this.group.add(this.clouds);
  }

  private buildClouds(seed: number): THREE.BufferGeometry {
    const noise = new SimplexNoise(seed ^ 0xc10d);
    const filled = (x: number, z: number) => {
      const gx = ((x % CLOUD_GRID) + CLOUD_GRID) % CLOUD_GRID;
      const gz = ((z % CLOUD_GRID) + CLOUD_GRID) % CLOUD_GRID;
      // Ruido sobre un toro para que la capa se repita sin costuras.
      const a = (gx / CLOUD_GRID) * Math.PI * 2;
      const b = (gz / CLOUD_GRID) * Math.PI * 2;
      const n = noise.noise3(Math.cos(a) * 1.3, Math.sin(a) * 1.3 + Math.cos(b) * 1.3, Math.sin(b) * 1.3)
        + 0.4 * noise.noise3(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3 + 7);
      return n > 0.2;
    };
    // Sólo se generan las caras exteriores de cada celda: sin solapes visibles con transparencia.
    const pos: number[] = [];
    const col: number[] = [];
    const c = CLOUD_CELL;
    const half = (CLOUD_GRID * c) / 2;
    const quad = (pts: number[][], shade: number) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(pts[i][0], pts[i][1], pts[i][2]);
        col.push(shade, shade, shade);
      }
    };
    for (let z = 0; z < CLOUD_GRID; z++) {
      for (let x = 0; x < CLOUD_GRID; x++) {
        if (!filled(x, z)) continue;
        const x0 = x * c - half, x1 = x0 + c, z0 = z * c - half, z1 = z0 + c, y0 = 0, y1 = 4;
        quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 1);
        quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0.78);
        if (!filled(x + 1, z)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.88);
        if (!filled(x - 1, z)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.88);
        if (!filled(x, z + 1)) quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.92);
        if (!filled(x, z - 1)) quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.92);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  setCloudsVisible(v: boolean): void {
    this.clouds.visible = v;
  }

  /** Actualiza colores y astros. `time` en [0, 1): 0 amanecer, 0.25 mediodía, 0.5 ocaso. */
  update(time: number, camera: THREE.Camera, dt: number): void {
    const angle = time * Math.PI * 2;
    const elevation = Math.sin(angle);
    const dayT = smoothstep(-0.18, 0.28, elevation);
    this.daylight = 0.34 + 0.66 * dayT;
    this.night = 1 - smoothstep(-0.3, 0.05, elevation);
    const dusk = Math.max(0, 1 - Math.abs(elevation) / 0.35) * (1 - this.night * 0.6);

    const top = NIGHT_TOP.clone().lerp(DAY_TOP, dayT).lerp(DUSK_TOP, dusk * 0.5);
    const horizon = NIGHT_HORIZON.clone().lerp(DAY_HORIZON, dayT).lerp(DUSK_HORIZON, dusk * 0.7);
    this.domeMat.uniforms.uTop.value.copy(top);
    this.domeMat.uniforms.uHorizon.value.copy(horizon);
    this.fogColor.copy(horizon);

    const cam = camera.position;
    this.dome.position.copy(cam);
    this.stars.position.copy(cam);
    this.stars.rotation.z = angle * 0.5;
    (this.stars.material as THREE.PointsMaterial).opacity = this.night;

    const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.25).normalize();
    this.sun.position.copy(cam).addScaledVector(dir, 360);
    this.sun.lookAt(cam);
    this.moon.position.copy(cam).addScaledVector(dir, -360);
    this.moon.lookAt(cam);

    this.cloudOffset = (this.cloudOffset + dt * 1.2) % (CLOUD_CELL * CLOUD_GRID);
    const span = CLOUD_CELL * CLOUD_GRID;
    const snap = (v: number) => Math.round(v / span) * span;
    this.clouds.position.set(snap(cam.x - this.cloudOffset) + this.cloudOffset, CLOUD_Y, snap(cam.z));
    const cloudShade = 0.35 + 0.65 * dayT;
    this.cloudMat.color.setRGB(cloudShade, cloudShade, cloudShade * 1.02);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) {
        const map = (mat as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
  }
}
