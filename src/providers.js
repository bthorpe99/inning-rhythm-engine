const samples = require('./sample-data');
const { loadMlbMatchups } = require('./mlb-history');
const { fetchOdds, attachOdds } = require('./odds');

async function loadCandidates() {
  try {
    const [games, oddsResult] = await Promise.all([loadMlbMatchups(), fetchOdds()]);
    const candidates = attachOdds(games, oddsResult);
    if (!candidates.length) throw new Error('No upcoming MLB games were returned');
    const oddsNote = oddsResult.status === 'LIVE' ? 'Live sportsbook prices connected.' : oddsResult.status === 'FREE_PUBLIC' ? 'No-key public odds connected through Action Network.' : 'Odds are temporarily unavailable.';
    return { mode: 'LIVE MLB HISTORY', note: `Schedules, pitchers, and inning results loaded from MLB. ${oddsNote}`, candidates };
  } catch (error) {
    return { mode: 'SAMPLE FALLBACK', note: `Live MLB load failed: ${error.message}`, candidates: samples.filter(x => x.sport === 'MLB') };
  }
}

module.exports = { loadCandidates };
