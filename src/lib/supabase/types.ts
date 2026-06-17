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
          client_document: string | null
          client_email: string
          client_name: string
          client_phone: string | null
          clinic_address: string | null
          clinic_cep: string | null
          coupon_code: string | null
          coupon_usage_count: number
          coupon_verified: boolean | null
          created_at: string
          delivered_at: string | null
          end_time: string
          google_event_id: string | null
          google_meet_link: string | null
          id: string
          instagram: string | null
          kit_name: string | null
          kit_status: string | null
          nutritionist_coupon: string | null
          patient_coupon: string | null
          patients_per_month: string | null
          professional_id: string | null
          reminder_sent: boolean | null
          specialty: string | null
          start_time: string
          status: string | null
          tracking_number: string | null
          user_id: string
        }
        Insert: {
          appointment_date: string
          client_document?: string | null
          client_email: string
          client_name: string
          client_phone?: string | null
          clinic_address?: string | null
          clinic_cep?: string | null
          coupon_code?: string | null
          coupon_usage_count?: number
          coupon_verified?: boolean | null
          created_at?: string
          delivered_at?: string | null
          end_time: string
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          instagram?: string | null
          kit_name?: string | null
          kit_status?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          professional_id?: string | null
          reminder_sent?: boolean | null
          specialty?: string | null
          start_time: string
          status?: string | null
          tracking_number?: string | null
          user_id: string
        }
        Update: {
          appointment_date?: string
          client_document?: string | null
          client_email?: string
          client_name?: string
          client_phone?: string | null
          clinic_address?: string | null
          clinic_cep?: string | null
          coupon_code?: string | null
          coupon_usage_count?: number
          coupon_verified?: boolean | null
          created_at?: string
          delivered_at?: string | null
          end_time?: string
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          instagram?: string | null
          kit_name?: string | null
          kit_status?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          professional_id?: string | null
          reminder_sent?: boolean | null
          specialty?: string | null
          start_time?: string
          status?: string | null
          tracking_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_tag_relations: {
        Row: {
          contact_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contact_tag_relations_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contact_tag_relations_tag_id_fkey'
            columns: ['tag_id']
            isOneToOne: false
            referencedRelation: 'contact_tags'
            referencedColumns: ['id']
          },
        ]
      }
      contact_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          cep: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          instagram: string | null
          name: string
          nutritionist_coupon: string | null
          patient_coupon: string | null
          patients_per_month: string | null
          phone: string
          profession: string | null
          registration_number: string | null
          specialty: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          cep?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name: string
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          phone: string
          profession?: string | null
          registration_number?: string | null
          specialty?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          cep?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          name?: string
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          phone?: string
          profession?: string | null
          registration_number?: string | null
          specialty?: string | null
          user_id?: string
        }
        Relationships: []
      }
      date_specific_schedules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          slot_type: string
          specific_date: string
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          slot_type?: string
          specific_date: string
          start_time: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          slot_type?: string
          specific_date?: string
          start_time?: string
          user_id?: string
        }
        Relationships: []
      }
      interaction_log: {
        Row: {
          contact_id: string | null
          created_at: string
          details: Json | null
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'interaction_log_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          min_threshold: number
          product_name: string
          stock_level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_threshold?: number
          product_name: string
          stock_level?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_threshold?: number
          product_name?: string
          stock_level?: number
          updated_at?: string
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
      messages: {
        Row: {
          client_id: string | null
          contact_id: string
          content: string
          created_at: string
          direction: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          contact_id: string
          content: string
          created_at?: string
          direction: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          contact_id?: string
          content?: string
          created_at?: string
          direction?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_contact_id_fkey'
            columns: ['contact_id']
            isOneToOne: false
            referencedRelation: 'contacts'
            referencedColumns: ['id']
          },
        ]
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
      session_state: {
        Row: {
          context: Json | null
          current_step: string | null
          last_interaction: string
          phone: string
        }
        Insert: {
          context?: Json | null
          current_step?: string | null
          last_interaction?: string
          phone: string
        }
        Update: {
          context?: Json | null
          current_step?: string | null
          last_interaction?: string
          phone?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          created_at: string
          google_access_token: string | null
          google_email: string | null
          google_invitation_body: string | null
          google_refresh_token: string | null
          id: string
          melhor_envio_token: string | null
          reminder_email_template: string | null
          reminder_enabled: boolean | null
          reminder_whatsapp_template: string | null
          sync_enabled: boolean | null
          updated_at: string
          user_id: string
          whatsapp_api_token: string | null
          whatsapp_api_url: string | null
          whatsapp_connected: boolean | null
          whatsapp_instance_id: string | null
          yampi_alias: string | null
          yampi_token: string | null
        }
        Insert: {
          created_at?: string
          google_access_token?: string | null
          google_email?: string | null
          google_invitation_body?: string | null
          google_refresh_token?: string | null
          id?: string
          melhor_envio_token?: string | null
          reminder_email_template?: string | null
          reminder_enabled?: boolean | null
          reminder_whatsapp_template?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id: string
          whatsapp_api_token?: string | null
          whatsapp_api_url?: string | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          yampi_alias?: string | null
          yampi_token?: string | null
        }
        Update: {
          created_at?: string
          google_access_token?: string | null
          google_email?: string | null
          google_invitation_body?: string | null
          google_refresh_token?: string | null
          id?: string
          melhor_envio_token?: string | null
          reminder_email_template?: string | null
          reminder_enabled?: boolean | null
          reminder_whatsapp_template?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          whatsapp_api_token?: string | null
          whatsapp_api_url?: string | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          yampi_alias?: string | null
          yampi_token?: string | null
        }
        Relationships: []
      }
      whatsapp_events: {
        Row: {
          created_at: string
          id: string
          instance: string
          message: Json
          message_type: string
          remote_jid: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance: string
          message: Json
          message_type: string
          remote_jid: string
        }
        Update: {
          created_at?: string
          id?: string
          instance?: string
          message?: Json
          message_type?: string
          remote_jid?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
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
//   reminder_sent: boolean (nullable, default: false)
//   specialty: text (nullable)
//   professional_id: text (nullable)
//   clinic_address: text (nullable)
//   instagram: text (nullable)
//   patients_per_month: text (nullable)
//   kit_name: text (nullable)
//   nutritionist_coupon: text (nullable)
//   patient_coupon: text (nullable)
//   clinic_cep: text (nullable)
//   client_document: text (nullable)
// Table: contact_tag_relations
//   contact_id: uuid (not null)
//   tag_id: uuid (not null)
//   created_at: timestamp with time zone (not null, default: now())
// Table: contact_tags
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   name: text (not null)
//   color: text (not null, default: '#64748b'::text)
//   created_at: timestamp with time zone (not null, default: now())
// Table: contacts
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   name: text (not null)
//   phone: text (not null)
//   created_at: timestamp with time zone (not null, default: now())
//   email: text (nullable)
//   document: text (nullable)
//   address: text (nullable)
//   profession: text (nullable)
//   specialty: text (nullable)
//   registration_number: text (nullable)
//   instagram: text (nullable)
//   patients_per_month: text (nullable)
//   nutritionist_coupon: text (nullable)
//   patient_coupon: text (nullable)
//   cep: text (nullable)
// Table: date_specific_schedules
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   specific_date: date (not null)
//   start_time: text (not null)
//   end_time: text (not null)
//   slot_type: text (not null, default: 'Prescritor Exclusivo'::text)
//   created_at: timestamp with time zone (not null, default: now())
// Table: interaction_log
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (nullable)
//   contact_id: uuid (nullable)
//   type: text (not null)
//   details: jsonb (nullable)
//   created_at: timestamp with time zone (not null, default: now())
// Table: inventory_items
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   product_name: text (not null)
//   stock_level: integer (not null, default: 0)
//   min_threshold: integer (not null, default: 10)
//   created_at: timestamp with time zone (not null, default: now())
//   updated_at: timestamp with time zone (not null, default: now())
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
// Table: messages
//   id: uuid (not null, default: gen_random_uuid())
//   user_id: uuid (not null)
//   contact_id: uuid (not null)
//   direction: text (not null)
//   content: text (not null)
//   created_at: timestamp with time zone (not null, default: now())
//   client_id: text (nullable)
//   status: text (nullable, default: 'sent'::text)
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
// Table: session_state
//   phone: text (not null)
//   current_step: text (nullable)
//   context: jsonb (nullable)
//   last_interaction: timestamp with time zone (not null, default: now())
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
//   google_invitation_body: text (nullable)
//   sync_enabled: boolean (nullable, default: false)
//   whatsapp_api_url: text (nullable)
//   reminder_email_template: text (nullable)
//   reminder_whatsapp_template: text (nullable)
//   reminder_enabled: boolean (nullable, default: false)
//   melhor_envio_token: text (nullable)
// Table: whatsapp_events
//   id: uuid (not null, default: gen_random_uuid())
//   instance: text (not null)
//   remote_jid: text (not null)
//   message_type: text (not null)
//   message: jsonb (not null)
//   created_at: timestamp with time zone (not null, default: now())

// --- CONSTRAINTS ---
// Table: appointments
//   PRIMARY KEY appointments_pkey: PRIMARY KEY (id)
//   FOREIGN KEY appointments_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: contact_tag_relations
//   FOREIGN KEY contact_tag_relations_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
//   PRIMARY KEY contact_tag_relations_pkey: PRIMARY KEY (contact_id, tag_id)
//   FOREIGN KEY contact_tag_relations_tag_id_fkey: FOREIGN KEY (tag_id) REFERENCES contact_tags(id) ON DELETE CASCADE
// Table: contact_tags
//   PRIMARY KEY contact_tags_pkey: PRIMARY KEY (id)
//   FOREIGN KEY contact_tags_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
//   UNIQUE contact_tags_user_id_name_key: UNIQUE (user_id, name)
// Table: contacts
//   PRIMARY KEY contacts_pkey: PRIMARY KEY (id)
//   FOREIGN KEY contacts_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: date_specific_schedules
//   PRIMARY KEY date_specific_schedules_pkey: PRIMARY KEY (id)
//   FOREIGN KEY date_specific_schedules_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: interaction_log
//   FOREIGN KEY interaction_log_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
//   PRIMARY KEY interaction_log_pkey: PRIMARY KEY (id)
//   FOREIGN KEY interaction_log_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: inventory_items
//   PRIMARY KEY inventory_items_pkey: PRIMARY KEY (id)
//   FOREIGN KEY inventory_items_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: kit_items
//   FOREIGN KEY kit_items_kit_id_fkey: FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE CASCADE
//   PRIMARY KEY kit_items_pkey: PRIMARY KEY (id)
// Table: kits
//   PRIMARY KEY kits_pkey: PRIMARY KEY (id)
//   FOREIGN KEY kits_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: locked_slots
//   PRIMARY KEY locked_slots_pkey: PRIMARY KEY (id)
//   FOREIGN KEY locked_slots_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
// Table: messages
//   FOREIGN KEY messages_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
//   CHECK messages_direction_check: CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
//   PRIMARY KEY messages_pkey: PRIMARY KEY (id)
//   FOREIGN KEY messages_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
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
// Table: session_state
//   PRIMARY KEY session_state_pkey: PRIMARY KEY (phone)
// Table: user_integrations
//   PRIMARY KEY user_integrations_pkey: PRIMARY KEY (id)
//   FOREIGN KEY user_integrations_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
//   UNIQUE user_integrations_user_id_key: UNIQUE (user_id)
// Table: whatsapp_events
//   PRIMARY KEY whatsapp_events_pkey: PRIMARY KEY (id)

// --- ROW LEVEL SECURITY POLICIES ---
// Table: appointments
//   Policy "Anon can insert appointments" (INSERT, PERMISSIVE) roles={anon}
//     WITH CHECK: true
//   Policy "Anon can view appointments for capacity" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users manage own appointments" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: contact_tag_relations
//   Policy "Users manage own tag relations" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM contacts   WHERE ((contacts.id = contact_tag_relations.contact_id) AND (contacts.user_id = auth.uid()))))
//     WITH CHECK: (EXISTS ( SELECT 1    FROM contacts   WHERE ((contacts.id = contact_tag_relations.contact_id) AND (contacts.user_id = auth.uid()))))
// Table: contact_tags
//   Policy "Users manage own tags" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: contacts
//   Policy "Users manage own contacts" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: date_specific_schedules
//   Policy "Anon can view date specific schedules" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users manage own date specific schedules" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: interaction_log
//   Policy "interaction_log_all" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: inventory_items
//   Policy "inventory_items_all" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: kit_items
//   Policy "Anyone can view kit items" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
//   Policy "Users manage own kit items" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM kits   WHERE ((kits.id = kit_items.kit_id) AND (kits.user_id = auth.uid()))))
//     WITH CHECK: (EXISTS ( SELECT 1    FROM kits   WHERE ((kits.id = kit_items.kit_id) AND (kits.user_id = auth.uid()))))
// Table: kits
//   Policy "Anyone can view kits" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: true
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
// Table: messages
//   Policy "Users manage own messages" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: nps_responses
//   Policy "Anon can insert NPS" (INSERT, PERMISSIVE) roles={anon}
//     WITH CHECK: true
//   Policy "Auth can insert NPS" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: true
//   Policy "Users view own NPS" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (EXISTS ( SELECT 1    FROM appointments   WHERE ((appointments.id = nps_responses.appointment_id) AND (appointments.user_id = auth.uid()))))
// Table: profiles
//   Policy "profiles_read_admin" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: is_admin()
//   Policy "profiles_read_own" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
//   Policy "profiles_update_admin_all" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: is_admin()
//   Policy "profiles_update_own" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = id)
// Table: schedule_settings
//   Policy "Anon can view schedules" (SELECT, PERMISSIVE) roles={anon}
//     USING: true
//   Policy "Users can manage their own schedule" (ALL, PERMISSIVE) roles={authenticated}
//     USING: (auth.uid() = user_id)
//     WITH CHECK: (auth.uid() = user_id)
// Table: session_state
//   Policy "session_state_all" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true
// Table: user_integrations
//   Policy "user_integrations_delete" (DELETE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "user_integrations_insert" (INSERT, PERMISSIVE) roles={authenticated}
//     WITH CHECK: ((auth.uid() = user_id) OR is_admin())
//   Policy "user_integrations_select" (SELECT, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
//   Policy "user_integrations_update" (UPDATE, PERMISSIVE) roles={authenticated}
//     USING: ((auth.uid() = user_id) OR is_admin())
// Table: whatsapp_events
//   Policy "whatsapp_events_all" (ALL, PERMISSIVE) roles={authenticated}
//     USING: true
//     WITH CHECK: true

// --- DATABASE FUNCTIONS ---
// FUNCTION handle_new_user()
//   CREATE OR REPLACE FUNCTION public.handle_new_user()
//    RETURNS trigger
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//   AS $function$
//   BEGIN
//     INSERT INTO public.profiles (id, email, name, is_admin)
//     VALUES (
//       NEW.id,
//       NEW.email,
//       coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
//       false
//     )
//     ON CONFLICT (id) DO NOTHING;
//
//     INSERT INTO public.user_integrations (user_id)
//     VALUES (NEW.id)
//     ON CONFLICT (user_id) DO NOTHING;
//
//     RETURN NEW;
//   END;
//   $function$
//
// FUNCTION is_admin()
//   CREATE OR REPLACE FUNCTION public.is_admin()
//    RETURNS boolean
//    LANGUAGE plpgsql
//    SECURITY DEFINER
//    SET search_path TO 'public'
//   AS $function$
//   DECLARE
//     _is_admin boolean;
//   BEGIN
//     SELECT is_admin INTO _is_admin FROM profiles WHERE id = auth.uid();
//     RETURN COALESCE(_is_admin, false);
//   END;
//   $function$
//
// FUNCTION update_kit_status_from_tracking()
//   CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
//    RETURNS trigger
//    LANGUAGE plpgsql
//   AS $function$
//   BEGIN
//     -- Permite reverter manualmente via UPDATE direto no banco
//     -- Só protege se o kit_status não está sendo explicitamente alterado para outro valor
//     IF TG_OP = 'UPDATE'
//        AND OLD.kit_status IN ('Entregue', 'Delivered')
//        AND NEW.kit_status IN ('Entregue', 'Delivered') THEN
//       NEW.kit_status := OLD.kit_status;
//       RETURN NEW;
//     END IF;
//
//     -- Se explicitamente setando Entregue/Delivered, permite
//     IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
//       RETURN NEW;
//     END IF;
//
//     -- Se não tem rastreio, reverte para Pending
//     IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
//       NEW.kit_status := 'Pending';
//     ELSE
//       -- Só muda para Enviado se o tracking foi recém-adicionado
//       IF TG_OP = 'INSERT' THEN
//         NEW.kit_status := 'Enviado';
//       ELSIF TG_OP = 'UPDATE' THEN
//         IF OLD.tracking_number IS NULL OR trim(OLD.tracking_number) = '' THEN
//           NEW.kit_status := 'Enviado';
//         END IF;
//       END IF;
//     END IF;
//
//     RETURN NEW;
//   END;
//   $function$
//

// --- TRIGGERS ---
// Table: appointments
//   trg_update_kit_status: CREATE TRIGGER trg_update_kit_status BEFORE INSERT OR UPDATE OF tracking_number, kit_status ON public.appointments FOR EACH ROW EXECUTE FUNCTION update_kit_status_from_tracking()

// --- INDEXES ---
// Table: appointments
//   CREATE INDEX idx_appointments_status ON public.appointments USING btree (status)
// Table: contact_tag_relations
//   CREATE INDEX idx_contact_tag_relations_contact_id ON public.contact_tag_relations USING btree (contact_id)
//   CREATE INDEX idx_contact_tag_relations_tag_id ON public.contact_tag_relations USING btree (tag_id)
// Table: contact_tags
//   CREATE UNIQUE INDEX contact_tags_user_id_name_key ON public.contact_tags USING btree (user_id, name)
// Table: contacts
//   CREATE INDEX idx_contacts_phone ON public.contacts USING btree (phone)
// Table: inventory_items
//   CREATE INDEX idx_inventory_items_user_id ON public.inventory_items USING btree (user_id)
// Table: messages
//   CREATE INDEX idx_messages_client_id ON public.messages USING btree (client_id)
//   CREATE INDEX messages_client_id_idx ON public.messages USING btree (client_id)
// Table: user_integrations
//   CREATE UNIQUE INDEX user_integrations_user_id_key ON public.user_integrations USING btree (user_id)
// Table: whatsapp_events
//   CREATE INDEX idx_whatsapp_events_instance ON public.whatsapp_events USING btree (instance)
//   CREATE INDEX idx_whatsapp_events_message_type ON public.whatsapp_events USING btree (message_type)
