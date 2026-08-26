const test = require('node:test');
const assert = require('node:assert/strict');
const { inningTotals, matchupInnings } = require('../src/mlb-history');

test('reconstructs combined runs by inning', () => {
  const game = { linescore:{ innings:[{num:1,away:{runs:1},home:{runs:0}},{num:2,away:{runs:0},home:{runs:2}}] } };
  assert.deepEqual(inningTotals(game).slice(0,3), [1,2,0]);
});

test('recent rhythm receives additional weight', () => {
  const olderUnders = Array.from({length:40},(_,i)=>({totals:Array(9).fill(0),gamePk:i}));
  const recentOvers = Array.from({length:20},(_,i)=>({totals:Array(9).fill(1),gamePk:40+i}));
  const rows = matchupInnings([...olderUnders,...recentOvers],[...olderUnders,...recentOvers]);
  assert.equal(rows[0].combinedSampleSize,120);
  assert.ok(rows[0].predictedUnder < 2/3);
});
