import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Atualização de configurações. Secrets (tokens) só são gravados quando vierem
 * preenchidos — enviar vazio/omisso mantém o valor atual (write-only).
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['fake', 'meta', 'waha'])
  whatsappProvider?: string;

  @IsOptional() @IsString() @MaxLength(400) metaToken?: string;
  @IsOptional() @IsString() @MaxLength(40) metaPhoneId?: string;
  @IsOptional() @IsString() @MaxLength(10) metaApiVersion?: string;

  @IsOptional() @IsString() @MaxLength(200) wahaUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) wahaSession?: string;
  @IsOptional() @IsString() @MaxLength(200) wahaApiKey?: string;

  @IsOptional() @IsString() @MaxLength(120) whatsappVerifyToken?: string;

  @IsOptional() @IsInt() @Min(1) @Max(168) reminderLeadHours?: number;

  // --- Pagamento no PDV (cobrança do cliente final) ---
  @IsOptional()
  @IsIn(['fake', 'mercadopago'])
  paymentProvider?: string;

  @IsOptional() @IsString() @MaxLength(400) mpAccessToken?: string;
  @IsOptional() @IsString() @MaxLength(200) mpWebhookSecret?: string;
}
