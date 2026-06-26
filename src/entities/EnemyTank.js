import * as THREE from 'three';
import { Tank } from './Tank.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

function angleLerp(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

/**
 * 敌方坦克 AI：接近—保持距离—瞄准—在有视线时开火。
 */
export class EnemyTank extends Tank {
  constructor(world, level = 1) {
    super(world, { isEnemy: true });
    this.speed = 6 + Math.min(level, 6) * 0.5;
    this.turretTurn = 1.6;       // rad/s
    this.hullTurn = 2.2;
    this.preferred = 22;         // 期望交战距离
    this.maxRange = 70;
    this.fireCooldown = 1 + Math.random() * 1.5;
    this.shellSpeed = 40;
    this.accuracy = Math.max(0.02, 0.10 - level * 0.008); // 数字越小越准
    this.maxHp = 60 + level * 12;
    this.hp = this.maxHp;
  }

  update(dt, player, enemies, fire) {
    if (!this.alive) return;

    // —— 朝玩家的水平向量 ——
    _a.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = _a.length();
    if (dist > 0.001) _a.multiplyScalar(1 / dist);

    // 是否对玩家有视线（从车体顶部，与炮塔朝向无关，更稳定）
    const hasLOS = this._los(player);

    // 期望移动方向：没视线就一路逼近找射界；远则进、近则退、适中则环绕
    const move = _b.set(0, 0, 0);
    if (!hasLOS || dist > this.preferred + 6) move.add(_a);
    else if (dist < this.preferred - 6) move.sub(_a);
    else { move.x += -_a.z * 0.7 + _a.x * 0.15; move.z += _a.x * 0.7 + _a.z * 0.15; }

    // 与其它敌军分离，避免抱团
    for (const o of enemies) {
      if (o === this || !o.alive) continue;
      const ddx = this.pos.x - o.pos.x;
      const ddz = this.pos.z - o.pos.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < 36 && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2);
        move.x += ddx * inv * 0.8;
        move.z += ddz * inv * 0.8;
      }
    }

    if (move.lengthSq() > 0.0001) {
      move.normalize();
      const step = this.speed * dt;
      this.tryMove(move.x * step, move.z * step);
      const targetHull = Math.atan2(move.x, move.z);
      this.hullYaw = angleLerp(this.hullYaw, targetHull, this.hullTurn * dt);
    }
    this.groundClamp(0.25);

    // —— 炮塔瞄准玩家（带重力提前量） ——
    const targetYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.turretYaw = angleLerp(this.turretYaw, targetYaw, this.turretTurn * dt);

    const dy = (player.pos.y + 1.0) - (this.pos.y + 1.45);
    const elev = Math.atan2(dy, dist) + Math.min(0.35, dist * 0.010);
    this.barrelPitch += (elev - this.barrelPitch) * Math.min(1, dt * 4);

    // —— 开火条件：冷却好 + 大致对准 + 距离内 + 有视线 ——
    this.fireCooldown -= dt;
    const yawErr = Math.abs(((targetYaw - this.turretYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (this.fireCooldown <= 0 && dist < this.maxRange && yawErr < 0.14 && hasLOS) {
      this._fire(fire);
      this.fireCooldown = 1.8 + Math.random() * 1.4;
    }

    this.syncModel();
  }

  /** 从车体顶部到玩家的视线检测（与炮塔朝向解耦，避免抖动） */
  _los(player) {
    _c.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    _d.set(player.pos.x - _c.x, (player.pos.y + 1.2) - _c.y, player.pos.z - _c.z);
    const len = _d.length();
    if (len < 0.001) return true;
    _d.multiplyScalar(1 / len);
    for (let d = 1.8; d < len - 1.2; d += 1.2) {
      if (this.world.isSolidAt(_c.x + _d.x * d, _c.y + _d.y * d, _c.z + _d.z * d)) return false;
    }
    return true;
  }

  _fire(fire) {
    this.getMuzzleWorld(_a);
    this.getAimDir(_b);
    // 加入散布
    _b.x += (Math.random() - 0.5) * this.accuracy;
    _b.y += (Math.random() - 0.5) * this.accuracy;
    _b.z += (Math.random() - 0.5) * this.accuracy;
    _b.normalize();
    this.recoil = 0.4;
    fire(_a.clone(), _b.clone(), this.shellSpeed, true);
  }
}
