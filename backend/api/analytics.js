import { loadRegimeAnalytics } from '../ai/regimeAnalytics.js';

export function registerAnalyticsRoute(app) {
  app.get('/api/analytics/regime', async (req, res) => {
    const analytics = await loadRegimeAnalytics();
    res.json({ ok: true, analytics });
  });
}
