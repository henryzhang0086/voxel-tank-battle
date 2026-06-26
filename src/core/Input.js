/**
 * Input —— 键盘 / 鼠标 / 指针锁定
 * 鼠标移动以「每帧消费一次」的累积增量方式提供，避免丢帧。
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;      // 左键是否按住
    this.locked = false;

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 失焦时清空，避免“按键卡住”
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.firing = false;
        this.keys.clear();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.firing = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** 取出本帧累计的鼠标增量并清零 */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
}
