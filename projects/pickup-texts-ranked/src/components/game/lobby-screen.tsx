"use client";

import { Crown, Play } from "lucide-react";

type LobbyPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  score?: number;
};

type LobbyScreenProps = {
  code: string;
  players: LobbyPlayer[];
  isHost: boolean;
  onStart: () => void;
};

export function LobbyScreen({ code, players, isHost, onStart }: LobbyScreenProps) {
  return (
    <section className="mx-auto grid w-full max-w-lg gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-50 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Room code</p>
          <p className="font-mono text-3xl font-bold tracking-[0.18em]">{code}</p>
        </div>
        {isHost ? (
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300"
            onClick={onStart}
            type="button"
          >
            <Play aria-hidden="true" size={17} />
            Start game
          </button>
        ) : (
          <p className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300">
            Waiting for host
          </p>
        )}
      </div>

      <ul className="grid gap-2" aria-label="Players">
        {players.map((player) => (
          <li
            className="flex min-h-11 items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm"
            key={player.id}
          >
            <span className="truncate font-medium">{player.name}</span>
            <span className="flex items-center gap-2">
              {typeof player.score === "number" ? (
                <span className="font-mono text-xs text-cyan-300">{player.score}</span>
              ) : null}
              {player.isHost ? (
                <Crown aria-label="Host" className="text-amber-300" size={17} />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
