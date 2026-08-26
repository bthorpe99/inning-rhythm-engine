const test = require('node:test');
const assert = require('node:assert/strict');
const { marketOutcomes } = require('../src/odds');

test('selects a market and preserves bookmaker attribution', () => {
  const books = [{ title:'Example', markets:[{ key:'totals', last_update:'now', outcomes:[{name:'Over',price:-110,point:8.5}] }] }];
  const market = marketOutcomes(books, 'totals');
  assert.equal(market.book, 'Example');
  assert.equal(market.outcomes[0].point, 8.5);
});
