import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, Clock, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DayAppointmentsProps {
  date: Date | undefined
  onUpdate: () => void
}

export function DayAppointments({ date, onUpdate }: DayAppointmentsProps) {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

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
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAppointments()
  }, [date, user])

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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
