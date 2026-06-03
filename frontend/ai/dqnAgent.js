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
      targetRow[actionIndex] = sample.reward + (sample.done ? 0 : gamma * bestNext);
      return targetRow;
    });

    const targetTensor = tf.tensor2d(targets);
    await model.fit(states, targetTensor, { epochs: 1, verbose: 0 });

    tf.dispose([states, nextStates, qPred, qNext, targetTensor]);
    return batch.length;
  }

  function act(stateVector, explore = true) {
    const qValues = model.predict(tf.tensor2d([stateVector])).arraySync()[0];
    if (explore && Math.random() < epsilon) {
      const randomIndex = Math.floor(Math.random() * actionSize);
      return { action: actions[randomIndex], qValues, explored: true };
    }
    const index = argMax(qValues);
    return { action: actions[index], qValues, explored: false };
  }

  function remember(experience) {
    memory.push(experience);
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
