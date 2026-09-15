'use strict';
/**
 * seed.js —— 按前端 index.html 的 mock 生成规则，生成一年测试数据入库
 * 复刻内容：RATIO_CHAIN 转化链 / POSTS 岗位体系（leadFactor/damp/min-max/blankStores/pw 权重）/
 * ORG_SPEC 四大区七小区十三门店 / hashSeed+seededRandom 同款伪随机 / 周末与波形因子
 * 用途：验证 API 与前端 mock 口径一致；空库时可一键填充演示数据
 * 幂等性：--reset 先清空再生成；默认追加前先检查是否已有数据
 */
const path = require('path');
const { openDb, findOrCreateNode, rebuildAllPaths, METRIC_KEYS } = require('../db');

// ---------- 与前端 index.html 完全一致的常量 ----------
const RATIO_CHAIN = [
  ['validLeads', 'leads', 0.62], ['intentLeads', 'validLeads', 0.55], ['invites', 'intentLeads', 0.78],
  ['arrivals', 'invites', 0.72], ['testDrives', 'arrivals', 0.68], ['testReviews', 'testDrives', 0.72],
  ['returnVisits', 'testDrives', 0.74], ['opportunities', 'returnVisits', 0.82],
  ['locked', 'opportunities', 0.46], ['delivered', 'locked', 0.88]
];
const DAMP_FROM = ['arrivals', 'testDrives', 'returnVisits', 'opportunities', 'locked', 'delivered'];
const DEFAULT_POINTS_W = { locked: 30, delivered: 50, testDrives: 6, invites: 4, returnVisits: 5, opportunities: 8 };
const POSTS = [
  { key: 'dataExpert', name: '数营专家', color: '#22d3ee', leadFactor: 1.30, damp: 1.00, min: 0, max: 1,
    blankStores: ['上海徐汇中心店', '杭州钱江新城店', '北京朝阳店', '重庆渝北店', '成都锦江店'],
    pw: { locked: 22, delivered: 30, testDrives: 8, invites: 6, returnVisits: 6, opportunities: 10 } },
  { key: 'salesManager', name: '销售店长', color: '#8b5cf6', leadFactor: 0.42, damp: 1.05, min: 1, max: 1,
    pw: { locked: 36, delivered: 55, testDrives: 5, invites: 4, returnVisits: 4, opportunities: 7 } },
  { key: 'salesSpecialist', name: '销售专员', color: '#3b82f6', leadFactor: 1.00, damp: 1.00, min: 2, max: 4,
    pw: { locked: 30, delivered: 50, testDrives: 6, invites: 4, returnVisits: 5, opportunities: 8 } },
  { key: 'productExpert', name: '产品专家', color: '#06b6d4', leadFactor: 1.15, damp: 1.12, min: 2, max: 3,
    pw: { locked: 28, delivered: 40, testDrives: 12, invites: 5, returnVisits: 7, opportunities: 10 } },
  { key: 'deliveryManager', name: '交付店长', color: '#a78bfa', leadFactor: 0.38, damp: 1.08, min: 1, max: 1,
    pw: { locked: 20, delivered: 70, testDrives: 4, invites: 3, returnVisits: 6, opportunities: 9 } },
  { key: 'deliverySpecialist', name: '交付专员', color: '#c084fc', leadFactor: 0.92, damp: 1.04, min: 2, max: 3,
    pw: { locked: 24, delivered: 60, testDrives: 5, invites: 4, returnVisits: 5, opportunities: 8 } },
  { key: 'liveStreamer', name: '直播专员', color: '#ec4899', leadFactor: 1.62, damp: 0.55, min: 0, max: 2,
    blankStores: ['上海徐汇中心店', '杭州西湖店', '深圳南山店', '广州天河店', '成都高新店', '重庆渝北店'],
    pw: { locked: 26, delivered: 45, testDrives: 7, invites: 8, returnVisits: 4, opportunities: 9 } },
  { key: 'newMedia', name: '新媒体运营', color: '#f472b6', leadFactor: 1.18, damp: 0.78, min: 0, max: 1,
    blankStores: ['上海浦东旗舰店', '杭州钱江新城店', '深圳宝安店', '北京朝阳店', '广州天河店', '重庆渝北店', '成都锦江店'],
    pw: { locked: 22, delivered: 36, testDrives: 5, invites: 7, returnVisits: 5, opportunities: 8 } },
  { key: 'marketManager', name: '市场经理', color: '#f59e0b', leadFactor: 0.86, damp: 1.02, min: 1, max: 1,
    pw: { locked: 24, delivered: 42, testDrives: 5, invites: 8, returnVisits: 5, opportunities: 7 } },
  { key: 'customerManager', name: '客户管家/经理', color: '#10b981', leadFactor: 1.05, damp: 1.10, min: 2, max: 3,
    pw: { locked: 30, delivered: 48, testDrives: 6, invites: 9, returnVisits: 8, opportunities: 10 } }
];
const ORG_SPEC = [
  { region: '华东大区', areas: [
    { area: '上海一区', stores: ['上海浦东旗舰店', '上海徐汇中心店'] },
    { area: '杭州小区', stores: ['杭州西湖店', '杭州钱江新城店'] } ] },
  { region: '华南大区', areas: [
    { area: '广州小区', stores: ['广州天河店', '广州番禺店'] },
    { area: '深圳小区', stores: ['深圳南山店', '深圳宝安店'] } ] },
  { region: '华北大区', areas: [
    { area: '北京一区', stores: ['北京朝阳店', '北京亦庄店'] },
    { area: '天津小区', stores: ['天津滨海店'] } ] },
  { region: '西南大区', areas: [
    { area: '成都小区', stores: ['成都高新店', '成都锦江店'] },
    { area: '重庆小区', stores: ['重庆渝北店'] } ] }
];
const SURNAMES = ['张', '李', '王', '刘', '陈', '赵', '孙', '周', '吴', '郑', '冯', '许', '何', '吕', '施', '曹', '袁', '邓', '沈', '韩', '杨', '朱', '秦', '尤'];
const GIVEN_NAMES = ['伟', '娜', '强', '洋', '静', '敏', '磊', '婷', '鹏', '爽', '雪', '晨', '辉', '琳', '涛', '倩', '宁', '超', '梅', '俊', '峰', '丽', '斌', '霞', '坤', '颖', '昊', '萍', '浩', '丹'];

// ---------- 同款伪随机 ----------
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
function personName(rnd, used) {
  for (let i = 0; i < 60; i++) {
    const n = SURNAMES[Math.floor(rnd() * SURNAMES.length)] + GIVEN_NAMES[Math.floor(rnd() * GIVEN_NAMES.length)];
    if (used.indexOf(n) < 0) { used.push(n); return n; }
  }
  const n = SURNAMES[Math.floor(rnd() * SURNAMES.length)] + GIVEN_NAMES[Math.floor(rnd() * GIVEN_NAMES.length)];
  used.push(n);
  return n;
}
function pointsOfRaw(m, postKey) {
  const post = POSTS.find(p => p.key === postKey);
  const w = (post && post.pw) || DEFAULT_POINTS_W;
  return (m.locked || 0) * w.locked + (m.delivered || 0) * w.delivered + (m.testDrives || 0) * w.testDrives +
    (m.invites || 0) * w.invites + (m.returnVisits || 0) * w.returnVisits + (m.opportunities || 0) * w.opportunities;
}

const ONE_DAY = 86400000;
const DAYS = 365;

function main() {
  const reset = process.argv.includes('--reset');
  const db = openDb();
  const existing = db.prepare('SELECT COUNT(*) AS c FROM daily_metrics').get().c;
  if (existing > 0 && !reset) {
    console.log(`库中已有 ${existing} 行指标数据。如需重新生成请加 --reset（会清空全部数据）。`);
    process.exit(0);
  }
  if (reset) {
    db.exec('DELETE FROM daily_metrics; DELETE FROM node_paths; DELETE FROM org_nodes; DELETE FROM posts;');
    console.log('已清空 org_nodes / posts / daily_metrics / node_paths');
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(today.getTime() - (DAYS - 1) * ONE_DAY);
  const dateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 1) 岗位配置入库
  const insPost = db.prepare(`INSERT OR REPLACE INTO posts
    (key, name, color, min_cnt, max_cnt, pw_locked, pw_delivered, pw_test_drives, pw_invites, pw_return_visits, pw_opportunities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const txPosts = db.transaction(() => POSTS.forEach(p => insPost.run(
    p.key, p.name, p.color, p.min, p.max,
    p.pw.locked, p.pw.delivered, p.pw.testDrives, p.pw.invites, p.pw.returnVisits, p.pw.opportunities
  )));
  txPosts();

  // 2) 组织树 + 人员（复刻 buildTree 的岗位人数规则）
  const rootId = findOrCreateNode(db, '全国', '全国', null);
  const persons = []; // {id, name, store, postKey, series}
  for (const r of ORG_SPEC) {
    const regionId = findOrCreateNode(db, r.region, '大区', rootId);
    for (const a of r.areas) {
      const areaId = findOrCreateNode(db, a.area, '小区', regionId);
      for (const store of a.stores) {
        const storeId = findOrCreateNode(db, store, '门店', areaId);
        const usedNames = [];
        for (const post of POSTS) {
          const sRnd = seededRandom(hashSeed('post|' + store + '|' + post.key));
          let count;
          if (Array.isArray(post.blankStores)) {
            count = post.blankStores.indexOf(store) >= 0 ? 0 : (sRnd() < 0.45 ? 2 : 1);
          } else {
            count = post.min === post.max ? post.min : post.min + Math.floor(sRnd() * (post.max - post.min + 1));
          }
          if (count <= 0) continue;
          const postNodeId = findOrCreateNode(db, post.name, '岗位', storeId, post.key);
          for (let i = 0; i < count; i++) {
            const pRnd = seededRandom(hashSeed('p|' + store + '|' + post.key + '|' + i));
            const name = personName(pRnd, usedNames);
            const personId = findOrCreateNode(db, name, '人员', postNodeId, post.key);
            persons.push({ id: personId, name, store, postKey: post.key, idx: i });
          }
        }
      }
    }
  }
  rebuildAllPaths(db);
  console.log(`组织树完成：${persons.length} 名人员`);

  // 3) 逐人生成 365 天序列并入库（复刻 buildPersonSeries）
  const insMetric = db.prepare(`INSERT OR REPLACE INTO daily_metrics
    (person_id, date, leads, valid_leads, intent_leads, invites, arrivals, test_drives, test_reviews, return_visits, opportunities, locked, delivered)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let rowTotal = 0;
  const txMetrics = db.transaction(() => {
    for (const person of persons) {
      const post = POSTS.find(p => p.key === person.postKey);
      const rnd = seededRandom(hashSeed(person.store + '|' + person.postKey + '|' + person.idx + '|' + person.name));
      const baseLeads = (2.6 + rnd() * 5.2) * post.leadFactor;
      const phase = rnd() * 6.28;
      const cum = { leads: 1 };
      RATIO_CHAIN.forEach(([target, src, ratio]) => {
        let rr = ratio * (0.82 + rnd() * 0.36);
        if (DAMP_FROM.indexOf(target) >= 0) rr *= post.damp;
        rr = Math.max(0.02, Math.min(1, rr));
        cum[target] = cum[src] * rr;
      });
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(startDate.getTime() + i * ONE_DAY);
        const wd = d.getDay();
        const weekend = (wd === 0 || wd === 6) ? 1.22 : (wd === 1 ? 0.94 : 1);
        const wave = 1 + Math.sin(i * 0.29 + phase) * 0.16 + Math.sin(i * 0.053) * 0.1;
        const noise = 0.82 + rnd() * 0.36;
        const leads = Math.max(0, baseLeads * weekend * wave * noise);
        const v = {};
        for (const k of METRIC_KEYS) {
          const jitter = 0.88 + rnd() * 0.24;
          v[k] = Math.max(0, leads * cum[k] * jitter);
        }
        insMetric.run(person.id, dateStr(d),
          v.leads, v.validLeads, v.intentLeads, v.invites, v.arrivals,
          v.testDrives, v.testReviews, v.returnVisits, v.opportunities, v.locked, v.delivered);
        rowTotal++;
      }
    }
  });
  const t0 = Date.now();
  txMetrics();
  console.log(`指标入库完成：${rowTotal} 行，耗时 ${Date.now() - t0} ms`);

  // 4) 自验：行数、日期覆盖、抽查积分口径
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM daily_metrics').get().c;
  const dr = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max, COUNT(DISTINCT date) AS days FROM daily_metrics').get();
  const stores = db.prepare("SELECT COUNT(*) AS c FROM org_nodes WHERE level = '门店'").get().c;
  console.log(`[自验] 行数=${cnt}（期望 ${rowTotal}） 门店=${stores}（期望 14） 日期=${dr.min} ~ ${dr.max}（${dr.days} 天，期望 ${DAYS}）`);
  if (cnt !== rowTotal || stores !== 14 || dr.days !== DAYS) { console.error('[自验] 未通过！'); process.exit(1); }
  console.log('[自验] 通过 ✔');
  db.close();
}

main();
