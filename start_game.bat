@echo off
chcp 936 >nul
title 坦克大战 VOXEL TANK BATTLE
cd /d "%~dp0"
echo ============================================
echo    坦克大战  VOXEL TANK BATTLE
echo    正在启动本地服务器，浏览器将自动打开
echo    关闭本窗口即结束游戏
echo ============================================
echo.
start "" "http://localhost:8000/index.html"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8000
  goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8000
  goto :end
)
where node >nul 2>nul
if %errorlevel%==0 (
  npx --yes http-server -p 8000 -c-1
  goto :end
)
echo [错误] 未找到 Python 或 Node，请手动启动任意静态服务器后访问 index.html
pause
:end
