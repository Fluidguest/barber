import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppThrottlerGuard } from './common/throttler.guard';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validateEnv } from './common/env.validation';
import { loggerParams } from './common/logger.config';
import { throttlerConfig } from './common/throttler.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ServicesModule } from './services/services.module';
import { BarbersModule } from './barbers/barbers.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CashModule } from './cash/cash.module';
import { SalesModule } from './sales/sales.module';
import { CommissionsModule } from './commissions/commissions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { BillingModule } from './billing/billing.module';
import { FinanceModule } from './finance/finance.module';
import { StockModule } from './stock/stock.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { PublicModule } from './public/public.module';
import { PaymentsModule } from './payments/payments.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { PlatformModule } from './platform/platform.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot(loggerParams),
    // forRootAsync: o factory lê o env na INICIALIZAÇÃO (não no import), o que
    // permite ajustar o limite por ambiente e escolher o storage (memória ou
    // Redis, para multi-instância). Ver common/throttler.config.ts.
    ThrottlerModule.forRootAsync({ useFactory: throttlerConfig }),
    PrismaModule,
    MailModule,
    RealtimeModule,
    AuthModule,
    ClientsModule,
    ServicesModule,
    BarbersModule,
    AppointmentsModule,
    CashModule,
    SalesModule,
    CommissionsModule,
    DashboardModule,
    NotificationsModule,
    WhatsAppModule,
    BillingModule,
    FinanceModule,
    StockModule,
    ReportsModule,
    AuditModule,
    UsersModule,
    SettingsModule,
    StorageModule,
    PublicModule,
    PaymentsModule,
    SchedulerModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
