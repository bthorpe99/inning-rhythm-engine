const test=require('node:test');
const assert=require('node:assert/strict');
const {lineupFromBoxTeam}=require('../src/live-game');

test('pregame lineup follows MLB batting order and player IDs',()=>{
  const rows=lineupFromBoxTeam({battingOrder:[2,1],players:{ID1:{person:{fullName:'Second',batSide:{code:'L'}},position:{abbreviation:'RF'},seasonStats:{batting:{ops:'.800',homeRuns:10}}},ID2:{person:{fullName:'First',batSide:{code:'R'}},position:{abbreviation:'SS'},seasonStats:{batting:{ops:'.750',homeRuns:5}}}}});
  assert.deepEqual(rows.map(row=>row.name),['First','Second']);
  assert.equal(rows[0].order,1);
  assert.match(rows[0].photo,/people\/2\/headshot/);
});
