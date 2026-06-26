# 部署到 GitHub Pages

本游戏是纯静态站点，无需构建，托管到 GitHub Pages 即可在线游玩。

## 方式 A：命令行（已装 git）

在本目录依次执行（Windows 上建议用 Git Bash 或 `git.exe`）：

```bash
git init -b main
git add -A
git commit -m "初始提交：体素坦克大战"
# 在 github.com 先建一个空仓库（例如 voxel-tank-battle，不要勾 README）
git remote add origin https://github.com/<你的用户名>/voxel-tank-battle.git
git push -u origin main
```

然后在仓库页面：**Settings → Pages → Build and deployment**
- Source 选 **Deploy from a branch**
- Branch 选 **main** / 目录 **/(root)** → Save

等 1~2 分钟，访问地址为：
```
https://<你的用户名>.github.io/voxel-tank-battle/
```

## 方式 B：网页上传 / GitHub Desktop

把整个文件夹（除 `node_modules/`）拖进新建仓库，或用 GitHub Desktop 提交推送，
再按上面的方法开启 Pages。

## 注意事项

- `.gitignore` 已排除 `node_modules/`（仅本地测试用）。
- ES 模块需经 HTTP 提供，GitHub Pages 默认就是 HTTPS，✅。
- 上线后是公开地址，可把海报二维码改成该地址（见 `poster/generate_poster.mjs` 顶部
  `PLAY_URL`），重渲染后扫码即可全球游玩，不再受局域网限制。
- 想用自定义域名：Settings → Pages → Custom domain。
```
