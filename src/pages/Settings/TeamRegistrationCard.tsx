import { useState, useRef, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Users, Plus, Upload, Check, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { supabase } from '@/lib/supabase/client'

const formSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  role: z.enum(['Admin', 'Agent', 'Viewer']),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export function TeamRegistrationCard() {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hasAvatar, setHasAvatar] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadMembers()
    const handleUpdate = () => loadMembers()
    window.addEventListener('profiles_updated', handleUpdate)
    return () => window.removeEventListener('profiles_updated', handleUpdate)
  }, [])

  const loadMembers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('name')
    if (data) {
      setMembers(data)
    }
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'Agent',
      password: '',
    },
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: values,
      })

      if (error) {
        let errorMessage = error.message || 'Erro de rede ou falha na chamada da função.'
        try {
          if ('context' in error && typeof (error as any).context?.json === 'function') {
            const errorBody = await (error as any).context.json()
            if (errorBody && errorBody.error) {
              errorMessage = errorBody.error
            }
          }
        } catch (_) {
          console.error('Failed to parse error context', _)
        }

        throw new Error(errorMessage)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast({
        title: 'Usuário cadastrado',
        description: `${values.name} foi adicionado à equipe com sucesso e já pode realizar login.`,
      })
      setOpen(false)
      form.reset()
      setHasAvatar(false)

      window.dispatchEvent(new CustomEvent('profiles_updated'))
    } catch (e: any) {
      let message = e.message || 'Houve um problema ao criar o usuário.'

      if (
        message.includes('already exists') ||
        message.includes('already registered') ||
        message.includes('User already registered')
      ) {
        message = 'Este e-mail já está cadastrado.'
      } else if (message.includes('Forbidden') || message.includes('Only admins')) {
        message = 'Acesso negado: Apenas administradores podem criar novos usuários.'
      } else if (message.includes('Password')) {
        message = 'A senha informada é muito fraca ou inválida.'
      }

      toast({
        title: 'Erro ao cadastrar',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setHasAvatar(true)
    }
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg mb-2">
            <Users className="h-6 w-6" />
          </div>
          <Badge variant="secondary">{members.length || 0} Membros</Badge>
        </div>
        <CardTitle>Equipe & Acessos</CardTitle>
        <CardDescription>Gerencie os membros da equipe e seus níveis de acesso.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-4">
          {members.slice(0, 3).map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs border border-background shadow-sm">
                  {(member.name || member.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{member.name || 'Sem Nome'}</span>
                  <span className="text-muted-foreground text-[11px]">{member.email}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] bg-background">
                {member.is_admin ? 'Admin' : 'Agente'}
              </Badge>
            </div>
          ))}
          {members.length > 3 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              +{members.length - 3} outros membros
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full gap-2 border-dashed bg-transparent hover:bg-muted/50"
            >
              <Plus className="h-4 w-4" /> Adicionar Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Novo Membro da Equipe</DialogTitle>
              <DialogDescription>
                Preencha os dados abaixo para cadastrar um novo usuário na plataforma.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                <div className="flex items-center gap-4 mb-2">
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    className="h-16 w-16 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-border/60 hover:bg-muted/80 transition-colors shrink-0 overflow-hidden relative group"
                  >
                    {hasAvatar ? (
                      <div className="flex flex-col items-center text-green-600">
                        <Check className="h-6 w-6" />
                      </div>
                    ) : (
                      <Upload className="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Foto de Perfil</p>
                    <p className="text-xs">Clique para fazer upload (JPG, PNG)</p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Ana Souza" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input placeholder="exemplo@empresa.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nível de Acesso</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um nível" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Admin">Administrador</SelectItem>
                            <SelectItem value="Agent">Vendedor / Agente</SelectItem>
                            <SelectItem value="Viewer">Visualizador</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha Temporária</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="******" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Usuário'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  )
}
