# v3.8 后端部署指南

> 适用：约 1000 名内部用户、读多写少的看板场景。数据库为 SQLite 单文件，无需安装数据库服务。

## 一、推荐形态：轻量云服务器（2C4G）

环境（Ubuntu）：Node 20 + Nginx + PM2。

```bash
sudo apt install -y nginx && sudo npm i -g pm2
cd /opt && git clone <仓库> dashboard && cd dashboard/server
npm install --registry=https://registry.npmmirror.com
node scripts/seed.js        # 首次用演示数据；生产改为导入真实名册+指标
IMPORT_TOKEN=<强随机串> pm2 start index.js --name dashboard-api
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

1. **首次上线**：启动服务 → `GET /api/import/template?type=org` 下载名册模板 → 填好导入 `POST /api/import/org` → 再导指标。
2. **月度报表**：业务侧按模板填 CSV/Excel → 导入指标（同人同日覆盖，可重复上传）→ 查看返回的失败明细并修正。
3. **积分权重调整**：改 `posts` 表的 `pw_*` 列（或后续管理端），历史积分自动按新权重重算，无需回填。
4. **升级**：`git pull && npm install --omit=dev && pm2 restart dashboard-api`。
5. **监控**：`pm2 logs dashboard-api`；`import_logs` 表留全量导入历史（文件名/行数/失败明细 JSON）。

## 七、后续版本

- v3.9：登录鉴权与门店/角色数据隔离，导入权限下沉到门店账号
- v4.0：手机端响应式与 PWA
- 数据量或并发增长时：`db.js` 换 PostgreSQL 驱动（表结构不变），前端无需改动