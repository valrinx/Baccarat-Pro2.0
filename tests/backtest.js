import { createStateEncoder } from '../frontend/core/stateEncoder.js';
import { createRoadmapEngine } from '../frontend/core/roadmapEngine.js';
import { createAiEngine } from '../frontend/ai/aiEngine.js';
import { ACTIONS } from '../frontend/core/state.js';

function parseArgs(argv) {
  const args = { rounds: 500, seed: 42, trainWindow: 80, testWindow: 120, split: 0.7 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--rounds' && next) args.rounds = Number(next);
    if (key === '--seed' && next) args.seed = Number(next);
    if (key === '--train-window' && next) args.trainWindow = Number(next);
    if (key === '--test-window' && next) args.testWindow = Number(next);
    if (key === '--split' && next) args.split = Number(next);
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
    const nextPeak = Math.max(acc.peak, acc.equity + r.pnl);
    const nextEquity = acc.equity + r.pnl;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const history = generateSequence(args.rounds, args.seed);
  const roadmapEngine = createRoadmapEngine();
  const stateEncoder = createStateEncoder();
  const aiEngine = createAiEngine();

  const results = [];
  let memoryFilled = 0;
  let trainingBudget = 0;

  for (let i = 1; i < history.length; i += 1) {
    const actual = history[i];
    const currentHistory = history.slice(0, i);
    const roadmap = roadmapEngine.summarizeRoadmap(currentHistory);
    const encoded = stateEncoder.encode(currentHistory, roadmap);
    const prediction = aiEngine.predict(encoded.vector, encoded.metrics, currentHistory);

    const fallbackBet = prediction.action === ACTIONS.SKIP
      ? (prediction.transition?.P >= prediction.transition?.B ? ACTIONS.PLAYER : ACTIONS.BANKER)
      : prediction.action;
    const bet = fallbackBet;
    const stake = Math.max(1, Math.round(10 + prediction.confidence / 10));
    const pnl = payoutFor(bet, actual, stake);

    results.push({
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

    if (currentHistory.length >= args.trainWindow) {
      const prevHistory = currentHistory.slice(0, -1);
      const prevRoadmap = roadmapEngine.summarizeRoadmap(prevHistory);
      const prevEncoded = stateEncoder.encode(prevHistory, prevRoadmap);
      await aiEngine.learn({
        state: prevEncoded.vector,
        nextState: encoded.vector,
        action: bet,
        reward: pnl > 0 ? 1 : pnl < 0 ? -1 : 0,
        done: i === history.length - 1
      });
      memoryFilled += 1;
      trainingBudget += 1;
      if (trainingBudget % 40 === 0) {
        // let the replay buffer settle periodically
        // eslint-disable-next-line no-await-in-loop
        await aiEngine.learn({
          state: encoded.vector,
          nextState: encoded.vector,
          action: bet,
          reward: 0,
          done: false
        });
      }
    }
  }

  const splitIndex = Math.max(1, Math.floor(results.length * args.split));
  const trainResults = results.slice(0, splitIndex);
  const testResults = results.slice(splitIndex);
  const overall = summarizeStats(results);
  const train = summarizeStats(trainResults);
  const test = summarizeStats(testResults);
  const topConf = [...results].sort((a, b) => b.confidence - a.confidence).slice(0, 10);

  console.log('BACKTEST REPORT');
  console.log(`Rounds: ${overall.total}`);
  console.log(`Train/Test Split: ${splitIndex}/${results.length - splitIndex}`);
  console.log(`Net P&L: ${overall.net.toFixed(2)}`);
  console.log(`Win Rate: ${(overall.winRate * 100).toFixed(2)}%`);
  console.log(`ROI per round: ${(overall.roi * 100).toFixed(2)}%`);
  console.log(`Max Drawdown: ${overall.maxDrawdown.toFixed(2)}`);
  console.log(`Skips: ${overall.skips}`);
  console.log('');
  console.log('TRAIN SEGMENT');
  console.log(`  Net: ${train.net.toFixed(2)} | Win Rate: ${(train.winRate * 100).toFixed(2)}% | ROI: ${(train.roi * 100).toFixed(2)}%`);
  console.log('TEST SEGMENT');
  console.log(`  Net: ${test.net.toFixed(2)} | Win Rate: ${(test.winRate * 100).toFixed(2)}% | ROI: ${(test.roi * 100).toFixed(2)}%`);
  console.log('');
  console.log('TOP SIGNALS');
  topConf.forEach((r) => {
    console.log(`  #${r.round} act=${r.actual} bet=${r.bet} conf=${r.confidence}% chaos=${r.chaos}% pnl=${r.pnl}`);
  });
  console.log('');
  console.log(`Training samples seen: ${memoryFilled}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
