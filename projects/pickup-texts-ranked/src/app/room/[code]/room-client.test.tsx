import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RoomView } from "@/lib/game/load-room";

import { RoomClient } from "./room-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/game/use-room-realtime", () => ({
  useRoomRealtime: vi.fn(),
}));

function createRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    roomId: "room-1",
    code: "ABCD",
    phase: "submit",
    hostPlayerId: "player-host",
    currentPlayerId: "player-current",
    currentTurnId: "turn-1",
    players: [
      { id: "player-host", name: "Mina", score: 35, isHost: true },
      { id: "player-current", name: "Jules", score: 22, isHost: false },
      { id: "player-other", name: "Tavi", score: 18, isHost: false },
    ],
    messages: [
      { id: "turn-1:prompt", side: "them", body: "wyd tonight?", badge: "Prompt" },
    ],
    submissions: [],
    selectedSubmission: null,
    ...overrides,
  };
}

describe("RoomClient", () => {
  it("shows a submitted waiting state instead of another submit form for the current player's submission", () => {
    render(
      <RoomClient
        initialRoom={createRoom({
          submissions: [
            {
              id: "submission-current",
              body: "free after 8, emotionally available after snacks",
              authorPlayerId: "player-current",
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/reply submitted/i);
    expect(screen.queryByRole("button", { name: /submit reply/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/reply/i)).not.toBeInTheDocument();
  });

  it("filters the current player's known submission out of vote options while keeping anonymous options", () => {
    render(
      <RoomClient
        initialRoom={createRoom({
          phase: "vote",
          submissions: [
            {
              id: "submission-current",
              body: "my own reply should not be votable",
              authorPlayerId: "player-current",
            },
            {
              id: "submission-anonymous",
              body: "anonymous option stays visible",
              authorPlayerId: null,
            },
            {
              id: "submission-other",
              body: "another player's reply stays visible",
              authorPlayerId: "player-other",
            },
          ],
        })}
      />,
    );

    const voteSection = screen.getByRole("heading", { name: /vote anonymously/i }).closest("section")!;

    expect(within(voteSection).queryByText("my own reply should not be votable")).not.toBeInTheDocument();
    expect(within(voteSection).getByText("anonymous option stays visible")).toBeInTheDocument();
    expect(within(voteSection).getByText("another player's reply stays visible")).toBeInTheDocument();
  });
});
