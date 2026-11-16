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
          client_document: string
          client_email: string
          client_name: string
          client_phone: string | null
          clinic_address: string | null
          clinic_cep: string | null
          clinic_city: string | null
          clinic_complement: string | null
          clinic_neighborhood: string | null
          clinic_number: string | null
          clinic_state: string | null
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
          is_address_edited: boolean | null
          kit_name: string | null
          kit_requested_at: string | null
          kit_status: string | null
          lgpd_consent_at: string | null
          nutritionist_coupon: string | null
          patient_coupon: string | null
          patients_per_month: string | null
          prescriber_notified: boolean | null
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
          client_document: string
          client_email: string
          client_name: string
          client_phone?: string | null
          clinic_address?: string | null
          clinic_cep?: string | null
          clinic_city?: string | null
          clinic_complement?: string | null
          clinic_neighborhood?: string | null
          clinic_number?: string | null
          clinic_state?: string | null
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
          is_address_edited?: boolean | null
          kit_name?: string | null
          kit_requested_at?: string | null
          kit_status?: string | null
          lgpd_consent_at?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          prescriber_notified?: boolean | null
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
          client_document?: string
          client_email?: string
          client_name?: string
          client_phone?: string | null
          clinic_address?: string | null
          clinic_cep?: string | null
          clinic_city?: string | null
          clinic_complement?: string | null
          clinic_neighborhood?: string | null
          clinic_number?: string | null
          clinic_state?: string | null
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
          is_address_edited?: boolean | null
          kit_name?: string | null
          kit_requested_at?: string | null
          kit_status?: string | null
          lgpd_consent_at?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          prescriber_notified?: boolean | null
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
          city: string | null
          complement: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          instagram: string | null
          last_inbound_at: string | null
          lgpd_consent_at: string | null
          name: string
          neighborhood: string | null
          number: string | null
          nutritionist_coupon: string | null
          patient_coupon: string | null
          patients_per_month: string | null
          phone: string
          profession: string | null
          registration_number: string | null
          specialty: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          last_inbound_at?: string | null
          lgpd_consent_at?: string | null
          name: string
          neighborhood?: string | null
          number?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          phone: string
          profession?: string | null
          registration_number?: string | null
          specialty?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          instagram?: string | null
          last_inbound_at?: string | null
          lgpd_consent_at?: string | null
          name?: string
          neighborhood?: string | null
          number?: string | null
          nutritionist_coupon?: string | null
          patient_coupon?: string | null
          patients_per_month?: string | null
          phone?: string
          profession?: string | null
          registration_number?: string | null
          specialty?: string | null
          state?: string | null
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
      integration_secrets: {
        Row: {
          created_at: string
          google_access_token: string | null
          google_refresh_token: string | null
          id: string
          melhor_envio_token: string | null
          updated_at: string
          user_id: string
          whatsapp_api_token: string | null
          whatsapp_app_secret: string | null
          whatsapp_official_access_token: string | null
          yampi_secret: string | null
          yampi_token: string | null
        }
        Insert: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          id?: string
          melhor_envio_token?: string | null
          updated_at?: string
          user_id: string
          whatsapp_api_token?: string | null
          whatsapp_app_secret?: string | null
          whatsapp_official_access_token?: string | null
          yampi_secret?: string | null
          yampi_token?: string | null
        }
        Update: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          id?: string
          melhor_envio_token?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_api_token?: string | null
          whatsapp_app_secret?: string | null
          whatsapp_official_access_token?: string | null
          yampi_secret?: string | null
          yampi_token?: string | null
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
          error_details: Json | null
          id: string
          is_edited: boolean | null
          status: string | null
          user_id: string
          whatsapp_key: Json | null
        }
        Insert: {
          client_id?: string | null
          contact_id: string
          content: string
          created_at?: string
          direction: string
          error_details?: Json | null
          id?: string
          is_edited?: boolean | null
          status?: string | null
          user_id: string
          whatsapp_key?: Json | null
        }
        Update: {
          client_id?: string | null
          contact_id?: string
          content?: string
          created_at?: string
          direction?: string
          error_details?: Json | null
          id?: string
          is_edited?: boolean | null
          status?: string | null
          user_id?: string
          whatsapp_key?: Json | null
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
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          is_admin?: boolean | null
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_admin?: boolean | null
          name?: string | null
          role?: string | null
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
          catalog_link: string | null
          created_at: string
          fixed_meet_link: string | null
          frenet_token: string | null
          google_configured: boolean | null
          google_email: string | null
          google_invitation_body: string | null
          id: string
          melhor_envio_configured: boolean | null
          primary_provider: string | null
          reminder_email_template: string | null
          reminder_enabled: boolean | null
          reminder_whatsapp_template: string | null
          sync_enabled: boolean | null
          updated_at: string
          user_id: string
          whatsapp_api_configured: boolean | null
          whatsapp_api_url: string | null
          whatsapp_app_secret_configured: boolean | null
          whatsapp_connected: boolean | null
          whatsapp_instance_id: string | null
          whatsapp_official_configured: boolean | null
          whatsapp_official_phone_number_id: string | null
          whatsapp_official_verify_token: string | null
          whatsapp_official_waba_id: string | null
          whatsapp_provider_type: string | null
          yampi_alias: string | null
          yampi_configured: boolean | null
          yampi_token: string | null
        }
        Insert: {
          catalog_link?: string | null
          created_at?: string
          fixed_meet_link?: string | null
          frenet_token?: string | null
          google_configured?: boolean | null
          google_email?: string | null
          google_invitation_body?: string | null
          id?: string
          melhor_envio_configured?: boolean | null
          primary_provider?: string | null
          reminder_email_template?: string | null
          reminder_enabled?: boolean | null
          reminder_whatsapp_template?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id: string
          whatsapp_api_configured?: boolean | null
          whatsapp_api_url?: string | null
          whatsapp_app_secret_configured?: boolean | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          whatsapp_official_configured?: boolean | null
          whatsapp_official_phone_number_id?: string | null
          whatsapp_official_verify_token?: string | null
          whatsapp_official_waba_id?: string | null
          whatsapp_provider_type?: string | null
          yampi_alias?: string | null
          yampi_configured?: boolean | null
          yampi_token?: string | null
        }
        Update: {
          catalog_link?: string | null
          created_at?: string
          fixed_meet_link?: string | null
          frenet_token?: string | null
          google_configured?: boolean | null
          google_email?: string | null
          google_invitation_body?: string | null
          id?: string
          melhor_envio_configured?: boolean | null
          primary_provider?: string | null
          reminder_email_template?: string | null
          reminder_enabled?: boolean | null
          reminder_whatsapp_template?: string | null
          sync_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          whatsapp_api_configured?: boolean | null
          whatsapp_api_url?: string | null
          whatsapp_app_secret_configured?: boolean | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          whatsapp_official_configured?: boolean | null
          whatsapp_official_phone_number_id?: string | null
          whatsapp_official_verify_token?: string | null
          whatsapp_official_waba_id?: string | null
          whatsapp_provider_type?: string | null
          yampi_alias?: string | null
          yampi_configured?: boolean | null
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
      book_appointment: {
        Args: {
          p_appointment_date: string
          p_appointment_type?: string
          p_client_document?: string
          p_client_email?: string
          p_client_name?: string
          p_client_phone?: string
          p_clinic_address?: string
          p_clinic_cep?: string
          p_clinic_city?: string
          p_clinic_complement?: string
          p_clinic_neighborhood?: string
          p_clinic_number?: string
          p_clinic_state?: string
          p_end_time: string
          p_instagram?: string
          p_lgpd_consent_at?: string
          p_max_capacity?: number
          p_patients_per_month?: string
          p_professional_id?: string
          p_specialty?: string
          p_start_time: string
          p_status: string
          p_user_id: string
        }
        Returns: {
          appointment_date: string
          client_document: string
          client_email: string
          client_name: string
          client_phone: string | null
          clinic_address: string | null
          clinic_cep: string | null
          clinic_city: string | null
          clinic_complement: string | null
          clinic_neighborhood: string | null
          clinic_number: string | null
          clinic_state: string | null
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
          is_address_edited: boolean | null
          kit_name: string | null
          kit_requested_at: string | null
          kit_status: string | null
          lgpd_consent_at: string | null
          nutritionist_coupon: string | null
          patient_coupon: string | null
          patients_per_month: string | null
          prescriber_notified: boolean | null
          professional_id: string | null
          reminder_sent: boolean | null
          specialty: string | null
          start_time: string
          status: string | null
          tracking_number: string | null
          user_id: string
        }
        SetofOptions: {
          from: '*'
          to: 'appointments'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_appointment_meet_link: {
        Args: { p_appointment_id: string }
        Returns: string
      }
      get_fixed_meet_link: { Args: { p_user_id: string }; Returns: string }
      get_prescriber_email: { Args: { p_user_id: string }; Returns: string }
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
