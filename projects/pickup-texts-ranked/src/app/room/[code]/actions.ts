"use server";

import { revalidatePath } from "next/cache";

import * as actions from "@/lib/game/actions";

export async function startMatchAction(code: string, roomId: string, playerId: string) {
  const result = await actions.startMatchAction(roomId, playerId);
  revalidatePath(`/room/${code}`);
  return result;
}

export async function submitMessageAction(
  code: string,
  turnId: string,
  playerId: string,
  body: string,
) {
  const result = await actions.submitMessageAction(turnId, playerId, body);
  revalidatePath(`/room/${code}`);
  return result;
}

export async function castVoteAction(
  code: string,
  turnId: string,
  playerId: string,
  submissionId: string,
) {
  const result = await actions.castVoteAction(turnId, playerId, submissionId);
  revalidatePath(`/room/${code}`);
  return result;
}

export async function revealTurnAction(
  code: string,
  roomId: string,
  turnId: string,
  hostPlayerId: string,
) {
  const result = await actions.revealTurnAction(roomId, turnId, hostPlayerId);
  revalidatePath(`/room/${code}`);
  return result;
}

export async function advancePhaseAction(code: string, roomId: string, playerId: string) {
  const result = await actions.advancePhaseAction(roomId, playerId);
  revalidatePath(`/room/${code}`);
  return result;
}
