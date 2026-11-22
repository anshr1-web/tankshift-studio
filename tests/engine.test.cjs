'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(['model.js', 'engine.js'].map(file => fs.readFileSync(path.join(root, 'dist', file), 'utf8')).join('\n'), context);
const solve = state => context.solve(state);
const array = values => Array.from(values);
const uncertain = () => ({ people: [210,160,85], stock: [3500,3000,1800], error: [1800,500,250], hour: 6, temp: 34, load: 3000, delay: 0 });

function assertFeasible(state, plan) {
  const delivered = plan.best.reduce((a,b) => a+b, 0);
  assert(delivered <= state.load, 'delivery cannot exceed tanker supply');
  assert.equal(delivered + plan.unused, state.load, 'all tanker water is delivered or retained');
  assert(Number.isFinite(plan.loss) && plan.loss >= 0, 'expected shortage is finite and nonnegative');
  plan.best.forEach((delivery, i) => {
    assert(delivery >= 0 && delivery % 250 === 0, 'delivery is a nonnegative multiple of 250 L');
    const consumedBeforeArrival = plan.hourly[i].slice(0, state.delay).reduce((a,b) => a+b, 0);
    for (const delta of [-state.error[i], 0, state.error[i]]) {
      const startingStock = Math.min(8000, Math.max(0, state.stock[i] + delta));
      const remaining = Math.max(0, startingStock - consumedBeforeArrival);
      assert(remaining + delivery <= 8000 + 1e-8, 'capacity holds for every sensor-stock scenario');
    }
  });
}

test('Uncertain readings preserves the established initial dispatch', () => {
  const state = uncertain(), plan = solve(state);
  assert.deepEqual(array(plan.best), [2000,750,250]);
  assert.equal(Math.round(plan.loss), 1325);
  assertFeasible(state, plan);
});

test('East verified at 5300 L produces the exact revised plan and signed changes', () => {
  const state = uncertain(), before = solve(state);
  state.stock[0] = 5300; state.error[0] = 0;
  const after = solve(state);
  assert.deepEqual(array(after.best), [250,1750,1000]);
  assert.deepEqual(array(after.best).map((v,i) => v-before.best[i]), [-1750,1000,750]);
  assert.equal(after.loss, 0);
  assert.equal(after.best.reduce((a,b) => a+b,0), 3000);
  assertFeasible(state, after);
});

test('inspection rank selects East using calculated shortage benefit', () => {
  const state = uncertain();
  const benefits = array(context.readingValues(state, solve(state)));
  assert.deepEqual(benefits.map(Math.round), [241,149,46]);
  assert.equal(benefits.indexOf(Math.max(...benefits)), 0);
  state.stock[0] = 5300; state.error[0] = 0;
  assert.deepEqual(array(context.readingValues(state, solve(state))), [0,0,0]);
});

test('zero tanker supply is feasible and retains a meaningful shortage estimate', () => {
  const state = { ...uncertain(), load: 0 }, plan = solve(state);
  assert.deepEqual(array(plan.best), [0,0,0]);
  assert(plan.loss > 0);
  assertFeasible(state, plan);
});

test('full tanks with immediate arrival retain all supply', () => {
  const state = { ...uncertain(), stock: [8000,8000,8000], error: [0,0,0] }, plan = solve(state);
  assert.deepEqual(array(plan.best), [0,0,0]);
  assert.equal(plan.unused, 3000);
  assert.equal(plan.loss, 0);
  assertFeasible(state, plan);
});

test('what-if calculations leave the current inputs unchanged', () => {
  const state = uncertain(), original = structuredClone(state);
  const current = array(solve(state).best);
  for (const override of [{delay:2}, {load:4000}, {temp:37}]) {
    const alternative = {...structuredClone(state), ...override};
    assertFeasible(alternative, solve(alternative));
  }
  assert.deepEqual(state, original);
  assert.deepEqual(array(solve(state).best), current);
});

test('supply and tank capacities hold across delays, stock extremes, and supply limits', () => {
  for (const stock of [[0,0,0], [3500,3000,1800], [8000,8000,8000]]) {
    for (const error of [[0,0,0], [1800,500,250], [4000,4000,4000]]) {
      for (const delay of [0,2,6]) {
        for (const load of [0,250,3000,12000]) {
          const state = {...uncertain(), stock, error, delay, load};
          assertFeasible(state, solve(state));
        }
      }
    }
  }
});
