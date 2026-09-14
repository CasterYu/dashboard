<div align="center">

# 🚗 业务数据看板 · Dashboard

**汽车销售运营数据看板 · 含两个历史版本 · 在线可访问**

[![Version](https://img.shields.io/badge/version-v3.1-blue)](https://github.com/CasterYu/dashboard)
[![Pages](https://img.shields.io/badge/GitHub%20Pages-Live-success)](https://casteryu.github.io/dashboard/)
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

</div>

---

## ⚡ 一键访问不同版本

> **重点：** GitHub 仓库首页直接点下面链接就能打开对应版本的网页，**两个版本可以同时打开对比**。

### 🌐 在线版（GitHub Pages · 推荐 · 永久可访问）

| 版本 | 链接 | 状态 | 说明 |
|:---:|:---|:---:|:---|
| **🟢 v3.1 · 最新版** | **👉 [https://casteryu.github.io/dashboard/](https://casteryu.github.io/dashboard/)** | ✅ 当前 | 三大模块 + 积分看板 + 趋势分析 + 产品体验雷达 + 渠道分布 + 多维下钻 + 明细表 |
| **🟡 v1 · 历史归档** | **👉 [https://casteryu.github.io/dashboard/legacy/v1/](https://casteryu.github.io/dashboard/legacy/v1/)** | 📦 归档 | 白板草图完整模块版：漏斗/积分/下钻/排行榜/雷达 |

> 💡 直接 Ctrl + 点击可在新标签页打开，与当前页同时浏览。

### 💻 本地版（双击 HTML 文件）

| 版本 | 文件路径 |
|:---:|:---|
| **v2 最新版** | `D:\projects\dashboard\index.html` |
| **v1 历史版** | `D:\projects\dashboard\legacy\v1\index.html` |

### 📦 Git 历史源码（tag）

| 标签 | 仓库内对应文件 | 说明 |
|:---:|:---|:---|
| [`v2.1`](https://github.com/CasterYu/dashboard/tree/v2.1) | `index.html` + `push-to-github.ps1` | 加入一键推送脚本 |
| [`v2.0`](https://github.com/CasterYu/dashboard/tree/v2.0) | `index.html` + `legacy/v1/` | 归档 v1，重构首页为三大模块 |
| [`v1.1`](https://github.com/CasterYu/dashboard/tree/v1.1) | `legacy/v1/index.html` | README 补充版本说明 |
| [`v1.0`](https://github.com/CasterYu/dashboard/tree/v1.0) | `legacy/v1/index.html` | 初始完整模块版（白板草图实现） |

---

## 📖 项目说明

汽车销售运营场景下的数据看板，单文件 HTML 部署，含两代设计：

- **v1（已归档）**：基于原始白板草图的"大而全"实现，包含漏斗、积分、排行榜、下钻、雷达、趋势、明细表等多个模块。
- **v2（当前）**：按"线索入口 → 到店接待 → 结果面板"重构首页，每张指标卡片更大、更醒目；顶部加入时间区间筛选器，所见数据为区间合计，含总览条、转化率、环比、同比。

---

## 📁 目录结构

```
dashboard/
├── README.md               ← 本文件（顶部即可一键访问不同版本）
├── index.html              ← v2 当前最新版（打开默认）
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
| **v3.1** | 2026-09-14 | 首页补齐模块：积分看板、趋势分析、产品体验雷达、线索渠道分布、多维下钻、明细数据表 |
| **v3.0** | 2026-09-14 | 首页重构：左右分栏 + 全链路 7 阶段漏斗 + 门店/顾问两级下钻 |
| **v2.1** | 2026-09-14 | 新增 `push-to-github.ps1` 一键推送脚本；补充 `.gitattributes` |
| **v2.0** | 2026-09-14 | 归档 v1 至 `legacy/v1/`；重构首页为"线索入口/到店接待/结果"三大模块 + 时间筛选 |
| **v1.1** | 2026-09-14 | README 补充版本说明 |
| **v1.0** | 2026-09-14 | 初始版本：白板草图完整模块版 |

---

## 🛠 技术栈

- **单文件 HTML**（无需构建工具）
- **Tailwind CSS**（CDN 引入）
- **ECharts 5.4**（CDN 引入，用于折线/柱状/漏斗/雷达/饼图）
- 零依赖、零安装、零编译

---

## 🚀 本地运行

```bash
# 进入项目目录
cd "D:\projects\dashboard"

# 启动 v2（端口 8080）
python -m http.server 8080

# 另开一个窗口启动 v1（端口 8081，便于同时对比）
cd "D:\projects\dashboard\legacy\v1"
python -m http.server 8081
```

访问：
- v2：http://localhost:8080/index.html
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

需要推送所有 tag（v1.0、v1.1、v2.0、v2.1）：

```powershell
git push origin --tags
```

首次推送请使用 `push-to-github.ps1` 脚本（脚本内填入 GitHub 用户名与 PAT）。

---

<div align="center">

✨ **推荐使用 GitHub Pages 在线版访问，无需启动本地服务** ✨

[👉 v2 最新版](https://casteryu.github.io/dashboard/) · [👉 v1 历史版](https://casteryu.github.io/dashboard/legacy/v1/)

</div>