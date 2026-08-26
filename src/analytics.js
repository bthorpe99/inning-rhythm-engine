const fs = require('node:fs');
const path = require('node:path');

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
  return { generatedAt:new Date().toISOString(), calibration:calibration(candidates), signals };
}

function readLedger() { try { return JSON.parse(fs.readFileSync(ledgerPath,'utf8')); } catch (error) { if (error.code==='ENOENT') return []; throw error; } }
function recordPrediction(row) {
  const ledger = readLedger();
  if (ledger.some(item => item.idempotencyKey === row.idempotencyKey)) return false;
  fs.mkdirSync(path.dirname(ledgerPath),{recursive:true});
  ledger.push({...row,recordedAt:new Date().toISOString()});
  fs.writeFileSync(ledgerPath,JSON.stringify(ledger.slice(-5000),null,2));
  return true;
}

module.exports = { qualityFor, rollingBacktest, calibration, analytics, recordPrediction, readLedger, clamp };
