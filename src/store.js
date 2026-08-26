const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const ledgerPath = path.join(dataDir, 'paper-bets.json');

function readLedger() {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function savePaperBet(bet) {
  fs.mkdirSync(dataDir, { recursive: true });
  const ledger = readLedger();
  const saved = { ...bet, ledgerId: crypto.randomUUID(), status: 'OPEN', recordedAt: new Date().toISOString() };
  ledger.push(saved);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return saved;
}

module.exports = { readLedger, savePaperBet };
