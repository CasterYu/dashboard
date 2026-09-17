'use strict';
/**
 * v4.6 动作积分查询接口（灯塔评分）
 *   GET /api/scoring/meta                     数据概况（可用日期、岗位、行数）
 *   GET /api/scoring/tree?date=&post=         大区/小区/门店三级树（含人数与积分）
 *   GET /api/scoring/rules?post=              动作积分规则（post=all 返回全部岗位）
 *   GET /api/scoring/persons?date=&post=&storeId=&region=&area=   人员当日积分排名
 *   GET /api/scoring/summary?date=&post=&personId=                人员×拿分项日汇总（拿分项得分）
 *   GET /api/scoring/details?date=&personId=&post=                动作明细（AI 证据链）
 *
 * 口径：拿分项得分 = clamp(1 + Σ 动作得分, 0, 1)；当日积分 = Σ 拿分项得分（满分见岗位规则条数）
 */
const express = require('express');

/**
 * 拿分项得分：以个人日汇总表的 score 为准（真实数据中已是 0 / 0.5 / 1 的达成分），
 * 按规则封顶 cap 截断；无汇总行时回退为明细动作得分之和（与前端 clDataIndex 口径一致）。
 */
function clampItemScore(sum, cap) {
  const v = Number(sum || 0);
  const c = Number(cap) > 0 ? Number(cap) : 1;
  return Math.max(0, Math.min(c, Number(v.toFixed(4))));
}

/** 全量组织节点（数百行，一次读入内存后按 parent 上溯，避免逐店递归查询） */
function loadNodeIndex(db) {
  const rows = db.prepare('SELECT id, name, level, parent_id FROM org_nodes').all();
  const byId = new Map(rows.map(r => [r.id, r]));
  /** 上溯取指定层级的祖先名（门店 → 小区 → 大区 → 全国） */
  function upTo(nodeId, level) {
    let cur = byId.get(nodeId);
    let guard = 0;
    while (cur && guard++ < 10) {
      if (cur.level === level) return cur.name;
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return '';
  }
  return { byId, upTo };
}

module.exports = function scoringRoute(db) {
  const router = express.Router();
  /** 每次请求重建组织索引，保证名册导入后门店层级立即生效（org_nodes 数百行，开销可忽略） */
  const nodeIndex = () => loadNodeIndex(db);

  // ---------- 规则 ----------
  function rulesOf(postKey) {
    if (postKey && postKey !== 'all') {
      return db.prepare('SELECT * FROM action_rules WHERE post_key = ? ORDER BY seq, item').all(postKey);
    }
    return db.prepare('SELECT * FROM action_rules ORDER BY post_key, seq, item').all();
  }
  function mapRule(r) {
    return {
      postKey: r.post_key, seq: r.seq, item: r.item, action: r.action,
      per: r.per, capNormal: r.cap_normal, capWeekend: r.cap_weekend,
      mustDo: r.must_do, judge: r.judge, noScore: r.no_score, evidence: r.evidence,
      enabled: !!r.enabled
    };
  }

  router.get('/scoring/rules', (req, res) => {
    const post = String(req.query.post || 'all');
    const rules = rulesOf(post).map(mapRule);
    res.json({ ok: true, post, count: rules.length, rules });
  });

  // ---------- 概况 ----------
  router.get('/scoring/meta', (req, res) => {
    const days = db.prepare('SELECT DISTINCT date FROM action_scores ORDER BY date').all().map(r => r.date);
    const sumDays = db.prepare('SELECT DISTINCT date FROM action_daily_sums ORDER BY date').all().map(r => r.date);
    const posts = db.prepare(`SELECT s.post_key,
        (SELECT name FROM posts WHERE key = s.post_key) AS post_name,
        COUNT(*) AS detail_rows,
        COUNT(DISTINCT s.person_id) AS persons,
        COUNT(DISTINCT s.store_id) AS stores,
        (SELECT COUNT(*) FROM action_daily_sums d WHERE d.post_key = s.post_key) AS sum_rows,
        (SELECT COUNT(*) FROM action_rules r WHERE r.post_key = s.post_key) AS rule_rows
      FROM action_scores s GROUP BY s.post_key ORDER BY detail_rows DESC`).all();
    res.json({
      ok: true,
      days,
      sumDays,
      counts: {
        rules: db.prepare('SELECT COUNT(*) c FROM action_rules').get().c,
        details: db.prepare('SELECT COUNT(*) c FROM action_scores').get().c,
        sums: db.prepare('SELECT COUNT(*) c FROM action_daily_sums').get().c
      },
      posts: posts.map(p => ({
        postKey: p.post_key, postName: p.post_name || p.post_key,
        detailRows: p.detail_rows, sumRows: p.sum_rows, ruleRows: p.rule_rows,
        persons: p.persons, stores: p.stores
      }))
    });
  });

  // ---------- 门店三级树 ----------
  router.get('/scoring/tree', (req, res) => {
    const { date, post } = req.query;
    const { upTo } = nodeIndex();
    const where = ['store_id IS NOT NULL'];
    const params = [];
    if (date) { where.push('date = ?'); params.push(String(date)); }
    if (post && post !== 'all') { where.push('post_key = ?'); params.push(String(post)); }
    const rows = db.prepare(`SELECT store_id, MAX(store_name) store_name,
        COUNT(DISTINCT person_id) persons, COUNT(*) rows_cnt
      FROM action_scores WHERE ${where.join(' AND ')} GROUP BY store_id`).all(...params);
    const regions = new Map();
    for (const r of rows) {
      const region = upTo(r.store_id, '大区') || '未归属大区';
      const area = upTo(r.store_id, '小区') || '未归属小区';
      if (!regions.has(region)) regions.set(region, { region, stores: 0, persons: 0, areas: new Map() });
      const reg = regions.get(region);
      reg.stores++; reg.persons += r.persons;
      if (!reg.areas.has(area)) reg.areas.set(area, { area, stores: [] });
      reg.areas.get(area).stores.push({ storeId: r.store_id, name: r.store_name, persons: r.persons, rows: r.rows_cnt });
    }
    const tree = Array.from(regions.values()).map(reg => ({
      region: reg.region, stores: reg.stores, persons: reg.persons,
      areas: Array.from(reg.areas.values()).map(a => ({
        area: a.area, stores: a.stores.length,
        nodes: a.stores.sort((x, y) => y.persons - x.persons)
      })).sort((a, b) => b.stores - a.stores)
    })).sort((a, b) => b.persons - a.persons);
    res.json({ ok: true, date: date || null, post: post || 'all', total: rows.length, tree });
  });

  // ---------- 人员×拿分项日汇总 ----------
  /** 规则封顶索引：post_key|item → cap_normal（拿分项满分，通常 1） */
  function capIndex(post) {
    const rows = post && post !== 'all'
      ? db.prepare('SELECT post_key, item, cap_normal FROM action_rules WHERE post_key = ?').all(String(post))
      : db.prepare('SELECT post_key, item, cap_normal FROM action_rules').all();
    const m = new Map();
    for (const r of rows) m.set(r.post_key + '|' + r.item, Number(r.cap_normal) || 1);
    return m;
  }

  function itemScoresOf(date, post, personId) {
    const where = ['date = ?'];
    const params = [String(date)];
    if (post && post !== 'all') { where.push('post_key = ?'); params.push(String(post)); }
    if (personId) { where.push('person_id = ?'); params.push(Number(personId)); }
    const caps = capIndex(post);
    const byPerson = new Map();
    const seen = new Set();
    const bucketOf = pid => {
      if (!byPerson.has(pid)) byPerson.set(pid, { personId: pid, point: 0, capCover: 0, items: [] });
      return byPerson.get(pid);
    };

    // 主口径：个人日汇总 score（已含达成分）
    const sums = db.prepare(`SELECT person_id, post_key, item, SUM(score) AS s, SUM(cnt) AS cnt,
        SUM(target_score) AS target_score, MAX(target) AS target
      FROM action_daily_sums WHERE ${where.join(' AND ')}
      GROUP BY person_id, post_key, item`).all(...params);
    for (const r of sums) {
      const cap = caps.get(r.post_key + '|' + r.item) || 1;
      const b = bucketOf(r.person_id);
      b.items.push({
        item: r.item, target: r.target, count: r.cnt, targetScore: r.target_score,
        cap, rawScore: Number(r.s.toFixed(4)), score: clampItemScore(r.s, cap), source: 'sum'
      });
      b.point += clampItemScore(r.s, cap);
      b.capCover += cap;
      seen.add(r.person_id + '|' + r.post_key + '|' + r.item);
    }

    // 兜底口径：无汇总行的拿分项，用动作明细得分之和（与前端一致的降级策略）
    const dWhere = ['date = ?'];
    const dParams = [String(date)];
    if (post && post !== 'all') { dWhere.push('post_key = ?'); dParams.push(String(post)); }
    if (personId) { dWhere.push('person_id = ?'); dParams.push(Number(personId)); }
    const dets = db.prepare(`SELECT person_id, post_key, item, SUM(score) AS s, COUNT(*) AS cnt
      FROM action_scores WHERE ${dWhere.join(' AND ')}
      GROUP BY person_id, post_key, item`).all(...dParams);
    for (const r of dets) {
      if (seen.has(r.person_id + '|' + r.post_key + '|' + r.item)) continue;
      const cap = caps.get(r.post_key + '|' + r.item) || 1;
      const b = bucketOf(r.person_id);
      b.items.push({
        item: r.item, target: null, count: r.cnt, targetScore: null,
        cap, rawScore: Number(r.s.toFixed(4)), score: clampItemScore(r.s, cap), source: 'detail'
      });
      b.point += clampItemScore(r.s, cap);
      b.capCover += cap;
    }

    for (const b of byPerson.values()) {
      b.point = Number(b.point.toFixed(4));
      b.rate = b.capCover ? Number((b.point / b.capCover * 100).toFixed(1)) : 0;
    }
    return byPerson;
  }

  router.get('/scoring/summary', (req, res) => {
    const { date, post, personId } = req.query;
    if (!date) return res.status(400).json({ ok: false, error: '缺少 date 参数（YYYY-MM-DD）' });
    const byPerson = itemScoresOf(date, post, personId);
    const out = Array.from(byPerson.values()).sort((a, b) => b.point - a.point);
    res.json({ ok: true, date, post: post || 'all', persons: out.length, summary: out });
  });

  // ---------- 人员当日积分排名 ----------
  router.get('/scoring/persons', (req, res) => {
    const { date, post, storeId, region, area } = req.query;
    if (!date) return res.status(400).json({ ok: false, error: '缺少 date 参数（YYYY-MM-DD）' });
    const { upTo } = nodeIndex();
    const where = ['date = ?'];
    const params = [String(date)];
    if (post && post !== 'all') { where.push('post_key = ?'); params.push(String(post)); }
    if (storeId) { where.push('store_id = ?'); params.push(Number(storeId)); }
    const rows = db.prepare(`SELECT person_id, MAX(emp_no) emp_no, MAX(person_name) person_name,
        MAX(post_key) post_key, MAX(store_id) store_id, MAX(store_name) store_name,
        SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END) AS deduct_rows
      FROM action_scores WHERE ${where.join(' AND ')}
      GROUP BY person_id`).all(...params);

    const selected = rows.filter(r => {
      if (region && upTo(r.store_id, '大区') !== region) return false;
      if (area && upTo(r.store_id, '小区') !== area) return false;
      return true;
    });

    const scores = itemScoresOf(String(date), post, null);
    const nameStmt = db.prepare('SELECT name, emp_no FROM org_nodes WHERE id = ?');
    const persons = selected.map(r => {
      const s = scores.get(r.person_id) || { point: 0, capCover: 0, rate: 0, items: [] };
      const node = nameStmt.get(r.person_id) || {};
      return {
        personId: r.person_id,
        empNo: r.emp_no || node.emp_no || '',
        name: r.person_name || node.name || '',
        postKey: r.post_key,
        storeId: r.store_id,
        storeName: r.store_name,
        region: upTo(r.store_id, '大区'),
        area: upTo(r.store_id, '小区'),
        point: s.point, capCover: s.capCover, rate: s.rate,
        items: s.items,
        deductRows: r.deduct_rows
      };
    }).sort((a, b) => b.point - a.point || a.deductRows - b.deductRows);

    const total = persons.length;
    persons.forEach((p, i) => { p.rank = i + 1; });
    const capTotal = post && post !== 'all'
      ? (db.prepare('SELECT COALESCE(SUM(cap_normal), 0) c FROM action_rules WHERE post_key = ? AND enabled = 1').get(String(post)).c || 0)
      : 0;
    res.json({
      ok: true, date, post: post || 'all', total, capTotal,
      avgPoint: total ? Number((persons.reduce((s, p) => s + p.point, 0) / total).toFixed(4)) : 0,
      zeroDeduct: persons.filter(p => p.deductRows === 0).length,
      persons
    });
  });

  // ---------- 动作明细（证据链） ----------
  router.get('/scoring/details', (req, res) => {
    const { date, personId, post, item, limit } = req.query;
    const where = [];
    const params = [];
    if (date) { where.push('date = ?'); params.push(String(date)); }
    if (personId) { where.push('person_id = ?'); params.push(Number(personId)); }
    if (post && post !== 'all') { where.push('post_key = ?'); params.push(String(post)); }
    if (item) { where.push('item = ?'); params.push(String(item)); }
    const lim = Math.max(1, Math.min(Number(limit) || 500, 2000));
    const sql = 'SELECT * FROM action_scores'
      + (where.length ? ' WHERE ' + where.join(' AND ') : '')
      + ' ORDER BY date DESC, item, id LIMIT ?';
    const rows = db.prepare(sql).all(...params, lim);
    res.json({
      ok: true, count: rows.length,
      details: rows.map(r => ({
        id: r.id, personId: r.person_id, empNo: r.emp_no, name: r.person_name,
        postKey: r.post_key, storeId: r.store_id, storeCode: r.store_code, storeName: r.store_name,
        date: r.date, item: r.item, action: r.action, score: r.score,
        ok: !!r.ok, evidence: r.evidence, orderNo: r.order_no
      }))
    });
  });

  return router;
};
