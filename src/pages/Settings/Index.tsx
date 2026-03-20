import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GoogleCalendarCard } from './GoogleCalendarCard'
import { GoogleMeetCard } from './GoogleMeetCard'
import { EmailSettingsCard } from './EmailSettingsCard'
import { WhatsAppCard } from './WhatsAppCard'
import { TeamRegistrationCard } from './TeamRegistrationCard'
import { ReportsSettingsCard } from './ReportsSettingsCard'
import { DatabaseStatusCard } from './DatabaseStatusCard'
import { SecretsVaultCard } from './SecretsVaultCard'
import { PersonalScheduleCard } from './PersonalScheduleCard'
import { FrenetCard } from './FrenetCard'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { LogOut } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { saveIntegrations } from '@/services/settings'

export default function SettingsPage() {
  const { signOut, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const error = searchParams.get('error')
    if (error) {
      toast({
        title: 'Autenticação Cancelada',
        description: 'O processo de conexão foi interrompido ou negado.',
        variant: 'destructive',
      })
      searchParams.delete('error')
      setSearchParams(searchParams, { replace: true })
      return
    }

    const code = searchParams.get('code')
    if (code) {
      const exchangeCode = async () => {
        try {
          // Mock token exchange - in a real app, this goes to the backend to securely exchange code for tokens
          await saveIntegrations({
            google_email: user?.email || 'usuario.google@empresa.com',
            google_access_token: `ya29.a0AfB_mock_access_token_${code.substring(0, 5)}`,
            google_refresh_token: `1//0eMock_refresh_token_${code.substring(0, 5)}`,
          })

          toast({
            title: 'Google Conectado',
            description: 'Sua conta foi integrada com sucesso via OAuth 2.0.',
          })

          window.dispatchEvent(new Event('integrations_updated'))
        } catch (err) {
          toast({
            title: 'Erro na Autenticação',
            description: 'Não foi possível salvar os dados da integração.',
            variant: 'destructive',
          })
        } finally {
          searchParams.delete('code')
          searchParams.delete('scope')
          searchParams.delete('prompt')
          searchParams.delete('authuser')
          searchParams.delete('hd')
          setSearchParams(searchParams, { replace: true })
        }
      }
      exchangeCode()
    }
  }, [searchParams, setSearchParams, user])

  return (
    <div className="space-y-8 animate-slide-up pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie suas conexões, agenda pessoal e integrações de serviço.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 border rounded-full shadow-sm">
          <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold">{user?.email}</span>
            <span className="text-[10px] text-muted-foreground">Logado com sucesso</span>
          </div>
          <div className="h-6 w-px bg-border mx-1"></div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={signOut}
            title="Sair da Conta"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Preferências Individuais</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <GoogleCalendarCard />
          <GoogleMeetCard />
          <WhatsAppCard />
          <FrenetCard />
        </div>
        <div className="grid gap-6">
          <PersonalScheduleCard />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Infraestrutura e Administração</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <DatabaseStatusCard />
          <SecretsVaultCard />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
          <ReportsSettingsCard />
          <EmailSettingsCard />
          <TeamRegistrationCard />
        </div>
      </div>
    </div>
  )
}
