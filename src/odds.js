function normalize(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function marketOutcomes(bookmakers, key) {
  for (const book of bookmakers || []) {
    const market = book.markets?.find(item => item.key === key);
    if (market) return { book: book.title, updatedAt: market.last_update, outcomes: market.outcomes };
  }
  return null;
}

function centralDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const values = Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function actionMarket(book, line, type, awayTeam, homeTeam, updatedAt) {
  if (!line) return null;
  if (type === 'moneyline' && Number.isFinite(line.ml_away) && Number.isFinite(line.ml_home)) return {
    book, updatedAt, outcomes:[{name:awayTeam,price:line.ml_away},{name:homeTeam,price:line.ml_home}]
  };
  if (type === 'total' && Number.isFinite(line.total) && Number.isFinite(line.over) && Number.isFinite(line.under)) return {
    book, updatedAt, outcomes:[{name:'Over',point:line.total,price:line.over},{name:'Under',point:line.total,price:line.under}]
  };
  return null;
}

function parseActionOdds(payload) {
  const byMatchup = new Map();
  for (const game of payload.games || []) {
    const awayTeam = game.teams?.find(team=>team.id===game.away_team_id)?.full_name;
    const homeTeam = game.teams?.find(team=>team.id===game.home_team_id)?.full_name;
    if (!awayTeam || !homeTeam) continue;
    const latest = game.boxscore?.latest_odds || {};
    const updatedAt = game.odds?.[0]?.inserted || game.start_time;
    const book = 'Action Network public feed';
    byMatchup.set(`${normalize(awayTeam)}|${normalize(homeTeam)}`, {
      eventId:String(game.id), source:book,
      moneyline:actionMarket(book,latest.game,'moneyline',awayTeam,homeTeam,updatedAt),
      total:actionMarket(book,latest.game,'total',awayTeam,homeTeam,updatedAt),
      firstInningTotal:actionMarket(book,latest.firstinning,'total',awayTeam,homeTeam,updatedAt),
      runLine:latest.game && Number.isFinite(latest.game.spread_away_line) ? { book,updatedAt,outcomes:[
        {name:awayTeam,point:latest.game.spread_away,price:latest.game.spread_away_line},
        {name:homeTeam,point:latest.game.spread_home,price:latest.game.spread_home_line}
      ]} : null
    });
  }
  return byMatchup;
}

async function fetchFreeOdds() {
  const date = centralDate();
  const url = `https://api.actionnetwork.com/web/v1/scoreboard/mlb?period=game&bookIds=15,30,75&date=${date}`;
  const response = await fetch(url,{headers:{'user-agent':'Mozilla/5.0 inning-rhythm research dashboard'}});
  if (!response.ok) throw new Error(`Free odds feed returned ${response.status}`);
  return { status:'FREE_PUBLIC', byMatchup:parseActionOdds(await response.json()) };
}

async function fetchOdds() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return fetchFreeOdds();
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

module.exports = { fetchOdds, fetchFreeOdds, parseActionOdds, attachOdds, marketOutcomes };
