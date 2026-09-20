# =============================================================================
# 业务数据看板 · 内网部署包  ·  v4.13
# 适用：Ubuntu 22.04 LTS（2C4G 即可，支持 5,000~10,000 用户）
#
# 说明：本目录是一份"内网一键部署包"，由外网开发机打包 → 内网同事执行。
#       开发机不需要连接公司内网，全程单向传文件。
# =============================================================================

## 一、给内网同事的操作（仅 3 行命令）

```bash
# 第 1 步：解压
cd ~ && mkdir -p dashboard-deploy && cd dashboard-deploy
tar -xzf /path/to/dashboard-internal-pkg-v4.13.tar.gz
# 或 unzip dashboard-internal-pkg-v4.13.zip

# 第 2 步：填配置（仅 5 个变量）
cp secrets.env.example secrets.env
nano secrets.env   # 或 vi secrets.env

# 第 3 步：一键安装（约 3~5 分钟）
sudo bash install.sh
```

## 二、`secrets.env` 必填 5 项

| 变量 | 示例 | 说明 |
|:---|:---|:---|
| `INTERNAL_API_DOMAIN` | `dashboard-api.corp.local` | 内网 API 域名，最终拼到前端 URL |
| `INTERNAL_FRONT_DOMAIN` | `dashboard.corp.local` | 内网前端域名 |
| `JWT_SECRET` | 见下方生成命令 | JWT 签名密钥，<b>必填且唯一</b> |
| `ADMIN_EMP_NO` | `boss001` | HQ 管理员工号 |
| `ADMIN_PASSWORD` | 见下方生成命令 | HQ 管理员初始密码（首登会强制改密） |

生成强随机值（任选其一）：
```bash
openssl rand -hex 48       # JWT_SECRET（96 字符）
openssl rand -hex 12       # ADMIN_PASSWORD（24 字符）
```

可选（不填会自动生成并打印一次）：
- `IMPORT_TOKEN` — 导入接口令牌，建议自行填强随机串
- `PORT` — 默认 3777
- `DATA_DIR` — 默认 `/opt/dashboard/data`（v4.13 已迁出 server/，避免 install.sh 重建代码目录时被误删）

## 三、脚本会做什么（自动完成，无需人工）

1. 安装 Node 20 / Nginx / PM2（缺啥补啥，镜像源可配）
2. 准备数据目录 `/opt/dashboard/data`，已有库则先旁路备份
3. 部署后端到 `/opt/dashboard/server`（`server/` 会被 install.sh 重建，所以 `data/` 必须落在它外面）
4. `npm install --omit=dev`（默认 npmmirror，可通过 `NPM_REGISTRY` 覆盖）
5. 内置岗位主数据 + 创建空库 SQLite（首次；已有库则跳过）
6. 写 Nginx 配置：前端静态站 + `/api/` 反代到 3777（IP 版自动加 `default_server`，默认站点改为带时间戳备份而非删除）
7. PM2 守护进程 + 开机自启
8. 创建 HQ 管理员账号
9. 打印 3 条验收命令

## 四、验收 3 招

```bash
# 1. 后端健康检查（应返回 ok:true 与 version 字段）
curl http://127.0.0.1:3777/api/health

# 2. 浏览器打开（公司内网 DNS 需将 INTERNAL_FRONT_DOMAIN 解析到服务器 IP）
http://dashboard.corp.local/?data=api    # 同源部署，无需 &api= 参数

# 3. 用 HQ 管理员登录
工号：boss001
密码：（填在 secrets.env 的值）
首次登录会强制改密 → 进入看板看全树
```

## 五、文件清单（本目录打包时会被收入 zip）

```
dashboard-internal-pkg-v4.13/
├── server/                       # 后端代码（剔除 node_modules / data / .env）
│   ├── index.js
│   ├── db.js
│   ├── package.json
│   ├── middleware/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   └── data/                     # 空目录，首次运行后才有 dashboard.db
├── index.html                    # 前端单文件
├── lighthouse_scoring_v4.6.js    # 灯塔规则与积分逻辑（同前端目录）
├── install.sh                    # 一键安装脚本
├── secrets.env.example           # 环境变量模板
└── README-内网部署.md            # 本文件
```

## 六、HTTPS（可选）

- **公司根证书签名**：最优，所有员工电脑默认信任，一次配置终生受益
- **自签证书**：测试可用，浏览器会警告，需员工手动信任
- **纯 HTTP**：仅限高隔离内网（如专线、机房），不推荐生产

需要 HTTPS 时修改 `install.sh` 中的 Nginx 段，添加：
```nginx
listen 443 ssl;
ssl_certificate     /etc/nginx/ssl/dashboard.crt;
ssl_certificate_key /etc/nginx/ssl/dashboard.key;
```

## 七、回滚 / 卸载

```bash
pm2 delete dashboard-api
rm -rf /opt/dashboard /var/www/dashboard
rm /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/dashboard
nginx -t && systemctl reload nginx
```

数据库如需保留：先 `pm2 stop dashboard-api` 再备份 `/opt/dashboard/data/dashboard.db`（v4.13 起数据目录已迁出 server/）。

## 八、运维速查

```bash
pm2 logs dashboard-api            # 实时日志
pm2 restart dashboard-api         # 重启
pm2 status                        # 进程状态
tail -f /var/log/nginx/error.log  # Nginx 错误日志
sqlite3 /opt/dashboard/data/dashboard.db ".tables"   # 查看表结构
curl -s localhost:3777/api/health | head -c 200             # 健康检查
curl -s localhost:3777/api/admin/data-quality | head -c 400  # 数据质量
```

## 九、问题反馈

打包者（外网开发机）联系方式：__________
内网运维同事：__________