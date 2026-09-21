// 业务数据看板 v5.12 — 状态/树索引/组织筛选（P3-4 拆分，依赖 data/utils/mock/api_auth）

// ===== 全局声明区（P3-3：从 startApp 闭包提升为全局）=====
            const swWrap = document.getElementById('showInactiveWrap');
        const NODE_BY_ID = new Map();
        function reindexTree() {
            NODE_BY_ID.clear();
            (function indexNode(n) { NODE_BY_ID.set(n.id, n); n.children.forEach(indexNode); })(tree);
        }
        function nodeById(id) { return NODE_BY_ID.get(id) || tree; }
        const state = {
            board: 'overview',                 // 当前看板：overview（经营总览） / closure（业务执行与闭环）
            start: '', end: '',
            mode: 'single',
            sel: { region: '__all__', area: '__all__', store: '__all__', post: '__all__', person: '__all__' },
            pkLevel: '门店',
            pkPost: POSTS[0].key,              // PK 层级=岗位 时的二级岗位选择
            pkIds: [],
            pkBase: null,
            drillIds: [],
            drillSelectedId: null,            // v4.9：左柱图 / drillList 共享的选中态（节点 id；null = 无选中）
            drillPersonId: null,              // v4.14：人员层下钻后，区间动作得分率汇总（#drillDutyDetail）对应的人员节点 id
            trendMode: 'day',
            trendMetrics: ['intentLeads', 'arrivals', 'locked'], // 经营总览趋势分析默认指标
            trendNorm: null,   // 绝对量归一化：null=自动, true=强制, false=强制关闭
            pointsDim: '门店',   // 兼容字段，v4.4 起由 autoRankDim 自动推导，保留旧值以防外部引用
            pointsRank: 'sales',  // v4.4：积分/销量排行榜排序优先级（'sales' 销量优先 / 'points' 积分优先）
            tableDim: '门店',
            expanded: [false, false, false],   // 三大板块各自的展开状态
            panelSel: {},                      // 各板块勾选的指标 key
            // 业务执行与闭环看板状态
            closure: { postKey: 'deliverySpecialist', region: null, area: null, storeCodes: null, storeSearch: '', storeMulti: false, showRules: true, showMonthly: false },
            clDate: ''                          // v4.8：闭环独立日报游标（空串 = 自动取数据文件最后一天）
        };
        const panelCharts = {};                // 板块展开态折线图实例

        const $start = document.getElementById('startDate');
        const $end = document.getElementById('endDate');
        const $rangeText = document.getElementById('rangeText');
        const $selRegion = document.getElementById('orgRegion');
        const $selArea = document.getElementById('orgArea');
        const $selStore = document.getElementById('orgStore');
        const $selPost = document.getElementById('orgPost');
        const $selPerson = document.getElementById('orgPerson');
        const $orgPath = document.getElementById('orgPath');
        const $orgSummary = document.getElementById('orgSummary');
        const $pkBar = document.getElementById('pkBar');
        const $pkOptionsWrap = document.getElementById('pkOptionsWrap');
        const $pkOptions = document.getElementById('pkOptions');
        function prevRange() {
            const r = rangeIdx(state.start, state.end);
            const span = r[1] - r[0] + 1;
            const i1 = Math.max(0, r[0] - 1);
            const i0 = Math.max(0, i1 - span + 1);
            return { i0: i0, i1: i1 };
        }
        function currentIdx() { return rangeIdx(state.start, state.end); }
        function currentNode() {
            const chain = [state.sel.region, state.sel.area, state.sel.store, state.sel.post, state.sel.person];
            let last = tree;
            chain.forEach(function (id) {
                if (id && id !== '__all__') last = nodeById(id);
            });
            return last;
        }
        const SEL_ORDER = ['region', 'area', 'store', 'post', 'person'];
        function drillDeepestSelIdx() {
            for (let i = SEL_ORDER.length - 1; i >= 0; i--) {
                if (state.sel[SEL_ORDER[i]] && state.sel[SEL_ORDER[i]] !== '__all__') return i;
            }
            return -1;
        }
        const LEVEL_STATE_KEY = { '大区': 'region', '小区': 'area', '门店': 'store', '岗位': 'post', '人员': 'person' };
        function backfillAncestors(node) {
            let n = node && node.parent;
            while (n) {
                const key = LEVEL_STATE_KEY[n.level];
                if (key && (!state.sel[key] || state.sel[key] === '__all__')) state.sel[key] = n.id;
                n = n.parent;
            }
        }
        function initOrgSelDefaults() {
            if (DATA_MODE !== 'api' || !cachedUser || !cachedUser.scopeRootId) return;
            if (cachedUser.scopeMode === 'explicit') return;
            const node = NODE_BY_ID.get('n' + cachedUser.scopeRootId);
            if (!node) return;
            const key = LEVEL_STATE_KEY[node.level];
            if (key) state.sel[key] = node.id;
            backfillAncestors(node);
        }
        function fillSelect(el, list, allLabel, current, placeholder) {
            let html = '<option value="__all__">' + (placeholder || allLabel) + '</option>';
            list.forEach(function (n) {
                // v4：已停用节点弱化显示（名称本身已带「（已停用）」后缀）
                html += '<option value="' + n.id + '"' + (n.disabled ? ' disabled' : '') +
                    (n.status === 0 ? ' class="inactive"' : '') + '>' + n.name + '</option>';
            });
            el.innerHTML = html;
            el.value = current || '__all__';
            const picked = el.options[el.selectedIndex];
            if (!picked || picked.disabled || el.value !== (current || '__all__')) el.value = '__all__';
        }
        function storesOfArea(areaId) {
            const area = areaId === '__all__' ? null : nodeById(areaId);
            return area ? collectLevel(area, '门店') : [];
        }
        function areasOfRegion(regionId) {
            const region = regionId === '__all__' ? null : nodeById(regionId);
            return region ? collectLevel(region, '小区') : [];
        }
        function renderOrgSelectors() {
            // 大区
            fillSelect($selRegion, tree.children, '全国', state.sel.region, '全国');
            // 小区
            const areas = state.sel.region === '__all__' ? collectLevel(tree, '小区') : areasOfRegion(state.sel.region);
            fillSelect($selArea, areas, '全部小区', state.sel.area, state.sel.region === '__all__' ? '全部小区' : '全部小区');
            $selArea.disabled = areas.length === 0;
            // 门店
            const stores = state.sel.area === '__all__' ? collectLevel(tree, '门店') : storesOfArea(state.sel.area);
            fillSelect($selStore, stores, '全部门店', state.sel.store);
            $selStore.disabled = stores.length === 0;
            // 岗位（需先选门店；未选门店时置灰禁用）
            const storeNode = state.sel.store !== '__all__' ? nodeById(state.sel.store) : null;
            // 容错：门店切换后若原选岗位不属于该门店，自动回退为全部岗位
            if (storeNode && state.sel.post !== '__all__') {
                const pn = NODE_BY_ID.get(state.sel.post);
                if (!pn || pn.parent !== storeNode) { state.sel.post = '__all__'; state.sel.person = '__all__'; }
            }
            if (storeNode) {
                const existKeys = {};
                // v5.3：只取「岗位」层子节点（防归整/异常结构下非岗位节点混入导致全列「本店暂无」）
                collectLevel(storeNode, '岗位', []).forEach(function (p) { existKeys[p.postKey] = p; });
                const posts = POSTS.map(function (p) {
                    const node = existKeys[p.key];
                    if (node) return { id: node.id, name: p.name + (node.status === 0 ? '（已停用）' : ''), status: node.status };
                    return { id: '__none__' + p.key, name: p.name + '（本店暂无）', disabled: true };
                });
                fillSelect($selPost, posts, '全部岗位', state.sel.post);
                $selPost.disabled = false;
            } else {
                $selPost.innerHTML = '<option value="__all__">全部岗位（请先选门店）</option>';
                $selPost.value = '__all__';
                $selPost.disabled = true;
            }
            // 人员
            const postNode = state.sel.post !== '__all__' && state.sel.post.indexOf('__none__') !== 0 ? nodeById(state.sel.post) : null;
            if (postNode) {
                fillSelect($selPerson, postNode.children, '全部人员', state.sel.person);
                $selPerson.disabled = false;
            } else if (storeNode) {
                // v5.3：按 level 语义收集门店下全部人员（原双层 children 遍历会漏/错层级）
                const persons = collectLevel(storeNode, '人员', []);
                fillSelect($selPerson, persons, '全部人员', state.sel.person);
                $selPerson.disabled = false;
            } else {
                $selPerson.innerHTML = '<option value="__all__">全部人员（请先选门店）</option>';
                $selPerson.value = '__all__';
                $selPerson.disabled = true;
            }
            // 路径与范围摘要
            const node = currentNode();
            const path = nodePath(node);
            $orgPath.innerHTML = path.map(function (n, i) {
                const last = i === path.length - 1;
                return '<span class="crumb' + (last ? '' : ' muted') + (n.status === 0 ? ' inactive' : '') + '">' + n.name + '</span>' +
                    (last ? '' : '<span class="text-slate-600">/</span>');
            }).join('');
            const storeCount = Math.max(1, countStores(node));
            // v4：区分在岗/已停用人数（「显示已停用」打开时树里含停用节点，摘要需据实描述）
            const personsInScope = [];
            if (node.level === '人员') personsInScope.push(node);
            else collectLevel(node, '人员', personsInScope);
            const inactivePersons = personsInScope.filter(function (p) { return p.status === 0; }).length;
            const activePersons = personsInScope.length - inactivePersons;
            // 空岗提示
            const missing = [];
            collectLevel(node, '门店', []).forEach(function (s) {
                (s.postStats ? s.postStats.missing : []).forEach(function (pk) {
                    if (missing.indexOf(pk) < 0) missing.push(pk);
                });
            });
            let summary;
            if (node.level === '人员') {
                summary = '所属门店 ' + node.storeName + ' · ' + node.postName + ' · 当前范围 1 人' + (node.status === 0 ? '（已停用）' : '');
            } else if (node.level === '岗位') {
                const pActive = node.children.filter(function (p) { return p.status !== 0; }).length;
                const pInactive = node.children.length - pActive;
                summary = node.storeName + ' · ' + node.name + ' · 在岗 ' + pActive + ' 人（' +
                    (node.children.length > 1 ? '一岗多人' : '一岗一人') + '）' +
                    (pInactive ? ' · 另有 ' + pInactive + ' 人已停用' : '');
            } else {
                summary = '覆盖 ' + storeCount + ' 家门店 / ' + activePersons + ' 名在岗人员';
                if (inactivePersons) summary += '（另有 ' + inactivePersons + ' 人已停用）';
                if (missing.length) {
                    const missingNames = missing.map(function (pk) { return (POSTS_BY_KEY[pk] || {}).name || pk; });
                    summary += ' · 其中 ' + missingNames.join(' / ') + ' 岗位在部分门店空缺';
                }
            }
            $orgSummary.textContent = summary;
            // v4：显示已停用时给出提示（停用只影响可见性，聚合口径不变，故榜单求和可能小于上级合计）
            const hintEl = document.getElementById('inactiveHint');
            if (hintEl) {
                const shownInactive = showInactive ? countInactive(tree) : 0;
                if (shownInactive > 0) {
                    hintEl.textContent = '已显示 ' + shownInactive + ' 个已停用节点：其历史指标仍完整保留并计入上级合计，因此榜单求和可能小于上级合计';
                    hintEl.classList.remove('hidden');
                } else {
                    hintEl.classList.add('hidden');
                }
            }
        }
        function pkCandidates() {
            let list;
            if (state.pkLevel === '岗位') {
                list = collectLevel(currentNode(), '岗位', []).filter(function (n) { return n.postKey === state.pkPost; });
            } else {
                list = collectLevel(currentNode(), state.pkLevel, []);
            }
            return list.slice().sort(function (a, b) {
                const ma = metricsOf(a, currentIdx()[0], currentIdx()[1]);
                const mb = metricsOf(b, currentIdx()[0], currentIdx()[1]);
                return (mb ? mb.leads : 0) - (ma ? ma.leads : 0);
            });
        }
        function renderPkPostTabs() {
            const $bar = document.getElementById('pkPostBar');
            const $tabs = document.getElementById('pkPostTabs');
            if (!$bar || !$tabs) return;
            const on = state.mode === 'pk' && state.pkLevel === '岗位';
            $bar.classList.toggle('hidden', !on);
            $bar.classList.toggle('flex', on);
            if (!on) return;
            if (!POSTS_BY_KEY[state.pkPost]) state.pkPost = POSTS[0].key;
            $tabs.innerHTML = POSTS.map(function (p) {
                return '<button class="quick-btn' + (p.key === state.pkPost ? ' active' : '') + '" data-pk-post="' + p.key + '"' +
                    ' style="' + (p.key === state.pkPost ? 'background:' + p.color + ';border-color:' + p.color + ';color:#fff;font-weight:600' : '') + '">' + p.name + '</button>';
            }).join('');
        }
        function renderPkOptions() {
            const list = pkCandidates();
            $pkOptions.innerHTML = list.map(function (n) {
                const on = state.pkIds.indexOf(n.id) >= 0;
                const nm = state.pkLevel === '岗位' || state.pkLevel === '人员' ? (n.storeName ? n.storeName + ' · ' + n.name : n.name) : n.name;
                return '<button class="pk-opt' + (on ? ' on' : '') + (n.status === 0 ? ' inactive' : '') + '" data-id="' + n.id + '">' + nm + '</button>';
            }).join('');
            if (!list.length) {
                $pkOptions.innerHTML = '<span class="text-xs text-slate-500 py-2">当前组织范围下没有该层级的可比对象 —— 请在上方「组织范围」放宽筛选（如选回上级大区 / 小区）</span>';
            }
            // 空缺岗位置灰展示（体现「本店暂无」而非 0）— 仅针对当前选中的对比岗位
            if (state.pkLevel === '岗位') {
                const postDef = POSTS_BY_KEY[state.pkPost];
                if (postDef) {   // v5.0：空缺改为 min:0 岗位确定性随机生成，postStats.missing 依旧准确
                    const scopeRoot = currentNode().level === '门店' ? currentNode().parent : currentNode();
                    const storeNodes = collectLevel(scopeRoot, '门店', []);
                    const missing = storeNodes.filter(function (s) { return (s.postStats.missing || []).indexOf(state.pkPost) >= 0; });
                    if (missing.length) {
                        $pkOptions.innerHTML += missing.map(function (s) {
                            return '<span class="pk-opt empty">' + s.name + ' · ' + postDef.name + '（暂无）</span>';
                        }).join('');
                    }
                }
            }
            $pkOptions.querySelectorAll('button[data-id]').forEach(function (b) {
                b.addEventListener('click', function () {
                    const id = b.dataset.id;
                    const i = state.pkIds.indexOf(id);
                    if (i >= 0) {
                        state.pkIds.splice(i, 1);
                        if (state.pkBase === id) state.pkBase = state.pkIds[0] || null;
                    } else {
                        if (state.pkIds.length >= 6) return;
                        state.pkIds.push(id);
                        if (!state.pkBase) state.pkBase = id;
                    }
                    renderAll();
                });
            });
        }
        function pkNodes() { return state.pkIds.map(nodeById); }
        function pkBaseNode() { return state.pkBase ? nodeById(state.pkBase) : (pkNodes()[0] || null); }
        const ICONS = {
            user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/></svg>',
            phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
            car: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M6 17V9l2-4h8l2 4v8"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/></svg>',
            lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
            target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
            star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9Z"/></svg>'
        };
        function iconOf(key) {
            if (key === 'invites') return ICONS.phone;
            if (key === 'testDrives' || key === 'delivered') return ICONS.car;
            if (key === 'locked') return ICONS.lock;
            if (key === 'opportunities') return ICONS.target;
            if (key === 'points') return ICONS.star;
            return ICONS.user;
        }
        const MODULE_GROUPS = [
            { title: '线索入口', keys: ['leads', 'validLeads', 'intentLeads', 'invites'] },
            { title: '到店接待', keys: ['arrivals', 'testDrives', 'returnVisits', 'opportunities'] },
            { title: '结果面板', keys: ['locked', 'delivered'] }
        ];
        function cardHTML(key, prefix) {
            const color = METRIC_COLOR[key];
            const id = prefix + key;
            return '<div class="metric-card" style="--accent-color:' + color + '">' +
                '<div class="flex items-start justify-between gap-2">' +
                '<div class="metric-label"><span class="metric-icon">' + iconOf(key) + '</span>' + METRIC_LABEL[key] + '</div>' +
                '<span class="chip flat" id="' + id + '_d">--</span></div>' +
                '<div class="metric-value" id="' + id + '_v">0<span class="metric-unit">' + METRIC_UNIT[key] + '</span></div>' +
                '<div class="metric-meta"><span id="' + id + '_r" class="text-slate-400"></span></div></div>';
        }
