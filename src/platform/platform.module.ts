import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformAuthGuard } from './platform-auth.guard';

/** Painel do operador da plataforma (multi-tenant, identidade separada). */
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAuthGuard],
})
export class PlatformModule {}
