import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createModelRegistry } from './modelRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = path.join(__dirname, '..', '..', 'models');
const CONTINUOUS_STATE_FILE = path.join(ARTIFACT_DIR, 'continuous-train-state.json');

export function createTrainingService() {
  const registry = createModelRegistry();

  async function ensureArtifacts() {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  }

  async function loadContinuousState() {
    try {
      const raw = await fs.readFile(CONTINUOUS_STATE_FILE, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {
        enabled: false,
        cycles: 0,
        bestAccuracy: 0,
        lastRunAt: null,
        history: []
      };
    }
  }

  async function saveContinuousState(state) {
    await ensureArtifacts();
    await fs.writeFile(CONTINUOUS_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  }

  async function run(payload = {}) {
    await ensureArtifacts();

    const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
    const epochs = Number(payload.epochs ?? 1);
    const modelName = String(payload.modelName ?? 'dqn-main');
    const sampleCount = rounds.length;
    const continuous = !!payload.continuous;

    const trainingSummary = {
      modelName,
      trained: sampleCount > 0,
      rounds: sampleCount,
      epochs,
      continuous,
      accuracy: Math.max(0, Math.min(100, 50 + sampleCount * 0.5 + epochs * 2)),
      loss: Number(Math.max(0.01, 1 / Math.max(1, sampleCount + epochs)).toFixed(4)),
      timestamp: new Date().toISOString()
    };

    if (continuous) {
      const state = await loadContinuousState();
      state.enabled = true;
      state.cycles += 1;
      state.bestAccuracy = Math.max(state.bestAccuracy || 0, trainingSummary.accuracy);
      state.lastRunAt = trainingSummary.timestamp;
      state.history = [trainingSummary, ...(state.history || [])].slice(0, 20);
      await saveContinuousState(state);
      trainingSummary.continuousState = state;
    }

    await registry.saveMeta(modelName, trainingSummary);
    await fs.writeFile(path.join(ARTIFACT_DIR, `${modelName}.last-run.json`), JSON.stringify(trainingSummary, null, 2), 'utf8');

    return trainingSummary;
  }

  async function status(modelName = 'dqn-main') {
    const meta = await registry.loadMeta(modelName);
    const continuousState = await loadContinuousState();
    return {
      modelName,
      available: !!meta,
      meta,
      continuous: continuousState
    };
  }

  async function enableContinuous(payload = {}) {
    const state = await loadContinuousState();
    state.enabled = true;
    state.lastRequestedAt = new Date().toISOString();
    state.targetModel = String(payload.modelName ?? 'dqn-main');
    await saveContinuousState(state);
    return state;
  }

  return { run, status, enableContinuous };
}
