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
      start_match: {
        Args: {
          p_room_id: string;
          p_prompt_id?: string | null;
          p_prompt_text?: string | null;
        };
        Returns: {
          room_id: string;
          match_id: string;
          turn_id: string;
          status: Database["public"]["Enums"]["room_status"];
          phase: Database["public"]["Enums"]["room_phase"];
        }[];
      };
      activate_match: {
        Args: {
          p_room_id: string;
          p_match_id: string;
        };
        Returns: {
          room_id: string;
          active_match_id: string;
          status: Database["public"]["Enums"]["room_status"];
          phase: Database["public"]["Enums"]["room_phase"];
        }[];
      };
      advance_room_phase: {
        Args: {
          p_room_id: string;
          p_next_phase: Database["public"]["Enums"]["room_phase"];
        };
        Returns: {
          room_id: string;
          phase: Database["public"]["Enums"]["room_phase"];
        }[];
      };
      create_next_turn: {
        Args: {
          p_room_id: string;
          p_prompt_id?: string | null;
          p_prompt_text?: string | null;
        };
        Returns: {
          room_id: string;
          match_id: string;
          turn_id: string;
          turn_index: number;
          phase: Database["public"]["Enums"]["room_phase"];
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
      cast_vote: {
        Args: {
          p_turn_id: string;
          p_voter_player_id: string;
          p_submission_id: string;
        };
        Returns: {
          vote_id: string;
          submission_id: string;
        }[];
      };
      resolve_turn: {
        Args: {
          p_turn_id: string;
        };
        Returns: {
          winning_submission_id: string;
          winner_player_id: string;
          score_deltas: Json;
        }[];
      };
      get_room_snapshot: {
        Args: {
          p_room_id: string;
        };
        Returns: {
          phase: Database["public"]["Enums"]["room_phase"];
          phase_started_at: string;
          host_player_id: string;
          connected_player_ids: string[];
          turn_index: number;
          max_turns: number;
          eligible_voter_ids: string[];
          submitted_player_ids: string[];
          voted_player_ids: string[];
        }[];
      };
      get_player_submission: {
        Args: {
          p_turn_id: string;
          p_player_id: string;
        };
        Returns: {
          submission_id: string;
          body: string;
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
