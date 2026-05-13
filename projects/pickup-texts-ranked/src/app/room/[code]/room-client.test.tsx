import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomView } from "@/lib/game/load-room";

import { RoomClient } from "./room-client";

const actionMocks = vi.hoisted(() => ({
  advancePhaseAction: vi.fn(),
  castVoteAction: vi.fn(),
  revealTurnAction: vi.fn(),
  startMatchAction: vi.fn(),
  submitMessageAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/game/use-room-realtime", () => ({
  useRoomRealtime: vi.fn(),
}));

vi.mock("./actions", () => actionMocks);

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
    hasSubmitted: false,
    currentPlayerSubmissionId: null,
    hasVoted: false,
    ...overrides,
  };
}

describe("RoomClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a submitted waiting state instead of another submit form for the current player's submission", () => {
    render(
      <RoomClient
        initialRoom={createRoom({
          hasSubmitted: true,
          currentPlayerSubmissionId: "submission-current",
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

  it("starts the match through the room action for the host", async () => {
    const user = userEvent.setup();

    render(
      <RoomClient
        initialRoom={createRoom({
          phase: "lobby",
          currentPlayerId: "player-host",
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start game/i }));

    await waitFor(() =>
      expect(actionMocks.startMatchAction).toHaveBeenCalledWith("ABCD", "room-1", "player-host"),
    );
  });

  it("submits the current player's reply through the room action", async () => {
    const user = userEvent.setup();

    render(<RoomClient initialRoom={createRoom()} />);

    await user.type(screen.getByLabelText(/reply/i), "  meet me by the group chat  ");
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    await waitFor(() =>
      expect(actionMocks.submitMessageAction).toHaveBeenCalledWith(
        "ABCD",
        "turn-1",
        "player-current",
        "meet me by the group chat",
      ),
    );
  });

  it("lets the host open voting from the submitted waiting state", async () => {
    const user = userEvent.setup();

    render(
      <RoomClient
        initialRoom={createRoom({
          currentPlayerId: "player-host",
          hasSubmitted: true,
          currentPlayerSubmissionId: "submission-host",
          submissions: [
            {
              id: "submission-host",
              body: "host reply",
              authorPlayerId: "player-host",
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/reply submitted/i);

    await user.click(screen.getByRole("button", { name: /open voting/i }));

    await waitFor(() =>
      expect(actionMocks.advancePhaseAction).toHaveBeenCalledWith("ABCD", "room-1", "player-host"),
    );
  });

  it("casts a vote through the room action and locks the selected reply", async () => {
    const user = userEvent.setup();

    render(
      <RoomClient
        initialRoom={createRoom({
          phase: "vote",
          submissions: [
            {
              id: "submission-other",
              body: "another player's reply stays visible",
              authorPlayerId: null,
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /vote for reply 1/i }));

    await waitFor(() =>
      expect(actionMocks.castVoteAction).toHaveBeenCalledWith(
        "ABCD",
        "turn-1",
        "player-current",
        "submission-other",
      ),
    );
    expect(screen.getByRole("button", { name: /vote for reply 1/i })).toBeDisabled();
  });

  it("surfaces a recoverable host reveal error when voting is not ready", async () => {
    const user = userEvent.setup();
    actionMocks.revealTurnAction.mockRejectedValueOnce(new Error("Waiting for voters."));

    render(
      <RoomClient
        initialRoom={createRoom({
          phase: "vote",
          currentPlayerId: "player-host",
          submissions: [
            {
              id: "submission-other",
              body: "another player's reply stays visible",
              authorPlayerId: null,
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /reveal winner/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Waiting for voters."));
    expect(actionMocks.revealTurnAction).toHaveBeenCalledWith(
      "ABCD",
      "room-1",
      "turn-1",
      "player-host",
    );
  });
});
