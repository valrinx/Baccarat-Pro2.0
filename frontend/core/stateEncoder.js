import { ACTIONS } from './state.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lastNonTie(history) {
  return [...history].reverse().find((x) => x === ACTIONS.BANKER || x === ACTIONS.PLAYER) ?? null;
}

function countAlternations(clean) {
  return clean.reduce((acc, item, index, arr) => {
    if (index === 0) return acc;
    return acc + (item !== arr[index - 1] ? 1 : 0);
  }, 0);
}

function countRunLength(clean) {
  if (!clean.length) return 0;
  const last = clean.at(-1);
  let count = 0;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    if (clean[i] !== last) break;
    count += 1;
  }
  return count;
}

function detectRegime({ clean, bankerRatio, playerRatio, alternationRate, streakLength, entropyScore, volatilityScore, historyLength }) {
  if (historyLength < 5) {
    return { regime: 'WEAK_SIGNAL', regimeScore: 0.2, regimeConfidence: 25 };
  }

  if (entropyScore > 0.72 || volatilityScore > 0.72) {
    return { regime: 'VOLATILE', regimeScore: Math.max(entropyScore, volatilityScore), regimeConfidence: 85 };
  }

  if (alternationRate >= 0.72 && streakLength <= 2) {
    return { regime: 'CHOP', regimeScore: alternationRate, regimeConfidence: 82 };
  }

  if (streakLength >= 4 || Math.max(bankerRatio, playerRatio) >= 0.62) {
    return { regime: 'TREND', regimeScore: Math.max(streakLength / 10, bankerRatio, playerRatio), regimeConfidence: 76 };
  }

  if (historyLength >= 12 && Math.abs(bankerRatio - playerRatio) < 0.08) {
    return { regime: 'MIXED', regimeScore: 0.55, regimeConfidence: 60 };
  }

  return { regime: 'MIXED', regimeScore: 0.45, regimeConfidence: 52 };
}

export function createStateEncoder() {
  function encode(history = [], roadmap = null) {
    const normalizedHistory = history.filter(Boolean);
    const clean = normalizedHistory.filter((x) => x === ACTIONS.BANKER || x === ACTIONS.PLAYER);
    const total = clean.length || 1;
    const bankerCount = clean.filter((x) => x === ACTIONS.BANKER).length;
    const playerCount = clean.filter((x) => x === ACTIONS.PLAYER).length;
    const tieCount = normalizedHistory.filter((x) => x === ACTIONS.SKIP).length;

    const last = lastNonTie(normalizedHistory) ?? ACTIONS.BANKER;
    const streakLength = countRunLength(clean);
    const alternationRate = clean.length > 1 ? countAlternations(clean.slice(-10)) / Math.max(1, Math.min(9, clean.slice(-10).length - 1)) : 0;

    const bankerRatio = bankerCount / total;
    const playerRatio = playerCount / total;
    const tieRatio = tieCount / Math.max(1, normalizedHistory.length);
    const chopFrequency = clean.slice(-10).reduce((acc, item, index, arr) => {
      if (index === 0) return acc;
      return acc + (item !== arr[index - 1] ? 1 : 0);
    }, 0) / Math.max(1, Math.min(10, clean.slice(-10).length - 1));

    const shoeDepth = clamp01(normalizedHistory.length / 60);
    const transitionProbability = clean.length > 1 ? 1 / Math.max(1, streakLength) : 0;
    const patternConfidence = clamp01(Math.max(bankerRatio, playerRatio) * (1 - chopFrequency));
    const momentumBias = clamp01(Math.abs(bankerRatio - playerRatio));
    const entropyScore = clamp01(chopFrequency * 0.5 + momentumBias * 0.5 + tieRatio * 0.2);
    const volatilityScore = clamp01(chopFrequency * 0.55 + entropyScore * 0.35 + tieRatio * 0.15);

    const regimeInfo = detectRegime({
      clean,
      bankerRatio,
      playerRatio,
      alternationRate,
      streakLength,
      entropyScore,
      volatilityScore,
      historyLength: normalizedHistory.length
    });

    return {
      vector: [
        clamp01(last === ACTIONS.BANKER ? 1 : 0),
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
        last,
        streakLength,
        bankerRatio,
        playerRatio,
        tieRatio,
        chopFrequency,
        alternationRate,
        entropyScore,
        volatilityScore,
        transitionProbability,
        shoeDepth,
        patternConfidence,
        momentumBias,
        roadmapSize: roadmap?.bigRoad?.length ?? 0,
        regime: regimeInfo.regime,
        regimeScore: regimeInfo.regimeScore,
        regimeConfidence: regimeInfo.regimeConfidence
      }
    };
  }

  return { encode };
}
