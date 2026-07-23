import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleDto } from './dto/reschedule.dto';
import { ListAppointmentsDto } from './dto/list-appointments.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(u.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListAppointmentsDto) {
    return this.appointments.list(u.tenantId, q);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.appointments.get(u.tenantId, id);
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
  ) {
    return this.appointments.reschedule(u.tenantId, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.appointments.setStatus(u.tenantId, id, dto);
  }
}
