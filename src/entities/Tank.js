import * as THREE from 'three';

const mat = (hex, opts = {}) =>
  new THREE.MeshLambertMaterial({ color: hex, ...opts });

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * 用方块拼出一辆坦克。返回 { group, hull, turret, barrelPivot, muzzle }
 * 朝向约定：炮管指向 +Z；turret/hull 的 rotation.y 控制偏航。
 */
export function buildTankModel(colors) {
  const group = new THREE.Group();

  // ---- 车体 + 履带（随车身偏航） ----
  const hull = new THREE.Group();
  const bodyMat = mat(colors.body);
  const trackMat = mat(colors.track);
  const detailMat = mat(colors.detail);

  const body = box(2.5, 0.7, 3.4, bodyMat);
  body.position.y = 0.75;
  hull.add(body);

  // 前装甲斜板（用一个略小的盒子叠出层次）
  const glacis = box(2.3, 0.5, 0.9, bodyMat);
  glacis.position.set(0, 1.05, 1.45);
  hull.add(glacis);

  for (const side of [-1, 1]) {
    const track = box(0.7, 0.85, 3.7, trackMat);
    track.position.set(side * 1.25, 0.45, 0);
    hull.add(track);
    // 负重轮装饰
    for (let i = -1; i <= 1; i++) {
      const wheel = box(0.78, 0.5, 0.5, detailMat);
      wheel.position.set(side * 1.25, 0.4, i * 1.05);
      hull.add(wheel);
    }
  }
  group.add(hull);

  // ---- 炮塔（独立偏航，挂在 group 上） ----
  const turret = new THREE.Group();
  turret.position.y = 1.25;
  const turretMat = mat(colors.turret);
  const dome = box(1.7, 0.8, 1.8, turretMat);
  dome.position.y = 0.4;
  turret.add(dome);

  // 炮塔后舱
  const bustle = box(1.3, 0.5, 0.8, turretMat);
  bustle.position.set(0, 0.4, -1.0);
  turret.add(bustle);

  // 指挥塔 / 天线座
  const cupola = box(0.7, 0.4, 0.7, detailMat);
  cupola.position.set(-0.3, 0.85, -0.2);
  turret.add(cupola);

  // ---- 炮管（俯仰） ----
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.45, 0.7);
  const barrel = box(0.32, 0.32, 2.6, detailMat);
  barrel.position.z = 1.3;
  barrelPivot.add(barrel);
  const muzzleBrake = box(0.46, 0.46, 0.5, trackMat);
  muzzleBrake.position.z = 2.45;
  barrelPivot.add(muzzleBrake);

  // 枪口位置标记（取世界坐标用）
  const muzzle = new THREE.Object3D();
  muzzle.position.z = 2.75;
  barrelPivot.add(muzzle);

  turret.add(barrelPivot);
  group.add(turret);

  return { group, hull, turret, barrelPivot, muzzle };
}

const PLAYER_COLORS = { body: 0x5a6b3a, turret: 0x4f6033, track: 0x2b2f26, detail: 0x3a4528 };
const ENEMY_COLORS  = { body: 0x7a3326, turret: 0x6e2c20, track: 0x2a201d, detail: 0x4a1f17 };

/**
 * 坦克基类：持有模型与状态，提供地形跟随、瞄准同步、枪口坐标。
 */
export class Tank {
  constructor(world, { isEnemy = false } = {}) {
    this.world = world;
    this.isEnemy = isEnemy;
    const model = buildTankModel(isEnemy ? ENEMY_COLORS : PLAYER_COLORS);
    this.group = model.group;
    this.hull = model.hull;
    this.turret = model.turret;
    this.barrelPivot = model.barrelPivot;
    this.muzzle = model.muzzle;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hullYaw = 0;
    this.turretYaw = 0;
    this.barrelPitch = 0.05;

    this.maxHp = isEnemy ? 100 : 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.radius = 1.8;        // 碰撞半径
    this.fireCooldown = 0;
    this.recoil = 0;          // 后坐可视化
  }

  addTo(scene) { scene.add(this.group); }

  setPosition(x, y, z) {
    this.pos.set(x, y, z);
    this.group.position.copy(this.pos);
  }

  /** 把坦克贴合到当前 (x,z) 地形顶面（取四角最高，稳定） */
  groundClamp(smooth = 0) {
    const w = this.world;
    const r = 1.1;
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

  /** 试图把 hull 朝某方向平移，遇到过高的墙则被阻挡。返回是否移动 */
  tryMove(dx, dz) {
    const w = this.world;
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    if (nx < 1 || nz < 1 || nx > w.SX - 1 || nz > w.SZ - 1) return false;
    const cur = w.heightAt(this.pos.x, this.pos.z);
    const ahead = w.heightAt(nx, nz);
    if (ahead - cur > 1.2) return false; // 台阶过高 = 墙，挡住
    this.pos.x = nx;
    this.pos.z = nz;
    return true;
  }

  /** 把状态写入模型变换 */
  syncModel() {
    this.group.position.copy(this.pos);
    this.hull.rotation.y = this.hullYaw;
    this.turret.rotation.y = this.turretYaw;
    // 后坐：炮管短暂回缩
    this.barrelPivot.rotation.x = -this.barrelPitch;
    this.barrelPivot.position.z = 0.7 - this.recoil;
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - 0.12);
  }

  getMuzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }

  /** 炮口前向（世界） */
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
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true; // 被击毁
    }
    return false;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
