import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, ThumbsUp, Video, Clock, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DayAppointmentsProps {
  date: Date | undefined
  onUpdate: () => void
}

export function DayAppointments({ date, onUpdate }: DayAppointmentsProps) {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [savingCouponsId, setSavingCouponsId] = useState<string | null>(null)

  const [nutriInputs, setNutriInputs] = useState<Record<string, string>>({})
  const [patientInputs, setPatientInputs] = useState<Record<string, string>>({})

  const fetchAppointments = async () => {
    if (!date || !user) return
    setLoading(true)
    const dateStr = format(date, 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', user.id)
      .eq('appointment_date', dateStr)
      .order('start_time', { ascending: true })

    if (error) {
      console.error(error)
    } else if (data) {
      setAppointments(data)
      const ni: Record<string, string> = {}
      const pi: Record<string, string> = {}
      data.forEach((a) => {
        ni[a.id] = a.nutritionist_coupon || ''
        pi[a.id] = a.patient_coupon || ''
      })
      setNutriInputs(ni)
      setPatientInputs(pi)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAppointments()
  }, [date, user])

  const handleSaveCouponsAndSendEmails = async (app: any) => {
    try {
      setSavingCouponsId(app.id)
      const nutriCoupon = nutriInputs[app.id]?.trim() || null
      const patCoupon = patientInputs[app.id]?.trim() || null

      const { error: dbErr } = await supabase
        .from('appointments')
        .update({
          nutritionist_coupon: nutriCoupon,
          patient_coupon: patCoupon,
        })
        .eq('id', app.id)

      if (dbErr) throw dbErr

      if (nutriCoupon || patCoupon) {
        const { error: mktErr } = await supabase.functions.invoke('send-email', {
          body: {
            to: 'marketing@fourlabnutri.com.br',
            subject: 'Solicitação de Cadastro de Cupom - Yampi',
            html: `
              <h2>Solicitação de Cadastro de Cupons</h2>
              <p><strong>Profissional:</strong> ${app.client_name}</p>
              <p><strong>Email:</strong> ${app.client_email}</p>
              <br/>
              <p>Favor cadastrar os seguintes cupons na plataforma Yampi:</p>
              <ul>
                <li><strong>Cupom Nutri (Uso pessoal):</strong> ${nutriCoupon || 'Não informado'}</li>
                <li><strong>Cupom Paciente (Distribuição):</strong> ${patCoupon || 'Não informado'}</li>
              </ul>
            `,
            senderName: 'Sistema Fourlab',
          },
        })
        if (mktErr) console.error('Erro ao enviar email MKT:', mktErr)
      }

      if (app.client_email) {
        const { error: presErr } = await supabase.functions.invoke('send-email', {
          body: {
            to: app.client_email,
            subject: 'Agradecimento pela visita e seus Cupons Fourlab',
            html: `
              <p>Prezado(a) ${app.client_name},</p>
              <p>Agradecemos a visita à Fourlab. Foi excelente discutir como nossa tecnologia de suplementação pode otimizar o suporte metabólico e a performance no endurance.</p>
              <p>Para uso pessoal e prescrição, seguem seus benefícios:<br/>
              Uso Pessoal: ${nutriCoupon || 'N/A'}<br/>
              Para Pacientes: ${patCoupon || 'N/A'}</p>
              <p>Estamos à disposição para suporte técnico.</p>
              <p>Atenciosamente, Juliana Maciel<br/>
              Fourlab<br/>
              Ciência e Performance</p>
            `,
            senderName: 'Fourlab Nutrition',
          },
        })

        if (presErr) console.error('Erro ao enviar email prescritor:', presErr)
      }

      toast.success('Cupons salvos e e-mails enviados com sucesso!')
      onUpdate()
      await fetchAppointments()
    } catch (err: any) {
      toast.error('Erro ao processar', { description: err.message })
    } finally {
      setSavingCouponsId(null)
    }
  }

  if (!date) return null

  return (
    <Card className="shadow-subtle border-border/50 h-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Agendamentos do Dia</span>
          <span className="text-sm font-normal text-muted-foreground">
            {format(date, 'dd/MM/yyyy')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            Nenhum agendamento para esta data.
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((app) => (
              <div
                key={app.id}
                className="p-4 border rounded-xl bg-card flex flex-col gap-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div className="space-y-1">
                    <div className="font-semibold text-base flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      {app.client_name}
                    </div>
                    {app.client_email && (
                      <div className="text-sm text-muted-foreground ml-6">{app.client_email}</div>
                    )}
                    <div className="text-sm font-medium flex items-center gap-2 mt-2 bg-primary/5 text-primary w-fit px-2 py-1 rounded-md">
                      <Clock className="h-4 w-4" />
                      {app.start_time} às {app.end_time}
                    </div>
                  </div>
                  <Badge
                    variant={
                      app.status === 'Cancelled'
                        ? 'destructive'
                        : app.status === 'Visited'
                          ? 'default'
                          : 'secondary'
                    }
                    className="capitalize shadow-none"
                  >
                    {app.status === 'Scheduled'
                      ? 'Agendado'
                      : app.status === 'Visited'
                        ? 'Visitado'
                        : app.status === 'Cancelled'
                          ? 'Cancelado'
                          : app.status}
                  </Badge>
                </div>

                <div className="pt-3 border-t flex flex-col sm:flex-row gap-3 items-center justify-between">
                  {app.google_meet_link ? (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="w-full sm:w-auto bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    >
                      <a href={app.google_meet_link} target="_blank" rel="noreferrer">
                        <Video className="h-4 w-4 mr-2" /> Acessar Reunião
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic w-full sm:w-auto">
                      Sem link de reunião
                    </span>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                    <Input
                      placeholder="Cupom Nutri"
                      value={nutriInputs[app.id] ?? ''}
                      onChange={(e) => setNutriInputs((p) => ({ ...p, [app.id]: e.target.value }))}
                      className="h-8 text-xs w-full sm:w-32"
                    />
                    <Input
                      placeholder="Cupom Paciente"
                      value={patientInputs[app.id] ?? ''}
                      onChange={(e) =>
                        setPatientInputs((p) => ({ ...p, [app.id]: e.target.value }))
                      }
                      className="h-8 text-xs w-full sm:w-32"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-full sm:w-8 text-primary hover:text-green-600 hover:bg-green-50 shrink-0"
                      onClick={() => handleSaveCouponsAndSendEmails(app)}
                      disabled={savingCouponsId === app.id}
                      title="Salvar Cupons e Enviar E-mail"
                    >
                      {savingCouponsId === app.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
