/**
 * 轻量确定性值噪声（value noise）
 * 用整型哈希生成可复现的伪随机梯度，bilinear 平滑 + 多倍频叠加。
 */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h & 0xffffff) / 0xffffff; // 0..1
}

function smooth(t) {
  return t * t * (3 - 2 * t); // smoothstep
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise2(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}

/** 分形布朗运动：多倍频叠加，返回 0..1 */
export function fbm2(x, y, seed = 1337, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 确定性的“随机数”，用于地图布置（同坐标恒定） */
export function rand2(x, y, seed = 7) {
  return hash2(x | 0, y | 0, seed);
}
