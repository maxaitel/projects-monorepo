import { loadRoomByCode } from "@/lib/game/load-room";

import { RoomJoinClient } from "./join-client";
import { RoomClient } from "./room-client";

type RoomPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();
  const room = await loadRoomByCode(normalizedCode);

  if (!room) {
    return <RoomJoinClient code={normalizedCode} />;
  }

  return <RoomClient initialRoom={room} key={`${room.roomId}:${room.phase}:${room.currentTurnId ?? ""}`} />;
}
