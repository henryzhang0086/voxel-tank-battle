// 生成体素风「坦克大战」宣传海报（SVG → 由 Chrome 截图为 PNG）
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const qrcode = require('./qrcode.cjs');

const W = 1200, H = 1600;

// 在线地址（GitHub Pages，全球可玩；改这里重渲染即可）
const PLAY_URL = 'https://henryzhang0086.github.io/voxel-tank-battle/';
const URL_LABEL = 'GitHub Pages · 免安装';

// ---------- 二维码卡片 ----------
function qrCard(url, label, cardX, cardY, CW, CH) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const QS = CW - 72;                 // 二维码边长
  const qx = cardX + (CW - QS) / 2;
  const qy = cardY + 30;
  const m = QS / n;
  let mods = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c))
        mods += `<rect x="${(qx + c * m).toFixed(2)}" y="${(qy + r * m).toFixed(2)}" width="${(m + 0.5).toFixed(2)}" height="${(m + 0.5).toFixed(2)}" fill="#0a0d12"/>`;
  const cx = cardX + CW / 2;
  return `
  <g filter="url(#softshadow)">
    <rect x="${cardX}" y="${cardY}" width="${CW}" height="${CH}" rx="22" fill="#ffffff"/>
    <rect x="${qx - 8}" y="${qy - 8}" width="${QS + 16}" height="${QS + 16}" rx="8" fill="#ffffff" stroke="#e4e8ee" stroke-width="2"/>
    ${mods}
    <text x="${cx}" y="${qy + QS + 50}" text-anchor="middle" font-size="38" font-weight="900" fill="#16202c" letter-spacing="6">扫码即玩</text>
    <text x="${cx}" y="${qy + QS + 84}" text-anchor="middle" font-size="22" font-weight="600" fill="#5b6675" letter-spacing="1">${label}</text>
  </g>`;
}

// ---------- 颜色工具 ----------
const hx = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const shade = (h, f) => {
  const [r, g, b] = hx(h);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};

// ---------- 等距体素绘制 ----------
function drawVoxels(voxels, { ox, oy, tw, th, ch }) {
  const sorted = [...voxels].sort((a, b) => (a.x + a.z + a.y) - (b.x + b.z + b.y));
  let s = '';
  for (const v of sorted) {
    const px = ox + (v.x - v.z) * (tw / 2);
    const py = oy + (v.x + v.z) * (th / 2) - v.y * ch;
    const top = shade(v.c, 1.0), right = shade(v.c, 0.78), left = shade(v.c, 0.58);
    const x0 = px, y0 = py;
    // 顶面
    s += `<polygon points="${x0},${y0} ${x0 + tw / 2},${y0 + th / 2} ${x0},${y0 + th} ${x0 - tw / 2},${y0 + th / 2}" fill="${top}"/>`;
    // 右面
    s += `<polygon points="${x0},${y0 + th} ${x0 + tw / 2},${y0 + th / 2} ${x0 + tw / 2},${y0 + th / 2 + ch} ${x0},${y0 + th + ch}" fill="${right}"/>`;
    // 左面
    s += `<polygon points="${x0 - tw / 2},${y0 + th / 2} ${x0},${y0 + th} ${x0},${y0 + th + ch} ${x0 - tw / 2},${y0 + th / 2 + ch}" fill="${left}"/>`;
  }
  return s;
}
function iso(v, { ox, oy, tw, th, ch }) {
  return { x: ox + (v.x - v.z) * (tw / 2), y: oy + (v.x + v.z) * (th / 2) - v.y * ch };
}

// 确定性伪随机
let _s = 9241;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- 颜色常量（与游戏一致） ----------
const C = {
  body: 0x8a7d2e, turret: 0x9c8a30, track: 0x23251c, barrel: 0xb9bfae, detail: 0x5a5320,
  grassA: 0x4f9e3e, grassB: 0x458f37, dirt: 0x6b4f2c, scorch: 0x26241d, stone: 0x747a83, stoneD: 0x565c66,
  enemy: 0x9a3a2a, enemyT: 0x86311f, enemyTrack: 0x261c19,
};

// ---------- 构建主场景体素 ----------
const scene = [];

// 地面（收紧成平台，让坦克成为主体）
for (let x = -2; x <= 13; x++) {
  for (let z = -2; z <= 6; z++) {
    const cd = Math.hypot(x - 1, z + 1); // 车头前的焦痕
    let c = rnd() > 0.5 ? C.grassA : C.grassB;
    if (rnd() > 0.86) c = C.dirt;
    if (cd < 1.8) c = C.scorch;
    scene.push({ x, y: -1, z, c });
  }
}

// 一处后方掩体作点缀
for (let i = 0; i < 3; i++)
  for (let y = 0; y <= 2; y++) scene.push({ x: -1, y, z: 4 + i, c: y === 2 ? C.stone : C.stoneD });

// ---------- 英雄坦克 ----------
function buildTank(model, ox0, oz0, col) {
  const t = [];
  const push = (x, y, z, c) => t.push({ x: x + ox0, y, z: z + oz0, c });
  // 履带
  for (let x = 0; x <= 7; x++) { push(x, 0, 0, col.track); push(x, 0, 4, col.track); }
  // 车体
  for (let x = 0; x <= 7; x++)
    for (let z = 1; z <= 3; z++)
      for (let y = 0; y <= 1; y++) push(x, y, z, col.body);
  // 前装甲斜面
  for (let z = 1; z <= 3; z++) push(8, 1, z, col.body);
  // 炮塔
  for (let x = 2; x <= 5; x++)
    for (let z = 1; z <= 3; z++) push(x, 2, z, col.turret);
  push(3, 3, 2, col.detail); push(4, 3, 2, col.turret); // 指挥塔
  // 炮管（向右上方抬起 = 开火姿态）
  for (let i = 0; i <= 6; i++) {
    const bx = 5 + i, by = 2 + Math.floor(i * 0.55);
    push(bx, by, 2, col.barrel);
  }
  return t;
}
const tankCol = { track: C.track, body: C.body, turret: C.turret, detail: C.detail, barrel: C.barrel };
const hero = buildTank(null, 0, 0, tankCol);
scene.push(...hero);

const HERO_T = { ox: W / 2 - 150, oy: 1000, tw: 74, th: 37, ch: 56 };
const sceneSVG = drawVoxels(scene, HERO_T);

// 炮口屏幕坐标（曳光弹起点 / 炮口闪光）
const muzzle = iso({ x: 11.4, y: 5.1, z: 2 }, HERO_T);

// ---------- 远处敌方坦克（较小，单独图层在后） ----------
const enemyCol = { track: C.enemyTrack, body: C.enemy, turret: C.enemyT, detail: C.enemyTrack, barrel: 0x5a6c79 };
const enemy1 = buildTank(null, 0, 0, enemyCol);   // 被命中正在爆炸的敌人
const enemy2 = buildTank(null, 0, 0, enemyCol);   // 远处还击的敌人
const E1 = { ox: 905, oy: 545, tw: 30, th: 15, ch: 23 };  // 命中目标
const E2 = { ox: 250, oy: 690, tw: 26, th: 13, ch: 20 };  // 还击者
const enemySVG = drawVoxels(enemy1, E1) + drawVoxels(enemy2, E2);

// 大爆炸落点（敌人 E1 身上）
const boom = { x: E1.ox + 60, y: E1.oy + 30 };

// 飞溅碎块（爆炸抛出的方块，屏幕坐标）
let debrisSVG = '';
for (let i = 0; i < 22; i++) {
  const a = rnd() * Math.PI * 2, r = 40 + rnd() * 150;
  const x = boom.x + Math.cos(a) * r, y = boom.y + Math.sin(a) * r * 0.7 - 60 * rnd();
  const sz = 8 + rnd() * 18;
  const c = rnd() > 0.5 ? shade(C.enemy, 0.9) : shade(C.dirt, 1);
  debrisSVG += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="${c}" transform="rotate(${rnd() * 90} ${x} ${y})" opacity="${0.7 + rnd() * 0.3}"/>`;
}

// ---------- 曳光弹 ----------
function tracer(x1, y1, x2, y2, col) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="5" stroke-linecap="round" filter="url(#glow)" opacity="0.9"/>`;
}

// ---------- 爆炸火花 ----------
function sparks(cx, cy, n, R) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = R * (0.3 + rnd() * 0.7);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8 - r * 0.2;
    const sz = 3 + rnd() * 7;
    const col = rnd() > 0.5 ? '#ffd24a' : '#ff7a2c';
    s += `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" fill="${col}" opacity="${0.5 + rnd() * 0.5}" transform="rotate(${rnd() * 60} ${x} ${y})"/>`;
  }
  return s;
}

// ---------- 组装 SVG ----------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Microsoft YaHei','PingFang SC',sans-serif">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a1438"/>
    <stop offset="0.42" stop-color="#3a2150"/>
    <stop offset="0.66" stop-color="#a83c46"/>
    <stop offset="0.82" stop-color="#ec7a3a"/>
    <stop offset="1" stop-color="#ffc04a"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff4d6"/>
    <stop offset="0.4" stop-color="#ffd36b"/>
    <stop offset="1" stop-color="#ffb33e" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="boom" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff3c0"/>
    <stop offset="0.25" stop-color="#ffd24a"/>
    <stop offset="0.55" stop-color="#ff6a2c"/>
    <stop offset="0.8" stop-color="#c2331c" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#c2331c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="title" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.5" stop-color="#ffe39a"/>
    <stop offset="1" stop-color="#ff9e3d"/>
  </linearGradient>
  <linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
    <stop offset="0.22" stop-color="#000" stop-opacity="0"/>
    <stop offset="0.8" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
  </linearGradient>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="softshadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.55"/>
  </filter>
</defs>

<!-- 天空 -->
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="${W / 2 + 120}" cy="640" r="360" fill="url(#sun)" opacity="0.9"/>
<!-- 星点 -->
${Array.from({ length: 40 }, () => `<circle cx="${rnd() * W}" cy="${rnd() * 380}" r="${rnd() * 1.6 + 0.4}" fill="#fff" opacity="${rnd() * 0.7}"/>`).join('')}

<!-- 地面阴影渐隐 -->
<ellipse cx="${W / 2 - 40}" cy="1200" rx="520" ry="160" fill="#000" opacity="0.3"/>

<!-- 远处敌军 -->
<g opacity="0.95" filter="url(#softshadow)">${enemySVG}</g>

<!-- 还击曳光（敌 → 我） -->
${tracer(E2.ox + 10, E2.oy + 6, muzzle.x - 30, muzzle.y - 6, '#ff5a3c')}

<!-- 主战场 + 英雄坦克 -->
<g filter="url(#softshadow)">${sceneSVG}</g>

<!-- 击杀曳光（我 → 敌） -->
${tracer(muzzle.x, muzzle.y, boom.x, boom.y, '#ffe27a')}
<!-- 炮口闪光 -->
<circle cx="${muzzle.x}" cy="${muzzle.y}" r="40" fill="#ffe27a" opacity="0.95" filter="url(#glow)"/>
<circle cx="${muzzle.x}" cy="${muzzle.y}" r="18" fill="#fff" opacity="0.95"/>

<!-- 大爆炸（命中敌人） -->
${debrisSVG}
<circle cx="${boom.x}" cy="${boom.y}" r="230" fill="url(#boom)"/>
<circle cx="${boom.x}" cy="${boom.y}" r="104" fill="#fff6d8" opacity="0.92"/>
${sparks(boom.x, boom.y, 70, 250)}

<!-- 暗角 -->
<rect width="${W}" height="${H}" fill="url(#vig)"/>

<!-- 标题 -->
<g text-anchor="middle">
  <text x="${W / 2}" y="250" font-size="200" font-weight="900" fill="url(#title)" stroke="#3a1d00" stroke-width="6"
        paint-order="stroke" letter-spacing="6" style="filter:drop-shadow(0 8px 24px rgba(0,0,0,.6))">坦克大战</text>
  <text x="${W / 2}" y="320" font-size="46" font-weight="800" fill="#ffd98a" letter-spacing="20">VOXEL TANK BATTLE</text>
  <rect x="${W / 2 - 360}" y="356" width="720" height="2" fill="#ffd98a" opacity="0.5"/>
  <text x="${W / 2}" y="408" font-size="34" font-weight="700" fill="#eef2f8" letter-spacing="6">可破坏体素战场 · 波次生存 · 3D 装甲对决</text>
</g>

<!-- 二维码卡片（GitHub Pages 在线版，扫码即玩） -->
${qrCard(PLAY_URL, URL_LABEL, 824, 1104, 320, 372)}

<!-- 底部：在线地址 + 操作 -->
<g text-anchor="start">
  <text x="72" y="1466" font-size="30" font-weight="800" fill="#ffd06b" letter-spacing="2">▶ 在线畅玩 · 手机/电脑免安装即点即玩</text>
  <text x="72" y="1516" font-size="28" font-weight="800" fill="#8fe0ff" letter-spacing="1">henryzhang0086.github.io/voxel-tank-battle</text>
  <text x="72" y="1560" font-size="19" fill="#9aa6b6" letter-spacing="1">摇杆 / WASD 驾驶　触屏 / 鼠标 瞄准　按钮 / 左键 开炮　·　Three.js WebGL</text>
</g>

<!-- 四角装饰 -->
${[[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]]
    .map(([x, y, sx, sy]) => `<path d="M ${x} ${y + sy * 60} L ${x} ${y} L ${x + sx * 60} ${y}" stroke="#ffb33e" stroke-width="4" fill="none" opacity="0.85"/>`)
    .join('')}
</svg>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
</style></head><body>${svg}</body></html>`;

writeFileSync(new URL('./poster.html', import.meta.url), html);
console.log('poster.html written,', html.length, 'bytes;  voxels in scene =', scene.length, '; muzzle=', muzzle);
