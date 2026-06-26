/**
 * TouchControls —— 移动端触摸操作
 *   · 左侧虚拟摇杆：模拟驾驶（带模拟量）
 *   · 右半屏拖动：瞄准炮塔 / 旋转镜头
 *   · 开火 / 冲刺 按钮
 * 自建 DOM，挂到 body；通过 isTouch 判断是否启用。
 */
export class TouchControls {
  constructor() {
    this.isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    this.moveX = 0;       // -1..1（右为正）
    this.moveY = 0;       // -1..1（下为正）
    this.active = false;  // 摇杆是否在用
    this.firing = false;
    this.sprint = false;
    this._lookDX = 0;
    this._lookDY = 0;
    this.JOY_R = 56;

    this._touches = new Map(); // identifier -> role/state
    if (this.isTouch) this._build();
  }

  _build() {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.className = 'hidden';
    ui.innerHTML = `
      <div class="look-layer"></div>
      <div class="joystick"><div class="joy-knob"></div></div>
      <button class="t-btn btn-fire">开炮</button>
      <button class="t-btn btn-sprint">冲刺</button>
    `;
    document.body.appendChild(ui);
    this.ui = ui;
    this.look = ui.querySelector('.look-layer');
    this.joy = ui.querySelector('.joystick');
    this.knob = ui.querySelector('.joy-knob');
    this.fireBtn = ui.querySelector('.btn-fire');
    this.sprintBtn = ui.querySelector('.btn-sprint');

    const opt = { passive: false };

    // —— 摇杆 ——
    this.joy.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      const rect = this.joy.getBoundingClientRect();
      this._touches.set(t.identifier, {
        role: 'joy',
        ox: rect.left + rect.width / 2,
        oy: rect.top + rect.height / 2,
      });
      this.active = true;
    }, opt);

    // —— 右半屏视角拖动 ——
    this.look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._touches.set(t.identifier, { role: 'look', x: t.clientX, y: t.clientY });
    }, opt);

    // —— 开火 / 冲刺 ——
    this._holdButton(this.fireBtn, (v) => (this.firing = v));
    this._holdButton(this.sprintBtn, (v) => (this.sprint = v));

    // —— 全局移动 / 抬起：按 identifier 分发 ——
    document.addEventListener('touchmove', (e) => {
      let handled = false;
      for (const t of e.changedTouches) {
        const s = this._touches.get(t.identifier);
        if (!s) continue;
        handled = true;
        if (s.role === 'joy') this._updateJoy(t, s);
        else if (s.role === 'look') {
          this._lookDX += t.clientX - s.x;
          this._lookDY += t.clientY - s.y;
          s.x = t.clientX; s.y = t.clientY;
        }
      }
      if (handled) e.preventDefault();
    }, opt);

    const end = (e) => {
      for (const t of e.changedTouches) {
        const s = this._touches.get(t.identifier);
        if (!s) continue;
        if (s.role === 'joy') this._resetJoy();
        this._touches.delete(t.identifier);
      }
    };
    document.addEventListener('touchend', end, opt);
    document.addEventListener('touchcancel', end, opt);
  }

  _holdButton(el, set) {
    const on = (e) => { e.preventDefault(); e.stopPropagation(); set(true); el.classList.add('pressed'); };
    const off = (e) => { e.preventDefault(); e.stopPropagation(); set(false); el.classList.remove('pressed'); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
  }

  _updateJoy(t, s) {
    let dx = t.clientX - s.ox;
    let dy = t.clientY - s.oy;
    const len = Math.hypot(dx, dy);
    const clamp = Math.min(len, this.JOY_R);
    const a = len > 0.001 ? clamp / len : 0;
    dx *= a; dy *= a;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.moveX = dx / this.JOY_R;
    this.moveY = dy / this.JOY_R;
  }

  _resetJoy() {
    this.active = false;
    this.moveX = 0; this.moveY = 0;
    this.knob.style.transform = 'translate(0,0)';
  }

  /** 取出本帧累计的拖动增量并清零 */
  consumeLook() {
    const dx = this._lookDX, dy = this._lookDY;
    this._lookDX = 0; this._lookDY = 0;
    return { dx, dy };
  }

  show() { if (this.ui) this.ui.classList.remove('hidden'); }
  hide() {
    if (!this.ui) return;
    this.ui.classList.add('hidden');
    this._touches.clear();
    this._resetJoy();
    this.firing = false; this.sprint = false;
    this.fireBtn.classList.remove('pressed');
    this.sprintBtn.classList.remove('pressed');
  }
}
