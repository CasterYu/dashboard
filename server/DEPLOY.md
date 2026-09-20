# Dashboard 部署指南（v4.13）

> **版本说明**：本仓库有两条独立版本线
> - 后端 `server/`：`package.json` 与 `index.js` 一致为 **4.6.0**（`/api/health` 实际返回 4.6.0）；v4.0 相对 v3.8 引入「工号识别 + 组织生命周期」；v4.2 引入「5 角色 + JWT 8h」；v4.6 引入「灯塔动作积分」
> - 前端 `index.html`：**V4.13**（顶栏徽章 V4.13、产品专家下钻四象限 v4.13）
> - 离线部署包 `dist/`：**v4.13**
>
> **v4.13 部署拓扑**：同机 Nginx 同时托管前端静态与反代 `/api/*`，前端与 API 同源 → 无需跨域、无需 GitHub Pages、无需 `&api=` URL 参数。
>
> 适用场景：约 1000 名内部用户、读多写少的看板场景。数据库 SQLite 单文件，无需安装数据库服务。跨大版本（v3.8→v4.0）升级前请先备份（见第六节）。

## 一、部署方式总览

| 方式 | 何时用 | 前置 | 落地步骤 |
|:---|:---|:---|:---:|
| **A. 一键脚本（推荐）** | 全新服务器或重装；不熟后端也能跑 | 准备好 `secrets.env` 5 个变量 | 5 步 |
| **B. 手工分步** | 想了解每一步做了什么 / 已有环境做微调 | 同上 | 8 步 |
| **C. Docker 单容器** | 已有容器化基础设施 | Docker 守护进程 | 3 步 |

> A 形态由 `dist/install.sh` 自动完成所有命令；**B 形态作为 A 的展开讲解**，遇到 install.sh 行为不符预期时可按 B 排查；C 形态见第七节。

---

## 二、一键脚本部署（推荐 · 5 步）

> 适用 **Ubuntu 22.04 LTS**（2C4G），需 root（脚本会检查 `EUID`）。脚本 `dist/install.sh` 已修复 v4.13 之前的 5 个已知缺陷（含 **重跑丢库 Bug**）——见脚本头注释。

### 2.1 准备 5 个必填变量

把 `dist/secrets.env.example` 复制为 `dist/secrets.env`，填值：

| 变量 | 示例 | 说明 |
|:---|:---|:---|
| `INTERNAL_API_DOMAIN` | `dashboard-api.corp.local` | 内网 API 域名；同源部署下可与前端域名相同 |
| `INTERNAL_FRONT_DOMAIN` | `dashboard.corp.local` | **员工实际访问的网址**（公司内网域名 / 内网 IP / `_`） |
| `JWT_SECRET` | `openssl rand -hex 48` | 必填且唯一；未设置脚本会**每次重启作废所有 token** |
| `ADMIN_EMP_NO` | `boss001` | HQ 管理员工号（与名册 `emp_no` 对齐） |
| `ADMIN_PASSWORD` | `openssl rand -hex 12` | HQ 初始密码，首登强制改密 |

可选：
- `IMPORT_TOKEN` — 导入接口令牌；不填脚本自动生成并打印一次
- `PORT` — 默认 `3777`
- `DATA_DIR` — 默认 `/opt/dashboard/data`（**v4.13 已迁出 `/opt/dashboard/server`**——见脚本头注释的「防丢库守卫」）
- `NPM_REGISTRY` / `NODE_SETUP_URL` — 内网可覆盖

### 2.2 上传部署包到服务器

任选一种：

- **scp 上传（推荐）**——开发机执行：
  ```bash
  scp dist/dashboard-internal-pkg-v4.13.tar.gz user@<服务器IP>:/tmp/
  ```
- **U 盘 / 企业微信 / 公司云盘**——传 zip 或解压后的目录均可

### 2.3 远端解压

```bash
ssh user@<服务器IP>
mkdir -p ~/dashboard-deploy && cd ~/dashboard-deploy
tar -xzf /tmp/dashboard-internal-pkg-v4.13.tar.gz
# 或 unzip dashboard-internal-pkg-v4.13.zip
```

### 2.4 填变量

```bash
cp secrets.env.example secrets.env
nano secrets.env    # 必填 5 项见 §2.1
```

### 2.5 一键安装

```bash
sudo bash install.sh
```

脚本会自动完成：**装 Node/Nginx/PM2** → **准备数据目录并备份已有库** → 部署后端 → `npm install` → seed（首次）→ **写 Nginx 配置（IP 版自动加 default_server）** → PM2 启动 → 建 HQ 管理员 → 打印 3 条验收命令。

---

## 三、手工分步部署（按需参考）

> 当你需要逐条理解每个命令、或者对已有服务做局部升级时按此节执行。

### 3.1 环境与依赖

```bash
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2 --registry=https://registry.npmmirror.com
```

### 3.2 部署后端

两条路径任选：

**路径 A · 联网 git clone：**
```bash
cd /opt && sudo git clone https://github.com/CasterYu/dashboard.git
cd /opt/dashboard/server
```

**路径 B · 离线 scp 上传（公司内网推荐，不依赖 GitHub）：**
```bash
# 开发机
scp -r dist/dashboard-internal-pkg-v4.13/server/ user@<IP>:/tmp/dashboard-server/
# 远端
sudo mkdir -p /opt/dashboard
sudo rm -rf /opt/dashboard/server
sudo mv /tmp/dashboard-server /opt/dashboard/server
cd /opt/dashboard/server
```

两条路径共同的步骤：

```bash
sudo npm install --omit=dev --registry=https://registry.npmmirror.com
node scripts/seed.js        # 首次用演示数据；生产改为 /api/import/org 导入真实名册+指标
```

### 3.3 环境变量

```bash
sudo cp .env.example .env
sudo sed -i "s|replace-me-with-a-long-random-hex-string-min-64-chars|$(node -e 'console.log(require(\"crypto\").randomBytes(48).toString(\"hex\"))')|" .env
sudo sed -i "s|change-me-to-a-long-random-string|$(openssl rand -hex 32)|" .env
sudo nano .env   # 确认 DATA_DIR=/opt/dashboard/data；同源可不填 ALLOW_ORIGINS
```

### 3.4 PM2 启动

```bash
pm2 start index.js --name dashboard-api
pm2 save && pm2 startup | sudo bash   # 把自启命令跑一遍
```

---

## 四、Nginx 配置

> **推荐**：直接用 `dist/install.sh` 自动写入（IP 版自动附加 `default_server`，域名版不加；测试机的默认站点改为带时间戳备份而非删除）。下面的两份配置用于手工微调，或在没有 install.sh 的环境下手动配置。

### 4.1 公司内网域名版

```nginx
server {
  listen 80;
  server_name dashboard.corp.local dashboard-api.corp.local;

  # 前端静态文件
  root /var/www/dashboard;
  index index.html;
  client_max_body_size 20m;             # 导入报表上传上限
  location / {
    try_files $uri /index.html;
  }

  # 后端 API（与前端同源 → 无 CORS 配置）
  location /api/ {
    proxy_pass http://127.0.0.1:3777;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

启用 + HTTPS：

```bash
sudo ln -sf /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dashboard.corp.local -d dashboard-api.corp.local   # 可选，自动 HTTPS
```

### 4.2 内网 IP 直访版

```nginx
server {
  listen 80 default_server;
  server_name 10.0.0.5 _;

  root /var/www/dashboard;
  index index.html;
  client_max_body_size 20m;
  location / {
    try_files $uri /index.html;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:3777;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

> 唯一代价：浏览器地址栏会标「不安全」。如需 HTTPS，按 §4.3 加自签证书或公司根 CA。

### 4.3 自签证书（IP 版可选）

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/dashboard.key \
  -out /etc/nginx/ssl/dashboard.crt \
  -subj "/CN=10.0.0.5" -addext "subjectAltName=IP:10.0.0.5"
sudo chmod 600 /etc/nginx/ssl/dashboard.key

# 在 4.2 的 server 块顶部加：
# listen 443 ssl;
# ssl_certificate     /etc/nginx/ssl/dashboard.crt;
# ssl_certificate_key /etc/nginx/ssl/dashboard.key;
sudo nginx -t && sudo systemctl reload nginx
```

员工首次访问需手动信任证书。**最优做法是公司根 CA 签名**——所有员工电脑默认信任，一次配置终生受益。

### 4.4 访问入口

```
http://dashboard.corp.local/?data=api      # 同源 API 模式（生产）
http://dashboard.corp.local/?data=mock     # 纯静态演示模式（默认）
```

- **不再需要 `&api=...` 参数** —— 前端与 API 同源，自动走 `/api/`
- 多套环境靠 URL 参数切换：`?data=api` 与 `?data=mock`
- CORS 白名单 `ALLOW_ORIGINS` 同源下可不填

---

## 五、环境变量

| 变量 | 默认 | 必须改的原因 |
|:---|:---|:---|
| `JWT_SECRET` | 不安全默认 | 未设置 → 每次重启全公司被踢 |
| `IMPORT_TOKEN` | `change-me-import-token` | `/api/import/*` 的应急通道，泄漏即可绕过登录写库 |
| `ALLOW_ORIGINS` | GH Pages + 本地 | CORS 白名单，逗号分隔；**同源部署可不填** |

`PORT`（默认 3777）、`DATA_DIR`（默认 `/opt/dashboard/data`，v4.13 已迁出 `/opt/dashboard/server`）、`NPM_REGISTRY` 一般不用改。

```bash
# 持久化写入 PM2：改完需 restart 生效
pm2 set dashboard-api:IMPORT_TOKEN <强随机串>   # 或写入 .env 前先 export
pm2 restart dashboard-api --update-env
```

---

## 六、数据库备份与升级回滚

SQLite 单文件，直接拷贝即可（WAL 模式下用 `.backup` 更稳）：

```bash
# 每日 02:00 备份并保留 30 天
sudo mkdir -p /var/backups/dashboard
sudo tee /etc/cron.d/dashboard-backup <<'EOF'
0 2 * * * root sqlite3 /opt/dashboard/data/dashboard.db ".backup '/var/backups/dashboard/db-$(date +\%F).db'" && find /var/backups/dashboard -name 'db-*.db' -mtime +30 -delete
EOF
```

> v4.13 起数据库默认落在 `/opt/dashboard/data`（**不在** `/opt/dashboard/server` 之内），重跑 `install.sh` 会自动旁路备份而非删库。

若服务器未装 sqlite3 CLI：`sudo apt install -y sqlite3`。恢复时停服 → 覆盖 `data/dashboard.db` → 启动即可。

### 升级前备份与回滚（v3.8 → v4.0 必做）

服务启动时会自动执行幂等迁移（`org_nodes` 加 `status/deactivated_at/emp_no`、`node_paths` 重建为任职区间分片、新建 `person_assignments`；旧数据回填为「开放区间 + 在职 + 无工号」，因此**升级后数值与 v3.8 逐值一致**）。迁移前务必留一份可回退的备份：

```bash
pm2 stop dashboard-api
sqlite3 /opt/dashboard/data/dashboard.db ".backup '/var/backups/dashboard/pre-v4-$(date +%F-%H%M).db'"
pm2 start dashboard-api        # 启动即自动迁移
```

回滚：`pm2 stop dashboard-api` → 用备份文件覆盖 `data/dashboard.db`（同时删除 `dashboard.db-wal` / `dashboard.db-shm`）→ 回退到旧版本代码 → `pm2 start dashboard-api`。

升级后自检：

```bash
curl -s localhost:3777/api/health                                  # 应返回 4.6.0
curl -s localhost:3777/api/admin/data-quality | head -c 400        # 工号覆盖率/重复工号/停用统计
curl -s 'localhost:3777/api/org' | head -c 300                     # 组织树（默认已剪掉停用节点）
```

---

## 七、内网/容器备选

**纯内网（不暴露公网）**：一台内网服务器跑 Node 服务，前端 `index.html` 也放同机 Nginx，全员访问 `http://内网IP/`。此时 CORS 白名单加内网来源，HTTPS 可省（若需 HTTPS 可用自签证书并让浏览器信任企业根证书）。

**Docker 单容器**：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/ ./
RUN npm install --omit=dev --registry=https://registry.npmmirror.com
VOLUME /app/data
ENV PORT=3777
EXPOSE 3777
CMD ["node", "index.js"]
```

```bash
docker build -t dashboard-api .
docker run -d --name dashboard-api -p 3777:3777 \
  -e IMPORT_TOKEN=<强随机串> -v /srv/dashboard-data:/app/data dashboard-api
```

数据库在宿主机 `/srv/dashboard-data`，备份直接拷该目录。

---

## 八、日常运维

1. **首次上线**：启动服务 → `GET /api/import/template?type=org` 下载名册模板（7 列，含工号/生效日期）→ 填好导入 `POST /api/import/org` → 再导指标。
2. **月度报表**：业务侧按模板填 CSV/Excel → 导入指标（同人同日覆盖，可重复上传）→ 查看返回的失败明细并修正。
3. **入职 / 调岗 / 离职**：
   - 只补新增与调岗 → `POST /api/import/org`（默认 `mode=merge`）；调岗建议填「生效日期」，历史报表仍按当时门店/岗位归属。
   - 全公司月度全量对账 → 先 `?...&dryRun=1` 看差异清单，确认后 `?mode=snapshot`；若返回 409（大批量停用），核对清单后加 `force=1`。
   - 离职人员/闭店门店会自动停用（不删数据），重新出现在名册里即自动恢复。
4. **工号治理**：`GET /api/admin/data-quality` 查在职缺工号清单与重复工号；补齐后重导同一份名册即可自动「认领」（不会产生重复人员）。
5. **积分权重调整**：改 `posts` 表的 `pw_*` 列（或后续管理端），历史积分自动按新权重重算，无需回填。
6. **升级**：
   - **联网升级**：`cd /opt/dashboard && sudo git pull && cd server && sudo npm install --omit=dev && sudo pm2 restart dashboard-api`
   - **离线升级**：开发机重跑 `dist/pack-internal.ps1` → scp 新包 → 远端 `sudo bash install.sh`（自动备份 + 保留数据 + 跳过 seed）
   - 跨大版本（v3.8 → v4.0 等重写表结构）先按 §6 备份
7. **监控**：`pm2 logs dashboard-api`；`import_logs` 表留全量导入历史（文件名/模式/行数/停用摘要/失败明细 JSON）；`GET /api/import/logs?limit=20` 可直接查看。
8. **物化路径修复**：如怀疑「任职区间 → 节点路径」不一致（例如手改过库），可全量重建（**幂等，不改变任何聚合数值**，仅重建 `node_paths` 与 `node.store_id`）：

   ```bash
   cd /opt/dashboard/server
   DATA_DIR=/opt/dashboard/data node -e "const d=require('./db');console.log(d.rebuildAllPaths(d.openDb()))"
   # 输出形如 { persons: 8, paths: 54 }
   ```

   注意：`node scripts/seed.js --reset` 会清空全部数据，**生产环境禁用**。

---

## 九、账号管理（v4.2 引入）

### 角色与数据范围

| role | 绑定人员 level | 数据范围 |
| --- | --- | --- |
| `hq` | — | 全树（授予运维/老板） |
| `regional_lead` | 大区 | 本大区子树 |
| `area_lead` | 小区 | 本小区子树 |
| `store_lead` | 门店 | 本店子树 |
| `employee` | 人员 | 仅自己 |

调岗/晋升后**下次登录即生效**（scope 按人员当前位置实时计算）。

### CLI 建账号

```bash
cd /opt/dashboard/server

# 单建：自动生成 10 位随机密码（仅此次显示，请线下安全分发）
node scripts/create-user.js add admin001 hq --note "老板主账号"

# 单建：员工（角色自动按人员节点 level 推断）
node scripts/create-user.js add E10086

# 重置密码（清失败计数与锁定）
node scripts/create-user.js reset admin001

# 批量导入（CSV：emp_no,role,note）
node scripts/create-user.js import ./users.csv

# 列出全部账号（不含密码明文）
node scripts/create-user.js list

# 停用 / 启用
node scripts/create-user.js disable E10086
node scripts/create-user.js enable  E10086
```

### 登录与 token

- 登录：`POST /api/auth/login { emp_no, password }` → 返回 `{ token, user, mustChangePassword }`
- 前端将 token 存 localStorage，调用 `Authorization: Bearer <token>` 头
- 默认 JWT 有效期 8 小时，到期后前端 401 → 自动跳登录页
- 首次登录 `mustChangePassword=true`，前端强制改密后方可进入看板
- 安全要点：JWT 部署前**务必设置** `JWT_SECRET`（强随机串），未设置会随机生成一次性值并打印警告——重启后所有 token 失效

---

## 十、后续版本

- 后续：手机端响应式与 PWA；新增管理端停用/恢复操作界面（当前停用与恢复只能通过名册导入 `mode=snapshot` 触发，或由维护者直接改库，尚无单节点停用接口）
- 数据量或并发增长时：`db.js` 换 PostgreSQL 驱动（表结构不变），前端无需改动