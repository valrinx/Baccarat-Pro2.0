export function createConfidenceEngine() {
  function calculate({ qValues = [], entropy = 0, volatility = 0 }) {
    const best = Math.max(...qValues, 0);
    const normalized = Math.max(0, Math.min(1, best));
    const chaosPenalty = Math.max(entropy, volatility);
    const confidence = Math.round(Math.max(0, Math.min(100, normalized * 100 - chaosPenalty * 35)));
    const chaos = Math.round(Math.max(0, Math.min(100, chaosPenalty * 100)));
    const risk = chaos >= 70 || confidence < 35 ? 'HIGH' : chaos >= 45 ? 'MEDIUM' : 'LOW';
    const recommendation = risk === 'HIGH' ? 'SKIP' : confidence >= 60 ? 'BET' : 'WAIT';
    return { confidence, chaos, risk, recommendation };
  }

  return { calculate };
}
