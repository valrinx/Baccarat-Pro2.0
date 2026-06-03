import { ACTIONS } from './state.js';

export function createGameEngine() {
  function normalizeOutcome(outcome) {
    if (!outcome) return ACTIONS.SKIP;
    const value = String(outcome).toUpperCase();
    if (value === 'B' || value === ACTIONS.BANKER) return ACTIONS.BANKER;
    if (value === 'P' || value === ACTIONS.PLAYER) return ACTIONS.PLAYER;
    return ACTIONS.SKIP;
  }

  function resolveRound(round) {
    const banker = Number(round?.bankerScore ?? 0);
    const player = Number(round?.playerScore ?? 0);
    if (banker === player) return ACTIONS.SKIP;
    return banker > player ? ACTIONS.BANKER : ACTIONS.PLAYER;
  }

  function calculateShoedepth(history) {
    return Array.isArray(history) ? history.length : 0;
  }

  return {
    normalizeOutcome,
    resolveRound,
    calculateShoedepth
  };
}
