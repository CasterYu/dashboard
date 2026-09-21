// 业务数据看板 v5.12 — 统一渲染 + 启动（P3-4 拆分，依赖以上全部）

        function toggleMode() {
            const single = state.mode === 'single';
            document.getElementById('singleView').classList.toggle('hidden', !single);
            document.getElementById('pkView').classList.toggle('hidden', single);
            $pkBar.classList.toggle('hidden', single);
            $pkBar.classList.toggle('flex', !single);
            $pkOptionsWrap.classList.toggle('hidden', single);
            if (!single) {
                // 进入 PK 模式时释放单选视图的展开态图表
                Object.keys(panelCharts).forEach(function (k) { if (panelCharts[k]) { panelCharts[k].dispose(); } delete panelCharts[k]; });
            }
        }
        async function preloadForRender() {
            try {
                const r = currentIdx(), pr = prevRange();
                const from = idxToDate(r[0]), to = idxToDate(r[1]);
                const pfrom = idxToDate(pr.i0), pto = idxToDate(pr.i1);
                // 收集本视图可能访问的节点：
                // ① sumNodes —— 只需区间合计（下钻子级、PK 候选、榜单/明细维度）
                // ② dailyNodes —— 需要逐日序列（当前节点、PK 已选、下钻链，用于趋势/面板折线）
                const sumNodes = [], dailyNodes = [], seen = {};
                function addSum(n) { if (n && n.level !== '人员' && !seen[n.id]) { seen[n.id] = 1; sumNodes.push(n); } }
                function addDaily(n) { if (n && !seen[n.id]) { seen[n.id] = 1; dailyNodes.push(n); if (n.level !== '人员') sumNodes.push(n); } }
                const cur = currentNode();
                addDaily(cur);
                collectLevel(cur, NEXT_LEVEL[cur.level], []).forEach(addSum);
                collectLevel(tree, state.pkLevel, []).forEach(addSum);
                // v4.4：排行榜维度由 autoRankDim 跟随当前组织筛选节点，无法静态预知，预热门店/岗位/人员三层
                ['门店', '岗位', '人员'].forEach(function (lv) { collectLevel(tree, lv, []).forEach(addSum); });
                collectLevel(tree, state.tableDim, []).forEach(addSum);
                state.drillIds.forEach(function (id) {
                    const n = nodeById(id);
                    addDaily(n);
                    if (n) collectLevel(n, NEXT_LEVEL[n.level], []).forEach(addSum);
                });
                pkNodes().forEach(addDaily);
                // 并行预载：人员合计（当前+对比周期）× 节点批量合计 × 逐日序列
                await Promise.all([
                    ensurePersons(tree, from, to),
                    ensurePersons(tree, pfrom, pto),
                    ensureNodeSums(sumNodes, from, to),
                    ensureNodeSums(sumNodes, pfrom, pto),
                    ensureSeries(dailyNodes)
                ]);
                return true;
            } catch (e) { apiError(e); return false; }
        }
        function renderAll() {
            if (DATA_MODE === 'api') {
                apiLoading(true);
                preloadForRender().then(function (ok) { apiLoading(false); if (ok) renderAllSync(); });
                return;
            }
            renderAllSync();
        }
        function renderAllSync() {
            // 看板切换：先显隐，再调对应渲染
            const isOverview = state.board === 'overview';
            const $bo = document.getElementById('boardOverview');
            const $bc = document.getElementById('boardClosure');
            const $oc = document.getElementById('overviewControls');
            if ($bo) $bo.classList.toggle('hidden', !isOverview);
            if ($bc) $bc.classList.toggle('hidden', isOverview);
            if ($oc) $oc.classList.toggle('hidden', !isOverview);
            document.querySelectorAll('#boardSeg button').forEach(function (b) {
                b.classList.toggle('active', b.dataset.board === state.board);
            });
            if (isOverview) {
                renderOrgSelectors();
                toggleMode();
                if (state.mode === 'single') renderSingleView();
                renderPkPostTabs();
                renderPkOptions();
                renderPkView();
                renderFunnel();
                renderDrill();
                renderTrend();
                renderPoints();
                renderDetail();
            } else {
                renderClosure();
            }
            renderDutyTable();
            $rangeText.textContent = state.start + ' 至 ' + state.end;
        }
        function setRange(days) {
            const end = TODAY;
            const start = addDays(end, -(days - 1));
            $start.value = dateStr(start);
            $end.value = dateStr(end);
            state.start = $start.value;
            state.end = $end.value;
            state.drillIds = [];
            state.drillSelectedId = null;   // v4.9：日期范围变化时清掉下钻区旧选中
            clearMetricCache();
            renderAll();
        }
        function clShiftDaily(step) {
            const i = CL_DATES.indexOf(clViewDate());
            if (i < 0) return;
            const j = i + step;
            if (j < 0 || j >= CL_DATES.length) return;
            state.clDate = CL_DATES[j];
            renderAll();
        }
        function renderDutyTable() {
            const box = document.getElementById('dutyBody');
            if (!box) return;
            let total = 0;
            box.innerHTML = POSTS.map(function (p) {
                const duties = POST_DUTIES[p.key] || [];
                total += duties.length;
                const rows = duties.length ? duties.map(function (d) {
                    return '<tr><td style="white-space:nowrap;color:' + p.color + '">' + d.action + '</td><td>' + d.detail + '</td></tr>';
                }).join('') : '<tr><td colspan="2" class="text-slate-500">暂无职责条目</td></tr>';
                return '<div>' +
                    '<div class="flex items-center gap-2 mb-1">' +
                    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + p.color + '"></span>' +
                    '<span class="text-sm text-slate-100 font-medium">' + p.name + '</span>' +
                    '<span class="text-[11px] text-slate-500">' + p.note + ' · ' + duties.length + ' 项关键动作</span>' +
                    '</div>' +
                    '<table class="cl-rule-table"><thead><tr><th style="width:180px">关键动作</th><th>具体内容（示意文案，待业务确认）</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                    '</div>';
            }).join('');
            const sub = document.getElementById('dutySubtitle');
            if (sub) sub.textContent = POSTS.length + ' 岗位 · ' + total + ' 项关键动作 · 示意文案，待业务确认';
        }
        const $showInactiveWrap = document.getElementById('showInactiveWrap');
        const $showInactive = document.getElementById('showInactive');
        function sanitizeSelection() {
            Object.keys(state.sel).forEach(function (k) {
                const id = state.sel[k];
                if (id !== '__all__' && !NODE_BY_ID.has(id)) state.sel[k] = '__all__';
            });
            state.pkIds = state.pkIds.filter(function (id) { return NODE_BY_ID.has(id); });
            if (state.pkBase && !NODE_BY_ID.has(state.pkBase)) state.pkBase = state.pkIds[0] || null;
            state.drillIds = state.drillIds.filter(function (id) { return NODE_BY_ID.has(id); });
            const sn = state.sel.store !== '__all__' ? NODE_BY_ID.get(state.sel.store) : null;
            const pn = state.sel.post !== '__all__' ? NODE_BY_ID.get(state.sel.post) : null;
            if (pn && (!sn || pn.parent !== sn)) state.sel.post = '__all__';
            const pn2 = state.sel.post !== '__all__' ? NODE_BY_ID.get(state.sel.post) : null;
            if (pn2 && state.sel.person !== '__all__') {
                const pr = NODE_BY_ID.get(state.sel.person);
                if (!pr || pr.parent !== pn2) state.sel.person = '__all__';
            }
        }
        function updateTime() {
            const el = document.getElementById('current-time');
            if (el) el.textContent = new Date().toLocaleTimeString('zh-CN');
        }

// ===== startApp：仅保留执行语句（初始化 + 事件绑定）=====
        function startApp() {
            if (DATA_MODE === 'mock') tree = buildTree();
            // v4：开关仅在 API 模式下出现；mock 演示模式界面与 v3.8 完全一致
            if (swWrap) swWrap.classList.toggle('hidden', DATA_MODE !== 'api');

        // ==================== PART3：状态、组织筛选器、单选视图 ====================
        reindexTree();



        // 单选模式下的当前节点：取最深一级的有效选择
        // 「返回上级」辅助：返回顶栏筛选中最深选中层级在 SEL_ORDER 中的下标；全为 __all__（全国）返回 -1
        // v5.2：级联回填 —— 选中下级节点（小区/门店）后，沿 parent 链自动把上级大区/小区勾上。
        // 只补「__all__」空位，不覆盖用户已显式选择的层级；保证筛选区始终呈现完整的逐级路径
        // v5.2：登录默认范围 —— 按自动派生的范围根，把组织筛选预勾到本人管理层级：
        // 员工→本人、店长→门店、小区主管→小区、大区总监→大区（祖先链由级联回填补齐）；
        // 总部（无范围根）保持全国；显式多根授权无法映射单一链路，保持全国由用户自行筛选

        // ---------- 下拉框填充 ----------
        // v5.3：候选改为按 level 语义收集（collectLevel）而非直接 children ——
        // 树中存在「虚拟区→虚拟1区(华东大区)」这类大区套大区的归整结构，直取 children 会整级错位

        // ---------- PK 候选 ----------
        // v4.3：候选严格按当前组织范围收集，不再回退全树（修复「筛选范围外对象出现在候选区」）；
        // 岗位层级 = 跨店同岗对比：候选为范围内各门店的「同一岗位」节点（如 上海东风南方威铭 · 销售店长）

        // ---------- 图标 ----------

        // ---------- 单选视图 ----------

        // ==================== PART4：PK 对比视图 + 全链路七阶段漏斗 ====================

        // ---------- 全链路七阶段漏斗 ----------

        // ==================== PART5：下钻 / 趋势 / 积分 / 明细 / 交互 ====================
        // v4.9：左柱图已移除，drillList 独占整行；此处仅保留选中态辅助函数

        // ---------- 板块展开：按日多指标折线图 ----------

        // v4.16：下钻 ↔ 顶栏「组织范围」双向同步 —— 把当前下钻节点路径写入 state.sel
        // 直接改 state.sel 后由 renderAll 的 fillSelect 回显下拉，不派发 change 事件
        //（change 监听会清空下钻栈，见 $selRegion 等监听器），nodePath 保证父层先设置，依赖链天然合法。

        // ==================== v4.9：下钻区选中态 + 列表联动 ====================
        // 统一管理 state.drillSelectedId，让 drillList 行保持高亮（柱状图已移除）
        // 点击左柱图柱条 / drillList 行的统一入口：
        //   - 与当前选中相同时：取消选中
        //   - 选中后自动下钻（保留原「点击继续下钻」行为）

        // ---------- v4.12：岗位 → 人员 动作得分率矩阵 ----------
        // 行 = 该岗位下的每位人员，列 = 该岗位的关键动作（取岗位职责说明表同一份文案）
        // 单元格 = 得分率（完成量 ÷ 该人被分配的任务量）+ 环比（与上一等长周期的百分点差）

        // 单人动作得分率明细（点击人员行展开）：动作名 + 进度条 + 完成/分配 + 得分率 + 环比

        // ==================== v4.14：人员层下钻 · 区间逐日动作积分完成率 ====================
        // 点击人员行（或顶栏直筛到人员）后，下钻列表替换为该人在顶栏区间内逐日的动作积分完成率表；
        // 点击某日行打开与「业务执行与闭环」同款的动作积分诊断抽屉（取数 = 该行单日）。
        // 数据说明：下钻组织树为演示树（树人员无真实工号）。真实评分岗位按 hashSeed(人员id) 确定性映射到
        // 灯塔数据中同岗位的一名人员取数 —— 同一人员刷新后数据稳定，且明细结构与真实数据完全一致；
        // 模拟岗位按 (人员id + 日期) seed 规则驱动生成（参照 clMockPoints 的扣分证据格式）。

        // 单人单日得分点：真实岗位走灯塔单日索引；模拟岗位规则驱动生成；无数据日期返回 null

        // 人员层主渲染：区间逐日完成率表（列表区）+ 区间动作得分率汇总（#drillDutyDetail，复用 renderDutyPersonDetail）
        // v5.4：人员层主渲染 · 区间逐日动作积分完成率（接入动作评分导入数据）
        // 取数优先级（v5.7 修订）：
        //   1) 接口真实区间（/api/scoring/range）—— 有数据日期显示真实积分/完成率；
        //   2) v5.7：岗位已导入评分（/api/scoring/meta detailRows>0）但该人无任何记录 —— 整表置灰「当日无该人评估数据」，不再回退模拟；
        //   3) LH 真实日报路径（交付专员/店长，未导入评分的岗位）—— 走原 drillDailyPoint，CL_DATES 置灰；
        //   4) 其余（mock 模式 / 从未导入的演示岗位）—— 走 drillDailyPoint 的规则驱动模拟分支（确定性生成），并在 dataNote 标明「规则驱动模拟数据（确定性生成）」。
        // 行点击：真实数据来源异步补充 /scoring/details 证据链再打开诊断抽屉。

        // v5.7：动作评分导入元信息（/api/scoring/meta，API 模式懒加载一次）—— 判断「该岗位是否已导入评分明细」。
        // 用途：API 模式下岗位已有导入数据、但当前人员无导入记录时，逐日表不再回退确定性模拟，整表置灰。


        // ==================== v4.15：销售店长 · 晨会 / 夕会报表 ====================
        // 晨会管理关键目标 = 对某个具体岗位的人发布任务；夕会 = 核对晨会任务有没有完成。
        // 仅 salesManager 岗位人员逐日表显示入口；晨夕共用同一任务集合，确定性生成（seed 前缀 meeting|），
        // 同一人同一天刷新后数据稳定；只读查看，不持久化。

        // 销售店长晨会任务模板：任务名 / 衡量标准（目标值） / 时限 / 任务来源（拿分项或上级指令）

        // 晨会任务确定性生成（晨夕共用）：同一人 + 同一日期结果稳定

        // 打开晨会 / 夕会报表抽屉（type = 'am' | 'pm'）

        // ---------- v4.13：产品专家下钻后追加四象限图（X=积分达成率%，Y=交付量） ----------
        // 仅在「岗位 = 产品专家」下钻后渲染；其它岗位/层级调用方直接清空 #drillPostQuad
        // 风格与 clRenderQuad 保持一致：均值虚线 + 四象限背景 + 文字解读

        // ---------- 趋势分析 ----------

        // ---------- 积分排行榜 ----------

        // v4.4：排行榜维度跟随当前组织筛选节点（全国/大区/小区→门店、门店→岗位、岗位→人员、否则→人员）

        // ---------- 明细数据表 ----------

        // ==================== PART6：业务执行与闭环看板（v4.6 · 灯塔真实积分 + 规则驱动模拟）====================

        // ---------- 灯塔真实积分数据（lighthouse_scoring_v4.6.js）----------
        // v5.9：0 分行未达成判定（扣分明细 + AI 证据链徽章共用口径）—— 结论前缀优先 + 描述式反向判定：
        // ① 「不满足/未满足」开头 → 未达成；「已满足/全满足/满分」开头 → 达成（「不满足：…其余2项满足」尾部的
        //    「满足」不得翻转结论）；② 无结论前缀的描述式证据（如「4必讲侧0项命中」「无收尾动作」「未就五个维度
        //    主动探索需求」，全库 9/10 有 291 行，如张涛试乘试驾 2 行 0 分）按达成词白名单反向判定，防漏进扣分明细。
        // 顺带修正旧口径两处误判：描述式失败证据漏判 291 行；交付店长「已满足【…未逾期】」被「逾期」关键词误计未达成 239 行
        // v5.9c：分数明细解析器 —— 动作文本按 1-1-x 编号拆条款清单（去重保序）
        // v5.9c：分数明细解析器 —— AI 证据结构化（verdict/failCodes/basis/restOk）
        // verdict 与 clZeroRowBad 口径对齐：前缀「不满足/未达成」=fail；「全满足/满足」=pass；描述式反向判定
        // v5.6：真实导入明细行 → 扣分明细（抽屉「扣分明细」表与 dedByItem/totalDed 数据源）
        // 口径：score<0（交付岗位负分行）或 score=0 且证据判定未达成（v5.9 起反向判定，见 clZeroRowBad）

        // ---------- 岗位积分规则（灯塔规则表；无规则表的岗位用通用动作兜底）----------

        // ---------- 组织：真实专营店 → 大区 / 小区 ----------

        // ---------- v4.8：闭环日报单日游标（与顶栏日期区间彻底解耦）----------
        // 闭环日期由独立日报翻阅器（state.clDate）决定；游标非法时回落到数据文件最后一份
        // 闭环口径的生效日期 = 当前选定日报的单日（结果缓存 key 也随之单日化）
        // v4.14：按任意日期集合建明细索引（原 clDataIndex 逻辑参数化，闭环默认走单日游标不变）
        // 闭环原入口：日期来源 = 日报游标单日（行为不变）

        // ---------- 筛选范围：大区 / 小区 / 门店多选 ----------
        // 门店多选（v4.7 层级筛选语义）：null = 未单独勾选（当前大区/小区范围内全部门店生效，胶囊不点亮），数组 = 显式勾选（[] = 显式清空）

        // ---------- 人员得分点（真实 / 模拟共用结构）----------
        // 模拟岗位：按规则表的拿分项与封顶，为选中的每家专营店生成 1 名模拟人员（确定性随机）
        // 当前岗位 + 组织范围下的人员得分点（按当日积分降序）
        // ---------- v4.5：闭环图表公共样式（深色主题） ----------
        // v4.6：人员 × 拿分项 得分热力图（单元格值 = 该拿分项达成率 %，标签 = 实际得分）
        // v4.6：当日积分 × 销量四象限（门店 ≤ 8 家按门店着色，否则单系列）
        // v4.6：人员动作积分诊断抽屉（拿分项构成 / 扣分明细 / AI 证据链时间线）


        // v4.6：岗位动作规则视图（拿分项 / 封顶 / 判断逻辑 / 凭证来源 / 采集接入状态）

        // ---------- 统一渲染 ----------


        // ---------- 交互 ----------
        document.querySelectorAll('[data-range]').forEach(function (b) {
            b.addEventListener('click', function () {
                document.querySelectorAll('[data-range]').forEach(function (x) { x.classList.toggle('active', x === b); });
                setRange(parseInt(b.dataset.range, 10));
            });
        });
        // 看板切换器
        document.querySelectorAll('#boardSeg button').forEach(function (b) {
            b.addEventListener('click', function () {
                const next = b.dataset.board;
                if (next === state.board) return;
                // 切换前释放当前看板的图表实例（重要：display:none 容器里的图表不应持有）
                if (state.board === 'overview') {
                    Object.keys(panelCharts).forEach(function (k) { if (panelCharts[k]) panelCharts[k].dispose(); delete panelCharts[k]; });
                    Object.keys(extCharts).forEach(function (k) { if (extCharts[k]) { extCharts[k].dispose(); delete extCharts[k]; } });
                } else {
                    ['closureScatter', 'clHeat', 'clQuad'].forEach(function (k) {
                        if (extCharts[k]) { try { extCharts[k].dispose(); } catch (_) {} delete extCharts[k]; }
                    });
                }
                state.board = next;
                renderAll();
                // 给浏览器一个 layout 周期再 resize 新看板的图
                requestAnimationFrame(function () {
                    if (state.board === 'closure') {
                        ['clHeat', 'clQuad'].forEach(function (k) { const c = extCharts[k]; if (c) { try { c.resize(); } catch (_) {} } });
                    } else {
                        Object.values(extCharts).forEach(function (c) { c.resize(); });
                    }
                });
            });
        });
        // 闭环看板交互（事件委托，#boardClosure 内 innerHTML 每次 renderClosure 都替换）
        document.getElementById('boardClosure').addEventListener('click', function (e) {
            const postEl = e.target.closest('[data-post]');
            if (postEl) {
                state.closure.postKey = postEl.dataset.post;
                // v4.7：切换岗位保留当前门店勾选（此前重置为 null = 全选，造成"点岗位全部门店被勾选"的错觉）
                renderClosure(); return;
            }
            const ruleBtn = e.target.closest('[data-cl-rule]');
            if (ruleBtn) {
                if (ruleBtn.dataset.clRule === 'monthly') state.closure.showMonthly = !state.closure.showMonthly;
                else state.closure.showRules = !state.closure.showRules;
                renderClosure(); return;
            }
            // 门店：多选模式勾选/取消；单选模式点击即切换为该门店（null=未勾选时点击即从单家开始）
            const storeEl = e.target.closest('[data-store]');
            if (storeEl) {
                const code = storeEl.dataset.store;
                const sel = (state.closure.storeCodes || []).slice();
                const i = sel.indexOf(code);
                if (state.closure.storeMulti) {
                    if (i >= 0) sel.splice(i, 1); else sel.push(code);
                } else if (i < 0) {
                    sel.length = 0;
                    sel.push(code);
                }
                state.closure.storeCodes = sel;
                renderClosure(); return;
            }
            const cr = e.target.closest('[data-closure-region]');
            if (cr) {
                const rg = cr.dataset.closureRegion || null;
                if (rg !== state.closure.region) {
                    state.closure.region = rg;
                    state.closure.area = null;
                    state.closure.storeCodes = null;
                }
                renderClosure(); return;
            }
            const ca = e.target.closest('[data-closure-area]');
            if (ca) {
                const ar = ca.dataset.closureArea || null;
                if (ar !== state.closure.area) {
                    state.closure.area = ar;
                    state.closure.storeCodes = null;
                }
                renderClosure(); return;
            }
            const sa = e.target.closest('[data-store-action]');
            if (sa) {
                const act = sa.dataset.storeAction;
                if (act === 'multi') {
                    // 切换多选；关闭时若已显式勾选多家则保留第一家，回到单选语义
                    state.closure.storeMulti = !state.closure.storeMulti;
                    const cur = state.closure.storeCodes;
                    if (!state.closure.storeMulti && cur && cur.length > 1) state.closure.storeCodes = [cur[0]];
                }
                else if (act === 'all') state.closure.storeCodes = null; // v4.7：全部生效 = 清除显式勾选（胶囊熄灭，范围内全部门店参与统计）
                else if (act === 'clear') state.closure.storeCodes = [];
                else if (act === 'search-apply' || act === 'search-clear') {
                    const inp = document.getElementById('clStoreSearch');
                    if (!inp) return;
                    state.closure.storeSearch = act === 'search-clear' ? '' : inp.value;
                    renderClosure();
                    const nx = document.getElementById('clStoreSearch');
                    if (nx && act === 'search-apply') { nx.focus(); }
                    return;
                }
                renderClosure();
                return;
            }
            const pdEl = e.target.closest('[data-person-detail]');
            if (pdEl) { clOpenDrawer(+pdEl.dataset.personDetail); return; }
        });
        // 门店搜索 v4.7：输入与过滤解耦——输入时不再打断重渲染，按回车 / 「搜索」按钮才过滤
        (function () {
            const bc = document.getElementById('boardClosure');
            if (!bc) return;
            bc.addEventListener('keydown', function (e) {
                const t = e.target;
                if (!t || t.id !== 'clStoreSearch') return;
                if (e.key === 'Enter') { e.preventDefault(); state.closure.storeSearch = t.value; renderClosure(); }
            });
            bc.addEventListener('input', function (e) {
                const t = e.target;
                if (t && t.id === 'clStoreSearch') state.closure.storeSearch = t.value;
            });
        })();
        // v4.8：日报翻阅器交互（◀ / ▶ / 日期下拉）——仅改闭环游标，经营总览取数不受影响
        (function () {
            const bc = document.getElementById('boardClosure');
            if (!bc) return;
            bc.addEventListener('click', function (e) {
                const b = e.target.closest('[data-cl-pager]');
                if (!b || b.disabled) return;
                clShiftDaily(b.dataset.clPager === 'next' ? 1 : -1);
            });
            bc.addEventListener('change', function (e) {
                const t = e.target;
                if (t && t.id === 'clDateSelect') { state.clDate = t.value; renderAll(); }
            });
        })();
        // v4.5：诊断抽屉关闭（遮罩 / ✕ / Esc）
        (function () {
            const d = document.getElementById('clDrawer');
            if (!d) return;
            d.addEventListener('click', function (e) { if (e.target.closest('[data-cl-close]')) clCloseDrawer(); });
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape') clCloseDrawer(); });
        })();
        // v4.15：晨会 / 夕会报表抽屉关闭（遮罩 / ✕ / Esc；无图表，无需 dispose）
        (function () {
            const d = document.getElementById('meetDrawer');
            if (!d) return;
            d.addEventListener('click', function (e) { if (e.target.closest('[data-meet-close]')) d.classList.add('hidden'); });
            document.addEventListener('keydown', function (e) { if (e.key === 'Escape') d.classList.add('hidden'); });
        })();
        document.getElementById('applyBtn').addEventListener('click', function () {
            if (!$start.value || !$end.value || $start.value > $end.value) return;
            state.start = $start.value;
            state.end = $end.value;
            state.drillIds = [];
            clearMetricCache();
            renderAll();
        });
        // ---------- 岗位职责说明表（v4.11：页面最下方，默认收起，可展开/收起） ----------
        (function () {
            const btn = document.getElementById('dutyToggle');
            const body = document.getElementById('dutyBody');
            if (!btn || !body) return;
            let open = false;
            function apply() {
                body.classList.toggle('hidden', !open);
                btn.textContent = open ? '收起岗位职责 ▴' : '展开岗位职责 ▾';
                btn.classList.toggle('active', open);
            }
            renderDutyTable();
            btn.addEventListener('click', function () { open = !open; apply(); });
            apply();
        })();
        $selRegion.addEventListener('change', function () {
            state.sel.region = $selRegion.value; state.sel.area = '__all__'; state.sel.store = '__all__';
            state.sel.post = '__all__'; state.sel.person = '__all__';
            state.drillIds = []; state.pkIds = []; state.pkBase = null;   // v4.3：范围变化清空 PK 已选，避免跨范围残留
            renderAll();
        });
        $selArea.addEventListener('change', function () {
            state.sel.area = $selArea.value; state.sel.store = '__all__';
            state.sel.post = '__all__'; state.sel.person = '__all__';
            if (state.sel.area !== '__all__') backfillAncestors(nodeById(state.sel.area));   // 自动勾上所属大区
            state.drillIds = []; state.pkIds = []; state.pkBase = null;
            renderAll();
        });
        $selStore.addEventListener('change', function () {
            state.sel.store = $selStore.value;
            state.sel.post = '__all__'; state.sel.person = '__all__';
            if (state.sel.store !== '__all__') backfillAncestors(nodeById(state.sel.store)); // 自动勾上所属小区/大区
            state.drillIds = [];
            state.pkIds = []; state.pkBase = null;
            // 空岗容错：门店切换后若原岗位在目标门店不存在，给出提示
            renderAll();
        });
        $selPost.addEventListener('change', function () {
            if ($selPost.value.indexOf('__none__') === 0) { $selPost.value = '__all__'; }
            state.sel.post = $selPost.value;
            state.sel.person = '__all__';
            state.drillIds = []; state.pkIds = []; state.pkBase = null;
            renderAll();
        });
        $selPerson.addEventListener('change', function () {
            state.sel.person = $selPerson.value;
            state.drillIds = []; state.pkIds = []; state.pkBase = null;
            renderAll();
        });
        document.getElementById('orgReset').addEventListener('click', function () {
            state.sel = { region: '__all__', area: '__all__', store: '__all__', post: '__all__', person: '__all__' };
            state.drillIds = [];
            state.pkIds = []; state.pkBase = null;
            renderAll();
        });
        // v4：「显示已停用」开关（仅 API 模式）—— 重新拉取组织树后刷新下拉/榜单，保持已选日期区间
        // 树结构变化后清理指向已隐藏节点的选中项，避免选中项静默失效
        if ($showInactive) {
            $showInactive.addEventListener('change', function () {
                showInactive = !!$showInactive.checked;
                if ($showInactiveWrap) $showInactiveWrap.classList.toggle('on', showInactive);
                if (DATA_MODE !== 'api') { renderAll(); return; }   // mock 演示模式无停用节点
                apiLoading(true, showInactive ? '正在加载已停用节点…' : '正在隐藏已停用节点…');
                clearApiCaches();
                loadOrgTree().then(function () {
                    reindexTree();
                    sanitizeSelection();
                    apiLoading(false);
                    renderAll();
                }).catch(apiError);
            });
        }
        // 单选视图：板块展开 / 收起、指标勾选（至少保留 1 项）
        document.getElementById('singleView').addEventListener('click', function (e) {
            const eb = e.target.closest('[data-expand]');
            if (eb) {
                const gi = parseInt(eb.dataset.expand, 10);
                state.expanded[gi] = !state.expanded[gi];
                renderSingleView();
                return;
            }
            const ab = e.target.closest('[data-all]');
            if (ab) {
                const gi = parseInt(ab.dataset.all, 10);
                state.panelSel[gi] = MODULE_GROUPS[gi].keys.slice();
                renderSingleView();
                return;
            }
            const chip = e.target.closest('[data-chip]');
            if (chip) {
                const gi = parseInt(chip.dataset.g, 10);
                const k = chip.dataset.chip;
                const cur = (state.panelSel[gi] || MODULE_GROUPS[gi].keys.slice()).slice();
                const idx = cur.indexOf(k);
                if (idx >= 0) {
                    if (cur.length <= 1) return;
                    cur.splice(idx, 1);
                } else {
                    cur.push(k);
                }
                state.panelSel[gi] = cur;
                renderSingleView();
            }
        });
        document.querySelectorAll('#modeSeg button').forEach(function (b) {
            b.addEventListener('click', function () {
                document.querySelectorAll('#modeSeg button').forEach(function (x) { x.classList.toggle('active', x === b); });
                state.mode = b.dataset.mode;
                if (state.mode === 'single') {
                    state.drillIds = [];
                } else if (!state.pkIds.length) {
                    // 进入 PK 模式时，默认预选当前范围内该层级的前 2 个候选（岗位层级=当前对比岗位在各门店）
                    const list = pkCandidates();
                    state.pkIds = list.slice(0, 2).map(function (n) { return n.id; });
                    state.pkBase = state.pkIds[0] || null;
                }
                renderAll();
            });
        });
        document.getElementById('pkLevel').addEventListener('change', function (e) {
            state.pkLevel = e.target.value;
            state.pkIds = [];
            state.pkBase = null;
            renderAll();
        });
        // v4.3：岗位 PK 的二级岗位选项卡（跨店同岗对比）
        document.getElementById('pkPostTabs').addEventListener('click', function (e) {
            const b = e.target.closest('[data-pk-post]');
            if (!b || b.dataset.pkPost === state.pkPost) return;
            state.pkPost = b.dataset.pkPost;
            state.pkIds = [];
            state.pkBase = null;
            renderAll();
        });
        document.getElementById('pkClear').addEventListener('click', function () {
            state.pkIds = [];
            state.pkBase = null;
            renderAll();
        });
        document.getElementById('drillBack').addEventListener('click', function () {
            if (state.mode === 'pk') return;
            // v4.16：回退后同步放宽顶栏组织范围（下钻到哪层筛选跟到哪层，双向一致）
            if (state.drillIds.length) {
                state.drillSelectedId = null; state.drillPersonId = null;
                state.drillIds.pop();
                if (state.drillIds.length) {
                    const t = nodeById(state.drillIds[state.drillIds.length - 1]);
                    if (t) syncSelToDrill(t);   // 栈内还有层级：筛选放宽到新的下钻层级
                } else {
                    // 栈已空：基点回到顶栏筛选最深层（上次下钻已同步进 sel），再回退一层筛选
                    const i0 = drillDeepestSelIdx();
                    if (i0 >= 0) {
                        const s0 = Object.assign({}, state.sel);
                        for (let i = i0; i < SEL_ORDER.length; i++) s0[SEL_ORDER[i]] = '__all__';
                        state.sel = s0;
                    }
                }
                renderAll(); return;
            }
            // 下钻栈为空：当前视图基点 = 顶栏筛选的最深节点，回退一层筛选（人员→岗位→门店→小区→大区→全国）
            const idx = drillDeepestSelIdx();
            if (idx < 0) return;   // 已在全国视图，无上级可返回
            const sel2 = Object.assign({}, state.sel);
            for (let i = idx; i < SEL_ORDER.length; i++) sel2[SEL_ORDER[i]] = '__all__';
            state.sel = sel2;
            state.drillIds = [];
            state.drillSelectedId = null;
            state.drillPersonId = null;
            state.pkIds = []; state.pkBase = null;   // 范围变化清空 PK 已选，与筛选下拉行为一致
            renderAll();
        });
        document.querySelectorAll('[data-trend]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.trendMode = b.dataset.trend;
                document.querySelectorAll('[data-trend]').forEach(function (x) { x.classList.toggle('active', x === b); });
                renderTrend();
            });
        });
        // 经营结果趋势分析指标多选胶囊（最多 4 项，至少 1 项）
        document.getElementById('trendChips').addEventListener('click', function (e) {
            const metricChip = e.target.closest('[data-trend-metric]');
            const normChip = e.target.closest('[data-trend-norm]');
            if (normChip) {
                state.trendNorm = !state._trendNormEff;
                renderTrend();
                return;
            }
            if (!metricChip) return;
            const k = metricChip.dataset.trendMetric;
            const cur = state.trendMetrics.slice();
            const idx = cur.indexOf(k);
            if (idx >= 0) {
                if (cur.length <= 1) return;
                cur.splice(idx, 1);
            } else {
                if (cur.length >= 4) cur.shift();
                cur.push(k);
            }
            state.trendMetrics = cur;
            renderTrend();
        });
        document.querySelectorAll('[data-rank]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.pointsRank = b.dataset.rank;
                document.querySelectorAll('[data-rank]').forEach(function (x) { x.classList.toggle('active', x === b); });
                renderPoints();
            });
        });

        // v4.4：顶栏筛选区可一键收起/展开（折叠状态持久化）
        (function initFilterToggle() {
            const $body = document.getElementById('filterBody');
            const $btn = document.getElementById('filterToggle');
            const $txt = document.getElementById('filterToggleText');
            if (!$body || !$btn || !$txt) return;
            const KEY = 'dash_filter_collapsed';
            let collapsed = false;
            try { collapsed = localStorage.getItem(KEY) === '1'; } catch (e) { /* 隐私模式忽略 */ }
            function apply() {
                $body.classList.toggle('hidden', collapsed);
                $txt.textContent = collapsed ? '展开筛选 ▾' : '收起筛选 ▴';
            }
            $btn.addEventListener('click', function () {
                collapsed = !collapsed;
                try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
                apply();
            });
            apply();
        })();
        document.querySelectorAll('[data-table]').forEach(function (b) {
            b.addEventListener('click', function () {
                state.tableDim = b.dataset.table;
                document.querySelectorAll('[data-table]').forEach(function (x) { x.classList.toggle('active', x === b); });
                renderDetail();
            });
        });
        document.getElementById('funnelBody').addEventListener('click', function (e) {
            const row = e.target.closest('.funnel-row');
            if (!row) return;
            const key = row.dataset.key;
            document.getElementById('drillPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
            renderDrill();
        });
        document.getElementById('funnelDrillLink').addEventListener('click', function () {
            document.getElementById('drillPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        setInterval(updateTime, 1000);
        updateTime();
        window.addEventListener('resize', function () {
            // 跳过不可见容器里的图表（display:none 时 offsetParent 为 null）
            Object.values(extCharts).forEach(function (c) { if (c && c.getDom && c.getDom() && c.getDom().offsetParent !== null) c.resize(); });
            Object.values(panelCharts).forEach(function (c) { if (c && c.getDom && c.getDom() && c.getDom().offsetParent !== null) c.resize(); });
        });

        // 初始
        initOrgSelDefaults();   // v5.2：按登录者层级预勾组织筛选（员工→本人 / 店长→门店 / 主管→小区 / 总监→大区）
        setRange(7);
        }
