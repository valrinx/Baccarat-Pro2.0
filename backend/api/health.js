export function registerHealthRoute(app) {
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Baccarat Pro 2.0',
      phase: 'production',
      ts: new Date().toISOString()
    });
  });
}
