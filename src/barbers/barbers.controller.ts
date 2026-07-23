import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { BarbersService } from './barbers.service';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('barbers')
export class BarbersController {
  constructor(private readonly barbers: BarbersService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateBarberDto) {
    return this.barbers.create(u.tenantId, dto);
  }

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.barbers.list(u.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.barbers.get(u.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBarberDto,
  ) {
    return this.barbers.update(u.tenantId, id, dto);
  }

  @Put(':id/schedule')
  setSchedule(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetScheduleDto,
  ) {
    return this.barbers.setSchedule(u.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.barbers.remove(u.tenantId, id);
  }
}
