import { GoogleCalendarCard } from './GoogleCalendarCard'
import { EmailSettingsCard } from './EmailSettingsCard'
import { WhatsAppCard } from './WhatsAppCard'
import { TeamRegistrationCard } from './TeamRegistrationCard'
import { GoogleMeetCard } from './GoogleMeetCard'
import { ReportsSettingsCard } from './ReportsSettingsCard'

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações & Integrações</h1>
        <p className="text-muted-foreground">
          Gerencie conexões com serviços externos, automatize fluxos e controle acessos.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <GoogleCalendarCard />
        <GoogleMeetCard />
        <ReportsSettingsCard />
        <EmailSettingsCard />
        <WhatsAppCard />
        <TeamRegistrationCard />
      </div>
    </div>
  )
}
