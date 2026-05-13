import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./home-screen";
import { LobbyScreen } from "./lobby-screen";
import { RecapScreen } from "./recap-screen";
import { RevealPhase } from "./reveal-phase";
import { SubmitPhase } from "./submit-phase";
import { ThreadView } from "./thread-view";
import { VotePhase } from "./vote-phase";

describe("game screens", () => {
  it("renders create room and join room controls on the home screen", async () => {
    const user = userEvent.setup();
    const onCreateRoom = vi.fn();
    const onJoinRoom = vi.fn();

    render(<HomeScreen onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} />);

    const displayNameInput = screen.getByLabelText(/display name/i);

    expect(displayNameInput).toHaveAttribute("maxlength", "24");

    await user.type(displayNameInput, "Mina");
    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(onCreateRoom).toHaveBeenCalledWith("Mina");

    await user.type(screen.getByLabelText(/room code/i), " abcd ");
    await user.click(screen.getByRole("button", { name: /join room/i }));

    expect(onJoinRoom).toHaveBeenCalledWith({ displayName: "Mina", code: "ABCD" });
  });

  it("shows placeholder callback errors without crashing the home screen", async () => {
    const user = userEvent.setup();

    render(
      <HomeScreen
        onCreateRoom={() => {
          throw new Error("Create room action wiring lands in the next step.");
        }}
        onJoinRoom={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/display name/i), "Mina");
    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(screen.getByRole("status")).toHaveTextContent("Create room action wiring lands in the next step.");
  });

  it("shows the room code and host start control in the lobby", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <LobbyScreen
        code="K9M2"
        isHost
        onStart={onStart}
        players={[
          { id: "p1", name: "Mina", isHost: true },
          { id: "p2", name: "Jules", isHost: false },
        ]}
      />,
    );

    expect(screen.getByText("K9M2")).toBeInTheDocument();
    expect(screen.getByText("Mina")).toBeInTheDocument();
    expect(screen.getByText("Jules")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start game/i }));

    expect(onStart).toHaveBeenCalledOnce();
  });

  it("marks the explicit host when the host is not first in the lobby", () => {
    render(
      <LobbyScreen
        code="K9M2"
        isHost
        onStart={vi.fn()}
        players={[
          { id: "p1", name: "Mina", isHost: false },
          { id: "p2", name: "Jules", isHost: true },
        ]}
      />,
    );

    expect(within(screen.getByText("Jules").closest("li")!).getByLabelText("Host")).toBeInTheDocument();
    expect(within(screen.getByText("Mina").closest("li")!).queryByLabelText("Host")).not.toBeInTheDocument();
  });

  it("renders a growing text thread message", () => {
    render(
      <ThreadView
        messages={[
          { id: "m1", side: "them", body: "wyd?" },
          { id: "m2", side: "you", body: "waiting for the room to judge this reply", badge: "New" },
        ]}
      />,
    );

    expect(screen.getByText("wyd?")).toBeInTheDocument();
    expect(screen.getByText("waiting for the room to judge this reply")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("submits a trimmed reply", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<SubmitPhase disabled={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/reply/i), "  meet me by the group chat  ");
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    expect(onSubmit).toHaveBeenCalledWith("meet me by the group chat");
  });

  it("preserves a rejected async reply and surfaces an accessible error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("network failed"));

    render(<SubmitPhase disabled={false} onSubmit={onSubmit} />);

    const replyInput = screen.getByLabelText(/reply/i);

    await user.type(replyInput, "  meet me by the group chat  ");
    await user.click(screen.getByRole("button", { name: /submit reply/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not submit/i));
    expect(replyInput).toHaveValue("  meet me by the group chat  ");
  });

  it("casts a vote for an anonymous reply", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(
      <VotePhase
        onVote={onVote}
        submissions={[
          { id: "s1", body: "your read receipts have great timing" },
          { id: "s2", body: "hey lol, formal edition" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /vote for reply 1/i }));

    expect(onVote).toHaveBeenCalledWith("s1");
  });

  it("prevents duplicate votes once a reply has been selected", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(
      <VotePhase
        onVote={onVote}
        submissions={[
          { id: "s1", body: "your read receipts have great timing" },
          { id: "s2", body: "hey lol, formal edition" },
        ]}
        votedSubmissionId="s1"
      />,
    );

    expect(screen.getAllByText(/selected/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /vote for reply 1/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /vote for reply 2/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /vote for reply 2/i }));

    expect(onVote).not.toHaveBeenCalled();
  });

  it("reveals the winning author and badges", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();

    render(
      <RevealPhase
        authorName="Jules"
        badges={["brilliant", "photo finish"]}
        isHost
        onContinue={onContinue}
        winningBody="your read receipts have great timing"
      />,
    );

    expect(screen.getByText("Jules")).toBeInTheDocument();
    expect(screen.getByText("your read receipts have great timing")).toBeInTheDocument();
    expect(screen.getByText("brilliant")).toBeInTheDocument();
    expect(screen.getByText("photo finish")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows score rows in the recap screen", () => {
    render(
      <RecapScreen
        scores={[
          { id: "p1", name: "Mina", score: 35 },
          { id: "p2", name: "Jules", score: 10 },
        ]}
      />,
    );

    expect(screen.getByText("Mina")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("Jules")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
