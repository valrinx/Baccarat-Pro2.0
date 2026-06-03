import { createEntropyEngine } from './entropyEngine.js';
import { createTransitionMatrix } from './transitionMatrix.js';

export function createPredictionEngine() {
  const entropyEngine = createEntropyEngine();
  const transitionMatrix = createTransitionMatrix();

  function predict(history = [], aiResult = null) {
    transitionMatrix.update(history);
    const entropyResult = entropyEngine.calculate(history);
    const last = history.filter((x) => x === 'BANKER' || x === 'PLAYER').at(-1) || 'BANKER';
    const stateKey = `${last[0]}${last[0]}`;
    const transition = transitionMatrix.probabilities(stateKey);

    const transitionBias = transition.P >= transition.B ? 'PLAYER' : 'BANKER';
    const confidenceBase = aiResult?.confidence ?? 0;
    const confidence = Math.max(0, Math.min(100, Math.round(confidenceBase * (1 - entropyResult.chaos * 0.35))));

    const recommendation = entropyResult.chaos > 0.65 || confidence < 40 ? 'SKIP' : aiResult?.action || transitionBias;
    const action = recommendation === 'SKIP' ? 'SKIP' : recommendation;
    const risk = entropyResult.chaos > 0.7 ? 'HIGH' : entropyResult.chaos > 0.4 ? 'MEDIUM' : 'LOW';

    return {
      action,
      confidence,
      chaos: Math.round(entropyResult.chaos * 100),
      entropy: Math.round(entropyResult.normalizedEntropy * 100),
      volatility: Math.round(entropyResult.volatility * 100),
      risk,
      recommendation,
      transition,
      stateKey
    };
  }

  return {
    predict,
    entropyEngine,
    transitionMatrix
  };
}
