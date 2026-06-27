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
 * 敌方兵种表（5A 标准的差异化：轮廓 / 配色 / 数值 / 行为各不相同）
 * 字段：spec(模型) + 行为/数值。
 */
export const ENEMY_TYPES = {
  scout: {
    name: '侦察', radius: 1.4, hp: 38, dmg: 9, score: 80,
    speed: 12, hullTurn: 3.0, turretTurn: 2.6, preferred: 16, maxRange: 60,
    shellSpeed: 48, reload: [0.9, 1.6], accuracy: 0.10, arc: 0.008,
    colors: { body: 0x3f7a3a, turret: 0x356b32, track: 0x1f2a1f, detail: 0x2a4a2a, barrel: 0x9aa890 },
    scale: 0.8, bodyW: 2.2, barrelLen: 2.1, barrelThick: 0.26,
  },
  standard: {
    name: '主战', radius: 1.8, hp: 78, dmg: 16, score: 100,
    speed: 6.5, hullTurn: 2.2, turretTurn: 1.7, preferred: 22, maxRange: 72,
    shellSpeed: 42, reload: [1.6, 2.6], accuracy: 0.07, arc: 0.010,
    colors: { body: 0x9a3a2a, turret: 0x86311f, track: 0x261c19, detail: 0x4a1f17, barrel: 0x8a9080 },
    scale: 1.0, bodyW: 2.5, barrelLen: 2.6, barrelThick: 0.32,
  },
  heavy: {
    name: '重型', radius: 2.5, hp: 190, dmg: 30, score: 220,
    speed: 4.2, hullTurn: 1.3, turretTurn: 1.0, preferred: 26, maxRange: 76,
    shellSpeed: 40, reload: [2.6, 3.6], accuracy: 0.05, arc: 0.011,
    colors: { body: 0x4a4f57, turret: 0x3f444b, track: 0x202327, detail: 0x33373d, barrel: 0xbfc4b2 },
    scale: 1.4, bodyW: 2.8, barrelLen: 3.0, barrelThick: 0.46,
  },
  artillery: {
    name: '火炮', radius: 1.9, hp: 56, dmg: 34, score: 170,
    speed: 5, hullTurn: 1.4, turretTurn: 1.2, preferred: 42, maxRange: 110,
    shellSpeed: 36, reload: [3.0, 4.4], accuracy: 0.05, arc: 0.030,
    colors: { body: 0x6b5a2e, turret: 0x5f4f28, track: 0x262019, detail: 0x4a3e20, barrel: 0xa6aa92 },
    scale: 1.05, bodyW: 2.4, barrelLen: 3.8, barrelThick: 0.3,
  },
  boss: {
    name: '巨型', radius: 4.0, hp: 640, dmg: 42, score: 1000,
    speed: 3.6, hullTurn: 1.0, turretTurn: 1.0, preferred: 30, maxRange: 90,
    shellSpeed: 44, reload: [1.5, 2.4], accuracy: 0.04, arc: 0.012,
    colors: { body: 0x2a2d33, turret: 0x6e2c20, track: 0x17181c, detail: 0x8a1f17, barrel: 0xc6cab6 },
    scale: 2.1, bodyW: 3.0, barrelLen: 3.4, barrelThick: 0.62,
  },
};

/**
 * 敌方坦克 AI：接近—保持距离—瞄准—在有视线时开火。数值来自兵种。
 */
export class EnemyTank extends Tank {
  constructor(world, typeKey = 'standard', level = 1) {
    const t = ENEMY_TYPES[typeKey] || ENEMY_TYPES.standard;
    super(world, { isEnemy: true, spec: t });
    this.typeKey = typeKey;
    this.type = t;

    const lvl = Math.min(level, 8);
    this.speed = t.speed * (1 + lvl * 0.015);
    this.hullTurn = t.hullTurn;
    this.turretTurn = t.turretTurn;
    this.preferred = t.preferred;
    this.maxRange = t.maxRange;
    this.shellSpeed = t.shellSpeed;
    this.reload = t.reload;
    this.arc = t.arc;
    this.dmg = t.dmg;
    this.score = t.score;
    this.accuracy = Math.max(0.02, t.accuracy - lvl * 0.004);
    this.maxHp = Math.round(t.hp * (1 + lvl * 0.05));
    this.hp = this.maxHp;
    this.fireCooldown = t.reload[0] + Math.random() * 1.5;
  }

  update(dt, player, enemies, fire) {
    if (!this.alive) return;

    _a.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = _a.length();
    if (dist > 0.001) _a.multiplyScalar(1 / dist);

    const hasLOS = this._los(player);

    // 期望移动方向：没视线就逼近找射界；远则进、近则退、适中则环绕
    const move = _b.set(0, 0, 0);
    if (!hasLOS || dist > this.preferred + 6) move.add(_a);
    else if (dist < this.preferred - 6) move.sub(_a);
    else { move.x += -_a.z * 0.7 + _a.x * 0.15; move.z += _a.x * 0.7 + _a.z * 0.15; }

    // 与其它敌军分离，避免抱团（按各自半径放大间距）
    for (const o of enemies) {
      if (o === this || !o.alive) continue;
      const ddx = this.pos.x - o.pos.x;
      const ddz = this.pos.z - o.pos.z;
      const d2 = ddx * ddx + ddz * ddz;
      const minD = (this.radius + o.radius) + 2;
      if (d2 < minD * minD && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2);
        move.x += ddx * inv * 0.9;
        move.z += ddz * inv * 0.9;
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

    // 炮塔瞄准玩家（带重力提前量；火炮高抛）
    const targetYaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.turretYaw = angleLerp(this.turretYaw, targetYaw, this.turretTurn * dt);

    const dy = (player.pos.y + 1.0) - (this.pos.y + 1.45 * (this.spec.scale ?? 1));
    const elev = Math.atan2(dy, dist) + Math.min(0.6, dist * this.arc);
    this.barrelPitch += (elev - this.barrelPitch) * Math.min(1, dt * 4);

    // 开火：冷却好 + 大致对准 + 距离内 + 有视线
    this.fireCooldown -= dt;
    const yawErr = Math.abs(((targetYaw - this.turretYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (this.fireCooldown <= 0 && dist < this.maxRange && yawErr < 0.14 && hasLOS) {
      this._fire(fire);
      this.fireCooldown = this.reload[0] + Math.random() * (this.reload[1] - this.reload[0]);
    }

    this.syncModel();
  }

  _los(player) {
    const top = 1.7 * (this.spec.scale ?? 1);
    _c.set(this.pos.x, this.pos.y + top, this.pos.z);
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
    _b.x += (Math.random() - 0.5) * this.accuracy;
    _b.y += (Math.random() - 0.5) * this.accuracy;
    _b.z += (Math.random() - 0.5) * this.accuracy;
    _b.normalize();
    this.recoil = 0.4;
    fire(_a.clone(), _b.clone(), this.shellSpeed, true, this.dmg);
  }
}
