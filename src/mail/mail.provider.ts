/**
 * Contrato de envio de e-mail (mesmo padrão de WhatsApp/Pagamento/Storage:
 * interface + provider trocável por env, com `fake` como padrão seguro).
 */
export interface MailMessage {
  to: string;
  subject: string;
  /** Corpo em texto puro (sempre enviado — fallback de clientes sem HTML). */
  text: string;
  /** Corpo HTML (opcional). */
  html?: string;
}

export interface MailProvider {
  send(msg: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
