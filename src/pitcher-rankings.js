const MLB_API = 'https://statsapi.mlb.com/api/v1';
const CACHE_MS = 15 * 60 * 1000;
const MIN_INNINGS = 20;
let cache = { season:null, loadedAt:0, rankings:new Map(), total:0 };

function rankPitchers(splits = []) {
  const ordered = splits.filter(row => row.player?.id && Number.isFinite(Number(row.stat?.era)) && Number(row.stat?.inningsPitched) >= MIN_INNINGS)
    .sort((a,b) => Number(a.stat.era) - Number(b.stat.era));
  return {
    total:ordered.length,
    rankings:new Map(ordered.map((row,index) => [Number(row.player.id), {
      rank:index + 1, total:ordered.length, era:Number(row.stat.era), basis:`MLB ERA, ${MIN_INNINGS}+ IP`
    }]))
  };
}

async function loadPitcherRankings(season = new Date().getUTCFullYear()) {
  if (cache.season === season && Date.now() - cache.loadedAt < CACHE_MS) return cache;
  try {
    const params = new URLSearchParams({ stats:'season', group:'pitching', season:String(season), sportIds:'1', playerPool:'ALL', limit:'2000' });
    const response = await fetch(`${MLB_API}/stats?${params}`);
    if (!response.ok) throw new Error(`MLB rankings returned ${response.status}`);
    const payload = await response.json();
    cache = { season, loadedAt:Date.now(), ...rankPitchers(payload.stats?.[0]?.splits || []) };
  } catch {
    if (cache.season !== season) cache = { season, loadedAt:Date.now(), rankings:new Map(), total:0 };
  }
  return cache;
}

module.exports = { loadPitcherRankings, rankPitchers };
