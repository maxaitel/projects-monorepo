"use server";

import { redirect } from "next/navigation";

import {
  createRoomAction as createGameRoomAction,
  joinRoomAction as joinGameRoomAction,
} from "@/lib/game/actions";

export type HomeActionState = {
  error?: string;
};

export async function createRoomAction(formData: FormData) {
  const room = await createRoomFromForm(formData);

  redirect(`/room/${room.code}`);
}

export async function joinRoomAction(formData: FormData) {
  const room = await joinRoomFromForm(formData);

  redirect(`/room/${room.code}`);
}

export async function createRoomStateAction(
  _prevState: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  let room: Awaited<ReturnType<typeof createGameRoomAction>>;

  try {
    room = await createRoomFromForm(formData);
  } catch (error) {
    return { error: getRecoverableErrorMessage(error, "Could not create the room.") };
  }

  redirect(`/room/${room.code}`);
}

export async function joinRoomStateAction(
  _prevState: HomeActionState,
  formData: FormData,
): Promise<HomeActionState> {
  let room: Awaited<ReturnType<typeof joinGameRoomAction>>;

  try {
    room = await joinRoomFromForm(formData);
  } catch (error) {
    return { error: getRecoverableErrorMessage(error, "Could not join the room.") };
  }

  redirect(`/room/${room.code}`);
}

async function createRoomFromForm(formData: FormData) {
  const displayName = readFormString(formData, "displayName");

  return createGameRoomAction(displayName);
}

async function joinRoomFromForm(formData: FormData) {
  const displayName = readFormString(formData, "displayName");
  const code = readFormString(formData, "code");

  return joinGameRoomAction(code, displayName);
}

function readFormString(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function getRecoverableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
