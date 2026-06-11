/**
 * voteEngine.js
 * ระบบ AI โหวต — รวบรวมความเห็นจากหลาย engine แล้วเลือก action ที่ได้คะแนนสูงสุด
 *
 * Voters:
 *   1. DQN Agent       — Q-value argmax
 *   2. Transition Matrix — Markov chain probability
 *   3. Entropy Bias    — เลือกฝั่งที่น้อยกว่าเมื่อ chaos ต่ำ (mean-reversion)
 */

const VOTE_LABELS = ['BANKER', 'PLAYER', 'SKIP'];

/**
 * @typedef {{ action: string, weight: number, confidence: number, label: string }} Vote
 * @typedef {{ winner: string, confidence: number, votes: Vote[], tally: Record<string,number>, isTie: boolean }} VoteResult
 */

export function createVoteEngine() {
  function vote({
    qValues = [],
    transition = {},
    entropy = 0,
    volatility = 0,
    chaos = 0,
    bankerRatio = 0.5,
    playerRatio = 0.5,
    historyLength = 0,
    regime = 'MIXED',
    regimeConfidence = 50,
    regimeScore = 0.5,
    bankrollHealth = { level: 'ok', confMultiplier: 1, skipBoost: 0 }
  }) {
    const votes = [];
    const regimeWeights = {
      TREND: { dqn: 3, markov: 2, entropy: 0.5 },
      CHOP: { dqn: 1.5, markov: 1, entropy: 2 },
      VOLATILE: { dqn: 0.5, markov: 0.5, entropy: 3 },
      MIXED: { dqn: 2, markov: 2, entropy: 1 },
      WEAK_SIGNAL: { dqn: 1, markov: 1, entropy: 1.5 }
    };
    const weights = regimeWeights[regime] ?? regimeWeights.MIXED;

    if (qValues.length >= 2) {
      const best = Math.max(...qValues);
      const sorted = [...qValues].sort((a, b) => b - a);
      const second = sorted[1] ?? 0;
      const margin = best - second;
      const dqnConfidence = Math.min(100, Math.round(Math.max(0, best) * 100));
      const dqnIndex = qValues.indexOf(best);
      const dqnAction = VOTE_LABELS[dqnIndex] ?? 'SKIP';
      const dqnWeight = margin > 0.15 ? weights.dqn : margin > 0.05 ? weights.dqn * 0.7 : weights.dqn * 0.45;
      votes.push({ action: dqnAction, weight: dqnWeight, confidence: dqnConfidence, label: 'DQN' });
    }

    if (historyLength >= 5) {
      const pB = transition.B ?? 0;
      const pP = transition.P ?? 0;
      const pS = transition.S ?? 0;
      const bestProb = Math.max(pB, pP, pS);
      let tmAction = 'SKIP';
      if (bestProb === pB && pB > pP) tmAction = 'BANKER';
      else if (bestProb === pP && pP > pB) tmAction = 'PLAYER';
      const tmConfidence = Math.round(bestProb * 100);
      const tmWeight = historyLength >= 15 ? weights.markov : Math.max(0.5, weights.markov * 0.75);
      votes.push({ action: tmAction, weight: tmWeight, confidence: tmConfidence, label: 'MARKOV' });
    }

    if (historyLength >= 8 && chaos < 0.7) {
      const diff = Math.abs(bankerRatio - playerRatio);
      const regimeBias = regime === 'CHOP' ? 1.2 : regime === 'TREND' ? 0.8 : 1;
      if (diff > 0.08) {
        const biasAction = bankerRatio > playerRatio ? 'PLAYER' : 'BANKER';
        const biasConfidence = Math.round(Math.min(95, diff * 200 * regimeBias));
        votes.push({ action: biasAction, weight: weights.entropy, confidence: biasConfidence, label: 'ENTROPY' });
      }
    }

    if (regime === 'VOLATILE' || chaos > 0.72) {
      votes.push({ action: 'SKIP', weight: 3 + bankrollHealth.skipBoost / 10, confidence: 90, label: 'GATE' });
    }

    const tally = { BANKER: 0, PLAYER: 0, SKIP: 0 };
    for (const v of votes) {
      const key = VOTE_LABELS.includes(v.action) ? v.action : 'SKIP';
      tally[key] += v.weight;
    }

    const maxScore = Math.max(tally.BANKER, tally.PLAYER, tally.SKIP);
    const winners = VOTE_LABELS.filter((a) => tally[a] === maxScore);
    const isTie = winners.length > 1;
    const winner = isTie ? 'SKIP' : winners[0];

    const winningVotes = votes.filter((v) => v.action === winner);
    const aggConf = winningVotes.length
      ? Math.round(winningVotes.reduce((s, v) => s + v.confidence * v.weight, 0) / winningVotes.reduce((s, v) => s + v.weight, 0))
      : 0;

    const regimeMultiplier = regime === 'TREND' ? 1.05 : regime === 'CHOP' ? 1.02 : regime === 'WEAK_SIGNAL' ? 0.9 : 1;
    const bankMultiplier = bankrollHealth.level === 'danger' ? 0.8 : bankrollHealth.level === 'low' ? 0.9 : bankrollHealth.level === 'good' ? 1.03 : 1;
    const chaosPenalty = Math.max(0.35, 1 - chaos * 0.38 - volatility * 0.12);
    const confidenceWithCalibration = Math.round(aggConf * chaosPenalty * regimeMultiplier * bankMultiplier);
    const calibratedConfidence = Math.max(0, Math.min(100, confidenceWithCalibration));

    return {
      winner,
      confidence: calibratedConfidence,
      votes,
      tally,
      isTie,
      regime,
      regimeScore,
      regimeConfidence,
      bankrollHealth
    };
  }

  return { vote };
}
