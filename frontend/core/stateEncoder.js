import { ACTIONS } from './state.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createStateEncoder() {
  function encode(history = [], roadmap = null) {
    const normalizedHistory = history.filter(Boolean);
    const total = normalizedHistory.length || 1;
    const bankerCount = normalizedHistory.filter((x) => x === ACTIONS.BANKER).length;
    const playerCount = normalizedHistory.filter((x) => x === ACTIONS.PLAYER).length;
    const tieCount = normalizedHistory.filter((x) => x === ACTIONS.SKIP).length;

    const streakType = normalizedHistory.length > 1 && normalizedHistory.at(-1) === normalizedHistory.at(-2) ? 1 : 0;
    const streakLength = (() => {
      if (!normalizedHistory.length) return 0;
      const last = normalizedHistory.at(-1);
      let count = 0;
      for (let i = normalizedHistory.length - 1; i >= 0; i -= 1) {
        if (normalizedHistory[i] !== last) break;
        count += 1;
      }
      return count;
    })();

    const bankerRatio = bankerCount / total;
    const playerRatio = playerCount / total;
    const chopFrequency = normalizedHistory.slice(-10).reduce((acc, item, index, arr) => {
      if (index === 0) return acc;
      return acc + (item !== arr[index - 1] && item !== ACTIONS.SKIP && arr[index - 1] !== ACTIONS.SKIP ? 1 : 0);
    }, 0) / Math.max(1, Math.min(10, normalizedHistory.length - 1));

    const shoeDepth = clamp01(normalizedHistory.length / 60);
    const transitionProbability = normalizedHistory.length > 1 ? 1 / Math.max(1, streakLength) : 0;
    const patternConfidence = clamp01(Math.max(bankerRatio, playerRatio) * (1 - chopFrequency));
    const momentumBias = clamp01(Math.abs(bankerRatio - playerRatio));
    const entropyScore = clamp01(chopFrequency * 0.5 + momentumBias * 0.5);
    const volatilityScore = clamp01(chopFrequency * 0.7 + entropyScore * 0.3);

    return {
      vector: [
        clamp01(streakType),
        clamp01(streakLength / 10),
        clamp01(bankerRatio),
        clamp01(chopFrequency),
        clamp01(entropyScore),
        clamp01(volatilityScore),
        clamp01(transitionProbability),
        clamp01(shoeDepth),
        clamp01(patternConfidence),
        clamp01(momentumBias)
      ],
      metrics: {
        streakType,
        streakLength,
        bankerRatio,
        playerRatio,
        chopFrequency,
        entropyScore,
        volatilityScore,
        transitionProbability,
        shoeDepth,
        patternConfidence,
        momentumBias,
        roadmapSize: roadmap?.bigRoad?.length ?? 0
      }
    };
  }

  return { encode };
}
