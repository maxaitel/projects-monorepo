"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { joinRoomStateAction, type HomeActionState } from "@/app/actions";

const initialActionState: HomeActionState = {};

export function RoomJoinClient({ code }: { code: string }) {
  const [state, action, isPending] = useActionState(joinRoomStateAction, initialActionState);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6">
      <section className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50 shadow-sm sm:p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Room {code}</p>
          <h1 className="text-xl font-semibold">Join Pickup Texts Ranked</h1>
          <p className="text-sm text-zinc-400">Enter a display name to join this room.</p>
        </div>

        <form action={action} className="grid gap-3">
          {state.error ? (
            <p
              className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100"
              role="alert"
            >
              {state.error}
            </p>
          ) : null}
          <input name="code" type="hidden" value={code} />
          <label className="grid gap-2 text-sm font-medium text-zinc-200">
            Display name
            <input
              className="h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              maxLength={24}
              name="displayName"
              placeholder="Jules"
              required
            />
          </label>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            <LogIn aria-hidden="true" size={18} />
            {isPending ? "Joining..." : "Join room"}
          </button>
        </form>
      </section>
    </main>
  );
}
