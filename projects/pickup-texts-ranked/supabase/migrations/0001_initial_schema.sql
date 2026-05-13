create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

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

create function private.player_room_id(target_player_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.players.room_id
  from public.players
  where public.players.id = target_player_id;
$$;

create function private.player_belongs_to_current_user(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.players
    where public.players.id = target_player_id
      and public.players.user_id = (select auth.uid())
      and public.players.kicked_at is null
  );
$$;

create function private.match_room_id(target_match_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.matches.room_id
  from public.matches
  where public.matches.id = target_match_id;
$$;

create function private.turn_match_id(target_turn_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.turns.match_id
  from public.turns
  where public.turns.id = target_turn_id;
$$;

create function private.turn_room_id(target_turn_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.matches.room_id
  from public.turns
  join public.matches on public.matches.id = public.turns.match_id
  where public.turns.id = target_turn_id;
$$;

create function private.turn_is_active_for_phase(target_turn_id uuid, expected_phase public.room_phase)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.turns
    join public.matches on public.matches.id = public.turns.match_id
    join public.rooms on public.rooms.id = public.matches.room_id
    where public.turns.id = target_turn_id
      and public.rooms.active_match_id = public.matches.id
      and public.rooms.phase = expected_phase
      and public.turns.winning_submission_id is null
      and public.turns.turn_index = (
        select max(active_turn.turn_index)
        from public.turns active_turn
        where active_turn.match_id = public.turns.match_id
      )
  );
$$;

create function private.turn_is_active(target_turn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.turns
    join public.matches on public.matches.id = public.turns.match_id
    join public.rooms on public.rooms.id = public.matches.room_id
    where public.turns.id = target_turn_id
      and public.rooms.active_match_id = public.matches.id
      and public.turns.turn_index = (
        select max(active_turn.turn_index)
        from public.turns active_turn
        where active_turn.match_id = public.turns.match_id
      )
  );
$$;

create function private.turn_is_active_for_room_phase(target_turn_id uuid, expected_phase public.room_phase)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.turns
    join public.matches on public.matches.id = public.turns.match_id
    join public.rooms on public.rooms.id = public.matches.room_id
    where public.turns.id = target_turn_id
      and public.rooms.active_match_id = public.matches.id
      and public.rooms.phase = expected_phase
      and public.turns.turn_index = (
        select max(active_turn.turn_index)
        from public.turns active_turn
        where active_turn.match_id = public.turns.match_id
      )
  );
$$;

create function private.submission_turn_id(target_submission_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.submissions.turn_id
  from public.submissions
  where public.submissions.id = target_submission_id;
$$;

create function private.submission_player_id(target_submission_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.submissions.player_id
  from public.submissions
  where public.submissions.id = target_submission_id;
$$;

create function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.players
    where public.players.room_id = target_room_id
      and public.players.user_id = (select auth.uid())
      and public.players.kicked_at is null
  );
$$;

create function private.is_room_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rooms
    join public.players host on host.id = public.rooms.host_player_id
    where public.rooms.id = target_room_id
      and host.user_id = (select auth.uid())
      and host.kicked_at is null
  );
$$;

create function private.enforce_player_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.room_id is distinct from old.room_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'players immutable columns cannot be updated';
  end if;

  if (
    new.score is distinct from old.score
    or new.kicked_at is distinct from old.kicked_at
  ) and not private.is_room_host(old.room_id) then
    raise exception 'only room hosts can update player moderation fields';
  end if;

  return new;
end;
$$;

create function private.enforce_turn_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
    or new.match_id is distinct from old.match_id
    or new.turn_index is distinct from old.turn_index
    or new.prompt_id is distinct from old.prompt_id
    or new.prompt_text is distinct from old.prompt_text
    or new.created_at is distinct from old.created_at then
    raise exception 'turns immutable columns cannot be updated';
  end if;

  return new;
end;
$$;

create function private.assign_submission_display_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.turn_id::text, 0));

  new.display_order := (
    select coalesce(max(public.submissions.display_order), -1) + 1
    from public.submissions
    where public.submissions.turn_id = new.turn_id
  );

  return new;
end;
$$;

create function private.turn_is_active_for_any_room_phase(target_turn_id uuid, expected_phases public.room_phase[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.turns
    join public.matches on public.matches.id = public.turns.match_id
    join public.rooms on public.rooms.id = public.matches.room_id
    where public.turns.id = target_turn_id
      and public.rooms.active_match_id = public.matches.id
      and public.rooms.phase = any(expected_phases)
      and public.turns.turn_index = (
        select max(active_turn.turn_index)
        from public.turns active_turn
        where active_turn.match_id = public.turns.match_id
      )
  );
$$;

create function public.create_room(
  p_room_code text,
  p_host_name text,
  p_host_avatar_color text default '#7c3aed'
)
returns table (
  room_id uuid,
  player_id uuid,
  room_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(p_room_code));
  normalized_name text := trim(p_host_name);
  normalized_color text := coalesce(nullif(trim(p_host_avatar_color), ''), '#7c3aed');
  created_room_id uuid;
  created_player_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if normalized_code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'invalid room code';
  end if;

  if char_length(normalized_name) not between 1 and 24 then
    raise exception 'invalid display name';
  end if;

  insert into public.rooms (code, created_by)
  values (normalized_code, current_user_id)
  returning id into created_room_id;

  insert into public.players (room_id, user_id, display_name, avatar_color)
  values (created_room_id, current_user_id, normalized_name, normalized_color)
  returning id into created_player_id;

  update public.rooms
  set host_player_id = created_player_id
  where id = created_room_id;

  room_id := created_room_id;
  player_id := created_player_id;
  room_code := normalized_code;
  return next;
end;
$$;

create function public.join_room(
  p_room_code text,
  p_player_name text,
  p_player_avatar_color text default '#7c3aed'
)
returns table (
  room_id uuid,
  player_id uuid,
  room_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(trim(p_room_code));
  normalized_name text := trim(p_player_name);
  normalized_color text := coalesce(nullif(trim(p_player_avatar_color), ''), '#7c3aed');
  target_room_id uuid;
  existing_player_id uuid;
  existing_kicked_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if normalized_code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'invalid room code';
  end if;

  if char_length(normalized_name) not between 1 and 24 then
    raise exception 'invalid display name';
  end if;

  select public.rooms.id
  into target_room_id
  from public.rooms
  where public.rooms.code = normalized_code;

  if target_room_id is null then
    raise exception 'room not found';
  end if;

  select public.players.id, public.players.kicked_at
  into existing_player_id, existing_kicked_at
  from public.players
  where public.players.room_id = target_room_id
    and public.players.user_id = current_user_id;

  if existing_kicked_at is not null then
    raise exception 'player has been removed from this room';
  end if;

  if existing_player_id is not null then
    update public.players
    set display_name = normalized_name,
        avatar_color = normalized_color,
        connected = true
    where public.players.id = existing_player_id
    returning public.players.id into player_id;
  else
    if not exists (
      select 1
      from public.rooms
      where public.rooms.id = target_room_id
        and public.rooms.status = 'open'
    ) then
      raise exception 'room is not open';
    end if;

    insert into public.players (room_id, user_id, display_name, avatar_color)
    values (target_room_id, current_user_id, normalized_name, normalized_color)
    returning id into player_id;
  end if;

  room_id := target_room_id;
  room_code := normalized_code;
  return next;
end;
$$;

create function public.list_vote_options(p_turn_id uuid)
returns table (
  submission_id uuid,
  body text,
  display_order integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.submissions.id as submission_id,
    public.submissions.body,
    public.submissions.display_order
  from public.submissions
  where public.submissions.turn_id = p_turn_id
    and private.is_room_member(private.turn_room_id(p_turn_id))
    and private.turn_is_active_for_any_room_phase(p_turn_id, array['vote', 'reveal', 'recap']::public.room_phase[])
  order by public.submissions.display_order;
$$;

create function public.list_reveal_submissions(p_turn_id uuid)
returns table (
  submission_id uuid,
  player_id uuid,
  body text,
  display_order integer,
  selected boolean,
  vote_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.submissions.id as submission_id,
    public.submissions.player_id,
    public.submissions.body,
    public.submissions.display_order,
    public.submissions.selected,
    count(public.votes.id) as vote_count
  from public.submissions
  left join public.votes on public.votes.submission_id = public.submissions.id
  where public.submissions.turn_id = p_turn_id
    and private.is_room_member(private.turn_room_id(p_turn_id))
    and private.turn_is_active_for_any_room_phase(p_turn_id, array['reveal', 'recap']::public.room_phase[])
  group by public.submissions.id
  order by public.submissions.display_order;
$$;

create function public.list_vote_counts(p_turn_id uuid)
returns table (
  submission_id uuid,
  vote_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.submissions.id as submission_id,
    count(public.votes.id) as vote_count
  from public.submissions
  left join public.votes on public.votes.submission_id = public.submissions.id
  where public.submissions.turn_id = p_turn_id
    and private.is_room_member(private.turn_room_id(p_turn_id))
    and private.turn_is_active_for_any_room_phase(p_turn_id, array['reveal', 'recap']::public.room_phase[])
  group by public.submissions.id
  order by public.submissions.display_order;
$$;

create function public.cast_vote(
  p_turn_id uuid,
  p_voter_player_id uuid,
  p_submission_id uuid
)
returns table (
  vote_id uuid,
  submission_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room_id uuid;
  inserted_vote_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_turn_id::text, 1));

  select public.matches.room_id
  into target_room_id
  from public.turns
  join public.matches on public.matches.id = public.turns.match_id
  join public.rooms on public.rooms.id = public.matches.room_id
  where public.turns.id = p_turn_id
    and public.rooms.active_match_id = public.matches.id
    and public.rooms.phase = 'vote'
    and public.turns.winning_submission_id is null
    and public.turns.turn_index = (
      select max(active_turn.turn_index)
      from public.turns active_turn
      where active_turn.match_id = public.turns.match_id
    )
  for update of turns;

  if target_room_id is null then
    raise exception 'turn is not votable';
  end if;

  if not private.player_belongs_to_current_user(p_voter_player_id) then
    raise exception 'voter does not belong to current user';
  end if;

  if private.player_room_id(p_voter_player_id) <> target_room_id then
    raise exception 'voter is not in the turn room';
  end if;

  if not exists (
    select 1
    from public.submissions
    where public.submissions.id = p_submission_id
      and public.submissions.turn_id = p_turn_id
      and private.player_room_id(public.submissions.player_id) = target_room_id
      and public.submissions.player_id <> p_voter_player_id
  ) then
    raise exception 'submission is not votable';
  end if;

  insert into public.votes (turn_id, voter_player_id, submission_id)
  values (p_turn_id, p_voter_player_id, p_submission_id)
  returning public.votes.id into inserted_vote_id;

  vote_id := inserted_vote_id;
  submission_id := p_submission_id;
  return next;
end;
$$;

create function public.start_match(
  p_room_id uuid,
  p_prompt_id text default null,
  p_prompt_text text default null
)
returns table (
  room_id uuid,
  match_id uuid,
  turn_id uuid,
  status public.room_status,
  phase public.room_phase
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_match_id uuid;
  created_turn_id uuid;
  selected_prompt_id text;
  selected_prompt_text text;
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'only room hosts can start matches';
  end if;

  perform 1
  from public.rooms
  where public.rooms.id = p_room_id
    and public.rooms.status = 'open'
    and public.rooms.phase = 'lobby'
    and public.rooms.active_match_id is null
  for update;

  if not found then
    raise exception 'room is not ready to start';
  end if;

  if p_prompt_id is not null and p_prompt_text is not null then
    selected_prompt_id := p_prompt_id;
    selected_prompt_text := p_prompt_text;
  else
    select public.prompt_pack.id, public.prompt_pack.prompt_text
    into selected_prompt_id, selected_prompt_text
    from public.prompt_pack
    where public.prompt_pack.enabled = true
    order by random()
    limit 1;
  end if;

  if selected_prompt_id is null or selected_prompt_text is null then
    raise exception 'prompt is required';
  end if;

  insert into public.matches (room_id, settings)
  select p_room_id, public.rooms.settings
  from public.rooms
  where public.rooms.id = p_room_id
  returning public.matches.id into created_match_id;

  insert into public.turns (match_id, turn_index, prompt_id, prompt_text)
  values (created_match_id, 0, selected_prompt_id, selected_prompt_text)
  returning public.turns.id into created_turn_id;

  update public.rooms
  set status = 'playing',
      phase = 'prompt',
      active_match_id = created_match_id
  where public.rooms.id = p_room_id
    and public.rooms.status = 'open'
    and public.rooms.phase = 'lobby'
    and public.rooms.active_match_id is null
  returning public.rooms.id, public.rooms.status, public.rooms.phase
  into room_id, status, phase;

  if room_id is null then
    raise exception 'room start raced with another update';
  end if;

  match_id := created_match_id;
  turn_id := created_turn_id;
  return next;
end;
$$;

create function public.activate_match(p_room_id uuid, p_match_id uuid)
returns table (
  room_id uuid,
  active_match_id uuid,
  status public.room_status,
  phase public.room_phase
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'only room hosts can activate matches';
  end if;

  perform 1
  from public.rooms
  where public.rooms.id = p_room_id
    and public.rooms.status = 'open'
    and public.rooms.phase = 'lobby'
    and public.rooms.active_match_id is null
  for update;

  if not found then
    raise exception 'room is not ready to start';
  end if;

  if not exists (
    select 1
    from public.matches
    where public.matches.id = p_match_id
      and public.matches.room_id = p_room_id
  ) then
    raise exception 'match does not belong to room';
  end if;

  if not exists (
    select 1
    from public.turns
    where public.turns.match_id = p_match_id
      and public.turns.turn_index = 0
  ) then
    raise exception 'match requires an initial turn';
  end if;

  update public.rooms
  set status = 'playing',
      phase = 'prompt',
      active_match_id = p_match_id
  where public.rooms.id = p_room_id
    and public.rooms.status = 'open'
    and public.rooms.phase = 'lobby'
    and public.rooms.active_match_id is null
  returning public.rooms.id, public.rooms.active_match_id, public.rooms.status, public.rooms.phase
  into room_id, active_match_id, status, phase;

  if room_id is null then
    raise exception 'room activation raced with another update';
  end if;

  return next;
end;
$$;

create function public.advance_room_phase(p_room_id uuid, p_next_phase public.room_phase)
returns table (
  room_id uuid,
  phase public.room_phase
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_phase public.room_phase;
  current_match_id uuid;
  latest_turn_index integer;
  max_turns integer;
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'only room hosts can advance room phase';
  end if;

  select
    public.rooms.phase,
    public.rooms.active_match_id,
    coalesce((public.matches.settings->>'maxTurns')::integer, (public.rooms.settings->>'maxTurns')::integer, 3)
  into current_phase, current_match_id, max_turns
  from public.rooms
  left join public.matches on public.matches.id = public.rooms.active_match_id
  where public.rooms.id = p_room_id
  for update of rooms;

  if current_match_id is null then
    raise exception 'room has no active match';
  end if;

  if not (
    (current_phase = 'prompt' and p_next_phase = 'submit')
    or (current_phase = 'submit' and p_next_phase = 'vote')
    or (current_phase = 'reveal' and p_next_phase = 'recap')
  ) then
    raise exception 'illegal room phase transition';
  end if;

  select max(public.turns.turn_index)
  into latest_turn_index
  from public.turns
  where public.turns.match_id = current_match_id;

  if latest_turn_index is null then
    raise exception 'active match has no turns';
  end if;

  if current_phase = 'submit' and p_next_phase = 'vote' and not exists (
    select 1
    from public.submissions
    join public.turns on public.turns.id = public.submissions.turn_id
    where public.turns.match_id = current_match_id
      and public.turns.turn_index = (
        select max(active_turn.turn_index)
        from public.turns active_turn
        where active_turn.match_id = current_match_id
      )
  ) then
    raise exception 'cannot vote without submissions';
  end if;

  if current_phase = 'reveal' and p_next_phase = 'recap' then
    if latest_turn_index + 1 < max_turns then
      raise exception 'cannot recap before max turns';
    end if;

    if not exists (
      select 1
      from public.turns
      where public.turns.match_id = current_match_id
        and public.turns.turn_index = latest_turn_index
        and public.turns.winning_submission_id is not null
    ) then
      raise exception 'cannot recap before resolving the latest turn';
    end if;
  end if;

  update public.rooms
  set phase = p_next_phase
  where public.rooms.id = p_room_id
  returning public.rooms.id, public.rooms.phase
  into room_id, phase;

  return next;
end;
$$;

create function public.create_next_turn(
  p_room_id uuid,
  p_prompt_id text default null,
  p_prompt_text text default null
)
returns table (
  room_id uuid,
  match_id uuid,
  turn_id uuid,
  turn_index integer,
  phase public.room_phase
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_match_id uuid;
  latest_turn_id uuid;
  latest_turn_index integer;
  max_turns integer;
  selected_prompt_id text;
  selected_prompt_text text;
begin
  if not private.is_room_host(p_room_id) then
    raise exception 'only room hosts can create turns';
  end if;

  select
    public.rooms.active_match_id,
    coalesce((public.matches.settings->>'maxTurns')::integer, (public.rooms.settings->>'maxTurns')::integer, 3)
  into current_match_id, max_turns
  from public.rooms
  join public.matches on public.matches.id = public.rooms.active_match_id
  where public.rooms.id = p_room_id
    and public.rooms.status = 'playing'
    and public.rooms.phase = 'reveal'
    and public.rooms.active_match_id is not null
  for update of rooms;

  if current_match_id is null then
    raise exception 'room is not ready for the next turn';
  end if;

  select public.turns.id, public.turns.turn_index
  into latest_turn_id, latest_turn_index
  from public.turns
  where public.turns.match_id = current_match_id
  order by public.turns.turn_index desc
  limit 1
  for update;

  if latest_turn_id is null then
    raise exception 'active match has no turns';
  end if;

  if not exists (
    select 1
    from public.turns
    where public.turns.id = latest_turn_id
      and public.turns.winning_submission_id is not null
  ) then
    raise exception 'latest turn is not resolved';
  end if;

  if latest_turn_index + 1 >= max_turns then
    raise exception 'match has reached max turns; advance to recap';
  end if;

  if p_prompt_id is not null and p_prompt_text is not null then
    selected_prompt_id := p_prompt_id;
    selected_prompt_text := p_prompt_text;
  else
    select public.prompt_pack.id, public.prompt_pack.prompt_text
    into selected_prompt_id, selected_prompt_text
    from public.prompt_pack
    where public.prompt_pack.enabled = true
    order by random()
    limit 1;
  end if;

  if selected_prompt_id is null or selected_prompt_text is null then
    raise exception 'prompt is required';
  end if;

  insert into public.turns (match_id, turn_index, prompt_id, prompt_text)
  values (current_match_id, latest_turn_index + 1, selected_prompt_id, selected_prompt_text)
  returning public.turns.id, public.turns.turn_index
  into turn_id, turn_index;

  update public.rooms
  set phase = 'prompt'
  where public.rooms.id = p_room_id
  returning public.rooms.id, public.rooms.active_match_id, public.rooms.phase
  into room_id, match_id, phase;

  return next;
end;
$$;

create function public.resolve_turn(p_turn_id uuid)
returns table (
  winning_submission_id uuid,
  winner_player_id uuid,
  score_deltas jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_room_id uuid;
  target_match_id uuid;
  winner_submission_id uuid;
  winner_id uuid;
  top_vote_count integer;
  top_vote_ties integer;
  submission_count integer;
  lowest_vote_count integer;
  existing_winning_submission_id uuid;
  deltas jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_turn_id::text, 1));

  select private.turn_room_id(p_turn_id)
  into target_room_id;

  if target_room_id is null then
    raise exception 'turn not found';
  end if;

  if not private.is_room_host(target_room_id) then
    raise exception 'only room hosts can select a winning submission';
  end if;

  if not private.turn_is_active_for_any_room_phase(p_turn_id, array['vote', 'reveal']::public.room_phase[]) then
    raise exception 'turn is not revealable';
  end if;

  select public.turns.match_id, public.turns.winning_submission_id
  into target_match_id, existing_winning_submission_id
  from public.turns
  where public.turns.id = p_turn_id
  for update;

  if existing_winning_submission_id is not null then
    select public.submissions.player_id
    into winner_id
    from public.submissions
    where public.submissions.id = existing_winning_submission_id;

    winning_submission_id := existing_winning_submission_id;
    winner_player_id := winner_id;
    score_deltas := '{}'::jsonb;
    return next;
    return;
  end if;

  with submission_votes as (
    select
      public.submissions.id,
      public.submissions.player_id,
      public.submissions.display_order,
      count(public.votes.id)::integer as vote_count
    from public.submissions
    left join public.votes on public.votes.submission_id = public.submissions.id
    where public.submissions.turn_id = p_turn_id
    group by public.submissions.id
  ),
  ranked as (
    select *
    from submission_votes
    order by vote_count desc, display_order asc
  )
  select ranked.id, ranked.player_id, ranked.vote_count
  into winner_submission_id, winner_id, top_vote_count
  from ranked
  limit 1;

  if winner_submission_id is null then
    raise exception 'cannot resolve a turn without submissions';
  end if;

  with submission_votes as (
    select
      public.submissions.id,
      public.submissions.player_id,
      public.submissions.display_order,
      count(public.votes.id)::integer as vote_count
    from public.submissions
    left join public.votes on public.votes.submission_id = public.submissions.id
    where public.submissions.turn_id = p_turn_id
    group by public.submissions.id
  )
  select count(*), min(vote_count), count(*) filter (where vote_count = top_vote_count)
  into submission_count, lowest_vote_count, top_vote_ties
  from submission_votes;

  update public.submissions
  set selected = false
  where public.submissions.turn_id = p_turn_id;

  update public.submissions
  set selected = true
  where public.submissions.id = winner_submission_id;

  update public.turns
  set winning_submission_id = winner_submission_id,
      phase = 'reveal'
  where public.turns.id = p_turn_id;

  update public.rooms
  set phase = 'reveal'
  where public.rooms.id = target_room_id;

  with submission_votes as (
    select
      public.submissions.player_id,
      count(public.votes.id)::integer as vote_count
    from public.submissions
    left join public.votes on public.votes.submission_id = public.submissions.id
    where public.submissions.turn_id = p_turn_id
    group by public.submissions.id
  ),
  computed_deltas as (
    select
      submission_votes.player_id,
      case
        when submission_votes.player_id = winner_id then
          case when top_vote_ties > 1 then 25 else 35 end
        when submission_count > 2 and submission_votes.vote_count = lowest_vote_count then -5
        when submission_votes.vote_count > 0 then 10
        else -5
      end as delta
    from submission_votes
  ),
  updated_players as (
    update public.players
    set score = public.players.score + computed_deltas.delta
    from computed_deltas
    where public.players.id = computed_deltas.player_id
    returning public.players.id, computed_deltas.delta
  )
  select coalesce(jsonb_object_agg(updated_players.id::text, updated_players.delta), '{}'::jsonb)
  into deltas
  from updated_players;

  if top_vote_ties > 1 then
    insert into public.badges (match_id, turn_id, player_id, badge_type, reason)
    values (target_match_id, p_turn_id, winner_id, 'photo_finish', 'Won a tied vote by photo finish.');
  else
    insert into public.badges (match_id, turn_id, player_id, badge_type, reason)
    values (target_match_id, p_turn_id, winner_id, 'brilliant', 'Won the room vote.');
  end if;

  insert into public.badges (match_id, turn_id, player_id, badge_type, reason)
  select target_match_id, p_turn_id, lowest.player_id, 'questionable', 'Lowest vote count this turn.'
  from (
    select
      public.submissions.player_id,
      count(public.votes.id)::integer as vote_count
    from public.submissions
    left join public.votes on public.votes.submission_id = public.submissions.id
    where public.submissions.turn_id = p_turn_id
      and public.submissions.player_id <> winner_id
    group by public.submissions.id
  ) lowest
  where submission_count > 2
    and lowest.vote_count = lowest_vote_count;

  winning_submission_id := winner_submission_id;
  winner_player_id := winner_id;
  score_deltas := deltas;
  return next;
end;
$$;

create index players_room_id_idx on public.players(room_id);
create index players_user_id_idx on public.players(user_id);
create index rooms_host_player_id_idx on public.rooms(host_player_id);
create index rooms_active_match_id_idx on public.rooms(active_match_id);
create index matches_room_id_idx on public.matches(room_id);
create index turns_match_id_idx on public.turns(match_id);
create index turns_winning_submission_id_idx on public.turns(winning_submission_id);
create index submissions_turn_id_idx on public.submissions(turn_id);
create index submissions_player_id_idx on public.submissions(player_id);
create index votes_turn_id_idx on public.votes(turn_id);
create index votes_voter_player_id_idx on public.votes(voter_player_id);
create index votes_submission_id_idx on public.votes(submission_id);
create index badges_match_id_idx on public.badges(match_id);
create index badges_turn_id_idx on public.badges(turn_id);
create index badges_player_id_idx on public.badges(player_id);
create index room_events_room_id_idx on public.room_events(room_id, created_at desc);
create index room_events_actor_player_id_idx on public.room_events(actor_player_id);

create trigger enforce_player_update_permissions
before update on public.players
for each row
execute function private.enforce_player_update_permissions();

create trigger enforce_turn_update_permissions
before update on public.turns
for each row
execute function private.enforce_turn_update_permissions();

create trigger assign_submission_display_order
before insert on public.submissions
for each row
execute function private.assign_submission_display_order();

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.turns enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.badges enable row level security;
alter table public.room_events enable row level security;
alter table public.prompt_pack enable row level security;

revoke all privileges on table public.rooms from public, anon, authenticated;
revoke all privileges on table public.players from public, anon, authenticated;
revoke all privileges on table public.matches from public, anon, authenticated;
revoke all privileges on table public.turns from public, anon, authenticated;
revoke all privileges on table public.submissions from public, anon, authenticated;
revoke all privileges on table public.votes from public, anon, authenticated;
revoke all privileges on table public.badges from public, anon, authenticated;
revoke all privileges on table public.room_events from public, anon, authenticated;
revoke all privileges on table public.prompt_pack from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.rooms to authenticated;
grant select on public.players to authenticated;
grant update (display_name, avatar_color, connected, kicked_at) on public.players to authenticated;
grant select on public.matches to authenticated;
grant select on public.turns to authenticated;
grant insert (turn_id, player_id, body) on public.submissions to authenticated;
grant select on public.badges to authenticated;
grant select on public.room_events to authenticated;
grant select on public.prompt_pack to authenticated;

revoke all on function public.create_room(text, text, text) from public;
revoke all on function public.create_room(text, text, text) from anon;
grant execute on function public.create_room(text, text, text) to authenticated;

revoke all on function public.join_room(text, text, text) from public;
revoke all on function public.join_room(text, text, text) from anon;
grant execute on function public.join_room(text, text, text) to authenticated;

revoke all on function public.list_vote_options(uuid) from public;
revoke all on function public.list_vote_options(uuid) from anon;
grant execute on function public.list_vote_options(uuid) to authenticated;

revoke all on function public.list_reveal_submissions(uuid) from public;
revoke all on function public.list_reveal_submissions(uuid) from anon;
grant execute on function public.list_reveal_submissions(uuid) to authenticated;

revoke all on function public.list_vote_counts(uuid) from public;
revoke all on function public.list_vote_counts(uuid) from anon;
grant execute on function public.list_vote_counts(uuid) to authenticated;

revoke all on function public.cast_vote(uuid, uuid, uuid) from public;
revoke all on function public.cast_vote(uuid, uuid, uuid) from anon;
grant execute on function public.cast_vote(uuid, uuid, uuid) to authenticated;

revoke all on function public.start_match(uuid, text, text) from public;
revoke all on function public.start_match(uuid, text, text) from anon;
grant execute on function public.start_match(uuid, text, text) to authenticated;

revoke all on function public.activate_match(uuid, uuid) from public;
revoke all on function public.activate_match(uuid, uuid) from anon;
grant execute on function public.activate_match(uuid, uuid) to authenticated;

revoke all on function public.advance_room_phase(uuid, public.room_phase) from public;
revoke all on function public.advance_room_phase(uuid, public.room_phase) from anon;
grant execute on function public.advance_room_phase(uuid, public.room_phase) to authenticated;

revoke all on function public.create_next_turn(uuid, text, text) from public;
revoke all on function public.create_next_turn(uuid, text, text) from anon;
grant execute on function public.create_next_turn(uuid, text, text) to authenticated;

revoke all on function public.resolve_turn(uuid) from public;
revoke all on function public.resolve_turn(uuid) from anon;
grant execute on function public.resolve_turn(uuid) to authenticated;

create policy "room players can read rooms"
on public.rooms for select to authenticated
using (
  created_by = (select auth.uid())
  or private.is_room_member(id)
);

create policy "room creator or host can update rooms"
on public.rooms for update to authenticated
using (
  (
    created_by = (select auth.uid())
    and host_player_id is null
  )
  or private.is_room_host(id)
)
with check (
  (
    created_by = (select auth.uid())
    or private.is_room_host(id)
  )
  and (
    host_player_id is null
    or private.player_room_id(host_player_id) = id
  )
  and (
    active_match_id is null
    or private.match_room_id(active_match_id) = id
  )
);

create policy "room players can read players"
on public.players for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_room_member(room_id)
);

create policy "players and hosts can update players"
on public.players for update to authenticated
using (
  (
    user_id = (select auth.uid())
    and kicked_at is null
  )
  or private.is_room_host(room_id)
)
with check (
  (
    user_id = (select auth.uid())
    and kicked_at is null
  )
  or private.is_room_host(room_id)
);

create policy "room players can read matches"
on public.matches for select to authenticated
using (private.is_room_member(room_id));

create policy "room hosts can create matches"
on public.matches for insert to authenticated
with check (
  private.is_room_host(room_id)
  and not exists (
    select 1
    from public.rooms
    where public.rooms.id = matches.room_id
      and public.rooms.active_match_id is not null
  )
);

create policy "room hosts can update matches"
on public.matches for update to authenticated
using (
  private.is_room_host(room_id)
  and exists (
    select 1
    from public.rooms
    where public.rooms.id = matches.room_id
      and public.rooms.active_match_id = matches.id
  )
)
with check (
  private.is_room_host(room_id)
  and exists (
    select 1
    from public.rooms
    where public.rooms.id = matches.room_id
      and public.rooms.active_match_id = matches.id
  )
);

create policy "room players can read turns"
on public.turns for select to authenticated
using (private.is_room_member(private.match_room_id(match_id)));

create policy "room hosts can create turns"
on public.turns for insert to authenticated
with check (
  private.is_room_host(private.match_room_id(match_id))
  and (
    winning_submission_id is null
    or private.submission_turn_id(winning_submission_id) = id
  )
);

create policy "room hosts can update turns"
on public.turns for update to authenticated
using (
  private.is_room_host(private.match_room_id(match_id))
  and private.turn_is_active(id)
)
with check (
  private.is_room_host(private.match_room_id(match_id))
  and private.turn_is_active(id)
  and (
    winning_submission_id is null
    or private.submission_turn_id(winning_submission_id) = id
  )
);

create policy "room players can read submissions"
on public.submissions for select to authenticated
using (private.is_room_member(private.turn_room_id(turn_id)));

create policy "players can submit for themselves"
on public.submissions for insert to authenticated
with check (
  private.player_belongs_to_current_user(player_id)
  and private.player_room_id(player_id) = private.turn_room_id(turn_id)
  and private.turn_is_active_for_phase(turn_id, 'submit')
);

create policy "host can update submissions"
on public.submissions for update to authenticated
using (
  private.is_room_host(private.turn_room_id(turn_id))
  and (
    private.turn_is_active_for_room_phase(turn_id, 'vote')
    or private.turn_is_active_for_room_phase(turn_id, 'reveal')
  )
)
with check (
  private.is_room_host(private.turn_room_id(turn_id))
  and (
    private.turn_is_active_for_room_phase(turn_id, 'vote')
    or private.turn_is_active_for_room_phase(turn_id, 'reveal')
  )
  and private.player_room_id(player_id) = private.turn_room_id(turn_id)
);

create policy "room players can read votes"
on public.votes for select to authenticated
using (private.is_room_member(private.turn_room_id(turn_id)));

create policy "players can vote for themselves as voters"
on public.votes for insert to authenticated
with check (
  private.player_belongs_to_current_user(voter_player_id)
  and private.player_room_id(voter_player_id) = private.turn_room_id(turn_id)
  and private.turn_is_active_for_phase(turn_id, 'vote')
  and private.submission_turn_id(submission_id) = turn_id
  and private.submission_player_id(submission_id) <> voter_player_id
);

create policy "room players can read badges"
on public.badges for select to authenticated
using (private.is_room_member(private.match_room_id(match_id)));

create policy "host can create badges"
on public.badges for insert to authenticated
with check (
  private.is_room_host(private.match_room_id(match_id))
  and private.player_room_id(player_id) = private.match_room_id(match_id)
  and (
    turn_id is null
    or private.turn_match_id(turn_id) = match_id
  )
);

create policy "room players can read room events"
on public.room_events for select to authenticated
using (private.is_room_member(room_id));

create policy "room players can create room events"
on public.room_events for insert to authenticated
with check (
  private.is_room_member(room_id)
  and (
    actor_player_id is null
    or (
      private.player_belongs_to_current_user(actor_player_id)
      and private.player_room_id(actor_player_id) = room_id
    )
  )
);

create policy "authenticated users can read prompts"
on public.prompt_pack for select to authenticated
using (enabled = true);
