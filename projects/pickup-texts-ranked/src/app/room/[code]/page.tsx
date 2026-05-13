import { loadRoomByCode } from "@/lib/game/load-room";
import { notFound } from "next/navigation";

import { RoomClient } from "./room-client";

type RoomPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  const room = await loadRoomByCode(code.toUpperCase());

  if (!room) {
    notFound();
  }

  return <RoomClient initialRoom={room} key={`${room.roomId}:${room.phase}:${room.currentTurnId ?? ""}`} />;
}
