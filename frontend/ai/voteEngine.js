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
  /**
   * รัน voting
   * @param {object} params
   * @param {number[]} params.qValues        — Q-values จาก DQN [BANKER, PLAYER, SKIP]
   * @param {object}  params.transition      — { P, B, S } probabilities จาก TransitionMatrix
   * @param {number}  params.entropy         — normalizedEntropy 0–1
   * @param {number}  params.volatility      — volatility 0–1
   * @param {number}  params.chaos           — chaos score 0–1
   * @param {number}  params.bankerRatio     — historical banker ratio 0–1
   * @param {number}  params.playerRatio     — historical player ratio 0–1
   * @param {number}  params.historyLength   — total rounds recorded
   * @returns {VoteResult}
   */
  function vote({ qValues = [], transition = {}, entropy = 0, volatility = 0, chaos = 0, bankerRatio = 0.5, playerRatio = 0.5, historyLength = 0 }) {
    const votes = [];

    // ── Voter 1: DQN (weight = 3 — highest trust) ──────────────────────────
    if (qValues.length >= 2) {
      const best = Math.max(...qValues);
      const second = qValues.filter((v) => v !== best)[0] ?? 0;
      const margin = best - second;
      const dqnConfidence = Math.min(100, Math.round(Math.max(0, best) * 100));
      const dqnIndex = qValues.indexOf(best);
      const dqnAction = VOTE_LABELS[dqnIndex] ?? 'SKIP';

      // ลด weight เมื่อ DQN ยังสำรวจอยู่ (margin แคบ = ไม่แน่ใจ)
      const dqnWeight = margin > 0.15 ? 3 : margin > 0.05 ? 2 : 1;
      votes.push({ action: dqnAction, weight: dqnWeight, confidence: dqnConfidence, label: 'DQN' });
    }

    // ── Voter 2: Transition Matrix (weight = 2) ──────────────────────────────
    if (historyLength >= 5) {
      const pB = transition.B ?? 0;
      const pP = transition.P ?? 0;
      const pS = transition.S ?? 0;
      const bestProb = Math.max(pB, pP, pS);
      let tmAction = 'SKIP';
      if (bestProb === pB && pB > pP) tmAction = 'BANKER';
      else if (bestProb === pP && pP > pB) tmAction = 'PLAYER';
      const tmConfidence = Math.round(bestProb * 100);
      const tmWeight = historyLength >= 15 ? 2 : 1; // เชื่อถือได้มากขึ้นเมื่อมีข้อมูลพอ
      votes.push({ action: tmAction, weight: tmWeight, confidence: tmConfidence, label: 'MARKOV' });
    }

    // ── Voter 3: Entropy Bias / Mean-reversion (weight = 1) ─────────────────
    // เมื่อ chaos ต่ำและมีความเอนเอียงชัด → โหวตตามฝั่งที่ออกน้อยกว่า (reversion)
    if (historyLength >= 8 && chaos < 0.55) {
      const diff = Math.abs(bankerRatio - playerRatio);
      if (diff > 0.08) {
        // revert toward underdog
        const biasAction = bankerRatio > playerRatio ? 'PLAYER' : 'BANKER';
        const biasConfidence = Math.round(Math.min(90, diff * 200));
        votes.push({ action: biasAction, weight: 1, confidence: biasConfidence, label: 'ENTROPY' });
      }
    }

    // ── Tally weighted votes ─────────────────────────────────────────────────
    const tally = { BANKER: 0, PLAYER: 0, SKIP: 0 };
    for (const v of votes) {
      const key = VOTE_LABELS.includes(v.action) ? v.action : 'SKIP';
      tally[key] += v.weight;
    }

    const maxScore = Math.max(tally.BANKER, tally.PLAYER, tally.SKIP);
    const winners = VOTE_LABELS.filter((a) => tally[a] === maxScore);
    const isTie = winners.length > 1;
    const winner = isTie ? 'SKIP' : winners[0]; // ถ้า tie ให้ SKIP

    // aggregate confidence from winning votes
    const winningVotes = votes.filter((v) => v.action === winner);
    const aggConf = winningVotes.length
      ? Math.round(winningVotes.reduce((s, v) => s + v.confidence * v.weight, 0) / winningVotes.reduce((s, v) => s + v.weight, 0))
      : 0;

    // chaos penalty
    const finalConfidence = Math.max(0, Math.round(aggConf * (1 - chaos * 0.4)));

    return {
      winner,
      confidence: finalConfidence,
      votes,
      tally,
      isTie
    };
  }

  return { vote };
}
