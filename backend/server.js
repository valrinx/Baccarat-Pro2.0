import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerHealthRoute } from './api/health.js';
import { registerTrainRoute } from './api/train.js';
import { registerModelRoute } from './api/model.js';
import { registerPredictRoute } from './api/predict.js';
import { registerRecordRoute } from './api/record.js';
import { registerSessionRoute } from './api/session.js';
import { registerAnalyticsRoute } from './api/analytics.js';
import { createTrainingService } from './ai/trainingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

const services = {
  training: createTrainingService()
};

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

registerHealthRoute(app);
registerTrainRoute(app, services);
registerModelRoute(app);
registerPredictRoute(app);
registerRecordRoute(app, services);
registerSessionRoute(app);
registerAnalyticsRoute(app);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(port, () => {
  console.log(`Baccarat Pro 2.0 running on http://localhost:${port}`);
});
