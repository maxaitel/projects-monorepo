"use client";

import { HomeScreen } from "@/components/game/home-screen";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6">
      <HomeScreen onCreateRoom={() => {}} onJoinRoom={() => {}} />
    </main>
  );
}
