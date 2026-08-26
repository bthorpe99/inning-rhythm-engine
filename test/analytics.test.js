const test = require('node:test');
const assert = require('node:assert/strict');
const { rollingBacktest, qualityFor, analytics } = require('../src/analytics');

test('rolling backtest never uses the evaluated outcome', () => {
  const pattern = [0,0,0,1];
  const rows = rollingBacktest(pattern,3);
  assert.equal(rows.length,1);
  assert.equal(rows[0].probability,0);
  assert.equal(rows[0].outcome,1);
});

test('missing sources visibly reduce confidence', () => {
  const quality = qualityFor({odds:null,awayPitcherProfile:null,homePitcherProfile:null},{inning:1,pitcherAdjusted:false});
  assert.equal(quality.confidence,'LOW');
  assert.ok(quality.flags.includes('NO_LIVE_ODDS'));
});

test('analytics returns calibration evidence and signals', () => {
  const inning={inning:1,predictedUnder:.6,combinedSampleSize:120,pitcherAdjusted:true,awayUnderPattern:Array(60).fill(1),homeUnderPattern:Array(60).fill(0)};
  const result=analytics([{id:'g',event:'A at B',innings:[inning],odds:null,awayPitcherProfile:{},homePitcherProfile:{}}]);
  assert.equal(result.signals.length,1);
  assert.ok(result.calibration.samples>0);
});
