// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.4'
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string
          client_email: string
          client_name: string
          client_phone: string | null
          coupon_code: string | null
          coupon_usage_count: number
          coupon_verified: boolean | null
          created_at: string
          delivered_at: string | null
          end_time: string
          google_event_id: string | null
          google_meet_link: string | null
          id: string
          kit_status: string | null
          start_time: string
          status: string | null
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          appointment_date: string
          client_email: string
          client_name: string
          client_phone?: string | null
          coupon_code?: string | null
          coupon_usage_count?: number
          coupon_verified?: boolean | null
          created_at?: string
          delivered_at?: string | null
          end_time: string
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          kit_status?: string | null
          start_time: string
          status?: string | null
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          appointment_date?: string
          client_email?: string
          client_name?: string
          client_phone?: string | null
          coupon_code?: string | null
          coupon_usage_count?: number
          coupon_verified?: boolean | null
          created_at?: string
          delivered_at?: string | null
          end_time?: string
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          kit_status?: string | null
          start_time?: string
          status?: string | null
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      kit_items: {
        Row: {
          id: string
          kit_id: string
          product_name: string
          quantity: number
        }
        Insert: {
          id?: string
          kit_id: string
          product_name: string
          quantity?: number
        }
        Update: {
          id?: string
          kit_id?: string
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: 'kit_items_kit_id_fkey'
            columns: ['kit_id']
            isOneToOne: false
            referencedRelation: 'kits'
            referencedColumns: ['id']
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          id: string
          is_personalized: boolean | null
          name: string
          prescriber_email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_personalized?: boolean | null
          name: string
          prescriber_email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_personalized?: boolean | null
          name?: string
          prescriber_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      locked_slots: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          lock_date: string
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          lock_date: string
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          lock_date?: string
          start_time?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nps_responses: {
        Row: {
          appointment_id: string
          created_at: string
          feedback: string | null
          id: string
          score: number
        }
        Insert: {
          appointment_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          score: number
        }
        Update: {
          appointment_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: 'nps_responses_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_admin: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          is_admin?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_admin?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      schedule_settings: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          slot_type: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          slot_type: string
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          slot_type?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          created_at: string
          frenet_token: string | null
          google_access_token: string | null
          google_email: string | null
          google_invitation_body: string | null
          google_refresh_token: string | null
          id: string
          sync_enabled: boolean | null
          updated_at: string
          user_id: string
          whatsapp_api_token: string | null
          whatsapp_connected: boolean | null
          whatsapp_instance_id: string | null
          yampi_alias: string | null
          yampi_token: string | null
        }
        Insert: {
          created_at?: string
          frenet_token?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_invitation_body?: string | null
          google_refresh_token?: string | null
          id?: string
          sync_enabled?: boolean | null
          updated_at?: string
          user_id: string
          whatsapp_api_token?: string | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          yampi_alias?: string | null
          yampi_token?: string | null
        }
        Update: {
          created_at?: string
          frenet_token?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_invitation_body?: string | null
          google_refresh_token?: string | null
          id?: string
          sync_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          whatsapp_api_token?: string | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          yampi_alias?: string | null
          yampi_token?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ====== DATABASE EXTENDED CONTEXT (auto-generated) ======
// This section contains actual PostgreSQL column types, constraints, RLS policies,
// functions, triggers, indexes and materialized views not present in the type definitions above.
// IMPORTANT: The TypeScript types above map UUID, TEXT, VARCHAR all to "string".
// Use the COLUMN TYPES section below to know the real PostgreSQL type for each column.
// Always use the correct PostgreSQL type when writing SQL migrations.

// --- COLUMN TYPES (actual PostgreSQL types) ---
// Use this to know the real database type when writing migrations.
// "string" in TypeScript types above may be uuid, text, varchar, timestamptz, etc.
// Table: appointments
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   client_name: text (not null)
//   client_email: text (not null)
//   client_phone: text (nullable)
//   appointment_date: date (not null)
//   start_time: text (not null)
//   end_time: text (not null)
//   status: text (nullable, default: 'scheduled'::text)
//   created_at: timestamp with time zone (not null, default: now())
//   kit_status: text (nullable, default: 'Pending'::text)
//   coupon_code: text (nullable)
//   coupon_verified: boolean (nullable, default: false)
//   coupon_usage_count: integer (not null, default: 0)
//   tracking_number: text (nullable)
//   delivered_at: timestamp with time zone (nullable)
//   google_event_id: text (nullable)
//   google_meet_link: text (nullable)
// Table: kit_items
//   id: uuid (not null, default: gen_random_uuid())
//   kit_id: uuid (not null)
//   product_name: text (not null)
//   quantity: integer (not null, default: 1)
// Table: kits
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   name: text (not null)
//   is_personalized: boolean (nullable, default: false)
//   prescriber_email: text (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: locked_slots
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   lock_date: date (not null)
//   start_time: text (nullable)
//   end_time: text (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: nps_responses
//   id: uuid (not null, default: gen_random_uuid())
//   appointment_id: uuid (not null)
//   score: integer (not null)
//   feedback: text (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: profiles
//   id: uuid (not null)
//   email: text (not null)
//   name: text (nullable)
//   is_admin: boolean (nullable, default: false)
//   created_at: timestamp with time zone (nullable, default: now())
// Table: schedule_settings
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   day_of_week: integer (not null)
//   start_time: text (not null)
//   end_time: text (not null)
//   slot_type: text (not null)
//   created_at: timestamp with time zone (not null, default: now())
//   updated_at: timestamp with time zone (not null, default: now())
// Table: user_integrations
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   google_access_token: text (nullable)
//   google_refresh_token: text (nullable)
//   google_email: text (nullable)
//   whatsapp_instance_id: text (nullable)
//   whatsapp_api_token: text (nullable)
//   whatsapp_connected: boolean (nullable, default: false)
//   created_at: timestamp with time zone (not null, default: now())
//   updated_at: timestamp with time zone (not null, default: now())
//   yampi_token: text (nullable)
//   yampi_alias: text (nullable)
//   frenet_token: text (nullable)
//   google_invitation_body: text (nullable)
//   sync_enabled: boolean (nullable, default: false)

// --- CONSTRAINTS ---
// Table: appointments
//   PRIMARY KEY appointments_pkey: PRIMARY KEY (id)
//   FOREIGN KEY appointments_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: kit_items
//   FOREIGN KEY kit_items_kit_id_fkey: FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE CASCADE
//   PRIMARY KEY kit_items_pkey: PRIMARY KEY (id)
// Table: kits
//   PRIMARY KEY kits_pkey: PRIMARY KEY (id)
//   FOREIGN KEY kits_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: locked_slots
//   PRIMARY KEY locked_slots_pkey: PRIMARY KEY (id)
//   FOREIGN KEY locked_slots_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: nps_responses
//   FOREIGN KEY nps_responses_appointment_id_fkey: FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
//   PRIMARY KEY nps_responses_pkey: PRIMARY KEY (id)
//   CHECK nps_responses_score_check: CHECK (((score >= 1) AND (score <= 10)))
// Table: profiles
//   FOREIGN KEY profiles_id_fkey: FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
//   PRIMARY KEY profiles_pkey: PRIMARY KEY (id)
// Table: schedule_settings
//   CHECK schedule_settings_day_of_week_check: CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
//   PRIMARY KEY schedule_settings_pkey: PRIMARY KEY (id)
//   CHECK schedule_settings_slot_type_check: CHECK ((slot_type = ANY (ARRAY['Prescritor Exclusivo'::text, 'Grupo'::text])))
//   FOREIGN KEY schedule_settings_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: user_integrations
//   PRIMARY KEY user_integrations_pkey: PRIMARY KEY (id)
//   FOREIGN KEY user_integrations_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
//   UNIQUE user_integrations_user_id_key: UNIQUE (user_id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: appointments
//   Policy "Anon can insert appointments" (INSERT, PERMISSIVE) roles={anon}
//     WITH CHECK: true
//   Policy "Anon can view appointments for capacity" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users manage own appointments" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: kit_items
//   Policy "Users manage own kit items" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM kits   WHERE ((kits.id = kit_items.kit_id) AND (kits.user_id = auth.uid()))))
//     WITH CHECK: (EXISTS ( SELECT 1    FROM kits   WHERE ((kits.id = kit_items.kit_id) AND (kits.user_id = auth.uid()))))
// Table: kits
//   Policy "Users manage own kits" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: locked_slots
//   Policy "Anon can view locked slots" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users manage own locked slots" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
//   Policy "Users view locked slots" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
// Table: nps_responses
//   Policy "Anon can insert NPS" (INSERT, PERMISSIVE) roles={anon}
//     WITH CHECK: true
//   Policy "Auth can insert NPS" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: true
//   Policy "Users view own NPS" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM appointments   WHERE ((appointments.id = nps_responses.appointment_id) AND (appointments.user_id = auth.uid()))))
// Table: profiles
//   Policy "profiles_read_all" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "profiles_update_self" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
// Table: schedule_settings
//   Policy "Anon can view schedules" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users can manage their own schedule" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: user_integrations
//   Policy "Users can manage their own integrations" (ALL, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
//     WITH CHECK: ((auth.uid() = user_id) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))

// --- DATABASE FUNCTIONS ---
// FUNCTION handle_new_user()
//   CREATE OR REPLACE FUNCTION public.handle_new_user()
//    RETURNS trigger
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//   AS $function$
//     BEGIN
//       INSERT INTO public.profiles (id, email, name)
//       VALUES (NEW.id, NEW.email, coalesce(NEW.raw_user_meta_data->>'name', 'Usuário'))
//       ON CONFLICT (id) DO NOTHING;
//
//       INSERT INTO public.user_integrations (user_id)
//       VALUES (NEW.id)
//       ON CONFLICT (user_id) DO NOTHING;
//
//       RETURN NEW;
//     END;
//     $function$
//

// --- INDEXES ---
// Table: user_integrations
//   CREATE UNIQUE INDEX user_integrations_user_id_key ON public.user_integrations USING btree (user_id)
