@echo off
chcp 65001 >nul
title 业务数据看板 · 权限管理 v5.2
rem ============================================================
rem  权限管理傻瓜式入口（v5.2）
rem  双击本文件即可进入中文交互菜单，无需任何命令行知识。
rem  前提：数据库 D:\projects\dashboard\server\data\dashboard.db 存在
rem ============================================================
set "NODE_OPTIONS="
cd /d "%~dp0server"
node scripts\manage-scope_v5.2.js
echo.
pause
