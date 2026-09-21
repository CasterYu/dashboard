@echo off
chcp 65001 >nul
title 看板启动器
echo ========================================
echo   数据看板一键启动（前端 8000 + 后端 3777）
echo ========================================
echo.

echo [1/2] 启动后端 API（端口 3777）...
start "看板-后端-3777" cmd /k "cd /d D:\projects\dashboard\server && node index.js"

echo [2/2] 启动前端页面（端口 8000）...
start "看板-前端-8000" cmd /k "cd /d D:\projects\dashboard && python -m http.server 8000"

echo 等待服务就绪...
ping -n 4 127.0.0.1 >nul

start "" "http://localhost:8000/index.html?data=api&api=http://127.0.0.1:3777"

echo.
echo 完成！浏览器已自动打开看板页面。
echo.
echo 说明：
echo   - 后端窗口（看板-后端-3777）显示 API 日志，保持开着即可
echo   - 前端窗口（看板-前端-8000）显示页面访问日志，保持开着即可
echo   - 停止服务：运行「停止看板.bat」，或直接关闭这两个窗口
echo.
ping -n 9 127.0.0.1 >nul
