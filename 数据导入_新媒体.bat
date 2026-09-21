@echo off
chcp 65001 >nul
title 业务数据看板 · 新媒体真实数据导入 v1
rem ============================================================
rem  新媒体运营真实数据导入 傻瓜式入口（v1）
rem  双击本文件即可进入中文交互菜单。
rem  评分文件：server\scripts\_sample_xinshibu.xlsx（可用 SCORE_FILE 环境变量覆盖）
rem  映射表  ：C:\Users\Administrator\Downloads\专营店20260918175014.xls（可用 MAP_FILE 覆盖）
rem ============================================================
set "NODE_OPTIONS="
cd /d "%~dp0server"

:menu
cls
echo ==========================================================
echo   业务数据看板 · 新媒体真实数据导入 v1
echo ==========================================================
echo.
echo   1. 预览      统计两份文件 + 生成「未匹配门店清单.xlsx」
echo   2. 导入      仅导入映射表命中的门店（未命中的跳过）
echo   3. 查看状态  导入批次与当前数据量
echo   4. 回滚      撤销最近一次导入（删数据+删本次新建节点）
echo   5. 全量导入  未命中门店挂「其它/未匹配」一并落库（慎用）
echo   6. 整理演示数据  旧 seed 演示树挪入「虚拟区」（改名虚拟1~4区）
echo   7. 还原演示整理  回滚最近一次演示数据归整
echo   8. 多岗位预览    产品专家/交付店长/交付专员/数营专家 统计+未匹配清单
echo   9. 多岗位导入    仅映射命中门店，每岗位独立批次（先跑 8 看报告）
echo  10. 多岗位状态    导入批次与 5 岗位数据量
echo  11. 多岗位回滚    撤销指定批次（批次号先用 10 查）
echo   0. 退出
echo.
set "choice="
set /p choice=请输入数字后回车：
if "%choice%"=="1" (node scripts\import-real_v1.js preview)
if "%choice%"=="2" (node scripts\import-real_v1.js import)
if "%choice%"=="3" (node scripts\import-real_v1.js status)
if "%choice%"=="4" (node scripts\import-real_v1.js rollback)
if "%choice%"=="5" (node scripts\import-real_v1.js import-all)
if "%choice%"=="6" (node scripts\organize-demo_v5.2.js apply)
if "%choice%"=="7" (node scripts\organize-demo_v5.2.js rollback)
if "%choice%"=="8" (node scripts\import-multi_v5.4.js preview)
if "%choice%"=="9" (node scripts\import-multi_v5.4.js import)
if "%choice%"=="10" (node scripts\import-multi_v5.4.js status)
if "%choice%"=="11" goto rollbackMulti
if "%choice%"=="0" exit /b 0
echo.
pause
goto menu

:rollbackMulti
set "rb="
echo 先看批次号：可先运行 10（多岗位状态）
set /p rb=输入批次号（直接回车=回滚最近一批）：
if "%rb%"=="" (node scripts\import-multi_v5.4.js rollback) else (node scripts\import-multi_v5.4.js rollback %rb%)
echo.
pause
goto menu
