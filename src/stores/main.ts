import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import {
  AppState,
  Lead,
  Appointment,
  Shipment,
  LeadStage,
  Message,
  AppSettings,
  TeamMember,
} from '@/lib/types'
import { initialData } from '@/lib/mock-data'

type Action =
  | { type: 'ADD_LEAD'; payload: Lead }
  | { type: 'UPDATE_LEAD_STAGE'; payload: { id: string; stage: LeadStage } }
  | { type: 'SCHEDULE_APPOINTMENT'; payload: { lead: Lead; appointment: Appointment } }
  | { type: 'MARK_VISITED'; payload: { appointmentId: string } }
  | { type: 'RESCHEDULE_APPOINTMENT'; payload: { appointmentId: string; newDate: string } }
  | { type: 'UPDATE_KIT_STOCK'; payload: { kitId: string; amount: number } }
  | { type: 'ADD_TAG'; payload: { id: string; tag: string } }
  | { type: 'REMOVE_TAG'; payload: { id: string; tag: string } }
  | { type: 'IMPORT_COUPON_USAGE'; payload: { code: string; usage: number }[] }
  | { type: 'SEND_MESSAGE'; payload: Message }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'ADD_TEAM_MEMBER'; payload: TeamMember }

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | undefined>(
  undefined,
)

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_LEAD':
      return { ...state, leads: [...state.leads, action.payload] }

    case 'UPDATE_LEAD_STAGE': {
      let newShipments = [...state.shipments]
      const lead = state.leads.find((l) => l.id === action.payload.id)

      if (lead && action.payload.stage === 'Visitado' && lead.stage !== 'Visitado') {
        const kitId = lead.assignedKitId || state.kits[0].id
        const newShipment: Shipment = {
          id: `s-${Date.now()}`,
          contactId: lead.id,
          kitId,
          status: 'Requested',
          date: new Date().toISOString(),
          expectedDeliveryDate: new Date(Date.now() + 5 * 86400000).toISOString(),
          trackingNumber: `BR${Math.floor(Math.random() * 1000000)}XP`,
        }
        newShipments = [newShipment, ...newShipments]
      }

      return {
        ...state,
        leads: state.leads.map((l) =>
          l.id === action.payload.id ? { ...l, stage: action.payload.stage } : l,
        ),
        shipments: newShipments,
      }
    }

    case 'SCHEDULE_APPOINTMENT': {
      const { lead, appointment } = action.payload
      const existingLead = state.leads.find((l) => l.id === lead.id)
      const leads = existingLead
        ? state.leads.map((l) =>
            l.id === lead.id ? { ...l, ...lead, stage: 'Agendado' as LeadStage } : l,
          )
        : [...state.leads, { ...lead, stage: 'Agendado' as LeadStage }]

      return {
        ...state,
        leads,
        appointments: [...state.appointments, appointment],
      }
    }

    case 'MARK_VISITED': {
      const appointment = state.appointments.find((a) => a.id === action.payload.appointmentId)
      if (!appointment) return state

      const nextState = appReducer(state, {
        type: 'UPDATE_LEAD_STAGE',
        payload: { id: appointment.leadId, stage: 'Visitado' },
      })

      return {
        ...nextState,
        appointments: nextState.appointments.map((a) =>
          a.id === action.payload.appointmentId ? { ...a, status: 'Visited' } : a,
        ),
      }
    }

    case 'RESCHEDULE_APPOINTMENT': {
      return {
        ...state,
        appointments: state.appointments.map((a) =>
          a.id === action.payload.appointmentId ? { ...a, date: action.payload.newDate } : a,
        ),
      }
    }

    case 'UPDATE_KIT_STOCK':
      return {
        ...state,
        kits: state.kits.map((k) =>
          k.id === action.payload.kitId ? { ...k, stock: k.stock + action.payload.amount } : k,
        ),
      }

    case 'ADD_TAG': {
      const { id, tag } = action.payload
      return {
        ...state,
        leads: state.leads.map((l) => {
          if (l.id === id) {
            const currentTags = l.tags || []
            if (currentTags.includes(tag)) return l
            const newTags = currentTags.filter((t) => !t.startsWith('Revisitar')).concat(tag)
            return {
              ...l,
              tags: newTags,
              stage: tag.startsWith('Revisitar') ? 'Revisitar' : l.stage,
            }
          }
          return l
        }),
      }
    }

    case 'REMOVE_TAG': {
      const { id, tag } = action.payload
      return {
        ...state,
        leads: state.leads.map((l) => {
          if (l.id === id) {
            return {
              ...l,
              tags: (l.tags || []).filter((t) => t !== tag),
            }
          }
          return l
        }),
      }
    }

    case 'IMPORT_COUPON_USAGE': {
      const updates = action.payload
      return {
        ...state,
        leads: state.leads.map((l) => {
          if (!l.couponCode) return l
          const update = updates.find((u) => u.code.toLowerCase() === l.couponCode?.toLowerCase())
          if (update) {
            return { ...l, couponUsage: update.usage }
          }
          return l
        }),
      }
    }

    case 'SEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] }

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } }

    case 'ADD_TEAM_MEMBER':
      return { ...state, teamMembers: [...(state.teamMembers || []), action.payload] }

    default:
      return state
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialData)
  return React.createElement(AppContext.Provider, { value: { state, dispatch } }, children)
}

export function useMainStore() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useMainStore must be used within AppProvider')
  return context
}
