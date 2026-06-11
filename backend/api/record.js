export function registerRecordRoute(app, services) {
  app.post('/api/record', async (req, res) => {
    const payload = req.body ?? {};
    const game = payload.game ?? {};
    const prediction = payload.prediction ?? {};

    const summary = {
      rounds: Array.isArray(game.history) ? game.history.length : 0,
      p: game.stats?.player ?? 0,
      b: game.stats?.banker ?? 0,
      t: game.stats?.tie ?? 0,
      pnl: Number(payload.pnl ?? 0),
      prediction: prediction.action ?? 'SKIP',
      confidence: prediction.confidence ?? 0,
      createdAt: new Date().toISOString()
    };

    try {
      if (services?.training?.run) {
        await services.training.run({
          modelName: payload.modelName ?? 'dqn-main',
          rounds: Array.isArray(game.history) ? game.history : [],
          epochs: 1,
          continuous: !!payload.continuous
        });
      }
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message, summary });
    }

    res.json({ ok: true, summary });
  });
}
