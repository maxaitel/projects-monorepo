/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      rooms: Table;
      players: Table;
      matches: Table;
      turns: Table;
      submissions: Table;
      votes: Table;
      badges: Table;
      room_events: Table;
      prompt_pack: Table;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      room_phase: "lobby" | "prompt" | "submit" | "vote" | "reveal" | "recap";
      room_status: "open" | "playing" | "finished";
      badge_type: "brilliant" | "check" | "blunder" | "questionable" | "photo_finish";
    };
    CompositeTypes: Record<string, never>;
  };
}
