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
    <div class="pitchers">${pitcher(game.awayPitcherPhoto, game.awayPitcher, game.awayTeam)}<span class="versus">VS</span>${pitcher(game.homePitcherPhoto, game.homePitcher, game.homeTeam)}</div></div>
    <div class="legend"><span><i class="cell under-hit"></i>Under .5</span><span><i class="cell scored"></i>Run scored</span></div></div>
    ${oddsPanel(game)}
    <div class="rhythm-table">
      <div class="rhythm-head"><b>INN</b><span>60-GAME UNDER RHYTHM — AWAY / HOME</span><b>PROJECTED UNDER</b></div>
      ${game.innings.map(row => `<div class="rhythm-row">
        <strong>${row.inning}</strong><div class="team-strips">
          <div class="strip-line"><label>${escapeHtml(game.awayTeam || 'Away')} · L10 ${pct(row.awayUnderLast10)} · streak ${row.awayUnderStreak}</label><div class="strip">${patternCells(row.awayUnderPattern)}</div></div>
          <div class="strip-line"><label>${escapeHtml(game.homeTeam || 'Home')} · L10 ${pct(row.homeUnderLast10)} · streak ${row.homeUnderStreak}</label><div class="strip">${patternCells(row.homeUnderPattern)}</div></div>
        </div><div class="projection ${row.predictedUnder >= .6 ? 'strong-under' : ''}"><strong>${pct(row.predictedUnder)}</strong><span>${row.combinedUnderCount}/${row.combinedSampleSize} under</span></div>
      </div>`).join('')}
    </div></article>`).join('') : '<div class="empty">No inning-level history is available from the current provider.</div>';
}

function pitcher(photo, name, team) {
  const image = photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" loading="lazy">` : '<span class="photo-placeholder">?</span>';
  return `<div class="pitcher">${image}<div><strong>${escapeHtml(name || 'TBD')}</strong><small>${escapeHtml(team || '')}</small></div></div>`;
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
    const live = await (await fetch('/api/live?gamePk=824234&inning=3', {cache:'no-store'})).json();
    if (live.error) throw new Error(live.error);
    const bases = `${live.onFirst ? '●' : '○'} ${live.onSecond ? '●' : '○'} ${live.onThird ? '●' : '○'}`;
    document.querySelector('#liveMonitor').innerHTML = `<div class="live-top"><div><span class="live-dot"></span><b>LIVE · 3RD INNING UNDER 0.5</b><h2>${escapeHtml(live.awayTeam)} ${live.awayScore} — ${live.homeScore} ${escapeHtml(live.homeTeam)}</h2><p>${escapeHtml(live.half || '')} ${live.inningOrdinal || live.inning} · ${live.outs} out${live.outs === 1 ? '' : 's'} · Count ${live.balls}-${live.strikes} · Bases ${bases}</p></div><strong class="bet-status ${live.status.toLowerCase()}">${live.status}</strong></div>
      <div class="live-details"><div class="live-pitcher">${live.pitcherPhoto ? `<img src="${escapeHtml(live.pitcherPhoto)}" alt="${escapeHtml(live.pitcher)}">` : ''}<div><small>ON THE MOUND</small><strong>${escapeHtml(live.pitcher)}</strong><span>${live.pitchCount === null ? 'Pitch count unavailable' : `${live.pitchCount} pitches`}</span></div></div><div><small>AT BAT</small><strong>${escapeHtml(live.batter)}</strong></div><div><small>3RD-INNING RUNS</small><strong>${live.trackedRuns}</strong></div></div>
      <p class="last-play">${escapeHtml(live.lastPlay || 'Waiting for the next pitch…')}</p>`;
  } catch (error) {
    document.querySelector('#liveMonitor').innerHTML = `<div class="live-loading">Live feed unavailable: ${escapeHtml(error.message)}</div>`;
  }
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
setInterval(loadLive, 10000);
