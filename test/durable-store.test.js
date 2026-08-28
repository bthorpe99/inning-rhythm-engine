const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseRow } = require('../src/durable-store');

test('maps a prediction into the durable database record', () => {
  const row=databaseRow({idempotencyKey:'pregame:1:3',gamePk:1,inning:3,phase:'PREGAME',status:'WON',recordedAt:'2026-01-01T00:00:00Z'});
  assert.equal(row.idempotency_key,'pregame:1:3');
  assert.equal(row.game_pk,1);
  assert.equal(row.record.idempotencyKey,'pregame:1:3');
});
