import { createAiEngine } from '../../frontend/ai/aiEngine.js';
import { createStateEncoder } from '../../frontend/core/stateEncoder.js';
import { recordRegimeOutcome } from '../ai/regimeAnalytics.js';

export function registerPredictRoute(app) {
  const aiEngine = createAiEngine();
  const stateEncoder = createStateEncoder();

  app.post('/api/predict', async (req, res) => {
    const payload = req.body ?? {};
    const history = Array.isArray(payload.history) ? payload.history : [];
    const roadmap = payload.roadmap ?? null;

    const encoded = stateEncoder.encode(history, roadmap);
    const result = aiEngine.predict(encoded.vector, encoded.metrics, history);

    if (payload.outcome) {
      const actual = payload.outcome;
      const predicted = result.action;
      const wasCorrect = actual === predicted && actual !== 'SKIP';
      const skipped = actual !== 'SKIP' && predicted === 'SKIP';
      const expertNames = Array.isArray(result.vote?.votes)
        ? result.vote.votes.map((v) => ({ name: v.label ?? 'EXPERT' }))
        : [];
      await recordRegimeOutcome({
        regime: result.regime ?? encoded.metrics.regime,
        confidence: result.confidence,
        wasCorrect,
        skipped,
        experts: expertNames
      });
    }

    res.json({
      ok: true,
      prediction: {
        action: result.action,
        confidence: result.confidence,
        chaos: result.chaos,
        risk: result.risk,
        recommendation: result.recommendation,
        entropy: result.entropy,
        volatility: result.volatility,
        transition: result.transition,
        vote: result.vote,
        qValues: result.qValues,
        explored: result.explored,
        regime: result.regime,
        regimeConfidence: result.regimeConfidence,
        regimeScore: result.regimeScore,
        bankrollHealth: result.bankrollHealth
      },
      metrics: encoded.metrics
    });
  });
}
