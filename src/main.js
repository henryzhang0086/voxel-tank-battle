import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { VoxelWorld } from './world/VoxelWorld.js';
import { Tank } from './entities/Tank.js';
import { EnemyTank } from './entities/EnemyTank.js';
import { ShellManager } from './entities/Shell.js';
import { Particles } from './fx/Particles.js';
import { Debris } from './fx/Debris.js';
import { Sound } from './audio/Sound.js';
import { HUD } from './ui/HUD.js';
import { TouchControls } from './ui/TouchControls.js';

// ---------- 可调参数 ----------
const MOVE_SPEED = 13;
const SPRINT = 1.6;
const RELOAD = 0.85;             // 玩家主炮装填秒数
const PLAYER_SHELL_SPEED = 62;
const PLAYER_DMG = 58;
const ENEMY_DMG = 16;
const MOUSE_SENS = 0.0022;
const TOUCH_LOOK_SENS = 0.006;
const CAM_DIST = 9.5;
const BLAST_RADIUS = 4.0;        // 溅射伤害半径
const CRATER_RADIUS = 2.3;       // 地形破坏半径

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.touch = new TouchControls();
    this.engine = new Engine(this.canvas, { mobile: this.touch.isTouch });
    this.input = new Input(this.canvas);
    this.particles = new Particles(this.engine.scene);
    this.sound = new Sound();
    this.hud = new HUD();

    if (this.touch.isTouch) {
      document.body.classList.add('touch');
      const c = document.querySelector('.controls');
      if (c) c.innerHTML =
        '<div class="ctrl-row"><kbd>左摇杆</kbd><span>驾驶坦克</span></div>' +
        '<div class="ctrl-row"><kbd>右半屏</kbd><span>拖动瞄准 / 旋转镜头</span></div>' +
        '<div class="ctrl-row"><kbd>开炮</kbd><span>发射主炮</span></div>' +
        '<div class="ctrl-row"><kbd>冲刺</kbd><span>加速</span></div>';
    }

    this.state = 'menu';      // menu | playing | gameover
    this.world = null;
    this.player = null;
    this.enemies = [];
    this.shells = null;

    this.camYaw = 0;
    this.camPitch = 0.18;
    this.shake = 0;
    this.fovKick = 0;                  // 开炮 FOV 顿挫
    this.curFov = this.engine.baseFov; // 平滑后的当前 FOV
    this.sprinting = false;
    this.wave = 0;
    this.score = 0;
    this.cooldown = 0;
    this.waveBreak = 0;
    this.movedDist = 0;

    // 复用临时向量
    this._dir = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._shellDir = new THREE.Vector3();
    this._off = new THREE.Vector3();

    this.clock = new THREE.Clock();
    this._bindUI();
    // 让菜单先绘制，再生成世界（避免白屏卡顿）
    requestAnimationFrame(() => this._buildWorld());
    this._loop();
  }

  _bindUI() {
    document.getElementById('btn-start').addEventListener('click', () => this.start());
    document.getElementById('btn-restart').addEventListener('click', () => this.start());
    // 点击画面重新锁定鼠标（仅桌面端）
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.touch.isTouch) this.input.requestLock();
    });
  }

  _buildWorld() {
    this.world = new VoxelWorld(this.engine.scene, {
      sizeX: 128, sizeZ: 128, sizeY: 40, chunk: 16, seed: 20260626,
    });
    this.shells = new ShellManager(this.engine.scene, this.world);
    this.debris = new Debris(this.engine.scene, this.world);

    this.player = new Tank(this.world, { isEnemy: false });
    const c = this.world.centerSpawn;
    this.player.setPosition(c.x, c.y, c.z);
    this.player.groundClamp();
    this.player.addTo(this.engine.scene);

    document.getElementById('loading-hint').textContent = '战场已就绪 — 点击「开始战斗」';

    // 调试：?auto 自动开局（用于无头截图验证渲染管线）
    if (location.search.includes('auto')) requestAnimationFrame(() => this.start());
  }

  start() {
    if (!this.world) return; // 世界还没生成完
    this.sound.init();
    // 重置
    for (const e of this.enemies) e.dispose(this.engine.scene);
    this.enemies.length = 0;
    this.shells.clear();
    this.particles.clear();
    this.debris.clear();

    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.group.visible = true;
    const c = this.world.centerSpawn;
    this.player.setPosition(c.x, c.y + 1, c.z);
    this.player.hullYaw = 0;
    this.player.groundClamp();
    this.camYaw = 0; this.camPitch = 0.18;
    this.wave = 0; this.score = 0; this.cooldown = 0; this.waveBreak = 0.5;

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('gameover').classList.add('hidden');
    this.hud.show();
    this.hud.setScore(0);
    this.state = 'playing';
    if (this.touch.isTouch) this.touch.show();
    else this.input.requestLock();
  }

  // ---------- 波次 ----------
  _nextWave() {
    this.wave++;
    const count = 2 + this.wave;
    for (let i = 0; i < count; i++) this._spawnEnemy(this.wave);
    this.hud.setWave(this.wave);
    this.hud.setEnemies(this.enemies.length);
  }

  _spawnEnemy(level) {
    const w = this.world;
    let x, z, tries = 0;
    do {
      const ang = Math.random() * Math.PI * 2;
      const r = 38 + Math.random() * 22;
      x = w.SX / 2 + Math.cos(ang) * r;
      z = w.SZ / 2 + Math.sin(ang) * r;
      tries++;
    } while ((x < 4 || z < 4 || x > w.SX - 4 || z > w.SZ - 4) && tries < 12);
    x = Math.max(4, Math.min(w.SX - 4, x));
    z = Math.max(4, Math.min(w.SZ - 4, z));
    const e = new EnemyTank(w, level);
    e.setPosition(x, w.heightAt(x, z), z);
    e.groundClamp();
    e.addTo(this.engine.scene);
    this.enemies.push(e);
  }

  // ---------- 主循环 ----------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this._update(dt);
    this.particles.update(dt);
    if (this.debris) this.debris.update(dt);
    this.hud.update(dt);
    this.engine.render();
  }

  _update(dt) {
    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._updateShells(dt);
    this._updateCamera(dt);
    this.engine.followSun(this.player.pos);

    // 波次推进
    const aliveCount = this.enemies.filter((e) => e.alive).length;
    this.hud.setEnemies(aliveCount);
    if (aliveCount === 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) {
        // 清理残骸引用
        for (const e of this.enemies) e.dispose(this.engine.scene);
        this.enemies.length = 0;
        this._nextWave();
        this.waveBreak = 3.0;
      }
    }

    this.hud.drawMinimap(this.world, this.player, this.enemies);
    this.hud.setHP(this.player.hp, this.player.maxHp);
  }

  _updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;

    // —— 鼠标 / 触屏拖动 → 镜头朝向 ——
    const m = this.input.consumeMouse();
    const tl = this.touch.consumeLook();
    this.camYaw -= m.dx * MOUSE_SENS + tl.dx * TOUCH_LOOK_SENS;
    this.camPitch -= m.dy * MOUSE_SENS + tl.dy * TOUCH_LOOK_SENS;
    this.camPitch = Math.max(-0.55, Math.min(0.85, this.camPitch));

    // 镜头前向
    const cy = Math.cos(this.camPitch);
    this._dir.set(Math.sin(this.camYaw) * cy, Math.sin(this.camPitch), Math.cos(this.camYaw) * cy).normalize();

    // —— 相对镜头平面移动：WASD 或 触屏摇杆（带模拟量） ——
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);   // 前(水平)
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);  // 右
    let ix = 0, iz = 0, mag = 0;
    if (this.input.isDown('KeyW')) { ix += fx; iz += fz; }
    if (this.input.isDown('KeyS')) { ix -= fx; iz -= fz; }
    if (this.input.isDown('KeyD')) { ix += rx; iz += rz; }
    if (this.input.isDown('KeyA')) { ix -= rx; iz -= rz; }
    if (ix * ix + iz * iz > 0.0001) mag = 1;
    if (this.touch.active) {
      const sx = this.touch.moveX, sy = this.touch.moveY; // 屏幕 上=前
      ix += fx * -sy + rx * sx;
      iz += fz * -sy + rz * sx;
      mag = Math.max(mag, Math.min(1, Math.hypot(sx, sy)));
    }

    let speed01 = 0;
    this.sprinting = false;
    const moving = ix * ix + iz * iz > 0.0001 && mag > 0.05;
    if (moving) {
      const inv = 1 / Math.hypot(ix, iz);
      ix *= inv; iz *= inv;
      const sprintOn =
        this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') || this.touch.sprint;
      const sprint = sprintOn ? SPRINT : 1;
      const step = MOVE_SPEED * sprint * dt * mag;
      const moved = p.tryMove(ix * step, iz * step);
      // 车身朝向平滑转向移动方向
      const targetHull = Math.atan2(ix, iz);
      p.hullYaw = this._angleLerp(p.hullYaw, targetHull, 6 * dt);
      speed01 = moved ? (sprint / SPRINT) * mag : 0;
      this.sprinting = sprintOn && moved;
      if (moved) {
        this.movedDist += step;
        if (this.movedDist > 1.4) { this.movedDist = 0; this._treadDust(p); }
      }
    }
    p.groundClamp(0.4);
    this.sound.setEngine(speed01 * 0.7 + (moving ? 0.3 : 0));

    // —— 炮塔瞄准：对准准星方向上的远点 ——
    this._camTarget.copy(p.pos); this._camTarget.y += 2.2;
    this._aim.copy(this._camTarget).addScaledVector(this._dir, 80);
    const horiz = Math.hypot(this._aim.x - p.pos.x, this._aim.z - p.pos.z);
    p.turretYaw = Math.atan2(this._aim.x - p.pos.x, this._aim.z - p.pos.z);
    p.barrelPitch = Math.max(-0.3, Math.min(0.6, Math.atan2(this._aim.y - (p.pos.y + 1.7), horiz)));
    p.syncModel();

    // —— 开火 ——
    this.cooldown = Math.max(0, this.cooldown - dt);
    if ((this.input.firing || this.touch.firing) && this.cooldown <= 0) this._playerFire();
    this.hud.setReload(1 - this.cooldown / RELOAD, this.cooldown <= 0);
  }

  _playerFire() {
    const p = this.player;
    p.getMuzzleWorld(this._muzzle);
    this._shellDir.copy(this._aim).sub(this._muzzle).normalize();
    this.shells.spawn(this._muzzle, this._shellDir, PLAYER_SHELL_SPEED, false);
    this.particles.muzzle(this._muzzle, this._shellDir);
    this.sound.cannon();
    p.recoil = 0.5;
    this.shake = Math.max(this.shake, 0.25);
    this.fovKick = Math.max(this.fovKick, 7);
    this.cooldown = RELOAD;
  }

  _treadDust(p) {
    this._off.set(p.pos.x - Math.sin(p.hullYaw) * 1.6, p.pos.y + 0.1, p.pos.z - Math.cos(p.hullYaw) * 1.6);
    this.particles.dust(this._off);
  }

  _updateEnemies(dt) {
    const fire = (pos, dir, speed, isEnemy) => {
      this.shells.spawn(pos, dir, speed, isEnemy);
      this.particles.muzzle(pos, dir);
      this.sound.enemyCannon();
    };
    for (const e of this.enemies) e.update(dt, this.player, this.enemies, fire);
  }

  _updateShells(dt) {
    const tanks = [this.player, ...this.enemies];
    this.shells.update(
      dt, tanks,
      (pos, ownerIsEnemy) => this._explode(pos, ownerIsEnemy),
      (pos) => this.particles.trail(pos),
    );
  }

  _explode(pos, ownerIsEnemy) {
    // 1) 地形破坏
    const destroyed = this.world.removeSphere(pos.x, pos.y, pos.z, CRATER_RADIUS);
    // 2) 特效 + 音效
    const scale = 1 + Math.min(0.6, destroyed * 0.01);
    this.particles.explosion(pos, scale);
    if (destroyed > 0) this.particles.debris(pos, [0.55, 0.5, 0.42], 10);
    this.sound.explosion(scale);

    // 3) 溅射伤害
    const targets = ownerIsEnemy ? [this.player] : this.enemies;
    for (const t of targets) {
      if (!t.alive) continue;
      const dx = t.pos.x - pos.x, dy = (t.pos.y + 1) - pos.y, dz = t.pos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > BLAST_RADIUS) continue;
      const falloff = 1 - d / BLAST_RADIUS;
      const base = ownerIsEnemy ? ENEMY_DMG : PLAYER_DMG;
      const killed = t.damage(base * falloff);
      if (t === this.player) {
        this.hud.damage();
        this.sound.pickHurt();
        this.shake = Math.max(this.shake, 0.5);
        if (killed) this._gameOver();
      } else {
        this.particles.debris(t.pos.clone().setY(t.pos.y + 1.0), [0.7, 0.25, 0.18], 6);
        if (!ownerIsEnemy) this.hud.hitMarker();
        this.sound.hit();
        if (killed) this._killEnemy(t);
      }
    }

    // 4) 屏幕震动（与玩家距离相关）
    const pd = this.player.pos.distanceTo(pos);
    this.shake = Math.max(this.shake, Math.max(0, 0.6 - pd * 0.012));
  }

  _killEnemy(e) {
    const at = e.pos.clone(); at.y += 1.0;
    this.particles.explosion(at, 1.6);
    this.debris.burst(at.x, e.pos.y + 0.4, at.z, [0.62, 0.24, 0.17], 28, 11);
    this.sound.explosion(1.4);
    e.alive = false;
    e.group.visible = false;
    const pts = 100 * this.wave;
    this.score += pts;
    this.hud.killFeed(pts);
    this.hud.setScore(this.score);
  }

  _updateCamera(dt) {
    const cam = this.engine.camera;

    // —— FOV：基础 + 冲刺拉伸 + 开炮顿挫（沿视轴回拉，不破坏瞄准方向） ——
    this.fovKick = Math.max(0, this.fovKick - dt * 26);
    const targetFov = this.engine.baseFov + (this.sprinting ? 6 : 0) + this.fovKick;
    this.curFov += (targetFov - this.curFov) * Math.min(1, dt * 12);
    this.engine.setFov(this.curFov);
    const dolly = CAM_DIST + this.fovKick * 0.06;

    this._camTarget.copy(this.player.pos); this._camTarget.y += 2.2;
    this._camPos.copy(this._camTarget).addScaledVector(this._dir, -dolly);

    // 镜头不要穿入地形
    const ground = this.world.heightAt(this._camPos.x, this._camPos.z) + 0.8;
    if (this._camPos.y < ground) this._camPos.y = ground;

    // 震动
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const a = this.shake * 0.5;
      this._off.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    } else {
      this._off.set(0, 0, 0);
    }
    cam.position.copy(this._camPos).add(this._off);
    cam.lookAt(this._camTarget.x + this._off.x, this._camTarget.y + this._off.y, this._camTarget.z + this._off.z);
  }

  _gameOver() {
    this.state = 'gameover';
    this.sound.silenceEngine();
    const dp = this.player.pos;
    this.particles.explosion(dp.clone().setY(dp.y + 1), 2.4);
    this.debris.burst(dp.x, dp.y + 0.4, dp.z, [0.54, 0.49, 0.18], 34, 12);
    this.player.group.visible = false;
    this.sound.explosion(2);
    this.shake = 1.2;
    document.exitPointerLock?.();
    this.touch.hide();
    this.hud.hide();
    document.getElementById('go-wave').textContent = this.wave;
    document.getElementById('go-score').textContent = this.score;
    document.getElementById('gameover').classList.remove('hidden');
  }

  _angleLerp(cur, target, t) {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * Math.min(1, t);
  }
}

window.addEventListener('DOMContentLoaded', () => new Game());
