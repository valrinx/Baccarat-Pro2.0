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

    // ── AI Voting ────────────────────────────────────────────────────────────
    const voteResult = voteEngine.vote({
      qValues: actionResult.qValues,
      transition: aiGate.transition ?? {},
      entropy: metrics?.entropyScore ?? 0,
      volatility: metrics?.volatilityScore ?? 0,
      chaos: (aiGate.chaos ?? 0) / 100,
      bankerRatio: metrics?.bankerRatio ?? 0.5,
      playerRatio: metrics?.playerRatio ?? (1 - (metrics?.bankerRatio ?? 0.5)),
      historyLength: history.length
    });

    // ── Merge: ถ้า chaos สูงมาก ให้ SKIP เสมอ ───────────────────────────────
    const rawAction = aiGate.recommendation === 'SKIP' ? 'SKIP' : voteResult.winner;
    const action = (confidenceResult.chaos > 70 || aiGate.chaos > 65) ? 'SKIP' : rawAction;

    return {
      action,
      confidence: Math.min(confidenceResult.confidence, voteResult.confidence),
      chaos: Math.max(confidenceResult.chaos, aiGate.chaos),
      risk: aiGate.risk,
      recommendation: aiGate.recommendation,
      entropy: aiGate.entropy,
      volatility: aiGate.volatility,
      transition: aiGate.transition,
      qValues: actionResult.qValues,
      explored: actionResult.explored,
      // ── vote data ──────────────────────────────────────────────────────────
      vote: {
        winner: voteResult.winner,
        confidence: voteResult.confidence,
        tally: voteResult.tally,
        votes: voteResult.votes,
        isTie: voteResult.isTie
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
