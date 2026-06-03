import { createModelRegistry } from '../ai/modelRegistry.js';

export function registerModelRoute(app) {
  const registry = createModelRegistry();

  app.get('/api/model/:name/status', async (req, res) => {
    const name = req.params.name;
    const meta = await registry.loadMeta(name);
    res.json({
      ok: true,
      modelName: name,
      available: !!meta,
      meta
    });
  });
}
