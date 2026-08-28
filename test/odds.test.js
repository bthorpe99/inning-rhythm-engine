const test = require('node:test');
const assert = require('node:assert/strict');
const { marketOutcomes, parseActionOdds } = require('../src/odds');

test('selects a market and preserves bookmaker attribution', () => {
  const books = [{ title:'Example', markets:[{ key:'totals', last_update:'now', outcomes:[{name:'Over',price:-110,point:8.5}] }] }];
  const market = marketOutcomes(books, 'totals');
  assert.equal(market.book, 'Example');
  assert.equal(market.outcomes[0].point, 8.5);
});

test('parses no-key public moneyline, total, and first-inning odds', () => {
  const byMatchup = parseActionOdds({games:[{
    id:1,away_team_id:10,home_team_id:20,start_time:'now',
    teams:[{id:10,full_name:'Away Club'},{id:20,full_name:'Home Club'}],
    boxscore:{latest_odds:{game:{ml_away:120,ml_home:-135,total:8.5,over:-110,under:-110},firstinning:{total:.5,over:-125,under:105}}},
    odds:[{inserted:'updated'}]
  }]});
  const odds=byMatchup.get('awayclub|homeclub');
  assert.equal(odds.moneyline.outcomes[0].price,120);
  assert.equal(odds.total.outcomes[1].point,8.5);
  assert.equal(odds.firstInningTotal.outcomes[1].price,105);
});
