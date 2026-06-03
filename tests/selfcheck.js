import assert from 'node:assert/strict';
import { createStateEncoder } from '../frontend/core/stateEncoder.js';
import { createRoadmapEngine } from '../frontend/core/roadmapEngine.js';
import { createEntropyEngine } from '../frontend/ai/entropyEngine.js';
import { createTransitionMatrix } from '../frontend/ai/transitionMatrix.js';
import { ACTIONS } from '../frontend/core/state.js';

const roadmapEngine = createRoadmapEngine();
const stateEncoder = createStateEncoder();
const entropyEngine = createEntropyEngine();
const transitionMatrix = createTransitionMatrix();

const history = [ACTIONS.BANKER, ACTIONS.BANKER, ACTIONS.PLAYER, ACTIONS.PLAYER, ACTIONS.BANKER];
const roadmap = roadmapEngine.summarizeRoadmap(history);
const encoded = stateEncoder.encode(history, roadmap);
const entropy = entropyEngine.calculate(history);
transitionMatrix.update(history);
const transition = transitionMatrix.probabilities('BB');

assert.equal(Array.isArray(roadmap.beadPlate), true);
assert.equal(Array.isArray(roadmap.bigRoad), true);
assert.equal(encoded.vector.length, 10);
assert.equal(typeof entropy.chaos, 'number');
assert.equal(typeof transition.P, 'number');

console.log('SELF-CHECK PASSED');
