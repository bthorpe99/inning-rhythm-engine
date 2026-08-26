let state = { candidates: [] };
const pct = value => `${(value * 100).toFixed(1)}%`;
const money = value => value > 0 ? `+${value}` : String(value);
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

async function load(refresh = false) {
  const response = await fetch(refresh ? '/api/refresh' : '/api/signals', { method: refresh ? 'POST' : 'GET' });
  state = await response.json(); render();
}

function render() {
  document.querySelector('#mode').textContent = state.mode;
  document.querySelector('#signalCount').textContent = state.candidates.length;
  document.querySelector('#warning').textContent = state.note || state.error || 'Loading MLB history.';
  renderUnderBoard();
  renderInningCharts();
}

function renderUnderBoard() {
  const ranked = state.candidates.flatMap(game => (game.innings || []).map(row => ({game,row})))
    .sort((a,b) => b.row.predictedUnder - a.row.predictedUnder).slice(0,12);
  document.querySelector('#underBoard').innerHTML = ranked.map(({game,row}, index) => `<article class="under-rank">
    <span class="rank">${index + 1}</span><div><strong>${escapeHtml(game.event)}</strong><small>Inning ${row.inning} · streaks ${row.awayUnderStreak}/${row.homeUnderStreak}</small></div>
    <b>${pct(row.predictedUnder)}</b><small>${row.combinedUnderCount}/${row.combinedSampleSize} under</small>
  </article>`).join('');
}

function renderInningCharts() {
  const games = state.candidates.filter(item => item.sport === 'MLB' && Array.isArray(item.innings));
  document.querySelector('#inningCharts').innerHTML = games.length ? games.map(game => `<article class="game-chart">
    <div class="chart-top"><div><span class="tag">${escapeHtml(game.source)}</span><h3>${escapeHtml(game.event)}</h3>
    <div class="pitchers">${pitcher(game.awayPitcherPhoto, game.awayPitcher, game.awayTeam, game.awayPitcherProfile)}<span class="versus">VS</span>${pitcher(game.homePitcherPhoto, game.homePitcher, game.homeTeam, game.homePitcherProfile)}</div></div>
    <div class="legend"><span><i class="cell under-hit"></i>Under .5</span><span><i class="cell scored"></i>Run scored</span></div></div>
    ${oddsPanel(game)}
    <div class="rhythm-table">
      <div class="rhythm-head"><b>INN</b><span>60-GAME UNDER RHYTHM — AWAY / HOME</span><b>PROJECTED UNDER</b></div>
      ${game.innings.map(row => `<div class="rhythm-row">
        <strong>${row.inning}</strong><div class="team-strips">
          <div class="strip-line"><label>${escapeHtml(game.awayTeam || 'Away')} · L10 ${pct(row.awayUnderLast10)} · streak ${row.awayUnderStreak}</label><div class="strip">${patternCells(row.awayUnderPattern)}</div></div>
          <div class="strip-line"><label>${escapeHtml(game.homeTeam || 'Home')} · L10 ${pct(row.homeUnderLast10)} · streak ${row.homeUnderStreak}</label><div class="strip">${patternCells(row.homeUnderPattern)}</div></div>
        </div><div class="projection ${row.predictedUnder >= .6 ? 'strong-under' : ''}"><strong>${pct(row.predictedUnder)}</strong><span>${row.combinedUnderCount}/${row.combinedSampleSize} under</span>${row.pitcherAdjusted ? `<em>Pitcher adjusted ${Math.round(row.pitcherWeight*100)}%</em>` : ''}</div>
      </div>`).join('')}
    </div></article>`).join('') : '<div class="empty">No inning-level history is available from the current provider.</div>';
}

function pitcher(photo, name, team, profile) {
  const image = photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" loading="lazy">` : '<span class="photo-placeholder">?</span>';
  const stats = profile ? `ERA ${profile.era.toFixed(2)} · WHIP ${profile.whip.toFixed(2)} · ${profile.inningsPitched} IP` : 'Pitcher stats unavailable';
  return `<div class="pitcher">${image}<div><strong>${escapeHtml(name || 'TBD')}</strong><small>${escapeHtml(team || '')}</small><small class="pitcher-stats">${escapeHtml(stats)}</small></div></div>`;
}

function oddsPanel(game) {
  if (!game.odds) return `<div class="odds-panel unavailable"><b>ODDS</b><span>${game.oddsStatus === 'KEY_REQUIRED' ? 'Connect ODDS_API_KEY for live moneyline, total, and first-inning prices.' : 'No matching market returned.'}</span></div>`;
  return `<div class="odds-panel"><b>LIVE ODDS</b>${marketBox('Moneyline', game.odds.moneyline)}${marketBox('Game total', game.odds.total)}${marketBox('1st inning O/U', game.odds.firstInningTotal)}</div>`;
}

function marketBox(label, market) {
  if (!market) return `<div class="market"><small>${escapeHtml(label)}</small><span>Not offered</span></div>`;
  return `<div class="market"><small>${escapeHtml(label)} · ${escapeHtml(market.book)}</small><span>${market.outcomes.map(outcome => `${escapeHtml(outcome.name)}${outcome.point !== undefined ? ` ${outcome.point}` : ''} <strong>${money(outcome.price)}</strong>`).join(' · ')}</span></div>`;
}

function patternCells(pattern = []) {
  return pattern.map((under, index) => `<i class="cell ${under ? 'under-hit' : 'scored'}" title="Game ${index + 1}: ${under ? 'under 0.5 — scoreless' : 'run scored'}"></i>`).join('');
}

async function loadLive() {
  try {
    const games = await (await fetch('/api/live-slate', {cache:'no-store'})).json();
    if (!Array.isArray(games)) throw new Error(games.error || 'Invalid live slate');
    const order = {LIVE:0,UPCOMING:1,FINAL:2};
    const ordered = games.sort((a,b) => order[a.kind] - order[b.kind]);
    document.querySelector('#liveMonitor').innerHTML = ordered.map(liveCard).join('');
  } catch (error) {
    document.querySelector('#liveMonitor').innerHTML = `<div class="live-loading">Live feed unavailable: ${escapeHtml(error.message)}</div>`;
  }
}

function liveCard(game) {
  if (game.kind !== 'LIVE') {
    const time = game.startsAt ? new Date(game.startsAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : game.detailedState;
    return `<article class="slate-card upcoming"><span class="slate-kind">${escapeHtml(game.kind)}</span><h3>${escapeHtml(game.awayTeam)} at ${escapeHtml(game.homeTeam)}</h3><strong>${escapeHtml(time || '')}</strong><p>${escapeHtml(game.awayPitcher || 'TBD')} vs ${escapeHtml(game.homePitcher || 'TBD')}</p></article>`;
  }
  const bases = `${game.onFirst ? '●' : '○'} ${game.onSecond ? '●' : '○'} ${game.onThird ? '●' : '○'}`;
  const projection = game.projection ? `<div class="live-projection"><small>LIVE UNDER PROJECTION</small><strong>${pct(game.projection.liveUnder)}</strong><span class="${game.projection.change >= 0 ? 'up' : 'down'}">${game.projection.change >= 0 ? '▲' : '▼'} ${Math.abs(game.projection.change * 100).toFixed(1)} pts from ${pct(game.projection.pregameUnder)}</span></div>` : '<div class="live-projection"><small>LIVE UNDER PROJECTION</small><strong>—</strong></div>';
  return `<article class="slate-card live"><div class="slate-card-top"><span><i class="live-dot"></i>LIVE · INNING ${game.trackedInning} UNDER .5</span><strong class="bet-status ${game.status.toLowerCase()}">${game.status}</strong></div><h3>${escapeHtml(game.awayTeam)} ${game.awayScore} — ${game.homeScore} ${escapeHtml(game.homeTeam)}</h3><p>${escapeHtml(game.half || '')} ${game.inningOrdinal || game.inning} · ${game.outs} outs · ${game.balls}-${game.strikes} · ${bases}</p>${projection}<div class="slate-pitcher">${game.pitcherPhoto ? `<img src="${escapeHtml(game.pitcherPhoto)}" alt="${escapeHtml(game.pitcher)}">` : ''}<div><small>ON THE MOUND</small><strong>${escapeHtml(game.pitcher)}</strong><span>${game.pitchCount ?? '—'} pitches · ERA ${game.pitcherEra ?? '—'} · vs ${escapeHtml(game.batter)}</span></div><b>${game.trackedRuns} RUNS</b></div><small class="last-play">${escapeHtml(game.lastPlay || 'Waiting for next pitch…')}</small></article>`;
}

async function paperBet(candidateId) {
  const response = await fetch('/api/paper-bets', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({candidateId}) });
  if (!response.ok) alert((await response.json()).error); else loadLedger();
}

async function loadLedger() {
  const rows = await (await fetch('/api/paper-bets')).json();
  document.querySelector('#ledgerCount').textContent = `${rows.length} recorded`;
  document.querySelector('#ledger').innerHTML = rows.length ? rows.slice().reverse().map(x => `<article class="ledger-row"><strong>${escapeHtml(x.selection)}</strong><span>${money(x.price)}</span><span>${pct(x.edge)} edge</span><span>${escapeHtml(x.status)}</span></article>`).join('') : '<div class="empty">No paper bets recorded yet.</div>';
}

document.querySelector('#refresh').onclick = () => load(true);
load();
loadLive();
setInterval(loadLive, 15000);
