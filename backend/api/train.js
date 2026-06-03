import fs from 'node:fs';
import path from 'node:path';

export function registerTrainRoute(app, services) {
  app.post('/api/train', async (req, res) => {
    const payload = req.body ?? {};
    const result = await services.training.run(payload);
    const status = await services.training.status(payload.modelName ?? 'dqn-main');
    res.json({ ok: true, result, status });
  });

  app.post('/api/train/continuous', async (req, res) => {
    const payload = req.body ?? {};
    const state = await services.training.enableContinuous(payload);
    const result = await services.training.run({
      ...payload,
      continuous: true
    });
    const status = await services.training.status(payload.modelName ?? 'dqn-main');
    res.json({ ok: true, result, status, mode: 'continuous', state });
  });

  app.get('/api/train/autotrain/start', async (req, res) => {
    const { spawn } = await import('node:child_process');
    const outputPath = path.join(__dirname, '..', 'models', 'autotrain-report.json');
    const child = spawn('node', ['tests/autotrain.js', '--output', outputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));

    child.unref();

    res.json({ ok: true, mode: 'autotrain', status: 'started', output: outputPath, pid: child.pid });
  });

  app.get('/api/train/autotrain/status', async (req, res) => {
    const reportPath = path.join(__dirname, '..', 'models', 'autotrain-report.json');
    let report = null;
    try {
      const raw = await fs.promises.readFile(reportPath, 'utf8');
      report = JSON.parse(raw);
    } catch {
      report = null;
    }
    res.json({ ok: true, report, running: !!report && !report.finishedAt });
  });
}
