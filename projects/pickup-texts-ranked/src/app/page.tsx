import { LogIn, Plus } from "lucide-react";

import { createRoomAction, joinRoomAction } from "./actions";

const inputClass =
  "h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20";

const buttonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6">
      <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50 shadow-sm sm:p-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Pickup Texts Ranked</h1>
          <p className="text-sm text-zinc-400">Set your name, then host or enter a room.</p>
        </div>

        <form action={createRoomAction} className="grid gap-3">
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
          <button className={`${buttonClass} bg-cyan-400 text-zinc-950 hover:bg-cyan-300`} type="submit">
            <Plus aria-hidden="true" size={18} />
            Create room
          </button>
        </form>

        <form action={joinRoomAction} className="grid gap-3 border-t border-zinc-800 pt-4">
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
            type="submit"
          >
            <LogIn aria-hidden="true" size={18} />
            Join room
          </button>
        </form>
      </section>
    </main>
  );
}
