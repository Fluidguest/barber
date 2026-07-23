import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { NotificationsModule } from '../notifications/notifications.module';

/** Jobs automáticos da plataforma (lembretes, expiração de trial). */
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
