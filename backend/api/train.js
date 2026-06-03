export function registerTrainRoute(app, services) {
  app.post('/api/train', async (req, res) => {
    const payload = req.body ?? {};
    const result = await services.training.run(payload);
    const status = await services.training.status(payload.modelName ?? 'dqn-main');
    res.json({ ok: true, result, status });
  });
}
