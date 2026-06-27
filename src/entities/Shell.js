import * as THREE from 'three';

const GRAVITY = 12;        // 炮弹重力（弱化，便于瞄准）
const MAX_LIFE = 5;        // 秒

/**
 * ShellManager —— 炮弹池：弹道积分 + 与地形/坦克的碰撞检测。
 * 碰撞后通过 onExplode 回调把后续（破坏/伤害/特效/音效）交给主控。
 */
export class ShellManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.shells = [];

    this.geo = new THREE.SphereGeometry(0.22, 10, 8);
    this.playerMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
    this.enemyMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c });

    this._tmp = new THREE.Vector3();
  }

  spawn(pos, dir, speed, ownerIsEnemy, damage = 16) {
    const mesh = new THREE.Mesh(this.geo, ownerIsEnemy ? this.enemyMat : this.playerMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.shells.push({
      mesh,
      vel: dir.clone().multiplyScalar(speed),
      life: 0,
      ownerIsEnemy,
      damage,
      prev: pos.clone(),
    });
  }

  /**
   * @param {number} dt
   * @param {Tank[]} tanks  所有坦克（用于命中判定）
   * @param {(pos,ownerIsEnemy)=>void} onExplode
   * @param {(pos)=>void} onTrail 飞行轨迹烟（可选）
   */
  update(dt, tanks, onExplode, onTrail) {
    const w = this.world;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life += dt;
      s.prev.copy(s.mesh.position);

      s.vel.y -= GRAVITY * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;

      if (onTrail && Math.random() < 0.6) onTrail(p);

      let exploded = false;

      // 1) 坦克命中（与发射方阵营相反才算）
      for (const t of tanks) {
        if (!t.alive) continue;
        if (t.isEnemy === s.ownerIsEnemy) continue; // 不打自己人
        const dx = p.x - t.pos.x;
        const dy = p.y - (t.pos.y + 1.0);
        const dz = p.z - t.pos.z;
        if (dx * dx + dy * dy + dz * dz <= t.radius * t.radius) {
          exploded = true;
          break;
        }
      }

      // 2) 地形命中 / 越界 / 超时
      if (!exploded) {
        if (
          p.y < 0 ||
          p.x < 0 || p.z < 0 || p.x > w.SX || p.z > w.SZ ||
          w.isSolidAt(p.x, p.y, p.z) ||
          s.life > MAX_LIFE
        ) {
          exploded = true;
        }
      }

      if (exploded) {
        onExplode(p.clone(), s.ownerIsEnemy, s.damage);
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }
  }

  clear() {
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.shells.length = 0;
  }
}
