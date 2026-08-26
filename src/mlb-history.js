const MLB_API = 'https://statsapi.mlb.com/api/v1';

function isoDate(date) { return date.toISOString().slice(0, 10); }

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'EdgeMonitor/0.2 research dashboard' } });
  if (!response.ok) throw new Error(`MLB Stats API returned ${response.status}`);
  return response.json();
}

function scheduleGames(payload) {
  return (payload.dates || []).flatMap(day => day.games || []);
}

function completed(game) {
  return game.status?.abstractGameState === 'Final' && Array.isArray(game.linescore?.innings);
}

function inningTotals(game) {
  const totals = Array(9).fill(0);
  for (const inning of game.linescore.innings || []) {
    if (inning.num >= 1 && inning.num <= 9) totals[inning.num - 1] = (inning.away?.runs || 0) + (inning.home?.runs || 0);
  }
  return totals;
}

function teamHistories(games, limit = 60) {
  const byTeam = new Map();
  for (const game of games.filter(completed).sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate))) {
    const record = { gamePk: game.gamePk, date: game.officialDate, totals: inningTotals(game) };
    for (const side of ['away', 'home']) {
      const team = game.teams[side].team;
      if (!byTeam.has(team.id)) byTeam.set(team.id, []);
      byTeam.get(team.id).push(record);
    }
  }
  for (const [id, rows] of byTeam) byTeam.set(id, rows.slice(-limit));
  return byTeam;
}

function overRate(history, inning, count = 60) {
  const rows = history.slice(-count);
  if (!rows.length) return 0;
  return rows.filter(game => game.totals[inning - 1] > 0).length / rows.length;
}

function underStreak(history, inning) {
  let streak = 0;
  for (let index = history.length - 1; index >= 0 && history[index].totals[inning - 1] === 0; index--) streak++;
  return streak;
}

function matchupInnings(awayHistory, homeHistory) {
  return Array.from({ length: 9 }, (_, index) => {
    const inning = index + 1;
    const away60 = overRate(awayHistory, inning, 60);
    const home60 = overRate(homeHistory, inning, 60);
    const away20 = overRate(awayHistory, inning, 20);
    const home20 = overRate(homeHistory, inning, 20);
    const longRate = (away60 + home60) / 2;
    const recentRate = (away20 + home20) / 2;
    const predictedOver = Math.max(.05, Math.min(.95, .55 * longRate + .45 * recentRate));
    const awayUnderCount = awayHistory.filter(g => g.totals[index] === 0).length;
    const homeUnderCount = homeHistory.filter(g => g.totals[index] === 0).length;
    return {
      inning,
      predictedUnder: 1 - predictedOver,
      combinedUnderCount: awayUnderCount + homeUnderCount,
      combinedSampleSize: awayHistory.length + homeHistory.length,
      awayUnderPattern: awayHistory.map(g => g.totals[index] === 0 ? 1 : 0),
      homeUnderPattern: homeHistory.map(g => g.totals[index] === 0 ? 1 : 0),
      awayUnderLast10: 1 - overRate(awayHistory, inning, 10),
      homeUnderLast10: 1 - overRate(homeHistory, inning, 10),
      awayUnderStreak: underStreak(awayHistory, inning),
      homeUnderStreak: underStreak(homeHistory, inning)
    };
  });
}

async function loadPitcherProfile(personId, season) {
  if (!personId) return null;
  try {
    const payload = await fetchJson(`${MLB_API}/people/${personId}/stats?stats=season&group=pitching&season=${season}`);
    const stat = payload.stats?.[0]?.splits?.[0]?.stat;
    if (!stat) return null;
    return { id: personId, era: Number(stat.era), whip: Number(stat.whip), inningsPitched: Number(stat.inningsPitched), gamesStarted: Number(stat.gamesStarted) };
  } catch { return null; }
}

function applyPitcherAdjustment(innings, awayPitcher, homePitcher) {
  const valid = [awayPitcher?.era, homePitcher?.era].every(Number.isFinite);
  if (!valid) return innings.map(row => ({ ...row, pitcherAdjusted: false }));
  const pitcherUnder = Math.exp(-(awayPitcher.era + homePitcher.era) / 9);
  return innings.map(row => {
    const weight = row.inning <= 5 ? .35 : row.inning === 6 ? .20 : 0;
    return {
      ...row,
      rawUnder: row.predictedUnder,
      predictedUnder: Math.max(.05, Math.min(.95, (1 - weight) * row.predictedUnder + weight * pitcherUnder)),
      pitcherUnder,
      pitcherWeight: weight,
      pitcherAdjusted: weight > 0
    };
  });
}

async function loadMlbMatchups() {
  const asOf = process.env.AS_OF_DATE ? new Date(`${process.env.AS_OF_DATE}T12:00:00Z`) : new Date();
  const end = new Date(asOf); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(asOf); start.setUTCDate(start.getUTCDate() - 190);
  const upcomingEnd = new Date(asOf); upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 2);

  const upcomingUrl = `${MLB_API}/schedule?sportId=1&startDate=${isoDate(asOf)}&endDate=${isoDate(upcomingEnd)}&gameTypes=R&hydrate=team,probablePitcher`;
  const historyUrl = `${MLB_API}/schedule?sportId=1&startDate=${isoDate(start)}&endDate=${isoDate(end)}&gameTypes=R&hydrate=team,linescore`;
  const [upcomingPayload, historyPayload] = await Promise.all([fetchJson(upcomingUrl), fetchJson(historyUrl)]);
  const upcoming = scheduleGames(upcomingPayload);
  const firstDate = upcoming[0]?.officialDate;
  const slate = upcoming.filter(game => game.officialDate === firstDate);
  const histories = teamHistories(scheduleGames(historyPayload));
  const season = asOf.getUTCFullYear();
  const pitcherIds = [...new Set(slate.flatMap(game => [game.teams.away.probablePitcher?.id, game.teams.home.probablePitcher?.id]).filter(Boolean))];
  const pitcherPairs = await Promise.all(pitcherIds.map(async id => [id, await loadPitcherProfile(id, season)]));
  const pitcherProfiles = new Map(pitcherPairs);

  return slate.map(game => {
    const away = game.teams.away.team;
    const home = game.teams.home.team;
    const awayHistory = histories.get(away.id) || [];
    const homeHistory = histories.get(home.id) || [];
    const awayPitcherProfile = pitcherProfiles.get(game.teams.away.probablePitcher?.id) || null;
    const homePitcherProfile = pitcherProfiles.get(game.teams.home.probablePitcher?.id) || null;
    return {
      id: `mlb-${game.gamePk}`, sport: 'MLB', market: 'INNING_RHYTHM',
      event: `${away.name} at ${home.name}`, selection: 'Inning over 0.5 run pattern',
      source: 'MLB Stats API', startsAt: game.gameDate,
      awayTeam: away.name, homeTeam: home.name,
      awayGames: awayHistory.length, homeGames: homeHistory.length,
      awayPitcher: game.teams.away.probablePitcher?.fullName || 'TBD',
      homePitcher: game.teams.home.probablePitcher?.fullName || 'TBD',
      awayPitcherId: game.teams.away.probablePitcher?.id || null,
      homePitcherId: game.teams.home.probablePitcher?.id || null,
      awayPitcherProfile,
      homePitcherProfile,
      awayPitcherPhoto: game.teams.away.probablePitcher?.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/${game.teams.away.probablePitcher.id}/headshot/67/current` : null,
      homePitcherPhoto: game.teams.home.probablePitcher?.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/${game.teams.home.probablePitcher.id}/headshot/67/current` : null,
      innings: applyPitcherAdjustment(matchupInnings(awayHistory, homeHistory), awayPitcherProfile, homePitcherProfile)
    };
  });
}

module.exports = { loadMlbMatchups, inningTotals, teamHistories, matchupInnings, applyPitcherAdjustment };
