// 业务数据看板 v5.12 — 经营总览渲染（P3-4 拆分，依赖 app_state）

        function renderSingleView() {
            const r = currentIdx(), pr = prevRange();
            const node = currentNode();
            const m = metricsOf(node, r[0], r[1]);
            const pm = metricsOf(node, pr.i0, pr.i1);

            // 重绘前释放已展开的折线图实例
            Object.keys(panelCharts).forEach(function (k) { if (panelCharts[k]) panelCharts[k].dispose(); delete panelCharts[k]; });

            // 总览条（3 列 × 2 行）
            const ovItems = [
                { k: 'leads', label: '线索量', unit: '条' },
                { k: 'arrivals', label: '到店量', unit: '人' },
                { k: 'locked', label: '锁单量', unit: '单' },
                { k: 'delivered', label: '交付量', unit: '辆' },
                { rate: 'l2a', label: '线索到店率' },
                { rate: 'conv', label: '线索转化率' }
            ];
            const ovHTML = ovItems.map(function (it, i) {
                if (it.rate === 'l2a') {
                    const cur = m.leads ? m.arrivals / m.leads * 100 : 0;
                    const pv = pm.leads ? pm.arrivals / pm.leads * 100 : 0;
                    return ovCell(it.label, cur.toFixed(1) + '%', (cur - pv >= 0 ? '+' : '') + (cur - pv).toFixed(1) + 'pt', cur - pv >= 0);
                }
                if (it.rate === 'conv') {
                    const cur = m.leads ? m.delivered / m.leads * 100 : 0;
                    const pv = pm.leads ? pm.delivered / pm.leads * 100 : 0;
                    return ovCell(it.label, cur.toFixed(1) + '%', (cur - pv >= 0 ? '+' : '') + (cur - pv).toFixed(1) + 'pt', cur - pv >= 0);
                }
                const d = pct(m[it.k], pm[it.k]);
                return ovCell(it.label, fmt(m[it.k]) + ' ' + it.unit, (d >= 0 ? '↑ ' : '↓ ') + Math.abs(d).toFixed(1) + '%', d >= 0);
            }).join('');

            // 三大模块（支持各自展开为随时间变化的折线图）
            const blocks = MODULE_GROUPS.map(function (g, gi) {
                const expanded = !!state.expanded[gi];
                if (!state.panelSel[gi] || !state.panelSel[gi].length) state.panelSel[gi] = g.keys.slice();
                let body;
                if (expanded) {
                    const chips = g.keys.map(function (k) {
                        const on = state.panelSel[gi].indexOf(k) >= 0;
                        return '<span class="metric-chip' + (on ? ' on' : '') + '" data-chip="' + k + '" data-g="' + gi + '">' +
                            '<span class="mc-dot" style="background:' + METRIC_COLOR[k] + '"></span>' + METRIC_LABEL[k] + '</span>';
                    }).join('');
                    const allOn = state.panelSel[gi].length === g.keys.length;
                    body = '<div class="panel-chips">' + chips +
                        (allOn ? '' : '<span class="mchip-all" data-all="' + gi + '">全选</span>') + '</div>' +
                        '<div class="panel-chart" id="svChart' + gi + '"></div>';
                } else {
                    const cards = g.keys.map(function (k) { return cardHTML(k, 'sv_'); }).join('');
                    const cols = g.keys.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-4';
                    body = '<div class="grid ' + cols + ' gap-4">' + cards + '</div>';
                }
                return '<section class="panel p-6">' +
                    '<div class="flex items-center justify-between mb-4 gap-3 flex-wrap">' +
                    '<div class="panel-title"><span class="dot"></span>' + g.title + '</div>' +
                    '<div class="flex items-center gap-3">' +
                    '<div class="text-xs text-slate-400" id="svSub' + gi + '"></div>' +
                    '<button class="expand-btn" data-expand="' + gi + '">' + (expanded ? '收起 ▲' : '展开时间轴 ▼') + '</button>' +
                    '</div></div>' + body + '</section>';
            }).join('');

            document.getElementById('singleView').innerHTML =
                '<div class="overview-bar">' + ovHTML + '</div>' + blocks;

            // 填充数值
            MODULE_GROUPS.forEach(function (g) {
                g.keys.forEach(function (k) {
                    const id = 'sv_' + k;
                    const cur = m[k], prev = pm[k];
                    const d = pct(cur, prev);
                    const vel = document.getElementById(id + '_v');
                    if (vel) vel.innerHTML = fmt(cur) + '<span class="metric-unit">' + METRIC_UNIT[k] + '</span>';
                    const del = document.getElementById(id + '_d');
                    if (del) {
                        del.className = 'chip ' + (d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat');
                        del.textContent = (d > 0.5 ? '↑ ' : d < -0.5 ? '↓ ' : '→ ') + Math.abs(d).toFixed(1) + '%';
                    }
                    const rel = document.getElementById(id + '_r');
                    if (rel) {
                        const chain = RATIO_CHAIN.filter(function (p) { return p[0] === k; })[0];
                        if (chain) {
                            const base = m[chain[1]];
                            const rate = base ? (cur / base) * 100 : 0;
                            rel.textContent = '相对' + METRIC_LABEL[chain[1]] + ' ' + rate.toFixed(1) + '%';
                        } else {
                            rel.textContent = '';
                        }
                    }
                });
            });
            MODULE_GROUPS.forEach(function (g, gi) {
                const el = document.getElementById('svSub' + gi);
                if (el) el.textContent = node.name + ' · ' + g.keys.length + ' 项指标';
            });
            // 展开板块的按日折线图
            MODULE_GROUPS.forEach(function (g, gi) {
                if (state.expanded[gi]) renderPanelChart(gi);
            });
        }
        function ovCell(label, value, deltaText, up) {
            return '<div class="overview-item"><div class="label">' + label + '</div>' +
                '<div class="value">' + value + '</div>' +
                '<div class="delta ' + (up ? 'text-emerald-400' : 'text-rose-400') + '">' + deltaText + '</div></div>';
        }
        const PK_PALETTE = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        function pkColorOf(node) {
            const i = state.pkIds.indexOf(node.id);
            return PK_PALETTE[(i >= 0 ? i : 0) % PK_PALETTE.length];
        }
        function pkRows() {
            // 动态生成 PK 行：硬编码部分 + 按 POSTS 顺序展开岗位行（空缺岗位显示 —）
            const rows = [
                { group: '核心指标' },
                { label: '线索量', key: 'leads', unit: '条' },
                { label: '到店量', key: 'arrivals', unit: '人' },
                { label: '锁单量', key: 'locked', unit: '单' },
                { label: '交付量', key: 'delivered', unit: '辆' },
                { label: '积分', key: 'points', unit: '分' },
                { group: '效率指标（比率按分子 / 分母重算，不做平均）' },
                { label: '线索到店率', ratio: ['arrivals', 'leads'] },
                { label: '线索转化率', ratio: ['delivered', 'leads'] },
                { label: '有效率', ratio: ['validLeads', 'leads'] },
                { label: '锁单率', ratio: ['locked', 'opportunities'] },
                { label: '交付率', ratio: ['delivered', 'locked'] },
                { group: '入口环节' },
                { label: '有效线索', key: 'validLeads', unit: '条' },
                { label: '意向线索', key: 'intentLeads', unit: '条' },
                { label: '邀约排程', key: 'invites', unit: '次' },
                { group: '到店环节' },
                { label: '有效试驾', key: 'testDrives', unit: '人' },
                { label: '试驾点评数', key: 'testReviews', unit: '条' },
                { label: '二次回访', key: 'returnVisits', unit: '人' },
                { group: '结果环节' },
                { label: '商机量', key: 'opportunities', unit: '个' },
                { group: '岗位构成 · 线索量（空缺岗位显示 —）' }
            ];
            POSTS.forEach(function (p) {
                rows.push({ label: p.name, post: p.key, unit: '条' });
            });
            rows.push({ group: '环比（各对象各自对比上一等长周期）' });
            rows.push({ label: '线索量环比', mom: 'leads' });
            rows.push({ label: '到店量环比', mom: 'arrivals' });
            rows.push({ label: '锁单量环比', mom: 'locked' });
            rows.push({ label: '交付量环比', mom: 'delivered' });
            return rows;
        }
        function pkRowValue(node, row, r, pr) {
            const m = metricsOf(node, r[0], r[1]);
            if (row.key) return m[row.key];
            if (row.ratio) {
                const base = m[row.ratio[1]];
                return base ? (m[row.ratio[0]] / base) * 100 : 0;
            }
            if (row.post) {
                const p = node.children.filter(function (c) { return c.postKey === row.post; })[0];
                if (!p) return null; // 空岗：显示 —，不参与排名与差值
                return metricsOf(p, r[0], r[1]).leads;
            }
            if (row.mom) {
                const pm = metricsOf(node, pr.i0, pr.i1);
                return pct(m[row.mom], pm[row.mom]);
            }
            return null;
        }
        function rowText(row, v) {
            if (v === null || v === undefined) return '—';
            if (row.ratio) return v.toFixed(1) + '%';
            if (row.mom) return fmtSigned(v, 1) + '%';
            return fmt(v);
        }
        function renderPkView() {
            const el = document.getElementById('pkView');
            const nodes = pkNodes();
            if (nodes.length < 2) {
                el.innerHTML = '<div class="panel p-12 text-center">' +
                    '<div class="text-slate-300 font-medium mb-2">PK 模式已开启 · 尚未完成选择</div>' +
                    '<div class="text-sm text-slate-500">请在上方「PK 层级」中勾选 2 ~ 6 个同级对象开始横向比较（例如门店比较）。<br/>PK 模式下不显示任何合计值，仅做并列对比。</div></div>';
                return;
            }
            const r = currentIdx(), pr = prevRange();
            const base = pkBaseNode();
            const head = '<tr><th>指标</th>' + nodes.map(function (n) {
                const isBase = base && n.id === base.id;
                return '<th class="base-badge" data-base="' + n.id + '" title="点击设为基准对象">' +
                    '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + pkColorOf(n) + ';margin-right:6px"></span>' +
                    n.name + (isBase ? '<span style="color:#93c5fd;font-weight:700"> ★基准</span>' : '') + '</th>';
            }).join('') + '</tr>';

            let body = '';
            pkRows().forEach(function (row) {
                if (row.group) {
                    body += '<tr class="group-row"><td colspan="' + (nodes.length + 1) + '">' + row.group + '</td></tr>';
                    return;
                }
                const vals = nodes.map(function (n) { return pkRowValue(n, row, r, pr); });
                const valid = vals.filter(function (v) { return v !== null; });
                const max = valid.length > 1 ? Math.max.apply(null, valid) : null;
                const min = valid.length > 1 ? Math.min.apply(null, valid) : null;
                const baseVal = base ? pkRowValue(base, row, r, pr) : null;

                body += '<tr><td>' + row.label + (row.unit ? ' <span class="text-slate-600">(' + row.unit + ')</span>' : '') + '</td>';
                vals.forEach(function (v, i) {
                    if (v === null) { body += '<td class="na">—<span class="diff">无此岗位</span></td>'; return; }
                    let cls = '';
                    if (max !== null && v === max) cls = 'best';
                    else if (min !== null && v === min) cls = 'worst';
                    let diff = '';
                    if (baseVal !== null && nodes[i].id !== (base ? base.id : '')) {
                        if (row.ratio || row.mom) {
                            const d = v - baseVal;
                            diff = '<span class="diff">' + fmtSigned(d, 1) + 'pt</span>';
                        } else {
                            const d = v - baseVal;
                            const dp = baseVal ? (d / baseVal) * 100 : 0;
                            diff = '<span class="diff">' + fmtSigned(d, 0) + ' / ' + fmtSigned(dp, 1) + '%</span>';
                        }
                    }
                    body += '<td class="' + cls + '">' + rowText(row, v) + diff + '</td>';
                });
                body += '</tr>';
            });
            el.innerHTML = '<div class="panel p-6">' +
                '<div class="flex items-center justify-between mb-1 flex-wrap gap-3">' +
                '<div><div class="panel-title"><span class="dot"></span>横向 PK 对比</div>' +
                '<div class="panel-subtitle">' + state.pkLevel + '层级 · ' + nodes.length + ' 个对象 · 同一时间区间 · 绿色为最优、红色为最差、— 表示该岗位不存在</div></div>' +
                '<div class="text-xs text-slate-400">点击表头可切换基准对象</div></div>' +
                '<div class="mt-4 overflow-auto" style="max-height:760px"><table class="cmp-table">' +
                '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>';
            el.querySelectorAll('[data-base]').forEach(function (th) {
                th.addEventListener('click', function () {
                    state.pkBase = th.dataset.base;
                    renderAll();
                });
            });
        }
        function renderFunnel() {
            const r = currentIdx(), pr = prevRange();
            const body = document.getElementById('funnelBody');
            const footer = document.getElementById('funnelFooter');
            const sub = document.getElementById('funnelSub');

            if (state.mode === 'single') {
                const node = currentNode();
                const m = metricsOf(node, r[0], r[1]);
                const first = m[FUNNEL_STAGES[0].key] || 0;
                sub.textContent = FUNNEL_STAGES.length + ' 阶段 · ' + node.name + ' · 区间合计';
                let worst = null;
                // v5.12：右侧百分比统一改为「意向线索 → 本层」的累计转化率（以意向线索为基准）
                body.innerHTML = FUNNEL_STAGES.map(function (st, i) {
                    const v = m[st.key];
                    const prevV = i === 0 ? v : m[FUNNEL_STAGES[i - 1].key];
                    const stepRate = prevV ? (v / prevV) * 100 : 100;
                    const cumRate = first ? (v / first) * 100 : 100;
                    if (i > 0 && (worst === null || stepRate < worst.rate)) worst = { rate: stepRate, from: FUNNEL_STAGES[i - 1].name, to: st.name };
                    const w = Math.max(10, Math.min(100, cumRate));
                    const rateClass = i === 0 ? 'ghost' : (cumRate < 10 ? 'warn' : '');
                    const rateText = i === 0 ? '基准' : cumRate.toFixed(1) + '%';
                    return '<div class="funnel-row" data-key="' + st.key + '" style="--w:' + w + '%;--fc:' + st.color + '" title="' + st.name + '：' + fmt(v) + '（意向线索→' + st.name + ' ' + cumRate.toFixed(1) + '%' + (i > 0 ? '，上一层→本层 ' + stepRate.toFixed(1) + '%' : '') + '）">' +
                        '<div class="fr-track">' +
                        '<div class="fr-bar">' +
                        '<div class="fr-inner">' +
                        '<span class="fr-name">' + st.name + '</span>' +
                        '<span class="fr-value">' + fmt(v) + '</span>' +
                        '</div></div></div>' +
                        '<div class="fr-rate ' + rateClass + '">' + rateText + '</div>' +
                        '</div>';
                }).join('');
                const conv = first ? (m.delivered / first) * 100 : 0;
                footer.innerHTML =
                    '<div class="flex items-center justify-between"><span class="text-slate-400">整体转化率（意向线索 → 交付）</span>' +
                    '<span class="text-white font-bold">' + conv.toFixed(2) + '%</span></div>' +
                    (worst ? '<div class="flex items-center justify-between"><span class="text-slate-400">最大流失环节</span>' +
                        '<span class="text-rose-400 font-medium">' + worst.from + ' → ' + worst.to + '（' + worst.rate.toFixed(1) + '%）</span></div>' : '') +
                    '<div class="flex items-center justify-between"><span class="text-slate-400">线索量</span>' +
                    '<span class="text-slate-200">意向线索 ' + fmt(first) + ' 条 → 交付 ' + fmt(m.delivered) + ' 辆</span></div>' +
                    (m.delivered < 5 ? '<div class="text-[11px] text-amber-300/80 pt-1 leading-relaxed">当前范围样本较小（交付 ' + fmt(m.delivered) +
                        ' 辆），深层指标会出现 0 值，建议放宽时间区间或组织范围后再看转化率</div>' : '');
            } else {
                const nodes = pkNodes();
                sub.textContent = FUNNEL_STAGES.length + ' 阶段 · PK 并列对比';
                if (nodes.length < 2) {
                    body.innerHTML = '<div class="text-sm text-slate-500 py-6 text-center">请先在上方勾选 2 ~ 6 个对象</div>';
                    footer.innerHTML = '';
                    return;
                }
                body.innerHTML = FUNNEL_STAGES.map(function (st, i) {
                    const vals = nodes.map(function (n) { return metricsOf(n, r[0], r[1])[st.key]; });
                    const max = Math.max.apply(null, vals) || 1;
                    const min = Math.min.apply(null, vals);
                    const bars = vals.map(function (v, bi) {
                        const h = Math.max(6, (v / max) * 100);
                        return '<div style="flex:1;height:' + h + '%;background:' + pkColorOf(nodes[bi]) + ';border-radius:2px 2px 0 0" title="' + nodes[bi].name + '：' + fmt(v) + '"></div>';
                    }).join('');
                    return '<div class="funnel-row pk-funnel-row" data-key="' + st.key + '" style="flex-direction:column;align-items:stretch;gap:4px">' +
                        '<div class="flex items-center justify-between">' +
                        '<span class="fr-name">' + (i + 1) + '. ' + st.name + '</span>' +
                        '<span class="fr-sub">最高 ' + fmt(max) + ' / 最低 ' + fmt(min) + '</span></div>' +
                        '<div style="display:flex;align-items:flex-end;gap:3px;height:46px">' + bars + '</div></div>';
                }).join('');
                footer.innerHTML = nodes.map(function (n, i) {
                    const m = metricsOf(n, r[0], r[1]);
                    const conv = m.leads ? (m.delivered / m.leads) * 100 : 0;
                    return '<div class="flex items-center justify-between gap-2">' +
                        '<span class="flex items-center gap-2 text-slate-400 truncate"><span style="width:8px;height:8px;border-radius:2px;background:' + pkColorOf(n) + ';display:inline-block"></span>' + n.name + '</span>' +
                        '<span class="text-slate-200 font-medium whitespace-nowrap">' + conv.toFixed(2) + '%</span></div>';
                }).join('');
            }
        }
        const extCharts = {};
        function chart(id) {
            const el = document.getElementById(id);
            if (!el) return null;
            if (!extCharts[id]) extCharts[id] = echarts.init(el);
            return extCharts[id];
        }
        const AXIS_STYLE = {
            axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
            axisTick: { show: false },
            axisLabel: { color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }
        };
        const TOOLTIP_STYLE = {
            backgroundColor: 'rgba(11,18,32,0.95)',
            borderColor: 'rgba(148,163,184,0.2)',
            textStyle: { color: '#e2e8f0', fontSize: 12 }
        };
        function renderPanelChart(gi) {
            const g = MODULE_GROUPS[gi];
            const el = document.getElementById('svChart' + gi);
            if (!el) return;
            const cid = 'svChart' + gi;
            if (panelCharts[cid]) { panelCharts[cid].dispose(); delete panelCharts[cid]; }
            const c = echarts.init(el);
            panelCharts[cid] = c;

            const node = currentNode();
            const r = currentIdx();
            const sel = (state.panelSel[gi] && state.panelSel[gi].length) ? state.panelSel[gi] : g.keys.slice();
            const span = r[1] - r[0] + 1;
            const step = Math.max(1, Math.ceil(span / 90));
            const xs = [], idxs = [];
            for (let i = r[0]; i <= r[1]; i += step) {
                idxs.push(i);
                xs.push(dateStr(new Date(START_DATE.getTime() + i * ONE_DAY)).slice(5));
            }
            c.setOption({
                grid: { left: 10, right: 24, top: 44, bottom: 6, containLabel: true },
                legend: {
                    data: sel.map(function (k) { return METRIC_LABEL[k]; }),
                    textStyle: { color: '#94a3b8', fontSize: 12 }, top: 0,
                    icon: 'roundRect', itemWidth: 10, itemHeight: 10
                },
                tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
                xAxis: {
                    type: 'category', data: xs, boundaryGap: false, ...AXIS_STYLE,
                    splitLine: { show: false },
                    axisLabel: { color: '#94a3b8', fontSize: 11, interval: Math.max(0, Math.ceil(xs.length / 14) - 1) }
                },
                yAxis: { type: 'value', ...AXIS_STYLE },
                series: sel.map(function (k) {
                    const color = METRIC_COLOR[k];
                    return {
                        name: METRIC_LABEL[k], type: 'line', smooth: true,
                        symbol: 'circle', symbolSize: 4, showSymbol: xs.length <= 40,
                        data: idxs.map(function (i) { return Math.round(node.series[k][i]); }),
                        lineStyle: { color: color, width: 2 }, itemStyle: { color: color },
                        areaStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: scaleColor(color, 0.28) },
                                { offset: 1, color: scaleColor(color, 0) }
                            ])
                        }
                    };
                })
            }, true);

            const sub = document.getElementById('svSub' + gi);
            if (sub) sub.textContent = node.name + ' · 按日 ' + sel.length + '/' + g.keys.length + ' 项';
        }
        function drillNode() {
            let node = currentNode();
            state.drillIds.forEach(function (id) {
                const n = nodeById(id);
                if (n && nodePath(n).indexOf(node) >= 0) node = n;
            });
            return node;
        }
        function syncSelToDrill(node) {
            if (!node) return;
            const LV = { '大区': 'region', '小区': 'area', '门店': 'store', '岗位': 'post', '人员': 'person' };
            const sel = { region: '__all__', area: '__all__', store: '__all__', post: '__all__', person: '__all__' };
            nodePath(node).forEach(function (n) { if (LV[n.level]) sel[LV[n.level]] = n.id; });
            state.sel = sel;
        }
        function setDrillSelected(id) {
            state.drillSelectedId = id;
            applyListSelection();
        }
        function applyListSelection() {
            const list = document.getElementById('drillList');
            if (!list) return;
            const sel = state.drillSelectedId || '';
            // 兼容列表 button 与矩阵 tr 两种行结构
            list.querySelectorAll('button[data-id], tr[data-id]').forEach(function (el) {
                if (el.dataset.id === sel) {
                    el.classList.add('bg-cyan-500/15', 'ring-1', 'ring-cyan-400/40');
                } else {
                    el.classList.remove('bg-cyan-500/15', 'ring-1', 'ring-cyan-400/40');
                }
            });
        }
        function selectOrDrill(id) {
            if (!id) return;
            if (state.drillSelectedId === id) {
                setDrillSelected(null);
                return;
            }
            setDrillSelected(id);
            const n = nodeById(id);
            // v4.14：人员（叶子节点）也允许下钻 —— 进入该人的区间逐日动作积分完成率表
            const isPersonLeaf = n && n.level === '人员';
            if (n && (n.children.length > 0 || isPersonLeaf)) {
                // 逐级压栈：保留中间层级，便于「返回上级」逐层回退；先裁掉不在当前路径上的残留 id
                const chainIds = nodePath(n).map(function (x) { return x.id; });
                state.drillIds = state.drillIds.filter(function (x) { return chainIds.indexOf(x) >= 0; });
                if (state.drillIds.indexOf(n.id) < 0) state.drillIds.push(n.id);
                syncSelToDrill(n);   // v4.16：每次下钻同步收窄顶栏组织范围（全页看板随下钻范围联动）
                renderAll();
            }
        }
        function renderDrill() {
            const r = currentIdx(), pr = prevRange();
            const bc = document.getElementById('drillBreadcrumb');
            const subEl = document.getElementById('drillSubtitle');

            if (state.mode === 'pk') {
                const nodes = pkNodes();
                if (nodes.length < 2) {
                    bc.innerHTML = '';
                    document.getElementById('drillList').innerHTML = '<div class="text-xs text-slate-500 py-2">PK 模式下请先勾选 2 ~ 6 个对象</div>';
                    subEl.textContent = 'PK 模式 · 展示各对象在所选指标上的下级构成并列';
                    return;
                }
                const level = NEXT_LEVEL[nodes[0].level];
                subEl.textContent = 'PK 模式 · ' + (level || '已到末级') + '构成对比';
                bc.innerHTML = nodes.map(function (n, i) {
                    return '<span class="px-2 py-1 rounded-md" style="background:' + scaleColor(pkColorOf(n), 0.14) + ';color:' + pkColorOf(n) + '">' + n.name + '</span>';
                }).join('<span class="text-slate-600">/</span>');
                const childNames = [];
                if (level) {
                    nodes.forEach(function (n) {
                        n.children.forEach(function (c) { if (childNames.indexOf(c.name) < 0) childNames.push(c.name); });
                    });
                }
                const listEl = document.getElementById('drillList');
                listEl.innerHTML = '<div class="text-xs text-slate-500 py-2">PK 模式下已锁定对比范围，如需单对象下钻请切回单选模式</div>';
                const matrixSubEl = document.getElementById('drillMatrixSub');
                if (matrixSubEl) matrixSubEl.textContent = 'PK 模式 · 矩阵已锁定多对象对比';
                document.getElementById('drillBack').style.opacity = '.45';
                return;
            }

            const cur = drillNode();
            // 渲染期校验 drillSelectedId 是否落在当前 cur.children 范围内，跨层级残留则清空
            const _curChildrenIds = (cur.children || []).map(function (n) { return n.id; });
            if (state.drillSelectedId && _curChildrenIds.indexOf(state.drillSelectedId) < 0) {
                state.drillSelectedId = null;
            }
            // v4.12：人员动作明细展开态同样按当前层级校验，跨层残留则收起
            if (state.drillPersonId && _curChildrenIds.indexOf(state.drillPersonId) < 0) {
                state.drillPersonId = null;
            }
            subEl.textContent = '全国 → 大区 → 小区 → 门店 → 岗位 → 人员 · 点击列表行继续下钻';
            // 岗位 → 人员（含顶栏直接筛到人员）：矩阵切换为「人员 × 关键动作得分率」
            const isDutyLevel = (cur.level === '岗位' || cur.level === '人员');
            const matrixTitleEl = document.getElementById('drillMatrixTitle');
            if (matrixTitleEl) matrixTitleEl.textContent = isDutyLevel ? '关键动作得分率矩阵' : '指标环比矩阵';
            const matrixSubEl = document.getElementById('drillMatrixSub');
            if (matrixSubEl) {
                const pathText = nodePath(cur).map(function (n) { return n.name; }).join(' → ');
                matrixSubEl.textContent = (cur.level === '人员')
                    ? pathText + ' · 已到人员级 · 区间逐日动作积分完成率见下方（完成率 = 当日积分 ÷ 已评估拿分项标准分，日标准得分 = 100%）'
                    : (isDutyLevel
                        ? pathText + ' · 人员 × 关键动作 · 得分率 = 完成量 ÷ 分配任务量 · 环比 = 对比上一等长周期（百分点）· 点击人员行下钻查看逐日积分'
                        : pathText + ' · 按所选范围 · 环比 = 对比上一等长周期 · 点击行继续下钻（至人员级）');
            }
            bc.innerHTML = nodePath(cur).map(function (n, i, arr) {
                const active = i === arr.length - 1;
                return '<button data-idx="' + i + '" class="px-2 py-1 rounded-md transition ' +
                    (active ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:text-white hover:bg-white/5') + '">' + n.name + '</button>';
            }).join('<span class="text-slate-600">/</span>');
            const pathNodes = nodePath(cur);
            bc.querySelectorAll('button').forEach(function (b) {
                b.addEventListener('click', function () {
                    const idx = parseInt(b.dataset.idx, 10);
                    const target = pathNodes[idx];
                    // 点面包屑即跳转对应层级；跳转后清掉左柱图与列表的旧选中，避免视觉残留
                    state.drillSelectedId = null;
                    state.drillPersonId = null;
                    state.drillIds = nodePath(target).slice(1).map(function (n) { return n.id; });
                    syncSelToDrill(target);   // v4.16：面包屑跳转同步放宽顶栏组织范围到该层级
                    renderAll();
                });
            });
            const backBtn = document.getElementById('drillBack');
            // 可返回 = 下钻栈非空（点击行下钻过） 或 顶栏筛选已选到具体层级（可回退一层筛选）
            const canBack = state.drillIds.length > 0 || drillDeepestSelIdx() >= 0;
            backBtn.style.opacity = canBack ? '1' : '.45';
            backBtn.dataset.enabled = canBack ? '1' : '0';

            // 排序：岗位级（人员列表）按综合得分率降序；门店级按积分；其余按线索量（均与各自矩阵首列一致）
            const children = cur.children.slice();
            if (isDutyLevel) {
                children.sort(function (a, b) {
                    const ra = dutyRateOf(a, r[0], r[1]).rate, rb = dutyRateOf(b, r[0], r[1]).rate;
                    return (rb === null ? -1 : rb) - (ra === null ? -1 : ra);
                });
            } else {
                const sortKey = (cur.level === '门店') ? 'points' : 'leads';
                children.sort(function (a, b) {
                    return metricsOf(b, r[0], r[1])[sortKey] - metricsOf(a, r[0], r[1])[sortKey];
                });
            }
            const hasChild = children.length > 0;

            const list = document.getElementById('drillList');
            const dutyDetailEl = document.getElementById('drillDutyDetail');
            if (!isDutyLevel && dutyDetailEl) dutyDetailEl.innerHTML = '';   // 离开岗位级时收起人员动作明细
            // v4.13：进入 renderDrill 时统一清掉四象限容器与图表实例，仅在产品专家岗位分支重新渲染
            const quadEl = document.getElementById('drillPostQuad');
            if (quadEl) quadEl.innerHTML = '';
            clDisposeChart('drillPostQuad');
            if (!hasChild) {
                if (cur.level === '人员') {
                    // v4.14：人员层（含顶栏直接筛到人员 / 从岗位矩阵点击人员行下钻）→ 区间逐日动作积分完成率表
                    renderDrillPersonDaily(cur, r);
                    return;
                }
                list.innerHTML = '<div class="text-xs text-slate-500 py-2">已到达最末级（人员），无下级数据</div>';
                return;
            }
            // 岗位 → 人员：矩阵列切换为该岗位的关键动作（单元格 = 得分率 + 环比）
            if (isDutyLevel) {
                renderDutyMatrix(cur, children, r, pr);
                // v4.13：产品专家额外追加「达成率 × 交付量」四象限散点；其它岗位清空容器 + 销毁图表
                const postKey = cur.postKey || (children[0] && postKeyOfPerson(children[0])) || '';
                if (postKey === 'productExpert') {
                    renderDrillPostQuad(cur, children, r, pr);
                } else {
                    clDisposeChart('drillPostQuad');
                    const quadEl = document.getElementById('drillPostQuad');
                    if (quadEl) quadEl.innerHTML = '';
                }
                return;
            }
            const cols = (cur.level === '门店') ? DRILL_MATRIX_COLS_POST : DRILL_MATRIX_COLS;
            const headHtml = '<tr>' +
                    '<th class="sticky left-0 top-0 z-20 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10" style="min-width:160px">下级</th>' +
                    cols.map(function (col) {
                        return '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10" style="min-width:104px">' +
                            col.label + '</th>';
                    }).join('') + '</tr>';
            const bodyHtml = children.map(function (c, i) {
                const curM = metricsOf(c, r[0], r[1]);
                const prevM = metricsOf(c, pr.i0, pr.i1);
                const cells = cols.map(function (col) {
                    const cell = fmtMatrixCell(curM[col.key] || 0, prevM[col.key] || 0);
                    return '<td class="px-3 py-2.5 text-right whitespace-nowrap border-b border-white/5">' + cell.html + '</td>';
                }).join('');
                const dim = c.status === 0 ? ' style="color:#64748b"' : '';
                // v4.12：岗位行也可下钻（进入人员 × 关键动作得分率）
                const drillable = (c.level === '大区' || c.level === '小区' || c.level === '门店' || c.level === '岗位');
                const rowCls = drillable ? 'cursor-pointer hover:bg-white/5 transition selectOrDrill-row' : '';
                return '<tr data-id="' + c.id + '" data-i="' + i + '" data-drillable="' + (drillable ? '1' : '0') + '" class="' + rowCls + '">' +
                    '<td class="sticky left-0 z-10 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-200 whitespace-nowrap border-b border-white/5"' + dim + '>' +
                    '<div class="flex items-center gap-2"><span class="font-medium">' + c.name + '</span>' +
                    '<span class="text-slate-500 text-[11px]">' + c.level + '</span></div></td>' + cells + '</tr>';
            }).join('');
            list.innerHTML = '<table class="min-w-full border-collapse text-sm">' +
                '<thead>' + headHtml + '</thead>' +
                '<tbody>' + bodyHtml + '</tbody></table>';
            list.querySelectorAll('tr[data-id][data-drillable="1"]').forEach(function (tr) {
                tr.addEventListener('click', function () {
                    selectOrDrill(tr.dataset.id);
                });
            });
            applyListSelection();
        }
        function renderDutyMatrix(postNode, children, r, pr) {
            const list = document.getElementById('drillList');
            const detailEl = document.getElementById('drillDutyDetail');
            if (detailEl) detailEl.innerHTML = '';        // 重绘矩阵时收起旧的人员明细
            const postKey = postNode.postKey || (children[0] && postKeyOfPerson(children[0])) || POSTS[0].key;
            const meta = POSTS_BY_KEY[postKey] || { name: postNode.name, color: '#38bdf8' };
            const actions = dutyActionsOf(postKey);
            const accent = meta.color || '#38bdf8';
            const headHtml = '<tr>' +
                '<th class="sticky left-0 top-0 z-20 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10" style="min-width:150px">人员</th>' +
                '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap border-b border-white/10" style="min-width:112px;color:' + accent + '" title="该人全部关键动作合计：完成量 ÷ 分配任务量">综合得分率</th>' +
                actions.map(function (a) {
                    return '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10" style="min-width:104px" title="' + a.detail + '">' +
                        a.action + '</th>';
                }).join('') + '</tr>';
            const bodyHtml = children.map(function (c, i) {
                const curD = dutyRateOf(c, r[0], r[1]);
                const prevD = dutyRateOf(c, pr.i0, pr.i1);
                const totalCell = fmtRateCell(curD.rate, prevD.rate);
                const cells = curD.items.map(function (it, ai) {
                    const prevRate = prevD.items[ai] ? prevD.items[ai].rate : null;
                    const cell = fmtRateCell(it.rate, prevRate);
                    const tip = it.assign > 0
                        ? it.action + '：完成 ' + it.done + ' / 分配 ' + it.assign
                        : it.action + '：本期无分配任务';
                    return '<td class="px-3 py-2.5 text-right whitespace-nowrap border-b border-white/5" title="' + tip + '">' + cell.html + '</td>';
                }).join('');
                const dim = c.status === 0 ? ' style="color:#64748b"' : '';
                return '<tr data-person-id="' + c.id + '" data-i="' + i + '" class="cursor-pointer hover:bg-white/5 transition">' +
                    '<td class="sticky left-0 z-10 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-200 whitespace-nowrap border-b border-white/5"' + dim + '>' +
                    '<div class="flex items-center gap-2"><span class="font-medium">' + c.name + '</span>' +
                    '<span class="text-slate-500 text-[11px]">完成 ' + curD.totalDone + ' / 分配 ' + curD.totalAssign + '</span></div></td>' +
                    '<td class="px-3 py-2.5 text-right whitespace-nowrap border-b border-white/5">' + totalCell.html + '</td>' +
                    cells + '</tr>';
            }).join('');
            list.innerHTML = '<table class="min-w-full border-collapse text-sm">' +
                '<thead>' + headHtml + '</thead>' +
                '<tbody>' + bodyHtml + '</tbody></table>';
            list.querySelectorAll('tr[data-person-id]').forEach(function (tr) {
                tr.addEventListener('click', function () {
                    // v4.14：点击人员行下钻 → 该人的区间逐日动作积分完成率表（替代旧的行内展开明细）
                    selectOrDrill(tr.dataset.personId);
                });
            });
            applyListSelection();
        }
        function renderDutyPersonDetail() {
            const box = document.getElementById('drillDutyDetail');
            const list = document.getElementById('drillList');
            if (!box) return;
            const id = state.drillPersonId;
            if (list) {
                list.querySelectorAll('tr[data-person-id]').forEach(function (tr) {
                    tr.classList.toggle('bg-cyan-500/10', tr.dataset.personId === id);
                });
            }
            const node = id ? nodeById(id) : null;
            if (!node) { box.innerHTML = ''; return; }
            const r = currentIdx(), pr = prevRange();
            const curD = dutyRateOf(node, r[0], r[1]);
            const prevD = dutyRateOf(node, pr.i0, pr.i1);
            const rows = curD.items.map(function (it, ai) {
                const prevRate = prevD.items[ai] ? prevD.items[ai].rate : null;
                const w = it.rate === null ? 0 : Math.max(2, Math.min(100, it.rate));
                const barColor = it.rate === null ? '#475569'
                    : (it.rate >= 90 ? '#22c55e' : (it.rate >= 75 ? '#38bdf8' : (it.rate >= 60 ? '#f59e0b' : '#ef4444')));
                let deltaHtml = '<span class="text-slate-500">—</span>';
                if (it.rate !== null && prevRate !== null && prevRate !== undefined) {
                    const d = it.rate - prevRate;
                    const color = Math.abs(d) < 0.5 ? '#64748b' : (d > 0 ? '#ef4444' : '#10b981');
                    deltaHtml = '<span style="color:' + color + '">' + (d > 0 ? '↑ +' : (d < 0 ? '↓ ' : '')) + d.toFixed(1) + 'pt</span>';
                }
                return '<div class="flex items-center gap-3 py-1.5">' +
                    '<div class="text-xs text-slate-300 whitespace-nowrap" style="width:96px" title="' + it.detail + '">' + it.action + '</div>' +
                    '<div class="flex-1 h-2 rounded-full" style="background:rgba(148,163,184,0.18)">' +
                        '<div class="h-2 rounded-full" style="width:' + w + '%;background:' + barColor + '"></div></div>' +
                    '<div class="text-xs text-slate-400 whitespace-nowrap" style="width:88px;text-align:right">完成 ' + it.done + ' / 分配 ' + it.assign + '</div>' +
                    '<div class="text-xs font-semibold text-slate-100 whitespace-nowrap" style="width:60px;text-align:right">' + (it.rate === null ? '—' : it.rate.toFixed(1) + '%') + '</div>' +
                    '<div class="text-xs whitespace-nowrap" style="width:66px;text-align:right">' + deltaHtml + '</div>' +
                    '</div>';
            }).join('');
            const totalDelta = (curD.rate !== null && prevD.rate !== null) ? (curD.rate - prevD.rate) : null;
            box.innerHTML = '<div class="rounded-xl p-4" style="background:rgba(15,23,42,0.5);border:1px solid rgba(148,163,184,0.15)">' +
                '<div class="flex items-center justify-between flex-wrap gap-2 mb-2">' +
                    '<div><span class="text-sm text-slate-100 font-medium">' + node.name + ' · 动作得分率明细</span>' +
                    '<span class="text-[11px] text-slate-400 ml-2">' + (node.storeName || '') + ' · ' + (node.postName || '') + '</span></div>' +
                    '<div class="text-[11px] text-slate-400">综合得分率 <b class="text-slate-100">' + (curD.rate === null ? '—' : curD.rate.toFixed(1) + '%') + '</b>' +
                    ' · 完成 ' + curD.totalDone + ' / 分配 ' + curD.totalAssign +
                    (totalDelta === null ? '' : ' · 环比 ' + (totalDelta > 0 ? '+' : '') + totalDelta.toFixed(1) + 'pt') + '</div>' +
                '</div>' + rows + '</div>';
        }
        function drillDailyPoint(personNode, ds) {
            const postKey = personNode.postKey || postKeyOfPerson(personNode) || POSTS[0].key;
            const rule = clRuleFor(postKey);
            const items = rule.scoreItems;
            const storeName = personNode.storeName || '';
            if (LH_OK && rule.real) {
                if (CL_DATES.indexOf(ds) < 0) return null;          // 该日无灯塔日报 → 表格置灰行
                const idx = clDataIndexFor([ds]);
                const cand = (idx.byPost[rule.postKey] || []);
                if (!cand.length) return null;
                // 确定性映射：同一树人员永远取同一名灯塔人员（刷新稳定）
                const pi = cand[hashSeed(personNode.id) % cand.length];
                const p = idx.persons[pi];
                const st = LH.stores[p.storeIdx] || { code: '', name: storeName, region: '', area: '', idx: p.storeIdx };
                return clMakePoint(rule, items, {
                    idx: pi, name: personNode.name, code: p.code, store: st, real: true,
                    itemOf: function (nm) { return p.items[nm]; },
                    deductions: p.deductions, dedRows: p.dedRows, delivered: p.delivered
                });
            }
            // 模拟岗位：seed = 人员 + 日期（drillday| 前缀与闭环 mock| 前缀隔离）
            const rnd = clRng('drillday|' + personNode.id + '|' + ds);
            const quality = 0.42 + rnd() * 0.58;
            const itemOf = {}, deds = [];
            items.forEach(function (it) {
                const cap = it.cap || 1;
                const step = cap <= 1 ? 0.5 : Math.round(cap / 4 * 100) / 100;
                let v = quality * cap * (0.62 + rnd() * 0.5);
                v = Math.round(Math.min(cap, Math.max(0, v)) / step) * step;
                v = Math.round(v * 100) / 100;
                itemOf[it.name] = { score: v, count: Math.max(1, Math.round((cap <= 1 ? (v > 0 ? 1 : 0) : v) + rnd() * 3)), hasSum: true };
                if (v < cap - 1e-6) {
                    const cnt = 1 + Math.floor(rnd() * 2);
                    const reason = String(it.noScore || it.judge || '未达到该项拿分条件').replace(/\s+/g, ' ').slice(0, 56);
                    deds.push({
                        item: it.name, action: it.name, per: it.per || 0.5, count: cnt,
                        total: Math.round((it.per || 0.5) * cnt * 100) / 100, mock: true,
                        evidence: ['判定=未满足|原因=' + reason + '|样本=' + cnt + '单'], orders: []
                    });
                }
            });
            deds.sort(function (a, b) { return b.total - a.total; });
            return clMakePoint(rule, items, {
                idx: -1, name: personNode.name, code: '', store: { code: '', name: storeName, region: '', area: '', idx: -1 }, real: false,
                itemOf: function (nm) { return itemOf[nm]; },
                deductions: deds, dedRows: [], delivered: 1 + Math.floor(rnd() * 12)
            });
        }
        function drillRealPoint(personNode, rule, day) {
            const itemMap = {}, itemMapN = {};
            (day.items || []).forEach(function (it) {
                itemMap[it.item] = it;
                itemMapN[String(it.item || '').replace(/[%％\s]/g, '')] = it;   // v5.9：归一化键（去 %/空格）
            });
            // v5.9：导入拿分项与静态规则名可能不完全一致（如导入「线索处理及时率」vs 规则表「线索处理及时率%」——
            // 数营专家规则全是 deprecated 草案，clRuleFor 兜底 slice(0,4) 后 4 项全部映射失败 → dims 全 null →
            // every() 误判 noData，即使 /scoring/range 返回了真实数据（宋彩虹 9/10 1.48 分/148%）也整表置灰）。
            // 修复：①查找时先精确后归一化；②接口返回的拿分项若静态规则未覆盖则补入映射
            let items = (rule.scoreItems && rule.scoreItems.length) ? rule.scoreItems.slice() : [];
            (day.items || []).forEach(function (d) {
                if (d && d.item && !items.some(function (x) {
                    return x.name === d.item || String(x.name || '').replace(/[%％\s]/g, '') === String(d.item).replace(/[%％\s]/g, '');
                })) {
                    items.push({ name: d.item, cap: d.cap || d.std || 1 });
                }
            });
            const dims = [], ratios = [], counts = [], stds = [];
            let point = 0, capCover = 0, stdCover = 0;
            items.forEach(function (it) {
                const r = itemMap[it.name] || itemMapN[String(it.name || '').replace(/[%％\s]/g, '')];
                if (!r) { dims.push(null); ratios.push(null); counts.push(null); stds.push(null); return; }
                const v = Number(r.score || 0);
                // v5.5：日标准得分（100% 达标线）优先取导入汇总 target_score，缺失回退规则封顶；
                // 单项比率与当日完成率均不封顶 —— 超出标准按比例计（如 6 分 / 标准 4 分 = 150%）
                const std = Number(r.targetScore) > 0 ? Number(r.targetScore) : (it.cap || 1);
                dims.push(Math.round(v * 100) / 100);
                ratios.push(std ? Math.max(0, v / std * 100) : 0);
                counts.push(r.count === undefined ? null : r.count);
                point += v;
                capCover += (it.cap || 1);
                stdCover += std;
                stds.push(std);
            });
            const capAvail = rule.capAvailable || rule.cap || 1;
            // v5.5：完成率 = 当日积分 ÷ 当日标准分合计（分母只累计当日实际有评估数据的拿分项）
            const rate = stdCover ? point / stdCover * 100 : 0;
            let wi = -1, wv = 1000;
            ratios.forEach(function (v, i) { if (v !== null && v < wv) { wv = v; wi = i; } });
            const st = clStatusOf(rate);
            return {
                key: 'real|' + personNode.id + '|' + day.date,
                idx: -1,
                name: personNode.name, code: '',
                postKey: rule.postKey, postName: rule.postName,
                storeIdx: -1, storeId: '', storeCode: '', storeName: personNode.storeName || '',
                region: '', area: '',
                real: true, sourceKind: 'import',
                dims: dims, ratios: ratios, counts: counts, stds: stds,
                // v5.9 修复③：把「静态规则 + 导入自动补项」合并后的拿分项清单带出去（与 dims/stds/ratios/counts 同索引）。
                // 此前抽屉只遍历静态规则表，导入的新拿分项（如产品专家「到店接待」）计入当日积分却无行可显示 → 三个区块对不上
                itemNames: items.map(function (x) { return x.name; }),
                itemCaps: items.map(function (x) { return x.cap || 1; }),
                points: Math.round(point * 100) / 100, cap: rule.cap, capAvailable: capAvail,
                capCover: Math.round(capCover * 100) / 100,
                stdCover: Math.round(stdCover * 100) / 100,
                coverCnt: dims.filter(function (v) { return v !== null; }).length, coverTotal: items.length,
                rate: Math.round(rate * 10) / 10,
                rateFull: capAvail ? Math.round(point / capAvail * 1000) / 10 : 0,
                status: st.label, statusCls: st.cls,
                weakestIdx: wi < 0 ? 0 : wi,
                weakestName: wi < 0 ? '—' : items[wi].name,
                weakestRate: wi < 0 ? 0 : Math.round(wv),
                deductions: [], dedCount: 0, dedTotal: 0,
                dedRows: [], empCode: '', delivered: 0,
                real: true,   // v5.6：真实导入行来源徽章不再误显「模拟数据」
                tag: { text: '动作评分导入', warn: false },
                noData: dims.every(function (v) { return v === null; })
            };
        }
        const SMETA = { req: null, posts: null, days: [] };
        function smetaLoad() {
            if (DATA_MODE !== 'api') return Promise.resolve(null);
            if (!SMETA.req) {
                SMETA.req = fetchJson(API_BASE + '/api/scoring/meta').then(function (m) {
                    if (m && m.ok && Array.isArray(m.posts)) {
                        SMETA.posts = new Set(m.posts.filter(function (x) { return (x.detailRows || 0) > 0; }).map(function (x) { return x.postKey; }));
                        SMETA.days = (m.days || []).slice();
                    } else {
                        SMETA.posts = new Set();
                    }
                    return SMETA.posts;
                }).catch(function () { SMETA.posts = new Set(); return SMETA.posts; });
            }
            return SMETA.req;
        }
        async function renderDrillPersonDaily(cur, r) {
            const list = document.getElementById('drillList');
            if (!list) return;
            state.drillPersonId = cur.id;                 // 供区间汇总明细复用
            renderDutyPersonDetail();
            const postKey = cur.postKey || postKeyOfPerson(cur) || POSTS[0].key;
            const rule = clRuleFor(postKey);
            const isMgr = postKey === 'salesManager';   // v4.15：仅销售店长显示晨会 / 夕会报表列

            // v5.8：区间日期串直接取顶栏日期筛选 state.start/end（不按指标数据窗口钳制）——
            // 此前用入参 r（currentIdx() 被 clampIdx 钳制到指标数据范围，如 9/10~9/16），
            // 顶栏选 9/9~9/20 应用后逐日表日期串不变，表现为「日期筛选不同步」；
            // 窗口外日期由既有分支自然处理：导入未命中/置灰、LH 无日报返回 null 置灰
            const dates = [];
            {
                let d = parseDate(state.start);
                const dEnd = parseDate(state.end);
                let guard = 0;
                while (d <= dEnd && guard++ < 400) {
                    dates.push(dateStr(d));
                    d = new Date(d.getTime() + ONE_DAY);
                }
            }
            if (!dates.length) { dates.push(dateStr(parseDate(state.start))); }
            const dsFrom = dates[0], dsTo = dates[dates.length - 1];

            // v5.4：拉取该人员的真实区间数据（动作评分导入）；
            // v5.6：交付等 LH 岗位也拉取 —— 逐日取数优先级改为「导入数据 > LH 真实日报 > 置灰」，
            // 否则导入的 9/10 评分数据在 LH 岗位（仅 5/22 有日报）的逐日表上永远不出现
            const realMap = new Map();
            if (cur.id) {
                try {
                    const resp = await fetchJson(API_BASE + '/api/scoring/range?personId=' + cur.id + '&from=' + dsFrom + '&to=' + dsTo);
                    if (resp && resp.ok && Array.isArray(resp.days)) {
                        resp.days.forEach(function (d) { realMap.set(d.date, d); });
                    }
                } catch (e) { /* 接口失败：静默回退到 LH/mock */ }
            }
            let realNote = '';
            if (realMap.size) {
                const ks = Array.from(realMap.keys()).sort();
                realNote = '动作评分导入数据（区间内仅 ' + ks.join('、') + ' 有数据，其余日期置灰）';
            }
            // v5.7：API 模式下查询岗位导入元信息 —— 岗位已有导入评分但该人无记录 → 整表置灰，不回退模拟
            const smetaPosts = await smetaLoad();
            const postHasImport = !!(smetaPosts && smetaPosts.has(postKey));
            let dataNote = (LH_OK && rule.real)
                ? '灯塔真实评分数据（当前数据文件仅 ' + CL_DATES.join('、') + ' 有日报，其余日期置灰）' + (realMap.size ? '；' + realNote : '')
                : (realNote || (rule.real ? '规则驱动模拟数据' : '规则驱动模拟数据（确定性生成）'));
            if (postHasImport && !realMap.size) {
                dataNote = '该岗位已导入动作评分（导入日期 ' + (SMETA.days.join('、') || '—') + '），当前人员无导入记录 —— 逐日置灰，不展示模拟数据';
            }

            // 区间逐日行：完成率环比 = 与前一日完成率之差（首日 —）
            const rows = [];
            let prevRate = null;
            // v5.4：若 realMap 有任一日期数据，则其余未命中日期视为「无评估数据」，行置灰 + 文案「当日无该人评估数据」；仅当 realMap 完全为空时才回退 mock
            const useRealOnly = realMap.size > 0;
            for (const ds of dates) {
                let pt, isRealRow = false;
                if (realMap.has(ds)) {
                    pt = drillRealPoint(cur, rule, realMap.get(ds));
                    isRealRow = true;
                } else if (postHasImport) {
                    // v5.7：岗位已导入评分但该人当日无记录 → 置灰（不再回退确定性模拟 / LH 映射，杜绝「天天都有假数据」）
                    pt = { noData: true, points: null, capCover: null, rate: null, weakestName: null, weakestRate: null };
                } else if (LH_OK && rule.real) {
                    pt = drillDailyPoint(cur, ds);
                } else if (useRealOnly) {
                    // v5.4：已有部分真实数据但当日未命中 → 置灰「当日无该人评估数据」，不展示 mock 数值
                    pt = { noData: true, points: null, capCover: null, rate: null, weakestName: null, weakestRate: null };
                } else {
                    pt = drillDailyPoint(cur, ds);
                }
                rows.push({ ds: ds, pt: pt, prevRate: prevRate, isRealRow: isRealRow });
                prevRate = (pt && !pt.noData) ? pt.rate : null;   // 无数据日断开环比链
            }
            const rateC = function (v) {
                return v >= 95 ? '#34d399' : (v >= 85 ? '#60a5fa' : (v >= 70 ? '#fbbf24' : '#fb7185'));
            };
            const bodyHtml = rows.map(function (row, ri) {
                const pt = row.pt;
                if (!pt || pt.noData) {
                    // v4.15：无数据行晨/夕会胶囊同样置灰不可点（与整行 opacity-40 一致）
                    const meetGrey = isMgr ? '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5"><span class="px-2 py-1 rounded-md bg-slate-500/10 text-slate-600">晨会</span></td><td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5"><span class="px-2 py-1 rounded-md bg-slate-500/10 text-slate-600">夕会</span></td>' : '';
                    return '<tr class="opacity-40" data-ri="' + ri + '">' +
                        '<td class="px-3 py-2.5 text-sm text-slate-300 whitespace-nowrap border-b border-white/5">' + row.ds + '</td>' +
                        '<td class="px-3 py-2.5 text-right text-xs text-slate-500 border-b border-white/5" colspan="' + (isMgr ? 4 : 6) + '">' + (pt ? '当日无该人评估数据' : '无日报数据') + '</td>' + meetGrey + '</tr>';
                }
                let deltaHtml = '<span class="text-slate-500">—</span>';
                if (row.prevRate !== null && row.prevRate !== undefined) {
                    const d = pt.rate - row.prevRate;
                    const color = Math.abs(d) < 0.5 ? '#64748b' : (d > 0 ? '#ef4444' : '#10b981');
                    deltaHtml = '<span style="color:' + color + '">' + (d > 0 ? '↑ +' : (d < 0 ? '↓ ' : '')) + d.toFixed(1) + 'pt</span>';
                }
                const realTag = row.isRealRow ? ' <span class="ml-1 text-[10px] text-emerald-400">导入</span>' : '';
                return '<tr data-ri="' + ri + '" data-date="' + row.ds + '" data-real="' + (row.isRealRow ? '1' : '0') + '" class="cursor-pointer hover:bg-white/5 transition">' +
                    '<td class="px-3 py-2.5 text-sm text-slate-200 whitespace-nowrap border-b border-white/5">' + row.ds + realTag + '</td>' +
                    '<td class="px-3 py-2.5 text-right text-sm font-semibold text-slate-100 whitespace-nowrap border-b border-white/5">' + clNum(pt.points) + '</td>' +
                    '<td class="px-3 py-2.5 text-right text-xs text-slate-400 whitespace-nowrap border-b border-white/5" title="当日已评估拿分项标准分（日标准得分）之和（无数据项不计入分母）">' + clNum(pt.stdCover != null ? pt.stdCover : pt.capCover) + '</td>' +
                    '<td class="px-3 py-2.5 text-right text-sm font-semibold whitespace-nowrap border-b border-white/5" style="color:' + rateC(pt.rate) + '">' + pt.rate.toFixed(1) + '%</td>' +
                    '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5">' + deltaHtml + '</td>' +
                    '<td class="px-3 py-2.5 text-xs text-slate-300 whitespace-nowrap border-b border-white/5" title="' + (pt.weakestName || '') + '">' + clShortItem(pt.weakestName || '—') + ' <span class="text-slate-500">' + (pt.weakestRate === null || pt.weakestRate === undefined ? '' : pt.weakestRate + '%') + '</span></td>' +
                    // v4.15：晨会 / 夕会报表胶囊（仅销售店长；stopPropagation 避免触发行点击的诊断抽屉）
                    (isMgr
                        ? '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5"><span data-meet-btn="am" data-date="' + row.ds + '" class="px-2 py-1 rounded-md bg-amber-500/15 text-amber-300 cursor-pointer hover:bg-amber-500/25 transition">晨会 ▸</span></td>' +
                          '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5"><span data-meet-btn="pm" data-date="' + row.ds + '" class="px-2 py-1 rounded-md bg-indigo-500/15 text-indigo-300 cursor-pointer hover:bg-indigo-500/25 transition">夕会 ▸</span></td>'
                        : '') +
                    '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5"><span class="px-2 py-1 rounded-md bg-cyan-500/15 text-cyan-300">明细 ▸</span></td>' +
                    '</tr>';
            }).join('');
            list.innerHTML =
                '<div class="flex items-center justify-between flex-wrap gap-2 mb-2">' +
                    '<div><span class="text-sm text-slate-100 font-medium">' + cur.name + ' · 每日动作积分完成率</span>' +
                    '<span class="text-[11px] text-slate-400 ml-2">' + (cur.storeName || '') + ' · ' + (cur.postName || rule.postName) + ' · 满分 ' + clNum(rule.capAvailable) + '</span></div>' +
                    '<div class="text-[11px] text-slate-400">完成率 = 当日积分 ÷ 已评估拿分项标准分（日标准得分 = 100%，超出按比例计，如 150%；当日无评估数据的拿分项不计入分母）· 环比 = 与前一日之差 · 点击行查看当日诊断明细 · ' + dataNote + '</div>' +
                '</div>' +
                '<table class="min-w-full border-collapse text-sm">' +
                    '<thead><tr>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">日期</th>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">当日积分</th>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">已评估标准分</th>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">完成率</th>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">环比</th>' +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">最弱拿分项</th>' +
                    // v4.15：晨会 / 夕会报表列（仅销售店长）
                    (isMgr
                        ? '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">晨会报表</th>' +
                          '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">夕会报表</th>'
                        : '') +
                    '<th class="sticky top-0 z-10 bg-slate-800/95 backdrop-blur px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10">明细</th>' +
                    '</tr></thead>' +
                    '<tbody>' + bodyHtml + '</tbody></table>';
            // 行点击 → 构建单日抽屉上下文并打开诊断抽屉（复用闭环 clOpenDrawer 全部内容与图表）
            list.querySelectorAll('tr[data-date]').forEach(function (tr) {
                tr.addEventListener('click', function () {
                    const ds = tr.dataset.date;
                    const isReal = tr.dataset.real === '1';
                    let day = null;
                    let pt;
                    if (isReal && realMap.has(ds)) {
                        day = realMap.get(ds);
                        pt = drillRealPoint(cur, rule, day);
                    } else {
                        pt = drillDailyPoint(cur, ds);
                    }
                    if (!pt || pt.noData) return;
                    const openIt = function () {
                        CL_DRAW_CTX = {
                            points: [pt], rule: rule, dates: [ds],
                            teamScores: pt.dims.map(function (v) { return v === null || v === undefined ? 0 : v; })   // 单人场景：均值线与本人重合
                        };
                        clOpenDrawer(0);
                    };
                    if (isReal) {
                        // 真实导入行：异步补充证据链（/scoring/details）再打开抽屉；失败则照常去空事实表打开
                        fetchJson(API_BASE + '/api/scoring/details?date=' + ds + '&personId=' + cur.id)
                            .then(function (resp) {
                                if (resp && resp.ok && Array.isArray(resp.details) && resp.details.length) {
                                    pt.dedRows = resp.details.map(function (r) {
                                        return { order: r.orderNo || '', item: r.item, act: r.action, ev: r.evidence || '', score: r.score };
                                    });
                                    // v5.6：同步构建扣分明细（抽屉「扣分明细」表 / 扣分单数 / 累计扣分 / 标签）
                                    const deds = clDedsFromDetails(resp.details);
                                    pt.deductions = deds;
                                    pt.dedCount = deds.reduce(function (s, d) { return s + d.count; }, 0);
                                    pt.dedTotal = Math.round(deds.reduce(function (s, d) { return s + d.total; }, 0) * 100) / 100;
                                    if (deds.length) pt.tag = clTagOf(deds);
                                }
                                openIt();
                            })
                            .catch(function () { openIt(); });
                    } else {
                        openIt();
                    }
                });
            });
            // v4.15：晨会 / 夕会报表胶囊点击 —— stopPropagation 避免触发行点击的诊断抽屉
            list.querySelectorAll('span[data-meet-btn]').forEach(function (sp) {
                sp.addEventListener('click', function (e) {
                    e.stopPropagation();
                    openMeetReport(cur, sp.dataset.date, sp.dataset.meetBtn);
                });
            });
        }
        const MEET_TASK_TPL = [
            { task: '新增建档并完成 DMS 录入', metric: '新增建档 ≥ {n} 组', n: [6, 10], source: '新增建档' },
            { task: '当日首访线索 2 小时内跟进登记', metric: '首访登记及时率 100%', n: null, source: '线索跟进' },
            { task: '组织当日晨会并同步昨日交付目标', metric: '晨会 09:10 前完成宣讲', n: null, source: '上级指令' },
            { task: '试驾邀约与试驾执行', metric: '试驾 ≥ {n} 组', n: [2, 5], source: '试驾执行' },
            { task: '走动式管理：接待 / 讲解 / 仪式宣讲抽查', metric: '抽查 ≥ {n} 个环节', n: [2, 4], source: '接待规范' },
            { task: '锁单客户交付群建群与自我介绍检查', metric: '当班锁单建群率 100%', n: null, source: '上级指令' },
            { task: '当日客户投诉 / 异常第一时间响应', metric: '异常响应 ≤ 30 分钟', n: null, source: '异常核对' },
            { task: '夕会前完成当日战报与明日计划', metric: '夕会 19:00 前提交战报', n: null, source: '上级指令' }
        ];
        const MEET_DEADLINES = ['12:00 前', '15:00 前', '18:00 前', '今日内', '夕会前'];
        function meetingTasksOf(personNode, ds) {
            const rnd = clRng('meeting|' + personNode.id + '|' + ds);
            // 从模板确定性抽取 3-5 条（不重复），按时间轴递增排布
            const pool = MEET_TASK_TPL.slice();
            const cnt = 3 + Math.floor(rnd() * 3);
            const picks = [];
            for (let i = 0; i < cnt && pool.length; i++) {
                const j = Math.floor(rnd() * pool.length);
                picks.push(pool.splice(j, 1)[0]);
            }
            const owner = personNode.name;
            const team = ['张倩', '李昊', '王一诺', '赵子墨', '刘畅'];
            let hh = 9, mm = 5 + Math.floor(rnd() * 10);
            return picks.map(function (t) {
                const time = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
                mm += 6 + Math.floor(rnd() * 9);
                if (mm >= 60) { mm -= 60; hh++; }
                // 目标值
                let metric = t.metric, target = null;
                if (t.n) {
                    target = t.n[0] + Math.floor(rnd() * (t.n[1] - t.n[0] + 1));
                    metric = metric.replace('{n}', target);
                } else {
                    target = 1;   // 达成即 100%（率类 / 时点类任务）
                }
                // 夕会完成情况：actual 与 status（done / partial / todo）由同 seed 派生
                const roll = rnd();
                let status, actual;
                if (roll < 0.55) { status = 'done'; actual = target; }
                else if (roll < 0.85) { status = 'partial'; actual = Math.max(0, target - (1 + Math.floor(rnd() * Math.max(1, target)))); }
                else { status = 'todo'; actual = 0; }
                if (!t.n && status === 'partial') status = 'todo';
                return {
                    time: time, task: t.task, owner: owner,
                    helper: rnd() < 0.5 ? team[Math.floor(rnd() * team.length)] : null,   // 协同人（演示）
                    metric: metric, target: target,
                    deadline: MEET_DEADLINES[Math.floor(rnd() * MEET_DEADLINES.length)],
                    source: t.source, published: rnd() > 0.05,
                    actual: actual, status: status
                };
            });
        }
        function openMeetReport(personNode, ds, type) {
            const d = document.getElementById('meetDrawer');
            const body = document.getElementById('meetDrawerBody');
            if (!d || !body) return;
            const tasks = meetingTasksOf(personNode, ds);
            const isAm = type === 'am';
            const post = POSTS_BY_KEY['salesManager'] || { name: '销售店长', color: '#8b5cf6' };
            // KPI 摘要
            const done = tasks.filter(function (t) { return t.status === 'done'; }).length;
            const partial = tasks.filter(function (t) { return t.status === 'partial'; }).length;
            const todo = tasks.filter(function (t) { return t.status === 'todo'; }).length;
            const finishRate = tasks.length ? Math.round((done + partial * 0.5) / tasks.length * 1000) / 10 : 0;
            const kpis = isAm
                ? [
                    { label: '发布任务数', v: tasks.length, unit: '条', sub: '晨会时间轴 09:05-09:40', c: '#f59e0b' },
                    { label: '按时发布率', v: tasks.every(function (t) { return t.published; }) ? 100 : Math.round(tasks.filter(function (t) { return t.published; }).length / tasks.length * 100), unit: '%', sub: '晨会 09:40 前完成发布', c: '#22c55e' },
                    { label: '涉及拿分项', v: tasks.filter(function (t) { return t.source !== '上级指令'; }).length, unit: '项', sub: '任务与当日积分口径对齐', c: '#06b6d4' }
                ]
                : [
                    { label: '任务完成率', v: finishRate, unit: '%', sub: '完成 100% / 部分完成 50% 计权', c: '#6366f1' },
                    { label: '全额完成', v: done, unit: '条', sub: '达到晨会衡量标准', c: '#22c55e' },
                    { label: '部分完成', v: partial, unit: '条', sub: '接近目标，夕会复盘差距', c: '#fbbf24' },
                    { label: '未完成', v: todo, unit: '条', sub: '列入次日晨会跟进', c: '#ef4444' }
                ];
            const kpiHtml = kpis.map(function (k) {
                return '<div class="cl-kpi" style="--kpi-c:' + k.c + ';flex:1;min-width:150px"><div class="k-label">' + k.label + '</div><div class="k-value">' + k.v + ' <small>' + k.unit + '</small></div><div class="k-sub">' + k.sub + '</div></div>';
            }).join('');
            // 表头
            const thC = 'px-3 py-2.5 text-left text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10';
            const thR = 'px-3 py-2.5 text-right text-xs font-semibold text-slate-200 whitespace-nowrap border-b border-white/10';
            const headHtml = isAm
                ? '<tr><th class="' + thC + '">时间</th><th class="' + thC + '">任务名称</th><th class="' + thC + '">责任人</th><th class="' + thC + '">衡量标准</th><th class="' + thC + '">完成时限</th><th class="' + thC + '">任务来源</th><th class="' + thR + '">发布状态</th></tr>'
                : '<tr><th class="' + thC + '">时间</th><th class="' + thC + '">任务名称</th><th class="' + thC + '">责任人</th><th class="' + thC + '">衡量标准</th><th class="' + thR + '">实际完成</th><th class="' + thC + '">完成状态</th><th class="' + thC + '">差距 / 说明</th></tr>';
            const stMap = { done: { t: '✓ 完成', c: 'bg-emerald-500/15 text-emerald-300' }, partial: { t: '△ 部分完成', c: 'bg-amber-500/15 text-amber-300' }, todo: { t: '✗ 未完成', c: 'bg-rose-500/15 text-rose-300' } };
            const bodyHtml = tasks.map(function (t) {
                const srcCls = t.source === '上级指令' ? 'bg-violet-500/15 text-violet-300' : 'bg-cyan-500/15 text-cyan-300';
                if (isAm) {
                    return '<tr class="hover:bg-white/5 transition">' +
                        '<td class="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap border-b border-white/5">' + t.time + '</td>' +
                        '<td class="px-3 py-2.5 text-sm text-slate-100 border-b border-white/5">' + t.task + '</td>' +
                        '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5"><span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:' + post.color + '"></span>' + t.owner + (t.helper ? '<span class="text-slate-500"> + ' + t.helper + '（协同）</span>' : '') + '</td>' +
                        '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5" style="color:#67e8f9">' + t.metric + '</td>' +
                        '<td class="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap border-b border-white/5">' + t.deadline + '</td>' +
                        '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5"><span class="px-2 py-1 rounded-md ' + srcCls + '">' + t.source + '</span></td>' +
                        '<td class="px-3 py-2.5 text-right text-xs whitespace-nowrap border-b border-white/5">' + (t.published ? '<span class="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300">✓ 已发布</span>' : '<span class="px-2 py-1 rounded-md bg-slate-500/15 text-slate-400">待发布</span>') + '</td></tr>';
                }
                const st = stMap[t.status];
                const actualTxt = t.target > 1 ? (t.actual + ' / ' + t.target) : (t.actual > 0 ? '达成' : '未达成');
                let gap = '—';
                if (t.status === 'done') gap = '达到晨会衡量标准';
                else if (t.status === 'partial') gap = '差 ' + (t.target - t.actual) + '，夕会复盘原因';
                else gap = t.target > 1 ? '未启动（目标 ' + t.target + '）' : '未达成，列入次日跟进';
                return '<tr class="hover:bg-white/5 transition">' +
                    '<td class="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap border-b border-white/5">' + t.time + '</td>' +
                    '<td class="px-3 py-2.5 text-sm text-slate-100 border-b border-white/5">' + t.task + '</td>' +
                    '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5"><span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background:' + post.color + '"></span>' + t.owner + (t.helper ? '<span class="text-slate-500"> + ' + t.helper + '（协同）</span>' : '') + '</td>' +
                    '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5" style="color:#67e8f9">' + t.metric + '</td>' +
                    '<td class="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap border-b border-white/5" style="color:' + (t.status === 'done' ? '#34d399' : (t.status === 'partial' ? '#fbbf24' : '#fb7185')) + '">' + actualTxt + '</td>' +
                    '<td class="px-3 py-2.5 text-xs whitespace-nowrap border-b border-white/5"><span class="px-2 py-1 rounded-md ' + st.c + '">' + st.t + '</span></td>' +
                    '<td class="px-3 py-2.5 text-xs text-slate-400 border-b border-white/5">' + gap + '</td></tr>';
            }).join('');
            body.innerHTML =
                '<div class="p-5 pb-3 flex items-center justify-between flex-wrap gap-2">' +
                    '<div><span class="text-base text-slate-100 font-semibold">' + personNode.name + ' · ' + ds + (isAm ? ' 晨会报表' : ' 夕会报表') + '</span>' +
                    '<span class="text-xs text-slate-400 ml-2">' + (personNode.storeName || '') + ' · 销售店长 · ' + (isAm ? '晨会 09:05-09:40 发布 · 点击夕会报表核对完成情况' : '对照晨会任务逐条核对 · 数据为确定性模拟演示') + '</span></div>' +
                    '<button data-meet-close class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center" style="color:#94a3b8;font-size:14px">✕</button></div>' +
                '<div class="px-5 flex flex-wrap gap-2 pb-3" style="display:flex">' + kpiHtml + '</div>' +
                '<div class="px-5 pb-2"><table class="min-w-full border-collapse text-sm"><thead>' + headHtml + '</thead><tbody>' + bodyHtml + '</tbody></table></div>' +
                '<div class="px-5 py-3 text-[11px] text-slate-500 border-t border-white/5">' + (isAm
                    ? '晨会报表 = 晨会时间段向具体责任人发布的当日任务清单（时间 / 责任人 / 衡量标准 / 时限 / 任务来源）· 数据为确定性模拟演示，待接真实晨会接口'
                    : '夕会报表 = 对照当日晨会任务逐条核对完成情况（实际完成 / 完成状态 / 差距说明）· 完成率 = 完成 100% + 部分完成 50% 计权 · 数据为确定性模拟演示，待接真实夕会接口') + '</div>';
            d.classList.remove('hidden');
        }
        function renderDrillPostQuad(postNode, persons, r, pr) {
            const box = document.getElementById('drillPostQuad');
            if (!box) return;
            // 人员 < 2：四象限参考价值不大，给出占位提示，避免单点假象
            if (!persons || persons.length < 2) {
                clDisposeChart('drillPostQuad');
                const head = postNode.storeName ? postNode.storeName + ' · ' + postNode.name : postNode.name;
                box.innerHTML = '<div class="rounded-xl p-4 mt-3" style="background:rgba(15,23,42,0.5);border:1px solid rgba(148,163,184,0.15)">' +
                    '<div class="flex items-center justify-between flex-wrap gap-2 mb-1">' +
                    '<div><span class="text-sm text-slate-100 font-medium">达成率 × 交付量 · 四象限</span>' +
                    '<span class="text-[11px] text-slate-400 ml-2">' + head + ' · 至少需要 2 位在岗人员才能生成四象限</span></div></div>' +
                    '<div class="text-xs text-slate-500 py-3 text-center">当前在岗 ' + (persons ? persons.length : 0) + ' 人 · 四象限参考价值有限</div></div>';
                return;
            }
            // 每人 X = round(points / cap * 10000) / 100（达成率% 保留两位小数），Y = delivered（交付量）
            const points = persons.map(function (p) {
                const m = metricsOf(p, r[0], r[1]) || {};
                const cap = productExpertFullScore(p);
                const rawX = cap > 0 ? ((m.points || 0) / cap) * 100 : 0;
                const x = Math.max(0, Math.min(140, Math.round(rawX * 100) / 100));   // 上限 140% 防止远超满分拉散坐标
                const y = m.delivered || 0;
                return {
                    name: p.name,
                    postName: p.postName || postNode.name,
                    storeName: p.storeName || (postNode.storeName || ''),
                    storeCode: p.parent && p.parent.parent ? p.parent.parent.code : (p.code || ''),
                    x: x, y: y,
                    points: m.points || 0,
                    delivered: y,
                    cap: cap
                };
            });
            const xs = points.map(function (p) { return p.x; });
            const ys = points.map(function (p) { return p.y; });
            const avgX = xs.reduce(function (s, v) { return s + v; }, 0) / xs.length;
            const avgY = ys.reduce(function (s, v) { return s + v; }, 0) / ys.length;
            // X 轴范围 0~120%；Y 轴按人员最大值 1.15 留白；浮动阈值避免单点塌缩
            const xMax = 120;
            const xMin = 0;
            const yMaxV = Math.max.apply(null, ys);
            const yMax = yMaxV > 0 ? yMaxV * 1.15 + 0.5 : 1;
            const yMin = 0;
            // 按门店分色（同门店 ≤ 8 家按门店着色，否则单系列，避免图例爆炸）
            const storeMap = new Map();
            points.forEach(function (p, i) {
                const k = p.storeCode || p.storeName || '_all';
                if (!storeMap.has(k)) storeMap.set(k, { name: p.storeName || '全部人员', idxs: [] });
                storeMap.get(k).idxs.push(i);
            });
            const groups = Array.from(storeMap.values()).sort(function (a, b) { return b.idxs.length - a.idxs.length; });
            const byStore = groups.length > 1 && groups.length <= 8;
            function mkSeries(name, color, idxs) {
                return {
                    name: name, type: 'scatter', symbolSize: 16,
                    itemStyle: {
                        color: color, opacity: 0.85,
                        borderColor: 'rgba(255,255,255,0.65)', borderWidth: 1.5,
                        shadowBlur: 8, shadowColor: scaleColor(color, 0.4)
                    },
                    emphasis: { focus: 'self', scale: 1.35 },
                    data: idxs.map(function (i) {
                        return { name: points[i].name, value: [points[i].x, points[i].y], _idx: i };
                    })
                };
            }
            // 先 dispose 旧实例，避免多轮重渲叠加
            clDisposeChart('drillPostQuad');
            box.innerHTML = '';
            const head = postNode.storeName ? postNode.storeName + ' · ' + postNode.name : postNode.name;
            box.style.height = '';   // 让外层自适应
            box.innerHTML = '<div class="rounded-xl p-4" style="background:rgba(15,23,42,0.5);border:1px solid rgba(148,163,184,0.15)">' +
                '<div class="flex items-center justify-between flex-wrap gap-2 mb-2">' +
                '<div><span class="text-sm text-slate-100 font-medium">达成率 × 交付量 · 四象限</span>' +
                '<span class="text-[11px] text-slate-400 ml-2">' + head + ' · 横轴 = 区间积分达成率%（个人区间积分 ÷ 个人满分梯度）· 纵轴 = 区间交付量 · 共 ' + persons.length + ' 人</span></div>' +
                '<div class="text-[11px] text-slate-400">均值线 达成率 <b class="text-amber-300">' + avgX.toFixed(1) + '%</b> · 交付 <b class="text-amber-300">' + avgY.toFixed(1) + '</b> 台</div>' +
                '</div>' +
                '<div id="drillPostQuadChart" style="height:380px"></div>' +
                '</div>';
            const el = document.getElementById('drillPostQuadChart');
            if (!el) return;
            const accent = (POSTS_BY_KEY['productExpert'] || {}).color || '#06b6d4';
            const series = byStore
                ? groups.map(function (g, gi) { return mkSeries(g.name, closureStoreColor(gi), g.idxs); })
                : [mkSeries('全部人员', accent, points.map(function (_, i) { return i; }))];
            series[0].markLine = {
                silent: true, symbol: 'none', animation: false,
                data: [
                    { xAxis: avgX, label: { formatter: '达成率均值 ' + avgX.toFixed(1) + '%', color: '#fbbf24', fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.2 } },
                    { yAxis: avgY, label: { formatter: '交付均值 ' + avgY.toFixed(1) + ' 台', color: '#fbbf24', fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.2 } }
                ]
            };
            series[0].markArea = {
                silent: true,
                data: [
                    [{ xAxis: avgX, yAxis: avgY, itemStyle: { color: 'rgba(16,185,129,0.1)' }, label: { show: true, position: 'insideTopRight', color: '#34d399', fontSize: 12, fontWeight: 700, formatter: '标杆 · 高达成高交付' } }, { xAxis: xMax, yAxis: yMax }],
                    [{ xAxis: xMin, yAxis: yMin, itemStyle: { color: 'rgba(244,63,94,0.1)' }, label: { show: true, position: 'insideBottomLeft', color: '#fb7185', fontSize: 12, fontWeight: 700, formatter: '待辅导 · 低达成低交付' } }, { xAxis: avgX, yAxis: avgY }],
                    [{ xAxis: xMin, yAxis: avgY, itemStyle: { color: 'transparent' }, label: { show: true, position: 'insideTopLeft', color: '#94a3b8', fontSize: 11, formatter: '高达成低交付 · 流程找卡点' } }, { xAxis: avgX, yAxis: yMax }],
                    [{ xAxis: avgX, yAxis: yMin, itemStyle: { color: 'transparent' }, label: { show: true, position: 'insideBottomRight', color: '#94a3b8', fontSize: 11, formatter: '低达成高交付 · 动作待复制' } }, { xAxis: xMax, yAxis: avgY }]
                ]
            };
            const chartInst = echarts.init(el);
            extCharts.drillPostQuad = chartInst;
            chartInst.setOption({
                animation: false,
                tooltip: Object.assign(clChartTooltip(), {
                    formatter: function (it) {
                        const p = points[it.data._idx];
                        if (!p) return '';
                        return '<div style="font-weight:700;margin-bottom:4px">' + p.name + '</div>' +
                            '<div style="opacity:.7;font-size:11px">' + p.storeName + ' · ' + p.postName + '</div>' +
                            '<div style="margin-top:6px">达成率：<b>' + p.x.toFixed(2) + '%</b></div>' +
                            '<div>区间积分：<b>' + clNum(p.points) + '</b> / ' + clNum(p.cap) + ' 分</div>' +
                            '<div>交付量：<b>' + fmt(p.delivered) + '</b> 台</div>';
                    }
                }),
                grid: { left: 48, right: 20, top: 30, bottom: byStore ? 56 : 44 },
                xAxis: Object.assign({ type: 'value', name: '达成率 %', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: xMin, max: xMax, axisLabel: { color: '#94a3b8', fontSize: 11, formatter: '{value}%' } }, clChartAxis()),
                yAxis: Object.assign({ type: 'value', name: '交付量（台）', nameLocation: 'middle', nameGap: 40, nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: yMin, max: yMax }, clChartAxis()),
                legend: byStore ? { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: '#94a3b8', fontSize: 11 } } : { show: false },
                series: series
            }, true);
            try { chartInst.resize(); } catch (_) {}
            requestAnimationFrame(function () { try { chartInst.resize(); } catch (_) {} });
        }
        function buildBuckets(start, end, mode, targets, metrics) {
            metrics = metrics || TREND_METRICS;
            const buckets = [];
            const s = parseDate(start), e = parseDate(end);
            let cursor = new Date(s);
            while (cursor <= e) {
                let bs = new Date(cursor), be = new Date(cursor), label = '';
                if (mode === 'day') {
                    label = (cursor.getMonth() + 1) + '/' + cursor.getDate();
                    cursor = addDays(cursor, 1);
                } else if (mode === 'week') {
                    const wd = cursor.getDay() === 0 ? 7 : cursor.getDay();
                    bs = addDays(cursor, -(wd - 1));
                    be = addDays(bs, 6);
                    if (bs < s) bs = new Date(s);
                    if (be > e) be = new Date(e);
                    label = (bs.getMonth() + 1) + '/' + bs.getDate() + ' 周';
                    cursor = addDays(be, 1);
                } else {
                    bs = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
                    be = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
                    if (bs < s) bs = new Date(s);
                    if (be > e) be = new Date(e);
                    label = bs.getFullYear() + '/' + (bs.getMonth() + 1);
                    cursor = addDays(be, 1);
                }
                const i0 = clampIdx(dayIndex(dateStr(bs))), i1 = clampIdx(dayIndex(dateStr(be)));
                const values = {};
                metrics.forEach(function (m) {
                    if (m.type === 'rate') {
                        const num = targets.reduce(function (sum, n) { return sum + (n.series ? sumIdx(n.series[m.num], i0, i1) : 0); }, 0);
                        const den = targets.reduce(function (sum, n) { return sum + (n.series ? sumIdx(n.series[m.den], i0, i1) : 0); }, 0);
                        values[m.key] = den ? (num / den) * 100 : 0;
                    } else {
                        values[m.key] = targets.reduce(function (sum, n) { return sum + (n.series ? sumIdx(n.series[m.key], i0, i1) : 0); }, 0);
                    }
                });
                buckets.push({ label: label, values: values });
            }
            return buckets;
        }
        function renderTrend() {
            const sub = document.getElementById('trendSubtitle');
            const chipsEl = document.getElementById('trendChips');
            const c = chart('trendChart');
            if (!c || !chipsEl) return;
            if (state.mode === 'pk') {
                const nodes = pkNodes();
                if (nodes.length < 2) { c.clear(); sub.textContent = 'PK 模式下请先勾选 2 ~ 6 个对象'; return; }
                sub.textContent = 'PK 模式 · 各对象新增线索走势（' + state.trendMode + '粒度）';
                const buckets = buildBuckets(state.start, state.end, state.trendMode, nodes);
                c.setOption({
                    grid: { left: 10, right: 22, top: 42, bottom: 6, containLabel: true },
                    legend: { data: nodes.map(function (n) { return n.name; }), textStyle: { color: '#94a3b8', fontSize: 12 }, top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
                    tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
                    xAxis: { type: 'category', data: buckets.map(function (b) { return b.label; }), boundaryGap: false, ...AXIS_STYLE, splitLine: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11, interval: Math.max(0, Math.ceil(buckets.length / 12) - 1) } },
                    yAxis: { type: 'value', ...AXIS_STYLE },
                    series: nodes.map(function (n) {
                        const col = pkColorOf(n);
                        return {
                            name: n.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
                            showSymbol: buckets.length <= 40,
                            data: buckets.map(function (b) { return Math.round(b.values.leads); }),
                            lineStyle: { color: col, width: 2 }, itemStyle: { color: col }
                        };
                    })
                }, true);
                return;
            }
            const node = currentNode();
            const selected = TREND_METRICS.filter(function (m) { return state.trendMetrics.indexOf(m.key) >= 0; });
            const absSelected = selected.filter(function (m) { return m.type === 'abs'; });
            // 自动判断是否需要归一化：绝对量指标之间峰值差距 >=10 倍时开启
            let normAuto = false;
            if (state.mode !== 'pk' && absSelected.length >= 2) {
                const peakBuckets = buildBuckets(state.start, state.end, state.trendMode, [node], absSelected);
                const peaks = absSelected.map(function (m) {
                    return Math.max.apply(null, peakBuckets.map(function (b) { return b.values[m.key] || 0; }));
                });
                const mx = Math.max.apply(null, peaks);
                const mn = Math.min.apply(null, peaks.filter(function (p) { return p > 0; }));
                normAuto = mn > 0 && mx / mn >= 10;
            }
            const normEff = state.mode !== 'pk' && selected.some(function (m) { return m.type === 'abs'; }) &&
                (state.trendNorm === null ? normAuto : state.trendNorm);
            state._trendNormEff = normEff; // 供点击切换时知道当前生效状态

            // 渲染指标多选胶囊（加上归一化切换按钮）
            let chipsHtml = TREND_METRICS.map(function (m) {
                const on = state.trendMetrics.indexOf(m.key) >= 0;
                return '<span class="metric-chip' + (on ? ' on' : '') + '" data-trend-metric="' + m.key + '">' +
                    '<span class="mc-dot" style="background:' + m.color + '"></span>' + m.label + '</span>';
            }).join('');
            chipsHtml += '<span class="metric-chip' + (normEff ? ' on' : '') + ' norm-chip" data-trend-norm="1" title="自动：绝对量指标峰值相差 10 倍以上时开启。点击强制切换">' +
                '<span class="mc-dot" style="background:#cbd5e1"></span>' + (normEff ? '归一化对比' : '绝对量对比') + '</span>';
            chipsEl.innerHTML = chipsHtml;

            sub.textContent = node.name + ' · ' + (selected.length ? selected.map(function (m) { return m.label; }).join(' / ') : '未选择指标');
            if (normEff) sub.textContent += ' · 已归一化（各绝对量按自身峰值缩放为 100%）';

            const buckets = buildBuckets(state.start, state.end, state.trendMode, [node], selected);
            const hasRate = selected.some(function (m) { return m.type === 'rate'; });

            // 预计算每个绝对量指标的峰值
            const absPeak = {};
            absSelected.forEach(function (m) {
                absPeak[m.key] = Math.max.apply(null, buckets.map(function (b) { return b.values[m.key] || 0; }));
            });

            const tooltipFormatter = function (p) {
                let s = p[0].name + '<br/>';
                p.forEach(function (it) {
                    const ms = selected.filter(function (x) { return x.label === it.seriesName; });
                    const m = ms[0];
                    if (!m) return;
                    if (m.type === 'rate') {
                        s += it.marker + ' ' + it.seriesName + '：<b>' + it.value.toFixed(1) + '%</b><br/>';
                    } else if (normEff) {
                        const peak = absPeak[m.key] || 0;
                        const real = peak ? (it.value * peak / 100) : 0;
                        s += it.marker + ' ' + it.seriesName + '：<b>' + it.value.toFixed(1) + '%</b> 缩放（实值 <b>' + fmt(real) + '</b> ' + (METRIC_UNIT[m.key] || '') + '）<br/>';
                    } else {
                        s += it.marker + ' ' + it.seriesName + '：<b>' + fmt(it.value) + '</b> ' + (METRIC_UNIT[m.key] || '') + '<br/>';
                    }
                });
                return s;
            };

            let yAxis, gridRight, yAxisIndexForRate;
            if (normEff) {
                // 归一化模式下所有可展示的系列都落在 0-100% 区间内，统一一个 Y 轴
                yAxis = [{ type: 'value', name: '%', nameTextStyle: { color: '#64748b', padding: [0, 0, 0, -16] }, min: 0, max: 100, axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 }, ...AXIS_STYLE }];
                gridRight = 22;
                yAxisIndexForRate = 0;
            } else {
                yAxis = [];
                if (absSelected.length) yAxis.push({ type: 'value', name: '数量', nameTextStyle: { color: '#64748b', padding: [0, 0, 0, -24] }, ...AXIS_STYLE });
                if (hasRate) yAxis.push({ type: 'value', name: '转化率', nameTextStyle: { color: '#64748b', padding: [0, -24, 0, 0] }, min: 0, max: 100, axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 }, ...AXIS_STYLE });
                gridRight = hasRate ? 52 : 22;
                yAxisIndexForRate = absSelected.length ? 1 : 0;
            }

            c.setOption({
                grid: { left: 10, right: gridRight, top: 42, bottom: 6, containLabel: true },
                legend: { data: selected.map(function (m) { return m.label; }), textStyle: { color: '#94a3b8', fontSize: 12 }, top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
                tooltip: { trigger: 'axis', ...TOOLTIP_STYLE, formatter: tooltipFormatter },
                // v5.10：数量类指标贴边会被裁切，含柱状时保留类目两侧空隙；纯比率时折线仍贴边
                xAxis: { type: 'category', data: buckets.map(function (b) { return b.label; }), boundaryGap: absSelected.length > 0, ...AXIS_STYLE, splitLine: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11, interval: Math.max(0, Math.ceil(buckets.length / 12) - 1) } },
                yAxis: yAxis,
                // v5.10 图形分型：具体数据（type='abs'）用柱状图对比、百分比比率（type='rate'）用折线图；
                // 系列顺序固定「先柱后线」，折线压在柱体上方不被遮挡
                series: selected.slice().sort(function (a, b) {
                    return (a.type === 'abs' ? 0 : 1) - (b.type === 'abs' ? 0 : 1);
                }).map(function (m) {
                    if (m.type === 'rate') {
                        return {
                            name: m.label, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
                            showSymbol: buckets.length <= 40,
                            yAxisIndex: yAxisIndexForRate,
                            data: buckets.map(function (b) { return Math.round(b.values[m.key] * 10) / 10; }),
                            lineStyle: { color: m.color, width: 2 }, itemStyle: { color: m.color }
                        };
                    }
                    const peak = absPeak[m.key] || 0;
                    return {
                        name: m.label, type: 'bar', barMaxWidth: 18,
                        yAxisIndex: 0,
                        data: buckets.map(function (b) {
                            const v = b.values[m.key] || 0;
                            return normEff ? (peak ? Math.round(v / peak * 1000) / 10 : 0) : Math.round(v);
                        }),
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                { offset: 0, color: scaleColor(m.color, 0.95) },
                                { offset: 1, color: scaleColor(m.color, 0.4) }
                            ]),
                            borderRadius: [4, 4, 0, 0]
                        }
                    };
                })
            }, true);
        }
        function renderPoints() {
            const r = currentIdx();
            const sub = document.getElementById('pointsSubtitle');
            const c = chart('pointsRankChart');
            if (!c) return;
            if (state.mode === 'pk') {
                const nodes = pkNodes();
                if (nodes.length < 2) { c.clear(); sub.textContent = 'PK 模式下请先勾选 2 ~ 6 个对象'; return; }
                const sorted = nodes.slice().sort(function (a, b) { return metricsOf(b, r[0], r[1]).points - metricsOf(a, r[0], r[1]).points; });
                sub.textContent = 'PK 模式 · ' + nodes.length + ' 个对象积分对比';
                c.setOption({
                    grid: { left: 10, right: 64, top: 12, bottom: 10, containLabel: true },
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE },
                    xAxis: { type: 'value', ...AXIS_STYLE },
                    yAxis: { type: 'category', data: sorted.map(function (n) { return n.name; }).reverse(), ...AXIS_STYLE, splitLine: { show: false } },
                    series: [{
                        type: 'bar', barMaxWidth: 18,
                        data: sorted.map(function (n) { return { value: metricsOf(n, r[0], r[1]).points, itemStyle: { color: pkColorOf(n), borderRadius: [0, 6, 6, 0] } }; }).reverse(),
                        label: { show: true, position: 'right', color: '#cbd5e1', fontSize: 11, formatter: function (p) { return fmt(p.value); } }
                    }]
                }, true);
                return;
            }
            const node = currentNode();
            // v4.4：维度跟随当前组织筛选节点（全国/大区/小区→门店、门店→岗位、岗位→人员）
            const level = autoRankDim();
            // v4.3：候选严格按当前范围收集，不再回退全树（避免范围外条目出现）
            const cands = collectLevel(node, level, []);
            // 全部维度人均口径：人均销量 / 人均积分 = 总量 ÷ 该节点子树在职人数（人员节点数）
            const hcCache = new Map();
            function headcountOf(n) {
                if (!hcCache.has(n.id)) hcCache.set(n.id, collectLevel(n, '人员', []).length);
                return hcCache.get(n.id);
            }
            const rankKey = state.pointsRank === 'points' ? 'points' : 'sales';
            const rows = cands.map(function (n) {
                const m = metricsOf(n, r[0], r[1]);
                const hc = headcountOf(n);
                const points = m.points || 0;
                const delivered = m.delivered || 0;
                const avgPoints = hc > 0 ? points / hc : 0;
                const avgDelivered = hc > 0 ? delivered / hc : 0;
                return {
                    n: n,
                    name: (n.storeName && level === '人员' ? n.storeName + ' · ' : '') + n.name,
                    points: points, delivered: delivered, hc: hc,
                    avgPoints: avgPoints, avgDelivered: avgDelivered
                };
            }).sort(function (a, b) {
                return rankKey === 'sales' ? (b.avgDelivered - a.avgDelivered) : (b.avgPoints - a.avgPoints);
            }).slice(0, 10);
            sub.textContent = level + '维度 · 人均销量 + 人均积分 · ' + (rankKey === 'sales' ? '销量优先' : '积分优先') + ' · TOP ' + rows.length + ' · 范围：' + node.name;
            c.setOption({
                grid: { left: 10, right: 160, top: 12, bottom: 10, containLabel: true },
                tooltip: {
                    trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE,
                    formatter: function (p) {
                        const it = rows[rows.length - 1 - p[0].dataIndex];
                        if (!it) return '';
                        return '<b>' + it.n.name + '</b><br/>' +
                            '<span style="color:#ec4899">人均销量：' + it.avgDelivered.toFixed(1) + ' 辆</span>（总销量 ' + fmt(it.delivered) + ' ÷ ' + it.hc + ' 人）<br/>' +
                            '<span style="color:#f59e0b">人均积分：' + it.avgPoints.toFixed(1) + ' 分</span>（总积分 ' + fmt(it.points) + ' ÷ ' + it.hc + ' 人）';
                    }
                },
                xAxis: { type: 'value', ...AXIS_STYLE },
                yAxis: {
                    type: 'category',
                    data: rows.map(function (it) { return it.name; }).reverse(),
                    ...AXIS_STYLE, splitLine: { show: false },
                    axisLabel: { color: '#94a3b8', fontSize: 11, width: 130, overflow: 'truncate' }
                },
                series: [{
                    type: 'bar', barMaxWidth: 16,
                    data: rows.map(function (it) {
                        const val = rankKey === 'sales' ? it.avgDelivered : it.avgPoints;
                        return {
                            value: val,
                            itemStyle: {
                                borderRadius: [0, 6, 6, 0],
                                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                                    { offset: 0, color: rankKey === 'sales' ? '#3b82f6' : '#f59e0b' },
                                    { offset: 1, color: rankKey === 'sales' ? '#ec4899' : '#a78bfa' }
                                ])
                            }
                        };
                    }).reverse(),
                    label: {
                        show: true, position: 'right', color: '#cbd5e1', fontSize: 11,
                        formatter: function (p) {
                            const it = rows[rows.length - 1 - p.dataIndex];
                            if (!it) return '';
                            return '销量 ' + it.avgDelivered.toFixed(1) + ' · 积分 ' + it.avgPoints.toFixed(1);
                        }
                    }
                }]
            }, true);
        }
        function autoRankDim() {
            const t = (currentNode() || {}).type;
            if (t === '门店') return '岗位';
            if (t === '岗位') return '人员';
            return '门店';
        }
        function renderDetail() {
            const r = currentIdx(), pr = prevRange();
            const thead = document.getElementById('detailThead');
            const tbody = document.getElementById('detailTbody');
            const sub = document.getElementById('tableSubtitle');

            if (state.mode === 'pk') {
                const nodes = pkNodes();
                if (nodes.length < 2) {
                    sub.textContent = 'PK 模式下请先勾选 2 ~ 6 个对象';
                    thead.innerHTML = '';
                    tbody.innerHTML = '';
                    return;
                }
                const base = pkBaseNode();
                sub.textContent = 'PK 模式 · ' + nodes.length + ' 个' + state.pkLevel + ' · 按积分降序 · 基准：' + (base ? base.name : '-');
                const cols = ['名称', '线索', '到店', '锁单', '交车', '到店率', '转化率', '积分', '对比基准'];
                thead.innerHTML = '<tr>' + cols.map(function (c, i) {
                    return '<th class="py-2 px-2 font-medium whitespace-nowrap ' + (i ? 'text-right' : 'text-left') + '">' + c + '</th>';
                }).join('') + '</tr>';
                const baseM = base ? metricsOf(base, r[0], r[1]) : null;
                const rows = nodes.map(function (n) { return { n: n, m: metricsOf(n, r[0], r[1]) }; })
                    .sort(function (a, b) { return b.m.points - a.m.points; });
                tbody.innerHTML = rows.map(function (row, i) {
                    const m = row.m;
                    const l2a = m.leads ? (m.arrivals / m.leads) * 100 : 0;
                    const conv = m.leads ? (m.delivered / m.leads) * 100 : 0;
                    let cmp = '—';
                    if (baseM && row.n.id !== base.id) {
                        const d = m.points - baseM.points;
                        const dp = baseM.points ? (d / baseM.points) * 100 : 0;
                        cmp = '<span class="' + (d >= 0 ? 'text-emerald-400' : 'text-rose-400') + '">' + fmtSigned(d, 0) + ' / ' + fmtSigned(dp, 1) + '%</span>';
                    } else if (baseM) {
                        cmp = '<span class="text-blue-300">★ 基准</span>';
                    }
                    return '<tr class="border-t border-white/5 hover:bg-white/5 transition">' +
                        '<td class="py-2 px-2 text-slate-300 whitespace-nowrap"><span class="text-slate-500 mr-1">' + (i + 1) + '</span>' +
                        '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + pkColorOf(row.n) + ';margin-right:6px"></span>' +
                        '<span' + (row.n.status === 0 ? ' class="txt-inactive"' : '') + '>' + row.n.name + '</span></td>' +
                        '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.leads) + '</td>' +
                        '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.arrivals) + '</td>' +
                        '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.locked) + '</td>' +
                        '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.delivered) + '</td>' +
                        '<td class="py-2 px-2 text-right text-slate-400">' + l2a.toFixed(1) + '%</td>' +
                        '<td class="py-2 px-2 text-right text-slate-400">' + conv.toFixed(1) + '%</td>' +
                        '<td class="py-2 px-2 text-right font-semibold text-amber-400">' + fmt(m.points) + '</td>' +
                        '<td class="py-2 px-2 text-right">' + cmp + '</td></tr>';
                }).join('');
                return;
            }

            const node = currentNode();
            const level = state.tableDim;
            // v5.11：门店 / 岗位维度改用「人均积分完成率」排名（消除人数规模差异），人员维度仍为个人总积分
            const isRateDim = level !== '人员';
            // 口径：行子树内每位在职人员的（区间积分 ÷ 个人满分梯度 × 100%）先各自算完成率，再等权平均
            // 实现：一次遍历在职人员并沿 parent 向上回写，避免逐行重算子树（O(人数 × 树深)）
            const rateMap = new Map();      // node.id → { sumRate, cnt, sumPoints, sumCap }
            if (isRateDim) {
                collectLevel(node, '人员', []).forEach(function (p) {
                    if (p.status === 0) return;                  // 已停用人员不计入分母
                    const cap = productExpertFullScore(p);       // 与「达成率 × 交付量」四象限同一满分口径
                    if (!(cap > 0)) return;
                    const pm = metricsOf(p, r[0], r[1]);
                    const pts = (pm && typeof pm.points === 'number' && isFinite(pm.points)) ? pm.points : 0;
                    const rate = pts / cap * 100;
                    let cur = p;
                    while (cur) {
                        let rec = rateMap.get(cur.id);
                        if (!rec) { rec = { sumRate: 0, cnt: 0, sumPoints: 0, sumCap: 0 }; rateMap.set(cur.id, rec); }
                        rec.sumRate += rate; rec.cnt += 1; rec.sumPoints += pts; rec.sumCap += cap;
                        cur = cur.parent;
                    }
                });
            }
            function rateRecOf(n) {
                const rec = rateMap.get(n.id);
                return (rec && rec.cnt > 0 && rec.sumCap > 0) ? rec : null;
            }
            function avgRateOf(n) {
                const rec = rateRecOf(n);
                return rec ? rec.sumRate / rec.cnt : null;
            }
            // v4.3：行严格按当前范围收集，不再回退全树（避免范围外条目出现）
            let rows = collectLevel(node, level, []);
            rows = rows.slice().sort(function (a, b) {
                if (isRateDim) {
                    const ra = avgRateOf(a), rb = avgRateOf(b);
                    if (ra === null && rb === null) return metricsOf(b, r[0], r[1]).points - metricsOf(a, r[0], r[1]).points;
                    if (ra === null) return 1;                   // 无法计算的排末位
                    if (rb === null) return -1;
                    if (rb !== ra) return rb - ra;
                }
                return metricsOf(b, r[0], r[1]).points - metricsOf(a, r[0], r[1]).points;
            });
            sub.textContent = level + '维度 · 范围：' + node.name + ' · ' + (isRateDim ? '按人均积分完成率降序' : '按积分降序') + ' · 共 ' + rows.length + ' 条';
            const lastCol = isRateDim ? '人均积分完成率' : '积分';
            const cols = ['名称', '线索', '到店', '锁单', '交车', '到店率', '转化率', lastCol];
            const rateTip = '人均积分完成率 = 该行子树在职人员「区间积分 ÷ 个人满分梯度」百分比的等权平均（先算个人完成率再平均，非 Σ积分 ÷ Σ满分）';
            thead.innerHTML = '<tr>' + cols.map(function (c, i) {
                const tip = (isRateDim && i === cols.length - 1) ? ' title="' + rateTip + '"' : '';
                return '<th class="py-2 px-2 font-medium whitespace-nowrap ' + (i ? 'text-right' : 'text-left') + '"' + tip + '>' + c + '</th>';
            }).join('') + '</tr>';
            tbody.innerHTML = rows.map(function (n, i) {
                const m = metricsOf(n, r[0], r[1]) || { leads: 0, arrivals: 0, locked: 0, delivered: 0, points: 0 };
                const l2a = m.leads ? (m.arrivals / m.leads) * 100 : 0;
                const conv = m.leads ? (m.delivered / m.leads) * 100 : 0;
                const nm = level === '人员' && n.storeName ? n.storeName + ' · ' + n.name + '（' + (n.postName || '') + '）' : n.name;
                const nmHTML = '<span' + (n.status === 0 ? ' class="txt-inactive"' : '') + '>' + nm + '</span>';
                let lastCell;
                if (isRateDim) {
                    const rec = rateRecOf(n);
                    const rate = avgRateOf(n);
                    if (rate === null) {
                        lastCell = '<span class="text-slate-500" title="该范围无在职人员或无有效满分梯度，无法计算人均积分完成率">—</span>';
                    } else {
                        const avgPts = rec.sumPoints / rec.cnt;
                        const wholeRate = rec.sumCap ? rec.sumPoints / rec.sumCap * 100 : 0;
                        const tip = '总积分 ' + fmt(rec.sumPoints) + ' ÷ ' + rec.cnt + ' 人 = 人均 ' + avgPts.toFixed(1) + ' 分' +
                            ' · Σ满分 ' + fmt(rec.sumCap) + ' · 整体口径完成率 ' + wholeRate.toFixed(1) + '%';
                        lastCell = '<span class="text-amber-400 font-semibold" title="' + tip + '">' + rate.toFixed(1) + '%</span>';
                    }
                } else {
                    lastCell = '<span class="text-amber-400 font-semibold">' + fmt(m.points) + '</span>';
                }
                return '<tr class="border-t border-white/5 hover:bg-white/5 transition">' +
                    '<td class="py-2 px-2 text-slate-300 whitespace-nowrap"><span class="text-slate-500 mr-1">' + (i + 1) + '</span>' + nmHTML + '</td>' +
                    '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.leads) + '</td>' +
                    '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.arrivals) + '</td>' +
                    '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.locked) + '</td>' +
                    '<td class="py-2 px-2 text-right text-slate-200">' + fmt(m.delivered) + '</td>' +
                    '<td class="py-2 px-2 text-right text-slate-400">' + l2a.toFixed(1) + '%</td>' +
                    '<td class="py-2 px-2 text-right text-slate-400">' + conv.toFixed(1) + '%</td>' +
                    '<td class="py-2 px-2 text-right">' + lastCell + '</td></tr>';
            }).join('');
        }
        const STORE_PALETTE = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#22d3ee', '#fbbf24', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#60a5fa', '#c084fc', '#f87171'];
        function closureStoreColor(idx) { return STORE_PALETTE[idx % STORE_PALETTE.length]; }
        const CL_REGION_PALETTE = {
            '华东一区': '#3b82f6', '华东二区': '#06b6d4', '华东三区': '#0ea5e9', '华中一区': '#f59e0b', '华中二区': '#fbbf24',
            '华南区': '#10b981', '华北区': '#8b5cf6', '东北区': '#22d3ee', '西北区': '#ec4899', '西南区': '#fb923c',
            '英菲尼迪区域': '#a78bfa', '其它': '#f472b6', '待确认': '#94a3b8', '其他': '#64748b'
        };
        const CL_STATUS = [
            { min: 95, label: '标杆', cls: 'st-bench' },
            { min: 85, label: '达标', cls: 'st-good' },
            { min: 70, label: '达标边缘', cls: 'st-edge' },
            { min: 50, label: '需辅导', cls: 'st-tutor' },
            { min: -1, label: '重点辅导', cls: 'st-risk' }
        ];
        function clStatusOf(rate) {
            for (let i = 0; i < CL_STATUS.length; i++) if (rate >= CL_STATUS[i].min) return CL_STATUS[i];
            return CL_STATUS[CL_STATUS.length - 1];
        }
        function clHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
        function clRng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
        const LH = window.LH_SCORING || null;
        const LH_OK = !!(LH && LH.details && LH.persons && LH.persons.length);
        const CL_DATES = LH_OK ? (LH.meta.dates || []).slice() : [];
        const CL_REAL_POSTS = LH_OK ? (LH.meta.realPosts || []) : [];
        const CL_MOCK_ITEMS = ['接待规范', '线索跟进', '试驾执行', 'DMS录入'];
        const CL_MOCK_CAP = 60;                   // 模拟岗位单次渲染门店上限（避免数百条模拟人员拖慢渲染）
        const CL_MEMO = {};                       // 规则 / 组织 / 索引 / 当前范围的轻量缓存
        let CL_DRAW_CTX = null;                   // 抽屉上下文 {pt, rule}

        // 数值展示：整数不带小数，小数保留 1 位
        function clNum(v) { return (v === null || v === undefined) ? '—' : (v % 1 === 0 ? String(v) : v.toFixed(1)); }
        // v4.8：拿分项短别名（仅交付店长 / 交付专员；未命中走去括号兜底）
        const CL_ITEM_ALIAS = {
            '抽查锁单客户交付群分配、入群、自我介绍和问题响应': '交付群运维',
            '核查首访时效、需求登记、查单教学和增值业务邀约': '首访核查',
            '抽检至少1位未到店用户跟进履历及群聊': '未到店抽检',
            '更新7日交付计划并核对预约、双次提醒及当日PDI完成车辆': '7日计划',
            '检查次日车辆、交付区、物料和手续准备': '次日备车',
            '走动式管理接待、激活讲解、仪式和转介绍宣讲': '走动管理',
            '核对异常台账、现场介入、客户回访及处置凭证': '异常核对',
            '首访（分派后2H完成首访登记）': '首访',
            '配车/转采（锁单后72H完成）': '配车/转采',
            '物流信息提醒': '物流提醒',
            '交付预约排程': '交付排程',
            '车辆讲解': '车辆讲解',
            '交付仪式': '交付仪式',
            '企微群客户自我介绍卡及问题回答': '企微介绍'
        };
        function clItemAlias(nm) { return CL_ITEM_ALIAS[String(nm || '').trim()] || ''; }
        function clShortItem(nm) {
            const al = clItemAlias(nm);
            if (al) return al;
            return String(nm || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
        }
        function clEvPairs(evStr) {
            if (!evStr) return [];
            // 灯塔 mock 格式：k=v|k=v
            if (evStr.indexOf('|') >= 0) {
                return evStr.split('|').map(function (seg) {
                    const i = seg.indexOf('=');
                    return i < 0 ? { k: '说明', v: seg } : { k: seg.slice(0, i), v: seg.slice(i + 1) };
                });
            }
            // v5.6：真实导入格式 —— 前缀（未满足【规则】/已满足【规则】/不满足：/证据：）+ 中文分句，句内 k=v 或 k：v
            const out = [];
            let s = String(evStr);
            const mUn = s.match(/^(未满足|已满足)【([^】]*)】/);
            if (mUn) {
                out.push({ k: '结论', v: mUn[1] });
                if (mUn[2]) out.push({ k: '规则', v: mUn[2] });
                s = s.slice(mUn[0].length);
            } else if (/^[不未]满足[：:]/.test(s)) {
                out.push({ k: '结论', v: s.slice(0, 3) });
                s = s.replace(/^[不未]满足[：:]/, '');
            }
            s.split(/[；;]/).forEach(function (part) {
                part.split(/[，,]/).forEach(function (seg) {
                    seg = seg.trim().replace(/^证据[：:]/, '').replace(/[）)]$/, '').trim();
                    if (!seg) return;
                    const kv = seg.match(/^([^=：:]{1,14})\s*[=：:]\s*(.+)$/);
                    out.push(kv ? { k: kv[1].trim(), v: kv[2].trim() } : { k: '说明', v: seg });
                });
            });
            return out.filter(function (x) { return x.v !== ''; });
        }
        function clZeroRowBad(evidence) {
            const ev = String(evidence || '').trim();
            if (!ev) return true;
            if (/^(不满足|未满足|未达成|不达标|未达标)/.test(ev)) return true;
            if (/^(已满足|全满足|满足|已达标|满分)/.test(ev)) return false;
            return !/全满足|(?<![不未])满足|不扣分|(?<!未)达标|(?<![未不])通过|满分|未逾期|未超时|不判/.test(ev);
        }
        function clParseClauses(actionText) {
            if (!actionText) return [];
            const out = [];
            const seen = new Set();
            const codeRe = /(\d-\d-\d+)/g;
            // split 捕获：parts[0]=前导, [1]=code1, [2]=desc1, [3]=code2, [4]=desc2, ...
            const parts = String(actionText).split(codeRe);
            for (let i = 1; i < parts.length; i += 2) {
                const code = parts[i];
                if (seen.has(code)) continue;
                seen.add(code);
                const desc = (parts[i + 1] || '').replace(/[\s…\.。,，;；]+/g, ' ').trim();
                out.push({ code: code, desc: desc });
            }
            return out;
        }
        function clParseAiReason(evidenceText) {
            const ev = String(evidenceText || '').trim();
            if (!ev) return { verdict: 'unknown', failCodes: [], basis: '', restOk: '' };
            // ---- verdict 判定 ----
            let verdict = 'unknown';
            if (/^(不满足|未满足|未达成|不达标|未达标)/.test(ev)) verdict = 'fail';
            else if (/^(已满足|全满足|满足|已达标|满分)/.test(ev)) verdict = 'pass';
            if (verdict === 'unknown') {
                // 描述式反向判定：含达成词→pass，否则按 fail（与 clZeroRowBad 一致）
                if (/全满足|(?<![不未])满足|不扣分|(?<!未)达标|(?<![未不])通过|满分|未逾期|未超时/.test(ev)) verdict = 'pass';
                else verdict = 'fail';
            }
            // ---- failCodes：从「不满足：1-1-x …」提取失败编号 ----
            const failCodes = [];
            const failMatch = ev.match(/不满足[：:]\s*([\s\S]*?)(?=[（(;；]|其余|全满足|$)/);
            if (failMatch && failMatch[1]) {
                const codes = failMatch[1].match(/\d-\d-\d+/g);
                if (codes) failCodes.push(...codes);
            }
            // ---- basis：括号内判定依据 ----
            let basis = '';
            const basisMatch = ev.match(/[（(]([^）)]+)[）)]/);
            if (basisMatch) basis = basisMatch[1].trim();
            // ---- restOk：「其余 N 项满足」 ----
            let restOk = '';
            const restMatch = ev.match(/其余\s*(\d+)\s*项满足/);
            if (restMatch) restOk = '其余' + restMatch[1] + '项满足';
            return { verdict: verdict, failCodes: failCodes, basis: basis, restOk: restOk };
        }
        function clDedsFromDetails(details) {
            const isBad = function (r) {
                return r.score < 0 || (r.score === 0 && clZeroRowBad(r.evidence));
            };
            const map = new Map();
            details.forEach(function (r) {
                if (!isBad(r)) return;
                const key = r.item + '||' + r.action;
                let d = map.get(key);
                if (!d) { d = { item: r.item, action: r.action, count: 0, per: null, total: 0, orders: [], evidence: [] }; map.set(key, d); }
                d.count += 1;
                if (r.score < 0) { d.total += -r.score; if (d.per === null) d.per = -r.score; }
                if (r.orderNo && d.orders.indexOf(r.orderNo) < 0 && d.orders.length < 5) d.orders.push(String(r.orderNo));
                if (r.evidence && d.evidence.length < 3) d.evidence.push(r.evidence);
            });
            return Array.from(map.values()).map(function (d) {
                // 单次分值：负分行用 |score|；否则从动作文本尾部解析「；0.06分」
                if (d.per === null) {
                    const m = String(d.action || '').match(/[；;]\s*(\d+(?:\.\d+)?)\s*分\s*$/) || String(d.action || '').match(/(\d+(?:\.\d+)?)\s*分\s*$/);
                    if (m) d.per = Number(m[1]);
                }
                if (d.per !== null && d.total === 0) d.total = Math.round(d.per * d.count * 100) / 100;
                return d;
            }).sort(function (a, b) { return b.total - a.total || b.count - a.count; });
        }
        function clRuleFor(postKey) {
            if (CL_MEMO['rule|' + postKey]) return CL_MEMO['rule|' + postKey];
            const meta = POSTS_BY_KEY[postKey] || { name: postKey, color: '#94a3b8' };
            const raw = (LH_OK && LH.postRules) ? LH.postRules[postKey] : null;
            let rule;
            if (raw) {
                const items = (raw.items || []).map(function (it) {
                    return {
                        name: it.name,
                        cap: (typeof it.cap === 'number' && it.cap > 0) ? it.cap : 1,
                        per: (typeof it.per === 'number') ? it.per : 0.5,
                        perText: typeof it.per === 'string' ? it.per : '',
                        capWeekend: it.capWeekend, mustDo: it.mustDo || '', judge: it.judge || '',
                        noScore: it.noScore || '', where: it.where || '', evidence: it.evidence || '',
                        collected: (raw.collected || []).indexOf(it.name) >= 0,
                        deprecated: !!it.deprecated, extra: it.extra || []
                    };
                });
                rule = {
                    postKey: postKey, postName: raw.postName || meta.name, sheet: raw.sheet || '',
                    cap: raw.cap, capAvailable: raw.capAvailable || raw.cap,
                    capDeclared: raw.capDeclared, capSum: raw.capSum,
                    requireText: raw.requireText || '', draft: !!raw.draft,
                    basis: raw.basis || [], rawCols: raw.cols || [], items: items,
                    real: CL_REAL_POSTS.indexOf(postKey) >= 0
                };
            } else {
                rule = {
                    postKey: postKey, postName: meta.name, sheet: '', cap: CL_MOCK_ITEMS.length,
                    capAvailable: CL_MOCK_ITEMS.length, capDeclared: null, capSum: CL_MOCK_ITEMS.length,
                    requireText: '', draft: true, basis: [], rawCols: [],
                    items: CL_MOCK_ITEMS.map(function (n) {
                        return { name: n, cap: 1, per: 0.5, perText: '', capWeekend: null, mustDo: '', judge: '', noScore: '', where: '', evidence: '', collected: false, deprecated: false, extra: [] };
                    }),
                    real: false
                };
            }
            rule.scoreItems = rule.items.filter(function (it) { return rule.real ? it.collected : !it.deprecated; });
            if (!rule.scoreItems.length) rule.scoreItems = rule.items.slice(0, 4);
            rule.color = meta.color || '#94a3b8';
            rule.sourceText = rule.real ? '灯塔真实评分数据' : (rule.draft ? '规则草案 · 模拟数据' : '规则驱动模拟数据');
            CL_MEMO['rule|' + postKey] = rule;
            return rule;
        }
        function clOrgIndex() {
            if (CL_MEMO.org) return CL_MEMO.org;
            const stores = [], regionMap = new Map(), byCode = {};
            if (LH_OK) {
                LH.stores.forEach(function (s, i) {
                    const st = { idx: i, id: s.code, code: s.code, name: s.name, city: s.city, province: s.province, region: s.region, area: s.area };
                    stores.push(st); byCode[s.code] = st;
                    if (!regionMap.has(s.region)) regionMap.set(s.region, new Map());
                    const am = regionMap.get(s.region);
                    if (!am.has(s.area)) am.set(s.area, []);
                    am.get(s.area).push(i);
                });
            }
            const order = ['华东一区', '华东二区', '华东三区', '华中一区', '华中二区', '华南区', '华北区', '东北区', '西北区', '西南区', '英菲尼迪区域', '其它', '待确认', '其他'];
            const regions = Array.from(regionMap.keys()).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).map(function (rn) {
                const am = regionMap.get(rn);
                let cnt = 0; am.forEach(function (a) { cnt += a.length; });
                return {
                    name: rn, count: cnt,
                    areas: Array.from(am.keys()).sort().map(function (an) { return { name: an, stores: am.get(an), count: am.get(an).length }; })
                };
            });
            CL_MEMO.org = { stores: stores, regions: regions, byCode: byCode, allCodes: stores.map(function (s) { return s.code; }) };
            return CL_MEMO.org;
        }
        function clViewDate() {
            if (!CL_DATES.length) return '';
            return CL_DATES.indexOf(state.clDate) >= 0 ? state.clDate : CL_DATES[CL_DATES.length - 1];
        }
        function clAllowedDates() { const d = clViewDate(); return d ? [d] : []; }
        function clEffectiveDates() { return clAllowedDates(); }
        function clDataIndexFor(dates) {
            const key = dates.join(',') || '__none__';
            if (CL_MEMO['idx|' + key]) return CL_MEMO['idx|' + key];
            const dset = new Set(dates);
            const idx = { dates: dates, byPost: {}, persons: [], rows: [], pid: {} };
            CL_MEMO['idx|' + key] = idx;
            if (!LH_OK) return idx;
            LH.persons.forEach(function (p, i) {
                idx.persons.push({
                    code: p[0], name: p[1], post: p[2], storeIdx: p[3],
                    items: {}, score: 0, delivered: (LH.sales && LH.sales[i]) || 0, deductions: [], dedRows: []
                });
                (idx.byPost[p[2]] = idx.byPost[p[2]] || []).push(i);
                idx.rows.push([]);
            });
            const dc = LH.details.cols, dRows = LH.details.rows;
            const cPerson = dc.indexOf('person'), cDate = dc.indexOf('date'), cItem = dc.indexOf('item'),
                cAct = dc.indexOf('action'), cScore = dc.indexOf('score'), cEv = dc.indexOf('ev'), cOrder = dc.indexOf('order');
            dRows.forEach(function (r, ri) {
                if (!dset.has(LH.meta.dates[r[cDate]])) return;
                idx.rows[r[cPerson]].push(ri);
            });
            const sc = LH.sums.cols, sRows = LH.sums.rows;
            const sPerson = sc.indexOf('person'), sDate = sc.indexOf('date'), sItem = sc.indexOf('item'),
                sCount = sc.indexOf('count'), sScore = sc.indexOf('score');
            sRows.forEach(function (r) {
                if (!dset.has(LH.meta.dates[r[sDate]])) return;
                const p = idx.persons[r[sPerson]]; if (!p) return;
                const nm = LH.dict.items[r[sItem]]; if (!nm) return;
                const o = p.items[nm] || (p.items[nm] = { score: 0, count: 0, hasSum: false });
                if (r[sScore] !== null) { o.score += r[sScore]; o.hasSum = true; }
                if (r[sCount] !== null) o.count += r[sCount];
            });
            const dict = LH.dict;
            idx.persons.forEach(function (p, pi) {
                const dmap = new Map();
                idx.rows[pi].forEach(function (ri) {
                    const r = dRows[ri];
                    const nm = dict.items[r[cItem]] || '';
                    const o = p.items[nm];
                    if (!o || !o.hasSum) {
                        const oo = o || (p.items[nm] = { score: 0, count: 0, hasSum: false, noSum: true });
                        oo.score += r[cScore];
                    }
                    const pk = pi + '|' + nm;
                    (idx.pid[pk] = idx.pid[pk] || []).push(ri);
                    if (r[cScore] >= 0) return;
                    const act = dict.actions[r[cAct]] || '';
                    const gk = nm + '||' + act;
                    let d = dmap.get(gk);
                    if (!d) { d = { item: nm, action: act, per: 0, count: 0, total: 0, evidence: [], orders: [] }; dmap.set(gk, d); }
                    d.count += 1; d.total += -r[cScore]; d.per = Math.max(d.per, -r[cScore]);
                    if (r[cEv]) d.evidence.push(r[cEv]);
                    if (r[cOrder] >= 0) { const oc = dict.orders[r[cOrder]]; if (d.orders.indexOf(oc) < 0) d.orders.push(oc); }
                    p.dedRows.push({ ri: ri, order: r[cOrder] >= 0 ? dict.orders[r[cOrder]] : '', ev: r[cEv], act: act, item: nm, score: r[cScore] });
                });
                p.score = 0;
                for (const k in p.items) p.score += (p.items[k].score || 0);
                p.deductions = Array.from(dmap.values()).sort(function (a, b) { return b.total - a.total; });
            });
            return idx;
        }
        function clDataIndex() { return clDataIndexFor(clEffectiveDates()); }
        function closureScopeStores() {
            const org = clOrgIndex();
            const reg = state.closure.region, area = state.closure.area;
            return org.stores.filter(function (s) {
                if (reg && s.region !== reg) return false;
                if (area && s.area !== area) return false;
                return true;
            });
        }
        function clScopeSelect() {
            const scope = closureScopeStores();
            const ok = new Set(scope.map(function (s) { return s.code; }));
            if (state.closure.storeCodes !== null) {
                state.closure.storeCodes = state.closure.storeCodes.filter(function (c) { return ok.has(c); });
            }
            const codes = state.closure.storeCodes;
            return { scope: scope, scopeCodes: scope.map(function (s) { return s.code; }), sel: codes, selSet: codes ? new Set(codes) : null };
        }
        function clSelectedStoreIdx(sc) { return sc.sel === null ? sc.scope.map(function (s) { return s.idx; }) : sc.scope.filter(function (s) { return sc.selSet.has(s.code); }).map(function (s) { return s.idx; }); }
        function clTagOf(deds) {
            if (!deds.length) return { text: '动作全达标', warn: false };
            const top = deds[0], nm = clShortItem(top.item);
            return { text: (nm.length > 10 ? nm.slice(0, 10) + '…' : nm) + ' · 扣' + top.count + '单', warn: true };
        }
        function clMakePoint(rule, items, src) {
            const dims = [], ratios = [], counts = [];
            items.forEach(function (it) {
                const sm = src.itemOf(it.name);
                if (!sm) { dims.push(null); ratios.push(null); counts.push(null); return; }
                const v = sm.score || 0;
                dims.push(Math.round(v * 100) / 100);
                ratios.push(it.cap ? Math.max(0, Math.min(100, v / it.cap * 100)) : 0);
                counts.push(sm.count === undefined ? null : sm.count);
            });
            const points = dims.reduce(function (s, v) { return s + (v || 0); }, 0);
            const capAvail = rule.capAvailable || rule.cap || 1;
            // 评估覆盖：只统计该员工当日确有评估数据的拿分项（无数据项不计入分母，避免"没单=0分"的失真）
            let capCover = 0, coverCnt = 0;
            items.forEach(function (it, i) { if (dims[i] !== null) { capCover += it.cap; coverCnt++; } });
            // rate = 已评估口径达成率（主口径，用于状态分级）；rateFull = 严格满分口径
            const rate = capCover ? Math.max(0, Math.min(100, points / capCover * 100)) : 0;
            const rateFull = capAvail ? Math.max(0, Math.min(100, points / capAvail * 100)) : 0;
            const st = clStatusOf(rate);
            let wi = -1, wv = 1000;
            ratios.forEach(function (v, i) { if (v !== null && v < wv) { wv = v; wi = i; } });
            const deds = src.deductions || [];
            const dedCount = deds.reduce(function (s, d) { return s + d.count; }, 0);
            const dedTotal = deds.reduce(function (s, d) { return s + d.total; }, 0);
            return {
                key: src.real ? 'p' + src.idx : 'm' + src.code,
                idx: src.real ? src.idx : -1,
                name: src.name, code: src.code, postKey: rule.postKey, postName: rule.postName,
                storeIdx: src.store.idx, storeId: src.store.code, storeCode: src.store.code, storeName: src.store.name,
                region: src.store.region, area: src.store.area, real: !!src.real,
                dims: dims, ratios: ratios, counts: counts,
                points: Math.round(points * 100) / 100, cap: rule.cap, capAvailable: capAvail,
                capCover: Math.round(capCover * 100) / 100, coverCnt: coverCnt, coverTotal: items.length,
                rate: Math.round(rate * 10) / 10, rateFull: Math.round(rateFull * 10) / 10,
                status: st.label, statusCls: st.cls,
                weakestIdx: wi < 0 ? 0 : wi, weakestName: wi < 0 ? '—' : items[wi].name,
                weakestRate: wi < 0 ? 0 : Math.round(wv),
                deductions: deds, dedCount: dedCount, dedTotal: Math.round(dedTotal * 100) / 100,
                dedRows: src.dedRows || [], empCode: src.code || '',
                delivered: src.delivered || 0, tag: clTagOf(deds),
                noData: dims.every(function (v) { return v === null; })
            };
        }
        function clRealPoints(rule, storeIdx, sc) {
            const idx = clDataIndex();
            const items = rule.scoreItems;
            const out = [];
            (idx.byPost[rule.postKey] || []).forEach(function (pi) {
                const p = idx.persons[pi];
                const store = LH.stores[p.storeIdx];
                if (sc.selSet && !sc.selSet.has(store.code)) return;
                out.push(clMakePoint(rule, items, {
                    idx: pi, name: p.name, code: p.code, store: store, real: true,
                    itemOf: function (nm) { return p.items[nm]; },
                    deductions: p.deductions, dedRows: p.dedRows, delivered: p.delivered
                }));
            });
            return out;
        }
        function clMockPoints(rule, storeIdx, sc) {
            const org = clOrgIndex();
            const items = rule.scoreItems;
            const span = clViewDate() || 'nodate';   // v4.8：模拟岗位数据按闭环日报日期生成（翻页即换一份日报数据）
            const used = [];
            const out = [];
            storeIdx.forEach(function (si) {
                const store = org.stores[si];
                if (!store) return;
                const rnd = clRng('mock|' + rule.postKey + '|' + store.code + '|' + span);
                const name = personName(rnd, used);
                const quality = 0.42 + rnd() * 0.58;
                const itemOf = {}, deds = [];
                items.forEach(function (it) {
                    const cap = it.cap || 1;
                    const step = cap <= 1 ? 0.5 : Math.round(cap / 4 * 100) / 100;
                    let v = quality * cap * (0.62 + rnd() * 0.5);
                    v = Math.round(Math.min(cap, Math.max(0, v)) / step) * step;
                    v = Math.round(v * 100) / 100;
                    itemOf[it.name] = { score: v, count: Math.max(1, Math.round((cap <= 1 ? (v > 0 ? 1 : 0) : v) + rnd() * 3)), hasSum: true };
                    if (v < cap - 1e-6) {
                        const cnt = 1 + Math.floor(rnd() * 2);
                        const reason = String(it.noScore || it.judge || '未达到该项拿分条件').replace(/\s+/g, ' ').slice(0, 56);
                        deds.push({
                            item: it.name, action: it.name, per: it.per || 0.5, count: cnt,
                            total: Math.round((it.per || 0.5) * cnt * 100) / 100, mock: true,
                            evidence: ['判定=未满足|原因=' + reason + '|样本=' + cnt + '单'], orders: []
                        });
                    }
                });
                deds.sort(function (a, b) { return b.total - a.total; });
                out.push(clMakePoint(rule, items, {
                    idx: -1, name: name, code: 'M' + store.code, store: store, real: false,
                    itemOf: function (nm) { return itemOf[nm]; },
                    deductions: deds, dedRows: [], delivered: 1 + Math.floor(rnd() * 12)
                }));
            });
            return out;
        }
        function closureComputePoints() {
            const rule = clRuleFor(state.closure.postKey);
            const sc = clScopeSelect();
            const storeIdx = clSelectedStoreIdx(sc);
            const mockCapped = !rule.real && storeIdx.length > CL_MOCK_CAP;
            const list = rule.real
                ? clRealPoints(rule, storeIdx, sc)
                : clMockPoints(rule, storeIdx.slice(0, CL_MOCK_CAP), sc);
            list.sort(function (a, b) { return b.points - a.points || b.delivered - a.delivered; });
            CL_MEMO.range = { rule: rule, scope: sc.scope, scopeCodes: sc.scopeCodes, sel: sc.sel, storeIdx: storeIdx, mockCapped: mockCapped };
            return list;
        }
        function clDisposeChart(key) {
            if (extCharts[key]) { try { extCharts[key].dispose(); } catch (_) {} delete extCharts[key]; }
        }
        function clChartAxis() {
            return {
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                axisTick: { show: false },
                axisLabel: { color: '#94a3b8', fontSize: 11 },
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } }
            };
        }
        function clChartTooltip() {
            return {
                backgroundColor: 'rgba(11,18,32,0.95)', borderColor: 'rgba(148,163,184,0.2)',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,0.6);'
            };
        }
