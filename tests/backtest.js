import fs from 'node:fs';
import path from 'node:path';
import { createStateEncoder } from '../frontend/core/stateEncoder.js';
import { createRoadmapEngine } from '../frontend/core/roadmapEngine.js';
import { createAiEngine } from '../frontend/ai/aiEngine.js';
import { ACTIONS } from '../frontend/core/state.js';

function parseArgs(argv) {
  const args = {
    rounds: 500,
    seed: 42,
    trainWindow: 80,
    split: 0.7,
    output: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--rounds' && next) args.rounds = Number(next);
    if (key === '--seed' && next) args.seed = Number(next);
    if (key === '--train-window' && next) args.trainWindow = Number(next);
    if (key === '--split' && next) args.split = Number(next);
    if (key === '--output' && next) args.output = next;
  }
  return args;
}

function createRng(seed = 42) {
  let state = seed >>> 0;
  return function rng() {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sampleWeighted(rng, weights) {
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = rng() * total;
  for (const item of weights) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return weights.at(-1).value;
}

function generateSequence(rounds, seed) {
  const rng = createRng(seed);
  let last = rng() < 0.5 ? ACTIONS.BANKER : ACTIONS.PLAYER;
  let streak = 1;
  const history = [];

  for (let i = 0; i < rounds; i += 1) {
    const modeRoll = rng();
    let next;

    if (streak >= 4 && modeRoll < 0.32) {
      next = last === ACTIONS.BANKER ? ACTIONS.PLAYER : ACTIONS.BANKER;
    } else if (modeRoll < 0.56) {
      next = last;
    } else if (modeRoll < 0.83) {
      next = last === ACTIONS.BANKER ? ACTIONS.PLAYER : ACTIONS.BANKER;
    } else {
      next = sampleWeighted(rng, [
        { value: ACTIONS.BANKER, weight: 0.48 },
        { value: ACTIONS.PLAYER, weight: 0.48 },
        { value: ACTIONS.SKIP, weight: 0.04 }
      ]);
    }

    if (next === last) streak += 1;
    else streak = 1;
    if (next !== ACTIONS.SKIP) last = next;
    history.push(next);
  }

  return history;
}

function payoutFor(side, actual, stake) {
  if (side === ACTIONS.SKIP) return 0;
  if (actual === ACTIONS.SKIP) return 0;
  if (side === actual) {
    if (side === ACTIONS.BANKER) return Math.floor(stake * 0.95);
    return stake;
  }
  return -stake;
}

function summarizeStats(results) {
  const total = results.length;
  const wins = results.filter((r) => r.pnl > 0).length;
  const losses = results.filter((r) => r.pnl < 0).length;
  const skips = results.filter((r) => r.bet === ACTIONS.SKIP).length;
  const net = results.reduce((sum, r) => sum + r.pnl, 0);
  const maxDrawdown = results.reduce((acc, r) => {
    const nextEquity = acc.equity + r.pnl;
    const nextPeak = Math.max(acc.peak, nextEquity);
    const nextDrawdown = Math.min(acc.drawdown, nextEquity - nextPeak);
    return { peak: nextPeak, equity: nextEquity, drawdown: nextDrawdown };
  }, { peak: 0, equity: 0, drawdown: 0 }).drawdown;

  return {
    total,
    wins,
    losses,
    skips,
    net,
    roi: total ? (net / total) : 0,
    winRate: total ? wins / total : 0,
    maxDrawdown
  };
}

function writeCsv(filePath, rows) {
  const headers = ['round', 'actual', 'bet', 'confidence', 'chaos', 'risk', 'stake', 'pnl', 'recommendation'];
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))
  ].join('\n');
  fs.writeFileSync(filePath, `${csv}\n`, 'utf8');
}

async function runBacktestSegment(history, start, end, options, trainingMode = true) {
  const roadmapEngine = createRoadmapEngine();
  const stateEncoder = createStateEncoder();
  const aiEngine = createAiEngine();
  const rows = [];
  let memoryFilled = 0;

  for (let i = Math.max(1, start); i <= end; i += 1) {
    const actual = history[i];
    const currentHistory = history.slice(0, i);
    const roadmap = roadmapEngine.summarizeRoadmap(currentHistory);
    const encoded = stateEncoder.encode(currentHistory, roadmap);
    const prediction = aiEngine.predict(encoded.vector, encoded.metrics, currentHistory);

    const bet = prediction.action === ACTIONS.SKIP
      ? (prediction.transition?.P >= prediction.transition?.B ? ACTIONS.PLAYER : ACTIONS.BANKER)
      : prediction.action;
    const stake = Math.max(1, Math.round(10 + prediction.confidence / 10));
    const pnl = payoutFor(bet, actual, stake);

    rows.push({
      round: i + 1,
      actual,
      bet,
      confidence: prediction.confidence,
      chaos: prediction.chaos,
      risk: prediction.risk,
      stake,
      pnl,
      recommendation: prediction.recommendation
    });

    if (trainingMode && currentHistory.length >= options.trainWindow) {
      const prevHistory = currentHistory.slice(0, -1);
      const prevRoadmap = roadmapEngine.summarizeRoadmap(prevHistory);
      const prevEncoded = stateEncoder.encode(prevHistory, prevRoadmap);
      // eslint-disable-next-line no-await-in-loop
      await aiEngine.learn({
        state: prevEncoded.vector,
        nextState: encoded.vector,
        action: bet,
        reward: pnl > 0 ? 1 : pnl < 0 ? -1 : 0,
        done: i === end
      });
      memoryFilled += 1;
    }
  }

  return { rows, memoryFilled };
}

function buildWalkForwardWindows(length, splitRatio, numSlices = 10) {
  const anchor = Math.max(1, Math.floor(length * splitRatio));
  const step = Math.max(1, Math.floor((length - anchor) / numSlices));
  const windows = [];
  let trainEnd = anchor;

  for (let i = 0; i < numSlices; i += 1) {
    const testStart = trainEnd;
    const testEnd = Math.min(length - 1, testStart + step - 1);
    if (testStart >= length - 1) break;
    windows.push({ trainEnd, testStart, testEnd });
    trainEnd = testEnd + 1;
    if (trainEnd >= length - 1) break;
  }

  return windows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const history = generateSequence(args.rounds, args.seed);
  const windows = buildWalkForwardWindows(history.length, args.split);

  if (!windows.length) {
    console.log('Not enough rounds for walk-forward backtest.');
    return;
  }

  const baselineRows = [];
  for (let i = 1; i < history.length; i += 1) {
    const actual = history[i];
    const bet = i % 2 === 0 ? ACTIONS.BANKER : ACTIONS.PLAYER;
    const stake = 10;
    baselineRows.push({
      round: i + 1,
      actual,
      bet,
      confidence: 50,
      chaos: 0,
      risk: 'LOW',
      stake,
      pnl: payoutFor(bet, actual, stake),
      recommendation: 'BASELINE'
    });
  }

  const sliceReports = [];
  let aggregateRows = [];
  let totalMemoryFilled = 0;

  for (const window of windows) {
    // train from fixed window before trainEnd, test on unseen window
    const report = await runBacktestSegment(history, window.trainEnd - args.trainWindow + 1, window.testEnd, args, true);
    const stats = summarizeStats(report.rows);
    sliceReports.push({ window, stats });
    aggregateRows = aggregateRows.concat(report.rows);
    totalMemoryFilled += report.memoryFilled;
  }

  const overall = summarizeStats(aggregateRows);
  const baseline = summarizeStats(baselineRows);
  const topConf = [...aggregateRows].sort((a, b) => b.confidence - a.confidence).slice(0, 10);

  console.log('WALK-FORWARD BACKTEST REPORT');
  console.log(`Rounds: ${aggregateRows.length}`);
  console.log(`Slices: ${sliceReports.length}`);
  console.log(`Net P&L: ${overall.net.toFixed(2)}`);
  console.log(`Win Rate: ${(overall.winRate * 100).toFixed(2)}%`);
  console.log(`ROI per round: ${(overall.roi * 100).toFixed(2)}%`);
  console.log(`Max Drawdown: ${overall.maxDrawdown.toFixed(2)}`);
  console.log(`Skips: ${overall.skips}`);
  console.log('');
  console.log('BASELINE');
  console.log(`  Net: ${baseline.net.toFixed(2)} | Win Rate: ${(baseline.winRate * 100).toFixed(2)}% | ROI: ${(baseline.roi * 100).toFixed(2)}% | DD: ${baseline.maxDrawdown.toFixed(2)}`);
  console.log('');

  sliceReports.forEach((entry, index) => {
    const { stats, window } = entry;
    console.log(`SLICE ${index + 1} [train 1-${window.trainEnd + 1} | test ${window.testStart + 1}-${window.testEnd + 1}]`);
    console.log(`  Net: ${stats.net.toFixed(2)} | Win Rate: ${(stats.winRate * 100).toFixed(2)}% | ROI: ${(stats.roi * 100).toFixed(2)}% | DD: ${stats.maxDrawdown.toFixed(2)}`);
  });

  console.log('');
  console.log('TOP SIGNALS');
  topConf.forEach((r) => {
    console.log(`  #${r.round} act=${r.actual} bet=${r.bet} conf=${r.confidence}% chaos=${r.chaos}% pnl=${r.pnl}`);
  });
  console.log('');
  console.log(`Training samples seen: ${totalMemoryFilled}`);

  if (args.output) {
    const outPath = path.resolve(args.output);
    writeCsv(outPath, aggregateRows);
    console.log(`CSV written: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
