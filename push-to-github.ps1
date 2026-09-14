# ============================================================
# 业务数据看板 - GitHub 一键推送脚本
# ============================================================
# 使用说明：
#   1. 在 GitHub 上新建空仓库（不要勾选 README/.gitignore/license）
#      仓库地址形如：https://github.com/你的用户名/dashboard.git
#   2. 在 https://github.com/settings/tokens 生成 Personal Access Token
#      需要勾选 "repo" 权限
#   3. 把下面两个变量填好，保存本文件
#   4. 右键本文件 → "使用 PowerShell 运行"
# ============================================================

# ========== 在下方填入你的信息 ==========
$GITHUB_USER = ""   # 例如 "zhangsan"
$GITHUB_TOKEN = ""  # 例如 "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$REPO_NAME   = "dashboard"
# ========================================

$ErrorActionPreference = "Stop"
$GIT = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"

# 颜色输出函数
function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[✓] $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "[✗] $msg" -ForegroundColor Red }

# 校验输入
if ([string]::IsNullOrWhiteSpace($GITHUB_USER)) {
    Write-Err "请先填写 $GITHUB_USER（你的 GitHub 用户名）"
    Read-Host "按 Enter 退出"; exit 1
}
if ([string]::IsNullOrWhiteSpace($GITHUB_TOKEN)) {
    Write-Err "请先填写 $GITHUB_TOKEN（你的 GitHub Personal Access Token）"
    Read-Host "按 Enter 退出"; exit 1
}

$REMOTE_URL = "https://github.com/$GITHUB_USER/$REPO_NAME.git"
$AUTH_URL   = "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/$GITHUB_USER/$REPO_NAME.git"

Set-Location "D:\projects\dashboard"

Write-Step "0. 前置检查"
Write-Host "Git 路径: $GIT"
& $GIT --version
Write-Host "项目目录: $(Get-Location)"

Write-Step "1. 检查本地仓库状态"
$status = & $GIT status --short
if ($status) { Write-Host "待提交变更:`n$status" -ForegroundColor Yellow }
$branch = (& $GIT branch --show-current).Trim()
if (-not $branch) { $branch = "main" }
Write-Ok "当前分支: $branch"

Write-Step "2. 配置本地身份（若未配置）"
$name  = (& $GIT config user.name)
$email = (& $GIT config user.email)
if (-not $name)  { & $GIT config --global user.name  $GITHUB_USER;        Write-Ok "user.name  -> $GITHUB_USER" }
if (-not $email) { & $GIT config --global user.email "$GITHUB_USER@local"; Write-Ok "user.email -> $GITHUB_USER@local" }

Write-Step "3. 绑定远程仓库"
$existing = (& $GIT remote get-url origin 2>$null)
if ($existing) {
    Write-Host "远程 origin 已存在: $existing" -ForegroundColor Yellow
    & $GIT remote set-url origin $REMOTE_URL
    Write-Ok "已更新为: $REMOTE_URL"
} else {
    & $GIT remote add origin $REMOTE_URL
    Write-Ok "已添加 origin -> $REMOTE_URL"
}

Write-Step "4. 推送 main 分支"
& $GIT push $AUTH_URL $branch
if ($LASTEXITCODE -ne 0) { Write-Err "推送失败，请检查网络或权限"; exit 1 }
Write-Ok "分支已推送"

Write-Step "5. 推送所有 tag（v1.0 / v1.1 / v2.0）"
& $GIT push $AUTH_URL --tags
if ($LASTEXITCODE -ne 0) { Write-Err "tag 推送失败"; exit 1 }
Write-Ok "tag 已推送"

Write-Step "6. 推送完成，去 GitHub 查看吧"
Write-Host "👉 https://github.com/$GITHUB_USER/$REPO_NAME" -ForegroundColor Green
Write-Host ""
Write-Host "下一步建议：在仓库页面右侧点 'Releases' -> 'Create a new release'"
Write-Host "  选择 tag v2.0，标题写 'v2.0 归档 v1 + 首页重构'，作为正式发版存档"

Read-Host "按 Enter 退出"