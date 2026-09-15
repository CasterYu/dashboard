<div align="center">

# 🚗 业务数据看板 · Dashboard

**汽车销售运营数据看板 · 含历史版本 · 在线可访问**

[![Version](https://img.shields.io/badge/version-v3.8-blue)](https://github.com/CasterYu/dashboard)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-Live-success)](https://casteryu.github.io/dashboard/)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

</div>

---

## ⚡ 一键访问不同版本

> **重点：** GitHub 仓库首页直接点下面链接就能打开对应版本的网页，**多个版本可以同时打开对比**。

### 🌐 在线版（GitHub Pages · 推荐 · 永久可访问）

| 版本 | 链接 | 状态 | 说明 |
|:---:|:---|:---:|:---|
| **🟢 v3.8 · 最新版** | **👉 [https://casteryu.github.io/dashboard/](https://casteryu.github.io/dashboard/)** | ✅ 当前 | **真实数据接入**：新增 Node.js + Express + SQLite 后端（`server/`），数据 API + Excel/CSV 导入；URL 加 `?data=api` 切换真实数据，默认仍为演示模式 |
| **🟡 v3.7 · 历史版** | 👉 同上链接（与 v3.8 同批发布，页面即 v3.8） | 📦 归档 | 双看板结构（经营总览 + 业务执行与闭环）；岗位体系 10 个；闭环看板人员散点图 |
| **🟡 v1 · 历史归档** | **👉 [https://casteryu.github.io/dashboard/legacy/v1/](https://casteryu.github.io/dashboard/legacy/v1/)** | 📦 归档 | 白板草图完整模块版：漏斗/积分/下钻/排行榜/雷达 |

> 💡 直接 Ctrl + 点击可在新标签页打开，与当前页同时浏览。

### 💻 本地版（双击 HTML 文件）

| 版本 | 文件路径 |
|:---:|:---|
| **v3.8 最新版** | `D:\projects\dashboard\index.html` |
| **v1 历史版** | `D:\projects\dashboard\legacy\v1\index.html` |

---

## 📖 项目说明

汽车销售运营场景下的数据看板，单文件 HTML 部署，零构建、零依赖。

- **v3.8（当前）**：真实数据接入。前端双模式：默认演示模式（内嵌模拟数据，零部署可用），URL 加 `?data=api&api=http://后端地址:3777` 切换真实数据；后端 Node.js + Express + SQLite（`server/` 目录），提供组织树/指标聚合/人员汇总 API 与 Excel/CSV 导入接口，数据按需懒加载 + 本地缓存。
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
├── index.html              ← v3.8 当前最新版（前端，双模式：演示/真实数据）
├── .gitignore
├── .gitattributes
├── push-to-github.ps1
├── server/                 ← v3.8 后端（Node.js + Express + SQLite，详见下方章节）
└── legacy/
    └── v1/
        ├── README.md
        └── index.html
```

---

## 🔌 v3.8 后端服务（真实数据接入）

### 启动

```bash
cd server
npm install          # 首次
node scripts/seed.js # 可选：生成一年演示数据入库（自动自验）
npm start            # http://127.0.0.1:3777
```

### API 简表

| 接口 | 说明 |
|:---|:---|
| `GET /api/org` | 六级组织树 + 岗位配置（含积分权重）+ 数据日期范围 |
| `GET /api/metrics?node=&from=&to=` | 节点（含子树）区间逐日 11 指标 + 积分序列（积分按岗位权重现算）；`node=all` 表示全部人员 |
| `GET /api/persons?node=&from=&to=` | 节点子树人员区间汇总（散点图/积分榜/明细表数据源）；`node=all` 表示全部人员 |
| `GET /api/nodesums?nodes=&from=&to=` | 多节点区间合计批量查询（下钻/榜单预载） |
| `POST /api/import/org` | 名册导入（大区/小区/门店/岗位/人员，表头 X-Import-Token） |
| `POST /api/import/metrics` | 指标导入（同人同日 upsert 覆盖，逐行校验返回失败明细） |
| `GET /api/import/template?type=` | 下载名册 / 指标 CSV 列模板 |

前端切换：`index.html?data=api&api=http://127.0.0.1:3777`（默认不加参数 = 演示模式）。导入接口需请求头 `X-Import-Token`（环境变量 `IMPORT_TOKEN` 设置，默认 `change-me-import-token`）。

### 数据导入流程

1. `GET /api/import/template?type=org` 下载名册模板 → 填写大区/小区/门店/岗位/人员 → `POST /api/import/org` 导入（**指标导入前必须先有人员名册**）
   - 空库开箱可用：10 个岗位配置（含积分权重）建库时已内置，"全国" 根节点在首次导入名册时自动创建
2. `GET /api/import/template?type=metrics` 下载指标模板 → 按日填写 11 项指标 → `POST /api/import/metrics` 导入
3. 两个接口均返回 `{ ok, rowsOk, rowsFailed:[{row, reason}] }`；未知门店/人员、非数字、日期格式错误逐行拒绝并给出原因，合法行正常入库（同人同日覆盖更新，可重复上传）

```bash
# 示例（Windows PowerShell）
curl.exe -H "X-Import-Token: change-me-import-token" `
  -F "file=@指标导入模板.csv" http://127.0.0.1:3777/api/import/metrics
```

### 部署

生产部署（PM2 + Nginx + HTTPS、备份 cron、Docker/内网备选、运维流程）见 **[server/DEPLOY.md](server/DEPLOY.md)**。

---

## 📜 版本历史

| 版本 | 日期 | 变更说明 |
|:---:|:---:|:---|
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
- 零依赖、零安装、零编译

---

## 🚀 本地运行

```bash
cd "D:\projects\dashboard"
python -m http.server 8080
```

访问：http://localhost:8080/index.html

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

[👉 v3.8 最新版（GitHub Pages）](https://casteryu.github.io/dashboard/) · [👉 v3.8 镜像（jsDelivr）](https://cdn.jsdelivr.net/gh/CasterYu/dashboard@v3.8/index.html) · [👉 v1 历史版](https://casteryu.github.io/dashboard/legacy/v1/)

</div>