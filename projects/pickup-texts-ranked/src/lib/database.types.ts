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
    Functions: {
      create_room: {
        Args: {
          p_room_code: string;
          p_host_name: string;
          p_host_avatar_color?: string;
        };
        Returns: {
          room_id: string;
          player_id: string;
          room_code: string;
        }[];
      };
      join_room: {
        Args: {
          p_room_code: string;
          p_player_name: string;
          p_player_avatar_color?: string;
        };
        Returns: {
          room_id: string;
          player_id: string;
          room_code: string;
        }[];
      };
      list_vote_options: {
        Args: {
          p_turn_id: string;
        };
        Returns: {
          submission_id: string;
          body: string;
          display_order: number;
        }[];
      };
      list_reveal_submissions: {
        Args: {
          p_turn_id: string;
        };
        Returns: {
          submission_id: string;
          player_id: string;
          body: string;
          display_order: number;
          selected: boolean;
          vote_count: number;
        }[];
      };
      list_vote_counts: {
        Args: {
          p_turn_id: string;
        };
        Returns: {
          submission_id: string;
          vote_count: number;
        }[];
      };
    };
    Enums: {
      room_phase: "lobby" | "prompt" | "submit" | "vote" | "reveal" | "recap";
      room_status: "open" | "playing" | "finished";
      badge_type: "brilliant" | "check" | "blunder" | "questionable" | "photo_finish";
    };
    CompositeTypes: Record<string, never>;
  };
}
