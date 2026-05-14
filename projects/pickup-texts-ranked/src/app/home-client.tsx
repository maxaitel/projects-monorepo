"use client";

import { useActionState } from "react";
import { LogIn, Plus } from "lucide-react";

import {
  createRoomStateAction,
  joinRoomStateAction,
  type HomeActionState,
} from "./actions";

const initialActionState: HomeActionState = {};

export function HomeClient() {
  const [createState, createAction, isCreatePending] = useActionState(
    createRoomStateAction,
    initialActionState,
  );
  const [joinState, joinAction, isJoinPending] = useActionState(
    joinRoomStateAction,
    initialActionState,
  );

  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      <section className="flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24">
        <h1 className="text-fluid-hero font-display font-black text-[var(--foreground)] uppercase">
          Pickup<br />
          Texts<br />
          <span className="text-[var(--accent)]">Ranked.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg font-medium text-[var(--foreground)] opacity-80">
          A remote party game for unhinged pickup text threads. Host a room or join your friends below.
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 pb-12 lg:px-16 lg:py-24">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="bento-card p-6 sm:p-8">
            <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Host a Game
            </h2>
            <form action={createAction} className="grid gap-4">
              {createState.error ? (
                <p className="rounded-md border border-red-500/50 bg-red-500/20 px-4 py-3 text-sm font-medium text-red-200" role="alert">
                  {createState.error}
                </p>
              ) : null}
              <label className="grid gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--foreground)] opacity-90">
                Your Display Name
                <input
                  className="input-solid h-12 w-full rounded-lg px-4 text-base font-medium placeholder:text-[var(--foreground)] placeholder:opacity-30"
                  maxLength={24}
                  name="displayName"
                  placeholder="Mina"
                  required
                />
              </label>
              <button
                className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-lg text-base font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60 mt-2"
                disabled={isCreatePending}
                type="submit"
              >
                <Plus aria-hidden="true" size={20} strokeWidth={3} />
                {isCreatePending ? "Creating..." : "Create Room"}
              </button>
            </form>
          </div>

          <div className="bento-card-light p-6 sm:p-8">
            <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
              Join a Game
            </h2>
            <form action={joinAction} className="grid gap-4">
              {joinState.error ? (
                <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">
                  {joinState.error}
                </p>
              ) : null}
              <label className="grid gap-2 text-sm font-bold uppercase tracking-wider text-[var(--card-light-fg)] opacity-80">
                Your Display Name
                <input
                  className="h-12 w-full rounded-lg border-2 border-black/10 bg-transparent px-4 text-base font-bold text-[var(--card-light-fg)] outline-none transition focus:border-black/30 placeholder:text-black/20"
                  maxLength={24}
                  name="displayName"
                  placeholder="Jules"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-bold uppercase tracking-wider text-[var(--card-light-fg)] opacity-80">
                Room Code
                <input
                  className="h-12 w-full rounded-lg border-2 border-black/10 bg-transparent px-4 text-base font-bold uppercase tracking-[0.2em] text-[var(--card-light-fg)] outline-none transition focus:border-black/30 placeholder:text-black/20"
                  maxLength={8}
                  name="code"
                  placeholder="K9M2"
                  required
                />
              </label>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[var(--card-light-fg)] text-[var(--card-light)] text-base font-bold uppercase tracking-wide transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 mt-2"
                disabled={isJoinPending}
                type="submit"
              >
                <LogIn aria-hidden="true" size={20} strokeWidth={3} />
                {isJoinPending ? "Joining..." : "Enter Room"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
