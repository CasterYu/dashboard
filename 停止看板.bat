@echo off
chcp 65001 >nul
title 看板停止器
echo ========================================
echo   数据看板一键停止（3777 + 8000）
echo ========================================
echo.

set FOUND=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3777 " ^| findstr "LISTENING"') do (
    echo 停止后端（PID %%a）...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo 停止前端（PID %%a）...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if %FOUND%==0 echo 两个服务本来就没在运行。
echo.
echo 完成。
ping -n 4 127.0.0.1 >nul
