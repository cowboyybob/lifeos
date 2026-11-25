-- Life OS Telegram bot: run once in Supabase SQL Editor.
create table if not exists public.lifeos_tg (
  chat_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tz int not null default 360,
  created_at timestamptz not null default now()
);
create table if not exists public.lifeos_tg_sent (
  key text primary key,
  at timestamptz not null default now()
);
alter table public.lifeos_tg enable row level security;
alter table public.lifeos_tg_sent enable row level security;
drop policy if exists "own tg link read" on public.lifeos_tg;
create policy "own tg link read" on public.lifeos_tg for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own tg link delete" on public.lifeos_tg;
create policy "own tg link delete" on public.lifeos_tg for delete to authenticated using (auth.uid() = user_id);
grant select, delete on public.lifeos_tg to authenticated;
revoke all on public.lifeos_tg from anon;
revoke all on public.lifeos_tg_sent from anon, authenticated;

-- reminders every 5 minutes
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('lifeos-bot-remind') where exists (select 1 from cron.job where jobname = 'lifeos-bot-remind');
select cron.schedule('lifeos-bot-remind', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://iyfebplyhidhpfhqrwvo.supabase.co/functions/v1/lifeos-bot?cron=1',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
$$);
