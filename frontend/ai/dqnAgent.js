import * as tf from '@tensorflow/tfjs';
import { createReplayMemory } from './replayMemory.js';
import { createQNetwork, cloneModel } from './modelFactory.js';

function argMax(values) {
  let bestIndex = 0;
  let bestValue = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > bestValue) {
      bestValue = values[i];
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function createDqnAgent({ stateSize = 10, actionSize = 3, epsilon = 1, epsilonMin = 0.05, epsilonDecay = 0.995 } = {}) {
  const memory = createReplayMemory(10000);
  const actions = ['BANKER', 'PLAYER', 'SKIP'];
  const model = createQNetwork(stateSize, actionSize);
  let targetModel = cloneModel(model);

  const regimeProfiles = {
    TREND: { epsilonMult: 0.72, skipBoost: -0.08, bankerBias: 0.02 },
    CHOP: { epsilonMult: 0.88, skipBoost: 0.08, bankerBias: 0 },
    VOLATILE: { epsilonMult: 1.18, skipBoost: 0.22, bankerBias: -0.02 },
    MIXED: { epsilonMult: 1.0, skipBoost: 0.02, bankerBias: 0 },
    WEAK_SIGNAL: { epsilonMult: 1.3, skipBoost: 0.28, bankerBias: 0 }
  };

  function getRegimeProfile(regime = 'MIXED') {
    return regimeProfiles[regime] || regimeProfiles.MIXED;
  }

  async function syncTarget() {
    targetModel.setWeights(model.getWeights().map((w) => w.clone()));
  }

  async function trainBatch(batch, gamma = 0.95) {
    if (!batch.length) return 0;

    const states = tf.tensor2d(batch.map((x) => x.state));
    const nextStates = tf.tensor2d(batch.map((x) => x.nextState));
    const qPred = model.predict(states);
    const qNext = targetModel.predict(nextStates);
    const predValues = await qPred.array();
    const nextValues = await qNext.array();

    const targets = predValues.map((row, i) => {
      const sample = batch[i];
      const targetRow = [...row];
      const bestNext = Math.max(...nextValues[i]);
      const actionIndex = actions.indexOf(sample.action);
      const regimeProfile = getRegimeProfile(sample.regime);
      const regimeReward = sample.reward * (sample.regime === 'VOLATILE' ? 0.9 : 1);
      const calibratedReward = regimeReward + regimeProfile.skipBoost * (sample.action === 'SKIP' ? 1 : 0);
      targetRow[actionIndex] = calibratedReward + (sample.done ? 0 : gamma * bestNext);
      return targetRow;
    });

    const targetTensor = tf.tensor2d(targets);
    await model.fit(states, targetTensor, { epochs: 1, verbose: 0 });

    tf.dispose([states, nextStates, qPred, qNext, targetTensor]);
    return batch.length;
  }

  function act(stateVector, explore = true, context = {}) {
    const qValues = model.predict(tf.tensor2d([stateVector])).arraySync()[0];
    const profile = getRegimeProfile(context.regime);
    const adjustedEpsilon = Math.max(epsilonMin, Math.min(0.95, epsilon * profile.epsilonMult));
    const skipAdjusted = qValues.map((v, i) => (i === 2 ? v + profile.skipBoost : v));

    if (explore && Math.random() < adjustedEpsilon) {
      const randomIndex = Math.floor(Math.random() * actionSize);
      return { action: actions[randomIndex], qValues, explored: true, regime: context.regime ?? 'MIXED' };
    }
    const index = argMax(skipAdjusted);
    return { action: actions[index], qValues, explored: false, regime: context.regime ?? 'MIXED' };
  }

  function remember(experience) {
    memory.push({
      ...experience,
      regime: experience?.regime ?? 'MIXED'
    });
  }

  async function replay(batchSize = 32) {
    const batch = memory.sample(batchSize);
    if (!batch.length) return { trained: 0, epsilon };
    await trainBatch(batch);
    epsilon = Math.max(epsilonMin, epsilon * epsilonDecay);
    await syncTarget();
    return { trained: batch.length, epsilon };
  }

  function stats() {
    return {
      memorySize: memory.size(),
      epsilon,
      stateSize,
      actionSize
    };
  }

  async function save() {
    return model.save('localstorage://baccarat-pro-dqn');
  }

  async function load() {
    const loaded = await tf.loadLayersModel('localstorage://baccarat-pro-dqn');
    model.setWeights(loaded.getWeights());
    await syncTarget();
  }

  return {
    act,
    remember,
    replay,
    stats,
    memory,
    model,
    targetModel,
    syncTarget,
    save,
    load
  };
}
