"use client";

import { useActionState } from "react";
import { LogIn, Plus } from "lucide-react";

import {
  createRoomStateAction,
  joinRoomStateAction,
  type HomeActionState,
} from "./actions";

const initialActionState: HomeActionState = {};

const inputClass =
  "h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20";

const buttonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

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
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50 shadow-sm sm:p-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Pickup Texts Ranked</h1>
        <p className="text-sm text-zinc-400">Set your name, then host or enter a room.</p>
      </div>

      <form action={createAction} className="grid gap-3">
        {createState.error ? (
          <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100" role="alert">
            {createState.error}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Display name
          <input
            className={inputClass}
            maxLength={24}
            name="displayName"
            placeholder="Mina"
            required
          />
        </label>
        <button
          className={`${buttonClass} bg-cyan-400 text-zinc-950 hover:bg-cyan-300`}
          disabled={isCreatePending}
          type="submit"
        >
          <Plus aria-hidden="true" size={18} />
          {isCreatePending ? "Creating..." : "Create room"}
        </button>
      </form>

      <form action={joinAction} className="grid gap-3 border-t border-zinc-800 pt-4">
        {joinState.error ? (
          <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100" role="alert">
            {joinState.error}
          </p>
        ) : null}
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Display name
          <input
            className={inputClass}
            maxLength={24}
            name="displayName"
            placeholder="Jules"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-200">
          Room code
          <input
            className={`${inputClass} uppercase tracking-[0.2em]`}
            maxLength={8}
            name="code"
            placeholder="K9M2"
            required
          />
        </label>
        <button
          className={`${buttonClass} border border-zinc-700 bg-zinc-800 text-zinc-50 hover:bg-zinc-700`}
          disabled={isJoinPending}
          type="submit"
        >
          <LogIn aria-hidden="true" size={18} />
          {isJoinPending ? "Joining..." : "Join room"}
        </button>
      </form>
    </section>
  );
}
