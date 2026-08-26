# Edge Monitor

A local, auditable MLB inning-pattern research engine.

- Loads the current MLB slate from MLB Stats API
- Reconstructs innings 1–9 from each club's last 60 completed games
- Shows away and home scoreless-inning rhythm strips, oldest to newest
- Reports under-0.5 counts, last-10 under rate, and current scoreless-inning streak
- Computes a transparent under projection weighted 55% to the 60-game rate and 45% to the last-20 rate
- Shows MLB probable-pitcher headshots and names
- Optionally injects live moneyline, full-game total, and first-inning total prices through The Odds API

It does not place wagers and does not display sportsbook prices.

## Run

```powershell
npm test
npm start
```

Open <http://localhost:8787>.

## Deploy

This repository includes `render.yaml` for a public Node web service. In Render, choose **New → Blueprint**, connect this repository, and set `ODDS_API_KEY` as a secret if sportsbook prices are wanted. MLB schedules, pitcher images, and inning histories work without that key.

## Configuration

Copy `.env.example` to `.env`. `AS_OF_DATE` can replay the dashboard as of a historical date. Without it, the server uses the current date.

Set `ODDS_API_KEY` for sportsbook prices. First-inning markets require one extra event request per game and depend on bookmaker coverage; set `INCLUDE_INNING_ODDS=false` to reduce API usage.

## Model notes

The current models are transparent baselines, not trained predictors. They exist to establish the complete workflow: inputs → probability → fair price → edge → alert → immutable paper-bet entry. Replace their inputs with validated historical data, calibrate on training seasons, and judge them only on untouched holdout periods and closing-line value.

## Production roadmap

1. Choose licensed statistics and odds providers with explicit NFL, NCAA, and inning-market coverage.
2. Add normalized teams, players, events, books, prices, and timestamped feature snapshots.
3. Backfill several seasons without future-information leakage.
4. Train and calibrate per-market models; report log loss, Brier score, ROI, and closing-line value.
5. Add alert delivery and bankroll safeguards only after paper validation.
