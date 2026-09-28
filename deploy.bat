@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 提交信息：双击用默认（带时间）；也可以命令行传：deploy.bat "我的更新说明"
set "MSG=%~1"
if "%MSG%"=="" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set "MSG=更新于 %%i"
)

echo ===== 提交更改 =====
git add .
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [提示] 没有新的更改需要提交，直接推送...
)

echo.
echo ===== 推送到 GitHub =====
git push
if errorlevel 1 (
  echo.
  echo [失败] 推送失败，请检查：
  echo   1. Clash 等代理是否已开启（本仓库走 127.0.0.1:7890）
  echo   2. 网络是否能访问 GitHub
  echo.
  pause
  exit /b 1
)

echo.
echo ===== 部署完成 =====
echo GitHub Actions 正在自动构建，约 1-2 分钟后访问：
echo   https://userlzh07.github.io/Blog/
echo.
pause
