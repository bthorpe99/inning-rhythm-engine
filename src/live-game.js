async function loadLiveGame(gamePk, trackedInning = 3) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
  if (!response.ok) throw new Error(`MLB live feed returned ${response.status}`);
  const feed = await response.json();
  const linescore = feed.liveData?.linescore || {};
  const play = feed.liveData?.plays?.currentPlay || {};
  const matchup = play.matchup || {};
  const inning = (linescore.innings || []).find(row => row.num === trackedInning);
  const awayRuns = inning?.away?.runs ?? 0;
  const homeRuns = inning?.home?.runs ?? 0;
  const thirdComplete = linescore.currentInning > trackedInning ||
    (linescore.currentInning === trackedInning && linescore.inningState === 'End');
  const trackedRuns = awayRuns + homeRuns;
  const pitcherId = matchup.pitcher?.id;
  const side = linescore.isTopInning ? 'home' : 'away';
  const pitcherStats = pitcherId ? feed.liveData?.boxscore?.teams?.[side]?.players?.[`ID${pitcherId}`]?.stats?.pitching : null;
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
    pitcher: matchup.pitcher?.fullName || 'TBD',
    pitcherId: pitcherId || null,
    pitcherPhoto: pitcherId ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_240,q_auto:best/v1/people/${pitcherId}/headshot/67/current` : null,
    pitchCount: pitcherStats?.pitchesThrown ?? null,
    batter: matchup.batter?.fullName || 'TBD',
    onFirst: Boolean(linescore.offense?.first),
    onSecond: Boolean(linescore.offense?.second),
    onThird: Boolean(linescore.offense?.third),
    lastPlay: play.result?.description || play.playEvents?.at(-1)?.details?.description || '',
    updatedAt: new Date().toISOString()
  };
}

async function loadLiveSlate(date = new Date().toISOString().slice(0, 10)) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameTypes=R&hydrate=team,probablePitcher,linescore`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MLB schedule returned ${response.status}`);
  const schedule = await response.json();
  const games = (schedule.dates || []).flatMap(day => day.games || []);
  return Promise.all(games.map(async game => {
    const state = game.status?.abstractGameState;
    if (state === 'Live') {
      const activeInning = Math.max(1, game.linescore?.currentInning || 1);
      return { kind: 'LIVE', ...(await loadLiveGame(game.gamePk, activeInning)) };
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

module.exports = { loadLiveGame, loadLiveSlate };
