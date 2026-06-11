import { createEntropyEngine } from './entropyEngine.js';
import { createTransitionMatrix } from './transitionMatrix.js';

export function createPredictionEngine() {
  const entropyEngine = createEntropyEngine();
  const transitionMatrix = createTransitionMatrix();

  function predict(history = [], aiResult = null) {
    transitionMatrix.update(history);
    const entropyResult = entropyEngine.calculate(history);
    const clean = history.filter((x) => x === 'BANKER' || x === 'PLAYER');
    const last = clean.at(-1) || 'BANKER';
    const stateKey = `${last[0]}${last[0]}`;
    const transition = transitionMatrix.probabilities(stateKey);

    const transitionBias = transition.P >= transition.B ? 'PLAYER' : 'BANKER';
    const confidenceBase = aiResult?.confidence ?? 0;
    const regime = aiResult?.regime ?? entropyResult.regime ?? 'MIXED';
    const regimeConfidence = aiResult?.regimeConfidence ?? entropyResult.regimeConfidence ?? 50;
    const regimeScore = aiResult?.regimeScore ?? entropyResult.regimeScore ?? 0.5;

    let action = aiResult?.action || transitionBias;
    let recommendation = action;
    const bankrollHealth = aiResult?.bankrollHealth ?? { level: 'ok', confMultiplier: 1, skipBoost: 0 };
    const chaosGate = entropyResult.chaos > 0.68 || entropyResult.volatility > 0.72;
    const weakSignal = regime === 'WEAK_SIGNAL' || regimeConfidence < 40;

    if (chaosGate || weakSignal || confidenceBase < 35) {
      action = 'SKIP';
      recommendation = 'SKIP';
    }

    const regimeSafety = regime === 'VOLATILE' ? 0.72 : regime === 'CHOP' ? 0.88 : regime === 'TREND' ? 1.05 : 0.95;
    const confidence = Math.max(0, Math.min(100, Math.round(confidenceBase * (1 - entropyResult.chaos * 0.28) * regimeSafety * bankrollHealth.confMultiplier)));

    const risk = entropyResult.chaos > 0.7 || bankrollHealth.level === 'danger'
      ? 'HIGH'
      : entropyResult.chaos > 0.42 || bankrollHealth.level === 'low'
        ? 'MEDIUM'
        : 'LOW';

    if (risk === 'HIGH' && recommendation !== 'SKIP') {
      recommendation = 'SKIP';
      action = 'SKIP';
    }

    return {
      action,
      confidence,
      chaos: Math.round(entropyResult.chaos * 100),
      entropy: Math.round(entropyResult.normalizedEntropy * 100),
      volatility: Math.round(entropyResult.volatility * 100),
      risk,
      recommendation,
      transition,
      stateKey,
      regime,
      regimeConfidence,
      regimeScore,
      bankrollHealth
    };
  }

  return {
    predict,
    entropyEngine,
    transitionMatrix
  };
}
