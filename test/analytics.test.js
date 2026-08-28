const test = require('node:test');
const assert = require('node:assert/strict');
const { rollingBacktest, qualityFor, analytics, performanceFromLedger } = require('../src/analytics');

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

test('recorded performance calculates settled win rate and brier score', () => {
  const result = performanceFromLedger([
    {inning:1,probability:.7,outcomeUnder05:1},
    {inning:1,probability:.6,outcomeUnder05:0},
    {inning:2,probability:.5,status:'OPEN'}
  ]);
  assert.equal(result.recorded,3);
  assert.equal(result.settled,2);
  assert.equal(result.winRate,.5);
  assert.equal(result.byInning[0].samples,2);
  assert.ok(Math.abs(result.brier-.225)<1e-9);
});

test('recorded performance grades under and over for both inning totals', () => {
  const result=performanceFromLedger([
    {probabilityUnder05:.7,probabilityUnder15:.9,outcomeUnder05:1,outcomeOver05:0,outcomeUnder15:1,outcomeOver15:0},
    {probabilityUnder05:.6,probabilityUnder15:.8,outcomeUnder05:0,outcomeOver05:1,outcomeUnder15:0,outcomeOver15:1}
  ]);
  assert.equal(result.markets.under05.wins,1);
  assert.equal(result.markets.over05.wins,1);
  assert.equal(result.markets.under15.losses,1);
  assert.equal(result.markets.over15.winRate,.5);
});
