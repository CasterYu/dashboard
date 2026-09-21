// 业务数据看板 v5.12 — 工具函数与日期状态（P3 抽离，须在 data_v5.12.js 之后加载）

        // ==================== PART1：基础常量与工具 ====================
        const ONE_DAY = 86400000;
        // v3.8：DAYS/TODAY/START_DATE 改为可变 —— API 模式下以服务端数据范围为准（见数据源层 bootApi）
        let DAYS = 365;
        let TODAY = (function () { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
        let START_DATE = new Date(TODAY.getTime() - (DAYS - 1) * ONE_DAY);

        function dateStr(d) {
            const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + dd;
        }
        function parseDate(s) {
            const p = String(s).split('-');
            return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        }
        function addDays(d, n) { return new Date(d.getTime() + n * ONE_DAY); }
        function dayIndex(s) { return Math.round((parseDate(s) - START_DATE) / ONE_DAY); }
        function clampIdx(i) { return Math.max(0, Math.min(DAYS - 1, i)); }
        function rangeIdx(start, end) { return [clampIdx(dayIndex(start)), clampIdx(dayIndex(end))]; }

        // 格式化单个环比格：返回 { html, cls }；cls 控制涨跌颜色
        function fmtMatrixCell(curVal, prevVal) {
            const valText = fmt(curVal);
            if (!prevVal || prevVal <= 0) {
                return { html: '<div class="text-slate-100 text-sm font-semibold leading-tight">' + valText + '</div>' +
                    '<div class="text-xs mt-0.5" style="color:#64748b">—</div>', cls: '' };
            }
            const pct = (curVal - prevVal) / prevVal * 100;
            const absPct = Math.abs(pct);
            const arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '—');
            const color = absPct < 0.5 ? '#64748b' : (pct > 0 ? '#ef4444' : '#10b981');
            const txt = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
            return { html: '<div class="text-slate-100 text-sm font-semibold leading-tight">' + valText + '</div>' +
                '<div class="text-xs mt-0.5 font-medium" style="color:' + color + '">' + arrow + ' ' + txt + '</div>', cls: '' };
        }
        // 经营结果趋势分析可选指标（type='abs' 绝对量 / type='rate' 阶段转化率）

        function hashSeed(str) {
            let h = 2166136261;
            for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
            return Math.abs(h) % 2147483647;
        }
        function seededRandom(seed) {
            let s = seed % 2147483647;
            if (s <= 0) s += 2147483646;
            return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        }
        // 原始（未取整）积分计算 — 用于按日写入 series.points，保证逐日小数不被抹平
        function pointsOfRaw(m, postKey) {
            const w = (postKey && POSTS_BY_KEY[postKey] && POSTS_BY_KEY[postKey].pw) || DEFAULT_POINTS_W;
            return (m.locked || 0) * w.locked + (m.delivered || 0) * w.delivered + (m.testDrives || 0) * w.testDrives +
                (m.invites || 0) * w.invites + (m.returnVisits || 0) * w.returnVisits + (m.opportunities || 0) * w.opportunities;
        }
        // 取整版积分（散点图 tooltip 等直接展示处使用）
        function pointsOf(m, postKey) { return Math.round(pointsOfRaw(m, postKey)); }

        // 单人单指标日序列（浮点存储，区间求和后再取整，避免小指标被逐日取整抹平）
        function buildPersonSeries(seedBase, post) {
            const rnd = seededRandom(hashSeed(seedBase));
            const baseLeads = (2.6 + rnd() * 5.2) * post.leadFactor;
            const phase = rnd() * 6.28;
            const cum = { leads: 1 };
            RATIO_CHAIN.forEach(function (pair) {
                const target = pair[0], src = pair[1], ratio = pair[2];
                let r = ratio * (0.82 + rnd() * 0.36);
                if (DAMP_FROM.indexOf(target) >= 0) r *= post.damp;
                r = Math.max(0.02, Math.min(1, r));
                cum[target] = cum[src] * r;
            });
            const series = {};
            METRIC_KEYS.forEach(function (k) { series[k] = new Float64Array(DAYS); });
            series.points = new Float64Array(DAYS);
            for (let i = 0; i < DAYS; i++) {
                const d = new Date(START_DATE.getTime() + i * ONE_DAY);
                const wd = d.getDay();
                const weekend = (wd === 0 || wd === 6) ? 1.22 : (wd === 1 ? 0.94 : 1);
                const wave = 1 + Math.sin(i * 0.29 + phase) * 0.16 + Math.sin(i * 0.053) * 0.1;
                const noise = 0.82 + rnd() * 0.36;
                const leads = Math.max(0, baseLeads * weekend * wave * noise);
                const daily = { leads: 0 };
                METRIC_KEYS.forEach(function (k) {
                    const jitter = 0.88 + rnd() * 0.24;
                    const v = Math.max(0, leads * cum[k] * jitter);
                    series[k][i] = v;
                    daily[k] = v;
                });
                series.points[i] = pointsOfRaw(daily, post.key);
            }
            return series;
        }

        function sumIdx(arr, i0, i1) {
            let s = 0;
            for (let i = i0; i <= i1; i++) s += arr[i];
            return s;
        }
        function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
        function pct(cur, prev) { return prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100; }
        function deltaPct(cur, prev) { return pct(cur, prev); }
        function fmtSigned(n, digits) { return (n >= 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits); }
        function scaleColor(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }
