export const ACTIONS = Object.freeze({
  BANKER: 'BANKER',
  PLAYER: 'PLAYER',
  SKIP: 'SKIP'
});

export function createInitialGameState() {
  return {
    rounds: [],
    history: [],
    roadmap: {
      beadPlate: [],
      bigRoad: []
    },
    stats: {
      banker: 0,
      player: 0,
      tie: 0,
      shoeDepth: 0
    }
  };
}

export function createInitialAiState() {
  return {
    action: ACTIONS.SKIP,
    confidence: 0,
    chaos: 0,
    riskLevel: 'LOW',
    recommendation: 'WAIT',
    pattern: null,
    entropy: 0,
    transition: null,
    stateVector: [],
    regime: 'WEAK_SIGNAL',
    regimeConfidence: 0,
    regimeScore: 0,
    bankrollHealth: { level: 'ok', confMultiplier: 1, skipBoost: 0 }
  };
}
