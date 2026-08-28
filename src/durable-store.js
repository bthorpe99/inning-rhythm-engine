let lastError = null;
let lastSyncedAt = null;

function configuration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url:url.replace(/\/$/,''), key } : null;
}

function databaseRow(row) {
  return {
    idempotency_key:row.idempotencyKey,
    game_pk:Number.isFinite(Number(row.gamePk)) ? Number(row.gamePk) : null,
    inning:Number.isFinite(Number(row.inning)) ? Number(row.inning) : null,
    phase:row.phase || 'LIVE', status:row.status || null,
    recorded_at:row.recordedAt || new Date().toISOString(),
    settled_at:row.settledAt || null,
    record:row,
    updated_at:new Date().toISOString()
  };
}

async function mirrorPredictionRows(rows) {
  const config = configuration();
  if (!config || !rows.length) return false;
  try {
    const response = await fetch(`${config.url}/rest/v1/prediction_records?on_conflict=idempotency_key`,{
      method:'POST',
      headers:{ apikey:config.key, authorization:`Bearer ${config.key}`, 'content-type':'application/json', prefer:'resolution=merge-duplicates,return=minimal' },
      body:JSON.stringify(rows.map(databaseRow))
    });
    if (!response.ok) throw new Error(`Supabase mirror returned ${response.status}: ${(await response.text()).slice(0,200)}`);
    lastError = null;
    lastSyncedAt = new Date().toISOString();
    return true;
  } catch (error) {
    lastError = error.message;
    return false;
  }
}

function durableStorageStatus() {
  return { configured:Boolean(configuration()), lastSyncedAt, lastError };
}

module.exports = { mirrorPredictionRows, durableStorageStatus, databaseRow };
