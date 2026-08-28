const test = require('node:test');
const assert = require('node:assert/strict');
const { rankPitchers } = require('../src/pitcher-rankings');

test('ranks established MLB pitchers by lowest ERA', () => {
  const result = rankPitchers([
    { player:{id:2}, stat:{era:'3.10',inningsPitched:'40.0'} },
    { player:{id:1}, stat:{era:'2.25',inningsPitched:'25.1'} },
    { player:{id:3}, stat:{era:'4.00',inningsPitched:'100.0'} },
    { player:{id:4}, stat:{era:'0.00',inningsPitched:'0.2'} }
  ]);
  assert.equal(result.rankings.get(1).rank, 1);
  assert.equal(result.rankings.get(2).rank, 2);
  assert.equal(result.rankings.get(3).total, 3);
  assert.equal(result.rankings.has(4), false);
});
