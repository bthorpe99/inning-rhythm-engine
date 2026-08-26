function normalize(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function marketOutcomes(bookmakers, key) {
  for (const book of bookmakers || []) {
    const market = book.markets?.find(item => item.key === key);
    if (market) return { book: book.title, updatedAt: market.last_update, outcomes: market.outcomes };
  }
  return null;
}

async function fetchOdds() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { status: 'KEY_REQUIRED', byMatchup: new Map() };
  const regions = process.env.ODDS_REGIONS || 'us';
  const base = 'https://api.the-odds-api.com/v4/sports/baseball_mlb';
  const url = `${base}/odds?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(regions)}&markets=h2h,totals&oddsFormat=american`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Odds provider returned ${response.status}`);
  const events = await response.json();
  const byMatchup = new Map();

  for (const event of events) {
    const odds = {
      eventId: event.id,
      moneyline: marketOutcomes(event.bookmakers, 'h2h'),
      total: marketOutcomes(event.bookmakers, 'totals'),
      firstInningTotal: null
    };
    if ((process.env.INCLUDE_INNING_ODDS || 'true').toLowerCase() === 'true') {
      const eventUrl = `${base}/events/${event.id}/odds?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(regions)}&markets=totals_1st_1_innings&oddsFormat=american`;
      const eventResponse = await fetch(eventUrl);
      if (eventResponse.ok) {
        const detail = await eventResponse.json();
        odds.firstInningTotal = marketOutcomes(detail.bookmakers, 'totals_1st_1_innings');
      }
    }
    byMatchup.set(`${normalize(event.away_team)}|${normalize(event.home_team)}`, odds);
  }
  return { status: 'LIVE', byMatchup };
}

function attachOdds(games, oddsResult) {
  return games.map(game => ({
    ...game,
    oddsStatus: oddsResult.status,
    odds: oddsResult.byMatchup.get(`${normalize(game.awayTeam)}|${normalize(game.homeTeam)}`) || null
  }));
}

module.exports = { fetchOdds, attachOdds, marketOutcomes };
