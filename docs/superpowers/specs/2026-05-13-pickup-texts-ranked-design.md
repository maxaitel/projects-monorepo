# Pickup Texts Ranked Design

Date: 2026-05-13

## Summary

Build a remote multiplayer party game inspired by Jackbox, Skribbl-style room play, and the `/r/TextingTheory` joke of annotating text conversations like ranked chess. Friends join a shared room from their own browser, often while hanging out on Discord, and collaboratively build an unhinged pickup-text thread.

The selected v1 mode is **Anonymous Thread Builder**: each turn, players anonymously submit a possible next text message, everyone votes on the submissions, the winning message becomes the next canonical text in the conversation, and the match ends with author reveals, badges, and ELO-style score movement.

## Goals

- Let remote friends play together through a room code or share link.
- Keep every player active in each round with anonymous writing and group voting.
- Make the result feel like a playable party-game version of chess-analysis texting screenshots.
- Support Discord streaming by making the room state readable on a shared host screen while still letting each player use their own device.
- Build on a scalable path with Supabase rather than an in-memory prototype.

## Non-Goals For V1

- AI judging, AI-generated replies, or AI moderation.
- Public matchmaking.
- Accounts, friends lists, or long-term player profiles.
- Payments, monetization, or global leaderboards.
- Complex moderation beyond room-level host controls.

## Product Loop

1. A host creates a room and shares the join link or room code.
2. Players join with a display name and lightweight local browser identity.
3. The host starts a match from the lobby.
4. The game shows a starter texting scenario.
5. Each player submits one anonymous next-message candidate.
6. The room votes on the anonymous candidates.
7. The winning message is appended to the canonical text thread.
8. The round repeats for a configured number of turns.
9. The final recap reveals authors, awards badges, and updates match scores/ELO.

Voting should be pick-one in v1. Ranking every submission can be added later, but pick-one keeps the pace closer to Jackbox and lowers mobile UI complexity.

## Screens

- **Home:** create a room or join by room code.
- **Lobby:** room code, copyable invite link, player list, host controls, and match settings.
- **Thread View:** the growing conversation rendered as text bubbles with move-style annotations.
- **Submit Phase:** one text input per player for the next anonymous message.
- **Vote Phase:** all submitted messages shown anonymously in randomized order.
- **Reveal Phase:** winning message, author reveal, vote counts, and badges.
- **Final Recap:** full conversation, per-player score movement, badges, and replayable highlights.

The app should be responsive rather than split into separate host/controller applications. A host can stream one browser window in Discord, while every player also has the same URL on their own device.

## Visual Direction

The UI should combine:

- texting bubbles and a dating-app/social-chat feel;
- ranked-game language such as ELO, brilliant, check, blunder, forced, and questionable;
- large room codes and readable phase labels for Discord streams;
- compact mobile controls for fast writing and voting;
- deliberately playful badges without turning the whole app into a marketing landing page.

The first screen should be the usable game entry, not a landing page.

## Technical Architecture

Create the app at:

`/Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked`

Stack:

- Next.js App Router with React and TypeScript.
- Supabase Postgres as the source of truth for rooms, players, rounds, submissions, votes, and scores.
- Supabase Realtime for room updates, presence, phase changes, and vote/reveal updates.
- Supabase anonymous auth for accountless player identity, with browser-local session persistence for refresh/rejoin.

The database should be authoritative. Clients derive UI state from the current room/match/round records and realtime updates rather than holding independent game state.

Supabase implementation should follow current platform behavior:

- Enable RLS on all exposed public tables.
- Add explicit `GRANT` statements for client-accessed public tables, because Supabase is rolling out stricter defaults where public-schema tables are not automatically exposed to the Data API.
- Use Supabase anonymous sign-ins for RLS-compatible identity instead of trusting arbitrary client-provided player ids.
- Use dynamic rendering for auth-sensitive Next.js routes so anonymous-user metadata is not accidentally cached across players.
- Prefer Realtime Broadcast for scalable room events where useful, and use Postgres changes only where the simpler setup is acceptable.
- Keep service-role keys server-only and never expose them to browser code.

Reference docs checked during design:

- [Supabase changelog](https://supabase.com/changelog): tables increasingly require explicit Data API grants.
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime): Broadcast, Presence, and Postgres Changes are the relevant Realtime primitives.
- [Supabase Realtime Authorization docs](https://supabase.com/docs/guides/realtime/authorization): private channels can be controlled through RLS on `realtime.messages`; Postgres Changes remain governed by table RLS.
- [Supabase Anonymous Sign-Ins docs](https://supabase.com/docs/guides/auth/auth-anonymous): anonymous users use the `authenticated` Postgres role and expose an `is_anonymous` JWT claim for RLS.

## Data Model

Initial tables:

- `rooms`: room code, status, host player, current phase, settings, active match id.
- `players`: room id, display name, session/auth id, avatar/color, connection status, score, created time.
- `matches`: room id, status, started time, finished time, settings snapshot.
- `turns`: match id, turn index, starter/context text, winning submission id, phase.
- `submissions`: turn id, player id, body text, anonymous display order, selected flag.
- `votes`: turn id, voter player id, submission id.
- `badges`: match/turn id, player id, badge type, reason.
- `room_events`: optional append-only history for debugging, recap generation, and future replay.

Important constraints:

- one submission per player per turn;
- one vote per player per turn;
- players cannot vote for their own submission, unless the room has too few players and v1 explicitly allows it;
- room codes are unique and human-readable;
- turn advancement should be host-triggered or timer-triggered, not purely client-local.

## State Machine

Room phases:

- `lobby`
- `prompt`
- `submit`
- `vote`
- `reveal`
- `recap`

Only the host, or a controlled server-side action, should advance phases. Clients should handle stale or missed realtime messages by refetching the room state.

Tie handling should be deterministic. If submissions tie on votes, select a stable winner from the tied submissions and show the tie as a "photo finish" or similar joke.

## Failure Handling

- Refresh/rejoin: restore the local session and reattach the player to the room.
- Disconnects: mark player presence as disconnected; allow the host to continue after a timer.
- Host leaves: transfer host controls to the next connected player.
- Missing submissions/votes: host can skip or timer can close the phase.
- Offensive player behavior: host can kick a player and optionally reset the current turn.
- Supabase/API errors: show non-destructive retry states and refetch room state after failed writes.

## Testing And Verification

Test the round state machine first:

- create room;
- join multiple players;
- start match;
- submit messages;
- prevent duplicate submissions;
- vote on submissions;
- prevent duplicate votes;
- reveal winner;
- append winning message to the thread;
- advance multiple turns;
- final recap;
- refresh/rejoin during submit and vote;
- disconnected player continuation;
- host transfer.

Manual browser verification should cover desktop host-stream view and mobile player view.

Before implementing Supabase schema or Realtime code, re-check the current Supabase docs for Realtime authorization, RLS, Data API grants, anonymous auth, and client setup.

## Implementation Defaults

- Use Next.js App Router unless implementation discovers a strong project-local reason not to.
- Use Supabase anonymous auth for all players in v1.
- Seed a small static prompt pack in the app or database migration so the first playable build works without an admin UI.
- Start with host-controlled phase advancement; add timers after the core flow is playable.
