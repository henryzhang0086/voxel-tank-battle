/**
 * 方块定义表。颜色按 面（top/side/bottom）分别给值，制造经典体素观感。
 * id=0 恒为空气。solid=false 的方块不参与碰撞/网格化（目前只有空气）。
 */
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  ROCK: 5,   // 深色岩石（山体/掩体）
  METAL: 6,  // 金属掩体（更耐打但仍可破坏）
  WOOD: 7,
  LEAF: 8,
};

// 颜色用 0..1 的 [r,g,b]
const C = (hex) => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

export const BLOCK_DEFS = {
  [BLOCK.GRASS]: { top: C(0x6ab150), side: C(0x82643c), bottom: C(0x6b5230), solid: true },
  [BLOCK.DIRT]:  { top: C(0x7a5c34), side: C(0x6f5230), bottom: C(0x5e4527), solid: true },
  [BLOCK.STONE]: { top: C(0x9aa0a8), side: C(0x868c94), bottom: C(0x767c84), solid: true },
  [BLOCK.SAND]:  { top: C(0xe6d8a0), side: C(0xdcce92), bottom: C(0xcdbe82), solid: true },
  [BLOCK.ROCK]:  { top: C(0x5c636e), side: C(0x4f555f), bottom: C(0x444a52), solid: true },
  [BLOCK.METAL]: { top: C(0x8c98a8), side: C(0x70808f), bottom: C(0x5e6c79), solid: true },
  [BLOCK.WOOD]:  { top: C(0x9c7b4a), side: C(0x6f4f2a), bottom: C(0x6f4f2a), solid: true },
  [BLOCK.LEAF]:  { top: C(0x4f9b3e), side: C(0x478f38), bottom: C(0x3c7e30), solid: true },
};

export function isSolidId(id) {
  return id !== BLOCK.AIR;
}
