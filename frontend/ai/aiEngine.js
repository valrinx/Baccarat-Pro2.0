import { createDqnAgent } from './dqnAgent.js';
import { createConfidenceEngine } from './confidenceEngine.js';
import { createPredictionEngine } from './predictionEngine.js';
import { createVoteEngine } from './voteEngine.js';

export function createAiEngine() {
  const agent = createDqnAgent({ stateSize: 10, actionSize: 3 });
  const confidenceEngine = createConfidenceEngine();
  const predictionEngine = createPredictionEngine();
  const voteEngine = createVoteEngine();

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

    const bankrollHealth = aiGate.bankrollHealth ?? {
      level: 'ok',
      confMultiplier: 1,
      skipBoost: 0
    };

    const voteResult = voteEngine.vote({
      qValues: actionResult.qValues,
      transition: aiGate.transition ?? {},
      entropy: metrics?.entropyScore ?? 0,
      volatility: metrics?.volatilityScore ?? 0,
      chaos: (aiGate.chaos ?? 0) / 100,
      bankerRatio: metrics?.bankerRatio ?? 0.5,
      playerRatio: metrics?.playerRatio ?? (1 - (metrics?.bankerRatio ?? 0.5)),
      historyLength: history.length,
      regime: aiGate.regime,
      regimeConfidence: aiGate.regimeConfidence,
      regimeScore: aiGate.regimeScore,
      bankrollHealth
    });

    const localConfidence = Math.min(confidenceResult.confidence, voteResult.confidence);
    const calibratedConfidence = Math.max(0, Math.min(100, Math.round(localConfidence * (bankrollHealth.confMultiplier ?? 1) * (aiGate.regime === 'VOLATILE' ? 0.9 : aiGate.regime === 'TREND' ? 1.03 : 1))));

    const rawAction = aiGate.recommendation === 'SKIP' ? 'SKIP' : voteResult.winner;
    const action = (confidenceResult.chaos > 70 || aiGate.chaos > 65 || bankrollHealth.level === 'danger') ? 'SKIP' : rawAction;

    return {
      action,
      confidence: calibratedConfidence,
      chaos: Math.max(confidenceResult.chaos, aiGate.chaos),
      risk: aiGate.risk,
      recommendation: action === 'SKIP' ? 'SKIP' : aiGate.recommendation,
      entropy: aiGate.entropy,
      volatility: aiGate.volatility,
      transition: aiGate.transition,
      qValues: actionResult.qValues,
      explored: actionResult.explored,
      regime: aiGate.regime,
      regimeConfidence: aiGate.regimeConfidence,
      regimeScore: aiGate.regimeScore,
      bankrollHealth,
      // ── vote data ──────────────────────────────────────────────────────────
      vote: {
        winner: voteResult.winner,
        confidence: voteResult.confidence,
        tally: voteResult.tally,
        votes: voteResult.votes,
        isTie: voteResult.isTie,
        regime: voteResult.regime
      }
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
