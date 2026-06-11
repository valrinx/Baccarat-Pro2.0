import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ANALYTICS_FILE = path.join(__dirname, '..', '..', 'models', 'regime-analytics.json');

const DEFAULT_ANALYTICS = {
  total: 0,
  overall: { wins: 0, losses: 0, skips: 0 },
  regimes: {
    TREND: { total: 0, wins: 0, losses: 0, skips: 0 },
    CHOP: { total: 0, wins: 0, losses: 0, skips: 0 },
    VOLATILE: { total: 0, wins: 0, losses: 0, skips: 0 },
    MIXED: { total: 0, wins: 0, losses: 0, skips: 0 },
    WEAK_SIGNAL: { total: 0, wins: 0, losses: 0, skips: 0 }
  },
  expertStats: {},
  calibration: {
    bins: {
      '0-20': { total: 0, wins: 0 },
      '21-40': { total: 0, wins: 0 },
      '41-60': { total: 0, wins: 0 },
      '61-80': { total: 0, wins: 0 },
      '81-100': { total: 0, wins: 0 }
    }
  },
  updatedAt: null
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_ANALYTICS));
}

async function loadAnalytics() {
  try {
    const raw = await fs.readFile(ANALYTICS_FILE, 'utf8');
    return { ...cloneDefault(), ...JSON.parse(raw) };
  } catch {
    return cloneDefault();
  }
}

async function saveAnalytics(analytics) {
  await fs.mkdir(path.dirname(ANALYTICS_FILE), { recursive: true });
  await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2), 'utf8');
}

export async function recordRegimeOutcome({ regime = 'MIXED', confidence = 0, wasCorrect = false, skipped = false, experts = [] } = {}) {
  const analytics = await loadAnalytics();
  const key = analytics.regimes[regime] ? regime : 'MIXED';
  const regimeBucket = analytics.regimes[key];

  analytics.total += 1;
  regimeBucket.total += 1;
  if (skipped) {
    analytics.overall.skips += 1;
    regimeBucket.skips += 1;
  } else if (wasCorrect) {
    analytics.overall.wins += 1;
    regimeBucket.wins += 1;
  } else {
    analytics.overall.losses += 1;
    regimeBucket.losses += 1;
  }

  const binKey = confidence <= 20 ? '0-20'
    : confidence <= 40 ? '21-40'
    : confidence <= 60 ? '41-60'
    : confidence <= 80 ? '61-80'
    : '81-100';
  analytics.calibration.bins[binKey].total += 1;
  if (wasCorrect) analytics.calibration.bins[binKey].wins += 1;

  for (const expert of experts) {
    if (!expert?.name) continue;
    if (!analytics.expertStats[expert.name]) {
      analytics.expertStats[expert.name] = { total: 0, wins: 0, losses: 0, skips: 0, regimes: {} };
    }
    const st = analytics.expertStats[expert.name];
    st.total += 1;
    if (skipped) st.skips += 1;
    else if (wasCorrect) st.wins += 1;
    else st.losses += 1;
    if (!st.regimes[key]) st.regimes[key] = { total: 0, wins: 0, losses: 0, skips: 0 };
    st.regimes[key].total += 1;
    if (skipped) st.regimes[key].skips += 1;
    else if (wasCorrect) st.regimes[key].wins += 1;
    else st.regimes[key].losses += 1;
  }

  analytics.updatedAt = new Date().toISOString();
  await saveAnalytics(analytics);
  return analytics;
}

export async function loadRegimeAnalytics() {
  return loadAnalytics();
}
