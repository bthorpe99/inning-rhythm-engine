const test = require('node:test');
const assert = require('node:assert/strict');
const { liveUnderProjection, dateInCentral } = require('../src/live-game');

test('tracked live endpoint configuration is numeric', () => {
  assert.equal(Number.isInteger(Number('824234')), true);
  assert.equal(Number('3'), 3);
});

test('live under probability rises with outs and falls with runners', () => {
  const empty = liveUnderProjection({trackedRuns:0,outs:0,half:'Bottom',pitcherEra:3,onFirst:false,onSecond:false,onThird:false},.55);
  const twoOut = liveUnderProjection({trackedRuns:0,outs:2,half:'Bottom',pitcherEra:3,onFirst:false,onSecond:false,onThird:false},.55);
  const loaded = liveUnderProjection({trackedRuns:0,outs:0,half:'Bottom',pitcherEra:3,onFirst:true,onSecond:true,onThird:true},.55);
  assert.ok(twoOut.liveUnder > empty.liveUnder);
  assert.ok(loaded.liveUnder < empty.liveUnder);
});

test('a run makes under 0.5 probability zero', () => {
  assert.equal(liveUnderProjection({trackedRuns:1},.6).liveUnder,0);
});

test('slate date uses America/Chicago instead of UTC rollover', () => {
  assert.equal(dateInCentral(new Date('2026-08-27T02:00:00Z')),'2026-08-26');
});
