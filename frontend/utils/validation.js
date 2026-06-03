export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function assertArray(value) {
  return Array.isArray(value) ? value : [];
}
