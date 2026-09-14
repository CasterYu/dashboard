# v1 · 完整模块版（历史归档）

> 本目录为 v1 版本的归档代码，**已不再维护**，仅作为历史参考保留。
> 当前最新版本请查看仓库根目录的 `index.html`（[在线预览](https://casteryu.github.io/dashboard/)）。

## 版本信息

- **版本**：v1
- **状态**：已 v2 替代，本目录仅作历史归档
- **设计起点**：白板草图

## 功能模块

- 顶部导航：标题、角色切换（销售Leader / 总经理）、时间筛选（日 / 周 / 月）、实时时钟
- 6 个 KPI 卡：总线索 / 到店 / 订单 / 交车 / 总积分 / 转化率
- 左侧列：线索入口漏斗 + 到店接待流程 + 结果指标（订单/交车）
- 中间列：积分看板（排行榜 + 来源饼图） + 多维下钻（全国→大区→小区→门店→顾问） + 趋势分析
- 右侧列：积分排行榜 + 产品体验雷达图 + 线索渠道分布
- 底部：门店/顾问明细表

## 如何查看

### 在线版（推荐）

👉 **https://casteryu.github.io/dashboard/legacy/v1/**

直接打开，无需本地服务。

### 本地版

双击打开本目录下的 `index.html`，或在 `legacy/v1/` 目录下启动 HTTP 服务：

```bash
cd legacy/v1
python -m http.server 8081
```

访问 http://localhost:8081/index.html

## 相关历史标签

- [`v1.0`](https://github.com/CasterYu/dashboard/tree/v1.0) —— 初始版本（本目录来源）
- [`v1.1`](https://github.com/CasterYu/dashboard/tree/v1.1) —— README 补充说明