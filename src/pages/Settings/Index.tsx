import { useEffect, useState, useCallback } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { LogOut, ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { saveIntegrations, getProfiles, getCurrentProfile } from '@/services/settings'

export default function SettingsPage() {
  const { signOut, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [profiles, setProfiles] = useState<any[]>([])
  const [currentProfile, setCurrentProfile] = useState<any>(null)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [loadingProfiles, setLoadingProfiles] = useState(true)

  const loadAccess = useCallback(async () => {
    if (!user) return
    setLoadingProfiles(true)
    try {
      const profile = await getCurrentProfile()
      setCurrentProfile(profile)
      if (profile?.is_admin) {
        const allProfiles = await getProfiles()
        setProfiles(allProfiles)
        setSelectedUserId((prev) => {
          if (prev && allProfiles.find((p) => p.id === prev)) return prev
          return user.id
        })
      } else {
        setSelectedUserId(user.id)
      }
    } finally {
      setLoadingProfiles(false)
    }
  }, [user])

  useEffect(() => {
    loadAccess()
    window.addEventListener('profiles_updated', loadAccess)
    return () => window.removeEventListener('profiles_updated', loadAccess)
  }, [loadAccess])

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
    const stateId = searchParams.get('state')

    if (code && stateId) {
      const exchangeCode = async () => {
        try {
          await saveIntegrations(
            {
              google_email: 'integrado.oauth@empresa.com',
              google_access_token: `ya29.mock_access_token_${code.substring(0, 5)}`,
              google_refresh_token: `1//mock_refresh_token_${code.substring(0, 5)}`,
            },
            stateId,
          )

          toast({
            title: 'Google Conectado',
            description: 'A conta foi integrada com sucesso via OAuth 2.0.',
          })

          setSelectedUserId(stateId)
          window.dispatchEvent(
            new CustomEvent('integrations_updated', { detail: { userId: stateId } }),
          )
        } catch (err) {
          toast({
            title: 'Erro na Autenticação',
            description: 'Não foi possível salvar os dados da integração.',
            variant: 'destructive',
          })
        } finally {
          searchParams.delete('code')
          searchParams.delete('state')
          searchParams.delete('scope')
          setSearchParams(searchParams, { replace: true })
        }
      }
      exchangeCode()
    }
  }, [searchParams, setSearchParams])

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
            {currentProfile?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold">{currentProfile?.name || user?.email}</span>
            <span className="text-[10px] text-muted-foreground">
              {currentProfile?.is_admin ? 'Administrador' : 'Usuário Padrão'}
            </span>
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

      {currentProfile?.is_admin && (
        <div className="bg-amber-50/50 border border-amber-200/60 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
            <span className="font-semibold text-sm">Administração de Integrações:</span>
          </div>
          <div className="flex-1 flex items-center gap-3 w-full sm:w-auto">
            <Label className="text-muted-foreground whitespace-nowrap">Gerenciar usuário:</Label>
            <div className="relative w-full max-w-xs">
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                disabled={loadingProfiles}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingProfiles && (
                <div className="absolute right-8 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Preferências e Integrações</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <GoogleCalendarCard targetUserId={selectedUserId} />
          <GoogleMeetCard targetUserId={selectedUserId} />
          <WhatsAppCard targetUserId={selectedUserId} />
          <FrenetCard targetUserId={selectedUserId} />
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
