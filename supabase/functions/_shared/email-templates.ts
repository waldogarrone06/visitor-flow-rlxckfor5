// Templates FIXOS de e-mail para envios do FRONT autenticado (sem
// appointmentId). Auditoria: usuário logado não pode mandar subject/corpo
// 100% arbitrário com o remetente do domínio — escolhe um PROPÓSITO e só
// preenche variáveis controladas, sempre escapadas (escapeHtml).
//
// O caminho INTERNO (service role, ex.: create-booking com appointmentId)
// continua livre para compor o HTML próprio — confiança dele já é da camada
// de dentro.
import { escapeHtml } from './internal-auth.ts'

export type EmailTemplatePurpose =
  | 'coupons' // cupons Nutri/Paciente ao prescritor
  | 'kit_shipped' // kit enviado com rastreio
  | 'marketing_coupon_request' // pedido interno de cadastro de cupom
  | 'appointment_confirmation' // confirmação de visita/agendamento
  | 'meet_link' // (re)envio do link da reunião
  | 'test' // teste de configuração do Resend

export interface EmailTemplateVars {
  name?: string
  date?: string
  time?: string
  meetLink?: string
  trackingNumber?: string
  nutritionistCoupon?: string
  patientCoupon?: string
  senderName?: string
}

function escapeUrl(value: string): string {
  return escapeHtml(value)
    .replace(/ /g, '%20')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

const section = (bg: string, border: string, title: string, body: string) =>
  `<div style="background-color: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${title}</p>
    <p style="margin: 0; font-size: 22px; font-weight: bold;">${body}</p>
  </div>`

const footer = (signature: string) =>
  `<p style="font-size: 14px; color: #666;">Atenciosamente,<br/><strong>${signature}</strong></p>`

export function renderTemplate(purpose: EmailTemplatePurpose, vars: EmailTemplateVars) {
  const name = escapeHtml(vars.name || 'Cliente')
  const signature = escapeHtml(vars.senderName || 'FourLab Nutrition')
  const meetLink = vars.meetLink ? escapeUrl(vars.meetLink) : ''

  switch (purpose) {
    case 'coupons': {
      const nutri = escapeHtml(vars.nutritionistCoupon || 'Não informado')
      const patient = escapeHtml(vars.patientCoupon || 'Não informado')
      return {
        subject: 'Seus cupons exclusivos da Fourlab Nutri estão ativos!',
        html: `<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #0d9488;">Olá! Seus cupons Fourlab estão prontos! 🎉</h2>
  <p>Que bom ter você com a gente! Seus cupons já estão ativos e prontos para uso.</p>
  ${section('#f0fdfa', '#14b8a6', '🧑‍⚕️ Cupom do Nutricionista (uso pessoal)', nutri)}
  ${section('#fef3c7', '#f59e0b', '👥 Cupom do Paciente (para seus pacientes)', patient)}
  <p>Qualquer dúvida, estamos à disposição!</p>
  ${footer(signature)}
</div>`,
        text: `Olá ${name}! Seus cupons Fourlab estão ativos.\nCupom Nutricionista: ${nutri}\nCupom Paciente: ${patient}\n\n${signature}`,
      }
    }
    case 'kit_shipped': {
      const tracking = escapeHtml(vars.trackingNumber || '—')
      const nutri = escapeHtml(vars.nutritionistCoupon || '—')
      const patient = escapeHtml(vars.patientCoupon || '—')
      return {
        subject: 'Seu Kit Fourlab foi enviado!',
        html: `<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <p>Olá, <strong>${name}</strong>!</p>
  <p>Seu kit da Fourlab Nutrition foi enviado com sucesso.</p>
  <p><strong>Código de Rastreio:</strong> ${tracking}</p>
  <p><strong>Cupom Prescritor:</strong> ${nutri}</p>
  <p><strong>Cupom Paciente:</strong> ${patient}</p>
  <p>Obrigado por confiar em nosso trabalho!</p>
  ${footer(signature)}
</div>`,
        text: `Olá, ${vars.name || 'Cliente'}! Seu kit da Fourlab Nutrition foi enviado.\nRastreio: ${vars.trackingNumber || '—'}\nCupom Prescritor: ${vars.nutritionistCoupon || '—'}\nCupom Paciente: ${vars.patientCoupon || '—'}\n\n${signature}`,
      }
    }
    case 'marketing_coupon_request': {
      const nutri = escapeHtml(vars.nutritionistCoupon || '')
      const patient = escapeHtml(vars.patientCoupon || '')
      return {
        subject: `Solicitação de Cadastro de Cupom - Yampi - ${name}`,
        html: `<div style="font-family: sans-serif; color: #333;">
  <p>Olá equipe de Marketing,</p>
  <p>Uma nova visita foi realizada. Solicitamos o cadastro dos seguintes cupons no Yampi para o profissional <strong>${name}</strong>:</p>
  <ul>
    <li><strong>Cupom Nutri:</strong> ${nutri}</li>
    <li><strong>Cupom Paciente:</strong> ${patient}</li>
  </ul>
  <p>Obrigado!</p>
</div>`,
        text: `Solicitação de cadastro de cupons Yampi para ${name}\nCupom Nutri: ${nutri}\nCupom Paciente: ${patient}`,
      }
    }
    case 'appointment_confirmation': {
      const date = escapeHtml(vars.date || '')
      const time = escapeHtml(vars.time || '')
      const meetBlock = meetLink
        ? `<p style="font-size: 16px; line-height: 1.5; background-color: #f0fdfa; padding: 12px; border-radius: 6px; border: 1px solid #ccfbf1;"><strong>🔗 Link da Reunião Online:</strong> <br/><a href="${meetLink}" style="color: #0f766e; text-decoration: none;">${meetLink}</a></p>`
        : ''
      const meetText = meetLink ? `\n🔗 Link da Reunião: ${vars.meetLink}\n` : ''
      return {
        subject: 'Confirmação de Agendamento - FourLab Nutrition',
        html: `<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #ffb800; padding: 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Visita Confirmada! 🎉</h1>
  </div>
  <div style="padding: 32px; background-color: #ffffff;">
    <p style="font-size: 16px; line-height: 1.5;">Olá <strong>${name}</strong>,</p>
    <p style="font-size: 16px; line-height: 1.5;">Seu agendamento foi registrado com sucesso para o dia <strong>${date}</strong> às <strong>${time}</strong>.</p>
    ${meetBlock}
    <p style="font-size: 16px; line-height: 1.5;">Um de nossos representantes entrará em contato em breve para confirmar os últimos detalhes.</p>
    <br/>
    ${footer(signature)}
  </div>
</div>`,
        text: `Olá ${vars.name || 'Cliente'}! Seu agendamento foi registrado para ${vars.date || ''} às ${vars.time || ''}.${meetText}\n\n${signature}`,
      }
    }
    case 'meet_link': {
      const date = escapeHtml(vars.date || '')
      const time = escapeHtml(vars.time || '')
      return {
        subject: 'Sua visita online está pronta - Fourlab',
        html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
  <p>Olá, ${name}! 👋</p>
  <p>Sua visita online com a equipe Fourlab está confirmada e o link da reunião já está pronto.</p>
  <p>📅 Data: ${date}<br/>🕐 Horário: ${time}</p>
  <p>🔗 Acesse pelo link abaixo:<br/><a href="${meetLink}" style="color: #0d9488; font-weight: bold; word-break: break-all;">${meetLink}</a></p>
  <p>Nossa visitadora já estará na sala aguardando você no horário marcado.</p>
  <p>Até logo! 😊<br/><strong>Equipe Fourlab</strong></p>
</div>`,
        text: `Olá, ${vars.name || 'Cliente'}! Sua visita online está confirmada.\n📅 Data: ${vars.date || ''}\n🕐 Horário: ${vars.time || ''}\n🔗 Link: ${vars.meetLink || ''}\n\nEquipe Fourlab`,
      }
    }
    case 'test': {
      return {
        subject: 'Teste de Automação de E-mail - FourLab Nutrition',
        html: `<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #e10050; padding: 24px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Automação Ativa! 🎉</h1>
  </div>
  <div style="padding: 32px; background-color: #ffffff;">
    <p style="font-size: 16px; line-height: 1.5;">Olá,</p>
    <p style="font-size: 16px; line-height: 1.5;">Este é um e-mail de teste disparado pelo sistema utilizando a infraestrutura do <strong>Resend</strong>.</p>
    <p style="font-size: 16px; line-height: 1.5;">Se você está lendo esta mensagem, significa que o domínio <strong>fourlabnutrition.com.br</strong> está corretamente verificado e sua automação de agendamentos está operante.</p>
    <br/>
    ${footer(signature)}
  </div>
</div>`,
        text: `Este é um e-mail de teste do sistema FourLab Nutrition via Resend.\n\n${signature}`,
      }
    }
    default:
      throw new Error(`Template desconhecido: ${purpose as string}`)
  }
}
