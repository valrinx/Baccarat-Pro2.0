import { createInitialAiState, createInitialGameState, ACTIONS } from './state.js';
import { createGameEngine } from './gameEngine.js';
import { createRoadmapEngine } from './roadmapEngine.js';
import { createStateEncoder } from './stateEncoder.js';
import { createAiEngine } from '../ai/aiEngine.js';
import { createLocalStateStore } from '../storage/localStateStore.js';
import { createSessionStore } from '../storage/sessionStore.js';
import { createLogger } from '../utils/logger.js';

const API_BASE = '';

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
    status: 'BOOTING',
    vote: {
      winner: 'SKIP',
      confidence: 0,
      tally: { BANKER: 0, PLAYER: 0, SKIP: 0 },
      votes: [],
      isTie: false
    }
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

  async function fetchPrediction() {
    try {
      const response = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: state.game.history, roadmap: state.game.roadmap })
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      logger.warn('predict request failed', { error: error.message });
      return null;
    }
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

    const votePanel = document.getElementById('votePanel');
    if (votePanel && state.vote?.votes?.length) {
      const { tally, votes, winner, confidence, isTie } = state.vote;
      const total = (tally.BANKER ?? 0) + (tally.PLAYER ?? 0) + (tally.SKIP ?? 0) || 1;

      const voterRows = votes.map((v) => {
        const colorClass = v.action === 'BANKER' ? 'bl' : v.action === 'PLAYER' ? 'pl' : 'dim';
        return `
          <div class="vote-row">
            <span class="vote-src">${v.label}</span>
            <span class="vote-action vote-${colorClass}">${v.action}</span>
            <span class="vote-wt">${v.weight}pt</span>
            <span class="vote-conf">${v.confidence}%</span>
          </div>`;
      }).join('');

      const tallyBar = (score, cssVar) => {
        const pct = Math.round((score / total) * 100);
        return `<div class="vote-tally-bar" style="width:${pct}%;background:${cssVar}"></div>`;
      };

      const winnerClass = winner === 'BANKER' ? 'bl' : winner === 'PLAYER' ? 'pl' : 'dim';
      votePanel.innerHTML = `
        <div class="vote-header">
          <span class="vote-title">◆ AI VOTE</span>
          <span class="vote-winner vote-${winnerClass}">${isTie ? 'TIE → SKIP' : winner}</span>
          <span class="vote-conf-badge">${confidence}%</span>
        </div>
        <div class="vote-tally-wrap">
          <div class="vote-tally-track">
            ${tallyBar(tally.BANKER ?? 0, 'var(--bl)')}
            ${tallyBar(tally.PLAYER ?? 0, 'var(--pl)')}
            ${tallyBar(tally.SKIP ?? 0, 'var(--dim)')}
          </div>
          <div class="vote-tally-labels">
            <span style="color:var(--bl)">B ${tally.BANKER ?? 0}pt</span>
            <span style="color:var(--pl)">P ${tally.PLAYER ?? 0}pt</span>
            <span style="color:var(--dim)">S ${tally.SKIP ?? 0}pt</span>
          </div>
        </div>
        <div class="vote-rows">${voterRows}</div>
      `;
    }
  }

  async function refreshFromGame() {
    const encoded = stateEncoder.encode(state.game.history, state.game.roadmap);
    const localResult = aiEngine.predict(encoded.vector, encoded.metrics, state.game.history);
    const remoteResult = await fetchPrediction();
    const aiResult = remoteResult?.prediction
      ? {
          action: remoteResult.prediction.action,
          confidence: remoteResult.prediction.confidence,
          chaos: remoteResult.prediction.chaos,
          risk: remoteResult.prediction.risk,
          recommendation: remoteResult.prediction.recommendation,
          transition: remoteResult.prediction.transition,
          vote: remoteResult.prediction.vote,
          explored: remoteResult.prediction.explored
        }
      : localResult;

    state.ai.stateVector = encoded.vector;
    state.ai.entropy = Math.round(encoded.metrics.entropyScore * 100);
    state.ai.chaos = aiResult.chaos;
    state.ai.action = aiResult.action;
    state.ai.confidence = aiResult.confidence;
    state.ai.riskLevel = aiResult.risk;
    state.ai.recommendation = aiResult.recommendation;
    state.ai.transition = aiResult.transition;
    state.ai.regime = aiResult.regime;
    state.ai.regimeConfidence = aiResult.regimeConfidence;
    state.ai.regimeScore = aiResult.regimeScore;
    state.ai.bankrollHealth = aiResult.bankrollHealth;

    state.prediction = state.ai.action;
    state.confidence = state.ai.confidence;
    state.chaos = state.ai.chaos;
    state.risk = state.ai.riskLevel;
    state.recommendation = state.ai.recommendation;
    state.vote = aiResult.vote ?? state.vote;
    state.aiStats = {
      mode: remoteResult?.ok ? 'REMOTE API' : (aiResult.explored ? 'DQN EXPLORATION' : 'DQN POLICY'),
      samples: state.game.history.length,
      accuracy: 0,
      skipRate: Math.round((state.game.history.filter((x) => x === ACTIONS.SKIP).length / Math.max(1, state.game.history.length)) * 100),
      regime: aiResult.regime ?? 'MIXED',
      regimeConfidence: aiResult.regimeConfidence ?? 0
    };
  }

  async function seedDemoData() {
    syncGameMetrics([ACTIONS.BANKER, ACTIONS.BANKER, ACTIONS.PLAYER, ACTIONS.PLAYER, ACTIONS.BANKER]);
    await refreshFromGame();
    state.status = 'READY';
  }

  async function saveSessionSnapshot() {
    const snapshot = {
      rounds: state.game.history.length,
      p: state.game.stats.player,
      b: state.game.stats.banker,
      t: state.game.stats.tie,
      pnl: 0,
      createdAt: Date.now()
    };
    sessionStore.save(snapshot);
    try {
      await fetch(`${API_BASE}/api/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
    } catch (error) {
      logger.warn('session sync failed', { error: error.message });
    }
  }

  async function init() {
    const restored = restore();
    if (!restored) await seedDemoData();
    else {
      syncGameMetrics(state.game.history || []);
      await refreshFromGame();
      state.status = 'RESTORED';
    }
    await saveSessionSnapshot();
    persist();
    render();
    logger.info('controller initialized', { restored });
  }

  return { init, render, state, persist, restore };
}
