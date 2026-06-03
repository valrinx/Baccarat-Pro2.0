import * as tf from '@tensorflow/tfjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

tf.setBackend('tensorflow').catch(() => {
  console.warn('tfjs-node backend unavailable, using default');
});

function parseArgs(argv) {
  const args = {
    rounds: 10000,
    seed: 42,
    batchSize: 64,
    epochsPerBatch: 4,
    convergenceRounds: 200,
    convergenceThreshold: 0.015,
    patience: 5,
    maxNoImprove: 3,
    output: path.join(ROOT, 'models', 'autotrain-report.json'),
    verbose: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const n = argv[i + 1];
    if (k === '--rounds' && n) args.rounds = Number(n);
    if (k === '--seed' && n) args.seed = Number(n);
    if (k === '--batch-size' && n) args.batchSize = Number(n);
    if (k === '--epochs' && n) args.epochsPerBatch = Number(n);
    if (k === '--convergence-rounds' && n) args.convergenceRounds = Number(n);
    if (k === '--output' && n) args.output = n;
    if (k === '--quiet') args.verbose = false;
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

function generateSequence(rounds, seed) {
  const rng = createRng(seed);
  const BANKER = 'BANKER', PLAYER = 'PLAYER', SKIP = 'SKIP';
  let last = rng() < 0.5 ? BANKER : PLAYER;
  let streak = 1;
  const history = [];

  for (let i = 0; i < rounds; i += 1) {
    const modeRoll = rng();
    let next;

    if (streak >= 4 && modeRoll < 0.32) {
      next = last === BANKER ? PLAYER : BANKER;
    } else if (modeRoll < 0.56) {
      next = last;
    } else if (modeRoll < 0.83) {
      next = last === BANKER ? PLAYER : BANKER;
    } else {
      const r = rng();
      if (r < 0.48) next = BANKER;
      else if (r < 0.96) next = PLAYER;
      else next = SKIP;
    }

    if (next === last) streak += 1;
    else streak = 1;
    if (next !== SKIP) last = next;
    history.push(next);
  }

  return history;
}

function encodeState(history) {
  const h = history.filter(Boolean);
  if (h.length < 2) return Array(10).fill(0);

  const bankerCount = h.filter((x) => x === 'BANKER').length;
  const playerCount = h.filter((x) => x === 'PLAYER').length;
  const total = h.length;

  const last = h[h.length - 1];
  let streakLen = 1;
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] === last) streakLen++;
    else break;
  }

  const chopCount = h.slice(-10).reduce((acc, item, idx, arr) => {
    if (idx === 0) return acc;
    if (item !== arr[idx - 1] && item !== 'SKIP' && arr[idx - 1] !== 'SKIP') return acc + 1;
    return acc;
  }, 0);
  const chopFreq = chopCount / Math.max(1, Math.min(10, h.length - 1));
  const bankerRatio = bankerCount / total;
  const momentumBias = Math.abs(bankerRatio - (playerCount / total));

  return [
    h[h.length - 1] === h[h.length - 2] ? 1 : 0,
    Math.min(1, streakLen / 10),
    Math.min(1, bankerRatio),
    Math.min(1, chopFreq),
    Math.min(1, chopFreq * 0.5 + momentumBias * 0.5),
    Math.min(1, chopFreq * 0.7 + momentumBias * 0.3),
    Math.min(1, 1 / Math.max(1, streakLen)),
    Math.min(1, h.length / 60),
    Math.min(1, Math.max(bankerRatio, playerCount / total) * (1 - chopFreq)),
    Math.min(1, momentumBias)
  ];
}

function createReplayMemory(capacity = 50000) {
  let buffer = [];
  return {
    push: (exp) => { buffer.push(exp); if (buffer.length > capacity) buffer.shift(); },
    sample: (n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(buffer[Math.floor(Math.random() * buffer.length)]);
      return out.slice();
    },
    size: () => buffer.length
  };
}

function createQNetwork(stateSize, actionSize) {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [stateSize] }));
  model.add(tf.layers.dropout({ rate: 0.15 }));
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  model.add(tf.layers.dense({ units: actionSize, activation: 'linear' }));
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return model;
}

function cloneModel(source) {
  const newModel = tf.sequential();
  const weights = source.getWeights();
  newModel.add(tf.layers.dense({
    units: 128, activation: 'relu',
    inputShape: [10],
    weights: weights.slice(0, 2)
  }));
  newModel.add(tf.layers.dropout({ rate: 0.15 }));
  newModel.add(tf.layers.dense({
    units: 128, activation: 'relu',
    weights: weights.slice(2, 4)
  }));
  newModel.add(tf.layers.dropout({ rate: 0.1 }));
  newModel.add(tf.layers.dense({
    units: 64, activation: 'relu',
    weights: weights.slice(4, 6)
  }));
  newModel.add(tf.layers.dense({
    units: 3, activation: 'linear',
    weights: weights.slice(6, 8)
  }));
  newModel.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  return newModel;
}

function payoutFor(bet, actual, stake) {
  if (bet === 'SKIP' || actual === 'SKIP') return 0;
  if (bet === actual) return bet === 'BANKER' ? Math.floor(stake * 0.95) : stake;
  return -stake;
}

function argMax(values) {
  let idx = 0, val = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] > val) { val = values[i]; idx = i; }
  return idx;
}

async function trainAgent(history, args) {
  const ACTIONS = ['BANKER', 'PLAYER', 'SKIP'];
  const memory = createReplayMemory(50000);
  const model = createQNetwork(10, 3);
  const targetModel = cloneModel(model);

  let epsilon = 1.0, epsilonMin = 0.05, epsilonDecay = 0.9995;
  const gamma = 0.95;
  const batchSize = args.batchSize;
  const trainStart = Math.min(20, Math.floor(history.length * 0.1));
  const trainEnd = Math.floor(history.length * 0.8);

  const rollingWindow = [];
  const winRateHistory = [];
  let bestWinRate = 0, noImproveCount = 0;
  let converged = false;
  let finalEpsilon = epsilon;

  const log = (msg) => { if (args.verbose) console.log(msg); };

  log(`Training on ${trainEnd - trainStart} rounds [${trainStart}..${trainEnd}]`);
  log(`Target: ${args.convergenceRounds} rounds of stable performance, threshold=${args.convergenceThreshold}`);

  const roundsReport = [];
  let cumulativePnl = 0;

  for (let i = trainStart; i <= trainEnd; i++) {
    const state = encodeState(history.slice(0, i));
    const qValues = model.predict(tf.tensor2d([state])).arraySync()[0];

    let action, bet, stake;
    if (Math.random() < epsilon) {
      action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    } else {
      action = ACTIONS[argMax(qValues)];
    }

    const actual = history[i];
    stake = 10;
    const pnl = payoutFor(action, actual, stake);
    cumulativePnl += pnl;

    const reward = pnl > 0 ? 1 : pnl < 0 ? -1 : 0;
    const nextState = encodeState(history.slice(0, i + 1));

    memory.push({ state, nextState, action, reward, done: i === trainEnd });

    // Train batch
    if (memory.size() >= batchSize) {
      const batch = memory.sample(batchSize);
      const states = tf.tensor2d(batch.map((x) => x.state));
      const nextStates = tf.tensor2d(batch.map((x) => x.nextState));

      const qPred = model.predict(states);
      const qNext = targetModel.predict(nextStates);

      const predVals = await qPred.array();
      const nextVals = await qNext.array();

      const targets = predVals.map((row, j) => {
        const s = batch[j];
        const targetRow = [...row];
        const bestNext = Math.max(...nextVals[j]);
        const aIdx = ACTIONS.indexOf(s.action);
        targetRow[aIdx] = s.reward + (s.done ? 0 : gamma * bestNext);
        return targetRow;
      });

      const targetTensor = tf.tensor2d(targets);
      await model.fit(states, targetTensor, { epochs: args.epochsPerBatch, verbose: 0 });
      tf.dispose([states, nextStates, qPred, qNext, targetTensor]);

      // Sync target network periodically
      if (i % 100 === 0) {
        targetModel.setWeights(model.getWeights().map((w) => w.clone()));
      }
    }

    epsilon = Math.max(epsilonMin, epsilon * epsilonDecay);

    // Track rolling win rate
    rollingWindow.push(pnl > 0 ? 1 : pnl < 0 ? 0 : 0.5);
    if (rollingWindow.length > 50) rollingWindow.shift();

    if (i % 50 === 0) {
      const wr = rollingWindow.reduce((a, b) => a + b, 0) / rollingWindow.length;
      winRateHistory.push({ round: i, winRate: wr, epsilon, pnl: cumulativePnl });
    }

    // Convergence check after minimum rounds
    if (i >= trainStart + args.convergenceRounds) {
      const recent = winRateHistory.slice(-Math.floor(args.convergenceRounds / 50));
      if (recent.length >= 3) {
        const wrs = recent.map((r) => r.winRate);
        const mean = wrs.reduce((a, b) => a + b, 0) / wrs.length;
        const variance = wrs.reduce((a, b) => a + (b - mean) ** 2, 0) / wrs.length;
        const std = Math.sqrt(variance);

        if (std < args.convergenceThreshold) {
          noImproveCount++;
        } else {
          noImproveCount = 0;
        }

        if (noImproveCount >= args.patience || wrs[wrs.length - 1] > bestWinRate) {
          if (wrs[wrs.length - 1] > bestWinRate) {
            bestWinRate = wrs[wrs.length - 1];
            noImproveCount = 0;
          }
        }

        if (noImproveCount >= args.maxNoImprove) {
          log(`\nConverged at round ${i} (std=${std.toFixed(4)} < ${args.convergenceThreshold})`);
          converged = true;
          finalEpsilon = epsilon;
          break;
        }
      }
    }
  }

  // Test on held-out data
  const testStart = trainEnd + 1;
  const testEnd = history.length - 1;
  let testPnl = 0, testWins = 0, testTotal = 0;

  log(`\nTesting on ${testEnd - testStart} held-out rounds [${testStart}..${testEnd}]`);

  for (let i = testStart; i <= testEnd; i++) {
    const state = encodeState(history.slice(0, i));
    const qValues = model.predict(tf.tensor2d([state])).arraySync()[0];
    const action = ACTIONS[argMax(qValues)];
    const actual = history[i];
    const pnl = payoutFor(action, actual, 10);
    testPnl += pnl;
    if (pnl > 0) testWins++;
    testTotal++;
  }

  const testWinRate = testWins / testTotal;

  // Baselines
  const baselines = {};
  for (const strat of ['always-bank', 'always-play', 'alternating']) {
    let bp = 0, bw = 0, bt = 0;
    for (let i = testStart; i <= testEnd; i++) {
      const actual = history[i];
      const bet = strat === 'always-bank' ? 'BANKER'
        : strat === 'always-play' ? 'PLAYER'
        : i % 2 === 0 ? 'BANKER' : 'PLAYER';
      bp += payoutFor(bet, actual, 10);
      if (payoutFor(bet, actual, 10) > 0) bw++;
      bt++;
    }
    baselines[strat] = { pnl: bp, winRate: bw / bt };
  }

  const report = {
    converged,
    finalEpsilon,
    bestWinRate,
    testWinRate,
    testPnl,
    trainingRounds: trainEnd - trainStart,
    testRounds: testEnd - testStart,
    totalRounds: history.length,
    winRateHistory,
    baselines,
    timestamp: new Date().toISOString()
  };

  log('\n========== AUTOTRAIN REPORT ==========');
  log(`Converged: ${converged}`);
  log(`Final Epsilon: ${finalEpsilon.toFixed(4)}`);
  log(`Training Win Rate: ${(bestWinRate * 100).toFixed(2)}%`);
  log(`Test Win Rate: ${(testWinRate * 100).toFixed(2)}%`);
  log(`Test P&L: ${testPnl}`);
  log('');
  log('BASELINES (test set):');
  for (const [k, v] of Object.entries(baselines)) {
    log(`  ${k}: P&L=${v.pnl}, WinRate=${(v.winRate * 100).toFixed(2)}%`);
  }
  log('');
  log('VS BASELINE:');
  log(`  vs always-bank:  ${testPnl > baselines['always-bank'].pnl ? 'WIN' : 'LOSE'} (${testPnl - baselines['always-bank'].pnl > 0 ? '+' : ''}${testPnl - baselines['always-bank'].pnl})`);
  log(`  vs always-play: ${testPnl > baselines['always-play'].pnl ? 'WIN' : 'LOSE'} (${testPnl - baselines['always-play'].pnl > 0 ? '+' : ''}${testPnl - baselines['always-play'].pnl})`);

  // Save report
  await fs.promises.mkdir(path.dirname(args.output), { recursive: true });
  await fs.promises.writeFile(args.output, JSON.stringify(report, null, 2), 'utf8');
  log(`\nReport saved: ${args.output}`);

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Starting autotrain...');
  console.log(`Rounds: ${args.rounds}, Seed: ${args.seed}`);
  console.log('');

  await tf.ready();

  const history = generateSequence(args.rounds, args.seed);
  const report = await trainAgent(history, args);

  console.log('\nDone.');
  return report;
}

main().catch((err) => {
  console.error('Autotrain failed:', err);
  process.exit(1);
});
