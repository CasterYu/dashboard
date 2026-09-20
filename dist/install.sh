# =============================================================================
# 内网部署 · 一键安装脚本  ·  v4.13
# 适用：Ubuntu 22.04 LTS（2C4G 即可，支持 5,000~10,000 用户）
# 职责：
#   1) 安装 Node 20 / Nginx / PM2（缺啥补啥，镜像源可配）
#   2) 拷贝 server/ 到 /opt/dashboard/server
#   3) npm install --omit=dev
#   4) 首次空库 seed（10 个岗位内置）
#   5) 写 Nginx 配置：前端静态站 + API 反代
#   6) PM2 启动 dashboard-api
#   7) 创建 HQ 管理员账号
#   8) 打印验收命令
#
# v4.13 修复：
#   [数据安全] DATA_DIR 默认值由 /opt/dashboard/server/data 迁至 /opt/dashboard/data，
#              并新增守卫——若 DATA_DIR 仍落在 /opt/dashboard/server 之内则直接报错退出。
#              （该目录每次部署都会被 rm -rf 重建，原先重跑脚本会连带删库）
#   [数据安全] 检测到已有 dashboard.db 时先自动旁路备份，脚本可安全重复执行
#   [兼容性]   /etc/nginx/sites-enabled/default 由无条件删除改为带时间戳备份
#   [兼容性]   前端域名为 IP / _ 时自动附加 default_server，域名版不加
#   [正确性]   验收提示 URL 改为同源 ?data=api（同机托管后不再需要 &api= 参数）
#   [可用性]   Node / npm 源可通过 secrets.env 配置，并在安装前做连通性探测
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ----- 0. 读取 secrets.env（如不存在则提示并退出）--------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/secrets.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[install] 错误：找不到 secrets.env，请先 cp secrets.env.example secrets.env 并填值"
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${INTERNAL_API_DOMAIN:?未设置 INTERNAL_API_DOMAIN}"
: "${INTERNAL_FRONT_DOMAIN:?未设置 INTERNAL_FRONT_DOMAIN}"
: "${JWT_SECRET:?未设置 JWT_SECRET}"
: "${ADMIN_EMP_NO:?未设置 ADMIN_EMP_NO}"
: "${ADMIN_PASSWORD:?未设置 ADMIN_PASSWORD}"

# 兜底：缺省值
IMPORT_TOKEN="${IMPORT_TOKEN:-$(openssl rand -hex 24)}"
PORT="${PORT:-3777}"
DATA_DIR="${DATA_DIR:-/opt/dashboard/data}"

# 镜像源（内网可在 secrets.env 中覆盖；默认走 npmmirror 加速）
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
NODE_SETUP_URL="${NODE_SETUP_URL:-https://deb.nodesource.com/setup_20.x}"

# ----- 0.1 防丢库守卫（v4.13 关键修复）-------------------------------------------
# /opt/dashboard/server 在每次部署时都会被删除重建；若 DATA_DIR 落在其内部，
# 重跑本脚本将造成数据库不可逆丢失（旧版默认值恰为 /opt/dashboard/server/data）。
case "${DATA_DIR}" in
  /opt/dashboard/server|/opt/dashboard/server/*)
    echo "[install] 错误：DATA_DIR=(${DATA_DIR}) 位于 /opt/dashboard/server 之内。"
    echo "[install] 该目录在部署时会被删除重建，继续执行将导致数据库丢失。"
    echo "[install] 请在 secrets.env 中改为 server/ 之外的路径（推荐 /opt/dashboard/data）。"
    exit 1 ;;
esac

# ----- 1. 检测 / 安装依赖 --------------------------------------------------------
echo "[install] 1/8 · 检查系统依赖（需 root）"
if [[ $EUID -ne 0 ]]; then
  echo "[install] 错误：请用 sudo bash install.sh 运行"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[install] 未检测到 Node.js，准备安装 Node 20..."
  if ! curl -fsSL -m 10 -o /dev/null "${NODE_SETUP_URL}"; then
    echo "[install] 错误：无法访问 Node 安装源 ${NODE_SETUP_URL}"
    echo "[install] 内网请改用镜像源，在 secrets.env 中追加："
    echo "[install]   NODE_SETUP_URL=<内网 NodeSource 镜像 setup 脚本地址>"
    echo "[install]   NPM_REGISTRY=<内网 npm 仓库地址>"
    exit 1
  fi
  curl -fsSL "${NODE_SETUP_URL}" | bash -
  apt-get install -y nodejs
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VER" -lt 18 ]]; then
  echo "[install] 错误：检测到 Node $(node -v)，本系统需要 Node 18+"
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "[install] 安装 Nginx..."
  if ! apt-get install -y nginx; then
    echo "[install] 错误：Nginx 安装失败。内网请先配置 apt 镜像源后重试，例如："
    echo "[install]   sudo sed -i 's|archive.ubuntu.com|<内网镜像地址>|g' /etc/apt/sources.list"
    echo "[install]   sudo apt-get update"
    exit 1
  fi
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[install] 安装 PM2（registry=${NPM_REGISTRY}）..."
  npm install -g pm2 --registry="${NPM_REGISTRY}"
fi

# ----- 2. 数据目录先建先备份，再重建代码目录 --------------------------------------
echo "[install] 2/8 · 准备数据目录并部署后端代码到 /opt/dashboard/server"
mkdir -p "${DATA_DIR}"
if [[ -f "${DATA_DIR}/dashboard.db" ]]; then
  BACKUP_DIR="${DATA_DIR}.bak.$(date +%Y%m%d-%H%M%S)"
  echo "[install] 检测到已有数据库，先备份到 ${BACKUP_DIR}（重跑安全）"
  cp -a "${DATA_DIR}" "${BACKUP_DIR}"
else
  echo "[install] 数据目录暂无数据库，稍后将执行首次空库 seed"
fi

mkdir -p /opt/dashboard
rm -rf /opt/dashboard/server
cp -r "${SCRIPT_DIR}/server" /opt/dashboard/server

cd /opt/dashboard/server
echo "[install] 3/8 · npm install --omit=dev（registry=${NPM_REGISTRY}）"
npm install --omit=dev --registry="${NPM_REGISTRY}"

# ----- 3. 写环境变量到 .env -----------------------------------------------------
echo "[install] 4/8 · 写入环境变量到 /opt/dashboard/server/.env"
cat > /opt/dashboard/server/.env <<EOF
PORT=${PORT}
DATA_DIR=${DATA_DIR}
JWT_SECRET=${JWT_SECRET}
IMPORT_TOKEN=${IMPORT_TOKEN}
ALLOW_ORIGINS=https://${INTERNAL_FRONT_DOMAIN},http://${INTERNAL_FRONT_DOMAIN}
EOF
chmod 600 /opt/dashboard/server/.env

# ----- 4. 首次空库 seed --------------------------------------------------------
if [[ ! -f "${DATA_DIR}/dashboard.db" ]]; then
  echo "[install] 5/8 · 首次空库 seed（10 个岗位内置）"
  node scripts/seed.js
else
  echo "[install] 5/8 · 已存在 ${DATA_DIR}/dashboard.db，跳过 seed（保留现有数据）"
fi

# ----- 5. Nginx 配置 -------------------------------------------------------------
echo "[install] 6/8 · 配置 Nginx（前端静态 + API 反代）"

# 前端域名是 IP 或 _ 时附加 default_server，保证内网 IP 直访也能命中本站点；
# 是真实域名时不加，避免与非本机站点冲突。
if [[ "${INTERNAL_FRONT_DOMAIN}" == "_" ]] || [[ "${INTERNAL_FRONT_DOMAIN}" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  LISTEN_LINE="listen 80 default_server;"
  echo "[install] 前端域名为 IP/_，已启用 default_server"
else
  LISTEN_LINE="listen 80;"
fi

cat > /etc/nginx/sites-available/dashboard <<EOF
server {
  ${LISTEN_LINE}
  server_name ${INTERNAL_FRONT_DOMAIN} ${INTERNAL_API_DOMAIN};
  client_max_body_size 20m;

  # 前端静态站
  root /var/www/dashboard;
  index index.html;
  location / {
    try_files \$uri \$uri/ /index.html;
  }

  # API 反代
  location /api/ {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 60s;
  }
}
EOF
mkdir -p /var/www/dashboard
cp -f "${SCRIPT_DIR}/index.html" /var/www/dashboard/index.html
if [[ -f "${SCRIPT_DIR}/lighthouse_scoring_v4.6.js" ]]; then
  cp -f "${SCRIPT_DIR}/lighthouse_scoring_v4.6.js" /var/www/dashboard/lighthouse_scoring_v4.6.js
fi
chown -R www-data:www-data /var/www/dashboard

ln -sf /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/dashboard
# 默认站点改为「备份」而非「删除」：测试机上可能存在其他在用站点
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  DEFAULT_BAK="/etc/nginx/sites-enabled/default.disabled.$(date +%Y%m%d-%H%M%S)"
  mv /etc/nginx/sites-enabled/default "${DEFAULT_BAK}"
  echo "[install] 已停用默认站点：default → ${DEFAULT_BAK}（未删除，可随时恢复）"
fi
nginx -t
systemctl reload nginx

# ----- 6. PM2 启动 --------------------------------------------------------------
echo "[install] 7/8 · PM2 启动 dashboard-api"
cd /opt/dashboard/server
pm2 delete dashboard-api 2>/dev/null || true
PORT="${PORT}" \
DATA_DIR="${DATA_DIR}" \
JWT_SECRET="${JWT_SECRET}" \
IMPORT_TOKEN="${IMPORT_TOKEN}" \
ALLOW_ORIGINS="https://${INTERNAL_FRONT_DOMAIN},http://${INTERNAL_FRONT_DOMAIN}" \
pm2 start index.js --name dashboard-api
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save

# ----- 7. 创建 HQ 管理员账号 -----------------------------------------------------
echo "[install] 8/8 · 创建 HQ 管理员账号 ${ADMIN_EMP_NO}"
cd /opt/dashboard/server
node scripts/create-user.js add "${ADMIN_EMP_NO}" hq --password "${ADMIN_PASSWORD}" --note "内网初始化管理员" || {
  echo "[install] 警告：账号 ${ADMIN_EMP_NO} 可能已存在，继续执行"
}

# ----- 8. 打印验收 --------------------------------------------------------------
echo ""
echo "=========================================================================="
echo "  内网部署完成 · 验收 3 招"
echo "=========================================================================="
echo ""
echo "  1. 后端健康检查（应返回 ok:true + version）"
echo "     curl http://127.0.0.1:${PORT}/api/health"
echo ""
echo "  2. 前端访问（前端与 API 同源，无需 &api= 参数）"
echo "     http://${INTERNAL_FRONT_DOMAIN}/?data=api     ← 真实数据模式"
echo "     http://${INTERNAL_FRONT_DOMAIN}/?data=mock    ← 演示数据模式"
echo "     本机浏览器也可直接打开：http://127.0.0.1/"
echo ""
echo "  3. 用 HQ 管理员登录"
echo "     工号：${ADMIN_EMP_NO}"
echo "     密码：${ADMIN_PASSWORD}"
echo "     （首次登录会强制改密）"
echo ""
echo "  导入令牌（保管好，导入接口用）："
echo "     IMPORT_TOKEN=${IMPORT_TOKEN}"
echo ""
echo "  数据目录：${DATA_DIR}"
echo "  日志查看：pm2 logs dashboard-api"
echo "=========================================================================="
