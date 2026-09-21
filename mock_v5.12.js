// 业务数据看板 v5.12 — mock 数据生成（P3 抽离，依赖 utils）

        // ==================== PART2：六级组织树（全国 → 大区 → 小区 → 门店 → 岗位 → 人员）====================
        // v5.0：真实组织树（数据源：专营店20260918175014.xls，经 v4.17 店名匹配重映射；393 家门店 × 55 个出现过的销售小区）
        const ORG_SPEC = [
            { region: '华东一区', areas: [
                { area: '上海区', stores: ['上海东风南方威铭', '上海东风南方威顺', '上海奉贤', '上海安吉普陀', '上海松江', '东风日产新能源体验中心（上海尚悦湾店）', '新能源上海东风南方虹桥零售交付中心'] },
                { area: '杭州区', stores: ['杭州东风南方宁围', '杭州东风南方杭城', '杭州东风南方金沙', '杭州元通城北', '湖州东风南方金恒德'] },
                { area: '浙东区', stores: ['台州临海康富', '台州刚泰路桥', '嘉兴之远', '宁波元通友和', '宁波友祥', '慈溪飞跃'] },
                { area: '浙南区', stores: ['义乌元通广通', '温州华鸿', '衢州德众', '金华大昌'] },
                { area: '福建区', stores: ['厦门信达国贸启帆', '厦门信达国贸启航', '宁德中域东侨', '泉州亿兴', '漳州万事达众保', '漳州聚力', '莆田华宝', '龙岩汇京龙兴'] },
            ]},
            { region: '华东二区', areas: [
                { area: '安徽区', stores: ['合肥伟业', '合肥伟盛行', '合肥小小宝湾', '合肥恒信东顺合肥北', '安庆恒业', '宣城东风南方宣州', '芜湖东风南方鸠江'] },
                { area: '常锡区', stores: ['常州中天', '常州中天日新', '常州中天日昇', '常州中天日晟', '无锡威邦新区', '无锡明乐', '无锡汇鑫先锋', '无锡盛岸西路', '江阴海华', '溧阳中天日盛'] },
                { area: '苏中区', stores: ['南通名尼威', '南通太平洋', '南通太平洋启东', '南通太平洋如东', '南通太平洋如皋', '南通太平洋开发区', '南通太平洋海安', '南通海通', '盐城苏缘'] },
                { area: '苏北区', stores: ['南京东风南方东麒', '南京文华', '宿迁金奥', '徐州尊悦', '扬州东风南方东峻', '扬州东风南方扬辰', '泰州东风南方天辰', '泰州东风南方泰兴', '连云港中信华耀', '镇江东风南方新区'] },
                { area: '苏州区', stores: ['吴江连诚', '太仓诚茂', '昆山华明', '昆山昆众中华园路', '苏州伟海'] },
            ]},
            { region: '华东三区', areas: [
                { area: '鲁东区', stores: ['威海世通', '烟台天航', '烟台富嘉', '荣成海源', '青岛东风南方吉源', '青岛天也', '青岛珠峰城阳', '青岛珠峰平度', '青岛珠峰胶州'] },
                { area: '鲁北区', stores: ['东营兴达', '东营百川凌云西城', '东营百川青云', '德州华丰', '淄博泰达', '淄博泰通', '滨州远泰', '潍坊恒安', '潍坊玉山'] },
                { area: '鲁南区', stores: ['临沂易利', '临沂易华', '曲阜新圣达', '枣庄远方', '泰安德义', '济宁华源', '济宁华源通达梁山'] },
                { area: '鲁西区', stores: ['济南匡山', '济南卓联卓正', '济南卓联卓风', '聊城东风南方金天瑞', '莱芜顺通', '菏泽东风南方定陶', '菏泽东风南方开源'] },
            ]},
            { region: '华中一区', areas: [
                { area: '武汉区', stores: ['武汉三环劲通', '武汉三环华通', '武汉三环轩通', '武汉卓联关山', '武汉裕信'] },
                { area: '豫东区', stores: ['周口宏诚', '商丘威佳宏祥', '开封威瑞'] },
                { area: '豫北区', stores: ['安阳威佳文峰', '新乡威兴', '济源威源', '濮阳威佳高新'] },
                { area: '豫西区', stores: ['三门峡威顺', '信阳威通', '南阳威佳宏昌', '平顶山威泰', '洛阳威丰'] },
                { area: '郑州区', stores: ['郑州威佳', '郑州威佳圃田', '郑州威佳宏远', '郑州威佳宏鹏', '郑州威佳新郑'] },
                { area: '鄂北区', stores: ['仙桃三环劲通', '十堰东贸轩威', '孝感裕丰', '襄阳樊城', '襄阳车城', '鄂州三环劲通', '随州东盛', '黄冈恒信德龙'] },
                { area: '鄂南区', stores: ['宜昌交运', '恩施麟觉', '荆州宏道', '荆州恒信', '荆门风雅'] },
            ]},
            { region: '华中二区', areas: [
                { area: '广西区', stores: ['北海新兴盛', '南宁兴宁邕宾', '南宁利泰五象', '南宁恒信东顺', '南宁润轩江南白沙', '柳州丰正华', '梧州雄利'] },
                { area: '江西区', stores: ['上饶东信', '九江东浔', '南昌东维高鑫', '南昌泰辰洪都', '吉安通九州青原', '宜春利泰袁州', '宜春利隆丰樟高', '抚州利泰文昌', '赣州东维', '赣州东维红金', '赣州利隆章贡', '赣州昌泰南康'] },
                { area: '湘北区', stores: ['吉首吉日', '岳阳东风卓联', '常德日丰', '张家界华盛', '益阳兰天'] },
                { area: '湘南区', stores: ['娄底兰天', '武冈兰天', '邵阳兰天佳旭', '郴州高卫'] },
                { area: '长株潭区', stores: ['宁乡中拓瑞宁', '株洲兰天海联', '浏阳兰天集里', '湘潭兰天九华', '长沙兰天城西', '长沙兰天星沙', '长沙兰天河西', '长沙兰天雨花', '长沙兰天麓谷'] },
            ]},
            { region: '华南区', areas: [
                { area: '东莞区', stores: ['东莞东风南方万江', '东莞东风南方塘厦', '东莞东风南方振安', '东莞东风南方莞太', '东莞东风南方莞樟', '东莞东风南方莞龙'] },
                { area: '佛肇区', stores: ['佛山利泰', '佛山利隆', '佛山吉泰', '佛山禅车城', '肇庆锦利', '顺德协力', '顺德金桂'] },
                { area: '广州区', stores: ['广州东风南方中大', '广州东风南方南沙', '广州东风南方广辰', '广州东风南方新塘', '广州珠峰黄埔', '广州绿日', '广州耀骏', '广州风日', '广州龙日'] },
                { area: '海粤区', stores: ['三亚东风南方海燕', '儋州东风南方海星', '海口东风南方海神', '海口东风南方海鹏', '湛江东升行', '湛江东风南方海田', '茂名东风南方茂南', '茂名东风南方金泰', '阳江金山'] },
                { area: '深圳区', stores: ['深圳东风南方华新', '深圳东风南方华瑞福田', '深圳东风南方华翔', '深圳金源'] },
                { area: '粤东区', stores: ['惠州俊通', '惠州南菱君达', '惠州永惠金泽', '梅州春天', '汕头东风南方华茂', '汕尾佳艺', '河源合利丰'] },
                { area: '粤中区', stores: ['中山东日', '中山中裕黄圃', '中山众杰', '云浮罗定怡诚', '江门丰泰', '江门怡泰恩城', '江门江沙', '清远金江', '清远银山英德', '珠海明珠', '珠海黄浦金湾', '韶关通九州', '韶关通九州韶冶'] },
            ]},
            { region: '华北区', areas: [
                { area: '冀北区', stores: ['唐山京佰朋昇', '唐山冀东', '唐山鸿业智途', '张家口北榕胜兴', '承德万焱', '秦皇岛京佰', '秦皇岛京德', '秦皇岛佳浩'] },
                { area: '冀南区', stores: ['保定东风南方和顺', '保定东风南方定州', '保定东风南方涿州', '保定东风南方竞秀', '沧州东风南方任丘', '沧州东风南方瑞鑫', '石家庄东风南方新华', '石家庄东风南方联德', '石家庄东风南方裕华', '石家庄东风南方长安', '衡水蓝池泽龙桃城', '邢台圣士龙', '邯郸东风南方南环'] },
                { area: '北京区', stores: ['北京东方华中', '北京东风南方三合', '北京东风南方丽泽', '北京东风南方亮马', '北京东风南方大兴', '北京东风南方大成', '北京华盛昌', '北京华盛昌四季青', '北京华盛昌百旺', '北京君诚驰悦', '北京福源', '北京福源平谷', '北京福源易众', '北京鑫达润城', '廊坊华盛昌广阳'] },
                { area: '天津区', stores: ['天津名宣', '天津名达', '天津宝静武清', '天津滨海', '天津鹏兴鑫达蓟州'] },
                { area: '山西区', stores: ['临汾东盛源', '太原东风南方汇泽', '太原东风南方龙城', '太原大源', '忻州东风南方汇润', '晋中东风南方汇盛', '晋城华洋', '朔州汇海', '运城瑞盈', '阳泉东风南方太行'] },
            ]},
            { region: '东北区', areas: [
                { area: '内蒙古区', stores: ['乌兰察布佰会', '兴安盟华楠', '包头恒通新茗领', '包头金达', '呼伦贝尔星跃', '呼和浩特世通', '呼和浩特嘉丰', '通辽龙兴伟业', '鄂尔多斯银达', '锡林浩特嘉洋'] },
                { area: '吉林区', stores: ['吉林裕富', '延吉裕富', '长春恒瑞'] },
                { area: '沈阳区', stores: ['沈阳东风南方辽沈', '沈阳中晨诚隆', '沈阳新世纪', '沈阳新世纪浑南'] },
                { area: '辽东区', stores: ['抚顺东风南方沈抚', '鞍山亿通东尼'] },
                { area: '辽西区', stores: ['大连佳艺', '葫芦岛川达'] },
                { area: '黑龙江区', stores: ['佳木斯凯华运通', '双鸭山凯华运通', '哈尔滨东风南方先锋路', '哈尔滨东风南方机场路', '哈尔滨中基展航', '绥化东风南方鸿运', '鸡西吉顺达'] },
            ]},
            { region: '西北区', areas: [
                { area: '新疆区', stores: ['乌鲁木齐卓辉', '乌鲁木齐博望', '乌鲁木齐开发区迎宾路', '乌鲁木齐赛博特', '乌鲁木齐骐辉', '伊犁元辉', '伊犁港裕', '克拉玛依浩辉', '吐鲁番火辉', '哈密泰辉', '喀什卓辉', '奎屯盈辉', '库尔勒瑞丰', '石河子升辉', '阿克苏奕辉', '阿勒泰祥辉'] },
                { area: '甘青区', stores: ['临夏环球万腾', '平凉恒信东顺东湖', '庆阳东风南方陇东汽车城', '武威鑫成', '西宁翔鹏', '西宁青鹏', '酒泉东风南方肃州高新', '金昌金奥顺驰'] },
                { area: '陕宁区', stores: ['咸阳秦汉新城万沣', '固原鸿源', '宝鸡东风南方高新', '西安东风南方三桥', '西安东风南方未央汉城', '西安东风南方浐灞佳泰', '银川京胜', '银川德胜', '银川恒晟', '银川添星创翼'] },
            ]},
            { region: '西南区', areas: [
                { area: '云南区', stores: ['保山弘信永昌', '大理东风南方苍山路', '文山东风南方腾龙', '昆明东风南方三佳', '昆明东风南方龙泉', '版纳东风南方佳旺', '玉溪东风南方太极路'] },
                { area: '川北区', stores: ['南充东风南方潆溪树生', '南充东风南方高坪', '巴中东恒云峰', '绵阳东风南方机场绵东', '绵阳东风南方绵兴', '达州东风南方新川'] },
                { area: '川南区', stores: ['宜宾河田翠屏'] },
                { area: '川藏区', stores: ['德阳东风南方西林', '眉山超越', '遂宁东风南方遂发', '雅安超越雨城'] },
                { area: '成都区', stores: ['成都东风南方双流成发', '成都东风南方成华龙潭', '成都东风南方机场路', '成都东风南方青羊苏坡'] },
                { area: '贵州区', stores: ['六盘水东风南方黔旺', '兴义恒信东顺', '安顺恒信东顺', '毕节东风南方金海湖', '贵阳东风南方孟关', '贵阳东风南方黔兴', '遵义东风南方黔发'] },
                { area: '重庆区', stores: ['涪陵文化', '重庆东新', '重庆东风南方海峡', '重庆东风南方渝东', '重庆东风南方渝兴', '重庆东风南方盛泰', '重庆东风南方西南汽贸城'] },
            ]},
            { region: '待确认', areas: [
                { area: '待确认', stores: ['东莞汇京长海', '十堰东风大道', '唐山汇京唐信', '宿州东十里', '泉州汇京南环路', '泉州汇京友联', '温州新成', '福州汇京福飞北', '福州汇京金山', '肇庆合利恒四会', '菏泽东风南方佳达', '衡水圣启龙', '西安精英', '运城瑞盈河津'] },
            ]},
        ];
        // 配备「部分门店空缺」类岗位（数营专家/直播专员/新媒体&市场经理）的空缺白名单
        // 已合并到 POSTS[*].blankStores；此处保留说明，本常量不再使用
        const SURNAMES = ['张', '李', '王', '刘', '陈', '赵', '孙', '周', '吴', '郑', '冯', '许', '何', '吕', '施', '曹', '袁', '邓', '沈', '韩', '杨', '朱', '秦', '尤'];
        const GIVEN_NAMES = ['伟', '娜', '强', '洋', '静', '敏', '磊', '婷', '鹏', '爽', '雪', '晨', '辉', '琳', '涛', '倩', '宁', '超', '梅', '俊', '峰', '丽', '斌', '霞', '坤', '颖', '昊', '萍', '浩', '丹'];

        let nodeSeq = 0;
        function makeNode(name, level, extra) {
            return Object.assign({
                id: 'n' + (nodeSeq++), name: name, level: level,
                children: [], series: null, parent: null,
                postKey: null, missNote: ''
            }, extra || {});
        }
        function personName(rnd, used) {
            for (let i = 0; i < 60; i++) {
                const n = SURNAMES[Math.floor(rnd() * SURNAMES.length)] + GIVEN_NAMES[Math.floor(rnd() * GIVEN_NAMES.length)];
                if (used.indexOf(n) < 0) { used.push(n); return n; }
            }
            const n = SURNAMES[Math.floor(rnd() * SURNAMES.length)] + GIVEN_NAMES[Math.floor(rnd() * GIVEN_NAMES.length)];
            used.push(n);
            return n;
        }
        function aggSeries(node) {
            if (node.series) return node.series;
            if (!node.children.length) return node.series;
            const s = {};
            METRIC_KEYS.forEach(function (k) { s[k] = new Float64Array(DAYS); });
            s.points = new Float64Array(DAYS);
            node.children.forEach(function (c) {
                const cs = aggSeries(c);
                if (!cs) return;
                METRIC_KEYS.forEach(function (k) {
                    const a = s[k], b = cs[k];
                    for (let i = 0; i < DAYS; i++) a[i] += b[i];
                });
                const ap = s.points, bp = cs.points;
                for (let i = 0; i < DAYS; i++) ap[i] += bp[i];
            });
            node.series = s;
            return s;
        }
        function buildTree() {
            nodeSeq = 0;
            const root = makeNode('全国', '全国');
            // 大区
            ORG_SPEC.forEach(function (r) {
                const regionNode = makeNode(r.region, '大区');
                regionNode.parent = root;
                // 小区
                r.areas.forEach(function (a) {
                    const areaNode = makeNode(a.area, '小区');
                    areaNode.parent = regionNode;
                    // 门店
                    a.stores.forEach(function (store) {
                        const storeNode = makeNode(store, '门店');
                        storeNode.postStats = { total: 0, missing: [] };
                        storeNode.parent = areaNode;
                        const usedNames = [];
                        // 岗位
                        POSTS.forEach(function (post) {
                            const sRnd = seededRandom(hashSeed('post|' + store + '|' + post.key));
                            let count = 0;
                            if (Array.isArray(post.blankStores)) {
                                // blankStores = 该岗位在这些门店空缺（count=0），其余门店出现（45% 概率 2 人 / 否则 1 人）
                                count = post.blankStores.indexOf(store) >= 0 ? 0 : (sRnd() < 0.45 ? 2 : 1);
                            } else {
                                count = post.min === post.max ? post.min : post.min + Math.floor(sRnd() * (post.max - post.min + 1));
                            }
                            if (count <= 0) {
                                // 空岗：不生成岗位节点，仅在门店上标记
                                storeNode.postStats.missing.push(post.key);
                                return;
                            }
                            const postNode = makeNode(post.name, '岗位', { postKey: post.key, color: post.color });
                            postNode.parent = storeNode;
                            postNode.storeName = store;
                            for (let i = 0; i < count; i++) {
                                const pRnd = seededRandom(hashSeed('p|' + store + '|' + post.key + '|' + i));
                                const pname = personName(pRnd, usedNames);
                                const pNode = makeNode(pname, '人员', { postKey: post.key, color: post.color });
                                pNode.parent = postNode;
                                pNode.storeName = store;
                                pNode.postName = post.name;
                                pNode.fullName = store + ' · ' + pname;
                                pNode.series = buildPersonSeries(store + '|' + post.key + '|' + i + '|' + pname, post);
                                postNode.children.push(pNode);
                            }
                            storeNode.children.push(postNode);
                            storeNode.postStats.total += count;
                        });
                        aggSeries(storeNode);
                        areaNode.children.push(storeNode);
                    });
                    aggSeries(areaNode);
                    regionNode.children.push(areaNode);
                });
                aggSeries(regionNode);
                root.children.push(regionNode);
            });
            aggSeries(root);
            return root;
        }

        const metricCache = new Map();
        function clearMetricCache() { metricCache.clear(); clearDutyCache(); }
        function metricsOf(node, i0, i1) {
            if (!node) return null;
            // API 模式：未加载逐日序列的节点走服务端区间合计缓存
            //（人员来自 /api/persons 根范围预载；其他节点来自 /api/nodesums 批量预载）
            if (DATA_MODE === 'api' && !node.series) {
                return lookupPersonSums(node, i0, i1) || lookupNodeSums(node, i0, i1) || METRIC_ZERO;
            }
            if (!node.series) return null;
            const key = node.id + '|' + i0 + '|' + i1;
            const hit = metricCache.get(key);
            if (hit) return hit;
            const m = {};
            METRIC_KEYS.forEach(function (k) { m[k] = Math.round(sumIdx(node.series[k], i0, i1)); });
            // 积分从 series.points 累加得到（按岗位差异化权重已写入），与人员积分相加后取整
            m.points = Math.round(sumIdx(node.series.points, i0, i1));
            metricCache.set(key, m);
            return m;
        }

        // ==================== v4.13：产品专家下钻四象限图（达成率 × 交付量）====================
        // 区间积分满分梯度：mock 每人独立梯度，hashSeed 确定性生成（1100~2500），保证刷新稳定；
        // 区间宽度 1400 ≈ 30 天产品专家积分上量（区间积分通常落在 600~2200，达成率分布合理）
        const PRODUCT_EXPERT_CAP_MIN = 1100;
        const PRODUCT_EXPERT_CAP_MAX = 2500;
        const personCapCache = new Map();
        function productExpertFullScore(person) {
            if (!person || !person.id) return PRODUCT_EXPERT_CAP_MIN;
            if (personCapCache.has(person.id)) return personCapCache.get(person.id);
            const span = PRODUCT_EXPERT_CAP_MAX - PRODUCT_EXPERT_CAP_MIN;
            const cap = PRODUCT_EXPERT_CAP_MIN + (hashSeed('pe-cap|' + person.id) % span);
            personCapCache.set(person.id, cap);
            return cap;
        }

        // ==================== v4.12：岗位关键动作得分率（演示数据层）====================
        // 口径：得分率 = 该动作「完成量 ÷ 该人被分配的任务量」（满分 = 分配任务量，随人、随日不同）
        // 数据：纯演示假数据，确定性生成（同一人 + 同一动作 → 同一序列），与闭环看板（单日口径）解耦，后续可替换为真实接口
        const DUTY_CACHE = new Map();              // node.id|i0|i1 → 区间聚合结果
        function clearDutyCache() { DUTY_CACHE.clear(); }
        // 人员节点所属岗位 key：优先自身 postKey，其次沿父链向上取，最后兜底首个岗位
        function postKeyOfPerson(node) {
            if (!node) return POSTS[0].key;
            if (node.postKey) return node.postKey;
            let p = node.parent;
            while (p) { if (p.postKey) return p.postKey; p = p.parent; }
            return POSTS[0].key;
        }
        function dutyActionsOf(postKey) { return POST_DUTIES[postKey] || POST_DUTIES[POSTS[0].key] || []; }
        // 单人 × 各动作 × 逐日序列：assign=分配任务量（满分基准）、done=实际完成量（整数，区间求和后比率天然自洽）
        function buildDutySeries(node) {
            const postKey = postKeyOfPerson(node);
            const actions = dutyActionsOf(postKey);
            const seedName = (node && (node.fullName || node.name)) || 'anon';
            const rnd = seededRandom(hashSeed('duty|' + seedName + '|' + postKey));
            const talent = 0.60 + rnd() * 0.36;                        // 个人整体得分率水平（60%~96%）
            const phase = rnd() * 6.28;
            const assign = [], done = [];
            actions.forEach(function (a) {
                const aRnd = seededRandom(hashSeed('dutyact|' + seedName + '|' + postKey + '|' + a.action));
                const base = 2 + Math.round(aRnd() * 7);               // 该动作每日基准任务量（2~9）
                const diff = 0.88 + aRnd() * 0.2;                      // 动作难度系数（越高越容易拿满）
                const aPhase = aRnd() * 6.28;                          // 该动作自身的波动相位（让各动作环比方向可不同）
                const as = new Float64Array(DAYS), dn = new Float64Array(DAYS);
                for (let i = 0; i < DAYS; i++) {
                    const d = new Date(START_DATE.getTime() + i * ONE_DAY);
                    const wd = d.getDay();
                    const weekend = (wd === 0 || wd === 6) ? 0.7 : (wd === 1 ? 0.95 : 1);
                    const wave = 1 + Math.sin(i * 0.31 + phase) * 0.14 + Math.sin(i * 0.07) * 0.08;
                    const noise = 0.86 + aRnd() * 0.28;
                    const n = Math.max(0, Math.round(base * weekend * wave * noise));
                    as[i] = n;
                    // 低频漂移：让不同日期区间的得分率产生可见的环比差异
                    const drift = 1 + Math.sin(i * 0.11 + aPhase) * 0.13;
                    const rate = Math.max(0.05, Math.min(1, talent * diff * drift * (0.9 + aRnd() * 0.2)));
                    dn[i] = Math.min(n, Math.round(n * rate));
                }
                assign.push(as); done.push(dn);
            });
            return { postKey: postKey, actions: actions, assign: assign, done: done };
        }
        function dutySeriesOf(node) {
            if (!node) return null;
            if (!node.dutySeries) node.dutySeries = buildDutySeries(node);
            return node.dutySeries;
        }
        // 区间聚合：返回 { postKey, items:[{action, detail, assign, done, rate}], totalAssign, totalDone, rate }
        function dutyRateOf(node, i0, i1) {
            if (!node) return null;
            const key = node.id + '|' + i0 + '|' + i1;
            const hit = DUTY_CACHE.get(key);
            if (hit) return hit;
            const s = dutySeriesOf(node);
            const items = s.actions.map(function (a, ai) {
                const assign = Math.round(sumIdx(s.assign[ai], i0, i1));
                const done = Math.round(sumIdx(s.done[ai], i0, i1));
                return {
                    action: a.action, detail: a.detail, assign: assign, done: done,
                    rate: assign > 0 ? (done / assign) * 100 : null
                };
            });
            const totalAssign = items.reduce(function (t, it) { return t + it.assign; }, 0);
            const totalDone = items.reduce(function (t, it) { return t + it.done; }, 0);
            const res = {
                postKey: s.postKey, items: items,
                totalAssign: totalAssign, totalDone: totalDone,
                rate: totalAssign > 0 ? (totalDone / totalAssign) * 100 : null
            };
            DUTY_CACHE.set(key, res);
            return res;
        }
        // 得分率单元格：主值 = 得分率%，副值 = 环比（百分点差；配色与指标矩阵保持一致：红色提升 / 绿色下降）
        function fmtRateCell(curRate, prevRate) {
            if (curRate === null || curRate === undefined) {
                return { html: '<div class="text-slate-500 text-sm leading-tight">—</div>' +
                    '<div class="text-xs mt-0.5" style="color:#64748b">无分配</div>' };
            }
            const valText = curRate.toFixed(1) + '%';
            let sub = '<div class="text-xs mt-0.5" style="color:#64748b">—</div>';
            if (prevRate !== null && prevRate !== undefined) {
                const d = curRate - prevRate;
                const color = Math.abs(d) < 0.5 ? '#64748b' : (d > 0 ? '#ef4444' : '#10b981');
                sub = '<div class="text-xs mt-0.5 font-medium" style="color:' + color + '">' +
                    (d > 0 ? '↑ +' : (d < 0 ? '↓ ' : '')) + d.toFixed(1) + 'pt</div>';
            }
            return { html: '<div class="text-slate-100 text-sm font-semibold leading-tight">' + valText + '</div>' + sub };
        }
        function collectLevel(node, level, out) {
            out = out || [];
            if (node.level === level) out.push(node);
            node.children.forEach(function (c) { collectLevel(c, level, out); });
            return out;
        }
        function nodePath(node) {
            const p = [];
            let cur = node;
            while (cur) { p.unshift(cur); cur = cur.parent; }
            return p;
        }
        function countLeaves(node) {
            if (!node.children.length) return 1;
            return node.children.reduce(function (s, c) { return s + countLeaves(c); }, 0);
        }
        function countStores(node) {
            let n = 0;
            (function walk(x) {
                if (x.level === '门店') n++;
                x.children.forEach(walk);
            })(node);
            return n;
        }
        // v4：统计已停用节点数量（仅「显示已停用」打开时树里才可能有 status=0 的节点）
        function countInactive(node) {
            let n = 0;
            (function walk(x) {
                if (x.status === 0) n++;
                x.children.forEach(walk);
            })(node);
            return n;
        }
