import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PaymentsService } from './payments.service';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

class CreateChargeDto {
  /** Omitido = cobra o saldo restante da comanda. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}

/** Cobranças online de uma comanda (PIX). */
@UseGuards(JwtAuthGuard)
@Controller('sales/:saleId/charges')
export class SaleChargesController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  create(
    @CurrentUser() u: AuthUser,
    @Param('saleId') saleId: string,
    @Body() dto: CreateChargeDto,
  ) {
    return this.payments.createPixCharge(u.tenantId, saleId, dto.amountCents);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Param('saleId') saleId: string) {
    return this.payments.listCharges(u.tenantId, saleId);
  }

  /** Consulta (o PDV faz polling aqui enquanto o cliente paga). */
  @Get(':chargeId')
  get(@CurrentUser() u: AuthUser, @Param('chargeId') chargeId: string) {
    return this.payments.getCharge(u.tenantId, chargeId);
  }

  /** Demo/teste: só funciona com o provedor `fake`. */
  @Post(':chargeId/simulate-approval')
  simulate(@CurrentUser() u: AuthUser, @Param('chargeId') chargeId: string) {
    return this.payments.simulateApproval(u.tenantId, chargeId);
  }
}
