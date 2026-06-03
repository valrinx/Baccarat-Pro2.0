export function createReplayMemory(capacity = 5000) {
  const buffer = [];

  function push(experience) {
    buffer.push(experience);
    if (buffer.length > capacity) buffer.shift();
  }

  function sample(size = 32) {
    const count = Math.min(size, buffer.length);
    const pool = [...buffer];
    const result = [];
    while (result.length < count && pool.length) {
      const index = Math.floor(Math.random() * pool.length);
      result.push(pool.splice(index, 1)[0]);
    }
    return result;
  }

  function size() {
    return buffer.length;
  }

  function clear() {
    buffer.length = 0;
  }

  return { push, sample, size, clear };
}
