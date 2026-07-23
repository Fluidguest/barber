/** Resultado de envio, comum aos providers. */
export interface SendResult {
  providerMessageId: string;
  status: 'SENT' | 'FAILED';
}

/** Config do provider oficial (Meta), resolvida por tenant. */
export interface MetaConfig {
  token?: string;
  phoneId?: string;
  apiVersion?: string;
}

/** Config do provider WAHA, resolvida por tenant. */
export interface WahaConfig {
  url?: string;
  session?: string;
  apiKey?: string;
}
