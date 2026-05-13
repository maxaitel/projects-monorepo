import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRoomAction,
  createRoomStateAction,
  joinRoomAction,
  joinRoomStateAction,
} from "./actions";
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
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
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

    await expect(createRoomAction(formData)).rejects.toThrow("NEXT_REDIRECT:/room/K9M2");

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

    await expect(joinRoomAction(formData)).rejects.toThrow("NEXT_REDIRECT:/room/ABCD");

    expect(joinGameRoomAction).toHaveBeenCalledWith(" abcd ", " Jules ");
    expect(redirect).toHaveBeenCalledWith("/room/ABCD");
  });

  it("returns a recoverable create error without redirecting", async () => {
    vi.mocked(createGameRoomAction).mockRejectedValue(new Error("Choose a display name."));
    const formData = new FormData();
    formData.set("displayName", " ");

    await expect(createRoomStateAction({}, formData)).resolves.toEqual({
      error: "Choose a display name.",
    });

    expect(createGameRoomAction).toHaveBeenCalledWith(" ");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns a recoverable join error without redirecting", async () => {
    vi.mocked(joinGameRoomAction).mockRejectedValue(new Error("Room not found."));
    const formData = new FormData();
    formData.set("displayName", "Mina");
    formData.set("code", "NOPE");

    await expect(joinRoomStateAction({}, formData)).resolves.toEqual({
      error: "Room not found.",
    });

    expect(joinGameRoomAction).toHaveBeenCalledWith("NOPE", "Mina");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects after successful state actions", async () => {
    vi.mocked(createGameRoomAction).mockResolvedValue({
      code: "K9M2",
      hostPlayerId: "player-host",
    });
    const formData = new FormData();
    formData.set("displayName", "Mina");

    await expect(createRoomStateAction({ error: "Old error" }, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/room/K9M2",
    );

    expect(redirect).toHaveBeenCalledWith("/room/K9M2");
  });
});
