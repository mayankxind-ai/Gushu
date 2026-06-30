export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      conversation_status: {
        Row: {
          conversation_id: string;
          has_left: boolean;
          left_at: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          has_left?: boolean;
          left_at?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          has_left?: boolean;
          left_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_status_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string;
          user1_id: string;
          user2_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          user1_id: string;
          user2_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          user1_id?: string;
          user2_id?: string;
        };
        Relationships: [];
      };
      conversation_settings: {
        Row: {
          conversation_id: string;
          user_id: string;
          pin_hash: string | null;
          is_locked: boolean;
          is_hidden: boolean;
          expiry_seconds: number | null;
          theme: string;
          wallpaper_url: string | null;
          cleared_at: string | null;
          notification_enabled: boolean;
          secret_code_hash: string | null;
          disappear_after_view_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          pin_hash?: string | null;
          is_locked?: boolean;
          is_hidden?: boolean;
          expiry_seconds?: number | null;
          theme?: string;
          wallpaper_url?: string | null;
          cleared_at?: string | null;
          notification_enabled?: boolean;
          secret_code_hash?: string | null;
          disappear_after_view_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          conversation_id?: string;
          user_id?: string;
          pin_hash?: string | null;
          is_locked?: boolean;
          is_hidden?: boolean;
          expiry_seconds?: number | null;
          theme?: string;
          wallpaper_url?: string | null;
          cleared_at?: string | null;
          notification_enabled?: boolean;
          secret_code_hash?: string | null;
          disappear_after_view_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      message_deletions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          deleted_for_all: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          deleted_for_all?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          deleted_for_all?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      private_notes: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          content: string;
          pinned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          content: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          content?: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      screenshot_events: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string | null;
          conversation_id: string;
          created_at: string;
          edited: boolean;
          id: string;
          media_mime: string | null;
          media_name: string | null;
          media_path: string | null;
          media_size: number | null;
          message_type: Database["public"]["Enums"]["message_kind"];
          read_at: string | null;
          sender_id: string;
          updated_at: string;
          view_once: boolean;
          viewed_at: string | null;
          reply_to: string | null;
          deleted_for_all: boolean;
          view_limit: number | null;
          view_count: number;
          disappear_after_view: boolean;
          deleted_for_everyone_at: string | null;
          deleted_by_id: string | null;
          expires_at: string | null;
        };
        Insert: {
          content?: string | null;
          conversation_id: string;
          created_at?: string;
          edited?: boolean;
          id?: string;
          media_mime?: string | null;
          media_name?: string | null;
          media_path?: string | null;
          media_size?: number | null;
          message_type?: Database["public"]["Enums"]["message_kind"];
          read_at?: string | null;
          sender_id: string;
          updated_at?: string;
          view_once?: boolean;
          viewed_at?: string | null;
          reply_to?: string | null;
          deleted_for_all?: boolean;
          view_limit?: number | null;
          view_count?: number;
          disappear_after_view?: boolean;
          deleted_for_everyone_at?: string | null;
          deleted_by_id?: string | null;
          expires_at?: string | null;
        };
        Update: {
          content?: string | null;
          conversation_id?: string;
          created_at?: string;
          edited?: boolean;
          id?: string;
          media_mime?: string | null;
          media_name?: string | null;
          media_path?: string | null;
          media_size?: number | null;
          message_type?: Database["public"]["Enums"]["message_kind"];
          read_at?: string | null;
          sender_id?: string;
          updated_at?: string;
          view_once?: boolean;
          viewed_at?: string | null;
          reply_to?: string | null;
          deleted_for_all?: boolean;
          view_limit?: number | null;
          view_count?: number;
          disappear_after_view?: boolean;
          deleted_for_everyone_at?: string | null;
          deleted_by_id?: string | null;
          expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          last_seen_at: string;
          updated_at: string;
          username: string;
          verified: boolean;
          incognito_mode: boolean;
          app_pin_hash: string | null;
          panic_locked: boolean;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          last_seen_at?: string;
          updated_at?: string;
          username: string;
          verified?: boolean;
          incognito_mode?: boolean;
          app_pin_hash?: string | null;
          panic_locked?: boolean;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          last_seen_at?: string;
          updated_at?: string;
          username?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_or_create_conversation: {
        Args: { _other_user: string };
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_conversation_participant: {
        Args: { _conv: string; _user: string };
        Returns: boolean;
      };
      leave_conversation: { Args: { _conv: string }; Returns: boolean };
      purge_conversation: { Args: { _conv: string }; Returns: undefined };
    };
    Enums: {
      app_role: "admin" | "user";
      message_kind: "text" | "image" | "video" | "file" | "audio";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      message_kind: ["text", "image", "video", "file", "audio"],
    },
  },
} as const;
