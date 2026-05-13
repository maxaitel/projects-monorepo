"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/browser";

export function useRoomRealtime(roomId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const handleChange = () => {
      onChangeRef.current();
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        handleChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        handleChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_events", filter: `room_id=eq.${roomId}` },
        handleChange,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);
}
