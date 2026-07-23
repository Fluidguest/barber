import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { BillingWebhookDto } from './dto/webhook.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AllowSuspended } from '../common/allow-suspended.decorator';

/** Rotas do tenant (autenticadas). @AllowSuspended: pagar mesmo suspenso. */
@AllowSuspended()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  subscription(@CurrentUser() u: AuthUser) {
    return this.billing.getSubscription(u.tenantId);
  }

  @Post('subscribe')
  subscribe(@CurrentUser() u: AuthUser, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(u.tenantId, dto.planId);
  }

  @Post('cancel')
  cancel(@CurrentUser() u: AuthUser) {
    return this.billing.cancel(u.tenantId);
  }
}

/** Webhook do provider — PÚBLICO (sem JWT). Resolve o tenant pelo externalId. */
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  webhook(@Body() dto: BillingWebhookDto) {
    return this.billing.handleWebhook(dto);
  }
}
