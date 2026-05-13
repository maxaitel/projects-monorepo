create extension if not exists pgcrypto;

create type public.room_phase as enum ('lobby', 'prompt', 'submit', 'vote', 'reveal', 'recap');
create type public.room_status as enum ('open', 'playing', 'finished');
create type public.badge_type as enum ('brilliant', 'check', 'blunder', 'questionable', 'photo_finish');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,8}$'),
  status public.room_status not null default 'open',
  phase public.room_phase not null default 'lobby',
  host_player_id uuid,
  active_match_id uuid,
  settings jsonb not null default '{"maxTurns": 3}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_color text not null default '#7c3aed',
  connected boolean not null default true,
  score integer not null default 1200,
  kicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.rooms
  add constraint rooms_host_player_id_fkey
  foreign key (host_player_id) references public.players(id) on delete set null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status public.room_status not null default 'playing',
  settings jsonb not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.rooms
  add constraint rooms_active_match_id_fkey
  foreign key (active_match_id) references public.matches(id) on delete set null;

create table public.turns (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  turn_index integer not null check (turn_index >= 0),
  prompt_id text not null,
  prompt_text text not null,
  winning_submission_id uuid,
  phase public.room_phase not null default 'prompt',
  created_at timestamptz not null default now(),
  unique (match_id, turn_index)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.turns(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 220),
  display_order integer not null,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (turn_id, player_id),
  unique (turn_id, display_order)
);

alter table public.turns
  add constraint turns_winning_submission_id_fkey
  foreign key (winning_submission_id) references public.submissions(id) on delete set null;

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.turns(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (turn_id, voter_player_id)
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  turn_id uuid references public.turns(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  badge_type public.badge_type not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.room_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_player_id uuid references public.players(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.prompt_pack (
  id text primary key,
  prompt_text text not null,
  enabled boolean not null default true
);

insert into public.prompt_pack (id, prompt_text) values
  ('wyd-tonight', 'lol what are you doing tonight?'),
  ('coffee-order', 'you remembered my coffee order??'),
  ('two-am', 'why are you texting me at 2am'),
  ('wrong-number', 'new phone who is this'),
  ('easter-shift', 'happy easter, does wednesday at 7 work?'),
  ('grocery-aisle', 'what''s your favorite aisle in the grocery store?');

create index players_room_id_idx on public.players(room_id);
create index matches_room_id_idx on public.matches(room_id);
create index turns_match_id_idx on public.turns(match_id);
create index submissions_turn_id_idx on public.submissions(turn_id);
create index votes_turn_id_idx on public.votes(turn_id);
create index badges_match_id_idx on public.badges(match_id);
create index room_events_room_id_idx on public.room_events(room_id, created_at desc);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.turns enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.badges enable row level security;
alter table public.room_events enable row level security;
alter table public.prompt_pack enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.rooms to authenticated;
grant select, insert, update on public.players to authenticated;
grant select, insert, update on public.matches to authenticated;
grant select, insert, update on public.turns to authenticated;
grant select, insert, update on public.submissions to authenticated;
grant select, insert on public.votes to authenticated;
grant select, insert on public.badges to authenticated;
grant select, insert on public.room_events to authenticated;
grant select on public.prompt_pack to authenticated;

create policy "authenticated users can create rooms"
on public.rooms for insert to authenticated
with check (created_by = (select auth.uid()));

create policy "room players can read rooms"
on public.rooms for select to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.players
    where players.room_id = rooms.id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "host can update rooms"
on public.rooms for update to authenticated
using (
  exists (
    select 1 from public.players
    where players.id = rooms.host_player_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
)
with check (
  exists (
    select 1 from public.players
    where players.id = rooms.host_player_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "authenticated users can join as themselves"
on public.players for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "room players can read players"
on public.players for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.players viewer
    where viewer.room_id = players.room_id
      and viewer.user_id = (select auth.uid())
      and viewer.kicked_at is null
  )
);

create policy "players can update themselves"
on public.players for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "room players can read matches"
on public.matches for select to authenticated
using (
  exists (
    select 1 from public.players
    where players.room_id = matches.room_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can create matches"
on public.matches for insert to authenticated
with check (
  exists (
    select 1 from public.players
    where players.room_id = matches.room_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can read turns"
on public.turns for select to authenticated
using (
  exists (
    select 1
    from public.matches
    join public.players on players.room_id = matches.room_id
    where matches.id = turns.match_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can create turns"
on public.turns for insert to authenticated
with check (
  exists (
    select 1
    from public.matches
    join public.players on players.room_id = matches.room_id
    where matches.id = turns.match_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can update turns"
on public.turns for update to authenticated
using (
  exists (
    select 1
    from public.matches
    join public.rooms on rooms.id = matches.room_id
    join public.players on players.id = rooms.host_player_id
    where matches.id = turns.match_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can read submissions"
on public.submissions for select to authenticated
using (
  exists (
    select 1
    from public.turns
    join public.matches on matches.id = turns.match_id
    join public.players on players.room_id = matches.room_id
    where turns.id = submissions.turn_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "players can submit for themselves"
on public.submissions for insert to authenticated
with check (
  exists (
    select 1 from public.players
    where players.id = submissions.player_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "host can update submissions"
on public.submissions for update to authenticated
using (
  exists (
    select 1
    from public.turns
    join public.matches on matches.id = turns.match_id
    join public.rooms on rooms.id = matches.room_id
    join public.players host on host.id = rooms.host_player_id
    where turns.id = submissions.turn_id
      and host.user_id = (select auth.uid())
      and host.kicked_at is null
  )
);

create policy "room players can read votes"
on public.votes for select to authenticated
using (
  exists (
    select 1
    from public.turns
    join public.matches on matches.id = turns.match_id
    join public.players on players.room_id = matches.room_id
    where turns.id = votes.turn_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "players can vote for themselves as voters"
on public.votes for insert to authenticated
with check (
  exists (
    select 1 from public.players
    where players.id = votes.voter_player_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
  and not exists (
    select 1 from public.submissions
    where submissions.id = votes.submission_id
      and submissions.player_id = votes.voter_player_id
  )
);

create policy "room players can read badges"
on public.badges for select to authenticated
using (
  exists (
    select 1
    from public.matches
    join public.players on players.room_id = matches.room_id
    where matches.id = badges.match_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "host can create badges"
on public.badges for insert to authenticated
with check (
  exists (
    select 1
    from public.matches
    join public.rooms on rooms.id = matches.room_id
    join public.players host on host.id = rooms.host_player_id
    where matches.id = badges.match_id
      and host.user_id = (select auth.uid())
      and host.kicked_at is null
  )
);

create policy "room players can read room events"
on public.room_events for select to authenticated
using (
  exists (
    select 1 from public.players
    where players.room_id = room_events.room_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "room players can create room events"
on public.room_events for insert to authenticated
with check (
  exists (
    select 1 from public.players
    where players.room_id = room_events.room_id
      and players.user_id = (select auth.uid())
      and players.kicked_at is null
  )
);

create policy "authenticated users can read prompts"
on public.prompt_pack for select to authenticated
using (enabled = true);
