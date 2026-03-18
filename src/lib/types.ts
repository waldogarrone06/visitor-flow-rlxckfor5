export type LeadStage = 'Prospect' | 'Lead' | 'Agendado' | 'Visitado' | 'Revisitar' | 'Cliente'
export type LeadType = 'B2C' | 'B2B'

export interface ConversionHistory {
  month: string
  year: number
  count: number
}

export interface LeadInteraction {
  id: string
  leadId: string
  type: 'Meeting' | 'Note' | 'Visit' | 'Call'
  date: string
  description: string
  status?: 'Presente' | 'Ausente' | 'Realizada' | 'Cancelada'
  link?: string
  durationMinutes?: number
}

export interface Lead {
  id: string
  name: string
  stage: LeadStage
  type: LeadType
  score: number
  document: string // CPF or CNPJ
  company?: string
  address: string
  neighborhood?: string
  state?: string // UF
  tags?: string[]
  lastInteraction: string
  assignedKitId?: string
  avatarSeed?: number
  profession?: string
  registrationNumber?: string
  phone?: string
  email?: string
  couponCode?: string
  couponUsage?: number
  conversionsHistory?: ConversionHistory[]
  targetConversionGoal?: number
}

export interface Appointment {
  id: string
  leadId: string
  date: string
  vendor: string
  status: 'Scheduled' | 'Visited' | 'Cancelled'
  isVirtual?: boolean
  meetLink?: string
}

export interface MeetingReport {
  id: string
  date: string
  meetLink: string
  invitedLeadIds: string[]
  attendedLeadIds: string[]
  durationMinutes: number
}

export interface Kit {
  id: string
  name: string
  stock: number
  threshold: number
  description: string
  cost: number
}

export type ShipmentStatus = 'Requested' | 'In Transit' | 'Delivered' | 'Delayed'

export interface Shipment {
  id: string
  contactId: string
  kitId: string
  status: ShipmentStatus
  date: string
  expectedDeliveryDate?: string
  trackingNumber: string
}

export interface Message {
  id: string
  leadId: string
  text: string
  sender: 'me' | 'them'
  timestamp: string
  status: 'sent' | 'delivered' | 'read'
  type?: 'text' | 'image' | 'pdf'
  mediaUrl?: string
  mediaName?: string
}

export interface AppSettings {
  whatsappConnected: boolean
  whatsappReminder1h?: boolean
  whatsappPhoneNumber?: string
  googleMeetConnected?: boolean
  googleAccountEmail?: string
  googleCalendarConnected?: boolean
  googleCalendarSync?: boolean
  autoGenerateParticipationReports?: boolean
  autoExportToCRM?: boolean
  secrets?: { id: string; key: string; value: string }[]
  supabaseStatus?: 'connected' | 'pending' | 'error'
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: 'Admin' | 'Agent' | 'Viewer'
  avatarUrl?: string
}

export interface AppState {
  leads: Lead[]
  appointments: Appointment[]
  kits: Kit[]
  shipments: Shipment[]
  messages: Message[]
  settings: AppSettings
  teamMembers: TeamMember[]
  meetingReports: MeetingReport[]
  interactions: LeadInteraction[]
}
