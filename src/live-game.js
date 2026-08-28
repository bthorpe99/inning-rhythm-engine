const { loadPitcherRankings } = require('./pitcher-rankings');

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
  const battingSide = linescore.isTopInning ? 'away' : 'home';
  const battingTeam = feed.liveData?.boxscore?.teams?.[battingSide] || {};
  const battingOrder = battingTeam.battingOrder || [];
  const batterId = Number(matchup.batter?.id);
  const currentOrderIndex = battingOrder.findIndex(id=>Number(id)===batterId);
  const lineupVerified = currentOrderIndex >= 0;
  const dueIds = lineupVerified
    ? Array.from({length:Math.min(4,battingOrder.length)},(_,offset)=>Number(battingOrder[(currentOrderIndex+offset)%battingOrder.length]))
    : [batterId,...battingOrder.map(Number).filter(id=>id!==batterId)].filter(Number.isFinite).slice(0,4);
  const dueUp = dueIds.map((id,offset)=>{
    const player=battingTeam.players?.[`ID${id}`] || {};
    const batting=player.seasonStats?.batting || {};
    return { id,name:player.person?.fullName || (id===batterId?matchup.batter?.fullName:null) || 'TBD',current:offset===0,ops:Number.isFinite(Number(batting.ops))?Number(batting.ops):null,homeRuns:Number.isFinite(Number(batting.homeRuns))?Number(batting.homeRuns):null,avg:Number.isFinite(Number(batting.avg))?Number(batting.avg):null };
  });
  const lineupOpsValues=dueUp.map(row=>row.ops).filter(Number.isFinite);
  const lineupOps=lineupOpsValues.length?lineupOpsValues.reduce((sum,value)=>sum+value,0)/lineupOpsValues.length:null;
  const season = Number(feed.gameData?.datetime?.officialDate?.slice(0,4)) || new Date().getUTCFullYear();
  const leagueRanks = await loadPitcherRankings(season);
  const pitcherLeagueRanking = leagueRanks.rankings.get(Number(pitcherId)) || null;
  const status = trackedRuns > 0 ? 'LOST' : thirdComplete ? 'WON' : 'PENDING';
  const inningResults = (linescore.innings || []).map(row => {
    const awayRecorded = Number.isFinite(row.away?.runs);
    const homeRecorded = Number.isFinite(row.home?.runs);
    const runs = (row.away?.runs || 0) + (row.home?.runs || 0);
    const complete = row.num < linescore.currentInning || (row.num === linescore.currentInning && linescore.inningState === 'End');
    return { inning:row.num, runs, complete:complete && awayRecorded && homeRecorded, awayRecorded, homeRecorded };
  });

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
    pitcherLeagueRanking,
    batter: matchup.batter?.fullName || 'TBD',
    dueUp,
    lineupOps,
    lineupVerified,
    lineupSource:'MLB live box score batting order',
    onFirst: Boolean(linescore.offense?.first),
    onSecond: Boolean(linescore.offense?.second),
    onThird: Boolean(linescore.offense?.third),
    lastPlay: play.result?.description || play.playEvents?.at(-1)?.details?.description || '',
    inningResults,
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
  const lineupFactor = Number.isFinite(game.lineupOps) ? Math.max(.88,Math.min(1.12,1-(game.lineupOps-.72)*.35)) : 1;
  const remainingHalfUnder = Math.pow(currentHalf, remainingOuts / 3) * basePenalty * lineupFactor;
  const noMoreRuns = Math.max(0, Math.min(1, game.half === 'Top' ? remainingHalfUnder * halfBaseline : remainingHalfUnder));
  const liveUnder05 = game.trackedRuns > 0 ? 0 : noMoreRuns;
  const remainingLambda = -Math.log(Math.max(.001, noMoreRuns));
  const liveUnder15 = game.trackedRuns === 1 ? noMoreRuns : Math.min(.999, noMoreRuns * (1 + remainingLambda));
  return { pregameUnder, liveUnder: liveUnder05, liveUnder05, liveUnder15, change: liveUnder05 - pregameUnder, lineupFactor, lineupOps:game.lineupOps ?? null };
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
    const inningResults = (game.linescore?.innings || []).map(row => ({
      inning:row.num,
      runs:(row.away?.runs || 0)+(row.home?.runs || 0),
      complete:Number.isFinite(row.away?.runs) && Number.isFinite(row.home?.runs)
    }));
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
      homePitcher: game.teams?.home?.probablePitcher?.fullName || 'TBD',
      inningResults
    };
  }));
}

module.exports = { loadLiveGame, loadLiveSlate, liveUnderProjection, dateInCentral };
