/**
 * trend-predictor.js — 预测性趋势引擎
 *
 * 基于历史热点数据，识别上升中的主题，预测下一波流量机会：
 *   1. Momentum Score:  engagement增速（近2小时 vs 前2小时）
 *   2. Velocity Score:  话题出现频率的变化斜率
 *   3. Seasonality:     周期性规律（工作日vs周末，早vs晚）
 *
 * 端点：
 *   GET /api/trends/predict     — 未来2小时内最值得关注的10个趋势主题
 *   GET /api/trends/momentum    — 各板块的momentum排名
 *   POST /api/trends/train      — 手动训练（摄入最新榜单数据）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_FILE = path.join(ROOT, 'data', 'trend-history.json');
const PREDICTIONS_FILE = path.join(ROOT, 'data', 'trend-predictions.json');

const BOARDS = ['weiboHot', 'zhihu', 'douban', 'bilibili', 'tieba'];

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch (e) { return { version: 1, snapshots: [], trainedAt: null }; }
}
function saveHistory(h) {
  h.trainedAt = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2));
  } catch (e) {}
}
function loadPredictions() {
  try { return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8')); }
  catch (e) { return { version: 1, predictions: [], lastRun: null }; }
}
function savePredictions(p) {
  p.lastRun = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(PREDICTIONS_FILE), { recursive: true });
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(p, null, 2));
  } catch (e) {}
}

// Snapshot a board's current state into history
function snapshotBoard(board, items) {
  const h = loadHistory();
  h.snapshots.push({
    board: board,
    ts: new Date().toISOString(),
    itemCount: items.length,
    topEngagements: items.slice(0, 10).map(i => ({
      title: (i.title || '').slice(0, 50),
      engagement: i.engagement || i.hot || i.views || 0,
    })),
  });
  // Keep only last 200 snapshots to avoid bloat
  if (h.snapshots.length > 200) h.snapshots = h.snapshots.slice(-200);
  saveHistory(h);
}

// Calculate momentum for each topic (engagement change rate)
function calcMomentum(history, windowSize) {
  windowSize = windowSize || 4;
  const groupedByTitle = {};
  for (const snap of (history.snapshots || [])) {
    for (const item of snap.topEngagements || []) {
      const key = snap.board + '|' + item.title;
      if (!groupedByTitle[key]) groupedByTitle[key] = { title: item.title, board: snap.board, scores: [] };
      groupedByTitle[key].scores.push(item.engagement);
    }
  }

  const results = [];
  for (const [, data] of Object.entries(groupedByTitle)) {
    if (data.scores.length < windowSize) continue;
    const recent = data.scores.slice(-windowSize);
    const prior = data.scores.slice(-(windowSize * 2), -windowSize);
    if (prior.length === 0) continue;

    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
    const velocity = avgPrior > 0 ? (avgRecent - avgPrior) / avgPrior : 0;

    results.push({
      title: data.title,
      board: data.board,
      avgRecentEngagement: Math.round(avgRecent),
      velocity: velocity.toFixed(4),
      velocityPct: (velocity * 100).toFixed(1) + '%',
      dataPoints: recent.length + prior.length,
      score: avgRecent * Math.max(0, velocity + 0.5), // Combined momentum
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// Predict topics that will peak in next 2 hours
function predict(topMomentum, horizonHours) {
  horizonHours = horizonHours || 2;
  const predicted = [];
  for (const m of topMomentum.slice(0, 50)) {
    // Simple linear extrapolation: velocity predicts future growth
    const projectedEngagement = Math.round(m.avgRecentEngagement * (1 + m.velocity * horizonHours / 2));
    predicted.push({
      ...m,
      projectedEngagement,
      confidence: Math.min(0.95, 0.3 + Math.abs(m.velocity) * 0.3).toFixed(2),
      recommendation: m.velocity > 0.5 ? 'AGGRESSIVE_COVERAGE' : m.velocity > 0.1 ? 'WATCH_CLOSELY' : 'LOW_PRIORITY',
    });
  }
  predicted.sort((a, b) => b.projectedEngagement - a.projectedEngagement);
  return predicted.slice(0, 10);
}

function runPrediction() {
  const history = loadHistory();
  if ((history.snapshots || []).length < 8) {
    return { error: 'insufficient data — need at least 8 snapshots (train with /api/trends/train first)' };
  }

  const momentum = calcMomentum(history, 4);
  const predictions = predict(momentum, 2);

  const result = {
    generatedAt: new Date().toISOString(),
    snapshotCount: history.snapshots.length,
    topMomentum: momentum.slice(0, 10),
    predictions,
    insight: generateInsight(predictions, momentum),
  };

  savePredictions({ version: 1, predictions: result.predictions, momentumSample: momentum.slice(0, 20) });
  return result;
}

function generateInsight(predictions, momentum) {
  if (!predictions.length) return '暂无趋势数据';
  const boards = [...new Set(predictions.map(p => p.board))];
  const topVelocity = momentum[0];
  return (
    `【趋势预测】${new Date().toLocaleString('zh-CN')} · 未来2小时重点关注 ${boards.join(', ')} 板块。` +
    `最高动量主题「${topVelocity.title}」velocity=${topVelocity.velocityPct}，` +
    `预计峰值engagement≈${topVelocity.projectedEngagement.toLocaleString()}。` +
    `${predictions.filter(p => p.recommendation === 'AGGRESSIVE_COVERAGE').length > 0 ? '🔥 建议优先覆盖加速上升主题。' : '✅ 市场趋于平稳。'}`
  );
}

function trainFromData(board, items) {
  snapshotBoard(board, items);
  const h = loadHistory();
  return { ok: true, totalSnapshots: h.snapshots.length, board };
}

function getMomentumRanking(limit) {
  limit = limit || 20;
  const history = loadHistory();
  if ((history.snapshots || []).length < 4) return { error: 'insufficient data' };
  return { ranking: calcMomentum(history, 4).slice(0, limit), dataPoints: history.snapshots.length };
}

module.exports = {
  BOARDS, snapshotBoard, trainFromData, runPrediction, getMomentumRanking,
  calcMomentum, predict, generateInsight,
};
