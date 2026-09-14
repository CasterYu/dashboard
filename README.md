<div align="center">

# 🚗 业务数据看板 · Dashboard

**汽车销售运营数据看板 · 含历史版本 · 在线可访问**

[![Version](https://img.shields.io/badge/version-v3.3-blue)](https://github.com/CasterYu/dashboard)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-Live-success)](https://casteryu.github.io/dashboard/)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

</div>

---

## ⚡ 一键访问不同版本

> **重点：** GitHub 仓库首页直接点下面链接就能打开对应版本的网页，**多个版本可以同时打开对比**。

### 🌐 在线版（GitHub Pages · 推荐 · 永久可访问）

| 版本 | 链接 | 状态 | 说明 |
|:---:|:---|:---:|:---|
| **🟢 v3.3 · 最新版** | **👉 [https://casteryu.github.io/dashboard/](https://casteryu.github.io/dashboard/)** | ✅ 当前 | 六级组织树筛选（全国→大区→小区→门店→岗位→人员）+ 单选 / PK 双模式 + **全链路 7 阶段漏斗（更大、带转化率徽章）** + 多维下钻 + 趋势分析 + 积分榜 + 明细表 |
| **🟡 v1 · 历史归档** | **👉 [https://casteryu.github.io/dashboard/legacy/v1/](https://casteryu.github.io/dashboard/legacy/v1/)** | 📦 归档 | 白板草图完整模块版：漏斗/积分/下钻/排行榜/雷达 |

> 💡 直接 Ctrl + 点击可在新标签页打开，与当前页同时浏览。

### 💻 本地版（双击 HTML 文件）

| 版本 | 文件路径 |
|:---:|:---|
| **v3.3 最新版** | `D:\projects\dashboard\index.html` |
| **v1 历史版** | `D:\projects\dashboard\legacy\v1\index.html` |

### 📦 Git 历史源码（tag）

| 标签 | 说明 |
|:---:|:---|
| [`v3.3`](https://github.com/CasterYu/dashboard/tree/v3.3) | 全链路 7 阶段漏斗视觉重构：更大横向条 + 每阶段转化率徽章 |
| [`v3.2`](https://github.com/CasterYu/dashboard/tree/v3.2) | 六级组织树筛选 + PK 横向对比模式 + 补回全链路 7 阶段漏斗 |
| [`v3.1`](https://github.com/CasterYu/dashboard/tree/v3.1) | 首页补齐模块：积分看板 / 趋势分析 / 雷达 / 渠道分布 / 多维下钻 / 明细表 |
| [`v3.0`](https://github.com/CasterYu/dashboard/tree/v3.0) | 首页重构：左右分栏 + 全链路 7 阶段漏斗 + 门店/顾问两级下钻 |
| [`v2.3`](https://github.com/CasterYu/dashboard/tree/v2.3) | 页脚版本号修正 |
| [`v2.2`](https://github.com/CasterYu/dashboard/tree/v2.2) | README 顶部一键访问不同版本入口 |
| [`v2.1`](https://github.com/CasterYu/dashboard/tree/v2.1) | 新增 `push-to-github.ps1` 一键推送脚本 |
| [`v2.0`](https://github.com/CasterYu/dashboard/tree/v2.0) | 归档 v1，重构首页为三大模块 |
| [`v1.1`](https://github.com/CasterYu/dashboard/tree/v1.1) | README 补充版本说明 |
| [`v1.0`](https://github.com/CasterYu/dashboard/tree/v1.0) | 初始版本：三大模块 + 时间筛选 |

---

## 📖 项目说明

汽车销售运营场景下的数据看板，单文件 HTML 部署，零构建、零依赖。

- **v3.3（当前）**：在 v3.2 基础上把右侧**全链路七阶段转化漏斗**放大，改为更醒目的横向渐变条，每阶段名称与数值置于条内，右侧以独立徽章展示「环比上一阶段转化率」，整体转化率/最大流失/线索→交付等摘要保留在漏斗底部。
- **v3.2（历史）**：顶部新增**六级组织树筛选**（全国 → 大区 → 小区 → 门店 → 岗位 → 人员），默认单选、可切 PK 模式做同级横向对比；补回**全链路七阶段转化漏斗**；岗位支持「一岗一人 / 一岗多人」，空缺岗位在筛选器内置灰标注「本店暂无」、在对比中显示 `—` 且不参与排名。
- **v3.0 / v3.1（历史）**：左右分栏布局、积分看板、趋势分析、多维下钻、明细数据表等模块。
- **v1（已归档）**：基于原始白板草图的「大而全」实现。

### 🧭 组织树与岗位编制

```
全国 → 大区 → 小区 → 门店 → 岗位 → 人员
```

| 岗位 | 编制规则 |
|:---|:---|
| 店长 | 一岗一人（每店 1 人） |
| 销售顾问 | 一岗多人（每店 2 ~ 4 人） |
| 线上直播 | 一岗多人，部分门店空缺 |

### 🔀 两种筛选模式

- **单选模式（默认）**：五级级联下拉逐级下钻，数据为该节点的区间汇总；未选门店时岗位与人员下拉置灰。
- **PK 模式**：在同一层级勾选 2 ~ 6 个对象做横向比较（例如门店比较）。

### 📐 PK 对比口径约定

- **不做任何累加**，只做并列对比；总览区不出现合计值
- 总量指标直接对比；比率指标按「分子 / 分母」分别累加后重算，**绝不把百分比平均或相加**
- 每行自动标出最优（绿）/ 最差（红），并显示与基准对象的差值、差值百分比（点击表头可切换基准）
- 空缺岗位显示 `—`，**不与 0 混淆**，且不参与该行的最优/最差着色与排名
- 环比为各对象**各自**对比上一等长周期，保证横向公平
- 组织范围过小导致深层指标为 0 时，漏斗底部会给出样本偏小的提示

---

## 📁 目录结构

```
dashboard/
├── README.md               ← 本文件（顶部即可一键访问不同版本）
├── index.html              ← v3.3 当前最新版（打开默认）
├── .gitignore
├── .gitattributes          ← GitHub 文件识别优化
├── push-to-github.ps1     ← 一键推送到 GitHub（需填入 token）
└── legacy/
    └── v1/
        ├── README.md       ← v1 历史说明
        └── index.html      ← v1 历史归档代码
```

---

## 📜 版本历史

| 版本 | 日期 | 变更说明 |
|:---:|:---:|:---|
| **v3.3** | 2026-09-14 | 全链路 7 阶段漏斗视觉重构：面板加宽、横向渐变条放大、每阶段名称与数值内置、右侧独立转化率徽章；整体转化率/最大流失摘要保留底部 |
| **v3.2** | 2026-09-14 | 新增六级组织树筛选（全国/大区/小区/门店/岗位/人员）与单选、PK 双模式；补回全链路七阶段转化漏斗；岗位支持一岗一人 / 一岗多人并处理空缺岗位；移除雷达图、线索渠道分布、积分来源占比 |
| **v3.1** | 2026-09-14 | 首页补齐模块：积分看板、趋势分析、产品体验雷达、线索渠道分布、多维下钻、明细数据表 |
| **v3.0** | 2026-09-14 | 首页重构：左右分栏 + 全链路 7 阶段漏斗 + 门店/顾问两级下钻 |
| **v2.3** | 2026-09-14 | 页脚版本号修正 |
| **v2.2** | 2026-09-14 | README 顶部一键访问不同版本入口（Pages / 本地 / tag 三种方式） |
| **v2.1** | 2026-09-14 | 新增 `push-to-github.ps1` 一键推送脚本；补充 `.gitattributes` |
| **v2.0** | 2026-09-14 | 归档 v1 至 `legacy/v1/`；重构首页为「线索入口 / 到店接待 / 结果」三大模块 |
| **v1.1** | 2026-09-14 | README 补充版本说明 |
| **v1.0** | 2026-09-14 | 初始版本：白板草图完整模块版 |

---

## 🛠 技术栈

- **单文件 HTML**（无需构建工具）
- **Tailwind CSS**（CDN 引入）
- **ECharts 5.4**（CDN 引入，折线 / 柱状 / 横向条形）
- 零依赖、零安装、零编译

---

## 🚀 本地运行

```bash
# 进入项目目录
cd "D:\projects\dashboard"

# 启动最新版（端口 8080）
python -m http.server 8080

# 另开一个窗口启动 v1（端口 8081，便于同时对比）
cd "D:\projects\dashboard\legacy\v1"
python -m http.server 8081
```

访问：
- 最新版：http://localhost:8080/index.html
- v1：http://localhost:8081/index.html

---

## 🔄 更新与推送

修改代码后，提交并推送到 GitHub：

```powershell
cd "D:\projects\dashboard"
git add .
git commit -m "feat: 你的变更说明"
git push origin main
```

需要推送所有 tag：

```powershell
git push origin --tags
```

首次推送请使用 `push-to-github.ps1` 脚本（脚本内填入 GitHub 用户名与 PAT）。

> ⚠️ PAT 请勿提交到仓库，用完即吊销重发。

---

<div align="center">

✨ **推荐使用 GitHub Pages 在线版访问，无需启动本地服务** ✨

[👉 v3.3 最新版](https://casteryu.github.io/dashboard/) · [👉 v1 历史版](https://casteryu.github.io/dashboard/legacy/v1/)

</div>
