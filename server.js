const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { evaluateCandidate } = require('./src/engine');
const { loadCandidates } = require('./src/providers');
const { readLedger, savePaperBet } = require('./src/store');
const { loadLiveGame, loadLiveSlate } = require('./src/live-game');

loadEnv();
const port = Number(process.env.PORT || 8787);
const minEdge = Number(process.env.MIN_EDGE || 0.04);
let snapshot = { mode: 'LOADING', candidates: [], refreshedAt: null };

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0 && process.env[line.slice(0, index)] === undefined) process.env[line.slice(0, index)] = line.slice(index + 1);
  }
}

async function refresh() {
  try {
    const provider = await loadCandidates();
    snapshot = { ...provider, candidates: provider.candidates.map(c => c.market === 'INNING_RHYTHM' ? c : evaluateCandidate(c, minEdge)), refreshedAt: new Date().toISOString() };
  } catch (error) {
    snapshot = { ...snapshot, error: error.message, refreshedAt: new Date().toISOString() };
  }
  return snapshot;
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/signals') return json(res, 200, snapshot);
    if (req.method === 'GET' && url.pathname === '/api/live') {
      const gamePk = url.searchParams.get('gamePk') || process.env.TRACK_GAME_PK;
      const inning = Number(url.searchParams.get('inning') || process.env.TRACK_INNING || 3);
      if (!gamePk) return json(res, 400, { error: 'gamePk is required' });
      return json(res, 200, await loadLiveGame(gamePk, inning));
    }
    if (req.method === 'GET' && url.pathname === '/api/live-slate') return json(res, 200, await loadLiveSlate(url.searchParams.get('date') || undefined));
    if (req.method === 'POST' && url.pathname === '/api/refresh') return json(res, 200, await refresh());
    if (req.method === 'GET' && url.pathname === '/api/paper-bets') return json(res, 200, readLedger());
    if (req.method === 'POST' && url.pathname === '/api/paper-bets') {
      const body = await readBody(req);
      const candidate = snapshot.candidates.find(item => item.id === body.candidateId);
      if (!candidate) return json(res, 404, { error: 'Candidate not found' });
      return json(res, 201, savePaperBet(candidate));
    }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(__dirname, 'public', safePath);
    if (!filePath.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
    const type = filePath.endsWith('.css') ? 'text/css' : filePath.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) { json(res, 500, { error: error.message }); }
});

refresh().then(() => {
  server.listen(port, () => console.log(`Edge Monitor running at http://localhost:${port}`));
  const seconds = Number(process.env.POLL_SECONDS || 0);
  if (seconds >= 60) setInterval(refresh, seconds * 1000).unref();
});
