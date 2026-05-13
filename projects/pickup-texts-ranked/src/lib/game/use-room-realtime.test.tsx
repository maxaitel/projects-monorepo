import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/browser";
import { useRoomRealtime } from "./use-room-realtime";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: vi.fn(),
}));

const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};

const client = {
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

describe("useRoomRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    client.channel.mockReturnValue(channel);
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
  });

  it("does not subscribe when room id is null", () => {
    renderHook(() => useRoomRealtime(null, vi.fn()));

    expect(createClient).not.toHaveBeenCalled();
    expect(client.channel).not.toHaveBeenCalled();
  });

  it("subscribes to room, player, and room event changes for the room id", () => {
    const onChange = vi.fn();

    const { unmount } = renderHook(() => useRoomRealtime("room-1", onChange));

    expect(client.channel).toHaveBeenCalledWith("room:room-1");
    expect(channel.on).toHaveBeenCalledTimes(3);
    expect(channel.on).toHaveBeenNthCalledWith(
      1,
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: "id=eq.room-1" },
      expect.any(Function),
    );
    expect(channel.on).toHaveBeenNthCalledWith(
      2,
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: "room_id=eq.room-1" },
      expect.any(Function),
    );
    expect(channel.on).toHaveBeenNthCalledWith(
      3,
      "postgres_changes",
      { event: "*", schema: "public", table: "room_events", filter: "room_id=eq.room-1" },
      expect.any(Function),
    );
    expect(channel.subscribe).toHaveBeenCalledOnce();

    const firstHandler = channel.on.mock.calls[0][2] as () => void;
    firstHandler();
    expect(onChange).toHaveBeenCalledOnce();

    unmount();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
