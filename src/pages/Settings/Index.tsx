import { GoogleCalendarCard } from './GoogleCalendarCard'
import { EmailSettingsCard } from './EmailSettingsCard'
import { WhatsAppCard } from './WhatsAppCard'
import { TeamRegistrationCard } from './TeamRegistrationCard'
import { GoogleMeetCard } from './GoogleMeetCard'
import { ReportsSettingsCard } from './ReportsSettingsCard'
import { DatabaseStatusCard } from './DatabaseStatusCard'
import { SecretsVaultCard } from './SecretsVaultCard'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="space-y-8 animate-slide-up pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie conexões com o banco de dados oficial, credenciais e integrações externas.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Infraestrutura e Segurança</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <DatabaseStatusCard />
          <SecretsVaultCard />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Integrações de Serviço</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <GoogleCalendarCard />
          <GoogleMeetCard />
          <WhatsAppCard />
          <ReportsSettingsCard />
          <EmailSettingsCard />
          <TeamRegistrationCard />
        </div>
      </div>
    </div>
  )
}
