import { describe, expect, it } from "vitest";

import { mapRoomView } from "./load-room";

describe("mapRoomView", () => {
  it("maps joined room rows into UI state", () => {
    const room = mapRoomView({
      currentUserId: "user-2",
      room: {
        id: "room-1",
        code: "ABCD",
        phase: "submit",
        host_player_id: "player-host",
        active_match_id: "match-1",
      },
      players: [
        {
          id: "player-host",
          user_id: "user-1",
          display_name: "Mina",
          score: 35,
          kicked_at: null,
          created_at: "2026-05-14T00:00:00.000Z",
        },
        {
          id: "player-two",
          user_id: "user-2",
          display_name: "Jules",
          score: 22,
          kicked_at: null,
          created_at: "2026-05-14T00:01:00.000Z",
        },
      ],
      turns: [
        {
          id: "turn-1",
          turn_index: 0,
          prompt_text: "wyd tonight?",
          winning_submission_id: null,
        },
      ],
      submissions: [],
    });

    expect(room).toEqual({
      roomId: "room-1",
      code: "ABCD",
      phase: "submit",
      hostPlayerId: "player-host",
      currentPlayerId: "player-two",
      currentTurnId: "turn-1",
      players: [
        { id: "player-host", name: "Mina", score: 35, isHost: true },
        { id: "player-two", name: "Jules", score: 22, isHost: false },
      ],
      messages: [
        { id: "turn-1:prompt", side: "them", body: "wyd tonight?", badge: "Prompt" },
      ],
      submissions: [],
      selectedSubmission: null,
    });
  });

  it("filters kicked players", () => {
    const room = mapRoomView({
      currentUserId: "user-2",
      room: {
        id: "room-1",
        code: "ABCD",
        phase: "lobby",
        host_player_id: "player-host",
        active_match_id: null,
      },
      players: [
        {
          id: "player-host",
          user_id: "user-1",
          display_name: "Mina",
          score: 35,
          kicked_at: null,
          created_at: "2026-05-14T00:00:00.000Z",
        },
        {
          id: "player-kicked",
          user_id: "user-2",
          display_name: "Tavi",
          score: 18,
          kicked_at: "2026-05-14T00:02:00.000Z",
          created_at: "2026-05-14T00:01:00.000Z",
        },
      ],
      turns: [],
      submissions: [],
    });

    expect(room.players).toEqual([
      { id: "player-host", name: "Mina", score: 35, isHost: true },
    ]);
    expect(room.currentPlayerId).toBeNull();
  });

  it("maps selected winning submission into messages", () => {
    const room = mapRoomView({
      currentUserId: "user-2",
      room: {
        id: "room-1",
        code: "ABCD",
        phase: "reveal",
        host_player_id: "player-host",
        active_match_id: "match-1",
      },
      players: [
        {
          id: "player-host",
          user_id: "user-1",
          display_name: "Mina",
          score: 35,
          kicked_at: null,
          created_at: "2026-05-14T00:00:00.000Z",
        },
        {
          id: "player-two",
          user_id: "user-2",
          display_name: "Jules",
          score: 22,
          kicked_at: null,
          created_at: "2026-05-14T00:01:00.000Z",
        },
      ],
      turns: [
        {
          id: "turn-1",
          turn_index: 0,
          prompt_text: "wyd tonight?",
          winning_submission_id: "submission-win",
        },
      ],
      submissions: [
        {
          id: "submission-win",
          body: "free after 8, emotionally available after snacks",
          authorPlayerId: "player-two",
          selected: true,
        },
      ],
    });

    expect(room.messages).toEqual([
      { id: "turn-1:prompt", side: "them", body: "wyd tonight?", badge: "Prompt" },
      {
        id: "submission-win",
        side: "you",
        body: "free after 8, emotionally available after snacks",
        badge: "Winner",
      },
    ]);
    expect(room.selectedSubmission).toEqual({
      id: "submission-win",
      body: "free after 8, emotionally available after snacks",
      authorName: "Jules",
    });
  });
});
