export function createEntropyEngine() {
  function calculate(history = []) {
    const clean = history.filter((x) => x === 'BANKER' || x === 'PLAYER');
    const length = clean.length;
    if (!length) {
      return {
        normalizedEntropy: 0,
        entropy: 0,
        volatility: 0,
        chaos: 0,
        distribution: { BANKER: 0, PLAYER: 0 },
        regime: 'WEAK_SIGNAL',
        regimeScore: 0,
        regimeConfidence: 0
      };
    }

    const banker = clean.filter((x) => x === 'BANKER').length;
    const player = clean.filter((x) => x === 'PLAYER').length;
    const pB = banker / length;
    const pP = player / length;
    const entropy = [pB, pP].reduce((acc, value) => {
      if (value <= 0) return acc;
      return acc - value * Math.log2(value);
    }, 0);

    const normalizedEntropy = entropy / 1;
    const alternations = clean.reduce((acc, value, index, arr) => {
      if (index === 0) return acc;
      return acc + (value !== arr[index - 1] ? 1 : 0);
    }, 0);
    const volatility = Math.min(1, alternations / Math.max(1, length - 1));
    const chaos = Math.min(1, normalizedEntropy * 0.6 + volatility * 0.4);

    let regime = 'MIXED';
    let regimeScore = 0.5;
    let regimeConfidence = 55;
    const streak = (() => {
      const last = clean.at(-1);
      let n = 0;
      for (let i = clean.length - 1; i >= 0; i -= 1) {
        if (clean[i] !== last) break;
        n += 1;
      }
      return n;
    })();
    const altRate = length > 1 ? alternations / (length - 1) : 0;

    if (length < 5) {
      regime = 'WEAK_SIGNAL';
      regimeScore = 0.2;
      regimeConfidence = 25;
    } else if (chaos > 0.72) {
      regime = 'VOLATILE';
      regimeScore = chaos;
      regimeConfidence = 88;
    } else if (altRate >= 0.72 && streak <= 2) {
      regime = 'CHOP';
      regimeScore = altRate;
      regimeConfidence = 82;
    } else if (streak >= 4 || Math.max(pB, pP) >= 0.62) {
      regime = 'TREND';
      regimeScore = Math.max(streak / 10, pB, pP);
      regimeConfidence = 76;
    } else if (length >= 12 && Math.abs(pB - pP) < 0.08) {
      regime = 'MIXED';
      regimeScore = 0.55;
      regimeConfidence = 60;
    }

    return {
      normalizedEntropy,
      entropy,
      volatility,
      chaos,
      distribution: { BANKER: pB, PLAYER: pP },
      regime,
      regimeScore,
      regimeConfidence
    };
  }

  return { calculate };
}
