// 业务数据看板 v5.12 — 数据源 + 鉴权（P3 抽离，依赖 utils/mock）

        // ==================== PART2.5：数据源层（v4.0：mock / api 双模式）====================
        // 用法：默认 mock 演示模式（无后端可独立运行）；URL 加 ?data=api&api=http://host:port 切换真实数据
        // v4：API 模式支持「显示已停用」开关（showInactive），仅影响节点可见性
        const DATA_MODE = new URLSearchParams(location.search).get('data') === 'api' ? 'api' : 'mock';
        const API_BASE = (new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:3777').replace(/\/+$/, '');

        // v4：「显示已停用」开关（仅 API 模式有意义；mock 演示数据无停用节点，恒为 false）
        // 只影响节点可见性（组织树下拉 / 人员榜单 / 节点合计），KPI 与趋势口径不受影响
        let showInactive = false;
        function inactiveParam() { return showInactive ? '&inclInactive=1' : ''; }
        function inactiveSuffix() { return showInactive ? '|ina' : ''; }

        const personsSums = new Map();      // 人员区间合计缓存：'n<id>|<from>|<to>[|ina]' → 已取整的指标对象
        const personsScopeJobs = new Map(); // 范围级去重：'<scopeId>|<from>|<to>[|ina]' → Promise
        const seriesJobs = new Map();       // 节点级去重：nodeId → Promise（全区间序列只拉一次）
        const nodeSums = new Map();         // 非人员节点区间合计缓存：'n<id>|<from>|<to>[|ina]' → 指标对象
        const nodeSumsJobs = new Map();     // 批量去重：'<ids>|<from>|<to>[|ina]' → Promise

        // 切换「显示已停用」时清空服务端数据缓存（停用可见性会改变 /api/persons、/api/nodesums 的返回内容）
        function clearApiCaches() {
            personsSums.clear(); personsScopeJobs.clear();
            nodeSums.clear(); nodeSumsJobs.clear();
            seriesJobs.clear();
            clearMetricCache();
        }

        function fetchJson(url, opts) {
            opts = opts || {};
            const headers = Object.assign({}, opts.headers || {});
            const t = getToken();
            if (t && !opts.skipAuth) headers['Authorization'] = 'Bearer ' + t;
            const fetchOpts = Object.assign({}, opts, { headers: headers });
            return fetch(url, fetchOpts).then(function (r) {
                if (r.status === 401) {
                    // 401：清 token + 显示登录页（登录接口本身 401 不弹窗）
                    if (!/auth\/login/.test(url)) {
                        clearToken();
                        if (DATA_MODE === 'api') {
                            // v5.5：重登前先重新探测鉴权模式 —— 否则 AUTH_MODE 停留在默认 password，
                            // emp_only 免密模式下会话过期也会误显「工号+密码」登录框
                            fetchAuthMode().then(function () { showLogin('会话已过期，请重新登录'); });
                        }
                    }
                    throw new Error('HTTP 401 - ' + url);
                }
                if (!r.ok) throw new Error('HTTP ' + r.status + ' - ' + url);
                return r.json();
            });
        }

        // ============ v4.2 鉴权：token 存取 + 登录/登出/改密/当前用户 ============
        const TOKEN_KEY = 'dash_token_v4';
        function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
        function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
        function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
        // 登录响应里挂的 user 信息（缓存供 topbar / 后续 /api/auth/me 失败时降级用）
        var cachedUser = null;

        function applyUserToTopbar(user) {
            const ub = document.getElementById('userBadge');
            const mb = document.getElementById('mockBadge');
            if (DATA_MODE === 'mock') {
                if (ub) ub.classList.add('hidden');
                if (mb) mb.classList.remove('hidden');
                return;
            }
            if (mb) mb.classList.add('hidden');
            if (!ub) return;
            if (!user) { ub.classList.add('hidden'); return; }
            ub.classList.remove('hidden');
            ub.classList.add('flex');
            document.getElementById('userName').textContent = user.name || user.emp_no;
            const roleEl = document.getElementById('userRole');
            const map = {
                hq: { text: '总部', cls: 'bg-purple-500/20 text-purple-200 border border-purple-400/30' },
                regional_lead: { text: '大区负责人', cls: 'bg-blue-500/20 text-blue-200 border border-blue-400/30' },
                area_lead: { text: '小区负责人', cls: 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30' },
                store_lead: { text: '店长', cls: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' },
                employee: { text: '员工', cls: 'bg-slate-500/20 text-slate-200 border border-slate-400/30' }
            };
            const m = map[user.role] || { text: user.role || '-', cls: 'bg-slate-500/20 text-slate-200 border border-slate-400/30' };
            roleEl.textContent = m.text;
            roleEl.className = 'text-[11px] px-2 py-0.5 rounded-md font-medium ' + m.cls;
        }

        // v4.2 演示账号（仅 mock 模式生效，纯前端校验，不请求后端）
        const DEMO_ACCOUNT = { emp: 'demo', pwd: 'demo123', name: '演示模式', role: 'hq', scopeName: '全国（全树）' };

        function showLogin(msg) {
            const ov = document.getElementById('loginOverlay');
            const err = document.getElementById('loginError');
            if (err) err.textContent = msg || '';
            // 演示账号提示仅在 mock 模式出现（API 模式为真实后端账号）
            const hint = document.getElementById('demoHint');
            if (hint) hint.classList.toggle('hidden', DATA_MODE !== 'mock');
            if (ov) { ov.classList.remove('hidden'); }
            setTimeout(function () { const i = document.getElementById('loginEmpNo'); if (i) i.focus(); }, 50);
        }
        function hideLogin() { const ov = document.getElementById('loginOverlay'); if (ov) ov.classList.add('hidden'); }
        function showChangePwd() { const m = document.getElementById('changePwdModal'); if (m) m.classList.remove('hidden'); }
        function hideChangePwd() { const m = document.getElementById('changePwdModal'); if (m) m.classList.add('hidden'); }

        // v5.1 鉴权模式开关（由服务端 .env AUTH_MODE 经 /api/health 下发：password=工号+密码 / emp_only=仅工号免密）
        let AUTH_MODE = 'password';
        async function fetchAuthMode() {
            try {
                const r = await fetch(API_BASE + '/api/health');
                const d = await r.json();
                if (d && d.authMode) AUTH_MODE = d.authMode;
            } catch (e) { /* 探测失败按默认 password 处理 */ }
            applyAuthModeToLogin();
        }
        function applyAuthModeToLogin() {
            const empOnly = AUTH_MODE === 'emp_only';
            const pwdRow = document.getElementById('loginPwdRow');
            if (pwdRow) pwdRow.classList.toggle('hidden', empOnly);
            const desc = document.getElementById('loginDesc');
            if (desc) desc.textContent = empOnly ? '输入工号直接登录（当前为免密码试用模式：仅凭工号识别身份，请勿将本人工号借予他人）。' : '输入工号与密码登录。初次登录或密码被重置后须先修改默认密码。';
            const sub = document.getElementById('loginSubTitle');
            if (sub) sub.textContent = empOnly ? 'V5.12 · 工号登录（免密码）' : 'V5.12 · 工号密码登录';
            const forgot = document.getElementById('loginForgotHint');
            if (forgot) forgot.classList.toggle('hidden', empOnly);
        }

        // 直接 fetch（不走 fetchJson，避免 401 循环触发跳登录）
        async function loginApi(empNo, pwd) {
            const r = await fetch(API_BASE + '/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emp_no: empNo, password: pwd })
            });
            const data = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(data.error || ('登录失败：HTTP ' + r.status));
            return data;
        }
        async function meApi() {
            return fetchJson(API_BASE + '/api/auth/me');
        }
        async function changePwdApi(oldP, newP) {
            const r = await fetch(API_BASE + '/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (getToken() || '') },
                body: JSON.stringify({ oldPassword: oldP, newPassword: newP })
            });
            const data = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(data.error || ('改密失败：HTTP ' + r.status));
            return data;
        }
        function logoutApi() {
            // 服务端无状态（仅返回 ok），客户端清 token + 跳登录
            fetch(API_BASE + '/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (getToken() || '') } }).catch(function () {});
        }

        // 暴露给 inline 事件
        window.__v42 = {
            doLogin: function () {
                const emp = (document.getElementById('loginEmpNo').value || '').trim();
                const pwd = AUTH_MODE === 'emp_only' ? '' : (document.getElementById('loginPwd').value || '');
                if (!emp) { document.getElementById('loginError').textContent = '请输入工号'; return; }
                if (AUTH_MODE !== 'emp_only' && !pwd) { document.getElementById('loginError').textContent = '请输入密码'; return; }
                // mock 模式：内置演示账号纯前端校验（线上 Pages 无后端也能走通登录 → 看板流程）
                if (DATA_MODE === 'mock') {
                    if (emp === DEMO_ACCOUNT.emp && pwd === DEMO_ACCOUNT.pwd) {
                        document.getElementById('loginError').textContent = '';
                        window.__v42.skipToDemo();
                    } else {
                        document.getElementById('loginError').textContent = '演示模式请使用内置账号 demo / demo123，或点下方按钮直接进入';
                    }
                    return;
                }
                const btn = document.getElementById('loginSubmit');
                btn.disabled = true; btn.textContent = '登录中…';
                loginApi(emp, pwd).then(function (r) {
                    setToken(r.token); cachedUser = r.user;
                    applyUserToTopbar(r.user);
                    hideLogin();
                    if (r.mustChangePassword) { showChangePwd(); return; }
                    // 登录成功且无需改密 → 重启 boot 流程
                    bootApiAfterLogin();
                }).catch(function (e) {
                    document.getElementById('loginError').textContent = e.message || '登录失败';
                    btn.disabled = false; btn.textContent = '登录';
                    document.getElementById('loginPwd').value = '';
                });
            },
            doLogout: function () {
                logoutApi();
                clearToken(); cachedUser = null;
                applyUserToTopbar(null);
                // 刷新页面以便 bootApi 重走「未登录 → 弹登录」分支
                location.reload();
            },
            doChangePwd: function () {
                const oldP = document.getElementById('cpOld').value || '';
                const newP = document.getElementById('cpNew').value || '';
                const newP2 = document.getElementById('cpNew2').value || '';
                const errEl = document.getElementById('cpError');
                if (!oldP || !newP) { errEl.textContent = '请填写原密码与新密码'; return; }
                if (newP.length < 6) { errEl.textContent = '新密码至少 6 位'; return; }
                if (newP !== newP2) { errEl.textContent = '两次新密码不一致'; return; }
                if (newP === oldP) { errEl.textContent = '新密码不能与原密码相同'; return; }
                const btn = document.getElementById('cpSubmit');
                btn.disabled = true; btn.textContent = '提交中…';
                changePwdApi(oldP, newP).then(function (r) {
                    setToken(r.token);
                    hideChangePwd();
                    bootApiAfterLogin();
                }).catch(function (e) {
                    errEl.textContent = e.message || '改密失败';
                    btn.disabled = false; btn.textContent = '确认修改';
                });
            },
            skipToDemo: function () {
                // mock 模式跳过登录：以「演示模式（总部）」身份直接渲染看板
                if (DATA_MODE !== 'mock') return;
                hideLogin();
                cachedUser = { emp_no: DEMO_ACCOUNT.emp, name: DEMO_ACCOUNT.name, role: DEMO_ACCOUNT.role, scopeName: DEMO_ACCOUNT.scopeName };
                applyUserToTopbar(cachedUser);
                startApp();
            }
        };
        // 登录成功 / 改密成功后重启 boot 流程（不刷新页面，保留已选日期等状态）
        function bootApiAfterLogin() {
            apiLoading(true, '正在连接数据服务…');
            meApi().then(function (d) {
                cachedUser = d.user; applyUserToTopbar(d.user);
                return loadOrgTree();
            }).then(function (d) {
                START_DATE = parseDate(d.dateRange.from);
                const endD = parseDate(d.dateRange.to);
                DAYS = Math.round((endD - START_DATE) / ONE_DAY) + 1;
                TODAY = endD;
                apiLoading(false);
                startApp();
            }).catch(apiError);
        }
        function idxToDate(i) { return dateStr(addDays(START_DATE, i)); }
        // 节点 id → 接口参数；根节点（服务端未落「全国」节点）无 id 时用 all，表示全网口径
        function apiNodeId(node) { return (node && node.id != null) ? String(node.id).replace(/^n/, '') : 'all'; }
        const METRIC_ZERO = (function () { const m = { points: 0 }; METRIC_KEYS.forEach(function (k) { m[k] = 0; }); return m; })();

        // 拉取节点全区间逐日序列并写入 node.series（结构与 mock buildPersonSeries/aggSeries 完全一致，渲染层零改动）
        function ensureSeries(list) {
            const jobs = [];
            (list || []).forEach(function (n) {
                if (!n || n.series || seriesJobs.has(n.id)) return;
                const job = fetchJson(API_BASE + '/api/metrics?node=' + apiNodeId(n) +
                    '&from=' + dateStr(START_DATE) + '&to=' + idxToDate(DAYS - 1))
                    .then(function (d) {
                        if (!d.ok) throw new Error('指标接口返回失败');
                        const s = {};
                        METRIC_KEYS.forEach(function (k) { s[k] = Float64Array.from(d.series[k] || []); });
                        s.points = Float64Array.from(d.series.points || []);
                        n.series = s;
                    });
                job.catch(function () { seriesJobs.delete(n.id); });
                seriesJobs.set(n.id, job);
                jobs.push(job);
            });
            return Promise.all(jobs);
        }

        // 拉取某节点子树的人员区间合计（积分榜 / 明细表 / PK / 闭环散点的人员指标来源）
        function ensurePersons(scopeNode, from, to) {
            if (!scopeNode) return Promise.resolve();
            const key = scopeNode.id + '|' + from + '|' + to + inactiveSuffix();
            if (!personsScopeJobs.has(key)) {
                const job = fetchJson(API_BASE + '/api/persons?node=' + apiNodeId(scopeNode) + '&from=' + from + '&to=' + to + inactiveParam())
                    .then(function (d) {
                        if (!d.ok) throw new Error('人员接口返回失败');
                        d.persons.forEach(function (p) {
                            const m = {};
                            METRIC_KEYS.forEach(function (k) { m[k] = Math.round(p.sums[k] || 0); });
                            m.points = Math.round(p.sums.points || 0);
                            personsSums.set('n' + p.personId + '|' + from + '|' + to + inactiveSuffix(), m);
                        });
                    });
                job.catch(function () { personsScopeJobs.delete(key); });
                personsScopeJobs.set(key, job);
            }
            return personsScopeJobs.get(key);
        }
        function lookupPersonSums(node, i0, i1) {
            return personsSums.get(node.id + '|' + idxToDate(i0) + '|' + idxToDate(i1) + inactiveSuffix()) || null;
        }

        // 批量拉取非人员节点的区间合计（一次请求覆盖全部下级/榜单/明细节点，避免逐日序列请求风暴）
        function ensureNodeSums(list, from, to) {
            const need = (list || []).filter(function (n) { return n && n.level !== '人员' && !nodeSums.has(n.id + '|' + from + '|' + to + inactiveSuffix()); });
            if (!need.length) return Promise.resolve();
            const key = need.map(function (n) { return n.id; }).join(',') + '|' + from + '|' + to + inactiveSuffix();
            if (!nodeSumsJobs.has(key)) {
                const job = fetchJson(API_BASE + '/api/nodesums?nodes=' + need.map(apiNodeId).join(',') + '&from=' + from + '&to=' + to + inactiveParam())
                    .then(function (d) {
                        if (!d.ok) throw new Error('节点合计接口返回失败');
                        need.forEach(function (n) {
                            const s = d.sums[apiNodeId(n)];
                            if (!s) return;
                            const m = {};
                            METRIC_KEYS.forEach(function (k) { m[k] = Math.round(s[k] || 0); });
                            m.points = Math.round(s.points || 0);
                            nodeSums.set(n.id + '|' + from + '|' + to + inactiveSuffix(), m);
                        });
                    });
                job.catch(function () { nodeSumsJobs.delete(key); });
                nodeSumsJobs.set(key, job);
            }
            return nodeSumsJobs.get(key);
        }
        function lookupNodeSums(node, i0, i1) {
            return nodeSums.get(node.id + '|' + idxToDate(i0) + '|' + idxToDate(i1) + inactiveSuffix()) || null;
        }

        // 加载提示（右上角小浮条）
        function apiLoading(on, text) {
            let el = document.getElementById('apiLoadingTip');
            if (!el) {
                el = document.createElement('div');
                el.id = 'apiLoadingTip';
                el.style.cssText = 'position:fixed;top:14px;right:16px;z-index:9999;background:rgba(15,23,42,.94);color:#93c5fd;border:1px solid #3b82f6;border-radius:10px;padding:8px 14px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:none;pointer-events:none';
                document.body.appendChild(el);
            }
            el.textContent = text || '正在从服务端加载数据…';
            el.style.display = on ? 'block' : 'none';
        }
        function apiError(e) {
            console.error(e);
            apiLoading(false);
            alert('数据加载失败：' + (e && e.message ? e.message : e) + '\n\n请确认后端服务已启动且地址正确（?api=http://host:port），或去掉 ?data=api 使用演示模式。');
        }

        // API 组织树 → 前端节点结构（补齐 parent / storeName / postName / postStats 等渲染层依赖字段）
        // v4：status=0 的节点（离职人员 / 闭店门店等）名称后缀「（已停用）」，仅「显示已停用」打开时才会出现在树里
        function apiTreeToNodes(t, parent) {
            const inactive = t.status === 0;
            const n = {
                id: 'n' + t.id, name: t.name + (inactive ? '（已停用）' : ''),
                rawName: t.name, level: t.level, postKey: t.postKey || null,
                status: t.status == null ? 1 : t.status,
                deactivatedAt: t.deactivatedAt || null,
                children: [], series: null, parent: parent,
                storeName: '', postName: '', postStats: null
            };
            (t.children || []).forEach(function (c) { n.children.push(apiTreeToNodes(c, n)); });
            if (n.level === '门店') {
                n.children.forEach(function (postNode) {
                    postNode.storeName = n.name;
                    postNode.postName = postNode.name;
                    postNode.children.forEach(function (p) {
                        p.storeName = n.name; p.postName = postNode.name;
                        p.fullName = n.name + ' · ' + p.name;
                    });
                });
                let total = 0;
                n.children.forEach(function (c) { total += c.children.length; });
                const missing = [];
                POSTS.forEach(function (p) {
                    if (!n.children.some(function (c) { return c.postKey === p.key; })) missing.push(p.key);
                });
                n.postStats = { total: total, missing: missing };
            }
            return n;
        }

        let apiOrgInfo = null;   // 服务端组织树附带信息：dataQuality / hiddenNodes / inactiveNodesShown

        // 拉取组织树（含岗位配置）并重建前端树；bootApi 初始化与「显示已停用」开关共用，不重置日期范围
        function loadOrgTree() {
            return fetchJson(API_BASE + '/api/org' + (showInactive ? '?inclInactive=1' : '')).then(function (d) {
                if (!d.ok || !d.tree) throw new Error('服务端组织树为空：请先导入名册或在服务端执行 npm run seed');
                POSTS.length = 0;
                Object.keys(POSTS_BY_KEY).forEach(function (k) { delete POSTS_BY_KEY[k]; });
                d.posts.forEach(function (p) {
                    const np = { key: p.key, name: p.name, color: p.color, min: p.min, max: p.max, pw: p.pw };
                    POSTS.push(np);
                    POSTS_BY_KEY[p.key] = np;
                });
                tree = apiTreeToNodes(d.tree, null);
                apiOrgInfo = {
                    dataQuality: d.dataQuality || null,
                    hiddenNodes: d.hiddenNodes || 0,
                    inactiveNodesShown: d.inactiveNodesShown || 0
                };
                return d;
            });
        }

        // API 模式启动：v4.2 先校验登录态（有 token → /api/auth/me → 加载树；无 token → 弹登录）
        function bootApi() {
            if (!getToken()) {
                // v5.1：先探测鉴权模式（emp_only 时隐藏密码框），再弹登录浮层
                return fetchAuthMode().then(function () {
                    showLogin(AUTH_MODE === 'emp_only' ? '请输入工号登录' : '请使用工号与密码登录');
                    throw new Error('未登录');
                });
            }
            apiLoading(true, '正在校验登录态…');
            return meApi().then(function (d) {
                cachedUser = d.user; applyUserToTopbar(d.user);
                if (d.user.mustChangePassword) {
                    apiLoading(false);
                    showChangePwd();
                    return null;
                }
                return loadOrgTree();
            }).then(function (d) {
                if (!d) return;
                START_DATE = parseDate(d.dateRange.from);
                const endD = parseDate(d.dateRange.to);
                DAYS = Math.round((endD - START_DATE) / ONE_DAY) + 1;
                TODAY = endD;
                apiLoading(false);
                startApp();
            }).catch(function (e) {
                // v5.4：token 过期/失效（401）时 fetchJson 已清 token 并弹回登录浮层，这里静默停止即可
                const msg = e && e.message ? String(e.message) : '';
                if (/HTTP 401/.test(msg)) { apiLoading(false); return; }
                apiError(e);
            });
        }

        let tree = null;
