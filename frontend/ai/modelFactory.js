import * as tf from '@tensorflow/tfjs';

export function createQNetwork(stateSize = 10, actionSize = 3) {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [stateSize], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.1 }));
  model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
  model.add(tf.layers.dense({ units: actionSize, activation: 'linear' }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError'
  });

  return model;
}

export function cloneModel(model) {
  const clone = createQNetwork(model.inputs[0].shape[1], model.outputs[0].shape[1]);
  clone.setWeights(model.getWeights().map((w) => w.clone()));
  return clone;
}
