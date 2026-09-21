// 业务数据看板 v5.12 — 数据/规则常量（P2 抽离）
// 含：指标定义、趋势指标、漏斗阶段、岗位体系、岗位职责、层级规则、积分权重
// 注意：须在 index.html 主脚本之前加载（全局 const，后续 script 共享作用域）

        const METRIC_KEYS = ['leads', 'validLeads', 'intentLeads', 'invites', 'arrivals', 'testDrives', 'testReviews', 'returnVisits', 'opportunities', 'locked', 'delivered'];
        const METRIC_LABEL = {
            leads: '线索量', validLeads: '有效线索', intentLeads: '意向线索', invites: '邀约排程',
            arrivals: '到店量', testDrives: '有效试驾', testReviews: '试驾点评数', returnVisits: '二次回访', opportunities: '商机量',
            locked: '锁单量', delivered: '交付量', points: '积分'
        };
        const METRIC_UNIT = {
            leads: '条', validLeads: '条', intentLeads: '条', invites: '次', arrivals: '人',
            testDrives: '人', testReviews: '条', returnVisits: '人', opportunities: '个', locked: '单', delivered: '辆', points: '分'
        };
        const METRIC_COLOR = {
            leads: '#3b82f6', validLeads: '#06b6d4', intentLeads: '#f59e0b', invites: '#10b981',
            arrivals: '#3b82f6', testDrives: '#06b6d4', testReviews: '#22d3ee', returnVisits: '#8b5cf6', opportunities: '#10b981',
            locked: '#10b981', delivered: '#ec4899', points: '#f59e0b'
        };
        // 指标环比矩阵列定义：行=大区/小区/门店…，列=核心指标，每格=数值+环比
        const DRILL_MATRIX_COLS = [
            { key: 'leads', label: '线索量' },
            { key: 'intentLeads', label: '邀约转化' },
            { key: 'arrivals', label: '到店量' },
            { key: 'testDrives', label: '有效试驾' },
            { key: 'testReviews', label: '试驾点评数' },
            { key: 'locked', label: '锁单量' },
            { key: 'delivered', label: '交车量' }
        ];
        // 门店 → 岗位 下钻时的列定义（核心指标消失，改为单列积分达成率）
        const DRILL_MATRIX_COLS_POST = [
            { key: 'points', label: '积分达成率' }
        ];

        const TREND_METRICS = [
            { key: 'intentLeads', type: 'abs', label: '意向线索', color: METRIC_COLOR.intentLeads },
            { key: 'arrivals', type: 'abs', label: '到店', color: '#22d3ee' },
            { key: 'locked', type: 'abs', label: '锁单', color: METRIC_COLOR.locked },
            { key: 'leads', type: 'abs', label: '新增线索', color: METRIC_COLOR.leads },
            { key: 'testDrives', type: 'abs', label: '试驾', color: METRIC_COLOR.testDrives },
            { key: 'delivered', type: 'abs', label: '交付', color: METRIC_COLOR.delivered },
            { key: 'invites', type: 'abs', label: '邀约排程', color: METRIC_COLOR.invites },
            { key: 'intentToArrival', type: 'rate', num: 'arrivals', den: 'intentLeads', label: '意向线索→到店 转化率', color: '#a78bfa' },
            { key: 'arrivalToTest', type: 'rate', num: 'testDrives', den: 'arrivals', label: '到店→试驾 转化率', color: '#fbbf24' },
            { key: 'testToLock', type: 'rate', num: 'locked', den: 'testDrives', label: '试驾→锁单 转化率', color: '#f472b6' }
        ];
        const RATIO_CHAIN = [
            ['validLeads', 'leads', 0.62],
            ['intentLeads', 'validLeads', 0.55],
            ['invites', 'intentLeads', 0.78],
            ['arrivals', 'invites', 0.72],
            ['testDrives', 'arrivals', 0.68],
            ['testReviews', 'testDrives', 0.72],
            ['returnVisits', 'testDrives', 0.74],
            ['opportunities', 'returnVisits', 0.82],
            ['locked', 'opportunities', 0.46],
            ['delivered', 'locked', 0.88]
        ];
        // 全链路漏斗（v5.12：首层改为意向线索，只保留 邀约排程/到店/有效试驾/锁单/交付 共 6 阶段）
        const FUNNEL_STAGES = [
            { key: 'intentLeads', name: '意向线索', color: '#6366f1' },
            { key: 'invites', name: '邀约排程', color: '#10b981' },
            { key: 'arrivals', name: '到店', color: '#22d3ee' },
            { key: 'testDrives', name: '有效试驾', color: '#8b5cf6' },
            { key: 'locked', name: '锁单', color: '#f59e0b' },
            { key: 'delivered', name: '交付', color: '#ec4899' }
        ];
        // 岗位规则：8 岗位体系（v4.11 起以业务岗位职责文本为准）；店长/经理类一岗一人，专员/专家类一岗多人；数营专家、直播专员、新媒体&市场经理在部分门店空缺
        // v4.11 口径调整：销售专员归入产品专家（人数区间合并）；市场经理 + 新媒体运营合并为「新媒体&市场经理」；客户管家/经理改名为「客关经理」
        // pw：积分权重覆盖（按岗位差异化，让散点图的 X = 累计积分 与 Y = 锁单量 非线性相关）
        const POSTS = [
            { key: 'productExpert', name: '产品专家', color: '#06b6d4', leadFactor: 1.10, damp: 1.06, min: 4, max: 7, note: '一岗多人（含原销售专员）',
              pw: { locked: 28, delivered: 40, testDrives: 12, invites: 5, returnVisits: 7, opportunities: 10 } },
            { key: 'salesManager', name: '销售店长', color: '#8b5cf6', leadFactor: 0.42, damp: 1.05, min: 1, max: 1, note: '一岗一人',
              pw: { locked: 36, delivered: 55, testDrives: 5, invites: 4, returnVisits: 4, opportunities: 7 } },
            { key: 'dataExpert', name: '数营专家', color: '#22d3ee', leadFactor: 1.30, damp: 1.00, min: 0, max: 1, note: '部分门店空缺',
              pw: { locked: 22, delivered: 30, testDrives: 8, invites: 6, returnVisits: 6, opportunities: 10 } },
            { key: 'deliveryManager', name: '交付店长', color: '#a78bfa', leadFactor: 0.38, damp: 1.08, min: 1, max: 1, note: '一岗一人',
              pw: { locked: 20, delivered: 70, testDrives: 4, invites: 3, returnVisits: 6, opportunities: 9 } },
            { key: 'deliverySpecialist', name: '交付专员', color: '#c084fc', leadFactor: 0.92, damp: 1.04, min: 2, max: 3, note: '一岗多人',
              pw: { locked: 24, delivered: 60, testDrives: 5, invites: 4, returnVisits: 5, opportunities: 8 } },
            { key: 'mediaMarketManager', name: '新媒体&市场经理', color: '#f59e0b', leadFactor: 1.00, damp: 0.92, min: 0, max: 2, note: '部分门店空缺（原市场经理 + 新媒体运营）',
              pw: { locked: 23, delivered: 39, testDrives: 5, invites: 7, returnVisits: 5, opportunities: 8 } },
            { key: 'liveStreamer', name: '直播专员', color: '#ec4899', leadFactor: 1.62, damp: 0.55, min: 0, max: 2, note: '部分门店空缺',
              pw: { locked: 26, delivered: 45, testDrives: 7, invites: 8, returnVisits: 4, opportunities: 9 } },
            { key: 'customerManager', name: '客关经理', color: '#10b981', leadFactor: 1.05, damp: 1.10, min: 2, max: 3, note: '一岗多人',
              pw: { locked: 30, delivered: 48, testDrives: 6, invites: 9, returnVisits: 8, opportunities: 10 } }
        ];
        const POSTS_BY_KEY = {};
        POSTS.forEach(function (p) { POSTS_BY_KEY[p.key] = p; });
        // 岗位职责说明表：岗位 key → [{ action: 关键动作, detail: 具体内容 }]（示意文案，待业务确认）
        const POST_DUTIES = {
            productExpert: [
                { action: '线索预约', detail: '接收分配线索后第一时间外呼，确认购车意向并预约到店时间，预约信息回填系统' },
                { action: '到店接待', detail: '按接待流程完成迎宾、需求探询、车型讲解与试驾邀约，登记接待记录' },
                { action: '试乘试驾', detail: '按标准路线与话术执行试驾，完成安全确认、功能演示与试驾反馈登记' },
                { action: '锁单', detail: '协助客户确认配置与报价、收取定金，在系统完成锁单并同步至交付群' }
            ],
            salesManager: [
                { action: '晨会管理', detail: '主持晨会，对齐当日目标与线索分配，检查出勤与展厅状态' },
                { action: '夕会管理', detail: '主持夕会，复盘当日线索、到店与锁单达成，输出次日改善动作' },
                { action: '邀约管理', detail: '抽查邀约记录与到店预约达成率，对低效邀约人员做一对一辅导' },
                { action: '接待管理', detail: '巡查接待规范执行（迎宾、需求探询、留档），纠正违规动作' },
                { action: '试驾管理', detail: '检查试驾执行率与试驾点评，确保试驾路线与安全话术落地' },
                { action: '成交管理', detail: '跟进意向客户转化，审核报价与优惠申请，推进锁单成交' },
                { action: '满意度管理', detail: '关注回访结果与投诉工单，对不满意客户介入处理并跟进闭环' }
            ],
            dataExpert: [
                { action: '线索处理', detail: '承接并清洗各渠道线索，去重判重后按规则分配至门店' },
                { action: '线索判定', detail: '依据线索质量规则判定有效/无效，标记异常与疑似虚假线索' },
                { action: '垂媒发布', detail: '按排期在汽车之家、懂车帝等垂媒平台发布内容与活动信息' },
                { action: '线索日报', detail: '汇总当日线索量、来源与转化情况，输出日报并同步相关岗位' }
            ],
            deliveryManager: [
                { action: '交付群抽查', detail: '抽查锁单客户交付群分配、入群、自我介绍和问题响应' },
                { action: '首访核查', detail: '核查交付首访是否按标准话术与时限完成，记录缺失项并督促整改' },
                { action: '跟进抽检', detail: '抽检交付跟进记录的完整性与及时性，对未达标人员做辅导' },
                { action: '交付计划', detail: '制定并滚动更新交付排程计划，协调车源与交付节奏' },
                { action: '交付准备', detail: '检查车辆整备、资料准备与上牌、保险等交付前置事项' },
                { action: '走动管理', detail: '现场走动巡店，观察交付环节执行情况并即时纠偏' },
                { action: '异常处置', detail: '处理交付过程中的异常（延期、车辆问题、客户异议）并跟进闭环' },
                { action: '首访', detail: '亲自完成重点客户交付首访，确认客户需求与期望管理' },
                { action: '配车转采', detail: '跟进配车与转采流程，确保订单按节奏推进至可交付状态' }
            ],
            deliverySpecialist: [
                { action: '物流提醒', detail: '跟踪车辆物流状态，遇异常或到店前及时提醒客户与店端' },
                { action: '交付排程', detail: '与客户确认交付时间，排定交付工位与人力安排' },
                { action: '车辆讲解', detail: '按交付标准完成车辆功能讲解与操作演示' },
                { action: '交付仪式', detail: '按交付仪式流程完成交车环节并留存影像记录' },
                { action: '企微应答', detail: '在企微群内及时响应客户咨询，同步交付进度' }
            ],
            mediaMarketManager: [
                { action: '企微应答', detail: '负责企微客户群与私信的及时应答与线索承接，避免遗漏' },
                { action: '直播勤勉', detail: '按排期完成直播场次与时长，保证直播勤勉度达标' },
                { action: '内容勤勉', detail: '按计划完成图文、短视频内容产出与发布，保证更新频次' },
                { action: '私信回复', detail: '及时回复各平台私信，识别高意向客户并转为线索' },
                { action: '线索获取', detail: '通过内容与投放获取线索，登记来源并完成分发' }
            ],
            liveStreamer: [
                { action: '直播勤勉', detail: '按排班完成直播时长与场次，遵守直播规范与话术要求' },
                { action: '线索获取', detail: '直播中引导客户留资，收集并登记线索信息' }
            ],
            customerManager: [
                { action: '回访数据', detail: '汇总回访数据与达成率，输出问题清单并推动改善' },
                { action: '客户分层', detail: '按客户价值与购车阶段维护分层标签，指导差异化管理' },
                { action: '满意度管理', detail: '跟踪满意度调研与投诉闭环，落实改善措施' },
                { action: '夕会教练', detail: '在夕会上做客户满意度与回访话术的教练辅导' }
            ]
        };
        const DAMP_FROM = ['arrivals', 'testDrives', 'returnVisits', 'opportunities', 'locked', 'delivered'];

        // 默认积分权重（产品专家沿用此口径），POSTS[*].pw 可覆盖
        const DEFAULT_POINTS_W = { locked: 30, delivered: 50, testDrives: 6, invites: 4, returnVisits: 5, opportunities: 8 };

        // 层级可跳转规则：全国→大区→小区→门店→岗位→人员
        const NEXT_LEVEL = { '全国': '大区', '大区': '小区', '小区': '门店', '门店': '岗位', '岗位': '人员', '人员': null };
