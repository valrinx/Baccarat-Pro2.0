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
        distribution: { BANKER: 0, PLAYER: 0 }
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

    return {
      normalizedEntropy,
      entropy,
      volatility,
      chaos,
      distribution: { BANKER: pB, PLAYER: pP }
    };
  }

  return { calculate };
}
