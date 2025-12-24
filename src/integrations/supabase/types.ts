export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      banners: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          id: string
          is_priority: boolean | null
          match_date: string
          match_duration_minutes: number | null
          match_label: string | null
          match_link: string | null
          match_minute: number | null
          match_number: number
          match_start_time: string | null
          match_time: string
          page_type: string | null
          score_a: string | null
          score_b: string | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          slug: string | null
          sport_id: string | null
          status: string
          team_a_id: string
          team_b_id: string
          tournament_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_priority?: boolean | null
          match_date: string
          match_duration_minutes?: number | null
          match_label?: string | null
          match_link?: string | null
          match_minute?: number | null
          match_number?: number
          match_start_time?: string | null
          match_time: string
          page_type?: string | null
          score_a?: string | null
          score_b?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug?: string | null
          sport_id?: string | null
          status?: string
          team_a_id: string
          team_b_id: string
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_priority?: boolean | null
          match_date?: string
          match_duration_minutes?: number | null
          match_label?: string | null
          match_link?: string | null
          match_minute?: number | null
          match_number?: number
          match_start_time?: string | null
          match_time?: string
          page_type?: string | null
          score_a?: string | null
          score_b?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          slug?: string | null
          sport_id?: string | null
          status?: string
          team_a_id?: string
          team_b_id?: string
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          ads_enabled: boolean | null
          canonical_url: string | null
          created_at: string
          facebook_app_id: string | null
          favicon_url: string | null
          footer_ad_code: string | null
          footer_text: string | null
          google_adsense_id: string | null
          google_analytics_id: string | null
          header_ad_code: string | null
          id: string
          in_article_ad_code: string | null
          logo_url: string | null
          og_image_url: string | null
          popup_ad_code: string | null
          robots_txt: string | null
          schema_org_enabled: boolean | null
          sidebar_ad_code: string | null
          site_description: string | null
          site_keywords: string | null
          site_name: string
          site_title: string
          social_links: Json | null
          telegram_link: string | null
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          ads_enabled?: boolean | null
          canonical_url?: string | null
          created_at?: string
          facebook_app_id?: string | null
          favicon_url?: string | null
          footer_ad_code?: string | null
          footer_text?: string | null
          google_adsense_id?: string | null
          google_analytics_id?: string | null
          header_ad_code?: string | null
          id?: string
          in_article_ad_code?: string | null
          logo_url?: string | null
          og_image_url?: string | null
          popup_ad_code?: string | null
          robots_txt?: string | null
          schema_org_enabled?: boolean | null
          sidebar_ad_code?: string | null
          site_description?: string | null
          site_keywords?: string | null
          site_name?: string
          site_title?: string
          social_links?: Json | null
          telegram_link?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          ads_enabled?: boolean | null
          canonical_url?: string | null
          created_at?: string
          facebook_app_id?: string | null
          favicon_url?: string | null
          footer_ad_code?: string | null
          footer_text?: string | null
          google_adsense_id?: string | null
          google_analytics_id?: string | null
          header_ad_code?: string | null
          id?: string
          in_article_ad_code?: string | null
          logo_url?: string | null
          og_image_url?: string | null
          popup_ad_code?: string | null
          robots_txt?: string | null
          schema_org_enabled?: boolean | null
          sidebar_ad_code?: string | null
          site_description?: string | null
          site_keywords?: string | null
          site_name?: string
          site_title?: string
          social_links?: Json | null
          telegram_link?: string | null
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      streaming_servers: {
        Row: {
          cookie_value: string | null
          created_at: string
          display_order: number | null
          drm_license_url: string | null
          drm_scheme: string | null
          id: string
          is_active: boolean | null
          match_id: string
          origin_value: string | null
          referer_value: string | null
          server_name: string
          server_type: string
          server_url: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          cookie_value?: string | null
          created_at?: string
          display_order?: number | null
          drm_license_url?: string | null
          drm_scheme?: string | null
          id?: string
          is_active?: boolean | null
          match_id: string
          origin_value?: string | null
          referer_value?: string | null
          server_name: string
          server_type?: string
          server_url: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          cookie_value?: string | null
          created_at?: string
          display_order?: number | null
          drm_license_url?: string | null
          drm_scheme?: string | null
          id?: string
          is_active?: boolean | null
          match_id?: string
          origin_value?: string | null
          referer_value?: string | null
          server_name?: string
          server_type?: string
          server_url?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "streaming_servers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          short_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          short_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          season: string
          sport: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          season: string
          sport?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          season?: string
          sport?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
