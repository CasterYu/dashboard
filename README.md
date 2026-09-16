<div align="center">

# 🚗 业务数据看板 · Dashboard

**汽车销售运营数据看板 · 含历史版本 · 在线可访问**

[![Version](https://img.shields.io/badge/version-v4.2-blue)](https://github.com/CasterYu/dashboard)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-Live-success)](https://casteryu.github.io/dashboard/)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

</div>

---

## ⚡ 一键访问不同版本

> **重点：** GitHub 仓库首页直接点下面链接就能打开对应版本的网页，**多个版本可以同时打开对比**。

### 🌐 在线版（GitHub Pages · 推荐 · 永久可访问）

| 版本 | 链接 | 状态 | 说明 |
|:---:|:---|:---:|:---|
| **🟢 v4.2 · 最新版** | **👉 [https://casteryu.github.io/dashboard/](https://casteryu.github.io/dashboard/)** | ✅ 当前 | **身份权限校验**：5 角色（HQ / 大区 / 小区 / 店长 / 员工）+ 工号密码自管；JWT（HS256，8h）；scope 子树 CTE 过滤，HQ 看全量、非 HQ 仅看其负责范围；首登强制改密；mock 模式自动渲染为「演示模式（总部）」 |
| **🟡 v4.1 · 历史版** | 👉 同上链接（页面即 v4.2） | 📦 归档 | **积分排行榜门店人均口径**：门店维度改为「总积分 ÷ 在职人数」的人均积分排名，消除人数规模优势；tooltip 同时展示人均 / 总分 / 人数 |
| **🟡 v4.0 · 历史版** | 👉 同上链接（页面即 v4.2） | 📦 归档 | **组织生命周期 + 工号识别**：人员离职/门店闭店可停用与自动恢复、工号唯一识别（改名不新增、调岗按当时架构统计）、名册增量合并与全量快照、导入预检与误操作拦截；新增「显示已停用」开关 |
| **🟡 v3.8 · 历史版** | 👉 同上链接（页面即 v4.2） | 📦 归档 | 真实数据接入：Node.js + Express + SQLite 后端（`server/`），数据 API + Excel/CSV 导入；`?data=api` 切换真实数据 |
| **🟡 v3.7 · 历史版** | 👉 同上链接（页面即 v4.2） | 📦 归档 | 双看板结构（经营总览 + 业务执行与闭环）；岗位体系 10 个；闭环看板人员散点图 |
| **🟡 v1 · 历史归档** | **👉 [https://casteryu.github.io/dashboard/legacy/v1/](https://casteryu.github.io/dashboard/legacy/v1/)** | 📦 归档 | 白板草图完整模块版：漏斗/积分/下钻/排行榜/雷达 |

> 💡 直接 Ctrl + 点击可在新标签页打开，与当前页同时浏览。

### 💻 本地版（双击 HTML 文件）

| 版本 | 文件路径 |
|:---:|:---|
| **v4.2 最新版** | `D:\projects\dashboard\index.html` |
| **v1 历史版** | `D:\projects\dashboard\legacy\v1\index.html` |

---

## 📖 项目说明

汽车销售运营场景下的数据看板，单文件 HTML 部署，零构建、零依赖。

- **v4.2（当前）**：**身份权限校验**。① 5 角色：`hq` / `regional_lead` / `area_lead` / `store_lead` / `employee`，覆盖总部、大区、小区、门店、员工五层；② **工号密码自管**：CLI `node server/scripts/create-user.js add <工号> <初始密码> <role>` 一行建账号，`reset/list/import/disable/enable` 子命令齐全；③ **JWT（HS256，8h）** 颁发 token，前端 `fetchJson` 自动注入 Bearer，401 自动跳登录浮层；④ **scope 子树过滤**（递归 CTE）：员工仅看自己；店长看门店；小区长看小区；大区长看大区；HQ 看全量；非 HQ 用户额外纳入祖先链，保留树结构；调岗后下次登录生效（动态计算，不缓存）；⑤ **首登强制改密**：服务端 `must_change_password` 标志 + 客户端拦截双保险；⑥ **mock 模式（演示数据）自动渲染为「演示模式（总部）」徽章**，无需登录；⑦ 账号管理 CLI、token 配置、JWT_SECRET 生成详见 `server/DEPLOY.md §7`。
- **v4.1（历史）**：**积分排行榜门店人均口径**。门店维度按「总积分 ÷ 在职人数」的人均积分排名（人数 = 树内该门店人员节点数，打开「显示已停用」时含停用人员），消除人数规模优势；tooltip 三要素：人均积分 / 总积分 / 人数；条形标签保留 1 位小数；副标题标注口径。岗位 / 人员维度与 PK 模式维持总积分口径不变。
- **v4.0（历史）**：**组织生命周期 + 工号识别**。① 节点停用/恢复（软删除）：人员离职、门店闭店走同一机制，历史指标完整保留、重新出现在名册即自动恢复；② 人员以**工号**为唯一身份（明文存储，不采集身份证），改名不新增人员、调岗不重复计数；③ 任职区间时间切片：历史报表按**当时**门店/岗位归属统计；④ 名册导入支持增量合并（`mode=merge`）与全量快照（`mode=snapshot`），支持预检（`dryRun=1`）与大批量停用拦截（409 + `force=1`）；⑤ 筛选区新增「显示已停用」开关（默认关闭，仅 API 模式可见）。
- **v3.8（历史）**：真实数据接入。前端双模式：默认演示模式（内嵌模拟数据，零部署可用），URL 加 `?data=api&api=http://后端地址:3777` 切换真实数据；后端 Node.js + Express + SQLite（`server/` 目录），提供组织树/指标聚合/人员汇总 API 与 Excel/CSV 导入接口，数据按需懒加载 + 本地缓存。
- **v3.7（历史）**：双看板结构。顶栏胶囊切换「**经营总览** / **业务执行与闭环**」。岗位体系扩展至 10，新增试驾点评率 / 线索试驾率；闭环看板人员散点图（X=累计积分，Y=锁单量/试驾点评率/线索试驾率三选一，按门店分色 + 均值参考线），6 张 KPI 摘要 + 人员明细表。
- **v3.6（历史）**：底部「经营结果趋势分析」改为指标多选折线图，绝对量指标峰值相差 ≥10 倍时自动归一化。
- **v3.5（历史）**：趋势分析支持指标多选，最多 4 项；绝对量与转化率分列左右双 Y 轴。
- **v3.4（历史）**：三大板块可展开按日折线图。
- **v3.3（历史）**：全链路 7 阶段漏斗视觉重构。
- **v3.2（历史）**：六级组织树筛选 + PK 横向对比。
- **v1（已归档）**：基于原始白板草图的「大而全」实现。

### 🧭 组织树与岗位编制

```
全国 → 大区 → 小区 → 门店 → 岗位 → 人员
```

| 岗位 | 编制规则 |
|:---|:---|
| 数营专家 | 一岗一人 |
| 销售店长 | 一岗一人 |
| 销售专员 | 一岗多人（2 ~ 4 人） |
| 产品专家 | 一岗一人 |
| 交付店长 | 一岗一人 |
| 交付专员 | 一岗多人 |
| 直播专员 | 一岗多人，部分门店空缺 |
| 新媒体运营 | 一岗多人，部分门店空缺 |
| 市场经理 | 一岗一人 |
| 客户管家 | 一岗多人（每店 1 ~ 2 人） |

### 🔀 两种筛选模式

- **单选模式（默认）**：五级级联下拉逐级下钻，数据为该节点的区间汇总。
- **PK 模式**：在同一层级勾选 2 ~ 6 个对象做横向比较。

### 📊 业务执行与闭环口径

- 可选岗位：10 个（数营专家/销售店长/销售专员/产品专家/交付店长/交付专员/直播专员/新媒体运营/市场经理/客户管家）
- 可选 Y 轴：锁单量 / 试驾点评率 / 线索试驾率（三选一）
- 人员散点图：X = 累计积分；Y = 当前所选指标；气泡大小可选；按门店分色；琥珀色均值参考线
- KPI 摘要：6 张卡（人员数、累计积分、锁单量、试驾点评率、线索试驾率、积分产出比）
- 人员明细表：按累计积分降序，显示门店、岗位、姓名、各核心指标
- 岗位空缺：筛选器内置灰标注「本店暂无」，闭环看板不参与散点；明细表显示 `—`

---

## 📁 目录结构

```
dashboard/
├── README.md               ← 本文件
├── index.html              ← v4.2 当前最新版（前端，双模式：演示/真实数据，含登录浮层）
├── .gitignore
├── .gitattributes
├── push-to-github.ps1
├── server/                 ← v4.2 后端（Node.js + Express + SQLite，含 5 角色鉴权，详见下方章节）
│   ├── services/auth.js    ←   密码哈希/JWT/scope 推导
│   ├── middleware/         ←   authRequired + scope（CTE 子树过滤）
│   ├── routes/auth.js      ←   /login /me /change-password /logout
│   ├── scripts/create-user.js ←  CLI 账号管理（add/reset/list/import/disable/enable）
│   └── ...
├── docs/
│   └── 项目进度报告.html
└── legacy/
    └── v1/
        ├── README.md
        └── index.html
```

---

## 🔌 v4.2 后端服务（真实数据接入 + 组织生命周期 + 身份权限）

### 启动

```bash
cd server
npm install                       # 首次
node scripts/seed.js              # 可选：生成一年演示数据入库（自动自验）
node scripts/create-user.js add <工号> <初始密码> <role>   # 建账号（至少 1 个 hq 角色）
npm start                         # http://127.0.0.1:3777
```

> 环境变量 `.env`：`JWT_SECRET=...`（必填，CLI 启动会校验）、`IMPORT_TOKEN=...`（导入接口用）。

### 角色与权限（v4.2）

| 角色 | scope 范围 | 备注 |
|:---|:---|:---|
| `hq` | 全量（无过滤） | 默认管理员；可调用 `/api/admin/*` |
| `regional_lead` | 所属大区子树 | 动态计算（按人员节点向上查找「大区」级祖先） |
| `area_lead` | 所属小区子树 | 动态计算（按人员节点向上查找「小区」级祖先） |
| `store_lead` | 所属门店子树 | 动态计算（按人员节点向上查找「门店」级祖先） |
| `employee` | 仅自身 | 个人只读 |

> 调岗后**下次登录**生效（scope 在签发 JWT 时计算，不写入 token）；非 HQ 用户额外纳入祖先链，保留树结构（看到上级但下钻子树只到授权范围）。

### 鉴权接口

| 接口 | 鉴权 | 说明 |
|:---|:---:|:---|
| `POST /api/auth/login` | 否 | 入参 `{empNo, password}`，返回 `{token, mustChangePassword, me}`；错误密码 5 次锁 15 分钟 |
| `GET /api/auth/me` | Bearer | 返回当前用户 `{empNo, name, role, mustChangePassword, scopeNodeIds}` |
| `POST /api/auth/change-password` | Bearer | 入参 `{oldPassword, newPassword}`，新密码 ≥ 6 位 |
| `POST /api/auth/logout` | Bearer | 仅前端清 token，服务端无状态 |

### 数据接口（scope 过滤）

| 接口 | 鉴权 | 说明 |
|:---|:---:|:---|
| `GET /api/org?inclInactive=` | Bearer | 六级组织树 + 岗位配置 + 数据日期范围；**按 scope 过滤可见节点**，`inclInactive=1` 返回并带 `status/deactivatedAt` |
| `GET /api/metrics?node=&from=&to=` | Bearer | 节点（含子树）区间逐日 11 指标 + 积分序列；`node=all` 表示全部人员；**不受停用影响**（历史数据完整保留）；scope 外节点返回空 |
| `GET /api/persons?node=&from=&to=&inclInactive=` | Bearer | 节点子树人员区间汇总；scope 外人员自动排除 |
| `GET /api/nodesums?nodes=&from=&to=&inclInactive=` | Bearer | 多节点区间合计批量查询；scope 外节点自动剔除 |
| `POST /api/import/org?mode=&dryRun=&force=` | X-Import-Token | 名册导入；与登录鉴权并存 |
| `POST /api/import/metrics` | X-Import-Token | 指标导入 |
| `GET /api/import/template?type=` | X-Import-Token | 名册（7 列）/ 指标 CSV 列模板 |
| `GET /api/import/logs?limit=` | Bearer (hq) | 导入历史 |
| `GET /api/admin/data-quality?limit=` | Bearer (hq) | 工号质量：在职缺工号清单、重复工号检测、停用节点统计 |

前端切换：`index.html?data=api&api=http://127.0.0.1:3777`（默认不加参数 = 演示模式，**自动渲染为「演示模式（总部）」徽章**）。登录接口需请求头 `Content-Type: application/json`；其他数据接口需请求头 `Authorization: Bearer <token>`。

### 数据导入流程

1. `GET /api/import/template?type=org` 下载名册模板 → 填写 大区/小区/门店/岗位/人员 +（可选）**工号**、**生效日期** → `POST /api/import/org` 导入（**指标导入前必须先有人员名册**）
   - 空库开箱可用：10 个岗位配置（含积分权重）建库时已内置，"全国" 根节点在首次导入名册时自动创建；旧 5 列名册仍兼容（缺工号的行降级为「岗位/门店 + 姓名」匹配并单独告警）
   - **工号是人员唯一身份**：工号命中 → 改名则改名、换门店/岗位则按「生效日期」切分任职区间（历史报表仍归当时门店）；工号未命中但存在无工号同名人员 → **认领**（补工号，不新建重复人员）；工号属另一姓名 → 视为改名
2. `GET /api/import/template?type=metrics` 下载指标模板 → 按日填写 11 项指标（可加「工号」列）→ `POST /api/import/metrics` 导入
3. 两个接口均返回 `{ ok, rowsOk, rowsFailed:[{row, reason}] }`；未知门店/人员、非数字、日期格式错误逐行拒绝并给出原因，合法行正常入库（同人同日覆盖更新，可重复上传）

### 导入模式与预检

| 参数 | 取值 | 说明 |
|:---|:---|:---|
| `mode` | `merge`（默认）/ `snapshot` | `merge` 只新增与调岗，不做离职判定；`snapshot` 以文件中出现的**大区**为范围，名单内没有的 门店/岗位/人员 自动停用、重新出现的自动恢复，未涉及的大区完全不动 |
| `dryRun` | `1` | 只返回差异报告（将新增 / 将调岗 / 将停用 / 将恢复 / 已认领 / 失败明细），**不写库、不记日志** |
| `force` | `1` | 跳过安全阀；快照将停用「人员+门店」数量 > 5 且占比 > 20% 时返回 **409 + 待停用清单**，确认后加 `force=1` 重发 |

```bash
# 全量快照前先预检（不写库）
curl.exe -H "X-Import-Token: change-me-import-token" `
  -F "file=@名册.xlsx" "http://127.0.0.1:3777/api/import/org?mode=snapshot&dryRun=1"
# 确认后正式执行（大批量停用需再带 force=1）
curl.exe -H "X-Import-Token: change-me-import-token" `
  -F "file=@名册.xlsx" "http://127.0.0.1:3777/api/import/org?mode=snapshot"
```

> 停用只影响「可见性」，不改变聚合口径：离职人员/闭店门店的历史指标仍完整保留并计入上级合计，因此打开「显示已停用」后榜单求和可能小于上级合计，页面会给出提示语。

```bash
# 示例（Windows PowerShell）
curl.exe -H "X-Import-Token: change-me-import-token" `
  -F "file=@指标导入模板.csv" http://127.0.0.1:3777/api/import/metrics
```

### 部署

生产部署（PM2 + Nginx + HTTPS、备份 cron、Docker/内网备选、运维流程、**v4.2 账号管理与 JWT_SECRET 生成**）见 **[server/DEPLOY.md](server/DEPLOY.md)**。

---

## 📜 版本历史

| 版本 | 日期 | 变更说明 |
|:---:|:---:|:---|
| **v4.2** | 2026-09-16 | **身份权限校验**：5 角色（hq/regional_lead/area_lead/store_lead/employee）+ 工号密码自管；bcryptjs 哈希 + JWT（HS256，8h）；递归 CTE scope 子树过滤（员工→自身、店长→门店、小区长→小区、大区长→大区、HQ→全量），非 HQ 额外纳入祖先链保留树结构；前端登录浮层 + 首登强制改密弹窗 + 顶栏用户徽章 + mock 模式「演示模式（总部）」徽章 + `fetchJson` 自动注入 Bearer + 401 跳转登录；新增 `users` 表、`server/services/auth.js`、`middleware/authRequired.js`、`middleware/scope.js`、`routes/auth.js`、`scripts/create-user.js` CLI（add/reset/list/import/disable/enable）；`server/DEPLOY.md §7` 账号管理；`.env.example` 含 `JWT_SECRET` 占位 |
| **v4.1** | 2026-09-15 | **积分排行榜门店人均口径**：门店维度改为「总积分 ÷ 在职人数」的人均积分排名（人数 = 门店子树人员节点数，含「显示已停用」开关影响），消除人数规模优势；tooltip 展示「人均积分 / 总积分 / 人数」三要素；条形标签保留 1 位小数；岗位 / 人员 / PK 维度口径不变 |
| **v4.0** | 2026-09-15 | **组织生命周期 + 工号识别**：节点停用/恢复（离职、闭店软删除，历史数据保留，重现即恢复）；工号唯一识别（前导零保真、认领去重、改名不新增、同名不同人靠工号区分）；任职区间时间切片（`person_assignments` + `node_paths` 分片，调岗后历史报表按当时门店/岗位归属）；名册导入 merge/snapshot、dryRun 预检、大批量停用 409 安全阀 + force；指标导入支持按工号定位；新增 `GET /api/import/logs`、`GET /api/admin/data-quality`；前端新增「显示已停用」开关与停用标识（mock 模式零改动） |
| **v3.8** | 2026-09-15 | **真实数据接入**：Node.js + Express + SQLite 后端；组织树/指标聚合/人员汇总 API；Excel/CSV 名册与指标导入（upsert + 逐行校验报告）；前端 mock/API 双模式（`?data=api`），按需懒加载 + 本地缓存 |
| **v3.7** | 2026-09-15 | **双看板结构**：顶栏胶囊切换「经营总览 / 业务执行与闭环」；岗位体系由 3 扩展至 10；差异化积分权重与岗位空缺机制；新增试驾点评数与**试驾点评率 / 线索试驾率**；闭环看板按门店分色人员散点图（X=累计积分，Y=锁单量/试驾点评率/线索试驾率）+ 琥珀色均值参考线 + 6 张 KPI 摘要 + 人员明细表 |
| **v3.6** | 2026-09-15 | 趋势分析自动归一化对比（峰值差 ≥10 倍） |
| **v3.5** | 2026-09-15 | 趋势分析指标多选 + 双 Y 轴 |
| **v3.4** | 2026-09-14 | 三大板块可展开按日折线图 |
| **v3.3** | 2026-09-14 | 七阶段漏斗视觉重构 |
| **v3.2** | 2026-09-14 | 六级组织树筛选 + PK 模式 |
| **v3.1** | 2026-09-14 | 首页补齐积分/趋势/雷达/下钻/明细 |
| **v3.0** | 2026-09-14 | 首页重构：分栏 + 漏斗 + 下钻 |
| **v2.x** | 2026-09-14 | 版本号/README/推送脚本迭代 |
| **v1** | 2026-09-14 | 初始版本（已归档） |

---

## 🛠 技术栈

- **单文件 HTML**（无需构建工具）
- **Tailwind CSS**（CDN 引入）
- **ECharts 5.4**（CDN 引入，折线 / 柱状 / 横向条形 / 散点）
- 后端：Node.js + Express + SQLite（better-sqlite3）+ bcryptjs + jsonwebtoken（v4.2 起）
- 零依赖、零安装、零编译

---

## 🚀 本地运行

```bash
cd "D:\projects\dashboard"
python -m http.server 8080
```

访问：http://localhost:8080/index.html

> 后端另起：`cd server && npm start`（默认 `http://127.0.0.1:3777`），前端 URL 加 `?data=api&api=http://127.0.0.1:3777` 走真实数据 + 登录。

---

## 🔄 更新与推送

```powershell
cd "D:\projects\dashboard"
git add .
git commit -m "feat: 你的变更说明"
git push origin main
git push origin --tags
```

首次推送请使用 `push-to-github.ps1` 脚本（脚本内填入 GitHub 用户名与 PAT）。

> ⚠️ PAT 请勿提交到仓库，用完即吊销重发。

---

<div align="center">

✨ **推荐使用 GitHub Pages 在线版访问，无需启动本地服务** ✨

[👉 v4.2 最新版（GitHub Pages）](https://casteryu.github.io/dashboard/) · [👉 v4.2 镜像（jsDelivr）](https://cdn.jsdelivr.net/gh/CasterYu/dashboard@v4.2/index.html) · [👉 v1 历史版](https://casteryu.github.io/dashboard/legacy/v1/)

</div>