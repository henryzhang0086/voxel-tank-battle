import * as THREE from 'three';

const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * 用方块拼出一辆坦克（可按 spec 调整车宽/炮管长度/配色，做出不同兵种轮廓）。
 * 返回 { group, hull, turret, barrelPivot, muzzle }；炮管指向 +Z。
 */
export function buildTankModel(spec) {
  const c = spec.colors;
  const bodyW = spec.bodyW ?? 2.5;
  const barrelLen = spec.barrelLen ?? 2.6;
  const barrelThick = spec.barrelThick ?? 0.32;

  const group = new THREE.Group();
  const bodyMat = mat(c.body), trackMat = mat(c.track), detailMat = mat(c.detail);
  const turretMat = mat(c.turret), barrelMat = mat(c.barrel ?? c.detail);

  // ---- 车体 + 履带 ----
  const hull = new THREE.Group();
  const body = box(bodyW, 0.7, 3.4, bodyMat);
  body.position.y = 0.75;
  hull.add(body);

  const glacis = box(bodyW - 0.2, 0.5, 0.9, bodyMat);
  glacis.position.set(0, 1.05, 1.45);
  hull.add(glacis);

  const tx = bodyW / 2;
  for (const side of [-1, 1]) {
    const track = box(0.7, 0.85, 3.7, trackMat);
    track.position.set(side * tx, 0.45, 0);
    hull.add(track);
    for (let i = -1; i <= 1; i++) {
      const wheel = box(0.78, 0.5, 0.5, detailMat);
      wheel.position.set(side * tx, 0.4, i * 1.05);
      hull.add(wheel);
    }
  }
  group.add(hull);

  // ---- 炮塔 ----
  const turret = new THREE.Group();
  turret.position.y = 1.25;
  const dome = box(bodyW * 0.68, 0.8, 1.8, turretMat);
  dome.position.y = 0.4;
  turret.add(dome);
  const bustle = box(bodyW * 0.52, 0.5, 0.8, turretMat);
  bustle.position.set(0, 0.4, -1.0);
  turret.add(bustle);
  const cupola = box(0.7, 0.4, 0.7, detailMat);
  cupola.position.set(-0.3, 0.85, -0.2);
  turret.add(cupola);

  // ---- 炮管（俯仰） ----
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.45, 0.7);
  const barrel = box(barrelThick, barrelThick, barrelLen, barrelMat);
  barrel.position.z = barrelLen / 2;
  barrelPivot.add(barrel);
  const muzzleBrake = box(barrelThick * 1.45, barrelThick * 1.45, 0.5, trackMat);
  muzzleBrake.position.z = barrelLen - 0.1;
  barrelPivot.add(muzzleBrake);

  const muzzle = new THREE.Object3D();
  muzzle.position.z = barrelLen + 0.2;
  barrelPivot.add(muzzle);

  turret.add(barrelPivot);
  group.add(turret);

  return { group, hull, turret, barrelPivot, muzzle };
}

// 玩家可选车型：差异化机动/装甲/火力/射速，stats 提供给主控
export const PLAYER_TYPES = {
  standard: {
    name: '中坚', en: 'VANGUARD', desc: '均衡可靠，攻防俱佳的主战坦克',
    colors: { body: 0x5a6b3a, turret: 0x4f6033, track: 0x2b2f26, detail: 0x3a4528, barrel: 0x8a9080 },
    scale: 1.0, bodyW: 2.5, barrelLen: 2.6, barrelThick: 0.32, radius: 1.8, hp: 100,
    stats: { moveSpeed: 13, sprint: 1.6, reload: 0.85, shellSpeed: 62, dmg: 58, craterR: 2.3, blastR: 4.0 },
    ratings: { mobility: 3, armor: 3, firepower: 3, fireRate: 3 },
  },
  light: {
    name: '猎兵', en: 'RAPTOR', desc: '高速轻甲，速射近战，打了就跑',
    colors: { body: 0x4a7c59, turret: 0x3f6e4d, track: 0x222a22, detail: 0x2c4a34, barrel: 0xaab09a },
    scale: 0.85, bodyW: 2.3, barrelLen: 2.3, barrelThick: 0.27, radius: 1.55, hp: 70,
    stats: { moveSpeed: 17.5, sprint: 1.7, reload: 0.5, shellSpeed: 74, dmg: 34, craterR: 1.8, blastR: 3.2 },
    ratings: { mobility: 5, armor: 1, firepower: 2, fireRate: 5 },
  },
  heavy: {
    name: '铁壁', en: 'BULWARK', desc: '重装厚甲，缓慢但极其耐打、重炮',
    colors: { body: 0x4a4f57, turret: 0x3f444b, track: 0x202327, detail: 0x33373d, barrel: 0xbfc4b2 },
    scale: 1.35, bodyW: 2.8, barrelLen: 3.0, barrelThick: 0.46, radius: 2.3, hp: 200,
    stats: { moveSpeed: 9.5, sprint: 1.35, reload: 1.3, shellSpeed: 58, dmg: 98, craterR: 2.9, blastR: 4.8 },
    ratings: { mobility: 1, armor: 5, firepower: 5, fireRate: 2 },
  },
  sniper: {
    name: '狙击', en: 'LANCER', desc: '超远平射，单发剧伤，装填缓慢的玻璃炮',
    colors: { body: 0x7a6a36, turret: 0x6b5d30, track: 0x262019, detail: 0x4a3e20, barrel: 0xc6cab0 },
    scale: 1.0, bodyW: 2.4, barrelLen: 3.8, barrelThick: 0.3, radius: 1.8, hp: 80,
    stats: { moveSpeed: 11.5, sprint: 1.5, reload: 1.55, shellSpeed: 105, dmg: 130, craterR: 3.0, blastR: 4.6 },
    ratings: { mobility: 2, armor: 2, firepower: 5, fireRate: 1 },
  },
};

// 默认 / 向后兼容
export const PLAYER_SPEC = PLAYER_TYPES.standard;

/**
 * 坦克基类：持有模型与状态，提供地形跟随、瞄准同步、枪口坐标。
 */
export class Tank {
  constructor(world, { isEnemy = false, spec = PLAYER_SPEC } = {}) {
    this.world = world;
    this.isEnemy = isEnemy;
    this.spec = spec;

    const model = buildTankModel(spec);
    this.group = model.group;
    this.hull = model.hull;
    this.turret = model.turret;
    this.barrelPivot = model.barrelPivot;
    this.muzzle = model.muzzle;
    this.group.scale.setScalar(spec.scale ?? 1);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hullYaw = 0;
    this.turretYaw = 0;
    this.barrelPitch = 0.05;

    this.maxHp = spec.hp ?? 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.radius = spec.radius ?? 1.8;
    this.climb = 1.2;          // 可攀爬的最大台阶高度（方块数）
    this.fireCooldown = 0;
    this.recoil = 0;
  }

  addTo(scene) { scene.add(this.group); }

  setPosition(x, y, z) {
    this.pos.set(x, y, z);
    this.group.position.copy(this.pos);
  }

  groundClamp(smooth = 0) {
    const w = this.world;
    const r = 1.1 * (this.spec.scale ?? 1);
    const h = Math.max(
      w.heightAt(this.pos.x - r, this.pos.z - r),
      w.heightAt(this.pos.x + r, this.pos.z - r),
      w.heightAt(this.pos.x - r, this.pos.z + r),
      w.heightAt(this.pos.x + r, this.pos.z + r),
    );
    const target = h + 0.05;
    if (smooth > 0) this.pos.y += (target - this.pos.y) * smooth;
    else this.pos.y = target;
  }

  /** 某点是否可踏上（在界内且台阶不超过可攀爬高度） */
  _canStep(nx, nz) {
    const w = this.world;
    if (nx < 1 || nz < 1 || nx > w.SX - 1 || nz > w.SZ - 1) return false;
    return w.heightAt(nx, nz) - w.heightAt(this.pos.x, this.pos.z) <= this.climb;
  }

  /**
   * 平移 + 撞墙沿墙滑行（分轴回退），不再正面卡死 → 通行顺畅。
   * 返回是否产生了位移。
   */
  tryMove(dx, dz) {
    if (this._canStep(this.pos.x + dx, this.pos.z + dz)) {
      this.pos.x += dx; this.pos.z += dz;
      return true;
    }
    let moved = false;
    if (Math.abs(dx) > 1e-5 && this._canStep(this.pos.x + dx, this.pos.z)) {
      this.pos.x += dx; moved = true;
    }
    if (Math.abs(dz) > 1e-5 && this._canStep(this.pos.x, this.pos.z + dz)) {
      this.pos.z += dz; moved = true;
    }
    return moved;
  }

  syncModel() {
    this.group.position.copy(this.pos);
    this.hull.rotation.y = this.hullYaw;
    this.turret.rotation.y = this.turretYaw;
    this.barrelPivot.rotation.x = -this.barrelPitch;
    this.barrelPivot.position.z = 0.7 - this.recoil;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - 0.12);
  }

  getMuzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }

  getAimDir(out) {
    out.set(
      Math.sin(this.turretYaw) * Math.cos(this.barrelPitch),
      Math.sin(this.barrelPitch),
      Math.cos(this.turretYaw) * Math.cos(this.barrelPitch),
    );
    return out.normalize();
  }

  damage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
    return false;
  }

  dispose(scene) { scene.remove(this.group); }
}
