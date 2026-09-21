@echo off
chcp 65001 >nul
title 业务数据看板 · 积分补录 v5.8
rem ============================================================
rem  单人积分补录傻瓜式入口（v5.8）
rem  双击本文件即可进入中文交互菜单，无需任何命令行知识。
rem  用途：某门店某人员的积分动作明细 补录/查看/删除/回滚
rem  前提：数据库 D:\projects\dashboard\server\data\dashboard.db 存在
rem ============================================================
set "NODE_OPTIONS="
set "PATH=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-2;%PATH%"
cd /d "%~dp0server"
node scripts\insert-one_v5.8.js
echo.
pause
