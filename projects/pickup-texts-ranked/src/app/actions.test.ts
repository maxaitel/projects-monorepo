import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRoomAction, joinRoomAction } from "./actions";
import {
  createRoomAction as createGameRoomAction,
  joinRoomAction as joinGameRoomAction,
} from "@/lib/game/actions";
import { redirect } from "next/navigation";

vi.mock("@/lib/game/actions", () => ({
  createRoomAction: vi.fn(),
  joinRoomAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("route server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a room from FormData and redirects to the room code", async () => {
    vi.mocked(createGameRoomAction).mockResolvedValue({
      code: "K9M2",
      hostPlayerId: "player-host",
    });
    const formData = new FormData();
    formData.set("displayName", " Mina ");

    await createRoomAction(formData);

    expect(createGameRoomAction).toHaveBeenCalledWith(" Mina ");
    expect(redirect).toHaveBeenCalledWith("/room/K9M2");
  });

  it("joins a room from FormData and redirects to the normalized room code", async () => {
    vi.mocked(joinGameRoomAction).mockResolvedValue({
      roomId: "room-1",
      code: "ABCD",
      playerId: "player-2",
    });
    const formData = new FormData();
    formData.set("displayName", " Jules ");
    formData.set("code", " abcd ");

    await joinRoomAction(formData);

    expect(joinGameRoomAction).toHaveBeenCalledWith(" abcd ", " Jules ");
    expect(redirect).toHaveBeenCalledWith("/room/ABCD");
  });
});
