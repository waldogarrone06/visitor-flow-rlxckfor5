import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { submitNps, getAppointmentDetails } from '@/services/nps'
import { FourLabLogo } from '@/components/FourLabLogo'
import { CheckCircle2, Star } from 'lucide-react'

export default function NpsPage() {
  const { appointmentId } = useParams()
  const [score, setScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    if (appointmentId) {
      getAppointmentDetails(appointmentId)
        .then((data) => setClientName(data.client_name))
        .catch(console.error)
    }
  }, [appointmentId])

  const handleSubmit = async () => {
    if (!appointmentId || score === null) return
    setSubmitting(true)
    try {
      await submitNps(appointmentId, score, feedback)
      setSubmitted(true)
    } catch (error) {
      console.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <FourLabLogo className="h-12 w-auto mb-8 text-foreground" />
        <Card className="max-w-md w-full text-center py-10 border-border/50 shadow-lg animate-scale-in">
          <CardHeader>
            <div className="mx-auto bg-green-100 rounded-full p-4 mb-4 text-green-600 shadow-sm w-fit">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold">Obrigado pelo Feedback!</CardTitle>
            <CardDescription className="text-base mt-2">
              Sua opinião é fundamental para continuarmos melhorando nossos serviços e materiais.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <FourLabLogo className="h-12 w-auto mb-8 text-foreground" />
      <Card className="max-w-xl w-full border-border/50 shadow-lg animate-fade-in-up">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto bg-primary/10 rounded-full p-4 mb-4 text-primary w-fit">
            <Star className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Olá{clientName ? `, ${clientName.split(' ')[0]}` : ''}!
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Como você avalia a sua experiência com o nosso kit recebido recentemente?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <div className="flex flex-wrap justify-center gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <Button
                  key={num}
                  variant={score === num ? 'default' : 'outline'}
                  className={`h-12 w-12 text-lg rounded-full transition-all ${
                    score === num ? 'scale-110 shadow-md' : 'hover:border-primary'
                  }`}
                  onClick={() => setScore(num)}
                >
                  {num}
                </Button>
              ))}
            </div>
            <div className="flex justify-between px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Muito Ruim</span>
              <span>Excelente</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">
              Conta pra gente o porquê da sua nota (opcional)
            </label>
            <Textarea
              placeholder="O que você mais gostou ou o que podemos melhorar?"
              className="resize-none h-28 bg-white"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>

          <Button
            className="w-full h-12 text-lg"
            onClick={handleSubmit}
            disabled={score === null || submitting}
          >
            {submitting ? 'Enviando...' : 'Enviar Avaliação'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
