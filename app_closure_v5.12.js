// 业务数据看板 v5.12 — 闭环看板渲染（P3-4 拆分，依赖 app_state）

        function clRenderHeat(points, rule) {
            const el = document.getElementById('clHeat'); if (!el) return;
            clDisposeChart('clHeat');
            const items = rule.scoreItems;
            const rows = points.length;
            el.style.height = Math.min(560, Math.max(260, rows * 32 + 100)) + 'px';
            const heat = echarts.init(el); extCharts.clHeat = heat;
            const data = [];
            const colAvg = items.map(function (_, c) {
                let s = 0, n = 0;
                points.forEach(function (p) { const v = p.ratios[c]; if (v !== null && v !== undefined) { s += v; n++; } });
                return n ? Math.round(s / n) : 0;
            });
            points.forEach(function (p, r) {
                items.forEach(function (it, c) {
                    const rt = p.ratios[c];
                    if (rt === null || rt === undefined) return;
                    data.push([c, r, rt, p.dims[c], p.counts[c], it.cap]);
                });
            });
            heat.setOption({
                animation: false,
                tooltip: Object.assign(clChartTooltip(), {
                    formatter: function (it) {
                        const p = points[it.value[1]];
                        if (!p || it.value[2] === null) return '';
                        const cap = it.value[5], cnt = it.value[4];
                        return '<div style="font-weight:700">' + p.name + ' · ' + p.storeName + '</div>' +
                            '<div style="margin-top:4px;max-width:300px;white-space:normal;color:#cbd5e1">' + items[it.value[0]].name + '</div>' +
                            '<div style="margin-top:4px">当日得分 <b style="color:#60a5fa">' + clNum(it.value[3]) + '</b> / ' + clNum(cap) +
                            ' <span style="opacity:.7">（达成 ' + Math.round(it.value[2]) + '%）</span></div>' +
                            (cnt === null || cnt === undefined ? '' : '<div style="opacity:.75;font-size:11px">完成单数 ' + cnt + '</div>') +
                            '<div style="opacity:.65;font-size:11px;margin-top:3px">当日积分 ' + clNum(p.points) + ' / ' + clNum(p.capAvailable) +
                            ' · 该列均值 ' + colAvg[it.value[0]] + '%</div>';
                    }
                }),
                grid: { left: 92, right: rows > 18 ? 40 : 14, top: 10, bottom: 48 },
                xAxis: {
                    type: 'category', data: items.map(function (it) { return clShortItem(it.name); }),
                    axisLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: 600, margin: 10, interval: 0, rotate: 0, formatter: function (v) { return v.length > 9 ? v.slice(0, 9) + '…' : v; } },
                    axisLine: { show: false }, axisTick: { show: false }
                },
                yAxis: {
                    type: 'category', data: points.map(function (p) { return p.name; }), inverse: true,
                    axisLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: 600, margin: 10, formatter: function (v) { return v.length > 6 ? v.slice(0, 6) + '…' : v; } },
                    axisLine: { show: false }, axisTick: { show: false }
                },
                visualMap: {
                    dimension: 2, // v4.7 修复：显式映射"达成率"维（默认取最后一维=该项满分，导致全图偏红）
                    min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: -2,
                    itemWidth: 12, itemHeight: 120, text: ['达成 100%', '0%'], textStyle: { color: '#cbd5e1', fontSize: 12 },
                    inRange: { color: ['#881337', '#b45309', '#f59e0b', '#65a30d', '#059669', '#2563eb'] }
                },
                dataZoom: rows > 18 ? [{ type: 'slider', yAxisIndex: 0, startValue: 0, endValue: 15, right: 2, width: 12, brushSelect: false, textStyle: { color: '#64748b', fontSize: 9 } }] : [],
                series: [{
                    type: 'heatmap',
                    data: data,
                    label: { show: true, fontSize: 12, color: '#fff', textBorderColor: 'rgba(0,0,0,0.45)', textBorderWidth: 2, formatter: function (it) { return clNum(it.value[3]); } },
                    itemStyle: { borderColor: 'rgba(11,18,32,0.85)', borderWidth: 2, borderRadius: 3 },
                    emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } }
                }]
            }, true);
            heat.on('click', function (p) { if (p.value && points[p.value[1]]) clOpenDrawer(p.value[1]); });
            try { heat.resize(); } catch (_) {}
            requestAnimationFrame(function () { try { heat.resize(); } catch (_) {} });
        }
        function clRenderQuad(points, rule) {
            const el = document.getElementById('clQuad'); if (!el) return;
            clDisposeChart('clQuad');
            el.style.height = '380px';
            const xs = points.map(function (p) { return p.points; });
            const ys = points.map(function (p) { return p.delivered || 0; });
            const avgX = xs.reduce(function (s, v) { return s + v; }, 0) / xs.length;
            const avgY = ys.reduce(function (s, v) { return s + v; }, 0) / ys.length;
            const xMax = Math.max(rule.capAvailable || rule.cap || 1, Math.max.apply(null, xs)) * 1.05;
            const xMin = 0;
            const yMaxV = Math.max.apply(null, ys);
            const yMax = yMaxV > 0 ? yMaxV * 1.15 + 0.5 : 1;
            const yMin = 0;
            const storeMap = new Map();
            points.forEach(function (p, i) {
                if (!storeMap.has(p.storeCode)) storeMap.set(p.storeCode, { name: p.storeName, idxs: [] });
                storeMap.get(p.storeCode).idxs.push(i);
            });
            const groups = Array.from(storeMap.values()).sort(function (a, b) { return b.idxs.length - a.idxs.length; });
            function mkSeries(name, color, idxs) {
                return {
                    name: name, type: 'scatter', symbolSize: 15,
                    itemStyle: { color: color, opacity: 0.85, borderColor: 'rgba(255,255,255,0.65)', borderWidth: 1.5, shadowBlur: 8, shadowColor: scaleColor(color, 0.4) },
                    emphasis: { focus: 'self', scale: 1.35 },
                    data: idxs.map(function (i) {
                        return { name: points[i].name, value: [Math.round(xs[i] * 100) / 100, ys[i]], _idx: i };
                    })
                };
            }
            const quad = echarts.init(el); extCharts.clQuad = quad;
            const byStore = groups.length > 1 && groups.length <= 8;
            const series = byStore
                ? groups.map(function (g, gi) { return mkSeries(g.name, closureStoreColor(gi), g.idxs); })
                : [mkSeries('全部人员', rule.color || '#3b82f6', points.map(function (_, i) { return i; }))];
            series[0].markLine = {
                silent: true, symbol: 'none', animation: false,
                data: [
                    { xAxis: avgX, label: { formatter: '积分均值 ' + avgX.toFixed(1), color: '#fbbf24', fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.2 } },
                    { yAxis: avgY, label: { formatter: '销量均值 ' + avgY.toFixed(1), color: '#fbbf24', fontSize: 10, position: 'insideEndTop' }, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.2 } }
                ]
            };
            series[0].markArea = {
                silent: true,
                data: [
                    [{ xAxis: avgX, yAxis: avgY, itemStyle: { color: 'rgba(16,185,129,0.1)' }, label: { show: true, position: 'insideTopRight', color: '#34d399', fontSize: 12, fontWeight: 700, formatter: '标杆 · 高积分高销量' } }, { xAxis: xMax, yAxis: yMax }],
                    [{ xAxis: xMin, yAxis: yMin, itemStyle: { color: 'rgba(244,63,94,0.1)' }, label: { show: true, position: 'insideBottomLeft', color: '#fb7185', fontSize: 12, fontWeight: 700, formatter: '待辅导 · 低积分低销量' } }, { xAxis: avgX, yAxis: avgY }],
                    [{ xAxis: xMin, yAxis: avgY, itemStyle: { color: 'transparent' }, label: { show: true, position: 'insideTopLeft', color: '#94a3b8', fontSize: 11, formatter: '高积分低销量 · 流程找卡点' } }, { xAxis: avgX, yAxis: yMax }],
                    [{ xAxis: avgX, yAxis: yMin, itemStyle: { color: 'transparent' }, label: { show: true, position: 'insideBottomRight', color: '#94a3b8', fontSize: 11, formatter: '低积分高销量 · 动作待复制' } }, { xAxis: xMax, yAxis: avgY }]
                ]
            };
            quad.setOption({
                animation: false,
                tooltip: Object.assign(clChartTooltip(), {
                    formatter: function (it) {
                        const p = points[it.data._idx];
                        if (!p) return '';
                        const top = p.deductions[0];
                        return '<div style="font-weight:700;margin-bottom:4px">' + p.name + '</div>' +
                            '<div style="opacity:.7;font-size:11px">' + p.storeName + ' · ' + rule.postName + '</div>' +
                            '<div style="margin-top:6px">当日积分：<b>' + clNum(p.points) + '</b> / ' + clNum(p.capAvailable) + ' 分</div>' +
                            '<div>满分达成率：<b>' + p.rate + '%</b></div>' +
                            '<div>销量：<b>' + fmt(it.value[1]) + '</b> 台</div>' +
                            '<div style="opacity:.7;font-size:11px;margin-top:4px">扣分单数 ' + p.dedCount +
                            (top ? ' · 主要 ' + clShortItem(top.item) : '') + '</div>' +
                            '<div style="color:#60a5fa;font-size:11px;margin-top:2px">点击查看证据链 →</div>';
                    }
                }),
                grid: { left: 48, right: 20, top: 30, bottom: 44 },
                xAxis: Object.assign({ type: 'value', name: '当日积分', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: xMin, max: xMax }, clChartAxis()),
                yAxis: Object.assign({ type: 'value', name: '销量（台）', nameLocation: 'middle', nameGap: 36, nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: yMin, max: yMax }, clChartAxis()),
                series: series
            }, true);
            quad.on('click', function (p) { if (p.data && p.data._idx !== undefined) clOpenDrawer(p.data._idx); });
            try { quad.resize(); } catch (_) {}
            requestAnimationFrame(function () { try { quad.resize(); } catch (_) {} });
            return byStore ? groups.map(function (g, gi) { return { name: g.name, color: closureStoreColor(gi) }; }) : [];
        }
        function clOpenDrawer(idx) {
            const ctx = CL_DRAW_CTX; if (!ctx) return;
            const d = document.getElementById('clDrawer'); if (!d) return;
            const p = ctx.points[idx], rule = ctx.rule;
            if (!p) return;
            // v5.9 修复③：拿分项清单与逐日表口径对齐 —— 真实导入行优先用 drillRealPoint 合并后的清单
            // （静态规则 + 导入自动补项，如产品专家导入的「到店接待」不在静态规则表内，旧代码致构成表漏行、
            // 表内合计 ≠ 头部当日积分、已评估 N/M 项 的第 M 项无处可看）；无合并清单时回退静态规则表。
            // dims/stds/ratios/counts 均按同一索引生成，故构成表、雷达图、扣分分布三者天然对齐
            const items = (p.itemNames && p.itemNames.length) ? p.itemNames.map(function (nm, i) {
                return { name: nm, cap: (p.itemCaps && p.itemCaps[i]) || 1 };
            }) : rule.scoreItems;
            // ---- 证据链条目：真实数据用明细行，模拟数据用扣分项证据 ----
            const tl = [];
            if (p.dedRows && p.dedRows.length) {
                p.dedRows.forEach(function (r) {
                    tl.push({ order: r.order || '', item: r.item, act: r.act, ev: r.ev || '', score: r.score });
                });
            } else {
                (p.deductions || []).forEach(function (dd) {
                    (dd.evidence || []).forEach(function (e) {
                        tl.push({ order: (dd.orders || [])[0] || '', item: dd.item, act: dd.action, ev: e, score: -dd.per });
                    });
                });
            }
            // v5.7：AI 证据链按「拿分项+动作」分组折叠 —— 导入明细是「一订单一条判定记录」（如非首访 23 个订单=23 条），
            // 平铺几十条过长且易误读为重复导入；组头显示判定数与达成/未达成计数，组内明细默认收起、点击展开
            const evSrcText = (p.dedRows && p.dedRows.length) ? '评分导入文件（AI 分析原因）' : '灯塔系统判定日志';
            const evIsBad = function (e) {
                if (Number(e.score) > 0) return false;   // v5.7：得分行（如 0.1 分）直接判达成，不看证据关键词
                // v5.9：0 分行改反向判定（与扣分明细 clDedsFromDetails 共用 clZeroRowBad）——描述式失败证据（0项命中/无收尾动作等）不再漏判
                return clZeroRowBad(e.ev);
            };
            const tlGroups = [];
            const tlGroupMap = new Map();
            tl.forEach(function (e) {
                const gk = e.item + '|' + e.act;
                let g = tlGroupMap.get(gk);
                if (!g) { g = { item: e.item, act: e.act, list: [] }; tlGroupMap.set(gk, g); tlGroups.push(g); }
                g.list.push(e);
            });
            // ---- 各拿分项扣分单数 ----
            const dedByItem = {};
            (p.deductions || []).forEach(function (dd) { dedByItem[dd.item] = (dedByItem[dd.item] || 0) + dd.count; });
            const totalDed = (p.deductions || []).reduce(function (s, x) { return s + x.total; }, 0);
            // v5.7：累计扣分为 0 时显示「累计 0 分」，不再出现「累计 -0 分」
            const dedTotalTxt = (totalDed > 0) ? ('-' + clNum(totalDed)) : '0';
            const srcCls = p.real ? 'real' : 'mock';
            // v5.7：真实导入行（sourceKind=import）来源徽章改「动作评分导入数据」，不再误标灯塔日报
            const srcText = (p.sourceKind === 'import') ? '动作评分导入数据' : (p.real ? '灯塔真实评分数据' : (rule.real ? '模拟数据' : '规则驱动模拟数据'));
            const itemRows = items.map(function (it, i) {
                const sc = p.dims[i], rt = p.ratios[i], cnt = p.counts[i], dn = dedByItem[it.name] || 0;
                const barC = rt === null ? '#475569' : (rt >= 95 ? '#10b981' : rt >= 85 ? '#3b82f6' : rt >= 70 ? '#fbbf24' : rt >= 50 ? '#fb923c' : '#fb7185');
                return '<tr class="border-b border-slate-700/30">' +
                    '<td class="py-2 px-2" style="color:#e2e8f0;font-weight:600">' + it.name + '</td>' +
                    '<td class="py-2 px-2 text-right font-semibold" style="color:' + barC + '">' + (sc === null ? '—' : clNum(sc)) + '</td>' +
                    '<td class="py-2 px-2 text-right" style="color:#94a3b8">' + clNum((p.stds && p.stds[i] != null) ? p.stds[i] : it.cap) + '</td>' +
                    '<td class="py-2 px-2" style="min-width:110px"><div class="flex items-center gap-2"><div class="cl-bar" style="flex:1"><i style="width:' + (rt === null ? 0 : Math.min(100, Math.max(2, Math.round(rt)))) + '%;background:' + barC + '"></i></div><span style="font-size:11px;color:#94a3b8">' + (rt === null ? '—' : Math.round(rt) + '%') + '</span></div></td>' +
                    '<td class="py-2 px-2 text-right" style="color:#cbd5e1">' + (cnt === null || cnt === undefined ? '—' : cnt) + '</td>' +
                    '<td class="py-2 px-2 text-right" style="color:' + (dn ? '#fb923c' : '#64748b') + '">' + dn + '</td>' +
                    '</tr>';
            }).join('');
            // v5.9c：分数明细（按「拿分项+动作」分卡片）—— 默认仅展示未达成；达成组折叠可查
            const sdGroups = tlGroups.map(function (g) {
                let badCnt = 0;
                g.list.forEach(function (e) { if (evIsBad(e)) badCnt++; });
                const okCnt = g.list.length - badCnt;
                const ded = (p.deductions || []).find(function (d) { return d.item === g.item && d.action === g.act; });
                const sampleBad = g.list.find(function (e) { return evIsBad(e); });
                const sampleEv = sampleBad ? sampleBad.ev : (g.list[0] ? g.list[0].ev : '');
                return {
                    group: g, failCount: badCnt, okCount: okCnt,
                    clauses: clParseClauses(g.act), ai: clParseAiReason(sampleEv),
                    deduction: ded, sampleEv: sampleEv, isBad: badCnt > 0
                };
            });
            const sdBad = sdGroups.filter(function (r) { return r.isBad; });
            const sdGood = sdGroups.filter(function (r) { return !r.isBad; });
            const sdGoodTotal = sdGood.reduce(function (s, r) { return s + r.group.list.length; }, 0);
            // ---- 单张分数明细卡片（共用渲染：isBad 控制配色） ----
            const renderScoreCard = function (rec) {
                const g = rec.group, ded = rec.deduction, ai = rec.ai, isBad = rec.isBad;
                const borderColor = isBad ? 'rgba(251,113,133,0.45)' : 'rgba(52,211,153,0.35)';
                const headerBg = isBad ? 'rgba(251,113,133,0.08)' : 'rgba(52,211,153,0.06)';
                // 条款清单 OR 整段回退（至少 2 条编号才展开清单，避免单条噪音）
                let bodyHtml;
                if (rec.clauses.length >= 2) {
                    const rows = rec.clauses.map(function (c) {
                        const mark = (ai.failCodes.length > 0) ? (ai.failCodes.indexOf(c.code) >= 0) : (ai.verdict === 'fail');
                        return '<tr><td style="padding:3px 6px;color:' + (mark ? '#fb7185' : '#34d399') + ';font-weight:700;width:22px">' + (mark ? '✗' : '✓') + '</td>' +
                            '<td style="padding:3px 6px;color:#e2e8f0;font-weight:600;width:62px">' + c.code + '</td>' +
                            '<td style="padding:3px 6px;color:#cbd5e1">' + (c.desc || '—') + '</td></tr>';
                    }).join('');
                    bodyHtml = '<div style="padding:10px 12px">' +
                        '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">动作要求</div>' +
                        '<table class="w-full text-xs">' + rows + '</table></div>';
                } else {
                    bodyHtml = '<div style="padding:10px 12px">' +
                        '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">动作要求</div>' +
                        '<div style="background:rgba(71,85,105,0.18);padding:8px 10px;border-radius:6px;color:#cbd5e1;font-size:12px;line-height:1.6">' + clShortItem(g.act) + '</div></div>';
                }
                // AI 判定行（结构化：结论/失败条款/依据/其余满足）
                const verdictTag = ai.verdict === 'fail' ? '<span class="cl-tag" style="background:rgba(251,113,133,0.18);color:#fb7185;font-weight:600">未满足</span>' :
                    ai.verdict === 'pass' ? '<span class="cl-tag" style="background:rgba(52,211,153,0.18);color:#34d399;font-weight:600">满足</span>' :
                    '<span class="cl-tag" style="color:#94a3b8">未判定</span>';
                const aiHtml = '<div style="padding:8px 12px;border-top:1px dashed rgba(71,85,105,0.4);font-size:12px">' +
                    '<span style="color:#94a3b8;margin-right:6px;font-size:11px">AI 判定：</span>' + verdictTag +
                    (ai.failCodes.length ? '<span style="margin-left:6px;color:#fb7185">失败条款 ' + ai.failCodes.join(' / ') + '</span>' : '') +
                    (ai.basis ? '<span style="margin-left:6px;color:#94a3b8">依据「' + ai.basis + '」</span>' : '') +
                    (ai.restOk ? '<span style="margin-left:6px;color:#34d399">' + ai.restOk + '</span>' : '') +
                    '</div>';
                // 头部徽章条
                const headHtml = '<div class="flex items-center gap-2 flex-wrap" style="padding:8px 12px;background:' + headerBg + ';border-bottom:1px solid ' + borderColor + '">' +
                    '<span class="cl-tag" style="background:rgba(' + (isBad ? '251,113,133' : '52,211,153') + ',0.18);color:' + (isBad ? '#fb7185' : '#34d399') + ';font-weight:600">' + g.item + '</span>' +
                    '<span style="color:#e2e8f0;font-size:13px;font-weight:600" title="' + String(g.act || '').replace(/"/g, '&quot;') + '">' + clShortItem(g.act) + '</span>' +
                    '<span style="flex:1"></span>' +
                    '<span style="font-size:11px;color:#94a3b8">' + g.list.length + ' 条判定</span>' +
                    (rec.failCount ? '<span style="font-size:11px;color:#fb7185;font-weight:600">未达成 ' + rec.failCount + '</span>' : '') +
                    (rec.okCount ? '<span style="font-size:11px;color:#34d399;font-weight:600">达成 ' + rec.okCount + '</span>' : '') +
                    (ded && Math.abs(ded.total) > 0 ? '<span style="font-size:11px;font-weight:700;color:#fb923c;background:rgba(245,158,11,0.15);padding:2px 6px;border-radius:4px">扣 ' + clNum(Math.abs(ded.total)) + ' 分</span>' : '') +
                    '</div>';
                // 底部：汇总 + 折叠每订单判定
                const evList = g.list.slice(0, 40).map(function (e, i) {
                    const pairs = clEvPairs(e.ev);
                    const bad = evIsBad(e);
                    return '<div style="padding:3px 0;border-bottom:1px dashed rgba(71,85,105,0.25)">' +
                        '<div class="flex items-center gap-2 flex-wrap"><span style="font-size:11px;font-weight:600;color:#e2e8f0">' + (e.order ? '订单 ' + e.order : '记录 ' + (i + 1)) + '</span>' +
                        (e.score < 0 ? '<span style="font-size:10px;color:#fb923c;font-weight:600">扣 ' + clNum(-e.score) + ' 分</span>' : (e.score > 0 ? '<span style="font-size:10px;color:#34d399;font-weight:600">得 ' + clNum(e.score) + ' 分</span>' : '')) + '</div>' +
                        (pairs.length ? '<div style="margin-top:1px">' + pairs.map(function (kv) {
                            return '<span class="cl-ev-kv"><b>' + kv.k + '</b>' + kv.v + '</span>';
                        }).join('') + '</div>' : '') +
                        '</div>';
                }).join('') + (g.list.length > 40 ? '<div style="color:#64748b;font-size:10px;padding-top:4px">… 其余 ' + (g.list.length - 40) + ' 条略</div>' : '');
                const footerHtml = '<div style="padding:8px 12px;background:rgba(15,23,42,0.4);font-size:11px;color:#94a3b8;display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-top:1px solid rgba(71,85,105,0.3)">' +
                    (ded ? '<span>单数 <b style="color:#e2e8f0">' + ded.count + '</b></span>' +
                        '<span>单次 <b style="color:#e2e8f0">' + (ded.per === null || ded.per === undefined ? '—' : clNum(ded.per)) + '</b></span>' +
                        '<span>累计 <b style="color:#fb923c">' + clNum(ded.total) + '</b></span>' +
                        '<span>关联 <b style="color:#e2e8f0">' + ded.orders.length + '</b> 单</span>' :
                        '<span>关联 <b style="color:#e2e8f0">' + g.list.length + '</b> 条判定</span>') +
                    '<span style="flex:1"></span>' +
                    '<details><summary style="cursor:pointer;color:#2563eb;font-size:11px;list-style:none">▸ 展开 ' + g.list.length + ' 条判定</summary>' +
                    '<div style="margin-top:6px;padding:6px;background:rgba(15,23,42,0.6);border-radius:4px">' + evList + '</div>' +
                    '</details></div>';
                return '<div style="border:1px solid ' + borderColor + ';border-radius:8px;margin-bottom:8px;overflow:hidden">' +
                    headHtml + bodyHtml + aiHtml + footerHtml + '</div>';
            };
            // ---- 装配分数明细 HTML ----
            const sdTitle = '<div class="cl-chart-title mb-2">分数明细 <span style="font-weight:400;color:#94a3b8">（共 ' + tlGroups.length + ' 组 · ' + sdBad.length + ' 组未达成 · 累计 ' + dedTotalTxt + ' 分；默认仅展示未达成，点击「展开达成判定」可查全达标）</span></div>';
            const sdBadHtml = sdBad.map(renderScoreCard).join('');
            let sdTailHtml;
            if (sdBad.length === 0 && sdGood.length > 0) {
                // 全达标场景：空态 + 折叠展开
                sdTailHtml = '<div style="padding:14px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);border-radius:8px;text-align:center">' +
                    '<div style="font-size:14px;color:#34d399;font-weight:600;margin-bottom:6px">✓ 当日无扣分记录 · 动作全达标</div>' +
                    '<details><summary style="cursor:pointer;font-size:12px;color:#2563eb;list-style:none">▸ 展开 ' + sdGoodTotal + ' 条达成判定</summary>' +
                    '<div style="margin-top:8px;text-align:left">' + sdGood.map(renderScoreCard).join('') + '</div>' +
                    '</details></div>';
            } else if (sdGood.length > 0) {
                // 部分达成：折叠达成组
                sdTailHtml = '<details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;color:#2563eb;list-style:none;padding:8px;background:rgba(37,99,235,0.08);border-radius:6px">▸ 展开 ' + sdGoodTotal + ' 条达成判定</summary>' +
                    '<div style="margin-top:8px">' + sdGood.map(renderScoreCard).join('') + '</div>' +
                    '</details>';
            } else {
                sdTailHtml = '';
            }
            const scoreDetailHtml = tlGroups.length ? (sdTitle + sdBadHtml + sdTailHtml) : '<div class="text-xs py-4" style="color:#64748b">当日无判定记录</div>';
            document.getElementById('clDrawerBody').innerHTML =
                '<div class="p-6 space-y-5">' +
                    '<div class="flex items-start justify-between gap-3 flex-wrap">' +
                        '<div class="flex items-center gap-3 flex-wrap">' +
                            '<div style="font-size:20px;font-weight:800;color:#f8fafc">' + p.name + ' <span style="font-size:12px;font-weight:500;color:#94a3b8">· ' + rule.postName + ' · 动作积分诊断</span></div>' +
                            '<span class="cl-status ' + p.statusCls + '">' + p.status + '</span>' +
                            '<span class="cl-tag' + (p.dedCount ? ' warn' : '') + '">' + p.tag.text + '</span>' +
                            '<span class="cl-src ' + srcCls + '">' + srcText + '</span>' +
                        '</div>' +
                        '<button data-cl-close class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center" style="color:#94a3b8;font-size:14px">✕</button>' +
                    '</div>' +
                    '<div class="flex gap-4 flex-wrap">' +
                        '<div class="cl-kpi" style="--kpi-c:' + rule.color + ';flex:1;min-width:150px"><div class="k-label">当日积分</div><div class="k-value">' + clNum(p.points) + ' <small>/ ' + clNum(p.capAvailable) + '</small></div><div class="k-sub">' + (rule.capAvailable !== rule.cap ? '规则满分 ' + clNum(rule.cap) + ' · 当日可得分项已接入' : '岗位规则满分') + '</div></div>' +
                        '<div class="cl-kpi" style="--kpi-c:#10b981;flex:1;min-width:150px"><div class="k-label">满分达成率</div><div class="k-value">' + p.rate + ' <small>%</small></div><div class="k-sub">最弱拿分项 ' + clShortItem(p.weakestName) + '（' + p.weakestRate + '%）</div></div>' +
                        '<div class="cl-kpi" style="--kpi-c:#f59e0b;flex:1;min-width:150px"><div class="k-label">扣分单数 / 累计扣分</div><div class="k-value">' + p.dedCount + ' <small>单</small></div><div class="k-sub">累计 ' + dedTotalTxt + ' 分</div></div>' +
                        '<div class="cl-kpi" style="--kpi-c:#2563eb;flex:1;min-width:150px"><div class="k-label">销量 / 交付</div><div class="k-value">' + fmt(p.delivered || 0) + ' <small>台</small></div><div class="k-sub">' + p.storeName + (p.empCode ? ' · 工号 ' + p.empCode : '') + '</div></div>' +
                    '</div>' +
                    '<div class="grid grid-cols-1 md:grid-cols-2 gap-5">' +
                        '<div><div class="cl-chart-title">拿分项得分 <span style="font-weight:400;color:#94a3b8">（虚线为团队均值，每个轴按该拿分项封顶）</span></div><div id="clRadar" style="height:280px"></div></div>' +
                        '<div><div class="cl-chart-title">扣分单数分布 <span style="font-weight:400;color:#94a3b8">（按拿分项）</span></div><div id="clWeek" style="height:280px"></div></div>' +
                    '</div>' +
                    '<div>' +
                        '<div class="cl-chart-title mb-2">拿分项得分构成 <span style="font-weight:400;color:#94a3b8">（当日积分 ' + clNum(p.points) + ' / ' + clNum(p.capAvailable) + ' 分 · 已评估 ' + p.coverCnt + '/' + p.coverTotal + ' 项 · 动作达成 ' + p.rate + '% · 严格口径 ' + p.rateFull + '%）</span></div>' +
                        '<table class="cl-table w-full text-sm"><thead class="text-xs"><tr>' +
                        '<th class="py-2 px-2 text-left font-medium">拿分项</th><th class="py-2 px-2 text-right font-medium">当日得分</th><th class="py-2 px-2 text-right font-medium">标准分</th><th class="py-2 px-2 text-left font-medium">达成率</th><th class="py-2 px-2 text-right font-medium">完成单数</th><th class="py-2 px-2 text-right font-medium">扣分单数</th>' +
                        '</tr></thead><tbody>' + itemRows + '</tbody></table>' +
                    '</div>' +
                    '<div>' + scoreDetailHtml + '</div>' +
                '</div>';
            d.classList.remove('hidden');
            // ---- 拿分项雷达（个人 vs 团队均值，各轴上限 = 拿分项标准分，缺省回退封顶） ----
            clDisposeChart('clRadar');
            const rd = echarts.init(document.getElementById('clRadar'));
            extCharts.clRadar = rd;
            const axisMaxOf = function (i) { return (p.stds && p.stds[i] != null && p.stds[i] > 0) ? p.stds[i] : (items[i] ? items[i].cap : 1); };
            rd.setOption({
                animation: false,
                legend: { bottom: 0, itemWidth: 14, textStyle: { color: '#94a3b8', fontSize: 11 } },
                tooltip: Object.assign(clChartTooltip(), {
                    formatter: function (it) {
                        if (!it.name && !it.seriesName) return '';
                        return '<div style="font-weight:700">' + it.seriesName + '</div>' +
                            it.name + '：<b>' + clNum(it.value) + '</b> / ' + clNum(axisMaxOf(it.dataIndex));
                    }
                }),
                radar: {
                    indicator: items.map(function (it, i) { return { name: clShortItem(it.name), max: axisMaxOf(i) }; }),
                    radius: '58%', center: ['50%', '46%'],
                    axisName: { color: '#94a3b8', fontSize: 10 },
                    splitArea: { areaStyle: { color: ['rgba(148,163,184,0.07)', 'rgba(148,163,184,0.02)'] } },
                    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
                    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } }
                },
                series: [{
                    type: 'radar',
                    data: [
                        { name: '个人得分', value: p.dims.map(function (v) { return v === null ? null : v; }), itemStyle: { color: '#2563eb' }, lineStyle: { color: '#2563eb', width: 2 }, areaStyle: { color: 'rgba(37,99,235,0.18)' } },
                        { name: '团队均值', value: ctx.teamScores, itemStyle: { color: '#f59e0b' }, lineStyle: { color: '#f59e0b', width: 1.5, type: 'dashed' }, areaStyle: { color: 'rgba(245,158,11,0.06)' } }
                    ]
                }]
            }, true);
            // ---- 扣分单数分布（按拿分项） ----
            clDisposeChart('clWeek');
            const wk = echarts.init(document.getElementById('clWeek'));
            extCharts.clWeek = wk;
            wk.setOption({
                animation: false,
                tooltip: Object.assign(clChartTooltip(), { formatter: function (it) { return it.name + '：<b>' + Number(it.value) + '</b> 单扣分'; } }),
                grid: { left: 46, right: 16, top: 24, bottom: 58 },
                xAxis: Object.assign({
                    type: 'category', data: items.map(function (it) { return clShortItem(it.name); }),
                    axisLabel: { color: '#94a3b8', fontSize: 10, interval: 0, rotate: 26, formatter: function (v) { return v.length > 8 ? v.slice(0, 8) + '…' : v; } }
                }, clChartAxis()),
                yAxis: Object.assign({ type: 'value', minInterval: 1 }, clChartAxis()),
                series: [{
                    type: 'bar', barWidth: 22,
                    data: items.map(function (it) { return dedByItem[it.name] || 0; }),
                    itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] },
                    label: { show: true, position: 'top', color: '#94a3b8', fontSize: 10 }
                }]
            }, true);
        }
        function clCloseDrawer() {
            const d = document.getElementById('clDrawer');
            if (d) d.classList.add('hidden');
            clDisposeChart('clRadar'); clDisposeChart('clWeek');
        }
        function renderClosure() {
            if (DATA_MODE === 'api') {
                apiLoading(true);
                preloadForRender().then(function (ok) { apiLoading(false); if (ok) renderClosureSync(); });
                return;
            }
            renderClosureSync();
        }
        function renderClosureSync() {
            const $bc = document.getElementById('boardClosure');
            if (!$bc) return;
            const postKey = state.closure.postKey;
            const rule = clRuleFor(postKey);
            const post = POSTS_BY_KEY[postKey] || { name: rule.postName, color: rule.color };
            const sc = clScopeSelect();
            const points = closureComputePoints();
            const personCount = points.length;
            const items = rule.scoreItems;
            const allItems = rule.items;
            // v4.8：闭环一律按日报游标取单日，不再受顶栏日期区间影响
            const viewDates = clAllowedDates();
            const topHits = viewDates;
            const storeCount = new Set(points.map(function (p) { return p.storeCode; })).size;

            // ---- 摘要 KPI（当日积分口径）----
            const sumPts = points.reduce(function (s, x) { return s + x.points; }, 0);
            const avgPts = personCount ? sumPts / personCount : 0;
            const avgRate = personCount ? points.reduce(function (s, x) { return s + x.rate; }, 0) / personCount : 0;
            const avgRateFull = personCount ? points.reduce(function (s, x) { return s + x.rateFull; }, 0) / personCount : 0;
            const avgCover = personCount ? points.reduce(function (s, x) { return s + x.coverCnt; }, 0) / personCount : 0;
            const zeroDed = points.filter(function (p) { return p.dedCount === 0; }).length;
            const dedOrders = points.reduce(function (s, p) { return s + p.dedCount; }, 0);
            const benchCnt = points.filter(function (p) { return p.rate >= 95; }).length;
            const riskCnt = points.filter(function (p) { return p.rate < 70; }).length;
            // 各拿分项团队达成率（列均值），用于定位最弱拿分项
            const itemAvg = items.map(function (it, i) {
                let s = 0, n = 0;
                points.forEach(function (p) { const v = p.ratios[i]; if (v !== null && v !== undefined) { s += v; n++; } });
                return n ? Math.round(s / n * 10) / 10 : 0;
            });
            let weakI = -1, weakV = 1e9;
            itemAvg.forEach(function (v, i) { if (v < weakV) { weakV = v; weakI = i; } });
            const kpis = [
                { label: '在岗人数', value: fmt(personCount) + ' <span class="text-slate-400 text-sm">人</span>', sub: '覆盖 ' + storeCount + ' 家专营店', color: post.color },
                { label: '人均当日积分', value: clNum(Math.round(avgPts * 10) / 10) + ' <span class="text-slate-400 text-sm">分</span>', sub: '满分 ' + clNum(rule.capAvailable) + ' 分/人' + (rule.capAvailable !== rule.cap ? '（规则 ' + clNum(rule.cap) + '）' : ''), color: '#a78bfa' },
                { label: '满分达成率', value: avgRate.toFixed(1) + '%', sub: '标杆（≥95%）' + benchCnt + ' 人', color: '#3b82f6' },
                { label: '零扣分占比', value: (personCount ? (zeroDed / personCount * 100) : 0).toFixed(1) + '%', sub: zeroDed + ' / ' + personCount + ' 人动作全达标', color: '#10b981' },
                { label: '扣分单数', value: fmt(dedOrders) + ' <span class="text-slate-400 text-sm">单</span>', sub: '人均 ' + (personCount ? (dedOrders / personCount).toFixed(1) : '0.0') + ' 单', color: '#f59e0b' },
                { label: '最弱拿分项', value: '<span style="font-size:16px">' + (weakI < 0 ? '—' : clShortItem(items[weakI].name)) + '</span>', sub: weakI < 0 ? '—' : '团队达成率 ' + weakV.toFixed(1) + '%', color: '#fb7185' }
            ];
            const kpiHtml = '<div class="closure-grid-6">' + kpis.map(function (k) {
                return '<div class="closure-cell" style="--cell-color:' + k.color + '">' +
                    '<div class="cc-label">' + k.label + '</div>' +
                    '<div class="cc-value">' + k.value + '</div>' +
                    '<div class="cc-delta" style="color:#94a3b8">' + k.sub + '</div>' +
                    '</div>';
            }).join('') + '</div>';

            // ---- 动作分 4 卡（规则满分 / 达成分布 / 采集接入度）----
            const collectedCnt = allItems.filter(function (it) { return it.collected; }).length;
            const scoreKpis = [
                { label: '团队动作达成率', val: avgRate.toFixed(1), unit: '%', sub: '已评估拿分项口径 · 严格满分口径 ' + avgRateFull.toFixed(1) + '%', c: '#2563eb' },
                { label: '标杆人数（≥95%）', val: String(benchCnt), unit: '人', sub: personCount ? '占比 ' + Math.round(benchCnt / personCount * 100) + '%' : '—', c: '#10b981' },
                { label: '待辅导人数（<70%）', val: String(riskCnt), unit: '人', sub: personCount ? '占比 ' + Math.round(riskCnt / personCount * 100) + '%' : '—', c: '#f43f5e' },
                { label: '已接入拿分项', val: collectedCnt + ' / ' + allItems.length, unit: '项', sub: rule.real ? '当日可得分上限 ' + clNum(rule.capAvailable) + ' 分' : '规则驱动模拟数据', c: '#06b6d4' }
            ];
            const actKpiHtml = '<div class="cl-grid-4">' + scoreKpis.map(function (k) {
                return '<div class="cl-kpi" style="--kpi-c:' + k.c + '">' +
                    '<div class="k-label">' + k.label + '</div>' +
                    '<div class="k-value">' + k.val + ' <small>' + k.unit + '</small></div>' +
                    '<div class="k-sub">' + k.sub + '</div>' +
                    '</div>';
            }).join('') + '</div>';

            // ---- 岗位 chip（含数据来源与规则项数标识）----
            const postChipsHtml = '<div class="flex flex-wrap gap-2">' + POSTS.map(function (p) {
                const on = p.key === state.closure.postKey;
                const isReal = CL_REAL_POSTS.indexOf(p.key) >= 0;
                const rawRule = (LH_OK && LH.postRules) ? LH.postRules[p.key] : null;
                const itemCnt = rawRule ? (rawRule.items || []).length : CL_MOCK_ITEMS.length;
                return '<span class="post-chip' + (on ? ' on' : '') + '" data-post="' + p.key + '" ' +
                    'style="--chip-color:' + p.color + ';--chip-color-12:' + scaleColor(p.color, 0.16) + ';--chip-color-30:' + scaleColor(p.color, 0.3) + ';--chip-color-50:' + scaleColor(p.color, 0.5) + '">' +
                    '<span class="pc-dot"></span>' + p.name +
                    '<span class="cl-src ' + (isReal ? 'real' : 'mock') + '" style="margin-left:6px">' + (isReal ? '真实' : '模拟') + '</span>' +
                    '<span style="font-size:10px;opacity:.6;margin-left:4px">' + itemCnt + '项</span>' +
                    '</span>';
            }).join('') + '</div>';

            // ---- 组织筛选：大区 → 小区 → 门店（真实专营店 · 搜索式多选）----
            const org = clOrgIndex();
            const regions = org.regions;
            const curRegion = state.closure.region ? regions.filter(function (r) { return r.name === state.closure.region; })[0] : null;
            const areas = curRegion ? curRegion.areas : [];
            const scopeStores = sc.scope;

            const regionChipHtml = '<div class="flex flex-wrap gap-2">' +
                '<button class="cl-chip-pick' + (!state.closure.region ? ' on' : '') + '" data-closure-region="">全国<span class="cl-chip-cnt">' + org.stores.length + '</span></button>' +
                regions.map(function (rg) {
                    return '<button class="cl-chip-pick' + (state.closure.region === rg.name ? ' on' : '') + '" data-closure-region="' + rg.name + '">' + rg.name + '<span class="cl-chip-cnt">' + rg.count + '</span></button>';
                }).join('') + '</div>';

            const areaChipHtml = !curRegion ? '' :
                '<div class="mt-2"><div class="text-[11px] text-slate-500 mb-1.5">小区（选填，可进一步收窄）</div>' +
                '<div class="flex flex-wrap gap-2">' +
                '<button class="cl-chip-pick' + (!state.closure.area ? ' on' : '') + '" data-closure-area="">全部小区<span class="cl-chip-cnt">' + curRegion.count + '</span></button>' +
                areas.map(function (ar) {
                    return '<button class="cl-chip-pick' + (state.closure.area === ar.name ? ' on' : '') + '" data-closure-area="' + ar.name + '">' + ar.name + '<span class="cl-chip-cnt">' + ar.count + '</span></button>';
                }).join('') + '</div></div>';

            // 门店：搜索过滤 + 多选；范围过大时仅渲染前 N 家，避免一次生成数百 DOM
            const STORE_SHOW_LIMIT = 60;
            const q = (state.closure.storeSearch || '').trim();
            const matched = q ? scopeStores.filter(function (s) { return s.name.indexOf(q) >= 0 || String(s.code).indexOf(q) >= 0; }) : scopeStores;
            const shown = matched.slice(0, q ? 120 : STORE_SHOW_LIMIT);
            const explicit = sc.sel !== null; // 是否存在显式门店勾选（false = 范围内全部生效）
            const selStores = explicit ? scopeStores.filter(function (s) { return sc.selSet.has(s.code); }) : [];
            const storeChipHtml = '<div class="store-chip-row">' + shown.map(function (s, idx) {
                const on = explicit && sc.selSet.has(s.code);
                const c = on ? closureStoreColor(idx % 8) : '#475569';
                return '<span class="pk-opt' + (on ? ' on' : '') + '" data-store="' + s.code + '" title="' + s.name + ' · ' + s.region + ' / ' + s.area + '">' +
                    '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + ';margin-right:6px"></span>' + s.name + '</span>';
            }).join('') + (!scopeStores.length ? '<span class="text-xs text-slate-500">该范围下暂无专营店</span>'
                : (q && !matched.length ? '<span class="text-xs" style="color:#fbbf24">未找到匹配「' + q + '」的门店，试试其他关键词或更换大区 / 小区</span>' : '')) + '</div>';
            const storeMoreHint = (matched.length > shown.length)
                ? '<div class="text-[11px] mb-1.5" style="color:#fbbf24">匹配 ' + matched.length + ' 家，仅展示前 ' + shown.length + ' 家 · 请用搜索或收窄大区 / 小区</div>'
                : '';
            const storeActionHtml =
                '<button class="quick-btn' + (state.closure.storeMulti ? ' active' : '') + '" data-store-action="multi">' + (state.closure.storeMulti ? '☑ 多选（已开启）' : '☐ 多选') + '</button>' +
                '<button class="quick-btn" data-store-action="all">全部生效</button>' +
                '<button class="quick-btn" data-store-action="clear">清空</button>';
            const storeHint = explicit
                ? '已选 <strong class="text-slate-200">' + selStores.length + '</strong> / ' + scopeStores.length + ' 家 · 点击门店勾选 / 取消'
                : '未单独勾选门店 · 当前范围 <strong class="text-slate-200">' + scopeStores.length + '</strong> 家全部生效 · 点击门店可单独勾选';

            const storeScopeHtml =
                '<div><div class="text-xs text-slate-400 mb-2">大区（按专营店主数据表「销售大区」归属，v4.17）</div>' + regionChipHtml + '</div>' +
                areaChipHtml +
                '<div class="mt-2">' +
                    '<div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2">' +
                        '<div class="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">门店<span class="text-[11px] text-slate-500">当前范围 ' + scopeStores.length + ' 家</span>' +
                            '<input id="clStoreSearch" class="cl-search" type="text" placeholder="搜索门店名 / 编码（按回车或点搜索）" value="' + (q || '') + '" autocomplete="off">' +
                            '<button class="quick-btn" data-store-action="search-apply">搜索</button>' +
                            '<button class="quick-btn" data-store-action="search-clear">清除</button>' +
                            '</div>' +
                        '<div class="flex items-center gap-2 flex-wrap justify-self-center">' + storeActionHtml + '</div>' +
                        '<span class="text-xs text-slate-400 justify-self-end text-right">' + storeHint + '</span>' +
                    '</div>' +
                    storeMoreHint + storeChipHtml +
                '</div>';

            // v4.8：日期相关提示已移除（闭环日期由日报翻阅器决定，不再出现「不重叠 / 单日降级」说明，也不展示环比口径）
            const dateHint =
                (!CL_DATES.length
                    ? '<div class="mt-3 text-xs px-3 py-2 rounded-lg" style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);color:#fbbf24">未加载到灯塔评分数据文件（lighthouse_scoring_v4.6.js），当前展示的是规则驱动模拟数据。</div>'
                    : '')
                + ((CL_MEMO.range && CL_MEMO.range.mockCapped)
                    ? '<div class="mt-3 text-xs px-3 py-2 rounded-lg" style="background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.25);color:#94a3b8">模拟岗位渲染上限：当前范围 ' + CL_MEMO.range.storeIdx.length + ' 家专营店，仅展示前 ' + CL_MOCK_CAP + ' 家（模拟数据）。收窄大区 / 小区或切换「真实」岗位可查看全量。</div>'
                    : '');
            const ctxHtml = '<span class="closure-context">日报日期 <strong>' + (clViewDate() || '无') + '</strong> · 岗位 <strong>' + rule.postName + '</strong>' +
                ' · 门店 <strong>' + (explicit ? selStores.length : scopeStores.length) + '</strong> 家 · 在岗 <strong>' + personCount + '</strong> 人</span>';

            // ---- v4.8：独立日报翻阅器（◀ 日期 ▾ ▶）----
            const pagerIdx = Math.max(0, CL_DATES.indexOf(clViewDate()));
            const pagerHtml = CL_DATES.length ? (
                '<div class="cl-daily-pager">' +
                    '<span class="cl-dp-title">积分日报</span>' +
                    '<button class="quick-btn cl-dp-nav" data-cl-pager="prev"' + (pagerIdx <= 0 ? ' disabled' : '') + ' title="上一份日报">◀ 上一份</button>' +
                    '<select id="clDateSelect" title="选择日报日期">' +
                        CL_DATES.map(function (d) { return '<option value="' + d + '"' + (d === clViewDate() ? ' selected' : '') + '>' + d + '</option>'; }).join('') +
                    '</select>' +
                    '<button class="quick-btn cl-dp-nav" data-cl-pager="next"' + (pagerIdx >= CL_DATES.length - 1 ? ' disabled' : '') + ' title="下一份日报">下一份 ▶</button>' +
                    '<span class="cl-dp-meta">第 ' + (pagerIdx + 1) + ' / ' + CL_DATES.length + ' 份 · 数据源：' + (LH_OK ? '灯塔评分明细' : '规则驱动模拟') + '</span>' +
                    '<span class="cl-dp-meta" style="margin-left:auto">闭环按此处选定的单日日报取数，与顶栏区间无关</span>' +
                '</div>'
            ) : '';

            $bc.innerHTML = '<section class="space-y-6">' +
                // 筛选（层级范围）
                '<div class="panel p-5 space-y-4">' +
                    '<div class="flex items-center justify-between gap-3 flex-wrap">' +
                        '<div>' +
                            '<div class="panel-title"><span class="dot"></span>岗位 × 门店 筛选</div>' +
                            '<div class="panel-subtitle">单岗位 × 多门店 · 先选范围，再在下方固定栏选择岗位</div>' +
                        '</div>' + ctxHtml +
                    '</div>' +
                    '<div>' + storeScopeHtml + '</div>' +
                '</div>' +
                // 岗位固定栏（滚动吸顶）
                '<div class="cl-post-sticky">' +
                    '<div class="flex items-center gap-3 flex-wrap">' +
                        '<span class="text-xs font-bold whitespace-nowrap" style="color:#94a3b8">岗位（单选）</span>' +
                        postChipsHtml +
                        '<span class="text-[11px] ml-auto whitespace-nowrap" style="color:#94a3b8">↓ 滚动时本栏固定 · 「真实」= 灯塔评分明细 · 「模拟」= 规则驱动演示数据</span>' +
                    '</div>' +
                '</div>' +
                // 业务 KPI
                '<div>' + kpiHtml + '</div>' +
                dateHint +
                // 动作积分：4 卡 + 热力图 + 四象限
                '<div class="panel p-6">' +
                    '<div class="flex items-start justify-between mb-3 flex-wrap gap-3">' +
                        '<div>' +
                            '<div class="panel-title"><span class="dot"></span>' + rule.postName + ' · 动作积分与规则达成</div>' +
                            '<div class="panel-subtitle">满分 ' + clNum(rule.capAvailable) + ' 分 · 按 ' + items.length + ' 个已接入拿分项计分（' + rule.sourceText + '）· 点击热力图 / 散点 / 明细行可查看个人证据链</div>' +
                        '</div>' +
                        '<div class="text-xs text-slate-400">共 ' + personCount + ' 人 · 数据日期 ' + (viewDates.join('、') || '无') + '</div>' +
                    '</div>' +
                    // v4.8：积分日报翻阅器 —— 与「动作积分与规则达成」绑定展示（切日报即换本节数据）
                    pagerHtml +
                    actKpiHtml +
                    (personCount ?
                        '<div class="grid grid-cols-1 gap-6 mt-5">' +
                            '<div>' +
                                '<div class="cl-chart-title">人员 × 拿分项 得分热力图</div>' +
                                '<div class="cl-chart-sub">颜色 = 达成率（越低越红）· 标签 = 当日得分 · 某行整体偏红 = 个体问题 · 某列整体偏红 = 流程 / 培训问题</div>' +
                                '<div id="clHeat" class="mt-2"></div>' +
                            '</div>' +
                            '<div>' +
                                '<div class="cl-chart-title">当日积分 × 销量四象限</div>' +
                                '<div class="cl-chart-sub">横坐标 = 当日积分 · 纵坐标 = 销量（配套数据）· 虚线 = 各自平均值 · 右上标杆 / 左下待辅导</div>' +
                                '<div id="clQuad" class="mt-2"></div>' +
                                '<div class="scatter-legend" id="closureLegend"></div>' +
                            '</div>' +
                        '</div>'
                        : '<div class="closure-empty"><div class="ce-icon">○</div><div>' + (viewDates.length ? '所选岗位在这些门店暂无在岗人员' : '当前日报日期无可用评分数据') + '</div><div class="text-xs text-slate-500">' + (viewDates.length ? '试试切换其他岗位，或调整门店范围' : '请确认已加载 lighthouse_scoring_v4.6.js 数据文件') + '</div></div>'
                    ) +
                '</div>' +
                // 人员积分排名与证据链
                '<div class="panel p-6">' +
                    '<div class="flex items-center justify-between mb-1 flex-wrap gap-3">' +
                        '<div>' +
                            '<div class="panel-title"><span class="dot"></span>人员积分排名与证据链</div>' +
                            '<div class="panel-subtitle">按当日积分降序 · 积分 = 各拿分项得分之和（满分 ' + clNum(rule.capAvailable) + ' 分）· 点击任意行查看扣分明细与 AI 证据链</div>' +
                        '</div>' +
                        '<div class="text-xs text-slate-400">共 ' + personCount + ' 人</div>' +
                    '</div>' +
                    '<div class="mt-4 max-h-[520px] overflow-auto">' +
                    (personCount ?
                        '<table class="cl-table w-full text-sm"><thead class="text-xs sticky top-0">' +
                        '<tr>' +
                        '<th class="py-2 px-2 text-left font-medium">名次</th>' +
                        '<th class="py-2 px-2 text-left font-medium">姓名 / 专营店 · 岗位</th>' +
                        '<th class="py-2 px-2 text-right font-medium">当日积分</th>' +
                        '<th class="py-2 px-2 text-right font-medium">满分</th>' +
                        '<th class="py-2 px-2 text-left font-medium">达成率</th>' +
                        '<th class="py-2 px-2 text-right font-medium">扣分单数</th>' +
                        '<th class="py-2 px-2 text-left font-medium">最弱拿分项</th>' +
                        '<th class="py-2 px-2 text-left font-medium">主要扣分项</th>' +
                        '<th class="py-2 px-2 text-center font-medium">状态</th>' +
                        '<th class="py-2 px-2 text-right font-medium">明细</th>' +
                        '</tr></thead>' +
                        '<tbody id="closureTbody"></tbody></table>'
                        : '<div class="text-center text-slate-500 py-8">所选条件下无人员</div>'
                    ) + '</div>' +
                '</div>' +
                // 岗位动作规则视图（灯塔规则主数据）
                renderRuleView(rule, items) +
            '</section>';

            // 抽屉上下文（团队均值与拿分项一一对应）
            CL_DRAW_CTX = {
                points: points, rule: rule, dates: viewDates,
                teamScores: items.map(function (it, i) {
                    return itemAvg[i] ? Math.round(itemAvg[i] / 100 * it.cap * 100) / 100 : 0;
                })
            };
            // 岗位吸顶栏偏移 = 顶栏实际高度（避免硬编码错位）
            (function () {
                const bar = $bc.querySelector('.cl-post-sticky');
                const tb = document.querySelector('.topbar');
                if (bar && tb) bar.style.top = tb.offsetHeight + 'px';
            })();

            // ---- 表格行（按当日积分降序）----
            const $tb = document.getElementById('closureTbody');
            if ($tb && points.length) {
                $tb.innerHTML = points.map(function (x, pi) {
                    let badgeCls = 'normal', badgeText = String(pi + 1);
                    if (pi === 0) { badgeCls = 'gold'; }
                    else if (pi === 1) { badgeCls = 'silver'; }
                    else if (pi === 2) { badgeCls = 'bronze'; }
                    const mainItem = x.deductions.length
                        ? clShortItem(x.deductions[0].item) + (x.deductions.length > 1 ? ' <span style="color:#94a3b8">+' + (x.deductions.length - 1) + '</span>' : '')
                        : '<span style="color:#94a3b8">—</span>';
                    const scoreC = x.rate >= 95 ? '#34d399' : (x.rate >= 85 ? '#60a5fa' : (x.rate >= 70 ? '#fbbf24' : '#fb7185'));
                    return '<tr data-person-detail="' + pi + '">' +
                        '<td class="py-2 px-2"><span class="closure-rank-badge ' + badgeCls + '">' + badgeText + '</span></td>' +
                        '<td class="py-2 px-2">' +
                            '<div class="font-medium text-slate-100">' + x.name + '</div>' +
                            '<div class="text-xs" style="color:#94a3b8">' + x.storeName + ' · ' + rule.postName + (x.empCode ? ' · 工号 ' + x.empCode : '') + '</div>' +
                        '</td>' +
                        '<td class="py-2 px-2 text-right font-bold" style="color:' + scoreC + '">' + clNum(x.points) + '</td>' +
                        '<td class="py-2 px-2 text-right" style="color:#94a3b8">' + clNum(x.capAvailable) + '</td>' +
                        '<td class="py-2 px-2" style="min-width:132px"><div class="flex items-center gap-2"><div class="cl-bar" style="flex:1"><i style="width:' + Math.max(2, Math.round(x.rate)) + '%;background:' + scoreC + '"></i></div><span style="font-size:11px;color:' + scoreC + '">' + x.rate + '%</span></div>' +
                        '<div class="text-[10px] mt-0.5" style="color:#64748b">已评估 ' + x.coverCnt + '/' + x.coverTotal + ' 项 · 严格口径 ' + x.rateFull + '%</div></td>' +
                        '<td class="py-2 px-2 text-right" style="color:' + (x.dedCount ? '#fb923c' : '#64748b') + '">' + x.dedCount + '</td>' +
                        '<td class="py-2 px-2 text-xs" style="color:#cbd5e1">' + clShortItem(x.weakestName) + ' <span style="color:#fb923c;font-size:11px">(' + x.weakestRate + '%)</span></td>' +
                        '<td class="py-2 px-2 text-xs" style="color:#cbd5e1">' + mainItem + '</td>' +
                        '<td class="py-2 px-2 text-center"><span class="cl-status ' + x.statusCls + '">' + x.status + '</span></td>' +
                        '<td class="py-2 px-2 text-right text-xs font-semibold" style="color:#60a5fa">明细 →</td>' +
                        '</tr>';
                }).join('');
            }

            // ---- 热力图 + 四象限（容器随 innerHTML 重建，图表必须重新 init）----
            if (personCount) {
                clRenderHeat(points, rule);
                const legend = clRenderQuad(points, rule) || [];
                const $leg = document.getElementById('closureLegend');
                if ($leg) {
                    $leg.innerHTML = legend.length
                        ? legend.map(function (g) { return '<span class="sl-item"><span class="sl-dot" style="background:' + g.color + '"></span>' + g.name + '</span>'; }).join('')
                        : '<span class="sl-item"><span class="sl-dot" style="background:' + (rule.color || '#3b82f6') + '"></span>' + rule.postName + ' · 全部人员</span>';
                }
            }
        }
        function renderRuleView(rule, items) {
            const rows = rule.items.map(function (it) {
                const st = it.deprecated ? '<span class="cl-tag">已取消</span>'
                    : (it.collected ? '<span class="cl-src real">已接入</span>' : '<span class="cl-src mock">待接入</span>');
                return '<tr class="' + (it.deprecated ? 'dep' : '') + '">' +
                    '<td style="color:#e2e8f0;font-weight:600;white-space:nowrap">' + (clItemAlias(it.name) || '<span style="color:#64748b">—</span>') + '</td>' +
                    '<td style="color:#cbd5e1;font-size:11px;max-width:130px">' + it.name + '</td>' +
                    '<td>' + (it.perText || (it.per ? clNum(it.per) : '—')) + '</td>' +
                    '<td>' + clNum(it.cap) + (it.capWeekend !== null && it.capWeekend !== undefined ? ' / 周末 ' + clNum(it.capWeekend) : '') + '</td>' +
                    '<td>' + (it.mustDo || '—') + '</td>' +
                    '<td>' + (it.judge || '—') + '</td>' +
                    '<td>' + (it.noScore || '—') + '</td>' +
                    '<td>' + (it.where || '—') + '</td>' +
                    '<td>' + st + '</td>' +
                    '</tr>';
            }).join('');
            const monthly = (LH_OK && LH.monthlyRules ? LH.monthlyRules : []).filter(function (m) { return m.post === rule.postName; });
            const monthlyHtml = monthly.length ? (state.closure.showMonthly ?
                '<div class="overflow-auto mt-3"><table class="cl-rule-table"><thead><tr><th>类型</th><th>积分类型</th><th>考核指标项</th><th>规则</th><th>数据可得性</th><th>数据来源</th></tr></thead><tbody>' +
                monthly.map(function (m) {
                    return '<tr><td>' + m.kind + '</td><td>' + m.cls + '</td><td style="color:#e2e8f0">' + m.item + '</td><td>' + m.rule + '</td><td>' + m.category + '</td><td style="color:#94a3b8">' + m.dataSource + '</td></tr>';
                }).join('') + '</tbody></table></div>'
                : '<div class="text-xs mt-2" style="color:#64748b">另有 ' + monthly.length + ' 条月度 / 扣分考核项，点击右上「展开月度考核项」查看。</div>') : '';
            return '<div class="panel p-6">' +
                '<div class="flex items-start justify-between mb-3 flex-wrap gap-3">' +
                    '<div>' +
                        '<div class="panel-title"><span class="dot"></span>' + rule.postName + ' · 岗位日积分规则（灯塔规则主数据）</div>' +
                        '<div class="panel-subtitle">来源 sheet：' + (rule.sheet || '—') + ' · 规则满分 ' + clNum(rule.cap) + ' 分 · 已接入 ' + items.length + ' 项 / 规则共 ' + rule.items.length + ' 项' +
                        (rule.requireText ? ' · 规则声明：' + rule.requireText : '') + (rule.draft ? ' · <span style="color:#fbbf24">规则草案（公式未定稿）</span>' : '') + '</div>' +
                    '</div>' +
                    '<div class="flex items-center gap-2">' +
                        (monthly.length ? '<button class="quick-btn" data-cl-rule="monthly">' + (state.closure.showMonthly ? '收起月度考核项' : '展开月度考核项') + '</button>' : '') +
                        '<button class="quick-btn' + (state.closure.showRules ? ' active' : '') + '" data-cl-rule="toggle">' + (state.closure.showRules ? '收起规则表' : '展开规则表') + '</button>' +
                    '</div>' +
                '</div>' +
                (state.closure.showRules ?
                    '<div class="overflow-auto"><table class="cl-rule-table"><thead><tr>' +
                    '<th>映射</th><th>拿分项</th><th>单次分值</th><th>封顶（日常 / 周末）</th><th>拿分必须做到</th><th>判断逻辑</th><th>不计分情况</th><th>看哪里（凭证）</th><th>采集状态</th>' +
                    '</tr></thead><tbody>' + rows + '</tbody></table></div>' + monthlyHtml
                    : '<div class="text-xs" style="color:#64748b">规则表已收起，点击右上「展开规则表」查看 ' + rule.items.length + ' 个拿分项的分值与判定口径。</div>') +
                '</div>';
        }
