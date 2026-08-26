module.exports = [
  {
    id: 'sample-mlb-1', sport: 'MLB', market: 'MLB_1ST_INNING_UNDER_0_5',
    event: 'CHC at STL', selection: 'Under 0.5 runs — 1st inning', price: -115,
    book: 'Sample Book', source: 'SAMPLE', startsAt: '2026-08-27T18:15:00Z',
    features: { homeFirstInningRunRate: 0.27, awayFirstInningRunRate: 0.25, homeStarterFirstInningEra: 3.15, awayStarterFirstInningEra: 2.90, parkRunFactor: 0.97 },
    innings: [
      { inning:1, predictedOver:.39, bookmakerOverPrice:110, overCount:7, sampleSize:20 },
      { inning:2, predictedOver:.34, bookmakerOverPrice:120, overCount:6, sampleSize:20 },
      { inning:3, predictedOver:.41, bookmakerOverPrice:105, overCount:8, sampleSize:20 },
      { inning:4, predictedOver:.37, bookmakerOverPrice:115, overCount:7, sampleSize:20 },
      { inning:5, predictedOver:.43, bookmakerOverPrice:100, overCount:9, sampleSize:20 },
      { inning:6, predictedOver:.46, bookmakerOverPrice:-105, overCount:9, sampleSize:20 },
      { inning:7, predictedOver:.44, bookmakerOverPrice:100, overCount:8, sampleSize:20 },
      { inning:8, predictedOver:.48, bookmakerOverPrice:-110, overCount:10, sampleSize:20 },
      { inning:9, predictedOver:.40, bookmakerOverPrice:105, overCount:8, sampleSize:20 }
    ]
  },
  {
    id: 'sample-mlb-2', sport: 'MLB', market: 'MLB_1ST_INNING_UNDER_0_5',
    event: 'SEA at OAK', selection: 'Under 0.5 runs — 1st inning', price: -125,
    book: 'Sample Book', source: 'SAMPLE', startsAt: '2026-08-27T19:40:00Z',
    features: { homeFirstInningRunRate: 0.23, awayFirstInningRunRate: 0.24, homeStarterFirstInningEra: 2.85, awayStarterFirstInningEra: 3.05, parkRunFactor: 0.92 },
    innings: [
      { inning:1, predictedOver:.33, bookmakerOverPrice:120, overCount:6, sampleSize:20 },
      { inning:2, predictedOver:.31, bookmakerOverPrice:125, overCount:5, sampleSize:20 },
      { inning:3, predictedOver:.36, bookmakerOverPrice:115, overCount:7, sampleSize:20 },
      { inning:4, predictedOver:.35, bookmakerOverPrice:115, overCount:6, sampleSize:20 },
      { inning:5, predictedOver:.39, bookmakerOverPrice:105, overCount:8, sampleSize:20 },
      { inning:6, predictedOver:.42, bookmakerOverPrice:100, overCount:9, sampleSize:20 },
      { inning:7, predictedOver:.40, bookmakerOverPrice:105, overCount:8, sampleSize:20 },
      { inning:8, predictedOver:.45, bookmakerOverPrice:-105, overCount:9, sampleSize:20 },
      { inning:9, predictedOver:.38, bookmakerOverPrice:110, overCount:7, sampleSize:20 }
    ]
  },
  {
    id: 'sample-nfl-1', sport: 'NFL', market: 'QB_TO_THROW_INTERCEPTION',
    event: 'BUF at NYJ', selection: 'Sample QB to throw an interception', price: +105,
    book: 'Sample Book', source: 'SAMPLE', startsAt: '2026-09-13T17:00:00Z',
    features: { qbInterceptionRate: 0.024, opponentInterceptionRateAllowed: 0.028, projectedAttempts: 34, opponentPressureRate: 0.25, badWeather: false }
  },
  {
    id: 'sample-ncaa-1', sport: 'NCAAF', market: 'QB_TO_THROW_INTERCEPTION',
    event: 'Sample State at Example Tech', selection: 'Sample QB to throw an interception', price: -110,
    book: 'Sample Book', source: 'SAMPLE', startsAt: '2026-09-05T23:00:00Z',
    features: { qbInterceptionRate: 0.031, opponentInterceptionRateAllowed: 0.026, projectedAttempts: 31, opponentPressureRate: 0.24, badWeather: false }
  }
];
