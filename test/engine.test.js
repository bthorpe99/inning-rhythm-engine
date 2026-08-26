const test = require('node:test');
const assert = require('node:assert/strict');
const { americanToProbability, modelInterception, evaluateCandidate } = require('../src/engine');

test('converts American odds to break-even probability', () => {
  assert.equal(americanToProbability(100), 0.5);
  assert.equal(americanToProbability(-110).toFixed(4), '0.5238');
});

test('interception probability rises with projected attempts', () => {
  const base = { qbInterceptionRate:.025, opponentInterceptionRateAllowed:.025, opponentPressureRate:.22, badWeather:false };
  assert.ok(modelInterception({...base, projectedAttempts:40}) > modelInterception({...base, projectedAttempts:20}));
});

test('candidate is alerted only above configured edge', () => {
  const candidate = { market:'QB_TO_THROW_INTERCEPTION', price:100, features:{qbInterceptionRate:.03, opponentInterceptionRateAllowed:.03, projectedAttempts:30, opponentPressureRate:.22, badWeather:false} };
  const result = evaluateCandidate(candidate, .04);
  assert.equal(result.alert, result.edge >= .04);
});
