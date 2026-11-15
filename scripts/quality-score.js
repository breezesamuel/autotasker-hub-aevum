/**
 * quality-score.js — 数据质量评分引擎
 *
 * 为每个数据源 (source) 计算 quality_score ∈ [0, 100]，基于三个维度：
 *   1. Freshness (新鲜度)：最近 N 条数据中出现的新条目比例
 *   2. Consistency (一致性)：同一 topic 在不同 source 间的出现频率
 *   3. Completeness (完整性)：每条 item 关键字段的填充率
 *
 * 分数低于 threshold (默认 40) 的数据源自动降级（不进 hotlist）
 *
 * 用法：
 *   node scripts/quality-score.js              # 对当前 pack 打分并写盘
 *   node scripts/quality-score.js --threshold 60
 *   node scripts/quality-score.js --json       # JSON 输出
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha1(v) {
  return crypto.createHash('sha1').update(String(v)).digest('hex').slice(0, 8);
}

const ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'data', 'packs');
const SCORES_FILE = path.join(PACKS_DIR, 'quality-scores.json');
const DEFAULT_THRESHOLD = 40;

function loadItems() {
  try {
    const raw = fs.readFileSync(path.join(PACKS_DIR, 'live.json'), 'utf8');
    return JSON.parse(raw).items || [];
  } catch (e) {
    try {
      const raw = fs.readFileSync(path.join(PACKS_DIR, 'xuanpin_v2.json'), 'utf8');
      return JSON.parse(raw).items || [];
    } catch (e2) { return []; }
  }
}

function loadScores() {
  try { return JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); }
  catch (e) { return { version: 1, scores: {}, updatedAt: null }; }
}

function saveScores(scores) {
  try {
    fs.mkdirSync(PACKS_DIR, { recursive: true });
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));
  } catch (e) { console.error('[quality] save failed:', e.message.slice(0, 80)); }
}

function computeFreshness(items, source) {
  const recent = items.filter(it => (it.sourceLabel || it.source) === source).slice(0, 50);
  if (!recent.length) return 0;
  const unique = new Set(recent.map(it => it.title)).size;
  return Math.round((unique / recent.length) * 100);
}

function computeConsistency(items, source) {
  const srcItems = items.filter(it => (it.sourceLabel || it.source) === source);
  if (!srcItems.length) return 50;
  let overlapScore = 0;
  for (const it of srcItems) {
    const similar = items.filter(other =>
      other.source !== source && (other.title === it.title || Math.abs(Number(other.engagement) - Number(it.engagement)) < 10000)
    );
    if (similar.length > 0) overlapScore += 1;
  }
  return Math.round((overlapScore / srcItems.length) * 100);
}

function computeCompleteness(items, source) {
  const srcItems = items.filter(it => (it.sourceLabel || it.source) === source);
  if (!srcItems.length) return 50;
  let filled = 0, total = 0;
  for (const it of srcItems) {
    total += 4;
    if (it.title) filled++;
    if (it.url) filled++;
    if (it.engagement != null) filled++;
    if (it.sourceLabel || it.source) filled++;
  }
  return Math.round((filled / total) * 100);
}

function scoreSource(source, items) {
  const freshness = computeFreshness(items, source);
  const consistency = computeConsistency(items, source);
  const completeness = computeCompleteness(items, source);
  const weighted = Math.round(freshness * 0.4 + consistency * 0.3 + completeness * 0.3);
  return { source, freshness, consistency, completeness, total: weighted, qualified: weighted >= DEFAULT_THRESHOLD };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const thresholdIdx = argv.indexOf('--threshold');
  const threshold = thresholdIdx >= 0 ? parseInt(argv[thresholdIdx + 1]) : DEFAULT_THRESHOLD;

  const items = loadItems();
  if (!items.length) { console.log('[quality] no items found'); return; }

  const sourceSet = new Set();
  for (const it of items) {
    const src = it.sourceLabel || it.source;
    if (src) sourceSet.add(src);
  }

  const scores = loadScores();
  const results = {};
  for (const src of sourceSet) results[src] = scoreSource(src, items);
  scores.scores = results;
  scores.threshold = threshold;
  scores.updatedAt = new Date().toISOString();

  const unqualified = Object.entries(results).filter(([_, s]) => !s.qualified);
  console.log(`[quality] scored ${Object.keys(results).length} sources (threshold=${threshold})`);
  if (unqualified.length) {
    console.log(`  WARN ${unqualified.length} sources below threshold:`);
    for (const [src, s] of unqualified) {
      console.log(`    ${src}: ${s.total} (fresh=${s.freshness} con=${s.consistency} comp=${s.completeness})`);
    }
  } else {
    console.log('  OK All sources qualified');
  }

  if (!asJson) {
    console.log('\nTop 5 sources by score:');
    Object.entries(results).sort((a, b) => b[1].total - a[1].total).slice(0, 5).forEach(([src, s], i) => console.log(`  ${i + 1}. ${src}: ${s.total}`));
  } else {
    console.log(JSON.stringify({ scores: results, threshold, updatedAt: scores.updatedAt }, null, 2));
  }

  saveScores(scores);
}

if (require.main === module) main();
else module.exports = { scoreSource, loadScores, DEFAULT_THRESHOLD };
