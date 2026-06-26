import * as THREE from 'three';

/**
 * Debris —— 体素碎块系统（InstancedMesh + 简易物理）
 * 用于坦克被击毁时崩解成飞散、翻滚、落地、淡出的实心方块。
 */
export class Debris {
  constructor(scene, world, capacity = 360) {
    this.world = world;
    this.cap = capacity;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = capacity;
    scene.add(this.mesh);

    // 每实例状态
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.rot = new Float32Array(capacity * 3);
    this.rv = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.max = new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    this.head = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._color = new THREE.Color();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);

    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this._zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(cx, cy, cz, baseColor, count = 22, spread = 9, sizeRange = [0.35, 0.9]) {
    for (let i = 0; i < count; i++) {
      const idx = this.head;
      this.head = (this.head + 1) % this.cap;
      const i3 = idx * 3;
      this.p[i3] = cx + (Math.random() - 0.5) * 1.4;
      this.p[i3 + 1] = cy + Math.random() * 1.6;
      this.p[i3 + 2] = cz + (Math.random() - 0.5) * 1.4;
      const a = Math.random() * Math.PI * 2;
      const up = 4 + Math.random() * spread;
      const out = spread * (0.4 + Math.random() * 0.8);
      this.v[i3] = Math.cos(a) * out;
      this.v[i3 + 1] = up;
      this.v[i3 + 2] = Math.sin(a) * out;
      this.rot[i3] = Math.random() * 6.28;
      this.rot[i3 + 1] = Math.random() * 6.28;
      this.rot[i3 + 2] = Math.random() * 6.28;
      this.rv[i3] = (Math.random() - 0.5) * 10;
      this.rv[i3 + 1] = (Math.random() - 0.5) * 10;
      this.rv[i3 + 2] = (Math.random() - 0.5) * 10;
      this.size[idx] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
      this.max[idx] = 1.6 + Math.random() * 1.4;
      this.life[idx] = this.max[idx];
      this.active[idx] = 1;
      // 颜色带轻微随机明暗
      const f = 0.75 + Math.random() * 0.35;
      this._color.setRGB(baseColor[0] * f, baseColor[1] * f, baseColor[2] * f);
      this.mesh.setColorAt(idx, this._color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (!this.active[i]) continue;
      any = true;
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.active[i] = 0;
        this.mesh.setMatrixAt(i, this._zero);
        continue;
      }
      // 重力 + 速度
      this.v[i3 + 1] -= 24 * dt;
      this.p[i3] += this.v[i3] * dt;
      this.p[i3 + 1] += this.v[i3 + 1] * dt;
      this.p[i3 + 2] += this.v[i3 + 2] * dt;

      // 落地（采样地形顶面）
      const half = this.size[i] * 0.5;
      const gh = this.world.heightAt(this.p[i3], this.p[i3 + 2]) + half;
      if (this.p[i3 + 1] < gh) {
        this.p[i3 + 1] = gh;
        this.v[i3 + 1] *= -0.32;           // 弹一下
        this.v[i3] *= 0.7; this.v[i3 + 2] *= 0.7; // 摩擦
        this.rv[i3] *= 0.6; this.rv[i3 + 1] *= 0.6; this.rv[i3 + 2] *= 0.6;
      }

      this.rot[i3] += this.rv[i3] * dt;
      this.rot[i3 + 1] += this.rv[i3 + 1] * dt;
      this.rot[i3 + 2] += this.rv[i3 + 2] * dt;

      // 末段缩小淡出
      const t = this.life[i] / this.max[i];
      const sc = this.size[i] * Math.min(1, t * 3);

      this._pos.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      this._e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      this._q.setFromEuler(this._e);
      this._s.set(sc, sc, sc);
      this._m.compose(this._pos, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.active.fill(0);
    for (let i = 0; i < this.cap; i++) this.mesh.setMatrixAt(i, this._zero);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
