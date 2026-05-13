"use server";

import { redirect } from "next/navigation";

import {
  createRoomAction as createGameRoomAction,
  joinRoomAction as joinGameRoomAction,
} from "@/lib/game/actions";

export async function createRoomAction(formData: FormData) {
  const displayName = readFormString(formData, "displayName");
  const room = await createGameRoomAction(displayName);

  redirect(`/room/${room.code}`);
}

export async function joinRoomAction(formData: FormData) {
  const displayName = readFormString(formData, "displayName");
  const code = readFormString(formData, "code");
  const room = await joinGameRoomAction(code, displayName);

  redirect(`/room/${room.code}`);
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}
