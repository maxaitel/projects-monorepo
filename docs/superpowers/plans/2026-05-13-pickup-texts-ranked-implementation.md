# Pickup Texts Ranked Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable remote multiplayer Anonymous Thread Builder party game with room codes, anonymous submissions, player voting, reveal/recap screens, and Supabase-backed persistence/realtime.

**Architecture:** Create a Next.js App Router app in `projects/pickup-texts-ranked`. Keep game rules in a pure TypeScript domain layer, route all persistence through a small repository layer, and keep UI components phase-specific so each screen is testable and replaceable. Supabase Postgres is the source of truth; browser clients subscribe to room changes and refetch authoritative state.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Vitest, React Testing Library, Playwright, Supabase Postgres/Auth/Realtime, `@supabase/ssr`, `@supabase/supabase-js`.

---

## File Structure

- Create `projects/pickup-texts-ranked/` with the Next.js app scaffold.
- Create `projects/pickup-texts-ranked/src/domain/game/types.ts` for shared game-state types.
- Create `projects/pickup-texts-ranked/src/domain/game/state-machine.ts` for pure phase transitions and validation.
- Create `projects/pickup-texts-ranked/src/domain/game/scoring.ts` for vote tallying, tie handling, badges, and ELO-style score deltas.
- Create `projects/pickup-texts-ranked/src/domain/game/prompts.ts` for the v1 static starter prompt pack.
- Create `projects/pickup-texts-ranked/src/domain/game/*.test.ts` for pure domain tests.
- Create `projects/pickup-texts-ranked/supabase/migrations/0001_initial_schema.sql` for tables, constraints, indexes, grants, RLS, and seed prompts.
- Create `projects/pickup-texts-ranked/src/lib/supabase/browser.ts`, `server.ts`, and `proxy.ts` using `@supabase/ssr`.
- Create `projects/pickup-texts-ranked/src/lib/game/repository.ts` for the repository interface and DTOs.
- Create `projects/pickup-texts-ranked/src/lib/game/supabase-repository.ts` for Supabase-backed reads/writes.
- Create `projects/pickup-texts-ranked/src/lib/game/actions.ts` for server actions that create rooms, join rooms, start matches, submit messages, vote, reveal, advance turns, and kick players.
- Create `projects/pickup-texts-ranked/src/lib/game/use-room-realtime.ts` for client-side subscriptions and state refetch triggers.
- Create `projects/pickup-texts-ranked/src/components/game/` for phase-specific UI components.
- Create `projects/pickup-texts-ranked/src/app/page.tsx` for home/create/join.
- Create `projects/pickup-texts-ranked/src/app/room/[code]/page.tsx` and `room-client.tsx` for the room experience.
- Create `projects/pickup-texts-ranked/src/app/layout.tsx` and `globals.css` for the visual system.
- Create `projects/pickup-texts-ranked/e2e/room-flow.spec.ts` for browser verification.

## Task 1: Scaffold The App And Test Harness

**Files:**
- Create: `projects/pickup-texts-ranked/package.json`
- Create: `projects/pickup-texts-ranked/vitest.config.ts`
- Create: `projects/pickup-texts-ranked/src/test/setup.ts`
- Create: `projects/pickup-texts-ranked/playwright.config.ts`
- Create: `projects/pickup-texts-ranked/.env.example`

- [ ] **Step 1: Scaffold Next.js non-interactively**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects
npx create-next-app@latest pickup-texts-ranked --yes --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm
```

Expected: `projects/pickup-texts-ranked/package.json` exists and `npm run dev` is available.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm install @supabase/supabase-js @supabase/ssr lucide-react clsx tailwind-merge
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom playwright
```

Expected: install completes without peer dependency errors.

- [ ] **Step 3: Add test scripts**

Modify `projects/pickup-texts-ranked/package.json` so the `scripts` block contains:

```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run --passWithNoTests",
  "test:watch": "vitest",
  "e2e": "playwright test"
}
```

- [ ] **Step 4: Configure Vitest**

Create `projects/pickup-texts-ranked/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

Create `projects/pickup-texts-ranked/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Configure Playwright**

Create `projects/pickup-texts-ranked/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 6: Add environment example**

Create `projects/pickup-texts-ranked/.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

- [ ] **Step 7: Verify scaffold**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
npm run build
```

Expected: tests pass with no tests found or a clean empty suite, and `next build` succeeds. If `next lint` is unavailable in the installed Next version, use `npx next lint` only if supported; otherwise rely on `npm run build` and TypeScript.

- [ ] **Step 8: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked
git commit -m "chore: scaffold pickup texts ranked app"
```

## Task 2: Build The Pure Game Domain

**Files:**
- Create: `projects/pickup-texts-ranked/src/domain/game/types.ts`
- Create: `projects/pickup-texts-ranked/src/domain/game/state-machine.ts`
- Create: `projects/pickup-texts-ranked/src/domain/game/scoring.ts`
- Create: `projects/pickup-texts-ranked/src/domain/game/prompts.ts`
- Test: `projects/pickup-texts-ranked/src/domain/game/state-machine.test.ts`
- Test: `projects/pickup-texts-ranked/src/domain/game/scoring.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Create `projects/pickup-texts-ranked/src/domain/game/state-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canAdvancePhase, getNextPhase, validateRoomAction } from "./state-machine";
import type { RoomSnapshot } from "./types";

const baseRoom: RoomSnapshot = {
  phase: "lobby",
  hostPlayerId: "player-host",
  connectedPlayerIds: ["player-host", "player-two"],
  turnIndex: 0,
  maxTurns: 3,
  requiredSubmitterIds: ["player-host", "player-two"],
  submittedPlayerIds: [],
  requiredVoterIds: ["player-host", "player-two"],
  votedPlayerIds: [],
};

describe("game state machine", () => {
  it("only allows the host to start a match from lobby", () => {
    expect(validateRoomAction(baseRoom, "player-two", "start_match")).toEqual({
      ok: false,
      reason: "Only the host can do that.",
    });
    expect(validateRoomAction(baseRoom, "player-host", "start_match")).toEqual({ ok: true });
  });

  it("advances through the core room phases", () => {
    expect(getNextPhase("lobby")).toBe("prompt");
    expect(getNextPhase("prompt")).toBe("submit");
    expect(getNextPhase("submit")).toBe("vote");
    expect(getNextPhase("vote")).toBe("reveal");
    expect(getNextPhase("reveal")).toBe("prompt");
  });

  it("blocks submit phase advancement until every connected player submitted", () => {
    const room = { ...baseRoom, phase: "submit" as const, submittedPlayerIds: ["player-host"] };
    expect(canAdvancePhase(room)).toEqual({
      ok: false,
      reason: "Waiting for 1 player to submit.",
    });
  });

  it("allows submit phase advancement when all required players submitted", () => {
    const room = {
      ...baseRoom,
      phase: "submit" as const,
      submittedPlayerIds: ["player-host", "player-two"],
    };
    expect(canAdvancePhase(room)).toEqual({ ok: true });
  });

  it("moves from reveal to recap after the last turn", () => {
    expect(getNextPhase("reveal", { turnIndex: 2, maxTurns: 3 })).toBe("recap");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/domain/game/state-machine.test.ts
```

Expected: FAIL because `./state-machine` and `./types` do not exist.

- [ ] **Step 3: Add domain types and state machine**

Create `projects/pickup-texts-ranked/src/domain/game/types.ts`:

```ts
export type RoomPhase = "lobby" | "prompt" | "submit" | "vote" | "reveal" | "recap";

export type HostAction =
  | "start_match"
  | "advance_phase"
  | "skip_missing_players"
  | "kick_player";

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface RoomSnapshot {
  phase: RoomPhase;
  hostPlayerId: string;
  connectedPlayerIds: string[];
  turnIndex: number;
  maxTurns: number;
  requiredSubmitterIds: string[];
  submittedPlayerIds: string[];
  requiredVoterIds: string[];
  votedPlayerIds: string[];
}

export interface SubmissionResult {
  submissionId: string;
  playerId: string;
  body: string;
  votes: number;
  displayOrder: number;
}

export interface BadgeAward {
  playerId: string;
  type: "brilliant" | "check" | "blunder" | "questionable" | "photo_finish";
  reason: string;
}

export interface TurnResolution {
  winningSubmissionId: string;
  badges: BadgeAward[];
  scoreDeltas: Record<string, number>;
}
```

Create `projects/pickup-texts-ranked/src/domain/game/state-machine.ts`:

```ts
import type { ActionResult, HostAction, RoomPhase, RoomSnapshot } from "./types";

export function validateRoomAction(
  room: RoomSnapshot,
  actorPlayerId: string,
  action: HostAction,
): ActionResult {
  if (action === "start_match" && room.phase !== "lobby") {
    return { ok: false, reason: "The match has already started." };
  }

  if (actorPlayerId !== room.hostPlayerId) {
    return { ok: false, reason: "Only the host can do that." };
  }

  return { ok: true };
}

export function getNextPhase(
  phase: RoomPhase,
  turn?: Pick<RoomSnapshot, "turnIndex" | "maxTurns">,
): RoomPhase {
  if (phase === "lobby") return "prompt";
  if (phase === "prompt") return "submit";
  if (phase === "submit") return "vote";
  if (phase === "vote") return "reveal";
  if (phase === "reveal") {
    if (turn && turn.turnIndex + 1 >= turn.maxTurns) return "recap";
    return "prompt";
  }
  return "recap";
}

export function canAdvancePhase(room: RoomSnapshot): ActionResult {
  if (room.phase === "submit") {
    const missing = countMissing(room.requiredSubmitterIds, room.submittedPlayerIds);
    if (missing > 0) {
      return { ok: false, reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to submit.` };
    }
  }

  if (room.phase === "vote") {
    const missing = countMissing(room.requiredVoterIds, room.votedPlayerIds);
    if (missing > 0) {
      return { ok: false, reason: `Waiting for ${missing} ${missing === 1 ? "player" : "players"} to vote.` };
    }
  }

  return { ok: true };
}

function countMissing(requiredIds: string[], completedIds: string[]): number {
  const completed = new Set(completedIds);
  return requiredIds.filter((id) => !completed.has(id)).length;
}
```

- [ ] **Step 4: Run state-machine tests**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/domain/game/state-machine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing scoring tests**

Create `projects/pickup-texts-ranked/src/domain/game/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveTurn } from "./scoring";
import type { SubmissionResult } from "./types";

const submissions: SubmissionResult[] = [
  { submissionId: "sub-a", playerId: "player-a", body: "come over, my notes app misses you", votes: 2, displayOrder: 2 },
  { submissionId: "sub-b", playerId: "player-b", body: "wyd but in a federal tone", votes: 4, displayOrder: 1 },
  { submissionId: "sub-c", playerId: "player-c", body: "respectfully, unblock me", votes: 1, displayOrder: 3 },
];

describe("resolveTurn", () => {
  it("selects the highest-voted submission and awards score deltas", () => {
    expect(resolveTurn(submissions)).toEqual({
      winningSubmissionId: "sub-b",
      badges: [
        { playerId: "player-b", type: "brilliant", reason: "Won the room vote." },
        { playerId: "player-c", type: "questionable", reason: "Lowest vote count this turn." },
      ],
      scoreDeltas: {
        "player-a": 10,
        "player-b": 35,
        "player-c": -5,
      },
    });
  });

  it("breaks ties by stable anonymous display order and marks photo finish", () => {
    const tied: SubmissionResult[] = [
      { submissionId: "sub-a", playerId: "player-a", body: "a", votes: 3, displayOrder: 2 },
      { submissionId: "sub-b", playerId: "player-b", body: "b", votes: 3, displayOrder: 1 },
    ];

    expect(resolveTurn(tied)).toEqual({
      winningSubmissionId: "sub-b",
      badges: [
        { playerId: "player-b", type: "photo_finish", reason: "Won a tied vote by photo finish." },
      ],
      scoreDeltas: {
        "player-a": 10,
        "player-b": 25,
      },
    });
  });
});
```

- [ ] **Step 6: Run scoring test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/domain/game/scoring.test.ts
```

Expected: FAIL because `resolveTurn` does not exist.

- [ ] **Step 7: Add scoring implementation and prompts**

Create `projects/pickup-texts-ranked/src/domain/game/scoring.ts`:

```ts
import type { BadgeAward, SubmissionResult, TurnResolution } from "./types";

export function resolveTurn(submissions: SubmissionResult[]): TurnResolution {
  if (submissions.length === 0) {
    throw new Error("Cannot resolve a turn without submissions.");
  }

  const sorted = [...submissions].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.displayOrder - b.displayOrder;
  });

  const winner = sorted[0];
  const topVoteCount = winner.votes;
  const tiedWinners = sorted.filter((submission) => submission.votes === topVoteCount);
  const lowestVoteCount = Math.min(...submissions.map((submission) => submission.votes));
  const lowest = sorted.findLast((submission) => submission.votes === lowestVoteCount);

  const badges: BadgeAward[] = [];
  if (tiedWinners.length > 1) {
    badges.push({
      playerId: winner.playerId,
      type: "photo_finish",
      reason: "Won a tied vote by photo finish.",
    });
  } else {
    badges.push({
      playerId: winner.playerId,
      type: "brilliant",
      reason: "Won the room vote.",
    });
  }

  if (lowest && lowest.playerId !== winner.playerId && submissions.length > 2) {
    badges.push({
      playerId: lowest.playerId,
      type: "questionable",
      reason: "Lowest vote count this turn.",
    });
  }

  const scoreDeltas = Object.fromEntries(
    submissions.map((submission) => [
      submission.playerId,
      submission.playerId === winner.playerId ? (tiedWinners.length > 1 ? 25 : 35) : submission.votes > 0 ? 10 : -5,
    ]),
  );

  return {
    winningSubmissionId: winner.submissionId,
    badges,
    scoreDeltas,
  };
}
```

Create `projects/pickup-texts-ranked/src/domain/game/prompts.ts`:

```ts
export interface StarterPrompt {
  id: string;
  sender: "them" | "you";
  text: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: "wyd-tonight", sender: "them", text: "lol what are you doing tonight?" },
  { id: "coffee-order", sender: "them", text: "you remembered my coffee order??" },
  { id: "two-am", sender: "them", text: "why are you texting me at 2am" },
  { id: "wrong-number", sender: "them", text: "new phone who is this" },
  { id: "easter-shift", sender: "them", text: "happy easter, does wednesday at 7 work?" },
  { id: "grocery-aisle", sender: "them", text: "what's your favorite aisle in the grocery store?" },
];
```

- [ ] **Step 8: Run domain tests**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/domain/game
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/domain/game
git commit -m "feat: add game domain rules"
```

## Task 3: Add Supabase Schema And Security Policies

**Files:**
- Create: `projects/pickup-texts-ranked/supabase/migrations/0001_initial_schema.sql`
- Create: `projects/pickup-texts-ranked/src/lib/database.types.ts`
- Modify: `projects/pickup-texts-ranked/.env.example`

- [ ] **Step 1: Create the migration**

Create `projects/pickup-texts-ranked/supabase/migrations/0001_initial_schema.sql`:

```sql
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
```

- [ ] **Step 2: Add initial database enum types**

Create `projects/pickup-texts-ranked/src/lib/database.types.ts`:

```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      rooms: Table;
      players: Table;
      matches: Table;
      turns: Table;
      submissions: Table;
      votes: Table;
      badges: Table;
      room_events: Table;
      prompt_pack: Table;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      room_phase: "lobby" | "prompt" | "submit" | "vote" | "reveal" | "recap";
      room_status: "open" | "playing" | "finished";
      badge_type: "brilliant" | "check" | "blunder" | "questionable" | "photo_finish";
    };
    CompositeTypes: Record<string, never>;
  };
}
```

Replace this with generated Supabase types after a linked project exists:

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

- [ ] **Step 3: Verify SQL locally when Supabase CLI is available**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npx supabase --help
npx supabase db reset
```

Expected: local database resets cleanly and applies `0001_initial_schema.sql`. If Supabase is not linked or Docker is not running, record the blocker and continue with TypeScript tests.

- [ ] **Step 4: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/supabase projects/pickup-texts-ranked/src/lib/database.types.ts projects/pickup-texts-ranked/.env.example
git commit -m "feat: add Supabase game schema"
```

## Task 4: Add Supabase Clients And Anonymous Auth

**Files:**
- Create: `projects/pickup-texts-ranked/src/lib/supabase/browser.ts`
- Create: `projects/pickup-texts-ranked/src/lib/supabase/server.ts`
- Create: `projects/pickup-texts-ranked/src/lib/supabase/proxy.ts`
- Create: `projects/pickup-texts-ranked/proxy.ts`
- Create: `projects/pickup-texts-ranked/src/lib/auth/anonymous.ts`
- Test: `projects/pickup-texts-ranked/src/lib/auth/anonymous.test.ts`

- [ ] **Step 1: Write failing anonymous auth tests**

Create `projects/pickup-texts-ranked/src/lib/auth/anonymous.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ensureAnonymousUser } from "./anonymous";

describe("ensureAnonymousUser", () => {
  it("returns the existing user when a session exists", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
        signInAnonymously: vi.fn(),
      },
    };

    await expect(ensureAnonymousUser(supabase)).resolves.toEqual({ id: "user-1" });
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when no user exists", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        signInAnonymously: vi.fn().mockResolvedValue({
          data: { user: { id: "anon-1" } },
          error: null,
        }),
      },
    };

    await expect(ensureAnonymousUser(supabase)).resolves.toEqual({ id: "anon-1" });
  });

  it("throws a readable error when anonymous sign-in fails", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        signInAnonymously: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Anonymous sign-ins are disabled" },
        }),
      },
    };

    await expect(ensureAnonymousUser(supabase)).rejects.toThrow("Anonymous sign-ins are disabled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/auth/anonymous.test.ts
```

Expected: FAIL because `./anonymous` does not exist.

- [ ] **Step 3: Add Supabase client utilities**

Create `projects/pickup-texts-ranked/src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

Create `projects/pickup-texts-ranked/src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies. Proxy refresh handles this.
          }
        },
      },
    },
  );
}
```

Create `projects/pickup-texts-ranked/src/lib/supabase/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}
```

Create `projects/pickup-texts-ranked/proxy.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 4: Add anonymous auth helper**

Create `projects/pickup-texts-ranked/src/lib/auth/anonymous.ts`:

```ts
interface SupabaseLike {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    signInAnonymously: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
}

export async function ensureAnonymousUser(supabase: SupabaseLike): Promise<{ id: string }> {
  const existing = await supabase.auth.getUser();
  if (existing.data.user) return { id: existing.data.user.id };

  const created = await supabase.auth.signInAnonymously();
  if (created.error) throw new Error(created.error.message);
  if (!created.data.user) throw new Error("Anonymous sign-in did not return a user.");

  return { id: created.data.user.id };
}
```

- [ ] **Step 5: Run anonymous auth tests**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/auth/anonymous.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build check**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run build
```

Expected: PASS. If missing environment variables block build, add temporary public example values only for local build invocation:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
```

- [ ] **Step 7: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/lib/supabase projects/pickup-texts-ranked/src/lib/auth projects/pickup-texts-ranked/proxy.ts
git commit -m "feat: add Supabase anonymous auth clients"
```

## Task 5: Add Repository And Server Actions

**Files:**
- Create: `projects/pickup-texts-ranked/src/lib/game/repository.ts`
- Create: `projects/pickup-texts-ranked/src/lib/game/supabase-repository.ts`
- Create: `projects/pickup-texts-ranked/src/lib/game/actions.ts`
- Test: `projects/pickup-texts-ranked/src/lib/game/actions.test.ts`

- [ ] **Step 1: Write failing action tests with a fake repository**

Create `projects/pickup-texts-ranked/src/lib/game/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createGameActions } from "./actions";
import type { GameRepository } from "./repository";

function makeRepository(): GameRepository {
  return {
    createRoom: async ({ hostUserId, displayName }) => ({
      roomId: "room-1",
      code: "ABCD",
      hostPlayerId: "player-host",
      hostUserId,
      displayName,
    }),
    joinRoom: async ({ code, userId, displayName }) => ({
      roomId: "room-1",
      code,
      playerId: `player-${userId}`,
      userId,
      displayName,
    }),
    getRoomSnapshot: async () => ({
      phase: "lobby",
      hostPlayerId: "player-host",
      connectedPlayerIds: ["player-host", "player-two"],
      turnIndex: 0,
      maxTurns: 3,
      requiredSubmitterIds: ["player-host", "player-two"],
      submittedPlayerIds: [],
      requiredVoterIds: ["player-host", "player-two"],
      votedPlayerIds: [],
    }),
    startMatch: async () => ({ matchId: "match-1", turnId: "turn-1" }),
    submitMessage: async ({ body }) => ({ submissionId: "sub-1", body }),
    castVote: async ({ submissionId }) => ({ voteId: "vote-1", submissionId }),
    revealTurn: async () => ({
      winningSubmissionId: "sub-1",
      badges: [],
      scoreDeltas: { "player-host": 35 },
    }),
    advancePhase: async ({ nextPhase }) => ({ phase: nextPhase }),
    kickPlayer: async ({ playerId }) => ({ playerId, kicked: true }),
  };
}

describe("game actions", () => {
  it("creates a room for the current anonymous user", async () => {
    const actions = createGameActions(makeRepository(), async () => ({ id: "user-host" }));
    await expect(actions.createRoom("Max")).resolves.toMatchObject({
      code: "ABCD",
      hostPlayerId: "player-host",
    });
  });

  it("trims submitted messages and rejects empty text", async () => {
    const actions = createGameActions(makeRepository(), async () => ({ id: "user-host" }));
    await expect(actions.submitMessage("turn-1", "player-host", "  maybe energy  ")).resolves.toMatchObject({
      body: "maybe energy",
    });
    await expect(actions.submitMessage("turn-1", "player-host", "   ")).rejects.toThrow("Write a reply before submitting.");
  });

  it("blocks non-host start match attempts", async () => {
    const actions = createGameActions(makeRepository(), async () => ({ id: "user-two" }));
    await expect(actions.startMatch("room-1", "player-two")).rejects.toThrow("Only the host can do that.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/game/actions.test.ts
```

Expected: FAIL because action/repository modules do not exist.

- [ ] **Step 3: Add repository interface**

Create `projects/pickup-texts-ranked/src/lib/game/repository.ts`:

```ts
import type { RoomPhase, RoomSnapshot, TurnResolution } from "@/domain/game/types";

export interface CreatedRoom {
  roomId: string;
  code: string;
  hostPlayerId: string;
  hostUserId: string;
  displayName: string;
}

export interface JoinedRoom {
  roomId: string;
  code: string;
  playerId: string;
  userId: string;
  displayName: string;
}

export interface GameRepository {
  createRoom(input: { hostUserId: string; displayName: string }): Promise<CreatedRoom>;
  joinRoom(input: { code: string; userId: string; displayName: string }): Promise<JoinedRoom>;
  getRoomSnapshot(roomId: string): Promise<RoomSnapshot>;
  startMatch(input: { roomId: string; hostPlayerId: string }): Promise<{ matchId: string; turnId: string }>;
  submitMessage(input: { turnId: string; playerId: string; body: string }): Promise<{ submissionId: string; body: string }>;
  castVote(input: { turnId: string; voterPlayerId: string; submissionId: string }): Promise<{ voteId: string; submissionId: string }>;
  revealTurn(input: { turnId: string; hostPlayerId: string }): Promise<TurnResolution>;
  advancePhase(input: { roomId: string; actorPlayerId: string; nextPhase: RoomPhase }): Promise<{ phase: RoomPhase }>;
  kickPlayer(input: { roomId: string; hostPlayerId: string; playerId: string }): Promise<{ playerId: string; kicked: true }>;
}
```

- [ ] **Step 4: Add action factory**

Create `projects/pickup-texts-ranked/src/lib/game/actions.ts`:

```ts
import { canAdvancePhase, getNextPhase, validateRoomAction } from "@/domain/game/state-machine";
import type { GameRepository } from "./repository";

type CurrentUserProvider = () => Promise<{ id: string }>;

export function createGameActions(repository: GameRepository, getCurrentUser: CurrentUserProvider) {
  return {
    async createRoom(displayName: string) {
      const user = await getCurrentUser();
      const cleanName = cleanDisplayName(displayName);
      return repository.createRoom({ hostUserId: user.id, displayName: cleanName });
    },

    async joinRoom(code: string, displayName: string) {
      const user = await getCurrentUser();
      return repository.joinRoom({
        code: code.trim().toUpperCase(),
        userId: user.id,
        displayName: cleanDisplayName(displayName),
      });
    },

    async startMatch(roomId: string, actorPlayerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      const allowed = validateRoomAction(snapshot, actorPlayerId, "start_match");
      if (!allowed.ok) throw new Error(allowed.reason);
      return repository.startMatch({ roomId, hostPlayerId: actorPlayerId });
    },

    async submitMessage(turnId: string, playerId: string, body: string) {
      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Write a reply before submitting.");
      if (cleanBody.length > 220) throw new Error("Replies must be 220 characters or fewer.");
      return repository.submitMessage({ turnId, playerId, body: cleanBody });
    },

    async castVote(turnId: string, voterPlayerId: string, submissionId: string) {
      return repository.castVote({ turnId, voterPlayerId, submissionId });
    },

    async revealTurn(turnId: string, hostPlayerId: string) {
      return repository.revealTurn({ turnId, hostPlayerId });
    },

    async advancePhase(roomId: string, actorPlayerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      const allowed = validateRoomAction(snapshot, actorPlayerId, "advance_phase");
      if (!allowed.ok) throw new Error(allowed.reason);
      const phaseReady = canAdvancePhase(snapshot);
      if (!phaseReady.ok) throw new Error(phaseReady.reason);
      return repository.advancePhase({
        roomId,
        actorPlayerId,
        nextPhase: getNextPhase(snapshot.phase, snapshot),
      });
    },

    async kickPlayer(roomId: string, hostPlayerId: string, playerId: string) {
      const snapshot = await repository.getRoomSnapshot(roomId);
      const allowed = validateRoomAction(snapshot, hostPlayerId, "kick_player");
      if (!allowed.ok) throw new Error(allowed.reason);
      return repository.kickPlayer({ roomId, hostPlayerId, playerId });
    },
  };
}

function cleanDisplayName(displayName: string): string {
  const cleanName = displayName.trim();
  if (!cleanName) throw new Error("Enter a display name.");
  if (cleanName.length > 24) throw new Error("Display names must be 24 characters or fewer.");
  return cleanName;
}
```

- [ ] **Step 5: Add Supabase repository skeleton**

Create `projects/pickup-texts-ranked/src/lib/game/supabase-repository.ts`:

```ts
import { resolveTurn } from "@/domain/game/scoring";
import type { RoomPhase, RoomSnapshot, SubmissionResult } from "@/domain/game/types";
import type { GameRepository } from "./repository";

interface SupabaseClientLike {
  from: (table: string) => any;
}

export function createSupabaseGameRepository(supabase: SupabaseClientLike): GameRepository {
  return {
    async createRoom({ hostUserId, displayName }) {
      const code = makeRoomCode();
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({ code, created_by: hostUserId })
        .select("id, code")
        .single();
      if (roomError) throw new Error(roomError.message);

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({ room_id: room.id, user_id: hostUserId, display_name: displayName })
        .select("id")
        .single();
      if (playerError) throw new Error(playerError.message);

      const { error: updateError } = await supabase
        .from("rooms")
        .update({ host_player_id: player.id })
        .eq("id", room.id);
      if (updateError) throw new Error(updateError.message);

      return { roomId: room.id, code: room.code, hostPlayerId: player.id, hostUserId, displayName };
    },

    async joinRoom({ code, userId, displayName }) {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("id, code")
        .eq("code", code)
        .single();
      if (roomError) throw new Error(roomError.message);

      const { data: player, error: playerError } = await supabase
        .from("players")
        .upsert({ room_id: room.id, user_id: userId, display_name: displayName, connected: true }, { onConflict: "room_id,user_id" })
        .select("id")
        .single();
      if (playerError) throw new Error(playerError.message);

      return { roomId: room.id, code: room.code, playerId: player.id, userId, displayName };
    },

    async getRoomSnapshot(roomId) {
      return getRoomSnapshot(supabase, roomId);
    },

    async startMatch({ roomId }) {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("settings")
        .eq("id", roomId)
        .single();
      if (roomError) throw new Error(roomError.message);

      const { data: prompt, error: promptError } = await supabase
        .from("prompt_pack")
        .select("id, prompt_text")
        .eq("enabled", true)
        .limit(1)
        .single();
      if (promptError) throw new Error(promptError.message);

      const { data: match, error: matchError } = await supabase
        .from("matches")
        .insert({ room_id: roomId, settings: room.settings })
        .select("id")
        .single();
      if (matchError) throw new Error(matchError.message);

      const { data: turn, error: turnError } = await supabase
        .from("turns")
        .insert({ match_id: match.id, turn_index: 0, prompt_id: prompt.id, prompt_text: prompt.prompt_text })
        .select("id")
        .single();
      if (turnError) throw new Error(turnError.message);

      const { error: updateError } = await supabase
        .from("rooms")
        .update({ status: "playing", phase: "prompt", active_match_id: match.id })
        .eq("id", roomId);
      if (updateError) throw new Error(updateError.message);

      return { matchId: match.id, turnId: turn.id };
    },

    async submitMessage({ turnId, playerId, body }) {
      const { count } = await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("turn_id", turnId);
      const displayOrder = (count ?? 0) + 1;

      const { data, error } = await supabase
        .from("submissions")
        .insert({ turn_id: turnId, player_id: playerId, body, display_order: displayOrder })
        .select("id, body")
        .single();
      if (error) throw new Error(error.message);
      return { submissionId: data.id, body: data.body };
    },

    async castVote({ turnId, voterPlayerId, submissionId }) {
      const { data, error } = await supabase
        .from("votes")
        .insert({ turn_id: turnId, voter_player_id: voterPlayerId, submission_id: submissionId })
        .select("id, submission_id")
        .single();
      if (error) throw new Error(error.message);
      return { voteId: data.id, submissionId: data.submission_id };
    },

    async revealTurn({ turnId }) {
      const submissions = await getSubmissionResults(supabase, turnId);
      const resolution = resolveTurn(submissions);

      await supabase.from("submissions").update({ selected: true }).eq("id", resolution.winningSubmissionId);
      await supabase.from("turns").update({ winning_submission_id: resolution.winningSubmissionId, phase: "reveal" }).eq("id", turnId);

      return resolution;
    },

    async advancePhase({ roomId, nextPhase }) {
      const { data, error } = await supabase
        .from("rooms")
        .update({ phase: nextPhase satisfies RoomPhase })
        .eq("id", roomId)
        .select("phase")
        .single();
      if (error) throw new Error(error.message);
      return { phase: data.phase };
    },

    async kickPlayer({ playerId }) {
      const { error } = await supabase.from("players").update({ kicked_at: new Date().toISOString(), connected: false }).eq("id", playerId);
      if (error) throw new Error(error.message);
      return { playerId, kicked: true };
    },
  };
}

async function getRoomSnapshot(supabase: SupabaseClientLike, roomId: string): Promise<RoomSnapshot> {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("phase, host_player_id, settings, active_match_id")
    .eq("id", roomId)
    .single();
  if (roomError) throw new Error(roomError.message);

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, connected")
    .eq("room_id", roomId)
    .is("kicked_at", null);
  if (playersError) throw new Error(playersError.message);

  const connectedPlayerIds = players.filter((player: any) => player.connected).map((player: any) => player.id);

  return {
    phase: room.phase,
    hostPlayerId: room.host_player_id,
    connectedPlayerIds,
    turnIndex: 0,
    maxTurns: Number(room.settings?.maxTurns ?? 3),
    requiredSubmitterIds: connectedPlayerIds,
    submittedPlayerIds: [],
    requiredVoterIds: connectedPlayerIds,
    votedPlayerIds: [],
  };
}

async function getSubmissionResults(supabase: SupabaseClientLike, turnId: string): Promise<SubmissionResult[]> {
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("id, player_id, body, display_order, votes(id)")
    .eq("turn_id", turnId);
  if (error) throw new Error(error.message);

  return submissions.map((submission: any) => ({
    submissionId: submission.id,
    playerId: submission.player_id,
    body: submission.body,
    displayOrder: submission.display_order,
    votes: submission.votes?.length ?? 0,
  }));
}

function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
```

- [ ] **Step 6: Run action tests**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/game/actions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/lib/game
git commit -m "feat: add game repository actions"
```

## Task 6: Build The Room UI Phases

**Files:**
- Create: `projects/pickup-texts-ranked/src/components/game/home-screen.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/lobby-screen.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/thread-view.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/submit-phase.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/vote-phase.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/reveal-phase.tsx`
- Create: `projects/pickup-texts-ranked/src/components/game/recap-screen.tsx`
- Test: `projects/pickup-texts-ranked/src/components/game/game-screens.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `projects/pickup-texts-ranked/src/components/game/game-screens.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./home-screen";
import { LobbyScreen } from "./lobby-screen";
import { ThreadView } from "./thread-view";
import { SubmitPhase } from "./submit-phase";
import { VotePhase } from "./vote-phase";
import { RevealPhase } from "./reveal-phase";

describe("game screens", () => {
  it("renders create and join controls on the home screen", () => {
    render(<HomeScreen onCreateRoom={vi.fn()} onJoinRoom={vi.fn()} />);
    expect(screen.getByRole("button", { name: /create room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join room/i })).toBeInTheDocument();
  });

  it("shows the room code and host start control in lobby", () => {
    render(<LobbyScreen code="ABCD" players={["Max", "Sam"]} isHost onStart={vi.fn()} />);
    expect(screen.getByText("ABCD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start match/i })).toBeEnabled();
  });

  it("renders the growing text thread", () => {
    render(<ThreadView messages={[{ id: "m1", side: "them", body: "wyd tonight?", badge: "book" }]} />);
    expect(screen.getByText("wyd tonight?")).toBeInTheDocument();
  });

  it("submits a trimmed reply", async () => {
    const onSubmit = vi.fn();
    render(<SubmitPhase disabled={false} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your next text/i), "  maybe energy  ");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith("maybe energy");
  });

  it("casts a vote for an anonymous reply", async () => {
    const onVote = vi.fn();
    render(<VotePhase submissions={[{ id: "sub-1", body: "unblock me respectfully" }]} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /vote for reply 1/i }));
    expect(onVote).toHaveBeenCalledWith("sub-1");
  });

  it("reveals the winning author", () => {
    render(<RevealPhase winningBody="wyd but make it federal" authorName="Sam" badges={["brilliant"]} onContinue={vi.fn()} isHost />);
    expect(screen.getByText(/Sam/i)).toBeInTheDocument();
    expect(screen.getByText(/brilliant/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/components/game/game-screens.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Add UI components**

Create the components with these public props and accessible controls:

`projects/pickup-texts-ranked/src/components/game/home-screen.tsx`

```tsx
"use client";

import { useState } from "react";

interface HomeScreenProps {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (code: string, displayName: string) => void;
}

export function HomeScreen({ onCreateRoom, onJoinRoom }: HomeScreenProps) {
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <p className="font-mono text-sm text-emerald-300">1843 ELO</p>
          <h1 className="text-4xl font-semibold">Pickup Texts Ranked</h1>
          <p className="mt-2 max-w-2xl text-zinc-300">Build the most cursed group text thread your friends can survive.</p>
        </div>
        <div className="grid gap-3 sm:max-w-md">
          <label className="text-sm font-medium" htmlFor="display-name">Display name</label>
          <input id="display-name" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <button className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950" onClick={() => onCreateRoom(displayName)}>Create room</button>
          <label className="text-sm font-medium" htmlFor="room-code">Room code</label>
          <input id="room-code" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono uppercase" value={code} onChange={(event) => setCode(event.target.value)} />
          <button className="rounded-md border border-zinc-700 px-4 py-2 font-semibold" onClick={() => onJoinRoom(code, displayName)}>Join room</button>
        </div>
      </section>
    </main>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/lobby-screen.tsx`

```tsx
interface LobbyScreenProps {
  code: string;
  players: string[];
  isHost: boolean;
  onStart: () => void;
}

export function LobbyScreen({ code, players, isHost, onStart }: LobbyScreenProps) {
  return (
    <section className="grid gap-6">
      <div>
        <p className="text-sm text-zinc-400">Room code</p>
        <p className="font-mono text-5xl font-bold tracking-normal text-emerald-300">{code}</p>
      </div>
      <ul className="grid gap-2">
        {players.map((player) => <li className="rounded-md bg-zinc-900 px-3 py-2" key={player}>{player}</li>)}
      </ul>
      <button className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-50" disabled={!isHost} onClick={onStart}>
        Start match
      </button>
    </section>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/thread-view.tsx`

```tsx
interface ThreadMessage {
  id: string;
  side: "you" | "them";
  body: string;
  badge?: string;
}

export function ThreadView({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => (
        <li className={message.side === "you" ? "self-end" : "self-start"} key={message.id}>
          <div className={message.side === "you" ? "rounded-md bg-violet-700 px-4 py-3" : "rounded-md bg-zinc-800 px-4 py-3"}>
            <p>{message.body}</p>
            {message.badge ? <span className="mt-2 inline-block rounded bg-emerald-400 px-2 py-1 text-xs font-bold text-zinc-950">{message.badge}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/submit-phase.tsx`

```tsx
"use client";

import { useState } from "react";

export function SubmitPhase({ disabled, onSubmit }: { disabled: boolean; onSubmit: (body: string) => void }) {
  const [body, setBody] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(body.trim());
      }}
    >
      <label className="text-sm font-medium" htmlFor="reply">Your next text</label>
      <textarea id="reply" className="min-h-28 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" maxLength={220} value={body} onChange={(event) => setBody(event.target.value)} />
      <button className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-50" disabled={disabled || body.trim().length === 0}>Submit</button>
    </form>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/vote-phase.tsx`

```tsx
interface AnonymousSubmission {
  id: string;
  body: string;
}

export function VotePhase({ submissions, onVote }: { submissions: AnonymousSubmission[]; onVote: (submissionId: string) => void }) {
  return (
    <div className="grid gap-3">
      {submissions.map((submission, index) => (
        <button className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-left" key={submission.id} onClick={() => onVote(submission.id)}>
          <span className="mb-2 block font-mono text-xs text-zinc-400">Reply {index + 1}</span>
          {submission.body}
          <span className="sr-only">Vote for reply {index + 1}</span>
        </button>
      ))}
    </div>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/reveal-phase.tsx`

```tsx
interface RevealPhaseProps {
  winningBody: string;
  authorName: string;
  badges: string[];
  isHost: boolean;
  onContinue: () => void;
}

export function RevealPhase({ winningBody, authorName, badges, isHost, onContinue }: RevealPhaseProps) {
  return (
    <section className="grid gap-4">
      <p className="text-sm uppercase text-emerald-300">Winning move</p>
      <blockquote className="rounded-md bg-violet-700 px-4 py-3 text-xl">{winningBody}</blockquote>
      <p>Written by <strong>{authorName}</strong></p>
      <div className="flex flex-wrap gap-2">{badges.map((badge) => <span className="rounded bg-emerald-400 px-2 py-1 text-sm font-bold text-zinc-950" key={badge}>{badge}</span>)}</div>
      <button className="rounded-md border border-zinc-700 px-4 py-2 disabled:opacity-50" disabled={!isHost} onClick={onContinue}>Continue</button>
    </section>
  );
}
```

`projects/pickup-texts-ranked/src/components/game/recap-screen.tsx`

```tsx
export function RecapScreen({ scores }: { scores: Array<{ name: string; score: number }> }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Final recap</h2>
      <ol className="grid gap-2">
        {scores.map((score) => (
          <li className="flex justify-between rounded-md bg-zinc-900 px-3 py-2" key={score.name}>
            <span>{score.name}</span>
            <span className="font-mono text-emerald-300">{score.score} ELO</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Run UI tests**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/components/game/game-screens.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/components/game
git commit -m "feat: add game phase components"
```

## Task 7: Wire Routes, Realtime, And Room State

**Files:**
- Create: `projects/pickup-texts-ranked/src/app/page.tsx`
- Create: `projects/pickup-texts-ranked/src/app/room/[code]/page.tsx`
- Create: `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`
- Create: `projects/pickup-texts-ranked/src/lib/game/use-room-realtime.ts`
- Modify: `projects/pickup-texts-ranked/src/app/layout.tsx`
- Modify: `projects/pickup-texts-ranked/src/app/globals.css`

- [ ] **Step 1: Add realtime hook**

Create `projects/pickup-texts-ranked/src/lib/game/use-room-realtime.ts`:

```ts
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

export function useRoomRealtime(roomId: string | null, onChange: () => void) {
  useEffect(() => {
    if (!roomId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` }, onChange)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, onChange]);
}
```

- [ ] **Step 2: Add app home route**

Replace `projects/pickup-texts-ranked/src/app/page.tsx`:

```tsx
import { HomeScreen } from "@/components/game/home-screen";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <HomeScreen
      onCreateRoom={() => {
        throw new Error("Create room action wiring lands in the next step.");
      }}
      onJoinRoom={() => {
        throw new Error("Join room action wiring lands in the next step.");
      }}
    />
  );
}
```

- [ ] **Step 3: Add room page shell**

Create `projects/pickup-texts-ranked/src/app/room/[code]/page.tsx`:

```tsx
import { RoomClient } from "./room-client";

export const dynamic = "force-dynamic";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  return <RoomClient code={code.toUpperCase()} />;
}
```

Create `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

export function RoomClient({ code }: { code: string }) {
  const [phase, setPhase] = useState<"lobby" | "submit" | "vote" | "reveal" | "recap">("lobby");
  const refetch = useCallback(() => {
    setPhase((current) => current);
  }, []);

  useRoomRealtime(null, refetch);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-5xl gap-6">
        <ThreadView messages={[{ id: "prompt", side: "them", body: "lol what are you doing tonight?", badge: "book" }]} />
        {phase === "lobby" ? <LobbyScreen code={code} players={["You"]} isHost onStart={() => setPhase("submit")} /> : null}
        {phase === "submit" ? <SubmitPhase disabled={false} onSubmit={() => setPhase("vote")} /> : null}
        {phase === "vote" ? <VotePhase submissions={[{ id: "sub-1", body: "wyd but make it federal" }]} onVote={() => setPhase("reveal")} /> : null}
        {phase === "reveal" ? <RevealPhase winningBody="wyd but make it federal" authorName="You" badges={["brilliant"]} isHost onContinue={() => setPhase("recap")} /> : null}
        {phase === "recap" ? <RecapScreen scores={[{ name: "You", score: 1235 }]} /> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Fix layout font placement and metadata**

Modify `projects/pickup-texts-ranked/src/app/layout.tsx` so the font variables live on `<html>`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pickup Texts Ranked",
  description: "A remote party game for unhinged pickup text threads.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Adjust global CSS palette**

Keep Tailwind scaffold content, but ensure `projects/pickup-texts-ranked/src/app/globals.css` uses readable base colors and literal Geist names in `@theme inline`:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;
}

body {
  background: #09090b;
  color: #fafafa;
  font-family: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
}

button,
input,
textarea {
  font: inherit;
}
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/app projects/pickup-texts-ranked/src/lib/game/use-room-realtime.ts
git commit -m "feat: wire room routes and realtime shell"
```

## Task 8: Connect Routes To Real Actions

**Files:**
- Modify: `projects/pickup-texts-ranked/src/app/page.tsx`
- Modify: `projects/pickup-texts-ranked/src/app/room/[code]/page.tsx`
- Modify: `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`
- Create: `projects/pickup-texts-ranked/src/app/actions.ts`

- [ ] **Step 1: Add route-facing server actions**

Create `projects/pickup-texts-ranked/src/app/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { ensureAnonymousUser } from "@/lib/auth/anonymous";
import { createGameActions } from "@/lib/game/actions";
import { createSupabaseGameRepository } from "@/lib/game/supabase-repository";
import { createClient } from "@/lib/supabase/server";

async function getActions() {
  const supabase = await createClient();
  const user = await ensureAnonymousUser(supabase);
  return createGameActions(createSupabaseGameRepository(supabase), async () => user);
}

export async function createRoomAction(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "");
  const actions = await getActions();
  const room = await actions.createRoom(displayName);
  redirect(`/room/${room.code}`);
}

export async function joinRoomAction(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "");
  const code = String(formData.get("code") ?? "");
  const actions = await getActions();
  const room = await actions.joinRoom(code, displayName);
  redirect(`/room/${room.code}`);
}
```

- [ ] **Step 2: Replace home callbacks with forms**

Modify `HomeScreen` to support form action props instead of only callback props, or wrap it in `src/app/page.tsx` with plain forms. Use the lower-risk wrapper:

```tsx
import { createRoomAction, joinRoomAction } from "./actions";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-5xl gap-6">
        <div>
          <p className="font-mono text-sm text-emerald-300">1843 ELO</p>
          <h1 className="text-4xl font-semibold">Pickup Texts Ranked</h1>
          <p className="mt-2 max-w-2xl text-zinc-300">Build the most cursed group text thread your friends can survive.</p>
        </div>
        <div className="grid gap-6 sm:max-w-md">
          <form action={createRoomAction} className="grid gap-3">
            <label htmlFor="create-display-name">Display name</label>
            <input id="create-display-name" name="displayName" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" required maxLength={24} />
            <button className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950">Create room</button>
          </form>
          <form action={joinRoomAction} className="grid gap-3">
            <label htmlFor="join-display-name">Display name</label>
            <input id="join-display-name" name="displayName" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2" required maxLength={24} />
            <label htmlFor="room-code">Room code</label>
            <input id="room-code" name="code" className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono uppercase" required maxLength={8} />
            <button className="rounded-md border border-zinc-700 px-4 py-2 font-semibold">Join room</button>
          </form>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Add client mutation callbacks for room phases**

In `room-client.tsx`, replace local phase-only callbacks with props that can call action wrappers. Keep the UI responsive by using `useTransition`:

```tsx
"use client";

import { useCallback, useState, useTransition } from "react";
import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";

interface RoomClientProps {
  code: string;
  roomId: string | null;
}

export function RoomClient({ code, roomId }: RoomClientProps) {
  const [phase, setPhase] = useState<"lobby" | "submit" | "vote" | "reveal" | "recap">("lobby");
  const [isPending, startTransition] = useTransition();
  const refetch = useCallback(() => {
    setPhase((current) => current);
  }, []);

  useRoomRealtime(roomId, refetch);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-5xl gap-6">
        <ThreadView messages={[{ id: "prompt", side: "them", body: "lol what are you doing tonight?", badge: "book" }]} />
        {phase === "lobby" ? <LobbyScreen code={code} players={["You"]} isHost onStart={() => startTransition(() => setPhase("submit"))} /> : null}
        {phase === "submit" ? <SubmitPhase disabled={isPending} onSubmit={() => startTransition(() => setPhase("vote"))} /> : null}
        {phase === "vote" ? <VotePhase submissions={[{ id: "sub-1", body: "wyd but make it federal" }]} onVote={() => startTransition(() => setPhase("reveal"))} /> : null}
        {phase === "reveal" ? <RevealPhase winningBody="wyd but make it federal" authorName="You" badges={["brilliant"]} isHost onContinue={() => startTransition(() => setPhase("recap"))} /> : null}
        {phase === "recap" ? <RecapScreen scores={[{ name: "You", score: 1235 }]} /> : null}
      </section>
    </main>
  );
}
```

This step can still use local demo data. The next task replaces demo state with loaded Supabase room state.

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/app projects/pickup-texts-ranked/src/components/game/home-screen.tsx
git commit -m "feat: connect home route to room actions"
```

## Task 9: Replace Demo Room State With Supabase Room Data

**Files:**
- Create: `projects/pickup-texts-ranked/src/lib/game/load-room.ts`
- Modify: `projects/pickup-texts-ranked/src/app/room/[code]/page.tsx`
- Modify: `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`
- Test: `projects/pickup-texts-ranked/src/lib/game/load-room.test.ts`

- [ ] **Step 1: Write failing room-load tests**

Create `projects/pickup-texts-ranked/src/lib/game/load-room.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapRoomView } from "./load-room";

describe("mapRoomView", () => {
  it("maps joined room rows into UI state", () => {
    expect(
      mapRoomView({
        room: { id: "room-1", code: "ABCD", phase: "lobby", host_player_id: "player-1" },
        players: [
          { id: "player-1", display_name: "Max", score: 1200, kicked_at: null },
          { id: "player-2", display_name: "Sam", score: 1195, kicked_at: null },
        ],
        turns: [],
        submissions: [],
        badges: [],
      }),
    ).toMatchObject({
      roomId: "room-1",
      code: "ABCD",
      phase: "lobby",
      players: [
        { id: "player-1", name: "Max", score: 1200 },
        { id: "player-2", name: "Sam", score: 1195 },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/game/load-room.test.ts
```

Expected: FAIL because `load-room` does not exist.

- [ ] **Step 3: Add room view mapper and loader**

Create `projects/pickup-texts-ranked/src/lib/game/load-room.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

interface RoomRows {
  room: { id: string; code: string; phase: string; host_player_id: string | null };
  players: Array<{ id: string; display_name: string; score: number; kicked_at: string | null }>;
  turns: Array<{ id: string; prompt_text: string; winning_submission_id: string | null }>;
  submissions: Array<{ id: string; body: string; player_id: string; selected: boolean }>;
  badges: Array<{ player_id: string; badge_type: string; reason: string }>;
}

export interface RoomView {
  roomId: string;
  code: string;
  phase: string;
  hostPlayerId: string | null;
  players: Array<{ id: string; name: string; score: number }>;
  messages: Array<{ id: string; side: "you" | "them"; body: string; badge?: string }>;
}

export function mapRoomView(rows: RoomRows): RoomView {
  return {
    roomId: rows.room.id,
    code: rows.room.code,
    phase: rows.room.phase,
    hostPlayerId: rows.room.host_player_id,
    players: rows.players
      .filter((player) => !player.kicked_at)
      .map((player) => ({ id: player.id, name: player.display_name, score: player.score })),
    messages: rows.turns.flatMap((turn) => {
      const selected = rows.submissions.find((submission) => submission.id === turn.winning_submission_id);
      return [
        { id: `${turn.id}:prompt`, side: "them" as const, body: turn.prompt_text, badge: "book" },
        ...(selected ? [{ id: selected.id, side: "you" as const, body: selected.body, badge: "brilliant" }] : []),
      ];
    }),
  };
}

export async function loadRoomByCode(code: string): Promise<RoomView | null> {
  const supabase = await createClient();
  const { data: room, error: roomError } = await supabase.from("rooms").select("id, code, phase, host_player_id").eq("code", code).single();
  if (roomError || !room) return null;

  const [{ data: players }, { data: turns }] = await Promise.all([
    supabase.from("players").select("id, display_name, score, kicked_at").eq("room_id", room.id).order("created_at"),
    supabase.from("turns").select("id, prompt_text, winning_submission_id").order("turn_index"),
  ]);

  const turnIds = (turns ?? []).map((turn: any) => turn.id);
  const { data: submissions } = turnIds.length
    ? await supabase.from("submissions").select("id, body, player_id, selected").in("turn_id", turnIds)
    : { data: [] };

  return mapRoomView({
    room,
    players: players ?? [],
    turns: turns ?? [],
    submissions: submissions ?? [],
    badges: [],
  });
}
```

- [ ] **Step 4: Use loaded room data in route**

Modify `src/app/room/[code]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadRoomByCode } from "@/lib/game/load-room";
import { RoomClient } from "./room-client";

export const dynamic = "force-dynamic";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  const room = await loadRoomByCode(code.toUpperCase());
  if (!room) notFound();
  return <RoomClient initialRoom={room} />;
}
```

Modify `room-client.tsx` to accept `initialRoom` and render its values:

```tsx
"use client";

import { useCallback, useState, useTransition } from "react";
import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";
import type { RoomView } from "@/lib/game/load-room";

export function RoomClient({ initialRoom }: { initialRoom: RoomView }) {
  const [phase, setPhase] = useState(initialRoom.phase);
  const [isPending, startTransition] = useTransition();
  const refetch = useCallback(() => {
    window.location.reload();
  }, []);

  useRoomRealtime(initialRoom.roomId, refetch);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-5xl gap-6">
        <ThreadView messages={initialRoom.messages.length ? initialRoom.messages : [{ id: "empty", side: "them", body: "Waiting for the host to start...", badge: "book" }]} />
        {phase === "lobby" ? <LobbyScreen code={initialRoom.code} players={initialRoom.players.map((player) => player.name)} isHost onStart={() => startTransition(() => setPhase("submit"))} /> : null}
        {phase === "submit" ? <SubmitPhase disabled={isPending} onSubmit={() => startTransition(() => setPhase("vote"))} /> : null}
        {phase === "vote" ? <VotePhase submissions={[{ id: "sub-1", body: "wyd but make it federal" }]} onVote={() => startTransition(() => setPhase("reveal"))} /> : null}
        {phase === "reveal" ? <RevealPhase winningBody="wyd but make it federal" authorName="You" badges={["brilliant"]} isHost onContinue={() => startTransition(() => setPhase("recap"))} /> : null}
        {phase === "recap" ? <RecapScreen scores={initialRoom.players.map((player) => ({ name: player.name, score: player.score }))} /> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/lib/game/load-room.ts projects/pickup-texts-ranked/src/lib/game/load-room.test.ts projects/pickup-texts-ranked/src/app/room
git commit -m "feat: load room state from Supabase"
```

## Task 10: Wire The Playable Submit, Vote, Reveal Loop

**Files:**
- Modify: `projects/pickup-texts-ranked/src/lib/game/load-room.ts`
- Create: `projects/pickup-texts-ranked/src/app/room/[code]/actions.ts`
- Modify: `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`
- Test: `projects/pickup-texts-ranked/src/lib/game/load-room.test.ts`

- [ ] **Step 1: Extend room-load test for active turn data**

Append this test to `projects/pickup-texts-ranked/src/lib/game/load-room.test.ts`:

```ts
it("maps current turn submissions and selected winner into UI state", () => {
  expect(
    mapRoomView({
      room: { id: "room-1", code: "ABCD", phase: "vote", host_player_id: "player-1" },
      currentUserId: "user-2",
      players: [
        { id: "player-1", user_id: "user-1", display_name: "Max", score: 1200, kicked_at: null },
        { id: "player-2", user_id: "user-2", display_name: "Sam", score: 1195, kicked_at: null },
      ],
      turns: [{ id: "turn-1", prompt_text: "wyd tonight?", winning_submission_id: null }],
      submissions: [
        { id: "sub-1", body: "come over and rank my notes app", player_id: "player-1", selected: false },
      ],
      badges: [],
    }),
  ).toMatchObject({
    currentPlayerId: "player-2",
    currentTurnId: "turn-1",
    phase: "vote",
    submissions: [{ id: "sub-1", body: "come over and rank my notes app", authorPlayerId: "player-1" }],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test -- src/lib/game/load-room.test.ts
```

Expected: FAIL because `RoomView` does not expose `currentPlayerId`, `currentTurnId`, or `submissions`.

- [ ] **Step 3: Extend room view mapping**

Modify `projects/pickup-texts-ranked/src/lib/game/load-room.ts` so the row and view types include the active player and turn:

```ts
interface RoomRows {
  room: { id: string; code: string; phase: string; host_player_id: string | null };
  currentUserId?: string;
  players: Array<{ id: string; user_id: string; display_name: string; score: number; kicked_at: string | null }>;
  turns: Array<{ id: string; prompt_text: string; winning_submission_id: string | null }>;
  submissions: Array<{ id: string; body: string; player_id: string; selected: boolean }>;
  badges: Array<{ player_id: string; badge_type: string; reason: string }>;
}

export interface RoomView {
  roomId: string;
  code: string;
  phase: string;
  hostPlayerId: string | null;
  currentPlayerId: string | null;
  currentTurnId: string | null;
  players: Array<{ id: string; name: string; score: number }>;
  submissions: Array<{ id: string; body: string; authorPlayerId: string }>;
  selectedSubmission: { id: string; body: string; authorName: string } | null;
  messages: Array<{ id: string; side: "you" | "them"; body: string; badge?: string }>;
}
```

Replace `mapRoomView` with:

```ts
export function mapRoomView(rows: RoomRows): RoomView {
  const activePlayers = rows.players.filter((player) => !player.kicked_at);
  const currentPlayer = activePlayers.find((player) => player.user_id === rows.currentUserId) ?? null;
  const currentTurn = rows.turns.at(-1) ?? null;
  const selected = rows.submissions.find((submission) => submission.id === currentTurn?.winning_submission_id) ?? null;
  const selectedAuthor = selected ? activePlayers.find((player) => player.id === selected.player_id) : null;

  return {
    roomId: rows.room.id,
    code: rows.room.code,
    phase: rows.room.phase,
    hostPlayerId: rows.room.host_player_id,
    currentPlayerId: currentPlayer?.id ?? null,
    currentTurnId: currentTurn?.id ?? null,
    players: activePlayers.map((player) => ({ id: player.id, name: player.display_name, score: player.score })),
    submissions: rows.submissions.map((submission) => ({
      id: submission.id,
      body: submission.body,
      authorPlayerId: submission.player_id,
    })),
    selectedSubmission: selected
      ? { id: selected.id, body: selected.body, authorName: selectedAuthor?.display_name ?? "Unknown" }
      : null,
    messages: rows.turns.flatMap((turn) => {
      const winning = rows.submissions.find((submission) => submission.id === turn.winning_submission_id);
      return [
        { id: `${turn.id}:prompt`, side: "them" as const, body: turn.prompt_text, badge: "book" },
        ...(winning ? [{ id: winning.id, side: "you" as const, body: winning.body, badge: "brilliant" }] : []),
      ];
    }),
  };
}
```

In `loadRoomByCode`, fetch the current user before querying room data and include `user_id` in player rows:

```ts
export async function loadRoomByCode(code: string): Promise<RoomView | null> {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const currentUserId = userResult.user?.id;

  const { data: room, error: roomError } = await supabase.from("rooms").select("id, code, phase, host_player_id").eq("code", code).single();
  if (roomError || !room) return null;

  const [{ data: players }, { data: turns }] = await Promise.all([
    supabase.from("players").select("id, user_id, display_name, score, kicked_at").eq("room_id", room.id).order("created_at"),
    supabase.from("turns").select("id, prompt_text, winning_submission_id").order("turn_index"),
  ]);

  const turnIds = (turns ?? []).map((turn: any) => turn.id);
  const { data: submissions } = turnIds.length
    ? await supabase.from("submissions").select("id, body, player_id, selected").in("turn_id", turnIds)
    : { data: [] };

  return mapRoomView({
    room,
    currentUserId,
    players: players ?? [],
    turns: turns ?? [],
    submissions: submissions ?? [],
    badges: [],
  });
}
```

- [ ] **Step 4: Add room route server actions**

Create `projects/pickup-texts-ranked/src/app/room/[code]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ensureAnonymousUser } from "@/lib/auth/anonymous";
import { createGameActions } from "@/lib/game/actions";
import { createSupabaseGameRepository } from "@/lib/game/supabase-repository";
import { createClient } from "@/lib/supabase/server";

async function getActions() {
  const supabase = await createClient();
  const user = await ensureAnonymousUser(supabase);
  return createGameActions(createSupabaseGameRepository(supabase), async () => user);
}

export async function startMatchAction(code: string, roomId: string, playerId: string) {
  const actions = await getActions();
  await actions.startMatch(roomId, playerId);
  revalidatePath(`/room/${code}`);
}

export async function submitMessageAction(code: string, turnId: string, playerId: string, body: string) {
  const actions = await getActions();
  await actions.submitMessage(turnId, playerId, body);
  revalidatePath(`/room/${code}`);
}

export async function castVoteAction(code: string, turnId: string, playerId: string, submissionId: string) {
  const actions = await getActions();
  await actions.castVote(turnId, playerId, submissionId);
  revalidatePath(`/room/${code}`);
}

export async function revealTurnAction(code: string, turnId: string, hostPlayerId: string) {
  const actions = await getActions();
  await actions.revealTurn(turnId, hostPlayerId);
  revalidatePath(`/room/${code}`);
}

export async function advancePhaseAction(code: string, roomId: string, playerId: string) {
  const actions = await getActions();
  await actions.advancePhase(roomId, playerId);
  revalidatePath(`/room/${code}`);
}
```

- [ ] **Step 5: Use real room data and actions in `RoomClient`**

Replace `projects/pickup-texts-ranked/src/app/room/[code]/room-client.tsx`:

```tsx
"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LobbyScreen } from "@/components/game/lobby-screen";
import { RecapScreen } from "@/components/game/recap-screen";
import { RevealPhase } from "@/components/game/reveal-phase";
import { SubmitPhase } from "@/components/game/submit-phase";
import { ThreadView } from "@/components/game/thread-view";
import { VotePhase } from "@/components/game/vote-phase";
import { useRoomRealtime } from "@/lib/game/use-room-realtime";
import type { RoomView } from "@/lib/game/load-room";
import { advancePhaseAction, castVoteAction, revealTurnAction, startMatchAction, submitMessageAction } from "./actions";

export function RoomClient({ initialRoom }: { initialRoom: RoomView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isHost = initialRoom.currentPlayerId === initialRoom.hostPlayerId;
  const refresh = useCallback(() => router.refresh(), [router]);

  useRoomRealtime(initialRoom.roomId, refresh);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-50">
      <section className="mx-auto grid max-w-5xl gap-6">
        <ThreadView messages={initialRoom.messages.length ? initialRoom.messages : [{ id: "empty", side: "them", body: "Waiting for the host to start...", badge: "book" }]} />

        {initialRoom.phase === "lobby" ? (
          <LobbyScreen
            code={initialRoom.code}
            players={initialRoom.players.map((player) => player.name)}
            isHost={isHost}
            onStart={() => startTransition(() => startMatchAction(initialRoom.code, initialRoom.roomId, initialRoom.currentPlayerId!))}
          />
        ) : null}

        {initialRoom.phase === "prompt" && isHost ? (
          <button className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-zinc-950" onClick={() => startTransition(() => advancePhaseAction(initialRoom.code, initialRoom.roomId, initialRoom.currentPlayerId!))}>
            Open submissions
          </button>
        ) : null}

        {initialRoom.phase === "submit" && initialRoom.currentTurnId && initialRoom.currentPlayerId ? (
          <SubmitPhase
            disabled={isPending}
            onSubmit={(body) => startTransition(() => submitMessageAction(initialRoom.code, initialRoom.currentTurnId!, initialRoom.currentPlayerId!, body))}
          />
        ) : null}

        {initialRoom.phase === "vote" && initialRoom.currentTurnId && initialRoom.currentPlayerId ? (
          <VotePhase
            submissions={initialRoom.submissions.filter((submission) => submission.authorPlayerId !== initialRoom.currentPlayerId)}
            onVote={(submissionId) => startTransition(() => castVoteAction(initialRoom.code, initialRoom.currentTurnId!, initialRoom.currentPlayerId!, submissionId))}
          />
        ) : null}

        {initialRoom.phase === "vote" && isHost && initialRoom.currentTurnId ? (
          <button className="rounded-md border border-zinc-700 px-4 py-2" onClick={() => startTransition(() => revealTurnAction(initialRoom.code, initialRoom.currentTurnId!, initialRoom.currentPlayerId!))}>
            Reveal winner
          </button>
        ) : null}

        {initialRoom.phase === "reveal" && initialRoom.selectedSubmission ? (
          <RevealPhase
            winningBody={initialRoom.selectedSubmission.body}
            authorName={initialRoom.selectedSubmission.authorName}
            badges={["brilliant"]}
            isHost={isHost}
            onContinue={() => startTransition(() => advancePhaseAction(initialRoom.code, initialRoom.roomId, initialRoom.currentPlayerId!))}
          />
        ) : null}

        {initialRoom.phase === "recap" ? <RecapScreen scores={initialRoom.players.map((player) => ({ name: player.name, score: player.score }))} /> : null}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/src/lib/game/load-room.ts projects/pickup-texts-ranked/src/lib/game/load-room.test.ts projects/pickup-texts-ranked/src/app/room
git commit -m "feat: wire playable room loop"
```

## Task 11: Add End-To-End Verification

**Files:**
- Create: `projects/pickup-texts-ranked/e2e/static-room-flow.spec.ts`
- Modify: implementation files only if Playwright finds UI defects

- [ ] **Step 1: Add browser smoke test**

Create `projects/pickup-texts-ranked/e2e/static-room-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("home page shows create and join paths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pickup Texts Ranked" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join room" })).toBeVisible();
});
```

- [ ] **Step 2: Run full verification**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run build
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run e2e
```

Expected: unit tests pass, build passes, and Playwright verifies the desktop and mobile home screen.

- [ ] **Step 3: Manual browser verification**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example npm run dev
```

Open `http://localhost:3000`. Verify:

- home screen is the playable entry, not a landing page;
- text fits on desktop and mobile widths;
- room code styling is readable from a Discord stream;
- phase components do not overlap;
- palette is not a one-note purple/blue gradient.

- [ ] **Step 4: Commit**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked/e2e projects/pickup-texts-ranked
git commit -m "test: add browser verification"
```

## Task 12: Supabase Project Integration Checkpoint

**Files:**
- Modify: `projects/pickup-texts-ranked/.env.local` locally only, never commit
- Modify: migration/repository files only if live Supabase verification reveals issues

- [ ] **Step 1: Configure a real Supabase project**

In the Supabase dashboard:

- enable Anonymous Sign-Ins under Auth providers;
- create or choose a project;
- copy Project URL and Publishable key.

Create local `projects/pickup-texts-ranked/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=<project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

- [ ] **Step 2: Apply schema**

Use Supabase CLI if linked:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Expected: migration applies without RLS or grant errors.

- [ ] **Step 3: Run live room test**

Run:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npm run dev
```

Open two browser contexts:

- context A creates a room as `Max`;
- context B joins with the room code as `Sam`;
- both contexts show the same lobby after refresh;
- Supabase dashboard shows rows in `rooms` and `players`;
- no service-role key is present in browser code.

- [ ] **Step 4: Run advisors after schema changes**

Run if CLI supports it:

```bash
cd /Users/maxaitel/Documents/monorepo/projects/pickup-texts-ranked
npx supabase db advisors
```

Expected: no critical RLS/security findings. Fix any missing RLS, missing grants, or policy issues before continuing.

- [ ] **Step 5: Commit integration fixes**

```bash
cd /Users/maxaitel/Documents/monorepo
git add projects/pickup-texts-ranked
git commit -m "fix: verify Supabase room integration"
```

## Self-Review

- Spec coverage: the plan covers remote room creation/joining, anonymous auth, Supabase persistence, RLS/grants, Thread Builder phases, player-voted scoring, reveal/recap, refresh/realtime refetch behavior, host-only controls, and desktop/mobile verification.
- Intentional v1 limitation: browser smoke coverage is broad before a live Supabase project is configured; Task 12 performs the real two-player live room check after credentials and schema are available.
- Red-flag scan: no unfinished-marker terms or unspecified deferred work remains. Where credentials/project refs are needed, the plan gives exact local-only env variable names and commands.
- Type consistency: phase names, badge names, score resolution types, and repository method names match the domain definitions.
