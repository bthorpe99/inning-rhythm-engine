function clamp(value, min = 0.02, max = 0.98) {
  return Math.min(max, Math.max(min, value));
}

function americanToProbability(price) {
  if (!Number.isFinite(price) || price === 0) throw new Error('Invalid American odds');
  return price > 0 ? 100 / (price + 100) : -price / (-price + 100);
}

function probabilityToAmerican(probability) {
  const p = clamp(probability, 0.001, 0.999);
  return Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
}

// A transparent baseline model. Every input and weight remains visible for auditing.
function modelNrfi(input) {
  const homeNoRun = 1 - input.homeFirstInningRunRate;
  const awayNoRun = 1 - input.awayFirstInningRunRate;
  const starterNoRun = 1 - ((input.homeStarterFirstInningEra + input.awayStarterFirstInningEra) / 2 / 9);
  const parkAdjustment = input.parkRunFactor ? 1 / input.parkRunFactor : 1;
  return clamp((0.35 * homeNoRun + 0.35 * awayNoRun + 0.30 * starterNoRun) * parkAdjustment);
}

function modelInterception(input) {
  const attempts = Math.max(1, input.projectedAttempts);
  const qbPerAttempt = input.qbInterceptionRate;
  const defensePerAttempt = input.opponentInterceptionRateAllowed;
  const blendedRate = 0.65 * qbPerAttempt + 0.35 * defensePerAttempt;
  const pressureMultiplier = 1 + 0.35 * (input.opponentPressureRate - 0.22);
  const weatherMultiplier = input.badWeather ? 1.06 : 1;
  const perAttempt = clamp(blendedRate * pressureMultiplier * weatherMultiplier, 0.001, 0.15);
  return clamp(1 - Math.pow(1 - perAttempt, attempts));
}

function evaluateCandidate(candidate, minEdge = 0.04) {
  const modelProbability = candidate.market === 'MLB_1ST_INNING_UNDER_0_5'
    ? modelNrfi(candidate.features)
    : modelInterception(candidate.features);
  const breakEvenProbability = americanToProbability(candidate.price);
  const edge = modelProbability - breakEvenProbability;
  return {
    ...candidate,
    modelProbability,
    fairPrice: probabilityToAmerican(modelProbability),
    breakEvenProbability,
    edge,
    alert: edge >= minEdge,
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  americanToProbability,
  probabilityToAmerican,
  modelNrfi,
  modelInterception,
  evaluateCandidate
};
