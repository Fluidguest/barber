import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  /** Envia para uma conversa existente... */
  @IsOptional()
  @IsString()
  conversationId?: string;

  /** ...ou para um número (cria/reusa a conversa). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  /** Texto (ou legenda da mídia). Opcional se houver mediaId. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body?: string;

  /** Id de um arquivo já enviado ao Storage (mídia). */
  @IsOptional()
  @IsString()
  mediaId?: string;
}

export class RegisterNumberDto {
  @IsString()
  @MaxLength(40)
  phoneNumberId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class SimulateInboundDto {
  @IsString()
  @MaxLength(20)
  from: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  body: string;
}
