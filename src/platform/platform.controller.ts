import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard, PlatformUser } from './platform-auth.guard';

class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

const who = (req: Request) =>
  (req as Request & { platform: PlatformUser }).platform.email;

/**
 * Painel do operador da plataforma (quem vende o SaaS).
 * Rotas sob `/platform`, com identidade própria — ver `platform-auth.guard.ts`.
 */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  /** Login do operador. Limite rígido: é a porta do painel mais sensível. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platform.login(dto.email, dto.password);
  }

  @UseGuards(PlatformAuthGuard)
  @Get('stats')
  stats() {
    return this.platform.stats();
  }

  @UseGuards(PlatformAuthGuard)
  @Get('tenants')
  list(@Query('search') search?: string) {
    return this.platform.listTenants(search);
  }

  @UseGuards(PlatformAuthGuard)
  @Get('tenants/:id')
  get(@Param('id') id: string) {
    return this.platform.getTenant(id);
  }

  @UseGuards(PlatformAuthGuard)
  @Post('tenants/:id/suspend')
  suspend(@Param('id') id: string, @Req() req: Request) {
    return this.platform.suspend(id, who(req));
  }

  @UseGuards(PlatformAuthGuard)
  @Post('tenants/:id/reactivate')
  reactivate(@Param('id') id: string, @Req() req: Request) {
    return this.platform.reactivate(id, who(req));
  }
}
