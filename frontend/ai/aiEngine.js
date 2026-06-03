import { createDqnAgent } from './dqnAgent.js';
import { createConfidenceEngine } from './confidenceEngine.js';
import { createPredictionEngine } from './predictionEngine.js';

export function createAiEngine() {
  const agent = createDqnAgent({ stateSize: 10, actionSize: 3 });
  const confidenceEngine = createConfidenceEngine();
  const predictionEngine = createPredictionEngine();

  function predict(stateVector, metrics, history = []) {
    const actionResult = agent.act(stateVector, true);
    const confidenceResult = confidenceEngine.calculate({
      qValues: actionResult.qValues,
      entropy: metrics?.entropyScore ?? 0,
      volatility: metrics?.volatilityScore ?? 0
    });

    const aiGate = predictionEngine.predict(history, {
      action: actionResult.action,
      confidence: confidenceResult.confidence
    });

    const action = aiGate.recommendation === 'SKIP' ? 'SKIP' : aiGate.action;
    return {
      action,
      confidence: Math.min(confidenceResult.confidence, aiGate.confidence),
      chaos: Math.max(confidenceResult.chaos, aiGate.chaos),
      risk: aiGate.risk,
      recommendation: aiGate.recommendation,
      entropy: aiGate.entropy,
      volatility: aiGate.volatility,
      transition: aiGate.transition,
      qValues: actionResult.qValues,
      explored: actionResult.explored
    };
  }

  function learn(experience) {
    agent.remember(experience);
    return agent.replay(32);
  }

  function stats() {
    return {
      ...agent.stats(),
      transitionMatrix: predictionEngine.transitionMatrix.snapshot()
    };
  }

  return {
    predict,
    learn,
    stats
  };
}
