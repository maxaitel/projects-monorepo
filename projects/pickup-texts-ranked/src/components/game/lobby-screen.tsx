"use client";

import { Copy, Crown, Play } from "lucide-react";
import { useState } from "react";

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
  const [copied, setCopied] = useState(false);
  const invitePath = `/room/${code}`;

  async function copyInviteLink() {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    await navigator.clipboard?.writeText(`${origin}${invitePath}`);
    setCopied(true);
  }

  return (
    <section className="bento-card flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[var(--foreground)] opacity-60">Room Link</p>
          <p className="font-mono text-xs text-[var(--foreground)] opacity-80">{invitePath}</p>
          <button
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 text-xs font-bold uppercase tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            onClick={() => void copyInviteLink()}
            type="button"
          >
            <Copy aria-hidden="true" size={16} />
            {copied ? "Copied" : "Copy Link"}
          </button>
        </div>
        {isHost ? (
          <button
            className="btn-primary inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-6 text-sm font-bold uppercase tracking-wide"
            onClick={onStart}
            type="button"
          >
            <Play aria-hidden="true" size={18} fill="currentColor" />
            Start Game
          </button>
        ) : (
          <p className="flex h-12 items-center justify-center rounded-lg border border-[var(--border-color)] px-6 text-sm font-bold uppercase tracking-wide text-[var(--foreground)] opacity-80">
            Waiting for Host
          </p>
        )}
      </div>

      <hr className="border-[var(--border-color)]" />

      <div>
        <h2 className="mb-4 font-display text-2xl font-bold text-[var(--foreground)]">Roster</h2>
        <ul className="grid gap-3" aria-label="Players">
          {players.map((player) => (
            <li
              className="input-solid flex min-h-12 items-center justify-between rounded-lg px-4 text-sm font-bold text-[var(--foreground)]"
              key={player.id}
            >
              <span className="truncate uppercase tracking-wide">{player.name}</span>
              <span className="flex items-center gap-3">
                {typeof player.score === "number" ? (
                  <span className="font-mono text-sm font-bold text-[var(--accent)]">{player.score}</span>
                ) : null}
                {player.isHost ? (
                  <Crown aria-label="Host" className="text-[var(--accent)]" size={18} strokeWidth={2.5} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
