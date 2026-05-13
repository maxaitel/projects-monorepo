"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/browser";

export function useRoomRealtime(roomId: string | null, onChange: () => void) {
  useEffect(() => {
    if (!roomId) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` },
        onChange,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onChange, roomId]);
}
