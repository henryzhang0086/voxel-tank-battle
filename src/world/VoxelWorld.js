import * as THREE from 'three';
import { BLOCK, BLOCK_DEFS } from './blocks.js';
import { fbm2, rand2 } from './noise.js';

// 6 个面的几何定义：顶点偏移(每面4点)、法线、面 → 取色键、明暗系数
const FACES = [
  { dir: [1, 0, 0], face: 'side', shade: 0.72, corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], normal: [1,0,0] },
  { dir: [-1,0, 0], face: 'side', shade: 0.72, corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], normal: [-1,0,0] },
  { dir: [0, 1, 0], face: 'top',  shade: 1.00, corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], normal: [0,1,0] },
  { dir: [0,-1, 0], face: 'bottom', shade: 0.5, corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], normal: [0,-1,0] },
  { dir: [0, 0, 1], face: 'side', shade: 0.86, corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], normal: [0,0,1] },
  { dir: [0, 0,-1], face: 'side', shade: 0.60, corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], normal: [0,0,-1] },
];
// 预计算每个面的两条切向轴（用于环境光遮蔽采样）
for (const f of FACES) f.tax = [0, 1, 2].filter((a) => f.dir[a] === 0);
// AO 等级 0..3 → 亮度（0 最暗，墙角越凹越暗）
const AO_LUT = [0.46, 0.7, 0.86, 1.0];

export class VoxelWorld {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts {sizeX,sizeY,sizeZ,chunk,seed}
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.SX = opts.sizeX ?? 128;
    this.SY = opts.sizeY ?? 40;
    this.SZ = opts.sizeZ ?? 128;
    this.CH = opts.chunk ?? 16;
    this.seed = opts.seed ?? 20260626;
    this.waterLevel = 4;

    this.data = new Uint8Array(this.SX * this.SY * this.SZ);
    this.chunksX = Math.ceil(this.SX / this.CH);
    this.chunksZ = Math.ceil(this.SZ / this.CH);
    this.meshes = new Map(); // key "cx,cz" -> THREE.Mesh

    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.group = new THREE.Group();
    this.group.name = 'voxelWorld';
    scene.add(this.group);

    this._generate();
    this._buildAllChunks();
  }

  // ---------- 索引与读写 ----------
  _idx(x, y, z) {
    return x + z * this.SX + y * this.SX * this.SZ;
  }
  inBounds(x, y, z) {
    return x >= 0 && x < this.SX && y >= 0 && y < this.SY && z >= 0 && z < this.SZ;
  }
  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this._idx(x, y, z)];
  }
  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this._idx(x, y, z)] = id;
  }

  // ---------- 地形生成 ----------
  _generate() {
    const { SX, SY, SZ, seed, waterLevel } = this;
    for (let x = 0; x < SX; x++) {
      for (let z = 0; z < SZ; z++) {
        // 多层噪声 → 起伏地形；中央偏平作为主战场
        const nx = x / 48;
        const nz = z / 48;
        const base = fbm2(nx, nz, seed, 4);
        const ridge = fbm2(nx * 2.3, nz * 2.3, seed + 9, 3);
        let h = 6 + base * 16 + ridge * 6;

        // 让地图中心更平坦（便于开局机动）
        const dx = (x - SX / 2) / (SX / 2);
        const dz = (z - SZ / 2) / (SZ / 2);
        const distC = Math.sqrt(dx * dx + dz * dz);
        const flat = Math.max(0, 1 - distC * 1.6);
        // 中心向平地(高度 8)插值，边缘保留山势
        h = h * (1 - flat * 0.85) + 8 * (flat * 0.85);
        h = Math.max(2, Math.min(SY - 8, Math.round(h)));

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === h) {
            id = h <= waterLevel + 1 ? BLOCK.SAND : BLOCK.GRASS;
          } else if (y > h - 3) {
            id = h <= waterLevel + 1 ? BLOCK.SAND : BLOCK.DIRT;
          } else {
            id = BLOCK.STONE;
          }
          this.set(x, y, z, id);
        }
      }
    }

    this._scatterCover();
    this._scatterTrees();
  }

  /** 散布金属/岩石掩体方块，制造战术地形 */
  _scatterCover() {
    const { SX, SZ, seed } = this;
    for (let x = 4; x < SX - 4; x++) {
      for (let z = 4; z < SZ - 4; z++) {
        const r = rand2(x, z, seed + 555);
        if (r > 0.992) {
          // 一面矮墙
          const h = this.heightAt(x + 0.5, z + 0.5);
          const len = 2 + Math.floor(rand2(x, z, seed + 7) * 4);
          const horiz = rand2(x, z, seed + 3) > 0.5;
          const mat = rand2(x, z, seed + 11) > 0.6 ? BLOCK.METAL : BLOCK.ROCK;
          for (let i = 0; i < len; i++) {
            const bx = horiz ? x + i : x;
            const bz = horiz ? z : z + i;
            const gh = this.heightAt(bx + 0.5, bz + 0.5);
            for (let k = 0; k < 3; k++) this.set(bx, gh + k, bz, mat);
          }
        }
      }
    }
  }

  /** 简易树木：木干 + 叶冠 */
  _scatterTrees() {
    const { SX, SZ, seed } = this;
    for (let x = 6; x < SX - 6; x += 1) {
      for (let z = 6; z < SZ - 6; z += 1) {
        if (rand2(x, z, seed + 88) > 0.9965) {
          const gh = this.heightAt(x + 0.5, z + 0.5);
          if (this.get(x, gh - 1, z) !== BLOCK.GRASS) continue;
          const th = 4 + Math.floor(rand2(x, z, seed + 2) * 3);
          for (let k = 0; k < th; k++) this.set(x, gh + k, z, BLOCK.WOOD);
          const top = gh + th;
          for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++)
              for (let dy = -1; dy <= 2; dy++) {
                if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
                const lx = x + dx, ly = top + dy, lz = z + dz;
                if (this.get(lx, ly, lz) === BLOCK.AIR) this.set(lx, ly, lz, BLOCK.LEAF);
              }
        }
      }
    }
  }

  // ---------- 查询 ----------
  /** 返回 (x,z) 处最高实心块的“顶面”世界高度 */
  heightAt(wx, wz) {
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    if (!this.inBounds(x, 0, z)) return 0;
    for (let y = this.SY - 1; y >= 0; y--) {
      if (this.data[this._idx(x, y, z)] !== BLOCK.AIR) return y + 1;
    }
    return 0;
  }

  isSolidAt(wx, wy, wz) {
    return this.get(Math.floor(wx), Math.floor(wy), Math.floor(wz)) !== BLOCK.AIR;
  }

  // AO 采样：在给定块坐标基础上沿某轴 / 两轴偏移后是否实心（越界视为空气）
  _solidAxis(x, y, z, axis, s) {
    if (axis === 0) x += s; else if (axis === 1) y += s; else z += s;
    return this.inBounds(x, y, z) && this.data[this._idx(x, y, z)] !== BLOCK.AIR ? 1 : 0;
  }
  _solidAxis2(x, y, z, a0, s0, a1, s1) {
    if (a0 === 0) x += s0; else if (a0 === 1) y += s0; else z += s0;
    if (a1 === 0) x += s1; else if (a1 === 1) y += s1; else z += s1;
    return this.inBounds(x, y, z) && this.data[this._idx(x, y, z)] !== BLOCK.AIR ? 1 : 0;
  }

  // ---------- 破坏 ----------
  /**
   * 以球形挖空方块，返回被破坏的方块数量；标记受影响 chunk 重建。
   */
  removeSphere(cx, cy, cz, radius) {
    const r = radius;
    const x0 = Math.floor(cx - r), x1 = Math.floor(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.floor(cy + r);
    const z0 = Math.floor(cz - r), z1 = Math.floor(cz + r);
    const dirty = new Set();
    let count = 0;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          if (!this.inBounds(x, y, z)) continue;
          if (this.data[this._idx(x, y, z)] === BLOCK.AIR) continue;
          const ddx = x + 0.5 - cx, ddy = y + 0.5 - cy, ddz = z + 0.5 - cz;
          if (ddx * ddx + ddy * ddy + ddz * ddz <= r * r) {
            this.data[this._idx(x, y, z)] = BLOCK.AIR;
            count++;
            // 该块及其相邻块所在 chunk 都要重建（边界面）
            this._markDirtyAround(x, z, dirty);
          }
        }
    for (const key of dirty) {
      const [cxk, czk] = key.split(',').map(Number);
      this._buildChunk(cxk, czk);
    }
    return count;
  }

  _markDirtyAround(x, z, dirty) {
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const cxk = Math.floor((x + ox) / this.CH);
        const czk = Math.floor((z + oz) / this.CH);
        if (cxk >= 0 && cxk < this.chunksX && czk >= 0 && czk < this.chunksZ)
          dirty.add(cxk + ',' + czk);
      }
  }

  // ---------- 网格化 ----------
  _buildAllChunks() {
    for (let cx = 0; cx < this.chunksX; cx++)
      for (let cz = 0; cz < this.chunksZ; cz++) this._buildChunk(cx, cz);
  }

  _buildChunk(cx, cz) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let vi = 0;

    const x0 = cx * this.CH, x1 = Math.min(x0 + this.CH, this.SX);
    const z0 = cz * this.CH, z1 = Math.min(z0 + this.CH, this.SZ);

    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        for (let y = 0; y < this.SY; y++) {
          const id = this.data[this._idx(x, y, z)];
          if (id === BLOCK.AIR) continue;
          const def = BLOCK_DEFS[id];
          if (!def) continue;
          // 每块一个细微亮度扰动，打破纯色平面
          const jitter = 0.92 + rand2(x * 7 + y, z * 13 + y, 99) * 0.16;

          for (const f of FACES) {
            const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
            // 邻块为实心则该面被遮挡；越界(水平/上)视为空气 → 画出边界悬崖面
            if (this.inBounds(nx, ny, nz) && this.data[this._idx(nx, ny, nz)] !== BLOCK.AIR) continue;
            if (ny < 0) continue; // 世界底部不画

            const col = def[f.face];
            const sh = f.shade * jitter;
            const r = col[0] * sh, g = col[1] * sh, b = col[2] * sh;

            // —— 逐顶点环境光遮蔽 ——
            const a0 = f.tax[0], a1 = f.tax[1];
            const ao = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
              const c = f.corners[k];
              const s0 = c[a0] === 1 ? 1 : -1;
              const s1 = c[a1] === 1 ? 1 : -1;
              const side1 = this._solidAxis(nx, ny, nz, a0, s0);
              const side2 = this._solidAxis(nx, ny, nz, a1, s1);
              const corner = side1 && side2 ? 1 : this._solidAxis2(nx, ny, nz, a0, s0, a1, s1);
              const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              ao[k] = AO_LUT[level];
            }

            for (let k = 0; k < 4; k++) {
              const c = f.corners[k];
              positions.push(x + c[0], y + c[1], z + c[2]);
              normals.push(f.normal[0], f.normal[1], f.normal[2]);
              colors.push(r * ao[k], g * ao[k], b * ao[k]);
            }
            // 各向异性翻转：避免 AO 在四边形对角出现硬缝
            if (ao[0] + ao[2] < ao[1] + ao[3])
              indices.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
            else
              indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            vi += 4;
          }
        }
      }
    }

    const key = cx + ',' + cz;
    let mesh = this.meshes.get(key);

    if (positions.length === 0) {
      if (mesh) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
      }
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    } else {
      mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
  }

  get centerSpawn() {
    const x = this.SX / 2;
    const z = this.SZ / 2;
    return new THREE.Vector3(x, this.heightAt(x, z), z);
  }
}
