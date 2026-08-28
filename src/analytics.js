const fs = require('node:fs');
const path = require('node:path');
const { mirrorPredictionRows, durableStorageStatus } = require('./durable-store');

const ledgerPath = path.join(__dirname, '..', 'data', 'prediction-ledger.json');

function clamp(value, min = .01, max = .99) { return Math.min(max, Math.max(min, value)); }

function qualityFor(game, inning) {
  const flags = [];
  if (!game.awayPitcherProfile || !game.homePitcherProfile) flags.push('UNCONFIRMED_OR_MISSING_STARTER_STATS');
  if (!game.odds) flags.push('NO_LIVE_ODDS');
  if (!inning.pitcherAdjusted && inning.inning <= 6) flags.push('NO_PITCHER_ADJUSTMENT');
  flags.push('WEATHER_NOT_CONNECTED');
  flags.push('CONFIRMED_LINEUP_MODEL_PENDING');
  const confidence = flags.length <= 2 ? 'HIGH' : flags.length <= 4 ? 'MEDIUM' : 'LOW';
  return { confidence, flags };
}

function rollingBacktest(pattern, window = 20) {
  const results = [];
  for (let index = window; index < pattern.length; index++) {
    const history = pattern.slice(index - window, index);
    const probability = history.reduce((sum, value) => sum + value, 0) / history.length;
    const outcome = pattern[index];
    results.push({ probability, outcome, brier: (probability - outcome) ** 2 });
  }
  return results;
}

function calibration(candidates) {
  const observations = [];
  for (const game of candidates) for (const inning of game.innings || []) {
    observations.push(...rollingBacktest(inning.awayUnderPattern || []), ...rollingBacktest(inning.homeUnderPattern || []));
  }
  const bins = Array.from({length:10},(_,index)=>({low:index/10,high:(index+1)/10,count:0,predicted:0,actual:0}));
  for (const row of observations) {
    const bin = bins[Math.min(9, Math.floor(row.probability * 10))];
    bin.count++; bin.predicted += row.probability; bin.actual += row.outcome;
  }
  for (const bin of bins) if (bin.count) { bin.predicted /= bin.count; bin.actual /= bin.count; }
  return {
    samples: observations.length,
    brier: observations.length ? observations.reduce((sum,row)=>sum+row.brier,0)/observations.length : null,
    bins
  };
}

function edgeFor(game, inning) {
  const market = game.odds?.firstInningTotal;
  if (inning.inning !== 1 || !market) return null;
  const under = market.outcomes?.find(outcome => String(outcome.name).toLowerCase() === 'under' && Number(outcome.point) === .5);
  if (!under) return null;
  const implied = under.price > 0 ? 100/(under.price+100) : -under.price/(-under.price+100);
  return { book:market.book, price:under.price, implied, model:inning.predictedUnder, edge:inning.predictedUnder-implied, updatedAt:market.updatedAt };
}

function analytics(candidates) {
  const signals = candidates.flatMap(game => (game.innings || []).map(inning => {
    const quality = qualityFor(game, inning);
    const edge = edgeFor(game, inning);
    return { gameId:game.id,event:game.event,inning:inning.inning,probability:inning.predictedUnder,sampleSize:inning.combinedSampleSize,quality,edge,alert:Boolean(edge && edge.edge >= .04 && quality.confidence !== 'LOW') };
  })).sort((a,b)=>b.probability-a.probability);
  return { generatedAt:new Date().toISOString(), calibration:calibration(candidates), recordedPerformance:performanceFromLedger(readLedger()), durableStorage:durableStorageStatus(), signals };
}

function readLedger() { try { return JSON.parse(fs.readFileSync(ledgerPath,'utf8')); } catch (error) { if (error.code==='ENOENT') return []; throw error; } }
function writeLedger(rows) {
  fs.mkdirSync(path.dirname(ledgerPath),{recursive:true});
  const temporary = `${ledgerPath}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify(rows.slice(-50000),null,2));
  fs.renameSync(temporary,ledgerPath);
}
function recordPrediction(row) {
  const ledger = readLedger();
  if (ledger.some(item => item.idempotencyKey === row.idempotencyKey)) return false;
  const saved = {...row,recordedAt:new Date().toISOString()};
  ledger.push(saved);
  writeLedger(ledger);
  void mirrorPredictionRows([saved]);
  return true;
}

function recordOddsSnapshots(candidates) {
  let added = 0;
  for (const game of candidates.filter(item=>item.odds)) {
    const gamePk = Number(String(game.id).replace('mlb-',''));
    const updatedAt = game.odds.moneyline?.updatedAt || game.odds.total?.updatedAt || new Date().toISOString().slice(0,16);
    const signature = Buffer.from(JSON.stringify(game.odds)).toString('base64url').slice(0,24);
    added += Number(recordPrediction({
      idempotencyKey:`odds:${gamePk}:${updatedAt}:${signature}`, phase:'ODDS', gamePk,
      event:game.event, startsAt:game.startsAt, providerStatus:game.oddsStatus,
      moneyline:game.odds.moneyline, gameTotal:game.odds.total,
      firstInningTotal:game.odds.firstInningTotal, runLine:game.odds.runLine,
      source:game.odds.source || game.odds.moneyline?.book, status:'RECORDED'
    }));
  }
  return added;
}

function recordPregamePredictions(candidates) {
  let added = 0;
  for (const game of candidates) for (const inning of game.innings || []) {
    const gamePk = Number(String(game.id).replace('mlb-',''));
    if (!Number.isFinite(gamePk)) continue;
    added += Number(recordPrediction({
      idempotencyKey:`pregame:${gamePk}:${inning.inning}`,
      phase:'PREGAME', gamePk, inning:inning.inning, event:game.event, startsAt:game.startsAt,
      probability:inning.predictedUnder, probabilityUnder05:inning.predictedUnder,
      probabilityOver05:1-inning.predictedUnder, probabilityUnder15:inning.predictedUnder15,
      probabilityOver15:1-inning.predictedUnder15, sampleSize:inning.combinedSampleSize,
      underCount:inning.combinedUnderCount, under15Count:inning.combinedUnder15Count,
      pitcherAdjusted:Boolean(inning.pitcherAdjusted), pitcherWeight:inning.pitcherWeight || 0,
      awayPitcher:game.awayPitcher, homePitcher:game.homePitcher,
      awayPitcherEra:game.awayPitcherProfile?.era ?? null, homePitcherEra:game.homePitcherProfile?.era ?? null,
      awayPitcherRank:game.awayPitcherProfile?.leagueRanking?.rank ?? null,
      homePitcherRank:game.homePitcherProfile?.leagueRanking?.rank ?? null,
      source:game.source, status:'OPEN'
    }));
  }
  return added;
}

function settlePredictions(slate) {
  const ledger = readLedger();
  let changed = 0;
  const changedRows = [];
  for (const row of ledger.filter(item => item.status === 'OPEN' || item.status === 'PENDING')) {
    const game = slate.find(item => Number(item.gamePk) === Number(row.gamePk));
    if (!game) continue;
    const result = (game.inningResults || []).find(item => Number(item.inning) === Number(row.inning));
    let status = null;
    if (result?.runs > 0) status = 'LOST';
    else if (result?.complete && result.runs === 0) status = 'WON';
    else if (game.kind === 'FINAL' && result && result.runs === 0) status = 'WON';
    else if (game.kind === 'FINAL') status = 'NO_ACTION';
    if (!status) continue;
    row.status = status;
    row.finalRuns = result?.runs ?? null;
    row.outcomeUnder05 = status === 'WON' ? 1 : status === 'LOST' ? 0 : null;
    row.outcomeOver05 = row.outcomeUnder05 === null ? null : 1 - row.outcomeUnder05;
    row.outcomeUnder15 = result ? Number(result.runs <= 1) : null;
    row.outcomeOver15 = result ? Number(result.runs > 1) : null;
    row.settledAt = new Date().toISOString();
    changedRows.push(row);
    changed++;
  }
  if (changed) {
    writeLedger(ledger);
    void mirrorPredictionRows(changedRows);
  }
  return changed;
}

function performanceFromLedger(ledger) {
  const evaluated = ledger.map(row => {
    if (!Number.isFinite(Number(row.finalRuns))) return row;
    const runs=Number(row.finalRuns);
    return { ...row,
      outcomeUnder05:row.outcomeUnder05 ?? Number(runs===0), outcomeOver05:row.outcomeOver05 ?? Number(runs>0),
      outcomeUnder15:row.outcomeUnder15 ?? Number(runs<=1), outcomeOver15:row.outcomeOver15 ?? Number(runs>1)
    };
  });
  const settled = evaluated.filter(row => row.outcomeUnder05 === 0 || row.outcomeUnder05 === 1);
  const won = settled.filter(row => row.outcomeUnder05 === 1).length;
  const brierRows = settled.filter(row => Number.isFinite(Number(row.probability)));
  const brier = brierRows.length ? brierRows.reduce((sum,row)=>sum+(Number(row.probability)-row.outcomeUnder05)**2,0)/brierRows.length : null;
  const byInning = Array.from({length:9},(_,index) => {
    const rows = settled.filter(row => Number(row.inning) === index + 1);
    return { inning:index+1, samples:rows.length, wins:rows.filter(row=>row.outcomeUnder05===1).length, winRate:rows.length ? rows.filter(row=>row.outcomeUnder05===1).length/rows.length : null };
  });
  const marketResult = (outcomeKey, probabilityKey, fallback) => {
    const rows=evaluated.filter(row=>row[outcomeKey]===0||row[outcomeKey]===1);
    const wins=rows.filter(row=>row[outcomeKey]===1).length;
    const probabilityFor=row=>row[probabilityKey] ?? (fallback ? fallback(row) : null);
    const scored=rows.filter(row=>probabilityFor(row)!==null&&Number.isFinite(Number(probabilityFor(row))));
    const marketBrier=scored.length?scored.reduce((sum,row)=>{
      const probability=Number(probabilityFor(row));
      return sum+(probability-row[outcomeKey])**2;
    },0)/scored.length:null;
    return { samples:rows.length,wins,losses:rows.length-wins,winRate:rows.length?wins/rows.length:null,brier:marketBrier };
  };
  const markets={
    under05:marketResult('outcomeUnder05','probabilityUnder05',row=>row.probability),
    over05:marketResult('outcomeOver05','probabilityOver05',row=>1-Number(row.probabilityUnder05??row.probability)),
    under15:marketResult('outcomeUnder15','probabilityUnder15'),
    over15:marketResult('outcomeOver15','probabilityOver15',row=>1-Number(row.probabilityUnder15))
  };
  return { recorded:ledger.length, settled:settled.length, won, lost:settled.length-won, winRate:settled.length?won/settled.length:null, brier, byInning, markets };
}

module.exports = { qualityFor, rollingBacktest, calibration, analytics, recordPrediction, recordPregamePredictions, recordOddsSnapshots, settlePredictions, performanceFromLedger, readLedger, clamp };
