export type LeadStage = 'Prospect' | 'Lead' | 'Agendado' | 'Visitado' | 'Revisitar' | 'Cliente'
export type LeadType = 'B2C' | 'B2B'

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
}

export interface Appointment {
  id: string
  leadId: string
  date: string
  vendor: string
  status: 'Scheduled' | 'Visited' | 'Cancelled'
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

export interface AppState {
  leads: Lead[]
  appointments: Appointment[]
  kits: Kit[]
  shipments: Shipment[]
}
