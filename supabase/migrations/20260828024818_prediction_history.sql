create table if not exists public.prediction_records (
  idempotency_key text primary key,
  game_pk bigint,
  inning smallint,
  phase text not null,
  status text,
  recorded_at timestamptz not null,
  settled_at timestamptz,
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists prediction_records_game_inning_idx on public.prediction_records (game_pk, inning);
create index if not exists prediction_records_phase_recorded_idx on public.prediction_records (phase, recorded_at desc);
create index if not exists prediction_records_status_idx on public.prediction_records (status);

alter table public.prediction_records enable row level security;
revoke all on table public.prediction_records from anon, authenticated;
grant all on table public.prediction_records to service_role;

comment on table public.prediction_records is 'Server-only MLB model predictions, odds snapshots, live updates, and settled results.';
