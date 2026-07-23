import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUser, JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AllowSuspended } from '../common/allow-suspended.decorator';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

class RefreshDto {
  // O refresh token agora vem preferencialmente do cookie httpOnly.
  // Mantido opcional no body para clientes de API/testes.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}

class TotpCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter ao menos 8 caracteres' })
  password: string;
}

@AllowSuspended()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(dto);
    setRefreshCookie(res, session.refreshToken);
    return session;
  }

  // Limite rígido: no máx. 10 tentativas/min por IP (anti brute-force).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto);
    setRefreshCookie(res, session.refreshToken);
    return session;
  }

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prioriza o cookie httpOnly (browser); cai no body para clientes de API.
    const token = readRefreshCookie(req) ?? dto.refreshToken;
    if (!token) throw new UnauthorizedException('Refresh token ausente');
    const session = await this.auth.refresh(token);
    setRefreshCookie(res, session.refreshToken);
    return session;
  }

  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshCookie(req) ?? dto.refreshToken;
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res);
    return { ok: true };
  }

  /**
   * "Esqueci minha senha". Responde 204 SEMPRE (exista ou não a conta) para
   * não revelar quais e-mails estão cadastrados. Limite baixo: é alvo fácil
   * de abuso (spam de e-mail / enumeração).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.slug, dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  // ---- 2FA (TOTP) ----
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  setup2fa(@CurrentUser() user: AuthUser) {
    return this.auth.setup2fa(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.enable2fa(user, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disable2fa(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto) {
    return this.auth.disable2fa(user, dto.code);
  }
}
