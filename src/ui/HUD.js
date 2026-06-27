/** HUD —— 操作 DOM 覆盖层与小地图绘制 */
export class HUD {
  constructor() {
    this.elHud = document.getElementById('hud');
    this.elCross = document.getElementById('crosshair');
    this.hp = document.getElementById('hud-hp');
    this.reload = document.getElementById('hud-reload');
    this.reloadText = document.getElementById('hud-reload-text');
    this.wave = document.getElementById('hud-wave');
    this.score = document.getElementById('hud-score');
    this.enemies = document.getElementById('hud-enemies');
    this.hitflash = document.getElementById('hitflash');
    this.vignette = document.getElementById('damage-vignette');

    this.hitmarker = document.getElementById('hitmarker');
    this.killfeed = document.getElementById('killfeed');
    this.bannerEl = document.getElementById('banner');

    this.mm = document.getElementById('minimap');
    this.mmx = this.mm.getContext('2d');
    this._vig = 0;
    this._flash = 0;
    this._hit = 0;
  }

  show() { this.elHud.classList.remove('hidden'); this.elCross.classList.remove('hidden'); }
  hide() { this.elHud.classList.add('hidden'); this.elCross.classList.add('hidden'); }

  setHP(cur, max) {
    const r = Math.max(0, cur / max);
    this.hp.style.width = (r * 100).toFixed(1) + '%';
    this.hp.style.filter = r < 0.3 ? 'hue-rotate(-40deg) saturate(1.4)' : 'none';
  }
  setReload(ratio, ready) {
    this.reload.style.width = (Math.min(1, ratio) * 100).toFixed(0) + '%';
    this.reloadText.textContent = ready ? '就绪 · 开火' : '装填中…';
    this.reloadText.style.color = ready ? 'var(--green)' : 'var(--accent)';
  }
  setWave(w) { this.wave.textContent = w; }
  setScore(s) { this.score.textContent = s; }
  setEnemies(n) { this.enemies.textContent = n; }

  hitFlash() { this._flash = 0.5; }
  damage() { this._vig = 0.85; }
  hitMarker() { this._hit = 0.3; }

  killFeed(pts = 0, name = '敌方坦克') {
    const line = document.createElement('div');
    line.className = 'kill-line';
    line.innerHTML = `击毁 ${name}坦克 <b>+${pts}</b>`;
    this.killfeed.appendChild(line);
    setTimeout(() => line.remove(), 2600);
    while (this.killfeed.childElementCount > 5) this.killfeed.firstChild.remove();
  }

  banner(text) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;   // 重启动画
    this.bannerEl.classList.add('show');
  }

  update(dt) {
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 2.5);
      this.hitflash.style.opacity = (this._flash * 0.5).toFixed(3);
    }
    if (this._vig > 0) {
      this._vig = Math.max(0, this._vig - dt * 1.6);
      this.vignette.style.opacity = this._vig.toFixed(3);
    }
    if (this._hit > 0) {
      this._hit = Math.max(0, this._hit - dt * 3);
      const k = this._hit / 0.3;
      this.hitmarker.style.opacity = k.toFixed(3);
      this.hitmarker.style.transform = `translate(-50%,-50%) scale(${(1.6 - k * 0.6).toFixed(2)})`;
    }
  }

  drawMinimap(world, player, enemies) {
    const ctx = this.mmx;
    const S = this.mm.width;
    ctx.clearRect(0, 0, S, S);
    const sx = S / world.SX;
    const sz = S / world.SZ;

    // 背景
    ctx.fillStyle = 'rgba(20,30,24,0.85)';
    ctx.fillRect(0, 0, S, S);

    // 玩家（绿色三角，朝车身方向）
    const pxp = player.pos.x * sx;
    const pzp = player.pos.z * sz;
    ctx.save();
    ctx.translate(pxp, pzp);
    ctx.rotate(-player.hullYaw);
    ctx.fillStyle = '#7ed957';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 炮口方向射线
    ctx.strokeStyle = 'rgba(255,179,62,0.7)';
    ctx.beginPath();
    ctx.moveTo(pxp, pzp);
    ctx.lineTo(pxp + Math.sin(player.turretYaw) * 14, pzp + Math.cos(player.turretYaw) * 14);
    ctx.stroke();

    // 敌人（红点）
    ctx.fillStyle = '#ff5a3c';
    for (const e of enemies) {
      if (!e.alive) continue;
      ctx.beginPath();
      ctx.arc(e.pos.x * sx, e.pos.z * sz, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 边框
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}
