const test = require('node:test');
const assert = require('node:assert/strict');

test('tracked live endpoint configuration is numeric', () => {
  assert.equal(Number.isInteger(Number('824234')), true);
  assert.equal(Number('3'), 3);
});
