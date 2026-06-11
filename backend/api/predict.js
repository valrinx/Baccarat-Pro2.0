import { createAiEngine } from '../../frontend/ai/aiEngine.js';
import { createStateEncoder } from '../../frontend/core/stateEncoder.js';

export function registerPredictRoute(app) {
  const aiEngine = createAiEngine();
  const stateEncoder = createStateEncoder();

  app.post('/api/predict', (req, res) => {
    const payload = req.body ?? {};
    const history = Array.isArray(payload.history) ? payload.history : [];
    const roadmap = payload.roadmap ?? null;

    const encoded = stateEncoder.encode(history, roadmap);
    const result = aiEngine.predict(encoded.vector, encoded.metrics, history);

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
        explored: result.explored
      },
      metrics: encoded.metrics
    });
  });
}
