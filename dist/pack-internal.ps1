# =============================================================================
# 内网部署包打包脚本  ·  PowerShell 版  ·  v4.13
# 在你的外网开发机上运行（双击或在 PowerShell 中执行）
#
# 产出（dist\ 下）：
#   dashboard-internal-pkg-v4.13.zip       ← U 盘 / 企业微信 / 云盘传递
#   dashboard-internal-pkg-v4.13.tar.gz    ← scp 直传推荐（Ubuntu 自带 tar，免装 unzip）
#
# 前置：以 D:\projects\dashboard 为唯一发布源。若工作区副本更新，
#       请先按 README-内网部署.md「发布源同步」把 index.html 覆盖过来再打包。
# =============================================================================

$ErrorActionPreference = "Stop"

$Root       = "D:\projects\dashboard"
$Dist       = Join-Path $Root "dist"
$OutName    = "dashboard-internal-pkg-v4.13"
$OutZip     = Join-Path $Dist ($OutName + ".zip")
$OutTar     = Join-Path $Dist ($OutName + ".tar.gz")
$Staging    = Join-Path $Dist $OutName

if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
if (Test-Path $OutZip)  { Remove-Item $OutZip -Force }
if (Test-Path $OutTar)  { Remove-Item $OutTar -Force }
New-Item -ItemType Directory -Path $Staging | Out-Null

Write-Host "[pack] 1/6 · 拷贝 server/（剔除 node_modules / data / .env）" -ForegroundColor Cyan
$ServerDst = Join-Path $Staging "server"
New-Item -ItemType Directory -Path $ServerDst | Out-Null
robocopy (Join-Path $Root "server") $ServerDst `
    /E /XD node_modules data /XF .env `
    /NFL /NDL /NJH /NJS /NP /NC /NS | Out-Null

# 创建空 data 目录占位（让同事知道数据落在这里）
New-Item -ItemType Directory -Path (Join-Path $ServerDst "data") | Out-Null
"# 首次运行后由 install.sh 自动写入 dashboard.db" | Out-File `
    -FilePath (Join-Path $ServerDst "data\.gitkeep") -Encoding utf8

Write-Host "[pack] 2/6 · 拷贝前端 index.html + lighthouse_scoring_v4.6.js" -ForegroundColor Cyan
Copy-Item (Join-Path $Root "index.html") (Join-Path $Staging "index.html") -Force
if (Test-Path (Join-Path $Root "lighthouse_scoring_v4.6.js")) {
    Copy-Item (Join-Path $Root "lighthouse_scoring_v4.6.js") `
        (Join-Path $Staging "lighthouse_scoring_v4.6.js") -Force
}

Write-Host "[pack] 3/6 · 拷贝部署脚本与文档" -ForegroundColor Cyan
Copy-Item (Join-Path $Dist "install.sh")           (Join-Path $Staging "install.sh") -Force
Copy-Item (Join-Path $Dist "secrets.env.example")  (Join-Path $Staging "secrets.env.example") -Force
Copy-Item (Join-Path $Dist "README-内网部署.md")   (Join-Path $Staging "README-内网部署.md") -Force

Write-Host "[pack] 4/6 · 打 zip（带目录前缀）" -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $Dist ($OutName + "/*")) `
                -DestinationPath $OutZip `
                -CompressionLevel Optimal

Write-Host "[pack] 5/6 · 打 tar.gz（Ubuntu 原生 tar，推荐 scp 场景）" -ForegroundColor Cyan
tar -czf $OutTar -C $Dist $OutName

Write-Host "[pack] 6/6 · 计算校验值" -ForegroundColor Cyan
$shaZip = (Get-FileHash -Path $OutZip -Algorithm SHA256).Hash
$shaTar = (Get-FileHash -Path $OutTar -Algorithm SHA256).Hash

Write-Host ""
Write-Host "  输出：" -ForegroundColor Green
Write-Host "    $OutZip" -ForegroundColor Yellow
"{0,10:N1} KB   SHA256: {1}" -f ((Get-Item $OutZip).Length / 1KB), $shaZip | Write-Host
Write-Host "    $OutTar" -ForegroundColor Yellow
"{0,10:N1} KB   SHA256: {1}" -f ((Get-Item $OutTar).Length / 1KB), $shaTar | Write-Host
Write-Host ""
Write-Host "  下一步（离线 scp 部署，推荐）：" -ForegroundColor Cyan
Write-Host "    1. scp `"$OutTar`" <user>@<服务器IP>:/tmp/"
Write-Host "    2. ssh <user>@<服务器IP>"
Write-Host "    3. tar -xzf /tmp/$OutName.tar.gz -C ~/ && cd ~/$OutName"
Write-Host "    4. cp secrets.env.example secrets.env && nano secrets.env"
Write-Host "    5. sudo bash install.sh"
Write-Host ""
Write-Host "  或（U 盘 / 企业微信 / 云盘传 zip）：解压后按 README-内网部署.md 执行"
Write-Host "  同事回传 SHA256 给你对账"
