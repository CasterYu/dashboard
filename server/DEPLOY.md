# v4.2 后端部署指南

> 适用：约 1000 名内部用户、读多写少的看板场景。数据库为 SQLite 单文件，无需安装数据库服务。
> v4.0 相对 v3.8 的运维变化：名册导入支持 `mode=snapshot` 全量快照与 `dryRun` 预检；人员以**工号**识别（名册建议填工号）；离职/闭店通过快照或停用接口处理，**不做物理删除**。升级前请先备份数据库（见第四节）。
> **v4.2 新增**：5 角色登录鉴权（HQ / 大区 / 小区 / 店长 / 员工）+ 工号密码自管 + JWT 8h + scope 子树过滤。所有业务接口 `/api/org` `/api/persons` `/api/nodesums` `/api/metrics` `/api/admin/*` 均需 `Authorization: Bearer <token>`；导入 `/api/import/*` 仍走 `X-Import-Token`，与登录体系并存。

## 一、推荐形态：轻量云服务器（2C4G）

环境（Ubuntu）：Node 20 + Nginx + PM2。

```bash
sudo apt install -y nginx && sudo npm i -g pm2
cd /opt && git clone <仓库> dashboard && cd dashboard/server
npm install --registry=https://registry.npmmirror.com
node scripts/seed.js        # 首次用演示数据；生产改为导入真实名册+指标
# 生成强随机 JWT 密钥（务必设置，未设置启动会每次重启作废所有 token）
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
IMPORT_TOKEN=<强随机串> \
JWT_SECRET=$JWT_SECRET \
pm2 start index.js --name dashboard-api
pm2 save && pm2 startup
```

## 二、Nginx 反代 + HTTPS

要点：proxy_pass 指向 127.0.0.1:3777，证书用 certbot 自动签发续期。

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.你的域名.com    # 自动改 Nginx 配置并加 HTTPS
```

```nginx
server {
  server_name api.你的域名.com;
  client_max_body_size 20m;                 # 导入报表上传上限
  location / {
    proxy_pass http://127.0.0.1:3777;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

前端访问：`https://casteryu.github.io/dashboard/?data=api&api=https://api.你的域名.com`。

若前端改为同机托管（内网场景），把 `index.html` 放到 `/var/www/dashboard/`，Nginx 同 server 块加 `root` 与 `location / { try_files $uri /index.html; }`，API 走 `location /api/ { proxy_pass ...; }`。

## 三、环境变量

| 变量 | 默认值 | 说明 |
|:---|:---|:---|
| `PORT` | `3777` | 服务端口 |
| `DATA_DIR` | `./data` | SQLite 数据文件目录 |
| `IMPORT_TOKEN` | `change-me-import-token` | 导入接口令牌，**生产必须改** |
| `ALLOW_ORIGINS` | GitHub Pages + 本地 | CORS 白名单，逗号分隔 |

```bash
# 持久化写入 PM2：改完需 restart 生效
pm2 set dashboard-api:IMPORT_TOKEN <强随机串>   # 或写入 ~/.pm2/dump.pm2 前先 export
pm2 restart dashboard-api --update-env
```

## 四、数据库备份

SQLite 单文件，直接拷贝即可（WAL 模式下用 `.backup` 更稳）：

```bash
# 每分钟粒度无需，每日 02:00 备份并保留 30 天
sudo mkdir -p /var/backups/dashboard
sudo tee /etc/cron.d/dashboard-backup <<'EOF'
0 2 * * * root sqlite3 /opt/dashboard/server/data/dashboard.db ".backup '/var/backups/dashboard/db-$(date +\%F).db'" && find /var/backups/dashboard -name 'db-*.db' -mtime +30 -delete
EOF
```

若服务器未装 sqlite3 CLI：`sudo apt install -y sqlite3`。恢复时停服 → 覆盖 `data/dashboard.db` → 启动即可。

### 升级前备份与回滚（v3.8 → v4.0 必做）

服务启动时会自动执行幂等迁移（`org_nodes` 加 `status/deactivated_at/emp_no`、`node_paths` 重建为任职区间分片、新建 `person_assignments`；旧数据回填为「开放区间 + 在职 + 无工号」，因此**升级后数值与 v3.8 逐值一致**）。迁移前务必留一份可回退的备份：

```bash
pm2 stop dashboard-api
sqlite3 /opt/dashboard/server/data/dashboard.db ".backup '/var/backups/dashboard/pre-v4-$(date +%F-%H%M).db'"
pm2 start dashboard-api        # 启动即自动迁移
```

回滚：`pm2 stop dashboard-api` → 用备份文件覆盖 `data/dashboard.db`（同时删除 `dashboard.db-wal` / `dashboard.db-shm`）→ 回退到 v3.8 代码 → `pm2 start dashboard-api`。

升级后自检：

```bash
curl -s localhost:3777/api/health                                  # 应返回 4.0.0
curl -s localhost:3777/api/admin/data-quality | head -c 400        # 工号覆盖率/重复工号/停用统计
curl -s 'localhost:3777/api/org' | head -c 300                     # 组织树（默认已剪掉停用节点）
```

## 五、内网/容器备选

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

## 六、日常运维

1. **首次上线**：启动服务 → `GET /api/import/template?type=org` 下载名册模板（7 列，含工号/生效日期）→ 填好导入 `POST /api/import/org` → 再导指标。
2. **月度报表**：业务侧按模板填 CSV/Excel → 导入指标（同人同日覆盖，可重复上传）→ 查看返回的失败明细并修正。
3. **入职 / 调岗 / 离职**：
   - 只补新增与调岗 → `POST /api/import/org`（默认 `mode=merge`）；调岗建议填「生效日期」，历史报表仍按当时门店/岗位归属。
   - 全公司月度全量对账 → 先 `?...&dryRun=1` 看差异清单，确认后 `?mode=snapshot`；若返回 409（大批量停用），核对清单后加 `force=1`。
   - 离职人员/闭店门店会自动停用（不删数据），重新出现在名册里即自动恢复。
4. **工号治理**：`GET /api/admin/data-quality` 查在职缺工号清单与重复工号；补齐后重导同一份名册即可自动「认领」（不会产生重复人员）。
5. **积分权重调整**：改 `posts` 表的 `pw_*` 列（或后续管理端），历史积分自动按新权重重算，无需回填。
6. **升级**：`git pull && npm install --omit=dev && pm2 restart dashboard-api`（跨大版本先按第四节备份）。
7. **监控**：`pm2 logs dashboard-api`；`import_logs` 表留全量导入历史（文件名/模式/行数/停用摘要/失败明细 JSON）；`GET /api/import/logs?limit=20` 可直接查看。
8. **物化路径修复**：如怀疑「任职区间 → 节点路径」不一致（例如手改过库），可全量重建（**幂等，不改变任何聚合数值**，仅重建 `node_paths` 与 `node.store_id`）：

   ```bash
   cd /opt/dashboard/server
   DATA_DIR=./data node -e "const d=require('./db');console.log(d.rebuildAllPaths(d.openDb()))"
   # 输出形如 { persons: 8, paths: 54 }
   ```

   注意：`node scripts/seed.js --reset` 会清空全部数据，**生产环境禁用**。

## 七、账号管理（v4.2）

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

## 八、后续版本

- v4.3：手机端响应式与 PWA；新增管理端停用/恢复操作界面（当前停用与恢复只能通过名册导入 `mode=snapshot` 触发，或由维护者直接改库，尚无单节点停用接口）
- 数据量或并发增长时：`db.js` 换 PostgreSQL 驱动（表结构不变），前端无需改动