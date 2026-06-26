# 坦克大战 · VOXEL TANK BATTLE

工业级体素风 3D 坦克大战 —— 基于 **Three.js (WebGL)**，零构建、可离线运行。
《我的世界》式的可破坏体素战场 + 第三人称坦克战斗 + 波次生存。

![tech](https://img.shields.io/badge/Three.js-r169-black) ![build](https://img.shields.io/badge/build-none-green)

---

## 运行方式

ES Module + importmap 需要通过 HTTP 提供（不能直接双击 `index.html`）。

**最简单：** 双击 `start_game.bat`
> 自动启动本地服务器并打开浏览器；窗口需保持开启。优先用 Python，找不到则用 `py` / Node。

**手动：** 在本目录执行任意静态服务器后访问 `http://localhost:8000/index.html`
```bat
python -m http.server 8000
:: 或
npx http-server -p 8000 -c-1
```

---

## 操作

| 操作 | 按键 |
| --- | --- |
| 驾驶（相对镜头方向） | `W` `A` `S` `D` |
| 瞄准炮塔 / 旋转镜头 | 鼠标移动 |
| 开炮 | 鼠标左键 |
| 加速冲刺 | `Shift` |
| 释放鼠标 | `Esc`（点击画面重新锁定） |

消灭整波敌军后自动进入下一波，敌军数量与强度递增。坦克装甲归零即游戏结束。

### 手机 / 平板（触摸操作）

自动识别触摸设备并切换为触屏 UI：

| 操作 | 方式 |
| --- | --- |
| 驾驶（带模拟量，推得越远越快） | 左下角**虚拟摇杆** |
| 瞄准炮塔 / 旋转镜头 | **右半屏拖动** |
| 开炮 | 右下角**开炮**按钮 |
| 加速 | **冲刺**按钮 |

> 手机上让电脑和手机连同一 WiFi，电脑运行 `start_game.bat` 后，手机浏览器访问
> `http://<电脑局域网IP>:8000/index.html` 即可（用 `ipconfig` 查 IPv4 地址）。
> 移动端会自动降低像素比/阴影分辨率/可视距离以保证流畅，并支持横屏全屏。

---

## 特性

- **体素世界**：噪声生成起伏地形、树木、战术掩体；分块（chunk）面剔除网格化，单块编辑即时重建。
- **可破坏地形**：每发炮弹炸出球形弹坑，地形实时改变战局视野与掩护。
- **第三人称坦克**：方块拼装车体 / 独立炮塔 / 俯仰炮管，准星方向即弹道方向（消除视差）。
- **敌方 AI**：接近—保持距离—环绕走位，带视线检测（被地形遮挡会主动机动找射界）、重力提前量与散布。
- **特效**：GPU 粒子（爆炸火花 / 烟云 / 弹道拖尾 / 履带扬尘 / 碎屑）+ 爆炸动态点光 + 屏幕震动 + 受击暗角。
- **音效**：纯 WebAudio 合成，零音频资源（主炮、爆炸、引擎轰鸣随车速调制、命中金属声）。
- **HUD**：装甲条 / 装填条 / 波次 / 得分 / 实时小地图。

---

## 目录结构

```
坦克大战/
├─ index.html            入口 + importmap + HUD/菜单 DOM
├─ styles.css            UI 样式
├─ start_game.bat        一键启动（GBK/CRLF）
├─ lib/
│  └─ three.module.js    Three.js r169（本地内置，离线可用）
└─ src/
   ├─ main.js            游戏状态机 / 主循环 / 相机 / 开火 / 波次 / 伤害结算
   ├─ core/
   │  ├─ Engine.js       渲染管线（renderer/scene/camera/光照/阴影/雾）
   │  └─ Input.js        键鼠 + 指针锁定
   ├─ world/
   │  ├─ noise.js        确定性 fbm 值噪声
   │  ├─ blocks.js       方块定义与配色
   │  └─ VoxelWorld.js   地形生成 / 网格化 / 破坏 / 高度&碰撞查询
   ├─ entities/
   │  ├─ Tank.js         坦克基类 + 方块模型构建
   │  ├─ EnemyTank.js    敌方 AI
   │  └─ Shell.js        炮弹池 + 弹道/碰撞
   ├─ fx/Particles.js    GPU 粒子系统 + 闪光灯池
   ├─ ui/HUD.js          HUD 与小地图
   └─ audio/Sound.js     WebAudio 合成音效
```

---

## 开发者：无头测试

仓库内置 `node_modules/three`（仅 re-export `lib/three.module.js`），便于在 Node 中对
非 DOM 逻辑（世界生成 / 网格化 / 破坏 / 坦克与 AI / 炮弹）做无头烟雾测试，无需浏览器。

---

## 调参

主要数值集中在 `src/main.js` 顶部常量（移动速度、装填、炮弹速度、伤害、弹坑/溅射半径、
鼠标灵敏度、相机距离），以及 `VoxelWorld` 构造参数（地图尺寸、chunk、seed）。
