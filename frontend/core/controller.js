import { createInitialAiState, createInitialGameState, ACTIONS } from './state.js';
import { createGameEngine } from './gameEngine.js';
import { createRoadmapEngine } from './roadmapEngine.js';
import { createStateEncoder } from './stateEncoder.js';
import { createAiEngine } from '../ai/aiEngine.js';
import { createLocalStateStore } from '../storage/localStateStore.js';
import { createSessionStore } from '../storage/sessionStore.js';
import { createLogger } from '../utils/logger.js';

export function createAppController() {
  const logger = createLogger('controller');
  const gameEngine = createGameEngine();
  const roadmapEngine = createRoadmapEngine();
  const stateEncoder = createStateEncoder();
  const aiEngine = createAiEngine();
  const localStateStore = createLocalStateStore();
  const sessionStore = createSessionStore();

  const state = {
    game: createInitialGameState(),
    ai: createInitialAiState(),
    prediction: 'SKIP',
    confidence: 0,
    chaos: 0,
    risk: 'LOW',
    recommendation: 'WAIT FOR SIGNAL',
    aiStats: { mode: 'BOOTING', samples: 0, accuracy: 0, skipRate: 0 },
    status: 'BOOTING'
  };

  function persist() {
    localStateStore.save({ state });
  }

  function restore() {
    const saved = localStateStore.load();
    if (!saved?.payload?.state) return false;
    Object.assign(state, saved.payload.state);
    return true;
  }

  function syncGameMetrics(history) {
    const cleaned = history.filter(Boolean);
    state.game.history = cleaned;
    state.game.roadmap = roadmapEngine.summarizeRoadmap(cleaned);
    state.game.stats = {
      banker: cleaned.filter((x) => x === ACTIONS.BANKER).length,
      player: cleaned.filter((x) => x === ACTIONS.PLAYER).length,
      tie: cleaned.filter((x) => x === ACTIONS.SKIP).length,
      shoeDepth: gameEngine.calculateShoedepth(cleaned)
    };
  }

  function render() {
    const predictionText = document.getElementById('predictionText');
    const recommendationText = document.getElementById('recommendationText');
    const confidenceMeter = document.getElementById('confidenceMeter');
    const chaosMeter = document.getElementById('chaosMeter');
    const riskMeter = document.getElementById('riskMeter');
    const aiStats = document.getElementById('aiStats');
    const roadmapCanvas = document.getElementById('roadmapCanvas');
    const sessionList = document.getElementById('sessionList');
    const serviceStatus = document.getElementById('serviceStatus');

    if (predictionText) predictionText.textContent = state.prediction;
    if (recommendationText) recommendationText.textContent = `Recommendation: ${state.recommendation}`;
    if (confidenceMeter) confidenceMeter.textContent = `${state.confidence}%`;
    if (chaosMeter) chaosMeter.textContent = `${state.chaos}%`;
    if (riskMeter) riskMeter.textContent = state.risk;
    if (aiStats) {
      aiStats.innerHTML = `
        <div class="stat-row"><span>Mode</span><strong>${state.aiStats.mode}</strong></div>
        <div class="stat-row"><span>Samples</span><strong>${state.aiStats.samples}</strong></div>
        <div class="stat-row"><span>Accuracy</span><strong>${state.aiStats.accuracy}%</strong></div>
        <div class="stat-row"><span>Skip Rate</span><strong>${state.aiStats.skipRate}%</strong></div>
      `;
    }
    if (roadmapCanvas) {
      roadmapCanvas.innerHTML = `
        <div class="roadmap-block"><div><strong>Bead Plate</strong></div><div>${state.game.roadmap.beadPlate.length} entries</div></div>
        <div class="roadmap-block"><div><strong>Big Road</strong></div><div>${state.game.roadmap.bigRoad.length} columns</div></div>
        <div class="roadmap-block roadmap-diagnostics"><div><strong>Entropy</strong></div><div>${state.ai.entropy}%</div></div>
        <div class="roadmap-block roadmap-diagnostics"><div><strong>Transition</strong></div><div>${state.ai.transition ? `${Math.round((state.ai.transition.P || 0) * 100)} / ${Math.round((state.ai.transition.B || 0) * 100)}` : 'N/A'}</div></div>
      `;
    }
    if (sessionList) {
      const sessions = sessionStore.list();
      sessionList.innerHTML = sessions.length
        ? sessions.map((item, index) => `
            <div class="session-card">
              <div>
                <div class="session-title">Session ${index + 1}</div>
                <div class="session-meta">Rounds: ${item.rounds ?? 0} · P:${item.p ?? 0} B:${item.b ?? 0} T:${item.t ?? 0}</div>
              </div>
              <div class="session-pnl ${(item.pnl ?? 0) >= 0 ? 'pos' : 'neg'}">${(item.pnl ?? 0) >= 0 ? '+' : ''}${item.pnl ?? 0}</div>
            </div>
          `).join('')
        : '<div class="placeholder-box">No saved sessions yet</div>';
    }
    if (serviceStatus) serviceStatus.textContent = state.status;
  }

  function refreshFromGame() {
    const encoded = stateEncoder.encode(state.game.history, state.game.roadmap);
    const aiResult = aiEngine.predict(encoded.vector, encoded.metrics, state.game.history);

    state.ai.stateVector = encoded.vector;
    state.ai.entropy = Math.round(encoded.metrics.entropyScore * 100);
    state.ai.chaos = aiResult.chaos;
    state.ai.action = aiResult.action;
    state.ai.confidence = aiResult.confidence;
    state.ai.riskLevel = aiResult.risk;
    state.ai.recommendation = aiResult.recommendation;
    state.ai.transition = aiResult.transition;

    state.prediction = state.ai.action;
    state.confidence = state.ai.confidence;
    state.chaos = state.ai.chaos;
    state.risk = state.ai.riskLevel;
    state.recommendation = state.ai.recommendation;
    state.aiStats = {
      mode: aiResult.explored ? 'DQN EXPLORATION' : 'DQN POLICY',
      samples: state.game.history.length,
      accuracy: 0,
      skipRate: Math.round((state.game.history.filter((x) => x === ACTIONS.SKIP).length / Math.max(1, state.game.history.length)) * 100)
    };
  }

  function seedDemoData() {
    syncGameMetrics([ACTIONS.BANKER, ACTIONS.BANKER, ACTIONS.PLAYER, ACTIONS.PLAYER, ACTIONS.BANKER]);
    refreshFromGame();
    state.status = 'READY';
  }

  function saveSessionSnapshot() {
    sessionStore.save({
      rounds: state.game.history.length,
      p: state.game.stats.player,
      b: state.game.stats.banker,
      t: state.game.stats.tie,
      pnl: 0,
      createdAt: Date.now()
    });
  }

  function init() {
    const restored = restore();
    if (!restored) seedDemoData();
    else {
      syncGameMetrics(state.game.history || []);
      refreshFromGame();
      state.status = 'RESTORED';
    }
    saveSessionSnapshot();
    persist();
    render();
    logger.info('controller initialized', { restored });
  }

  return { init, render, state, persist, restore };
}
