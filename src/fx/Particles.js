import * as THREE from 'three';

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (320.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

/** 单个 GPU 粒子池（Points + 自定义着色器，支持逐粒子 alpha） */
class Pool {
  constructor(scene, capacity, blending) {
    this.cap = capacity;
    this.n = 0;
    this.px = new Float32Array(capacity * 3);
    this.vx = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grow = new Float32Array(capacity); // 尺寸随时间增量/秒

    this.posAttr = new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3);
    this.colAttr = new THREE.Float32BufferAttribute(new Float32Array(capacity * 3), 3);
    this.sizeAttr = new THREE.Float32BufferAttribute(new Float32Array(capacity), 1);
    this.alphaAttr = new THREE.Float32BufferAttribute(new Float32Array(capacity), 1);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('pcolor', this.colAttr);
    this.geo.setAttribute('size', this.sizeAttr);
    this.geo.setAttribute('alpha', this.alphaAttr);
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.size0 = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 3);

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, drag = 0, grow = 0) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else i = (Math.random() * this.cap) | 0; // 满了就覆盖随机一个
    const i3 = i * 3;
    this.px[i3] = x; this.px[i3 + 1] = y; this.px[i3 + 2] = z;
    this.vx[i3] = vx; this.vx[i3 + 1] = vy; this.vx[i3 + 2] = vz;
    this.life[i] = life; this.max[i] = life;
    this.size0[i] = size;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }

  update(dt) {
    const pa = this.posAttr.array, ca = this.colAttr.array,
          sa = this.sizeAttr.array, aa = this.alphaAttr.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // 与末尾交换，压缩
        const last = --this.n;
        this._copy(last, i);
        i--;
        continue;
      }
      const i3 = i * 3;
      const dragF = 1 - this.drag[i] * dt;
      this.vx[i3] *= dragF; this.vx[i3 + 1] *= dragF; this.vx[i3 + 2] *= dragF;
      this.vx[i3 + 1] -= this.grav[i] * dt;
      this.px[i3] += this.vx[i3] * dt;
      this.px[i3 + 1] += this.vx[i3 + 1] * dt;
      this.px[i3 + 2] += this.vx[i3 + 2] * dt;

      const t = this.life[i] / this.max[i]; // 1→0
      pa[i3] = this.px[i3]; pa[i3 + 1] = this.px[i3 + 1]; pa[i3 + 2] = this.px[i3 + 2];
      ca[i3] = this.col[i3]; ca[i3 + 1] = this.col[i3 + 1]; ca[i3 + 2] = this.col[i3 + 2];
      sa[i] = this.size0[i] + (1 - t) * this.grow[i];
      aa[i] = t;
    }
    this.geo.setDrawRange(0, this.n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  _copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.px[t3 + k] = this.px[f3 + k];
      this.vx[t3 + k] = this.vx[f3 + k];
      this.col[t3 + k] = this.col[f3 + k];
    }
    this.life[to] = this.life[from];
    this.max[to] = this.max[from];
    this.size0[to] = this.size0[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.grow[to] = this.grow[from];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

/** 高层特效门面：爆炸、烟、火花、轨迹、扬尘 + 爆炸闪光灯池 */
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.spark = new Pool(scene, 4000, THREE.AdditiveBlending);
    this.smoke = new Pool(scene, 3000, THREE.NormalBlending);

    // 闪光灯池
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa44, 0, 26, 2);
      scene.add(l);
      this.lights.push({ light: l, t: 0 });
    }
  }

  flash(pos, color = 0xffaa44, intensity = 8) {
    let best = this.lights[0];
    for (const e of this.lights) if (e.t < best.t) best = e;
    best.light.position.copy(pos);
    best.light.color.setHex(color);
    best.light.intensity = intensity;
    best.t = 0.18;
  }

  explosion(pos, scale = 1) {
    const n = Math.floor(34 * scale);
    for (let i = 0; i < n; i++) {
      const sp = 6 + Math.random() * 16 * scale;
      const dx = (Math.random() - 0.5), dy = Math.random() * 0.9 + 0.1, dz = (Math.random() - 0.5);
      const len = Math.hypot(dx, dy, dz) || 1;
      const r = 1.0, g = 0.5 + Math.random() * 0.4, b = 0.1;
      this.spark.spawn(
        pos.x, pos.y, pos.z,
        dx / len * sp, dy / len * sp, dz / len * sp,
        0.4 + Math.random() * 0.5, 1.6 + Math.random() * 1.6 * scale,
        r, g, b, 14, 1.2, 0,
      );
    }
    // 烟云
    const m = Math.floor(18 * scale);
    for (let i = 0; i < m; i++) {
      const sp = 1.5 + Math.random() * 3;
      const ang = Math.random() * Math.PI * 2;
      const gray = 0.18 + Math.random() * 0.18;
      this.smoke.spawn(
        pos.x, pos.y + 0.3, pos.z,
        Math.cos(ang) * sp, 1.5 + Math.random() * 2.5, Math.sin(ang) * sp,
        1.0 + Math.random() * 0.9, 2.4 + Math.random() * 2.0 * scale,
        gray, gray, gray, -2, 1.6, 5 * scale,
      );
    }
    this.flash(pos, 0xffa040, 9 * scale);
  }

  muzzle(pos, dir) {
    for (let i = 0; i < 14; i++) {
      const sp = 8 + Math.random() * 14;
      const jx = dir.x + (Math.random() - 0.5) * 0.5;
      const jy = dir.y + (Math.random() - 0.5) * 0.5;
      const jz = dir.z + (Math.random() - 0.5) * 0.5;
      this.spark.spawn(
        pos.x, pos.y, pos.z, jx * sp, jy * sp, jz * sp,
        0.12 + Math.random() * 0.12, 1.4 + Math.random() * 1.2,
        1.0, 0.8, 0.3, 6, 2, 0,
      );
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x * 3, dir.y * 3 + 1, dir.z * 3,
      0.5, 1.6, 0.4, 0.4, 0.4, -1, 2, 4);
    this.flash(pos, 0xffd060, 5);
  }

  trail(pos) {
    this.smoke.spawn(pos.x, pos.y, pos.z, 0, 0.5, 0, 0.4, 0.7, 0.5, 0.5, 0.5, -1, 1, 2);
  }

  dust(pos) {
    this.smoke.spawn(
      pos.x + (Math.random() - 0.5), pos.y + 0.1, pos.z + (Math.random() - 0.5),
      (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5,
      0.5 + Math.random() * 0.3, 0.9, 0.55, 0.48, 0.4, -1, 1.5, 1.5,
    );
  }

  /** 命中/击毁时炸出方块碎屑（彩色火花，带重力） */
  debris(pos, color = [0.5, 0.5, 0.5], amount = 14) {
    for (let i = 0; i < amount; i++) {
      const sp = 5 + Math.random() * 9;
      const dx = (Math.random() - 0.5), dy = Math.random() * 0.8 + 0.3, dz = (Math.random() - 0.5);
      const len = Math.hypot(dx, dy, dz) || 1;
      this.spark.spawn(
        pos.x, pos.y, pos.z, dx / len * sp, dy / len * sp, dz / len * sp,
        0.5 + Math.random() * 0.6, 1.2 + Math.random() * 1.0,
        color[0], color[1], color[2], 18, 0.4, 0,
      );
    }
  }

  update(dt) {
    this.spark.update(dt);
    this.smoke.update(dt);
    for (const e of this.lights) {
      if (e.t > 0) {
        e.t -= dt;
        e.light.intensity = Math.max(0, e.light.intensity - dt * 60);
        if (e.t <= 0) e.light.intensity = 0;
      }
    }
  }

  clear() {
    this.spark.clear();
    this.smoke.clear();
    for (const e of this.lights) { e.light.intensity = 0; e.t = 0; }
  }
}
