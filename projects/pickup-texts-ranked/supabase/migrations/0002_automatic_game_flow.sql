create or replace function public.start_match(
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
  if not private.is_room_member(p_room_id) then
    raise exception 'room not found';
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

  if (
    select count(*)
    from public.players
    where public.players.room_id = p_room_id
      and public.players.connected = true
      and public.players.kicked_at is null
  ) < 2 then
    raise exception 'waiting for another player';
  end if;

  if (
    select now() < public.rooms.updated_at + interval '5 seconds'
    from public.rooms
    where public.rooms.id = p_room_id
  ) then
    raise exception 'waiting for the lobby timer';
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
      active_match_id = created_match_id,
      updated_at = now()
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

create or replace function public.advance_room_phase(p_room_id uuid, p_next_phase public.room_phase)
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
  current_phase_started_at timestamptz;
  latest_turn_id uuid;
  latest_turn_index integer;
  max_turns integer;
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'room not found';
  end if;

  select
    public.rooms.phase,
    public.rooms.active_match_id,
    public.rooms.updated_at,
    coalesce((public.matches.settings->>'maxTurns')::integer, (public.rooms.settings->>'maxTurns')::integer, 3)
  into current_phase, current_match_id, current_phase_started_at, max_turns
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

  select public.turns.id, public.turns.turn_index
  into latest_turn_id, latest_turn_index
  from public.turns
  where public.turns.match_id = current_match_id
  order by public.turns.turn_index desc
  limit 1;

  if latest_turn_id is null then
    raise exception 'active match has no turns';
  end if;

  if current_phase = 'prompt' and p_next_phase = 'submit' then
    if now() < current_phase_started_at + interval '4 seconds' then
      raise exception 'cannot open submissions before prompt timer expires';
    end if;
  end if;

  if current_phase = 'submit' and p_next_phase = 'vote' then
    if not exists (
      select 1
      from public.submissions
      where public.submissions.turn_id = latest_turn_id
    ) then
      raise exception 'cannot vote without submissions';
    end if;

    if exists (
      select 1
      from public.players
      where public.players.room_id = p_room_id
        and public.players.connected = true
        and public.players.kicked_at is null
        and not exists (
          select 1
          from public.submissions
          where public.submissions.turn_id = latest_turn_id
            and public.submissions.player_id = public.players.id
        )
    ) and now() < current_phase_started_at + interval '60 seconds' then
      raise exception 'cannot vote until all connected players submit or the timer expires';
    end if;
  end if;

  if current_phase = 'reveal' and p_next_phase = 'recap' then
    if now() < current_phase_started_at + interval '8 seconds' then
      raise exception 'cannot recap before reveal timer expires';
    end if;

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
  set phase = p_next_phase,
      updated_at = now()
  where public.rooms.id = p_room_id
  returning public.rooms.id, public.rooms.phase
  into room_id, phase;

  return next;
end;
$$;

create or replace function public.create_next_turn(
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
  current_phase_started_at timestamptz;
  latest_turn_id uuid;
  latest_turn_index integer;
  max_turns integer;
  selected_prompt_id text;
  selected_prompt_text text;
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'room not found';
  end if;

  select
    public.rooms.active_match_id,
    public.rooms.updated_at,
    coalesce((public.matches.settings->>'maxTurns')::integer, (public.rooms.settings->>'maxTurns')::integer, 3)
  into current_match_id, current_phase_started_at, max_turns
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

  if now() < current_phase_started_at + interval '8 seconds' then
    raise exception 'cannot create the next turn before reveal timer expires';
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
  set phase = 'prompt',
      updated_at = now()
  where public.rooms.id = p_room_id
  returning public.rooms.id, public.rooms.active_match_id, public.rooms.phase
  into room_id, match_id, phase;

  return next;
end;
$$;

create or replace function public.resolve_turn(p_turn_id uuid)
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
  target_room_phase public.room_phase;
  target_phase_started_at timestamptz;
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

  select public.matches.room_id, public.rooms.phase, public.rooms.updated_at
  into target_room_id, target_room_phase, target_phase_started_at
  from public.turns
  join public.matches on public.matches.id = public.turns.match_id
  join public.rooms on public.rooms.id = public.matches.room_id
  where public.turns.id = p_turn_id;

  if target_room_id is null then
    raise exception 'turn not found';
  end if;

  if not private.is_room_member(target_room_id) then
    raise exception 'room not found';
  end if;

  if not private.turn_is_active_for_any_room_phase(p_turn_id, array['vote', 'reveal']::public.room_phase[]) then
    raise exception 'turn is not revealable';
  end if;

  if target_room_phase = 'vote' and exists (
    select 1
    from public.players eligible_voters
    where eligible_voters.room_id = target_room_id
      and eligible_voters.connected = true
      and eligible_voters.kicked_at is null
      and exists (
        select 1
        from public.submissions
        where public.submissions.turn_id = p_turn_id
          and public.submissions.player_id <> eligible_voters.id
      )
      and not exists (
        select 1
        from public.votes
        where public.votes.turn_id = p_turn_id
          and public.votes.voter_player_id = eligible_voters.id
      )
  ) and now() < target_phase_started_at + interval '30 seconds' then
    raise exception 'cannot reveal until all eligible voters vote or the timer expires';
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
  set phase = 'reveal',
      updated_at = now()
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

drop function public.get_room_snapshot(uuid);

create function public.get_room_snapshot(p_room_id uuid)
returns table (
  phase public.room_phase,
  phase_started_at timestamptz,
  host_player_id uuid,
  connected_player_ids uuid[],
  turn_index integer,
  max_turns integer,
  eligible_voter_ids uuid[],
  submitted_player_ids uuid[],
  voted_player_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'room not found';
  end if;

  return query
  with room_info as (
    select
      public.rooms.phase,
      public.rooms.updated_at as phase_started_at,
      public.rooms.host_player_id,
      public.rooms.active_match_id,
      coalesce(
        (public.matches.settings->>'maxTurns')::integer,
        (public.rooms.settings->>'maxTurns')::integer,
        3
      ) as max_turns
    from public.rooms
    left join public.matches on public.matches.id = public.rooms.active_match_id
    where public.rooms.id = p_room_id
  ),
  latest_turn as (
    select public.turns.id, public.turns.turn_index
    from public.turns
    join room_info on room_info.active_match_id = public.turns.match_id
    order by public.turns.turn_index desc
    limit 1
  ),
  connected_players as (
    select coalesce(array_agg(public.players.id order by public.players.created_at), array[]::uuid[]) as ids
    from public.players
    where public.players.room_id = p_room_id
      and public.players.connected = true
      and public.players.kicked_at is null
  ),
  submitted_players as (
    select coalesce(array_agg(public.submissions.player_id order by public.submissions.created_at), array[]::uuid[]) as ids
    from public.submissions
    join latest_turn on latest_turn.id = public.submissions.turn_id
  ),
  eligible_voters as (
    select coalesce(array_agg(public.players.id order by public.players.created_at), array[]::uuid[]) as ids
    from public.players
    join latest_turn on true
    where public.players.room_id = p_room_id
      and public.players.connected = true
      and public.players.kicked_at is null
      and exists (
        select 1
        from public.submissions
        where public.submissions.turn_id = latest_turn.id
          and public.submissions.player_id <> public.players.id
      )
  ),
  voted_players as (
    select coalesce(array_agg(public.votes.voter_player_id order by public.votes.created_at), array[]::uuid[]) as ids
    from public.votes
    join latest_turn on latest_turn.id = public.votes.turn_id
    join eligible_voters on public.votes.voter_player_id = any(eligible_voters.ids)
  )
  select
    room_info.phase,
    room_info.phase_started_at,
    room_info.host_player_id,
    connected_players.ids,
    coalesce(latest_turn.turn_index, 0),
    room_info.max_turns,
    eligible_voters.ids,
    submitted_players.ids,
    voted_players.ids
  from room_info
  cross join connected_players
  cross join eligible_voters
  cross join submitted_players
  cross join voted_players
  left join latest_turn on true;
end;
$$;

revoke all on function public.get_room_snapshot(uuid) from public;
revoke all on function public.get_room_snapshot(uuid) from anon;
grant execute on function public.get_room_snapshot(uuid) to authenticated;

create or replace function private.touch_lobby_on_player_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.rooms
  set updated_at = now()
  where public.rooms.id = new.room_id
    and public.rooms.status = 'open'
    and public.rooms.phase = 'lobby';

  return new;
end;
$$;

drop trigger if exists touch_lobby_on_player_insert on public.players;
create trigger touch_lobby_on_player_insert
after insert on public.players
for each row
execute function private.touch_lobby_on_player_change();

drop trigger if exists touch_lobby_on_player_connection_update on public.players;
create trigger touch_lobby_on_player_connection_update
after update of connected, kicked_at on public.players
for each row
when (new.connected is distinct from old.connected or new.kicked_at is distinct from old.kicked_at)
execute function private.touch_lobby_on_player_change();
