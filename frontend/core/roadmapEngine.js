import { ACTIONS } from './state.js';

export function createRoadmapEngine() {
  function buildBeadPlate(history) {
    return history.map((entry) => ({
      outcome: entry,
      color: entry === ACTIONS.BANKER ? 'red' : entry === ACTIONS.PLAYER ? 'blue' : 'green'
    }));
  }

  function buildBigRoad(history) {
    const road = [];
    let currentColumn = [];
    let last = null;

    for (const outcome of history) {
      if (outcome === ACTIONS.SKIP) continue;
      if (last === null || outcome !== last) {
        if (currentColumn.length) road.push(currentColumn);
        currentColumn = [outcome];
      } else {
        currentColumn.push(outcome);
      }
      last = outcome;
    }

    if (currentColumn.length) road.push(currentColumn);
    return road;
  }

  function summarizeRoadmap(history) {
    return {
      beadPlate: buildBeadPlate(history),
      bigRoad: buildBigRoad(history)
    };
  }

  return {
    buildBeadPlate,
    buildBigRoad,
    summarizeRoadmap
  };
}
