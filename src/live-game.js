async function loadLiveGame(gamePk, trackedInning = 3) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
  if (!response.ok) throw new Error(`MLB live feed returned ${response.status}`);
  const feed = await response.json();
  const linescore = feed.liveData?.linescore || {};
  const play = feed.liveData?.plays?.currentPlay || {};
  const matchup = play.matchup || {};
  const defensivePitcher = linescore.defense?.pitcher;
  const matchupPitcher = matchup.pitcher;
  const activePitcher = defensivePitcher || matchupPitcher;
  const inning = (linescore.innings || []).find(row => row.num === trackedInning);
  const awayRuns = inning?.away?.runs ?? 0;
  const homeRuns = inning?.home?.runs ?? 0;
  const thirdComplete = linescore.currentInning > trackedInning ||
    (linescore.currentInning === trackedInning && linescore.inningState === 'End');
  const trackedRuns = awayRuns + homeRuns;
  const pitcherId = activePitcher?.id;
  const side = linescore.isTopInning ? 'home' : 'away';
  const pitcherBox = pitcherId ? feed.liveData?.boxscore?.teams?.[side]?.players?.[`ID${pitcherId}`] : null;
  const pitcherStats = pitcherBox?.stats?.pitching;
  const pitcherSeasonStats = pitcherBox?.seasonStats?.pitching;
  const status = trackedRuns > 0 ? 'LOST' : thirdComplete ? 'WON' : 'PENDING';

  return {
    gamePk: Number(gamePk), trackedInning, trackedRuns, status,
    detailedState: feed.gameData?.status?.detailedState || 'Unknown',
    awayTeam: feed.gameData?.teams?.away?.name,
    homeTeam: feed.gameData?.teams?.home?.name,
    awayScore: linescore.teams?.away?.runs ?? 0,
    homeScore: linescore.teams?.home?.runs ?? 0,
    inning: linescore.currentInning,
    inningOrdinal: linescore.currentInningOrdinal,
    half: linescore.inningHalf,
    outs: linescore.outs ?? 0,
    balls: play.count?.balls ?? 0,
    strikes: play.count?.strikes ?? 0,
    pitcher: activePitcher?.fullName || 'TBD',
    pitcherId: pitcherId || null,
    pitcherVerified: Boolean(defensivePitcher?.id),
    pitcherMismatch: Boolean(defensivePitcher?.id && matchupPitcher?.id && defensivePitcher.id !== matchupPitcher.id),
    pitcherSource: defensivePitcher ? 'MLB live defensive alignment' : matchupPitcher ? 'MLB current plate appearance' : 'unavailable',
    pitcherPhoto: pitcherId ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/${pitcherId}/headshot/67/current` : null,
    pitchCount: pitcherStats?.pitchesThrown ?? null,
    pitcherEra: Number.isFinite(Number(pitcherSeasonStats?.era)) ? Number(pitcherSeasonStats.era) : null,
    batter: matchup.batter?.fullName || 'TBD',
    onFirst: Boolean(linescore.offense?.first),
    onSecond: Boolean(linescore.offense?.second),
    onThird: Boolean(linescore.offense?.third),
    lastPlay: play.result?.description || play.playEvents?.at(-1)?.details?.description || '',
    updatedAt: new Date().toISOString()
  };
}

function liveUnderProjection(game, pregameUnder) {
  if (!Number.isFinite(pregameUnder)) return null;
  if (game.trackedRuns > 1) return { pregameUnder, liveUnder: 0, liveUnder05: 0, liveUnder15: 0, change: -pregameUnder };
  const halfBaseline = Math.sqrt(pregameUnder);
  const pitcherHalf = Number.isFinite(game.pitcherEra) ? Math.exp(-game.pitcherEra / 9) : halfBaseline;
  const currentHalf = .5 * halfBaseline + .5 * pitcherHalf;
  const remainingOuts = Math.max(0, 3 - game.outs);
  const basePenalty = Math.max(.15, 1 - (game.onFirst ? .12 : 0) - (game.onSecond ? .22 : 0) - (game.onThird ? .34 : 0));
  const remainingHalfUnder = Math.pow(currentHalf, remainingOuts / 3) * basePenalty;
  const noMoreRuns = Math.max(0, Math.min(1, game.half === 'Top' ? remainingHalfUnder * halfBaseline : remainingHalfUnder));
  const liveUnder05 = game.trackedRuns > 0 ? 0 : noMoreRuns;
  const remainingLambda = -Math.log(Math.max(.001, noMoreRuns));
  const liveUnder15 = game.trackedRuns === 1 ? noMoreRuns : Math.min(.999, noMoreRuns * (1 + remainingLambda));
  return { pregameUnder, liveUnder: liveUnder05, liveUnder05, liveUnder15, change: liveUnder05 - pregameUnder };
}

function dateInCentral(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function loadLiveSlate(date = dateInCentral(), projections = []) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameTypes=R&hydrate=team,probablePitcher,linescore`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MLB schedule returned ${response.status}`);
  const schedule = await response.json();
  const games = (schedule.dates || []).flatMap(day => day.games || []);
  return Promise.all(games.map(async game => {
    const state = game.status?.abstractGameState;
    if (state === 'Live') {
      const activeInning = Math.max(1, game.linescore?.currentInning || 1);
      const live = await loadLiveGame(game.gamePk, activeInning);
      const matchup = projections.find(item => item.id === `mlb-${game.gamePk}`);
      const pregameUnder = matchup?.innings?.find(row => row.inning === activeInning)?.predictedUnder;
      return { kind: 'LIVE', ...live, projection: liveUnderProjection(live, pregameUnder) };
    }
    return {
      kind: state === 'Preview' ? 'UPCOMING' : 'FINAL',
      gamePk: game.gamePk,
      detailedState: game.status?.detailedState,
      awayTeam: game.teams?.away?.team?.name,
      homeTeam: game.teams?.home?.team?.name,
      awayScore: game.teams?.away?.score ?? 0,
      homeScore: game.teams?.home?.score ?? 0,
      startsAt: game.gameDate,
      awayPitcher: game.teams?.away?.probablePitcher?.fullName || 'TBD',
      homePitcher: game.teams?.home?.probablePitcher?.fullName || 'TBD'
    };
  }));
}

module.exports = { loadLiveGame, loadLiveSlate, liveUnderProjection, dateInCentral };
