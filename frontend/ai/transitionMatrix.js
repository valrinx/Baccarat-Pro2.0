export function createTransitionMatrix() {
  const matrix = {
    PP: { P: 0, B: 0, S: 0 },
    PB: { P: 0, B: 0, S: 0 },
    BP: { P: 0, B: 0, S: 0 },
    BB: { P: 0, B: 0, S: 0 }
  };

  function keyFrom(prev, next) {
    return `${prev}${next}`;
  }

  function update(history = []) {
    const seq = history.filter((x) => x === 'BANKER' || x === 'PLAYER' || x === 'SKIP');
    for (let i = 1; i < seq.length; i += 1) {
      const prev = seq[i - 1];
      const next = seq[i];
      if (prev === 'SKIP' || next === 'SKIP') continue;
      const key = keyFrom(prev[0], next[0]);
      if (!matrix[key]) continue;
      matrix[key][next[0]] += 1;
    }
  }

  function probabilities(stateKey) {
    const row = matrix[stateKey] || { P: 0, B: 0, S: 0 };
    const total = row.P + row.B + row.S || 1;
    return {
      P: row.P / total,
      B: row.B / total,
      S: row.S / total
    };
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(matrix));
  }

  return {
    update,
    probabilities,
    snapshot
  };
}
